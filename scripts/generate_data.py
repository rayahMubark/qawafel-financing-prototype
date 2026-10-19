"""
Generate a realistic, fully synthetic 12-month dataset for one SME wholesaler.

Outputs (in data/):
  organization.json                      applicant profile and declared bank accounts
  customers.csv                          customer master exported from the accounting system,
                                         plus simulated commercial-registry fields
  invoices_2025-10_to_2026-09.xlsx       12 months of sales invoices (the Excel the SME uploads)
  statements/<bank>_<YYYY-MM>.pdf        monthly bank statements for 2 accounts (the PDFs the SME uploads)
  _ground_truth_allocations.csv          which bank credit paid which invoice (used ONLY to score the matcher)

Every name, number and bank is fictional. Run:  python scripts/generate_data.py
"""
from __future__ import annotations

import csv
import json
import math
import random
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet

SEED = 42
rng = random.Random(SEED)

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
PERIOD_START = date(2025, 10, 1)
PERIOD_END = date(2026, 9, 30)
VAT_RATE = 0.15
USD_SAR = 3.75

# Base monthly sales (SAR, excluding VAT) and Saudi seasonality for a food/FMCG wholesaler.
BASE_MONTHLY_SALES = 1_150_000
SEASONALITY = {
    (2025, 10): 1.00, (2025, 11): 0.98, (2025, 12): 1.02,
    (2026, 1): 1.18,  # pre-Ramadan stock-up
    (2026, 2): 1.32,  # Ramadan starts ~18 Feb
    (2026, 3): 1.05,  # Ramadan ends, Eid al-Fitr ~20 Mar
    (2026, 4): 0.86,  # post-Eid slowdown
    (2026, 5): 1.06,  # pre-Eid al-Adha (~26 May)
    (2026, 6): 0.90,
    (2026, 7): 0.84,  # summer travel
    (2026, 8): 0.97,  # back to school
    (2026, 9): 1.03,
}
MONTHLY_GROWTH = 0.008
HOLIDAYS = {date(2026, 2, 22), date(2026, 9, 23)} | {date(2026, 3, 20) + timedelta(d) for d in range(4)} | {
    date(2026, 5, 26) + timedelta(d) for d in range(4)}

ORG = {
    "legal_name": "Nakheel Al-Wadi Trading Est.",
    "legal_name_ar": "مؤسسة نخيل الوادي للتجارة",
    "trade_names": ["Nakheel Al-Wadi", "NW Foods"],
    "cr_number": "1010999001",
    "vat_number": "399999000100003",
    "city": "Riyadh",
    "address": "Al Sulay Industrial Area, Street 14, Warehouse 7, Riyadh",
    "phone": "+966 11 555 0142",
    "owners": ["Fahad S. Al-Mutlaq"],
    "sector": "Food and FMCG wholesale",
    "bank_accounts": [
        {"bank": "Rimal Bank", "iban": "SA0399000000001234567001", "holder": "NAKHEEL AL-WADI TRADING EST", "code": "rimal"},
        {"bank": "Najd Commercial Bank", "iban": "SA7188000000009876543002", "holder": "NAKHEEL AL-WADI TRADING EST", "code": "najd"},
    ],
    "sister_entity": {"legal_name": "Nakheel Al-Wadi Logistics Co.", "vat_number": "399999000200003"},
    "note": "Synthetic applicant. Not a real company.",
}


@dataclass
class Customer:
    cid: str
    name_en: str
    name_ar: str
    segment: str            # key_account | supermarket | grocery | horeca | related | export
    share: float            # share of annual sales
    terms: int              # payment terms in days (0 = cash)
    behaviour: str          # grouped | per_invoice | cash | slow | defaulter | usd
    invoices_per_month: tuple[int, int]
    account: str            # which of the SME's accounts this customer pays into
    bank_names: list[str]   # how the name appears on bank statements
    invoice_name_lang: str  # ar | en  (how the accounting system stores the name)
    vat: str = ""
    cr: str = ""
    phone: str = ""
    address: str = ""
    shareholders: str = ""
    registered: str = ""
    partial_rate: float = 0.0


def vat_no(i: int) -> str:
    return f"3{100000000 + i * 7919:09d}00003"[:15]


def cr_no(i: int) -> str:
    return f"10{10500000 + i * 337:08d}"


