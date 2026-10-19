"""Extract all sample bank statement PDFs once and cache the result.

Writes data/extracted/statements.json (used by the app for fast startup) and
data/extracted/bank_transactions.csv (the same rows, for humans to inspect).
"""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from engine.extract import parse_statement  # noqa: E402

out = ROOT / "data" / "extracted"
out.mkdir(exist_ok=True)
parsed = [parse_statement(p, p.name) for p in sorted((ROOT / "data" / "statements").glob("*.pdf"))]
(out / "statements.json").write_text(json.dumps(parsed, ensure_ascii=False), encoding="utf-8")
fields = ["bank", "iban", "date", "description", "reference", "debit", "credit", "balance", "source_file", "source_page", "confidence"]
with open(out / "bank_transactions.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader()
    for st in parsed:
        for r in st["rows"]:
            w.writerow({k: r[k] for k in fields})
bad = [s["file"] for s in parsed if s["checks"]["rows_failing_balance"] or not s["checks"]["closing_balance_matches"]]
print(f"{len(parsed)} statements, {sum(len(s['rows']) for s in parsed)} rows, balance check failures: {bad or 'none'}")
