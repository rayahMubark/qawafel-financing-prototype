# Assumptions

Global assumptions from the written answers apply here: working-capital loan, one bank partner, the bank decides, 12 months minimum, AI extraction with human review, all amounts in SAR. Below are the assumptions specific to the sample data and the prototype.

## The applicant (synthetic)

| Item | Assumption | Because |
|---|---|---|
| Business | Nakheel Al-Wadi Trading Est., a Riyadh food/FMCG wholesaler | Food wholesale is a large SME segment with clear seasonality and B2B credit terms |
| Size | About SAR 14.6M net sales a year (SAR 1.2M a month) | A typical SME wholesaler that would seek working-capital finance |
| Period | 1 Oct 2025 to 30 Sep 2026 | The 12 months before an application made in October 2026 |
| Bank accounts | Two accounts at two fictional banks (Rimal Bank, Najd Commercial Bank) | SMEs often split collections across banks; it tests multi-account coverage |
| Existing debt | SAR 38,500 monthly vehicle-fleet finance installment | Banks need existing obligations; it shows they can be detected from debits |

## Sales pattern

| Item | Assumption | Because |
|---|---|---|
| Seasonality | Jan +18%, Feb +32% (pre-Ramadan stock-up), Apr -14% (post-Eid), Jul -16% (summer), Aug/Sep recovery | Saudi FMCG demand peaks before Ramadan and dips in summer |
| Growth | 0.8% a month underlying growth | A healthy but unremarkable business |
| Calendar | Invoices only on Sun-Thu; none on Founding Day, National Day or the two Eids | Saudi working week and public holidays |
| VAT | 15% on every SAR invoice; export invoices zero-rated | ZATCA standard rate |

## Customers (36) and how they pay

| Segment | Share of sales | Terms | Payment behaviour |
|---|---|---|---|
| 4 supermarket chains | ~38% | 45-60 days | One transfer per monthly statement ("STMT NOV2025"), paying many invoices at once |
| 10 supermarkets | ~30% | 30 days | Per invoice; 55% quote the invoice number; 10% pay in two parts |
| 6 hotels and caterers | ~11% | 45 days | Slower payers; one (Al Majd Catering) stops paying from mid-June 2026 |
| 14 groceries | ~10% | Cash or 15 days | 8 pay cash, deposited as one weekly cash deposit |
| 1 related company | ~9% | 30 days | Pays on time, then 70-90% of each payment is transferred back within days |
| 1 Bahrain importer | ~1% | 30 days | Invoiced in USD, pays in SAR minus a SAR 45 bank charge |

Customer names appear in Arabic or English on invoices (as stored in the accounting system) and as abbreviated English on bank statements (e.g. "Lulu Al Wadi Markets" becomes "LULUAT AL WADI MKTS"). Supplier, payroll, GOSI, rent, utilities and VAT payments are generated so balances stay realistic and never go negative.

## Planted issues and where the prototype catches them

| Issue (from Task 1C) | Planted | Caught by |
|---|---|---|
| Duplicate invoice rows | 3 rows pasted twice | Loader: removed and flagged |
| Credit notes / returns | 42 credit notes (2.5%) | Loader: netted against the original invoice |
| Foreign currency | 2 USD invoices | Converted at 3.75, original kept, matched within 2% |
| Entity mismatch | 3 invoices under a sister company's VAT number | Excluded from sales and flagged |
| Many invoices, one payment | Monthly statements and weekly cash deposits | Statement and cash-batch matching |
| Partial payments | ~10% of supermarket invoices | One-to-many allocation |
| Name variants | Arabic invoices vs abbreviated English bank names | Distinctive-word name scoring; low scores go to human review |
| Customer stopped paying | Al Majd Catering, from mid-June 2026 | "Stopped paying" flag |
| Related-party sales | Wadi Retail Co.: shared phone, address, owner family name, recent CR, money sent back | Related-party flag with the return transfers as evidence |
| Concentration | Top 5 customers 48% | Concentration flag |
| Edited PDF | Not planted | Every statement row is checked against the running balance |
| Activity gap / pre-application spike | Not planted (healthy case) | Checks run and stay silent |

## Prototype assumptions

| Item | Assumption | Because |
|---|---|---|
| Statement parsing | One parser per bank template; the two sample layouts are supported | Real banks differ; a template registry with AI fallback is the production path |
| Collectible invoices | An invoice counts toward the match rate once it is 30 days past its due date | Avoids penalising invoices customers are not yet expected to pay |
| Matching order | Quoted invoice number, then statement month, then exact amount, then oldest-first | Strong evidence first; oldest-first is the receivables convention |
| Name matching | Score of 0.80 or more is accepted; 0.65 to 0.80 is accepted tentatively and sent to review | Wrong links are worse than missing ones |
| Thresholds | Match rate below 85% warning, below 70% critical; top 5 above 40% or top customer above 20% warning; invoices over SAR 10,000 listed | Starting points to be agreed with the bank partner |
| Related party | Flagged when two or more registry signals agree | One shared field can be coincidence |
| AI memo | Claude sees only the computed package, never raw files, and may not recommend a decision | Keeps the bank as decision-maker and limits data shared with the model |
| Ground truth | The generator records which payment paid which invoice | Lets the matcher be measured, not just demonstrated |