def build_customers() -> list[Customer]:
    c: list[Customer] = []

    def add(name_en, name_ar, segment, share, terms, behaviour, ipm, account, bank_names, lang, **kw):
        i = len(c) + 1
        cust = Customer(f"C{i:03d}", name_en, name_ar, segment, share, terms, behaviour, ipm, account,
                        bank_names, lang, **kw)
        if segment != "grocery" or rng.random() < 0.5:
            cust.vat = cust.vat or vat_no(i)
        cust.cr = cust.cr or cr_no(i)
        cust.phone = cust.phone or f"+966 11 {rng.randint(200, 899)} {rng.randint(1000, 9999)}"
        cust.address = cust.address or f"{rng.choice(['Al Malqa', 'Al Naseem', 'Al Rawdah', 'Al Aziziyah', 'Al Yasmin', 'Al Shifa', 'Al Olaya', 'Dhahrat Laban'])}, Riyadh"
        cust.shareholders = cust.shareholders or rng.choice(
            ["Abdullah K. Al-Harbi", "Saad M. Al-Otaibi", "Nasser A. Al-Dosari", "Khalid I. Al-Shehri",
             "Majed T. Al-Zahrani", "Turki F. Al-Subaie", "Omar H. Al-Ghamdi", "Yousef R. Al-Anazi"])
        cust.registered = cust.registered or f"{rng.randint(2004, 2019)}-{rng.randint(1, 12):02d}-15"
        c.append(cust)

    # Key accounts: big supermarket chains, 60-day terms, pay one transfer per monthly statement.
    add("Rawabi Hypermarkets Co.", "شركة روابي للأسواق الكبرى", "key_account", 0.13, 60, "grouped", (9, 12), "rimal",
        ["RAWABI HYPERMARKETS CO", "RAWABI HYPERMARKETS", "RAWABI HYPER MKT CO"], "ar")
    add("Sadeem Markets Co.", "شركة أسواق سديم", "key_account", 0.10, 60, "grouped", (8, 11), "rimal",
        ["SADEEM MARKETS CO", "SADEEM MARKETS COMPANY"], "en")
    add("Bayt Al Khair Supermarkets", "أسواق بيت الخير", "key_account", 0.08, 60, "grouped", (7, 10), "najd",
        ["BAYT ALKHAIR SUPERMARKETS", "BAYT AL KHAIR SPRMKT"], "ar")
    add("Lulu Al Wadi Markets", "أسواق لؤلؤة الوادي", "key_account", 0.07, 45, "grouped", (6, 9), "rimal",
        ["LULU ALWADI MARKETS", "LULUAT AL WADI MKTS"], "ar")

    # Related party: owned by the applicant's owner, shares the applicant's phone. Pays on time,
    # then a large part of the money is transferred back out shortly after.
    add("Wadi Retail Co.", "شركة الوادي للتجزئة", "related", 0.09, 30, "per_invoice", (5, 7), "najd",
        ["WADI RETAIL CO", "WADI RETAIL COMPANY"], "en",
        phone=ORG["phone"], address="Al Sulay Industrial Area, Street 14, Riyadh",
        shareholders="Fahad S. Al-Mutlaq; Noura F. Al-Mutlaq", registered="2025-06-02")

    supermarkets = [
        ("Al Fursan Markets", "أسواق الفرسان", "AL FURSAN MARKETS"),
        ("Nojoom Al Riyadh Supermarket", "سوبرماركت نجوم الرياض", "NOJOOM ALRIYADH SUPERMKT"),
        ("Al Badr Mini Market Chain", "سلسلة أسواق البدر", "AL BADR MARKETS"),
        ("Hayat Fresh Markets", "أسواق حياة الطازجة", "HAYAT FRESH MARKETS"),
        ("Al Muntazah Markets", "أسواق المنتزه", "AL MUNTAZAH MARKETS"),
        ("Qimmat Al Jawda Supermarket", "سوبرماركت قمة الجودة", "QIMMAT ALJAWDA SPRMKT"),
        ("Dar Al Tawfeer Markets", "أسواق دار التوفير", "DAR ALTAWFEER MKTS"),
        ("Al Waha Family Markets", "أسواق الواحة العائلية", "ALWAHA FAMILY MARKETS"),
        ("Rukn Al Bait Supermarket", "سوبرماركت ركن البيت", "RUKN ALBAIT SUPERMARKET"),
        ("Sahat Al Tasawuq Markets", "أسواق ساحة التسوق", "SAHAT ALTASAWUQ MKTS"),
    ]
    sm_shares = [0.045, 0.04, 0.035, 0.032, 0.03, 0.026, 0.024, 0.022, 0.02, 0.018]
    for (en, ar, bn), sh in zip(supermarkets, sm_shares):
        add(en, ar, "supermarket", sh, 30, "per_invoice", (3, 6), rng.choice(["rimal", "rimal", "najd"]),
            [bn, bn.replace("MARKETS", "MKTS")], rng.choice(["ar", "ar", "en"]), partial_rate=0.10)

    horeca = [
        ("Najd Palace Hotel", "فندق قصر نجد", "NAJD PALACE HOTEL", "slow"),
        ("Saffron House Restaurants", "مطاعم بيت الزعفران", "SAFFRON HOUSE REST", "slow"),
        ("Al Majd Catering Co.", "شركة المجد للإعاشة", "AL MAJD CATERING CO", "defaulter"),
        ("Tala Hospitality Group", "مجموعة تالا للضيافة", "TALA HOSPITALITY GRP", "per_invoice"),
        ("Burj Al Diyafa Catering", "برج الضيافة للتموين", "BURJ ALDIYAFA CATERING", "slow"),
        ("Al Areen Restaurants", "مطاعم العرين", "AL AREEN RESTAURANTS", "per_invoice"),
    ]
    hr_shares = [0.022, 0.02, 0.024, 0.016, 0.014, 0.012]
    for (en, ar, bn, beh), sh in zip(horeca, hr_shares):
        add(en, ar, "horeca", sh, 45, beh, (2, 5), "rimal", [bn], "en")

    groceries = [
        ("Baqalat Al Hayy", "بقالة الحي"), ("Baqalat Al Amanah", "بقالة الأمانة"),
        ("Baqalat Nour Al Sabah", "بقالة نور الصباح"), ("Baqalat Al Rayyan", "بقالة الريان"),
        ("Baqalat Al Salam", "بقالة السلام"), ("Baqalat Ibn Khaldun St.", "بقالة شارع ابن خلدون"),
        ("Baqalat Al Nakheel Al Saghira", "بقالة النخيل الصغيرة"), ("Baqalat Al Diyar", "بقالة الديار"),
        ("Baqalat Waha Al Shamal", "بقالة واحة الشمال"), ("Baqalat Al Furqan", "بقالة الفرقان"),
        ("Baqalat Al Rabwa", "بقالة الربوة"), ("Baqalat Al Murjan", "بقالة المرجان"),
        ("Baqalat Al Yaqoot", "بقالة الياقوت"), ("Baqalat Al Rimal", "بقالة الرمال"),
    ]
    for k, (en, ar) in enumerate(groceries):
        cash = k < 8
        add(en, ar, "grocery", 0.0075 if cash else 0.0065, 0 if cash else 15, "cash" if cash else "per_invoice",
            (2, 4), "rimal", [en.upper().replace("BAQALAT", "BAQALA")], "ar")

    # Export customer in Bahrain, invoiced in USD.
    add("Gulf Pantry W.L.L.", "جلف بانتري", "export", 0.012, 30, "usd", (0, 1), "najd",
        ["GULF PANTRY WLL BAHRAIN"], "en", address="Manama, Bahrain", vat="")

    total = sum(x.share for x in c)
    for x in c:
        x.share /= total
    return c


