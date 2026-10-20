"""Qawafel financing package prototype - FastAPI app (Vercel entrypoint: `app`).

Run locally:  uvicorn main:app --reload   then open http://127.0.0.1:8000
"""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from engine.memo import build_context, generate_memo
from engine.report import DATA, build_demo_report, build_report

ROOT = Path(__file__).resolve().parent
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_STATEMENTS = 36
DEMO_ID = "demo"

app = FastAPI(title="Qawafel Financing Package API", version="0.1.0",
              description="Turns 12 months of invoices and bank statements into a verified package for a bank credit analyst.")
app.add_middleware(GZipMiddleware, minimum_size=1000)


def error(status: int, code: str, message: str, details: dict | None = None):
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message, "details": details or {}}})


def _report(app_id: str) -> dict:
    if app_id != DEMO_ID:
        raise HTTPException(404, detail={"code": "APPLICATION_NOT_FOUND", "message": f"No application '{app_id}'. Use 'demo'."})
    return build_demo_report()


@app.exception_handler(HTTPException)
async def http_error(_, exc: HTTPException):
    d = exc.detail if isinstance(exc.detail, dict) else {"code": "ERROR", "message": str(exc.detail)}
    return error(exc.status_code, d.get("code", "ERROR"), d.get("message", ""), d.get("details"))


@app.get("/api/health")
def health():
    return {"status": "ok", "ai_memo": bool(os.environ.get("ANTHROPIC_API_KEY"))}


@app.get("/api/applications/{app_id}/report")
def full_report(app_id: str):
    """Everything the analyst workbench needs in one response (summary, invoices, credits, allocations)."""
    return _report(app_id)


@app.get("/api/applications/{app_id}/package")
def package(app_id: str):
    """Decision summary: metrics, monthly series, customers, aging, flags (US-09, US-10)."""
    r = _report(app_id)
    return {k: r[k] for k in ("applicant", "period", "metrics", "monthly", "customers", "aging", "flags",
                              "review_queue", "data_quality", "disclaimer")}


@app.get("/api/applications/{app_id}/invoices")
def invoices(app_id: str, status: str | None = Query(None, pattern="^(matched|partial|unmatched|not_yet_due)$"),
             min_amount: float = 0, customer_id: str | None = None, limit: int = Query(50, le=500), offset: int = 0):
    """Drill into the invoices behind a metric (US-10, US-11)."""
    rows = [i for i in _report(app_id)["invoices"]
            if (not status or i["status"] == status) and i["expected_sar"] >= min_amount
            and (not customer_id or i["customer_id"] == customer_id)]
    return {"total": len(rows), "items": rows[offset:offset + limit]}


@app.get("/api/applications/{app_id}/invoices/{number}/evidence")
def evidence(app_id: str, number: str):
    """Source row plus the bank transactions that paid this invoice (US-11)."""
    r = _report(app_id)
    inv = next((i for i in r["invoices"] if i["number"] == number), None)
    if not inv:
        raise HTTPException(404, detail={"code": "INVOICE_NOT_FOUND", "message": f"Invoice {number} not found."})
    credits = {c["reference"]: c for c in r["credits"]}
    allocs = [{**a, "transaction": credits.get(a["bank_ref"])} for a in r["allocations"] if a["invoice_number"] == number]
    return {"invoice": inv, "allocations": allocs}


@app.post("/api/memo")
def memo(package: dict):
    """AI briefing memo from a package summary (works for the demo and for uploaded data)."""
    try:
        lang = "ar" if package.pop("lang", "en") == "ar" else "en"
        ctx = build_context(package) if "metrics" in package and "monthly" in package else package
        return generate_memo(ctx, lang)
    except KeyError as e:
        raise HTTPException(400, detail={"code": "INVALID_PACKAGE", "message": f"Missing field {e} in package."})


@app.post("/api/analyze")
def analyze(invoices: UploadFile = File(...), statements: list[UploadFile] = File(...),
            customers: UploadFile | None = File(None), organization: UploadFile | None = File(None)):
    """Analyze your own files: invoices (.xlsx) + bank statements (.pdf, sample-bank layout) + optional customer master and profile."""
    if len(statements) > MAX_STATEMENTS:
        raise HTTPException(400, detail={"code": "TOO_MANY_FILES", "message": f"Upload at most {MAX_STATEMENTS} statements."})
    files = [invoices, *statements] + [f for f in (customers, organization) if f]
    blobs = {id(f): f.file.read() for f in files}
    if sum(len(b) for b in blobs.values()) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, detail={"code": "UPLOAD_TOO_LARGE", "message": "Total upload must be under 20 MB."})
    if not invoices.filename.lower().endswith(".xlsx"):
        raise HTTPException(400, detail={"code": "INVALID_FILE_TYPE", "message": "Invoices must be an .xlsx file."})
    bad = [s.filename for s in statements if not s.filename.lower().endswith(".pdf")]
    if bad:
        raise HTTPException(400, detail={"code": "INVALID_FILE_TYPE", "message": "Statements must be PDF files.", "details": {"files": bad}})
    try:
        return build_report(blobs[id(invoices)], [(blobs[id(s)], s.filename) for s in statements],
                            blobs[id(customers)] if customers else None,
                            blobs[id(organization)] if organization else None)
    except ValueError as e:
        raise HTTPException(422, detail={"code": "UNREADABLE_FILE", "message": str(e)})
    except Exception as e:
        raise HTTPException(422, detail={"code": "UNREADABLE_FILE",
                                         "message": f"Could not read the files ({type(e).__name__}). Check they follow the sample layout."})


@app.get("/api/sample-data")
def sample_data():
    files = sorted(p for p in DATA.rglob("*") if p.is_file())
    return [{"path": str(p.relative_to(DATA)), "bytes": p.stat().st_size} for p in files]


@app.get("/api/sample-data/{path:path}")
def sample_file(path: str, inline: bool = False):
    """Download a sample file; ?inline=1 lets the browser open it (PDFs open at #page=N)."""
    target = (DATA / path).resolve()
    if not target.is_file() or not target.is_relative_to(DATA.resolve()):
        raise HTTPException(404, detail={"code": "FILE_NOT_FOUND", "message": f"No sample file '{path}'."})
    return FileResponse(target, filename=target.name, content_disposition_type="inline" if inline else "attachment")


# Local development only: Vercel serves public/ from its CDN and must not see a mount of it.
if not os.environ.get("VERCEL"):
    app.mount("/", StaticFiles(directory=ROOT / "public", html=True), name="public")
