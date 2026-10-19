# Qawafel financing package prototype

Turns a wholesaler's 12 months of invoices (Excel) and bank statements (PDF) into a verified package a bank credit analyst can act on in minutes.

**Live:** `<your Vercel URL>`

## What it does

A credit analyst opens one applicant and can answer three questions:

1. **Is the revenue real?** Every invoice is reconciled against bank deposits. The headline shows the share of due invoices confirmed by the bank, month by month.
2. **Is it stable?** Monthly sales, seasonality, payment speed, cash balances and existing debt.
3. **What should I investigate?** Ranked flags (related parties, customers who stopped paying, concentration, entity mismatches, duplicates), each linked to the invoices or bank transfers behind it.

Click any invoice to see its source row and the exact bank transactions that paid it, with the PDF file and page. A briefing memo is written by Claude from the verified figures. It lists evidence and questions but never recommends a decision, because the bank decides.

You can also upload your own files (same layout as the samples) with **Analyze your own files**.

## Run it locally

```bash
pip install -r requirements-dev.txt
uvicorn main:app --reload        # open http://127.0.0.1:8000
pytest -q                        # 8 tests, including matching accuracy
```

Optional: `export ANTHROPIC_API_KEY=...` to enable the AI memo (otherwise a template memo is shown). `CLAUDE_MODEL` overrides the model (default `claude-sonnet-5-5`).

Regenerate the sample data: `python scripts/generate_data.py && python scripts/extract_statements.py`, then `python scripts/evaluate_matching.py`.

## Deploy (Vercel)

1. Push this repo to GitHub and import it in Vercel. FastAPI is detected from `main.py`; `public/` is served from the CDN.
2. Add `ANTHROPIC_API_KEY` under Project Settings, Environment Variables, and set a spend limit on the key.

## Sample data

All in [`data/`](data). Fully synthetic: the applicant, customers and banks are fictional.

| File | What it is |
|---|---|
| `invoices_2025-10_to_2026-09.xlsx` | 1,857 invoice rows, the Excel the wholesaler uploads |
| `statements/*.pdf` | 24 monthly statements for 2 accounts, the PDFs the wholesaler uploads |
| `customers.csv` | Customer master plus simulated commercial-registry fields |
| `organization.json` | Applicant profile and declared bank accounts |
| `extracted/bank_transactions.csv` | 1,418 transactions extracted from the PDFs |
| `_ground_truth_allocations.csv` | Which payment paid which invoice, used only to score the matcher |

Assumptions behind the data and the prototype, and the issues deliberately planted in it: **[ASSUMPTIONS.md](ASSUMPTIONS.md)**.

## How it works

```
Excel ──► loader: find header, map columns, dates, VAT, USD→SAR, duplicates, credit notes, entity check
PDFs  ──► extractor: parse tables, verify every row against the running balance
                │
                ▼
        matcher: invoice number → statement month → exact amount → oldest-first; cash batches
                │   (output = allocations: invoice, transaction, amount, method, confidence)
                ▼
        package: metrics, monthly series, customers, aging, ranked flags, review queue
                │
                ├──► FastAPI JSON API ──► analyst page (public/)
                └──► Claude briefing memo (figures only, no decision)
```

**Matching accuracy on the sample data:** 99.5% precision and 99.5% recall (amount-weighted, against ground truth).

### API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/applications/demo/package` | Decision summary: metrics, flags, customers, aging |
| GET | `/api/applications/demo/invoices?status=&min_amount=&customer_id=` | Filter invoices behind a metric |
| GET | `/api/applications/demo/invoices/{number}/evidence` | Source row and the payments that settled it |
| GET | `/api/applications/demo/report` | Everything the page needs in one response |
| POST | `/api/analyze` | Analyze uploaded files (multipart: `invoices`, `statements[]`, optional `customers`, `organization`) |
| POST | `/api/memo` | AI briefing memo from a package |
| GET | `/api/sample-data`, `/api/sample-data/{path}` | List and download the sample files |

Interactive docs at `/docs`. Task 2 diagrams (data model, process flow, status) are in [`docs/`](docs) as Mermaid source. Errors share one format: `{"error": {"code", "message", "details"}}`.

## Limitations

- Statement parsing supports the two sample bank layouts only. Production needs a parser per bank, or Open Banking data instead of PDFs (see Task 5).
- Related-party checks use simulated registry fields. Production would query the commercial registry.
- Single applicant, no authentication or persistence: this is a review prototype, not the full system in the spec.

## AI tools used

- **Claude** (Anthropic) as a pair-programmer and reviewer: generating the synthetic data, the extraction and matching engine, the API and the frontend, and challenging my requirements and design choices.
- **Claude at runtime**: writes the briefing memo from the computed package.
- I set the scope and assumptions, reviewed the output, and verified the matcher against ground truth (see ASSUMPTIONS.md).
