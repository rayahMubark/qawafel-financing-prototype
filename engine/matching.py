"""Reconcile invoices against bank credits.

One payment can settle many invoices (monthly statements, weekly cash deposits) and one invoice
can be settled by many payments (partial payments), so the output is a list of allocations:
(invoice, bank transaction, amount, method, confidence) - the MATCH_ALLOCATION table in the spec.

Rules, in order, per customer and in date order:
  1. reference  - the transfer quotes invoice numbers           -> allocate to those invoices
  2. statement  - the transfer quotes a statement month (STMT)  -> allocate to that month's invoices
  3. exact      - one open invoice equals the amount (FX invoices: within 2%)
  4. fifo       - allocate oldest-first, the standard receivables convention
Cash deposits are allocated oldest-first to open cash-terms invoices (cash_batch).
"""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import date
from difflib import SequenceMatcher

from .loader import norm_ar

INV_RE = re.compile(r"INV-\d{2}-\d{4}")
STMT_RE = re.compile(r"STMT ([A-Z]{3})(\d{4})")
PREFIXES = ["SARIE TRF FROM", "INCOMING TRF", "B2B TRF FROM", "TRF FROM"]
STOP = {"CO", "COMPANY", "EST", "WLL", "LLC", "THE"}
SYN = {"MKT": "MARKETS", "MKTS": "MARKETS", "SPRMKT": "SUPERMARKET", "SUPERMKT": "SUPERMARKET",
       "BAQALA": "BAQALAT", "GRP": "GROUP", "REST": "RESTAURANTS", "ST": "STREET"}
MONTHS = {m: i for i, m in enumerate(["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"], 1)}
NAME_MATCH_MIN = 0.80      # accept automatically
NAME_REVIEW_MIN = 0.65     # accept tentatively and send to human review
FX_TOLERANCE = 0.02


GENERIC = {"AL", "MARKETS", "MARKET", "SUPERMARKET", "SUPERMARKETS", "HYPERMARKETS", "HYPER", "STREET"}


def tokens_en(s: str) -> list[str]:
    s = (s or "").upper().replace(".", "").replace("'", "")
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return [SYN.get(t, t) for t in s.split() if t not in STOP]


def compact_en(s: str) -> str:
    return "".join(tokens_en(s))


def distinctive(s: str) -> set[str]:
    """Words that identify a business: drop generic words and the Arabic article fused to a word."""
    out = set()
    for t in tokens_en(s):
        if t in GENERIC:
            continue
        if t.startswith("AL") and len(t) > 4:
            t = t[2:]
        out.add(t)
    return out


def name_score(bank_name: str, registry_name: str) -> float:
    """0.5 x character similarity + 0.5 x share of the payer's distinctive words found in the registry name."""
    a, b = compact_en(bank_name), compact_en(registry_name)
    if not a or not b:
        return 0.0
    seq = SequenceMatcher(None, a, b).ratio()
    if len(b) >= 8 and (b in a or a in b):
        seq = max(seq, 0.95)
    da, db = distinctive(bank_name), distinctive(registry_name)
    if not da:
        return seq
    hit = sum(any(SequenceMatcher(None, x, y).ratio() >= 0.8 for y in db) for x in da)
    return 0.5 * seq + 0.5 * hit / len(da)


def counterparty_from_description(desc: str) -> str:
    d = desc.upper()
    for p in PREFIXES:
        if d.startswith(p):
            d = d[len(p):]
            break
    d = re.split(r"\sINV\s|\sINV-|\sSTMT\s", " " + d + " ")[0]
    return d.strip()


class CustomerResolver:
    """Maps invoice customer names/VAT numbers and bank counterparty strings to one customer id."""

    def __init__(self, customers: list[dict]):
        self.customers = {c["customer_id"]: c for c in customers}
        self.by_vat = {c["vat_number"]: c["customer_id"] for c in customers if c.get("vat_number")}
        self.by_name = {}
        for c in customers:
            for n in (c.get("name_en"), c.get("name_ar")):
                if n:
                    self.by_name[norm_ar(n).upper()] = c["customer_id"]
        self.names_en = [(c.get("name_en", ""), c["customer_id"]) for c in customers if c.get("name_en")]

    def for_invoice(self, inv: dict) -> str:
        if inv["customer_vat"] in self.by_vat:
            return self.by_vat[inv["customer_vat"]]
        key = norm_ar(inv["customer_name"]).upper()
        if key in self.by_name:
            return self.by_name[key]
        # Unknown customer: create an id from the name so it still groups consistently.
        cid = "N:" + key
        self.customers.setdefault(cid, {"customer_id": cid, "name_en": inv["customer_name"], "name_ar": "",
                                        "segment": "unknown", "payment_terms_days": ""})
        self.names_en.append((inv["customer_name"], cid))
        return cid

    def for_counterparty(self, name: str) -> tuple[str | None, float]:
        best, best_score = None, 0.0
        for reg_name, cid in self.names_en:
            score = name_score(name, reg_name)
            if score > best_score:
                best, best_score = cid, score
        return best, round(best_score, 2)