def business_days(y: int, m: int) -> list[date]:
    d = date(y, m, 1)
    out = []
    while d.month == m:
        if d.weekday() not in (4, 5) and d not in HOLIDAYS:  # Fri, Sat weekend
            out.append(d)
        d += timedelta(1)
    return out


def next_business_day(d: date) -> date:
    while d.weekday() in (4, 5) or d in HOLIDAYS:
        d += timedelta(1)
    return d


@dataclass
class Invoice:
    number: str
    issue: date
    due: date
    customer: Customer
    kind: str                 # Invoice | Credit Note
    currency: str
    net: float                # excl. VAT, in invoice currency
    vat: float
    seller_vat: str
    ref: str = ""
    payments: list = field(default_factory=list)  # (date, amount_sar) of ground-truth payments


@dataclass
class Txn:
    account: str
    day: date
    description: str
    ref: str
    debit: float = 0.0
    credit: float = 0.0
    counterparty: str = ""


def money(x: float) -> float:
    return round(x + 1e-9, 2)


def split_amount(total: float, k: int) -> list[float]:
    weights = [rng.lognormvariate(0, 0.45) for _ in range(k)]
    s = sum(weights)
    parts = [money(total * w / s) for w in weights]
    parts[-1] = money(total - sum(parts[:-1]))
    return parts


