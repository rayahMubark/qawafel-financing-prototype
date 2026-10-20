import csv
import io
import os
from collections import defaultdict
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

os.environ.pop("ANTHROPIC_API_KEY", None)  # tests use the template memo

from engine.extract import parse_statement  # noqa: E402
from engine.matching import name_score  # noqa: E402
from engine.report import build_demo_report  # noqa: E402
from main import app  # noqa: E402

DATA = Path(__file__).resolve().parent.parent / "data"
client = TestClient(app)


@pytest.fixture(scope="module")
def report():
    return build_demo_report()


def test_statement_extraction_closes_balances():
    st = parse_statement(DATA / "statements" / "rimal_2026-02.pdf", "rimal_2026-02.pdf")
    assert st["checks"]["rows_failing_balance"] == 0
    assert st["checks"]["closing_balance_matches"]
    assert st["iban"].startswith("SA")


def test_matching_against_ground_truth(report):
    truth = defaultdict(float)
    with open(DATA / "_ground_truth_allocations.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            truth[(r["invoice_number"], r["bank_ref"])] += float(r["amount_sar"])
    pred = defaultdict(float)
    for a in report["allocations"]:
        pred[(a["invoice_number"], a["bank_ref"])] += a["amount_sar"]
    correct = sum(min(v, truth.get(k, 0)) for k, v in pred.items())
    assert correct / sum(pred.values()) > 0.98
    assert correct / sum(truth.values()) > 0.98


def test_name_scoring_prefers_distinctive_words():
    assert name_score("AL BADR MKTS", "Al Badr Mini Market Chain") > name_score("AL BADR MKTS", "Lulu Al Wadi Markets")
    assert name_score("WADI RETAIL CO", "Wadi Retail Co.") > 0.9


def test_planted_issues_are_detected(report):
    types = {f["type"] for f in report["flags"]}
    assert {"related_party", "stopped_paying", "concentration", "entity_mismatch", "duplicates", "fx_converted"} <= types
    assert report["data_quality"]["duplicates_removed"] == 3
    assert report["data_quality"]["statements_passing_balance_check"] == 24
    assert not report["data_quality"]["invoice_months_missing"]


def test_api_package_and_drilldown():
    assert client.get("/api/health").json()["status"] == "ok"
    pkg = client.get("/api/applications/demo/package").json()
    assert pkg["disclaimer"].startswith("Prepared by Qawafel")
    page = client.get("/api/applications/demo/invoices", params={"status": "matched", "limit": 1}).json()
    number = page["items"][0]["number"]
    ev = client.get(f"/api/applications/demo/invoices/{number}/evidence").json()
    assert ev["allocations"] and ev["allocations"][0]["transaction"]["source_file"].endswith(".pdf")


def test_sample_pdf_opens_inline():
    url = "/api/sample-data/statements/najd_2025-11.pdf"
    r = client.get(url, params={"inline": 1})
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    assert r.headers["content-disposition"].startswith("inline")
    assert client.get(url).headers["content-disposition"].startswith("attachment")
    assert client.get("/api/sample-data/..%2Fmain.py", params={"inline": 1}).status_code == 404


def test_api_errors_use_one_format():
    r = client.get("/api/applications/nope/package")
    assert r.status_code == 404 and r.json()["error"]["code"] == "APPLICATION_NOT_FOUND"
    r = client.post("/api/analyze", files={"invoices": ("x.csv", b"a,b"), "statements": ("s.pdf", b"%PDF")})
    assert r.status_code == 400 and r.json()["error"]["code"] == "INVALID_FILE_TYPE"


def test_memo_falls_back_to_template_without_key():
    pkg = client.get("/api/applications/demo/package").json()
    memo = client.post("/api/memo", json=pkg).json()
    assert memo["source"] == "template" and "## What needs investigation" in memo["memo_markdown"]


def test_flags_carry_params_for_client_wording(report):
    flags = {f["type"]: f for f in report["flags"]}
    assert all(isinstance(f["params"], dict) for f in report["flags"])
    rp = flags["related_party"]["params"]
    assert rp["customer"] and 0 < rp["share"] < 1 and rp["reasons"]
    assert rp["returned_pct"] is None or 0 < rp["returned_pct"] <= 1
    assert flags["duplicates"]["params"]["count"] == 3
    sp = flags["stopped_paying"]["params"]
    assert sp["count"] == len(flags["stopped_paying"]["evidence"]) and sp["amount"] > 0


def test_memo_language():
    pkg = client.get("/api/applications/demo/package").json()
    ar = client.post("/api/memo", json={**pkg, "lang": "ar"}).json()
    assert ar["source"] == "template" and "## ما يحتاج إلى تحقق" in ar["memo_markdown"]
    en = client.post("/api/memo", json={**pkg, "lang": "en"}).json()
    assert "## What needs investigation" in en["memo_markdown"]


def test_upload_flow_matches_demo(report):
    stmts = sorted((DATA / "statements").glob("*.pdf"))
    files = [("invoices", ("inv.xlsx", (DATA / "invoices_2025-10_to_2026-09.xlsx").read_bytes()))]
    files += [("statements", (p.name, p.read_bytes())) for p in stmts]
    files += [("customers", ("customers.csv", (DATA / "customers.csv").read_bytes())),
              ("organization", ("organization.json", (DATA / "organization.json").read_bytes()))]
    r = client.post("/api/analyze", files=files)
    assert r.status_code == 200
    assert r.json()["metrics"]["match_rate"] == report["metrics"]["match_rate"]
