"""Turn uploaded files into a decision-ready package for a bank credit analyst.

Qawafel prepares and verifies; it does not make or recommend the credit decision.
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from statistics import mean, pstdev

from .extract import parse_statement
from .loader import load_customers, load_invoices, load_org
from .matching import CustomerResolver, compact_en, reconcile

DATA = Path(__file__).resolve().parent.parent / "data"
DISCLAIMER = "Prepared by Qawafel from documents supplied by the applicant. Not a credit recommendation."
SEVERITY_ORDER = {"critical": 0, "warning": 1, "info": 2}
LARGE_UNMATCHED_SAR = 10_000
DEBT_RE = re.compile(r"FINANCE|INSTALLMENT|INSTALMENT|LOAN|MURABAHA", re.I)


def _month_list(end: date, n: int = 12) -> list[str]:
    out, y, m = [], end.year, end.month
    for _ in range(n):
        out.append(f"{y}-{m:02d}")
        y, m = (y - 1, 12) if m == 1 else (y, m - 1)
    return out[::-1]


def _flag(ftype, severity, title, detail, evidence=None):
    return {"type": ftype, "severity": severity, "title": title, "detail": detail, "evidence": evidence or []}


def _sar(x: float) -> str:
    return f"SAR {x:,.0f}"


def build_report(invoice_file, statement_files=(), customers_file=None, org_file=None,
                 parsed_statements: list[dict] | None = None) -> dict:
    """invoice_file: path or bytes. statement_files: list of (path-or-bytes, filename).
    parsed_statements: output of parse_statement() for files already extracted (skips PDF parsing)."""
    org = load_org(org_file)
    customers = load_customers(customers_file)
    loaded = load_invoices(invoice_file, org.get("vat_number"))
    invoices, issues, inv_stats = loaded["invoices"], loaded["issues"], loaded["stats"]

    # ---- statements ----
    statements, txns, seen_refs = [], [], set()
    parsed = list(parsed_statements or []) + [parse_statement(src, name) for src, name in statement_files]
    for st in parsed:
        statements.append({k: v for k, v in st.items() if k != "rows"})
        for r in st["rows"]:
            if r["reference"] in seen_refs:
                continue  # same statement uploaded twice
            seen_refs.add(r["reference"])
            txns.append(r)
    if not txns:
        raise ValueError("No transactions could be read from the bank statements.")
    period_end = max(datetime.strptime(s["period"].split("-")[-1].strip(), "%d/%m/%Y").date()
                     for s in statements if s.get("period"))
    months = _month_list(period_end)
    period_start = date.fromisoformat(months[0] + "-01")

    # ---- reconciliation ----
    rec = reconcile(invoices, txns, customers, period_end)
    resolver: CustomerResolver = rec["resolver"]
    allocations = rec["allocations"]
    own = [i for i in invoices if "entity_mismatch" not in i["flags"]]
    sales = [i for i in own if i["kind"] == "invoice"]
    alloc_by_inv = defaultdict(list)
    for a in allocations:
        alloc_by_inv[a["invoice_number"]].append(a)
    for inv in sales:
        al = alloc_by_inv.get(inv["number"], [])
        if inv["status"] == "matched" and al:
            last = max(a["date"] for a in al)
            inv["days_to_pay"] = (date.fromisoformat(last) - date.fromisoformat(inv["issue_date"])).days
        else:
            inv["days_to_pay"] = None

    # ---- coverage ----
    stmt_months = defaultdict(set)
    for t in txns:
        stmt_months[t["iban"]].add(t["date"][:7])
    inv_months = {i["issue_date"][:7] for i in own}
    missing_inv = [m for m in months if m not in inv_months]
    missing_stmt = {iban: [m for m in months if m not in ms] for iban, ms in stmt_months.items()}

    # ---- monthly series ----
    monthly = {m: defaultdict(float) for m in months}
    for inv in own:
        m = inv["issue_date"][:7]
        if m in monthly:
            monthly[m]["revenue_net"] += inv["net_sar"]
    for inv in sales:
        m = inv["issue_date"][:7]
        if m not in monthly:
            continue
        exp = inv["expected_sar"]
        collected = min(inv["allocated_sar"], exp)
        rest = max(exp - collected, 0) if inv["status"] != "matched" else 0
        monthly[m]["invoiced_gross"] += exp
        monthly[m]["collected"] += collected if inv["status"] != "matched" else exp
        monthly[m]["open_past_due" if inv["collectible"] else "not_yet_due"] += rest
    balance_by_day = {}
    for t in sorted(txns, key=lambda t: (t["date"], t["reference"])):
        m = t["date"][:7]
        if m in monthly:
            monthly[m]["inflows"] += t["credit"]
            monthly[m]["outflows"] += t["debit"]
        balance_by_day[(t["iban"], t["date"])] = t["balance"]
    # month-end combined balance across accounts
    last_bal = {}
    for (iban, d), b in sorted(balance_by_day.items(), key=lambda x: x[0][1]):
        last_bal[iban] = b
        monthly.get(d[:7], {})["closing_balance"] = sum(last_bal.values()) if d[:7] in monthly else 0
    monthly_rows = [{"month": m, **{k: round(v, 2) for k, v in monthly[m].items()}} for m in months]

    # ---- headline metrics ----
    rev = [r.get("revenue_net", 0.0) for r in monthly_rows]
    total_rev = sum(rev)
    collectible = [i for i in sales if i["collectible"]]
    coll_expected = sum(i["expected_sar"] for i in collectible)
    coll_collected = sum(i["expected_sar"] if i["status"] == "matched" else min(i["allocated_sar"], i["expected_sar"])
                         for i in collectible)
    match_rate = coll_collected / coll_expected if coll_expected else 0.0
    paid = [i for i in sales if i["days_to_pay"] is not None]
    w = sum(i["expected_sar"] for i in paid)
    avg_days_to_pay = sum(i["days_to_pay"] * i["expected_sar"] for i in paid) / w if w else None
    customer_credits = [t for t in txns if t["credit"] > 0 and not t["description"].upper().startswith("CASH DEPOSIT")]
    unidentified = rec["unidentified_credits"]
    unidentified_sar = sum(t["credit"] for t in unidentified)
    allocated_credit_sar = sum(a["amount_sar"] for a in allocations)
    total_credits = sum(t["credit"] for t in txns)
    debt_service = defaultdict(float)
    for t in txns:
        if t["debit"] and DEBT_RE.search(t["description"]):
            debt_service[t["date"][:7]] += t["debit"]
    closing_balances = [r.get("closing_balance", 0) for r in monthly_rows if r.get("closing_balance")]

    # ---- customers ----
    cust_rows = {}
    for inv in own:
        cid = inv.get("customer_id") or resolver.for_invoice(inv)
        c = resolver.customers.get(cid, {})
        row = cust_rows.setdefault(cid, {
            "customer_id": cid, "name_en": c.get("name_en") or inv["customer_name"], "name_ar": c.get("name_ar", ""),
            "segment": c.get("segment", "unknown"), "terms_days": c.get("payment_terms_days", ""),
            "revenue_net": 0.0, "invoices": 0, "outstanding_past_due": 0.0, "_days": [], "_w": [],
            "last_payment": None})
        row["revenue_net"] += inv["net_sar"]
        if inv["kind"] == "invoice":
            row["invoices"] += 1
            if inv["collectible"] and inv["status"] != "matched":
                row["outstanding_past_due"] += inv["outstanding_sar"]
            if inv["days_to_pay"] is not None:
                row["_days"].append(inv["days_to_pay"])
                row["_w"].append(inv["expected_sar"])
    for t in customer_credits:
        cid = t.get("customer_id")
        if cid in cust_rows and (cust_rows[cid]["last_payment"] or "") < t["date"]:
            cust_rows[cid]["last_payment"] = t["date"]
    for row in cust_rows.values():
        row["share"] = row["revenue_net"] / total_rev if total_rev else 0
        row["avg_days_to_pay"] = round(sum(d * w for d, w in zip(row["_days"], row["_w"])) / sum(row["_w"])) if row["_w"] else None
        del row["_days"], row["_w"]
        row["revenue_net"] = round(row["revenue_net"], 2)
        row["outstanding_past_due"] = round(row["outstanding_past_due"], 2)
        row["signals"] = []
    cust_list = sorted(cust_rows.values(), key=lambda r: -r["revenue_net"])
    shares = [r["share"] for r in cust_list]
    top1, top5 = (shares[0] if shares else 0), sum(shares[:5])
    hhi = round(sum(s * s for s in shares) * 10_000)

    # ---- aging ----
    buckets = [("Not yet due", None, 0), ("1-30 days", 1, 30), ("31-60 days", 31, 60), ("61-90 days", 61, 90), ("90+ days", 91, 10**6)]
    aging = [{"bucket": b[0], "amount": 0.0, "invoices": 0} for b in buckets]
    for inv in sales:
        if inv["outstanding_sar"] <= 0:
            continue
        dpd = (period_end - date.fromisoformat(inv["due_date"])).days
        idx = 0 if dpd <= 0 else next(i for i, b in enumerate(buckets) if b[1] and b[1] <= dpd <= b[2])
        aging[idx]["amount"] = round(aging[idx]["amount"] + inv["outstanding_sar"], 2)
        aging[idx]["invoices"] += 1

    # ---- flags ----
    flags = []
    if missing_inv or any(missing_stmt.values()):
        detail = []
        if missing_inv:
            detail.append(f"no invoices for {', '.join(missing_inv)}")
        for iban, ms in missing_stmt.items():
            if ms:
                detail.append(f"no statement for {', '.join(ms)} on account ending {iban[-4:]}")
        flags.append(_flag("coverage", "critical", "12-month coverage incomplete", "; ".join(detail).capitalize() + "."))
    bad_stmts = [s for s in statements if s["checks"]["rows_failing_balance"] or not s["checks"]["closing_balance_matches"]]
    if bad_stmts:
        flags.append(_flag("statement_balance", "critical", "Statement arithmetic does not close",
                           f"{len(bad_stmts)} statement(s) fail the running-balance check, which can indicate an edited PDF or an extraction error.",
                           [s["file"] for s in bad_stmts]))

    if match_rate < 0.70:
        flags.append(_flag("low_match_rate", "critical", "Low share of revenue confirmed by bank",
                           f"Only {match_rate:.1%} of collectible invoiced value is confirmed by deposits."))
    elif match_rate < 0.85:
        flags.append(_flag("low_match_rate", "warning", "Part of revenue not confirmed by bank",
                           f"{match_rate:.1%} of collectible invoiced value is confirmed by deposits."))

    large = sorted([i for i in sales if i["collectible"] and i["status"] in ("unmatched", "partial")
                    and i["outstanding_sar"] >= LARGE_UNMATCHED_SAR], key=lambda i: -i["outstanding_sar"])
    if large:
        flags.append(_flag("unmatched_large", "warning", f"{len(large)} past-due invoice{'s' if len(large) != 1 else ''} over SAR 10,000 not collected",
                           f"{_sar(sum(i['outstanding_sar'] for i in large))} invoiced but not found in the bank statements.",
                           [i["number"] for i in large]))

    # customers who stopped paying
    for row in cust_list:
        if row["outstanding_past_due"] >= LARGE_UNMATCHED_SAR and row["last_payment"] and \
                (period_end - date.fromisoformat(row["last_payment"])).days >= 60:
            row["signals"].append("stopped_paying")
            unpaid = [i["number"] for i in sales if i["customer_id"] == row["customer_id"] and i["collectible"] and i["status"] != "matched"]
            flags.append(_flag("stopped_paying", "warning", f"{row['name_en']} has stopped paying",
                               f"No payment since {row['last_payment']}; {_sar(row['outstanding_past_due'])} past due across {len(unpaid)} invoices.",
                               unpaid))

    if top5 > 0.40 or top1 > 0.20:
        flags.append(_flag("concentration", "warning", "Revenue concentrated in a few customers",
                           f"Top customer {top1:.1%} and top 5 customers {top5:.1%} of revenue (HHI {hhi}).",
                           [r["customer_id"] for r in cust_list[:5]]))

    # related parties: registry overlap with the applicant, then money flowing back
    owner_surnames = {o.split()[-1].lower() for o in org.get("owners", [])}
    for row in cust_list:
        c = resolver.customers.get(row["customer_id"], {})
        reasons = []
        if org.get("phone") and c.get("phone") == org["phone"]:
            reasons.append("same phone number as the applicant")
        if any(s and s in (c.get("registry_shareholders") or "").lower() for s in owner_surnames):
            reasons.append("shareholders share the owner's family name")
        if org.get("address") and c.get("address") and c["address"][:25] == org["address"][:25]:
            reasons.append("same address as the applicant")
        reg = c.get("registry_registered_on")
        if reg and (period_end - date.fromisoformat(reg)).days < 540:
            reasons.append(f"registered recently ({reg})")
        if len(reasons) >= 2:
            received = [t for t in customer_credits if t.get("customer_id") == row["customer_id"]]
            target = compact_en(row["name_en"])
            back = [t for t in txns if t["debit"] and target and target in compact_en(t["description"])]
            returned = sum(t["debit"] for t in back)
            got = sum(t["credit"] for t in received)
            row["signals"].append("related_party")
            ratio = f" {returned / got:.0%} of the money received from them was transferred back to them within days." if got and returned else ""
            ratio += f" Revenue excluding this customer: {_sar((total_rev - row['revenue_net']) / 12)} per month."
            flags.append(_flag("related_party", "critical" if returned else "warning",
                               f"Possible related party: {row['name_en']}",
                               f"{row['share']:.1%} of revenue. Signals: {'; '.join(reasons)}.{ratio}",
                               [{"date": t["date"], "description": t["description"], "reference": t["reference"],
                                 "amount": t["debit"], "source_file": t["source_file"], "source_page": t["source_page"]}
                                for t in back][:40]))

    if inv_stats["duplicates_removed"]:
        flags.append(_flag("duplicates", "info", f"{inv_stats['duplicates_removed']} duplicate invoice rows removed",
                           "Identical rows (same number, customer and amount) were counted once.",
                           [x["invoice"] for x in issues if x["type"] == "duplicate"]))
    em = [i for i in invoices if "entity_mismatch" in i["flags"]]
    if em:
        flags.append(_flag("entity_mismatch", "warning", f"{len(em)} invoices issued by another entity",
                           f"Seller VAT number differs from the applicant's. {_sar(sum(i['net_sar'] for i in em))} excluded from revenue.",
                           [i["number"] for i in em]))
    fx = [i for i in own if "fx_converted" in i["flags"]]
    if fx:
        flags.append(_flag("fx_converted", "info", f"{len(fx)} foreign-currency invoices converted",
                           "USD converted at the fixed 3.75 peg; original amounts kept.", [i["number"] for i in fx]))
    if total_credits and unidentified_sar / total_credits > 0.02:
        flags.append(_flag("unidentified_inflows", "info", "Deposits from unidentified payers",
                           f"{_sar(unidentified_sar)} ({unidentified_sar / total_credits:.1%} of inflows) could not be linked to a known customer.",
                           [t["reference"] for t in unidentified][:20]))

    # activity gaps: 30+ days without any customer receipts
    days = sorted({t["date"] for t in txns if t["credit"] > 0})
    for a, b in zip(days, days[1:]):
        gap = (date.fromisoformat(b) - date.fromisoformat(a)).days
        if gap >= 30:
            flags.append(_flag("activity_gap", "warning", "Gap in business activity",
                               f"No incoming payments between {a} and {b} ({gap} days)."))
    if len(rev) == 12 and mean(rev[:10]) and mean(rev[-2:]) > 1.3 * mean(rev[:10]):
        flags.append(_flag("late_spike", "warning", "Revenue spike just before applying",
                           f"Last 2 months average {_sar(mean(rev[-2:]))}, {mean(rev[-2:]) / mean(rev[:10]) - 1:.0%} above the prior 10 months."))
    if debt_service:
        flags.append(_flag("existing_debt", "info", "Existing financing obligations",
                           f"Recurring finance installments of about {_sar(mean(debt_service.values()))} per month."))
    flags.sort(key=lambda f: SEVERITY_ORDER[f["severity"]])

    # ---- human review queue: uncertain name matches ----
    review = [{"bank_ref": t["reference"], "date": t["date"], "description": t["description"], "amount": t["credit"],
               "suggested_customer": resolver.customers.get(t["customer_id"], {}).get("name_en"),
               "name_confidence": t["name_confidence"]}
              for t in customer_credits if t.get("needs_review")]

    names = {cid: (c.get("name_en") or "") for cid, c in resolver.customers.items()}
    inv_out = [{
        "number": i["number"], "issue_date": i["issue_date"], "due_date": i["due_date"],
        "customer_id": i.get("customer_id"), "customer": names.get(i.get("customer_id"), i["customer_name"]),
        "customer_name_on_invoice": i["customer_name"], "net_sar": i["net_sar"], "expected_sar": i["expected_sar"],
        "allocated_sar": i["allocated_sar"], "outstanding_sar": i["outstanding_sar"], "status": i["status"],
        "days_to_pay": i.get("days_to_pay"), "days_past_due": i["days_past_due"], "flags": i["flags"],
        "credit_note": i.get("credit_note"), "original_currency": i["original_currency"],
        "original_total": i["original_total"], "source_ref": i["source_ref"],
    } for i in sorted([i for i in invoices if i["kind"] == "invoice"], key=lambda i: i["issue_date"])]
    credits_out = [{
        "reference": t["reference"], "date": t["date"], "description": t["description"], "credit": t["credit"],
        "counterparty": t.get("counterparty"), "customer_id": t.get("customer_id"),
        "name_confidence": t.get("name_confidence"), "match_basis": t.get("match_basis"),
        "needs_review": t.get("needs_review", False), "unallocated_sar": t.get("unallocated_sar", 0.0),
        "bank": t["bank"], "iban": t["iban"], "source_file": t["source_file"], "source_page": t["source_page"],
        "extraction_confidence": t["confidence"],
    } for t in txns if t["credit"] > 0]

    status_counts = defaultdict(int)
    for i in sales:
        status_counts[i["status"]] += 1
    cv = pstdev(rev) / mean(rev) if rev and mean(rev) else 0

    return {
        "applicant": {k: org.get(k) for k in ("legal_name", "legal_name_ar", "cr_number", "vat_number", "city", "sector", "owners")},
        "period": {"start": period_start.isoformat(), "end": period_end.isoformat(), "months": months},
        "metrics": {
            "total_revenue_net": round(total_rev, 2),
            "avg_monthly_revenue_net": round(total_rev / 12, 2),
            "revenue_volatility_cv": round(cv, 3),
            "peak_month": months[rev.index(max(rev))] if rev else None,
            "low_month": months[rev.index(min(rev))] if rev else None,
            "match_rate": round(match_rate, 4),
            "collectible_invoiced_gross": round(coll_expected, 2),
            "collectible_collected_gross": round(coll_collected, 2),
            "avg_days_to_payment": round(avg_days_to_pay, 1) if avg_days_to_pay else None,
            "top1_concentration": round(top1, 4), "top5_concentration": round(top5, 4), "hhi": hhi,
            "customers": len(cust_list),
            "invoices": len(sales), "invoice_status": dict(status_counts),
            "total_inflows": round(total_credits, 2),
            "inflows_explained_by_invoices": round(allocated_credit_sar / total_credits, 4) if total_credits else 0,
            "unidentified_inflows": round(unidentified_sar, 2),
            "avg_month_end_balance": round(mean(closing_balances), 2) if closing_balances else None,
            "min_month_end_balance": round(min(closing_balances), 2) if closing_balances else None,
            "monthly_debt_service": round(mean(debt_service.values()), 2) if debt_service else 0,
            "receivables_past_due": round(sum(a["amount"] for a in aging[1:]), 2),
        },
        "monthly": monthly_rows,
        "customers": cust_list,
        "aging": aging,
        "flags": flags,
        "review_queue": review,
        "data_quality": {
            **inv_stats,
            "statements": len(statements),
            "statement_rows": len(txns),
            "statements_passing_balance_check": len(statements) - len(bad_stmts),
            "accounts": [{"iban": s["iban"], "bank": s["bank"]} for s in {s["iban"]: s for s in statements}.values()],
            "invoice_months_missing": missing_inv,
            "statement_months_missing": missing_stmt,
        },
        "issues": issues,
        "invoices": inv_out,
        "credits": credits_out,
        "allocations": allocations,
        "disclaimer": DISCLAIMER,
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    }


def _matching_accuracy(report: dict) -> dict | None:
    """Amount-weighted precision/recall against the generator's ground truth (sample data only)."""
    path = DATA / "_ground_truth_allocations.csv"
    if not path.exists():
        return None
    import csv
    truth, pred = defaultdict(float), defaultdict(float)
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            truth[(r["invoice_number"], r["bank_ref"])] += float(r["amount_sar"])
    for a in report["allocations"]:
        pred[(a["invoice_number"], a["bank_ref"])] += a["amount_sar"]
    correct = sum(min(v, truth.get(k, 0.0)) for k, v in pred.items())
    return {"precision": round(correct / sum(pred.values()), 4), "recall": round(correct / sum(truth.values()), 4)}


@lru_cache(maxsize=1)
def _demo() -> dict:
    cache = DATA / "extracted" / "statements.json"
    if cache.exists():  # produced by scripts/extract_statements.py from the PDFs in data/statements
        parsed, files = json.loads(cache.read_text(encoding="utf-8")), []
    else:
        parsed, files = None, [(p, p.name) for p in sorted((DATA / "statements").glob("*.pdf"))]
    report = build_report(DATA / "invoices_2025-10_to_2026-09.xlsx", files, DATA / "customers.csv",
                          DATA / "organization.json", parsed_statements=parsed)
    report["data_quality"]["matching_accuracy"] = _matching_accuracy(report)
    return report


def build_demo_report(include_internals: bool = False) -> dict:
    r = _demo()
    if include_internals:
        return {**r, "_allocations": r["allocations"]}
    return r