def generate():
    customers = build_customers()
    invoices: list[Invoice] = []
    seq = {2025: 0, 2026: 0}

    def next_no(d: date) -> str:
        seq[d.year] += 1
        return f"INV-{d.year % 100}-{seq[d.year]:04d}"

    months = [(2025, m) for m in (10, 11, 12)] + [(2026, m) for m in range(1, 10)]
    for idx, (y, m) in enumerate(months):
        days = business_days(y, m)
        month_target = BASE_MONTHLY_SALES * SEASONALITY[(y, m)] * (1 + MONTHLY_GROWTH) ** idx
        month_invoices = []
        for cu in customers:
            lo, hi = cu.invoices_per_month
            k = rng.randint(lo, hi)
            if cu.behaviour == "usd":
                k = 1 if (y, m) in [(2026, 2), (2026, 6)] else 0
            if k == 0:
                continue
            cust_total = month_target * cu.share * rng.uniform(0.85, 1.15)
            if cu.behaviour == "usd":
                cust_total = month_target * cu.share * 6  # two larger shipments a year
            for amount in split_amount(cust_total, k):
                d = rng.choice(days)
                currency = "USD" if cu.behaviour == "usd" else "SAR"
                net = money(amount / USD_SAR) if currency == "USD" else amount
                net = max(net, 350.0)
                month_invoices.append(Invoice("", d, d + timedelta(cu.terms), cu, "Invoice", currency, net,
                                              money(net * VAT_RATE) if currency == "SAR" else 0.0, ORG["vat_number"]))
        month_invoices.sort(key=lambda i: i.issue)
        for inv in month_invoices:
            inv.number = next_no(inv.issue)
        invoices.extend(month_invoices)

    # Three invoices issued under the sister entity's VAT number (entity mismatch).
    for inv in rng.sample([i for i in invoices if i.customer.segment == "supermarket"], 3):
        inv.seller_vat = ORG["sister_entity"]["vat_number"]

    # Credit notes for returns / damaged goods on ~2.5% of invoices.
    credit_notes = []
    for inv in rng.sample([i for i in invoices if i.currency == "SAR"], int(len(invoices) * 0.025)):
        d = next_business_day(inv.issue + timedelta(rng.randint(5, 20)))
        if d > PERIOD_END:
            continue
        net = money(-inv.net * rng.uniform(0.08, 0.35))
        credit_notes.append(Invoice("", d, d, inv.customer, "Credit Note", "SAR", net, money(net * VAT_RATE),
                                    ORG["vat_number"], ref=inv.number))
    credit_notes.sort(key=lambda x: x.issue)
    for cn in credit_notes:
        cn.number = f"CN-{cn.issue.year % 100}-{credit_notes.index(cn) + 1:04d}"
    cn_by_ref = {cn.ref: cn for cn in credit_notes}

    # ---------------- payments (ground truth) ----------------
    txns: list[Txn] = []
    truth: list[dict] = []
    ref_counter = [0]

    def bank_ref(acct: str, d: date) -> str:
        ref_counter[0] += 1
        prefix = "RB" if acct == "rimal" else "NC"
        return f"{prefix}{d:%y%m%d}{ref_counter[0]:05d}"

    def gross_due(inv: Invoice) -> float:
        g = inv.net + inv.vat
        cn = cn_by_ref.get(inv.number)
        if cn:
            g += cn.net + cn.vat
        return money(g)

    def pay(cu: Customer, d: date, amount: float, allocations: list[tuple[Invoice, float]], desc_extra: str = ""):
        d = next_business_day(d)
        if d > PERIOD_END:
            return
        name = rng.choice(cu.bank_names)
        ref = bank_ref(cu.account, d)
        kind = rng.choice(["SARIE TRF FROM", "INCOMING TRF", "B2B TRF FROM"])
        desc = f"{kind} {name}{(' ' + desc_extra) if desc_extra else ''}"
        txns.append(Txn(cu.account, d, desc, ref, credit=money(amount), counterparty=name))
        for inv, a in allocations:
            truth.append({"invoice_number": inv.number, "bank_ref": ref, "amount_sar": money(a)})
            inv.payments.append((d, a))

    sales = [i for i in invoices if i.kind == "Invoice"]
    by_cust: dict[str, list[Invoice]] = {}
    for inv in sales:
        by_cust.setdefault(inv.customer.cid, []).append(inv)

    for cu in customers:
        invs = by_cust.get(cu.cid, [])
        if cu.behaviour == "grouped":
            groups: dict[tuple[int, int], list[Invoice]] = {}
            for inv in invs:
                groups.setdefault((inv.issue.year, inv.issue.month), []).append(inv)
            for (y, m), g in groups.items():
                month_end = date(y + (m == 12), m % 12 + 1, 1) - timedelta(1)
                d = month_end + timedelta(cu.terms + rng.randint(-6, 8))
                amt = sum(gross_due(i) for i in g)
                pay(cu, d, amt, [(i, gross_due(i)) for i in g], f"STMT {date(y, m, 1):%b%Y}".upper())
        elif cu.behaviour == "cash":
            pass  # handled below with weekly cash deposits
        elif cu.behaviour == "usd":
            for inv in invs:
                d = inv.issue + timedelta(cu.terms + rng.randint(0, 10))
                fee = 45.0
                pay(cu, d, inv.net * USD_SAR - fee, [(inv, inv.net * USD_SAR - fee)], f"INV {inv.number}")
        else:
            for inv in invs:
                if cu.behaviour == "defaulter" and inv.issue >= date(2026, 6, 15):
                    continue  # stopped paying
                lag = {"slow": rng.gauss(28, 12), "defaulter": rng.gauss(20, 8)}.get(cu.behaviour, rng.gauss(4, 7))
                d = inv.issue + timedelta(max(cu.terms + int(lag), 3))
                amt = gross_due(inv)
                ref_txt = f"INV {inv.number}" if rng.random() < 0.55 else ""
                if rng.random() < cu.partial_rate:
                    first = money(amt * rng.choice([0.5, 0.6, 0.7]))
                    pay(cu, d, first, [(inv, first)], ref_txt)
                    pay(cu, d + timedelta(rng.randint(10, 25)), amt - first, [(inv, amt - first)], ref_txt)
                else:
                    pay(cu, d, amt, [(inv, amt)], ref_txt)

    # Weekly cash deposits for cash-paying groceries (collected by the driver, deposited each Sunday).
    cash_invs = sorted([i for i in sales if i.customer.behaviour == "cash"], key=lambda i: i.issue)
    week: dict[date, list[Invoice]] = {}
    for inv in cash_invs:
        sunday = inv.issue + timedelta((6 - inv.issue.weekday()) % 7 or 7)
        week.setdefault(sunday, []).append(inv)
    for sunday, g in sorted(week.items()):
        d = next_business_day(sunday)
        if d > PERIOD_END:
            continue
        ref = bank_ref("rimal", d)
        total = sum(gross_due(i) for i in g)
        txns.append(Txn("rimal", d, "CASH DEPOSIT - CDM AL SULAY BRANCH", ref, credit=money(total), counterparty=""))
        for inv in g:
            truth.append({"invoice_number": inv.number, "bank_ref": ref, "amount_sar": gross_due(inv)})
            inv.payments.append((d, gross_due(inv)))

    # Round-tripping: part of every related-party receipt goes back to the related party.
    for t in [t for t in txns if "WADI RETAIL" in t.description and t.credit]:
        d = next_business_day(t.day + timedelta(rng.randint(1, 4)))
        if d <= PERIOD_END:
            txns.append(Txn(t.account, d, "OUTGOING TRF TO WADI RETAIL CO - SETTLEMENT", bank_ref(t.account, d),
                            debit=money(t.credit * rng.uniform(0.7, 0.9)), counterparty="WADI RETAIL CO"))

    # ---------------- operating debits ----------------
    suppliers = ["HIJAZ FOOD INDUSTRIES", "GOLDEN GRAIN MILLS CO", "ARABIAN DAIRY SUPPLY", "SAHRA OILS FACTORY",
                 "NORTHERN PACKAGING CO", "AL QASSIM DATES CO"]
    opening = {"rimal": 620_000.0, "najd": 240_000.0}
    floor = {"rimal": 120_000.0, "najd": 60_000.0}

    def add_fixed(acct, d, desc, amt, cp=""):
        d = next_business_day(d)
        if d <= PERIOD_END:
            txns.append(Txn(acct, d, desc, bank_ref(acct, d), debit=money(amt), counterparty=cp))

    for (y, m) in months:
        add_fixed("rimal", date(y, m, 27), "PAYROLL WPS SALARIES", rng.uniform(92_000, 99_000))
        add_fixed("rimal", date(y, m, 12), "GOSI CONTRIBUTION", 12_840.00, "GOSI")
        add_fixed("rimal", date(y, m, 5), "SEC ELECTRICITY BILL", rng.uniform(5_200, 9_800), "SAUDI ELECTRICITY")
        add_fixed("najd", date(y, m, 1) + timedelta(rng.randint(0, 3)), "STC BUSINESS BILL", rng.uniform(1_800, 2_600), "STC")
        add_fixed("rimal", date(y, m, 15), "FINANCE INSTALLMENT - VEHICLE FLEET", 38_500.00, "RIMAL BANK FINANCE")
        if m in (1, 4, 7, 10):
            add_fixed("rimal", date(y, m, 3), "WAREHOUSE RENT - QUARTERLY", 180_000.00, "AL SULAY REAL ESTATE")
            add_fixed("rimal", date(y, m, 25), "ZATCA VAT PAYMENT", rng.uniform(52_000, 71_000), "ZATCA")

    # Supplier payments: weekly, sized from the previous week's receipts, never breaching a cash floor.
    txns.sort(key=lambda t: (t.day, t.ref))
    for acct in ("rimal", "najd"):
        d = PERIOD_START + timedelta(3)
        while d <= PERIOD_END:
            prev = [t for t in txns if t.account == acct and d - timedelta(7) <= t.day < d]
            inflow = sum(t.credit for t in prev)
            bal = opening[acct] + sum(t.credit - t.debit for t in txns if t.account == acct and t.day < d)
            spend = min(inflow * rng.uniform(0.74, 0.86), max(bal - floor[acct], 0))
            if spend > 5_000:
                parts = split_amount(spend, rng.randint(1, 3))
                for p in parts:
                    s = rng.choice(suppliers)
                    txns.append(Txn(acct, next_business_day(d), f"SARIE TRF TO {s}", bank_ref(acct, d), debit=p, counterparty=s))
            d += timedelta(7)

    txns = [t for t in txns if PERIOD_START <= t.day <= PERIOD_END]
    txns.sort(key=lambda t: (t.account, t.day, t.ref))
    return customers, invoices, credit_notes, txns, truth, opening


