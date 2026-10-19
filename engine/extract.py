"""Extract transactions from bank statement PDFs and verify them with balance arithmetic.

Assumption: one parser per bank template. This prototype supports the statement layout of the
two sample banks. Every row is checked against the running balance; a row whose arithmetic does
not close gets low confidence and is sent to human review.
"""
from __future__ import annotations

import io
import re
from datetime import datetime

import pdfplumber

HEADER = ["Date", "Description", "Reference", "Debit", "Credit", "Balance"]
TOLERANCE = 0.01


def _num(s: str | None) -> float:
    s = (s or "").replace(",", "").strip()
    return float(s) if s else 0.0


def _field(text: str, label: str) -> str | None:
    m = re.search(rf"{label}:\s*(.+)", text)
    return m.group(1).strip() if m else None


def parse_statement(source, filename: str) -> dict:
    """source: a path or raw bytes. Returns account metadata, rows and verification checks."""
    data = source if isinstance(source, (bytes, bytearray)) else open(source, "rb").read()
    rows, meta_text = [], ""
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page_no, page in enumerate(pdf.pages, start=1):
            if page_no == 1 or page_no == len(pdf.pages):
                meta_text += "\n" + (page.extract_text() or "")
            for table in page.extract_tables():
                for r in table:
                    if not r or r[0] in (None, "", "Date"):
                        continue
                    r = (r + [""] * 6)[:6]
                    rows.append({
                        "date": datetime.strptime(r[0].strip(), "%d/%m/%Y").date().isoformat(),
                        "description": " ".join((r[1] or "").split()),
                        "reference": (r[2] or "").strip(),
                        "debit": _num(r[3]),
                        "credit": _num(r[4]),
                        "balance": _num(r[5]),
                        "source_file": filename,
                        "source_page": page_no,
                    })

    bank = meta_text.strip().split("\n", 1)[0].split(" - ")[0].strip()
    iban = _field(meta_text, "IBAN")
    holder = _field(meta_text, "Account holder")
    period = _field(meta_text, "Statement period")
    opening = _num((_field(meta_text, "Opening balance") or "").replace("SAR", ""))
    closing_m = re.findall(r"Closing balance:\s*SAR\s*([\d,.\-]+)", meta_text)
    closing = _num(closing_m[-1]) if closing_m else None

    # Row-level verification: previous balance + credit - debit must equal the printed balance.
    bal = opening
    broken = 0
    for r in rows:
        expected = round(bal + r["credit"] - r["debit"], 2)
        ok = abs(expected - r["balance"]) <= TOLERANCE
        r["confidence"] = 0.99 if ok else 0.55
        broken += not ok
        bal = r["balance"]
    closes = closing is not None and abs(bal - closing) <= TOLERANCE
    for r in rows:
        r["iban"], r["bank"] = iban, bank
    return {
        "file": filename, "bank": bank, "iban": iban, "holder": holder, "period": period,
        "opening_balance": opening, "closing_balance": closing, "rows": rows,
        "checks": {"rows": len(rows), "rows_failing_balance": broken, "closing_balance_matches": closes},
    }
