"""AI-written briefing memo for the bank credit analyst.

The model only sees the computed package (metrics, flags, top customers), never raw files, and is
instructed not to recommend a decision or a loan amount: the bank decides, Qawafel prepares.
Without an API key, a deterministic template memo is returned instead.
"""
from __future__ import annotations

import hashlib
import json
import os

DEFAULT_MODEL = "claude-sonnet-5-5"

SYSTEM_PROMPT = """You are a credit analyst assistant at Qawafel, a Saudi platform that prepares verified financing \
packages for SME wholesalers. You write a briefing memo for a bank credit analyst who will make the decision.

Rules:
- Use only facts and numbers present in the JSON package. Never invent figures, names or dates.
- Do not recommend approving or declining, and do not suggest a loan amount or pricing. The bank decides.
- Separate what the evidence supports from what needs investigation. Be specific and neutral.
- Amounts in SAR, rounded (e.g. SAR 1.22M, SAR 52K). Percentages to one decimal.
- Markdown only, with exactly these headings:
  ## Snapshot  (2-3 sentences)
  ## What the evidence supports  (3-5 bullets)
  ## What needs investigation  (bullets, most serious first)
  ## Questions for the applicant  (3-5 numbered questions)
- Maximum 320 words."""

_cache: dict[str, dict] = {}


def build_context(report: dict) -> dict:
    """Compact, model-friendly view of the package (no raw invoices or transactions)."""
    return {
        "applicant": report["applicant"],
        "period": {k: report["period"][k] for k in ("start", "end")},
        "metrics": report["metrics"],
        "monthly_revenue_net": {r["month"]: round(r.get("revenue_net", 0)) for r in report["monthly"]},
        "top_customers": [
            {k: c[k] for k in ("name_en", "segment", "share", "avg_days_to_pay", "outstanding_past_due", "signals")}
            for c in report["customers"][:8]
        ],
        "receivables_aging": report["aging"],
        "flags": [{k: f[k] for k in ("severity", "title", "detail")} for f in report["flags"]],
        "data_quality": {k: report["data_quality"][k] for k in (
            "rows_read", "duplicates_removed", "credit_notes", "fx_converted", "entity_mismatch",
            "statements", "statements_passing_balance_check")},
    }


def _k(x: float) -> str:
    return f"SAR {x / 1e6:.2f}M" if abs(x) >= 1e6 else f"SAR {x / 1e3:.0f}K"


def _month(m: str | None) -> str:
    from datetime import date
    return date.fromisoformat(m + "-01").strftime("%b %Y") if m else "n/a"


def template_memo(ctx: dict) -> str:
    m = ctx["metrics"]
    name = ctx["applicant"].get("legal_name") or "The applicant"
    crit = [f for f in ctx["flags"] if f["severity"] in ("critical", "warning")]
    lines = [
        "## Snapshot",
        f"{name} reported net sales of {_k(m['total_revenue_net'])} over 12 months "
        f"(average {_k(m['avg_monthly_revenue_net'])} per month, peak {_month(m['peak_month'])}, low {_month(m['low_month'])}). "
        f"{m['match_rate']:.1%} of collectible invoiced value is confirmed by bank deposits.",
        "",
        "## What the evidence supports",
        f"- Collections: {_k(m['collectible_collected_gross'])} of {_k(m['collectible_invoiced_gross'])} collectible invoices found in the bank.",
        f"- Average payment time: {m['avg_days_to_payment']} days across {m['customers']} customers.",
        f"- Average month-end balance {_k(m['avg_month_end_balance'])}; lowest {_k(m['min_month_end_balance'])}.",
        f"- Existing finance installments: {_k(m['monthly_debt_service'])} per month.",
        "",
        "## What needs investigation",
        *[f"- **{f['title'].rstrip('.')}.** {f['detail']}" for f in crit],
        "",
        "## Questions for the applicant",
        *[f"{i}. {q}" for i, q in enumerate([
            "What is the commercial relationship with any customer flagged as a possible related party?",
            "What is the recovery plan for past-due receivables from customers who stopped paying?",
            "Are all bank accounts that receive sales included in this application?",
        ], 1)],
    ]
    return "\n".join(lines)


def generate_memo(report_or_ctx: dict) -> dict:
    ctx = report_or_ctx if "monthly_revenue_net" in report_or_ctx else build_context(report_or_ctx)
    key = hashlib.sha256(json.dumps(ctx, sort_keys=True, default=str).encode()).hexdigest()
    if key in _cache:
        return _cache[key]
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    model = os.environ.get("CLAUDE_MODEL", DEFAULT_MODEL)
    result = {"source": "template", "model": None, "memo_markdown": template_memo(ctx), "note": None}
    if api_key:
        try:
            import anthropic

            client = anthropic.Anthropic(api_key=api_key, timeout=45)
            msg = client.messages.create(
                model=model, max_tokens=900, system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": "Package JSON:\n" + json.dumps(ctx, ensure_ascii=False, default=str)}],
            )
            text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text").strip()
            if text:
                result = {"source": "claude", "model": model, "memo_markdown": text, "note": None}
        except Exception as e:  # never fail the page because the model is unavailable
            result["note"] = f"AI memo unavailable ({type(e).__name__}); showing the template memo."
    else:
        result["note"] = "No ANTHROPIC_API_KEY configured; showing the template memo."
    _cache[key] = result
    return result