# ---------------- writers ----------------
def write_customers(customers: list[Customer]):
    with open(DATA / "customers.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["customer_id", "name_en", "name_ar", "vat_number", "cr_number", "segment", "payment_terms_days",
                    "phone", "address", "registry_shareholders", "registry_registered_on"])
        for c in customers:
            w.writerow([c.cid, c.name_en, c.name_ar, c.vat, c.cr, c.segment, c.terms, c.phone, c.address,
                        c.shareholders, c.registered])


def write_invoices_xlsx(invoices: list[Invoice], credit_notes: list[Invoice]):
    rows = sorted(invoices + credit_notes, key=lambda i: (i.issue, i.number))
    # Three accidental duplicate rows, as happens when two exports are pasted together.
    dups = rng.sample([r for r in rows if r.kind == "Invoice"], 3)
    wb = Workbook()
    ws = wb.active
    ws.title = "Sales Invoices"
    ws.append(["Nakheel Al-Wadi Trading Est. | Sales invoice register | 01/10/2025 - 30/09/2026"])
    ws.append([])
    header = ["Invoice No", "Invoice Date", "Due Date", "Customer Name", "Customer VAT No", "Seller VAT No",
              "Document Type", "Reference Invoice", "Currency", "Amount (excl. VAT)", "VAT 15%", "Total"]
    ws.append(header)
    for c in ws[3]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="2F4F4F")
        c.alignment = Alignment(horizontal="center")
    out = rows + dups
    for r in out:
        name = r.customer.name_ar if r.customer.invoice_name_lang == "ar" else r.customer.name_en
        ws.append([r.number, r.issue.strftime("%d/%m/%Y"), r.due.strftime("%d/%m/%Y"), name, r.customer.vat or None,
                   r.seller_vat, r.kind, r.ref or None, r.currency, r.net, r.vat, money(r.net + r.vat)])
    for col, width in zip("ABCDEFGHIJKL", [14, 12, 12, 32, 18, 18, 14, 16, 9, 18, 12, 14]):
        ws.column_dimensions[col].width = width
    for row in ws.iter_rows(min_row=4, min_col=10, max_col=12):
        for c in row:
            c.number_format = "#,##0.00"
    ws.freeze_panes = "A4"
    wb.save(DATA / "invoices_2025-10_to_2026-09.xlsx")
    return len(out)