def reconcile(invoices: list[dict], transactions: list[dict], customers: list[dict], period_end: date) -> dict:
    resolver = CustomerResolver(customers)
    sales = [i for i in invoices if i["kind"] == "invoice"]
    for inv in sales:
        inv["customer_id"] = resolver.for_invoice(inv)
        inv["expected_sar"] = round(inv["gross_sar"] + inv.get("credit_note_gross_sar", 0.0), 2)
        inv["allocated_sar"] = 0.0
    by_no = {i["number"]: i for i in sales}
    open_by_cust: dict[str, list[dict]] = defaultdict(list)
    for inv in sorted(sales, key=lambda i: (i["issue_date"], i["number"])):
        open_by_cust[inv["customer_id"]].append(inv)
    cash_terms = {cid for cid, c in resolver.customers.items() if str(c.get("payment_terms_days")) == "0"}

    allocations: list[dict] = []
    unidentified: list[dict] = []

    def outstanding(inv):
        return round(inv["expected_sar"] - inv["allocated_sar"], 2)

    def allocate(inv, txn, amount, method, conf):
        amount = round(amount, 2)
        if amount <= 0:
            return 0.0
        inv["allocated_sar"] = round(inv["allocated_sar"] + amount, 2)
        allocations.append({"invoice_number": inv["number"], "bank_ref": txn["reference"], "amount_sar": amount,
                            "date": txn["date"], "method": method, "confidence": conf})
        return amount

    credits = sorted([t for t in transactions if t["credit"] > 0], key=lambda t: (t["date"], t["reference"]))
    for txn in credits:
        desc = txn["description"].upper()
        remaining = txn["credit"]
        if desc.startswith("CASH DEPOSIT"):
            txn["counterparty"], txn["customer_id"], txn["name_confidence"] = "Cash deposit", None, None
            pool = [i for cid in cash_terms for i in open_by_cust[cid]
                    if outstanding(i) > 0 and i["issue_date"] <= txn["date"]]
            for inv in sorted(pool, key=lambda i: (i["issue_date"], i["number"])):
                if remaining <= 0.009:
                    break
                remaining -= allocate(inv, txn, min(outstanding(inv), remaining), "cash_batch", 0.85)
            txn["unallocated_sar"] = round(max(remaining, 0), 2)
            continue

        name = counterparty_from_description(desc)
        cid, score = resolver.for_counterparty(name)
        basis = "name"
        if score < NAME_MATCH_MIN:
            # Invoice numbers quoted in the transfer are stronger evidence than a fuzzy name.
            quoted = [by_no[n]["customer_id"] for n in INV_RE.findall(desc) if n in by_no]
            if quoted and (cid in quoted or score >= 0.5):
                cid, score, basis = quoted[0], 0.95, "invoice_reference"
            elif score >= NAME_REVIEW_MIN:
                basis = "tentative_name"
            else:
                cid = None
        txn["counterparty"], txn["customer_id"], txn["name_confidence"] = name, cid, score
        txn["match_basis"] = basis if cid else None
        txn["needs_review"] = basis == "tentative_name"
        if cid is None:
            txn["unallocated_sar"] = round(remaining, 2)
            unidentified.append(txn)
            continue
        name_conf = min(score, 0.99)
        open_items = [i for i in open_by_cust[cid] if outstanding(i) > 0.009 and i["issue_date"] <= txn["date"]]

        # 1. invoice numbers quoted in the transfer
        for no in INV_RE.findall(desc):
            inv = by_no.get(no)
            if inv and inv["customer_id"] == cid and outstanding(inv) > 0 and remaining > 0.009:
                remaining -= allocate(inv, txn, min(outstanding(inv), remaining), "reference", 0.99)
        # 2. statement month quoted in the transfer
        m = STMT_RE.search(desc)
        if m and remaining > 0.009:
            y, mo = int(m.group(2)), MONTHS.get(m.group(1), 0)
            for inv in [i for i in open_items if i["issue_date"][:7] == f"{y}-{mo:02d}" and outstanding(i) > 0]:
                if remaining <= 0.009:
                    break
                remaining -= allocate(inv, txn, min(outstanding(inv), remaining), "statement", round(0.97 * name_conf, 2))
        # 3. exact single match
        if remaining > 0.009:
            for inv in open_items:
                o = outstanding(inv)
                tol = max(1.0, o * FX_TOLERANCE) if inv["original_currency"] != "SAR" else 0.05
                if o > 0 and abs(o - remaining) <= tol:
                    remaining -= allocate(inv, txn, min(o, remaining), "exact", round(0.95 * name_conf, 2))
                    break
        # 4. oldest-first
        if remaining > 0.009:
            for inv in open_items:
                if remaining <= 0.009:
                    break
                o = outstanding(inv)
                if o > 0:
                    remaining -= allocate(inv, txn, min(o, remaining), "fifo", round(0.75 * name_conf, 2))
        txn["unallocated_sar"] = round(max(remaining, 0), 2)

    # Invoice status. FX invoices are settled within tolerance (bank charges on foreign transfers).
    grace_days = 30
    for inv in sales:
        o = outstanding(inv)
        tol = inv["expected_sar"] * FX_TOLERANCE if inv["original_currency"] != "SAR" else 0.05
        due = date.fromisoformat(inv["due_date"])
        if o <= tol:
            inv["status"] = "matched"
        elif inv["allocated_sar"] > 0:
            inv["status"] = "partial"
        else:
            inv["status"] = "unmatched"
        inv["outstanding_sar"] = max(round(o, 2), 0.0) if inv["status"] != "matched" else 0.0
        inv["collectible"] = (due.toordinal() + grace_days) <= period_end.toordinal()
        if inv["status"] != "matched" and not inv["collectible"]:
            inv["status"] = "not_yet_due" if inv["status"] == "unmatched" else inv["status"]
        inv["days_past_due"] = max((period_end - due).days, 0) if inv["outstanding_sar"] > 0 else 0

    return {"allocations": allocations, "unidentified_credits": unidentified, "resolver": resolver}