def write_statement_pdfs(txns: list[Txn], opening: dict):
    styles = getSampleStyleSheet()
    names = {a["code"]: a for a in ORG["bank_accounts"]}
    for acct in ("rimal", "najd"):
        bal = opening[acct]
        a = names[acct]
        d = PERIOD_START
        while d <= PERIOD_END:
            y, m = d.year, d.month
            month_txns = [t for t in txns if t.account == acct and t.day.year == y and t.day.month == m]
            open_bal = bal
            body = [["Date", "Description", "Reference", "Debit", "Credit", "Balance"]]
            for t in month_txns:
                bal = money(bal + t.credit - t.debit)
                body.append([t.day.strftime("%d/%m/%Y"), t.description[:52], t.ref,
                             f"{t.debit:,.2f}" if t.debit else "", f"{t.credit:,.2f}" if t.credit else "", f"{bal:,.2f}"])
            path = DATA / "statements" / f"{acct}_{y}-{m:02d}.pdf"
            doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=12 * mm, rightMargin=12 * mm,
                                    topMargin=14 * mm, bottomMargin=14 * mm,
                                    title=f"{a['bank']} statement {y}-{m:02d}")
            last_day = (date(y + (m == 12), m % 12 + 1, 1) - timedelta(1))
            head = [
                Paragraph(f"<b>{a['bank']}</b> - Corporate Account Statement", styles["Title"]),
                Paragraph("SYNTHETIC SAMPLE - NOT A REAL BANK DOCUMENT", styles["Normal"]),
                Paragraph(f"Account holder: {a['holder']}", styles["Normal"]),
                Paragraph(f"IBAN: {a['iban']}", styles["Normal"]),
                Paragraph(f"Statement period: {date(y, m, 1):%d/%m/%Y} - {last_day:%d/%m/%Y}", styles["Normal"]),
                Paragraph(f"Opening balance: SAR {open_bal:,.2f}", styles["Normal"]),
                Spacer(1, 6),
            ]
            tbl = Table(body, colWidths=[18 * mm, 76 * mm, 26 * mm, 20 * mm, 22 * mm, 24 * mm], repeatRows=1)
            tbl.setStyle(TableStyle([
                ("FONT", (0, 0), (-1, -1), "Helvetica", 6.5),
                ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 7),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8ECEF")),
                ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#B0B8BF")),
            ]))
            tail = [Spacer(1, 6), Paragraph(f"Closing balance: SAR {bal:,.2f}", styles["Normal"])]
            doc.build(head + [tbl] + tail)
            d = date(y + (m == 12), m % 12 + 1, 1)


def main():
    (DATA / "statements").mkdir(parents=True, exist_ok=True)
    customers, invoices, credit_notes, txns, truth, opening = generate()
    write_customers(customers)
    n_rows = write_invoices_xlsx(invoices, credit_notes)
    write_statement_pdfs(txns, opening)
    org = dict(ORG)
    org["bank_accounts"] = [{**a, "opening_balance_2025_10_01": opening[a["code"]]} for a in ORG["bank_accounts"]]
    (DATA / "organization.json").write_text(json.dumps(org, ensure_ascii=False, indent=2), encoding="utf-8")
    with open(DATA / "_ground_truth_allocations.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["invoice_number", "bank_ref", "amount_sar"])
        w.writeheader()
        w.writerows(truth)
    net_sales = sum(i.net * (USD_SAR if i.currency == "USD" else 1) for i in invoices + credit_notes)
    print(f"customers={len(customers)} invoice_rows={n_rows} credit_notes={len(credit_notes)} "
          f"bank_txns={len(txns)} truth_links={len(truth)} net_sales_SAR={net_sales:,.0f}")


if __name__ == "__main__":
    main()
