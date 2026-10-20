"use strict";

const API = "/api";
const PAGE = 25;
const TABS = ["overview", "revenue", "customers", "invoices", "memo", "built"];
const state = {
  lang: "ar", tab: "overview", report: null, source: "sample", files: null,
  status: "all", search: "", min: 0, page: 0, evidence: null, showAllCustomers: false,
  allocByInv: new Map(), creditByRef: new Map(), memo: null, uploads: null,
};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icon = (name, cls = "") => `<i class="ph ph-${name} ${cls}" aria-hidden="true"></i>`;
const ltr = (s) => `<bdi dir="ltr" class="ltr">${esc(s)}</bdi>`;

// ---------- numbers & dates (Western digits in both languages) ----------
const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ar = () => state.lang === "ar";
const money = (x) => ar() ? `${nf0.format(x)} ر.س` : `SAR ${nf0.format(x)}`;
const money2 = (x) => ar() ? `${nf2.format(x)} ر.س` : `SAR ${nf2.format(x)}`;
const moneyShort = (x) => {
  const m = Math.abs(x) >= 1e6;
  const v = m ? (x / 1e6).toFixed(2) : nf0.format(Math.round(x / 1e3));
  return ar() ? `${v} ${m ? "مليون" : "ألف"} ر.س` : `SAR ${v}${m ? "M" : "K"}`;
};
// LRI/PDI keep "9.1%" reading left to right inside Arabic sentences.
const iso = (s) => (ar() ? `\u2066${s}\u2069` : s);
const pct = (x, d = 1) => iso(`${(x * 100).toFixed(d)}%`);
const isoNumbers = (s) => s.replace(/\d{4}-\d{2}(?:-\d{2})?|-?\d[\d,.]*%/g, (m) => `\u2066${m}\u2069`);
const locale = () => (ar() ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB");
const asDate = (s) => new Date((s.length === 7 ? s + "-01" : s) + "T00:00:00");
const monthShort = (m) => asDate(m).toLocaleDateString(locale(), { month: "short", year: "2-digit" });
const monthLong = (m) => asDate(m).toLocaleDateString(locale(), { month: "long", year: "numeric" });
const dateLabel = (d) => (d ? asDate(d).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" }) : "");
// Arabic counted nouns: 1 and 2 have their own forms, 3-10 take the plural, 11+ the singular.
const countAr = (n, [one, two, few, many]) => (n === 1 ? one : n === 2 ? two : n % 100 >= 3 && n % 100 <= 10 ? `${n} ${few}` : `${n} ${many}`);
const count = (n, key) => (ar() ? countAr(n, NOUNS_AR[key]) : `${nf0.format(n)} ${n === 1 ? NOUNS_EN[key][0] : NOUNS_EN[key][1]}`);
const NOUNS_AR = {
  invoice: ["فاتورة واحدة", "فاتورتان", "فواتير", "فاتورة"],
  day: ["يوم واحد", "يومان", "أيام", "يومًا"],
  customer: ["عميل واحد", "عميلان", "عملاء", "عميلًا"],
  transfer: ["تحويل واحد", "تحويلان", "تحويلات", "تحويلًا"],
  statement: ["كشف واحد", "كشفان", "كشوف", "كشفًا"],
  warning: ["تحذير واحد", "تحذيران", "تحذيرات", "تحذيرًا"],
  critical: ["تنبيه حرج واحد", "تنبيهان حرجان", "تنبيهات حرجة", "تنبيهًا حرجًا"],
};
const NOUNS_EN = {
  invoice: ["invoice", "invoices"], day: ["day", "days"], customer: ["customer", "customers"], transfer: ["transfer", "transfers"],
  statement: ["statement", "statements"], warning: ["warning", "warnings"], critical: ["critical", "critical"],
};

// ---------- the one dictionary ----------
const I18N = {
  en: {
    "doc.title": "Financing package review",
    skip: "Skip to content", "brand.sub": "Financing package", "nav.upload": "Analyze your files",
    "short.overview": "Overview", "short.revenue": "Revenue", "short.customers": "Customers", "short.invoices": "Invoices", "short.memo": "Memo", "short.more": "More",
    "g.meterAria": (p) => `${p} confirmed by bank deposits`,
    "g.sparkAria": (a, b, peak, low) => `Net sales by month, ${a} to ${b}. Peak ${peak}, low ${low}.`,
    "src.page": (n) => `page ${n}`, "src.openPdf": (f, n) => `Open ${f} at page ${n} (opens in a new tab)`,
    "src.copy": (r) => `Copy reference ${r}`, "src.copyShort": "Copy reference", "src.copied": "Reference copied",
    "src.xls": (n) => `Download Excel (row ${n})`, "src.hidden": "Columns E to H, J and K are not shown.",
    "q.reviewTitle": "Payments sent to human review", "q.reviewItem": (c, conf) => `Suggested customer: ${c} (name match ${conf})`,
    "lang.group": "Language", "banner.text": "Showing the files you uploaded.", "banner.back": "Back to the sample applicant",
    "glance.title": "At a glance", "tabs.label": "Sections",
    "tab.overview": "Overview", "tab.revenue": "Revenue verification", "tab.customers": "Customers", "tab.invoices": "Invoices", "tab.memo": "Briefing memo", "tab.built": "How it was built",
    "fact.period": "Period", "fact.sector": "Sector", "fact.cr": "CR number", "fact.vat": "VAT number", "fact.none": "Not provided", "app.uploaded": "Uploaded applicant",
    "g.real": "Is the revenue real?", "g.stable": "Is it stable?", "g.attention": "What needs attention?",
    "g.realText": "of invoiced sales now due is confirmed by bank deposits.",
    "g.related": (share) => `Includes ${share} of sales from a possible related party.`,
    "g.critRev": "A critical check on revenue failed. See the flag before relying on this number.",
    "g.stableText": "Average monthly sales, excl. VAT.",
    "g.vary": (cv) => `Varies ${cv} month to month`, "g.peak": (m) => `Peak ${m}`, "g.low": (m) => `Low ${m}`,
    "g.signals": "signals to review", "g.none": "No risk signals were found in these documents.", "g.top": "Most serious:",
    "chart.title": "Monthly sales and what the bank confirms", "chart.note": "Invoiced value per month (incl. VAT), split by whether a matching bank deposit was found.",
    "legend.confirmed": "Confirmed by bank deposit", "legend.pastdue": "Past due, no deposit found", "legend.notdue": "Not yet due",
    "table.show": "Show as table", "table.hide": "Hide table",
    "chart.aria": (a, b) => `Monthly invoiced sales from ${a} to ${b}. Use "Show as table" for exact values.`,
    "tip.invoiced": "Invoiced (incl. VAT)", "tip.confirmed": "Confirmed", "tip.pastdue": "Past due", "tip.notdue": "Not yet due", "tip.share": "Confirmed of amount due",
    "col.month": "Month", "col.net": "Net sales (excl. VAT)", "col.invoiced": "Invoiced (incl. VAT)", "col.confirmed": "Confirmed", "col.pastdue": "Past due", "col.notdue": "Not yet due", "col.inflows": "Money received", "col.balance": "Month-end balance",
    "flags.title": "Needs attention", "flags.note": "Signals for the analyst to judge. Qawafel does not score or decide.",
    "sev.critical": "Critical", "sev.warning": "Warning", "sev.info": "Note",
    "flag.transfers": (n) => `Show the ${n} transfers`, "flag.invoices": (n) => (n === 1 ? "Show the invoice" : `Show the ${n} invoices`), "flag.customers": "Show customers",
    "figs.title": "Key figures", "fig.why": "What this means",
    "rev.title": "How much of the invoiced sales reached the bank", "rev.note": "Only invoices already past their due date can be confirmed. Newer invoices are shown separately.",
    "rev.confirmed": "Confirmed by bank deposits", "rev.pastdue": "Past due, no deposit found", "rev.notdue": "Not yet due", "rev.ofDue": (x) => `of ${x} now due`, "rev.monthly": "Month by month",
    "aging.title": "Unpaid invoices by age", "aging.note": "Outstanding at the end of the period, by days past the due date.",
    "cust.title": "Who pays this business", "cust.note": (n) => `${n}. Payment days are weighted by invoice value.`, "cust.all": "Show all", "cust.top": "Show top 10",
    "cust.name": "Customer", "cust.type": "Type", "cust.share": "Share of sales", "cust.sales": "Net sales", "cust.days": "Days to pay", "cust.overdue": "Past due, unpaid", "cust.signals": "Signals",
    "cust.cash": "Cash", "cust.terms": (d) => `${d}-day terms`,
    "sig.related_party": "Possible related party", "sig.stopped_paying": "Stopped paying",
    "inv.title": "Invoices and the payments behind them", "inv.note": "Open any invoice to see its source row and the bank transfers that paid it.", "inv.filter": "Filter invoices",
    "inv.search": "Customer or invoice number", "inv.searchPh": "e.g. Al Majd or INV-26-0412", "inv.min": "Minimum amount (SAR)",
    "inv.all": "All", "inv.flagged": "From a flag", "inv.no": "Invoice", "inv.customer": "Customer", "inv.amount": "Amount (incl. VAT)", "inv.status": "Status", "inv.timing": "Timing",
    "inv.empty": "No invoices match these filters. Clear the search or choose another status.",
    "inv.count": (a, b, n) => `${a}-${b} of ${nf0.format(n)} invoices`, "inv.zero": "0 invoices", prev: "Previous", next: "Next", "inv.open": "Open",
    "st.matched": "Paid", "st.partial": "Partly paid", "st.unmatched": "No deposit found", "st.not_yet_due": "Not yet due",
    "t.paid": (d) => `Paid in ${d}`, "t.late": (d) => `${d} past due`, "t.due": (d) => `Due ${d}`,
    "if.fx_converted": "Converted from USD", "if.entity_mismatch": "Issued by another company", "if.number_reused": "Invoice number reused",
    "d.invoice": "Invoice", "d.step1": "The invoice", "d.step2": "Where it comes from", "d.step3": "Bank transfers that paid it",
    "d.customer": "Customer", "d.onInvoice": "Name on invoice", "d.issued": "Issued", "d.due": "Due", "d.net": "Net (excl. VAT)", "d.expected": "Expected payment",
    "d.fx": (cur, amt) => `${cur} ${amt} converted at 3.75`, "d.creditNote": (n) => `After credit note ${n}`,
    "d.source": (ref) => `Invoice register, ${ref}`, "d.paid": "Paid", "d.of": (a, b) => `${a} of ${b}`,
    "d.method": (m, c) => `${m} (confidence ${c})`, "d.account": (bank, last4) => `${bank}, account ending ${last4}`, "d.ref": "Ref", "d.page": ", page",
    "d.shared": (x) => `Part of a ${x} transfer that paid several invoices.`,
    "d.none": "No matching deposit was found in the statements.", "d.notDue": "The invoice is not yet due.",
    "d.transfersTitle": "Transfers back to this customer",
    close: "Close",
    "m.reference": "Transfer quotes the invoice number", "m.statement": "Monthly statement payment", "m.exact": "Exact amount match", "m.fifo": "Oldest invoice first", "m.cash_batch": "Weekly cash deposit",
    "memo.title": "Briefing memo", "memo.note": "Drafted by Claude from the verified figures. It summarises evidence and open questions. It does not recommend a decision.",
    "memo.write": "Write memo", "memo.rewrite": "Rewrite memo", "memo.writing": "Writing…", "memo.empty": "No memo yet. Write one from the verified figures in this package.",
    "memo.wait": "Drafting from the verified figures. This can take up to 30 seconds.",
    "memo.claude": (m) => `Written by Claude (${m}) from the verified package. Check figures against the other tabs before relying on it.`,
    "memo.template": "Template memo. No AI key is set on this server.", "memo.templatePlain": "Template memo, built from the verified figures.", "memo.fallback": "AI memo unavailable right now. Showing the template memo.",
    "memo.error": "The memo could not be written.",
    disclaimer: "Prepared by Qawafel from documents supplied by the applicant. Not a credit recommendation.",
    "q.title": "Data checks", "q.note": "What was read, what was cleaned, and what was checked before any figure was shown.",
    "q.rows": "Invoice rows read", "q.rowsSub": (d, c) => `${d} duplicates removed, ${c} credit notes netted`,
    "q.fx": "Invoices in US dollars", "q.fxSub": "Converted at the fixed 3.75 rate",
    "q.entity": "Invoices from another company", "q.entitySub": "Excluded from sales",
    "q.stm": "Bank statements that add up", "q.stmSub": "Every row checked against the running balance", "q.of": (a, b) => `${a} of ${b}`,
    "q.tx": "Bank transactions read", "q.months": "Months covered", "q.monthsOk": "All 12 months of invoices and statements", "q.monthsMissing": "Some months are missing",
    "q.review": "Payer names sent to human review", "q.reviewSub": "Name matches below 80% confidence",
    "q.complete": "Complete", "q.gaps": "Gaps",
    "q.methods": "How payments were matched to invoices", "q.methodsNote": "Share of matched value by method, strongest evidence first.",
    "q.accuracy": "Matching accuracy", "q.accuracyNote": "Measured on the sample data, where the true payment for every invoice is known.",
    "q.precision": "Matches that are correct", "q.precisionTip": "Of all the money the engine matched to invoices, the share matched to the right invoice.",
    "q.recall": "Payments found", "q.recallTip": "Of all the real invoice payments in the statements, the share the engine found.",
    "q.noAccuracy": "Accuracy is only measured on the sample data.",
    "q.sample": "Sample data", "q.sampleNote": "Fully synthetic. The applicant, customers and banks are fictional.", "q.statements": (n) => `Bank statements (${n} PDFs)`,
    "up.title": "Analyze your own files", "up.note": "Statements must use the sample banks' PDF layout. Download the sample files to see the expected format.",
    "up.inv": "Invoices (.xlsx)", "up.stm": "Bank statements (.pdf, up to 36)", "up.cust": "Customer list (.csv, optional)", "up.org": "Applicant profile (.json, optional)",
    "up.cancel": "Cancel", "up.submit": "Analyze files", "up.busy": "Analyzing…", "up.choose": "Choose file", "up.chooseMany": "Choose files", "up.none": "No file chosen", "up.many": (n) => `${n} files chosen`,
    "err.load": "The package could not be loaded.", "err.generic": (s) => `Something went wrong (${s}). Try again.`, "err.network": "Could not reach the server. Check your connection and try again.",
    "err.TOO_MANY_FILES": "Too many statements. Upload at most 36 PDF files.", "err.UPLOAD_TOO_LARGE": "The files are too large. Keep the total under 20 MB.",
    "err.INVALID_FILE_TYPE.inv": "Invoices must be an .xlsx file.", "err.INVALID_FILE_TYPE.stm": "Statements must be PDF files.",
    "err.UNREADABLE_FILE": "One of the files could not be read. Check that it follows the sample layout.",
    "err.APPLICATION_NOT_FOUND": "This application was not found.", "err.INVALID_PACKAGE": "The package is missing data needed for the memo.",
  },
  ar: {
    "doc.title": "مراجعة ملف التمويل",
    skip: "انتقل إلى المحتوى", "brand.sub": "ملف التمويل", "nav.upload": "حلّل ملفاتك",
    "short.overview": "نظرة عامة", "short.revenue": "الإيرادات", "short.customers": "العملاء", "short.invoices": "الفواتير", "short.memo": "المذكرة", "short.more": "المزيد",
    "g.meterAria": (p) => `${p} مؤكدة بإيداعات بنكية`,
    "g.sparkAria": (a, b, peak, low) => `صافي المبيعات شهريًا من ${a} إلى ${b}. الذروة ${peak}، الأدنى ${low}.`,
    "src.page": (n) => `صفحة ${n}`, "src.openPdf": (f, n) => `افتح ${f} على الصفحة ${n} (في علامة تبويب جديدة)`,
    "src.copy": (r) => `انسخ المرجع ${r}`, "src.copyShort": "انسخ المرجع", "src.copied": "نُسخ المرجع",
    "src.xls": (n) => `نزّل ملف Excel (الصف ${n})`, "src.hidden": "الأعمدة من ⁦E⁩ إلى ⁦H⁩ و⁦J⁩ و⁦K⁩ غير معروضة.",
    "q.reviewTitle": "دفعات أُحيلت للمراجعة البشرية", "q.reviewItem": (c, conf) => `العميل المقترح: ${c} (تطابق الاسم ${conf})`,
    "lang.group": "اللغة", "banner.text": "تُعرض الملفات التي رفعتها.", "banner.back": "العودة إلى مقدم الطلب النموذجي",
    "glance.title": "نظرة سريعة", "tabs.label": "الأقسام",
    "tab.overview": "نظرة عامة", "tab.revenue": "التحقق من الإيرادات", "tab.customers": "العملاء", "tab.invoices": "الفواتير", "tab.memo": "مذكرة الإحاطة", "tab.built": "كيف أُعدّ الملف",
    "fact.period": "الفترة", "fact.sector": "القطاع", "fact.cr": "السجل التجاري", "fact.vat": "الرقم الضريبي", "fact.none": "غير متوفر", "app.uploaded": "مقدم الطلب (ملفات مرفوعة)",
    "g.real": "هل الإيرادات حقيقية؟", "g.stable": "هل هي مستقرة؟", "g.attention": "ما الذي يحتاج انتباهًا؟",
    "g.realText": "من المبيعات المفوترة المستحقة حتى الآن مؤكدة بإيداعات بنكية.",
    "g.related": (share) => `تشمل ${share} من المبيعات لطرف ذي علاقة محتمل.`,
    "g.critRev": "فشل فحص حرج على الإيرادات. راجع التنبيه قبل الاعتماد على هذا الرقم.",
    "g.stableText": "متوسط المبيعات الشهرية دون الضريبة.",
    "g.vary": (cv) => `تتذبذب ${cv} من شهر لآخر`, "g.peak": (m) => `الذروة ${m}`, "g.low": (m) => `الأدنى ${m}`,
    "g.signals": "مؤشرات للمراجعة", "g.none": "لم تُرصد أي مؤشرات مخاطر في هذه المستندات.", "g.top": "الأهم:",
    "chart.title": "المبيعات الشهرية وما يؤكده البنك", "chart.note": "قيمة الفواتير الشهرية (شاملة الضريبة) حسب وجود إيداع بنكي مطابق.",
    "legend.confirmed": "مؤكدة بإيداع بنكي", "legend.pastdue": "متأخرة ولا يوجد إيداع", "legend.notdue": "لم تستحق بعد",
    "table.show": "اعرض كجدول", "table.hide": "إخفاء الجدول",
    "chart.aria": (a, b) => `المبيعات المفوترة شهريًا من ${a} إلى ${b}. استخدم «اعرض كجدول» للقيم الدقيقة.`,
    "tip.invoiced": "المفوتر (شامل الضريبة)", "tip.confirmed": "مؤكد", "tip.pastdue": "متأخر", "tip.notdue": "لم يستحق بعد", "tip.share": "المؤكد من المستحق",
    "col.month": "الشهر", "col.net": "صافي المبيعات (دون الضريبة)", "col.invoiced": "المفوتر (شامل الضريبة)", "col.confirmed": "مؤكد", "col.pastdue": "متأخر", "col.notdue": "لم يستحق بعد", "col.inflows": "الأموال المستلمة", "col.balance": "رصيد نهاية الشهر",
    "flags.title": "يحتاج إلى انتباه", "flags.note": "مؤشرات يقيّمها المحلل. قوافل لا تمنح تقييمًا ولا تتخذ القرار.",
    "sev.critical": "حرج", "sev.warning": "تحذير", "sev.info": "ملاحظة",
    "flag.transfers": (n) => `اعرض التحويلات (${n})`, "flag.invoices": (n) => (n === 1 ? "اعرض الفاتورة" : `اعرض الفواتير (${n})`), "flag.customers": "اعرض العملاء",
    "figs.title": "أرقام رئيسية", "fig.why": "ماذا يعني هذا",
    "rev.title": "كم من المبيعات المفوترة وصل إلى البنك", "rev.note": "لا يمكن تأكيد إلا الفواتير التي تجاوزت تاريخ استحقاقها. تظهر الفواتير الأحدث منفصلة.",
    "rev.confirmed": "مؤكدة بإيداعات بنكية", "rev.pastdue": "متأخرة ولا يوجد إيداع", "rev.notdue": "لم تستحق بعد", "rev.ofDue": (x) => `من أصل ${x} مستحقة`, "rev.monthly": "شهرًا بشهر",
    "aging.title": "الفواتير غير المسددة حسب العمر", "aging.note": "المبالغ القائمة في نهاية الفترة، حسب الأيام بعد تاريخ الاستحقاق.",
    "cust.title": "من يدفع لهذه المنشأة", "cust.note": (n) => `${n}. أيام السداد مرجّحة بقيمة الفاتورة.`, "cust.all": "اعرض الكل", "cust.top": "اعرض أكبر 10",
    "cust.name": "العميل", "cust.type": "النوع", "cust.share": "الحصة من المبيعات", "cust.sales": "صافي المبيعات", "cust.days": "أيام السداد", "cust.overdue": "متأخر وغير مسدد", "cust.signals": "المؤشرات",
    "cust.cash": "نقدًا", "cust.terms": (d) => `آجل ${countAr(+d, NOUNS_AR.day)}`,
    "sig.related_party": "طرف ذو علاقة محتمل", "sig.stopped_paying": "توقف عن السداد",
    "inv.title": "الفواتير والمدفوعات المرتبطة بها", "inv.note": "افتح أي فاتورة لترى مصدرها والتحويلات البنكية التي سددتها.", "inv.filter": "تصفية الفواتير",
    "inv.search": "العميل أو رقم الفاتورة", "inv.searchPh": "مثال: Al Majd أو INV-26-0412", "inv.min": "الحد الأدنى للمبلغ (ر.س)",
    "inv.all": "الكل", "inv.flagged": "من تنبيه", "inv.no": "الفاتورة", "inv.customer": "العميل", "inv.amount": "المبلغ (شامل الضريبة)", "inv.status": "الحالة", "inv.timing": "التوقيت",
    "inv.empty": "لا توجد فواتير تطابق هذه المرشحات. امسح البحث أو اختر حالة أخرى.",
    "inv.count": (a, b, n) => `${a}-${b} من ${countAr(n, NOUNS_AR.invoice)}`, "inv.zero": "لا توجد فواتير", prev: "السابق", next: "التالي", "inv.open": "افتح",
    "st.matched": "مسددة", "st.partial": "مسددة جزئيًا", "st.unmatched": "لا يوجد إيداع", "st.not_yet_due": "لم تستحق بعد",
    "t.paid": (d) => `سُددت خلال ${d}`, "t.late": (d) => `متأخرة ${d}`, "t.due": (d) => `تستحق ${d}`,
    "if.fx_converted": "محوّلة من الدولار", "if.entity_mismatch": "صادرة من منشأة أخرى", "if.number_reused": "رقم فاتورة مكرر",
    "d.invoice": "فاتورة", "d.step1": "الفاتورة", "d.step2": "مصدرها", "d.step3": "التحويلات البنكية التي سددتها",
    "d.customer": "العميل", "d.onInvoice": "الاسم في الفاتورة", "d.issued": "تاريخ الإصدار", "d.due": "تاريخ الاستحقاق", "d.net": "الصافي (دون الضريبة)", "d.expected": "الدفعة المتوقعة",
    "d.fx": (cur, amt) => `${cur} ${amt} محوّلة بسعر 3.75`, "d.creditNote": (n) => `بعد إشعار دائن ${n}`,
    "d.source": (ref) => `سجل الفواتير، ${ref}`, "d.paid": "المسدد", "d.of": (a, b) => `${a} من ${b}`,
    "d.method": (m, c) => `${m} (الثقة ${c})`, "d.account": (bank, last4) => `${bank}، الحساب المنتهي بـ ${last4}`, "d.ref": "المرجع", "d.page": "، صفحة",
    "d.shared": (x) => `جزء من تحويل بقيمة ${x} سدّد عدة فواتير.`,
    "d.none": "لم يُعثر على إيداع مطابق في كشوف الحساب.", "d.notDue": "الفاتورة لم تستحق بعد.",
    "d.transfersTitle": "التحويلات المعادة إلى هذا العميل",
    close: "إغلاق",
    "m.reference": "التحويل يذكر رقم الفاتورة", "m.statement": "سداد كشف حساب شهري", "m.exact": "تطابق تام في المبلغ", "m.fifo": "الفاتورة الأقدم أولًا", "m.cash_batch": "إيداع نقدي أسبوعي",
    "memo.title": "مذكرة الإحاطة", "memo.note": "يصوغها Claude من الأرقام الموثّقة. تلخّص الأدلة والأسئلة المفتوحة ولا توصي بقرار.",
    "memo.write": "اكتب المذكرة", "memo.rewrite": "أعد كتابة المذكرة", "memo.writing": "جارٍ الكتابة…", "memo.empty": "لا توجد مذكرة بعد. اكتب واحدة من الأرقام الموثّقة في هذا الملف.",
    "memo.wait": "تجري الصياغة من الأرقام الموثّقة. قد يستغرق ذلك حتى 30 ثانية.",
    "memo.claude": (m) => `كتبها Claude (${m}) من الملف الموثّق. تحقّق من الأرقام في الأقسام الأخرى قبل الاعتماد عليها.`,
    "memo.template": "مذكرة قالب. لا يوجد مفتاح ذكاء اصطناعي على هذا الخادم.", "memo.templatePlain": "مذكرة قالب مبنية من الأرقام الموثّقة.", "memo.fallback": "المذكرة الذكية غير متاحة حاليًا. تُعرض مذكرة القالب.",
    "memo.error": "تعذّرت كتابة المذكرة.",
    disclaimer: "أعدّته قوافل من المستندات المقدمة من مقدم الطلب. ليست توصية ائتمانية.",
    "q.title": "فحوص البيانات", "q.note": "ما الذي قُرئ، وما الذي نُظّف، وما الذي فُحص قبل عرض أي رقم.",
    "q.rows": "صفوف الفواتير المقروءة", "q.rowsSub": (d, c) => `حُذف ${d} مكرر، وخُصم ${c} إشعار دائن`,
    "q.fx": "فواتير بالدولار الأمريكي", "q.fxSub": "حُوّلت بسعر الربط الثابت 3.75",
    "q.entity": "فواتير من منشأة أخرى", "q.entitySub": "مستبعدة من المبيعات",
    "q.stm": "كشوف حساب متطابقة الأرصدة", "q.stmSub": "كل صف فُحص مقابل الرصيد الجاري", "q.of": (a, b) => `${a} من ${b}`,
    "q.tx": "المعاملات البنكية المقروءة", "q.months": "الأشهر المغطاة", "q.monthsOk": "12 شهرًا كاملة من الفواتير والكشوف", "q.monthsMissing": "بعض الأشهر ناقصة",
    "q.review": "أسماء دافعين أُحيلت للمراجعة البشرية", "q.reviewSub": "مطابقات أسماء بثقة أقل من ⁦80%⁩",
    "q.complete": "مكتملة", "q.gaps": "ناقصة",
    "q.methods": "كيف رُبطت المدفوعات بالفواتير", "q.methodsNote": "حصة القيمة المطابقة حسب الطريقة، من الأقوى دليلًا.",
    "q.accuracy": "دقة المطابقة", "q.accuracyNote": "مقيسة على بيانات العينة، حيث الدفعة الصحيحة لكل فاتورة معروفة.",
    "q.precision": "المطابقات الصحيحة", "q.precisionTip": "من كل الأموال التي ربطها النظام بفواتير، الحصة التي رُبطت بالفاتورة الصحيحة.",
    "q.recall": "المدفوعات التي عُثر عليها", "q.recallTip": "من كل مدفوعات الفواتير الحقيقية في الكشوف، الحصة التي عثر عليها النظام.",
    "q.noAccuracy": "تُقاس الدقة على بيانات العينة فقط.",
    "q.sample": "بيانات العينة", "q.sampleNote": "بيانات اصطناعية بالكامل. مقدم الطلب والعملاء والبنوك وهمية.", "q.statements": (n) => `كشوف الحساب (${n} ملف PDF)`,
    "up.title": "حلّل ملفاتك", "up.note": "يجب أن تتبع الكشوف تنسيق PDF للبنوك النموذجية. نزّل ملفات العينة للاطلاع على التنسيق المطلوب.",
    "up.inv": "الفواتير (.xlsx)", "up.stm": "كشوف الحساب (.pdf، حتى 36 ملفًا)", "up.cust": "قائمة العملاء (.csv، اختياري)", "up.org": "ملف مقدم الطلب (.json، اختياري)",
    "up.cancel": "إلغاء", "up.submit": "حلّل الملفات", "up.busy": "جارٍ التحليل…", "up.choose": "اختر ملفًا", "up.chooseMany": "اختر الملفات", "up.none": "لم يُختر أي ملف", "up.many": (n) => `اختير ${n} ملفات`,
    "err.load": "تعذّر تحميل الملف.", "err.generic": (s) => `حدث خطأ (${s}). حاول مرة أخرى.`, "err.network": "تعذّر الوصول إلى الخادم. تحقّق من الاتصال وحاول مرة أخرى.",
    "err.TOO_MANY_FILES": "عدد الكشوف كبير. ارفع 36 ملف PDF كحد أقصى.", "err.UPLOAD_TOO_LARGE": "حجم الملفات كبير. يجب ألا يتجاوز المجموع 20 ميجابايت.",
    "err.INVALID_FILE_TYPE.inv": "يجب أن تكون الفواتير ملف .xlsx.", "err.INVALID_FILE_TYPE.stm": "يجب أن تكون الكشوف ملفات PDF.",
    "err.UNREADABLE_FILE": "تعذّرت قراءة أحد الملفات. تأكد أنه يتبع تنسيق العينة.",
    "err.APPLICATION_NOT_FOUND": "لم يُعثر على هذا الطلب.", "err.INVALID_PACKAGE": "الملف ينقصه بيانات لازمة لكتابة المذكرة.",
  },
};
const t = (k, ...a) => {
  const v = I18N[state.lang][k] ?? I18N.en[k] ?? k;
  return typeof v === "function" ? v(...a) : v;
};

const SEGMENTS = {
  en: { export: "Export", grocery: "Grocery", horeca: "Hotels and restaurants", key_account: "Key account", related: "Related", supermarket: "Supermarket" },
  ar: { export: "تصدير", grocery: "بقالة", horeca: "فنادق ومطاعم", key_account: "عميل رئيسي", related: "ذو علاقة", supermarket: "سوبرماركت" },
};
const SECTORS_AR = { "Food and FMCG wholesale": "تجارة الجملة للأغذية والسلع الاستهلاكية" };

// ---------- key figures: label and why a lender cares ----------
const FIG_TEXT = {
  en: {
    avg: ["Average monthly net sales", "Invoiced sales per month, excluding VAT. The starting point for sizing any facility."],
    cv: ["Month-to-month variation", "How much sales swing between months. Bigger swings mean repayment capacity is less predictable."],
    days: ["Average time to get paid", "Days from invoice to bank receipt, weighted by value. Longer waits mean more cash tied up in receivables."],
    top5: ["Top 5 customers' share", "Share of sales from the five largest customers. Losing one of them could cut sales sharply."],
    pastdue: ["Receivables past due", "Invoiced and due, but no matching payment found. Some of it may never be collected."],
    balance: ["Average month-end balance", "Cash typically on hand at the end of a month. The lowest month shows the tightest point."],
    debt: ["Existing finance installments", "Recurring finance payments found in the bank debits. This cash is already committed."],
    inflows: ["Money received explained by invoices", "Share of incoming money that matches invoices. A low share means income from sources not on the books."],
  },
  ar: {
    avg: ["متوسط صافي المبيعات الشهرية", "المبيعات المفوترة شهريًا دون الضريبة. نقطة البداية لتقدير حجم أي تمويل."],
    cv: ["التذبذب من شهر لآخر", "مقدار تغيّر المبيعات بين الأشهر. كلما زاد التذبذب قلّت إمكانية التنبؤ بالقدرة على السداد."],
    days: ["متوسط مدة التحصيل", "الأيام من الفاتورة حتى وصول المبلغ للبنك، مرجّحة بالقيمة. الانتظار الأطول يعني نقدًا أكثر محتجزًا في الذمم."],
    top5: ["حصة أكبر 5 عملاء", "حصة المبيعات من أكبر خمسة عملاء. خسارة أحدهم قد تخفض المبيعات بشدة."],
    pastdue: ["ذمم متأخرة السداد", "مبالغ مفوترة ومستحقة دون دفعة مطابقة. قد لا يُحصّل بعضها أبدًا."],
    balance: ["متوسط رصيد نهاية الشهر", "النقد المتوفر عادة في نهاية الشهر. أدنى شهر يبيّن أضيق نقطة سيولة."],
    debt: ["أقساط التمويل القائمة", "مدفوعات تمويل متكررة في الخصومات البنكية. هذا النقد ملتزم به مسبقًا."],
    inflows: ["الأموال المستلمة المفسَّرة بالفواتير", "حصة الأموال الواردة المطابقة لفواتير. الحصة المنخفضة تعني دخلًا من مصادر غير مسجلة."],
  },
};

// ---------- flags: worded on the client from type + params ----------
const REASONS = {
  en: { same_phone: "same phone number as the applicant", shared_surname: "shareholders share the owner's family name", same_address: "same address as the applicant", registered_recently: (d) => `registered recently (${d})` },
  ar: { same_phone: "رقم الهاتف نفسه لمقدم الطلب", shared_surname: "المساهمون يحملون اسم عائلة المالك", same_address: "العنوان نفسه لمقدم الطلب", registered_recently: (d) => `مسجّل حديثًا (${d})` },
};
const custName = (p) => (ar() && p.customer_ar) || p.customer;
const reasonList = (p, lang) => p.reasons.map((r) => (r === "registered_recently" ? REASONS[lang][r](dateLabel(p.registered_on)) : REASONS[lang][r] || r));
const FLAG_TEXT = {
  en: {
    coverage: (p) => ({ title: "12-month coverage is incomplete", detail: [
      p.missing_invoice_months?.length ? `No invoices for ${p.missing_invoice_months.map(monthShort).join(", ")}.` : "",
      ...(p.missing_statements || []).map((s) => `No statement for ${s.months.map(monthShort).join(", ")} on the account ending ${s.account_last4}.`)].filter(Boolean).join(" ") }),
    statement_balance: (p) => ({ title: "Statement totals do not add up", detail: `${count(p.count, "statement")} fail the running-balance check. This can mean an edited PDF or a reading error.` }),
    low_match_rate: (p, f) => ({ title: f.severity === "critical" ? "Low share of sales confirmed by the bank" : "Part of sales not confirmed by the bank", detail: `${pct(p.rate)} of invoiced value now due is confirmed by bank deposits.` }),
    unmatched_large: (p) => ({ title: `${count(p.count, "invoice")} over ${money(p.threshold)} past due and not collected`, detail: `${money(p.amount)} invoiced but not found in the bank statements.` }),
    stopped_paying: (p) => ({ title: `${custName(p)} has stopped paying`, detail: `No payment since ${dateLabel(p.last_payment)}. ${money(p.amount)} past due across ${count(p.count, "invoice")}.` }),
    concentration: (p) => ({ title: "Sales depend on a few customers", detail: `Largest customer ${pct(p.top1)} and top 5 customers ${pct(p.top5)} of sales.` }),
    related_party: (p) => ({ title: `Possible related party: ${custName(p)}`, detail:
      `${pct(p.share)} of sales. Signals: ${reasonList(p, "en").join("; ")}.` +
      (p.returned_pct ? ` ${pct(p.returned_pct, 0)} of the money received from them was sent back to them within days.` : "") +
      ` Sales without this customer: ${money(p.revenue_ex_monthly)} a month.` }),
    duplicates: (p) => ({ title: `${count(p.count, "invoice")} duplicated in the register`, detail: "Identical rows (same number, customer and amount) were counted once." }),
    entity_mismatch: (p) => ({ title: `${count(p.count, "invoice")} issued by another company`, detail: `The seller VAT number differs from the applicant's. ${money(p.amount)} excluded from sales.` }),
    fx_converted: (p) => ({ title: `${count(p.count, "invoice")} in US dollars converted`, detail: `Converted at the fixed ${p.rate} rate. Original amounts kept.` }),
    unidentified_inflows: (p) => ({ title: "Deposits from unknown payers", detail: `${money(p.amount)} (${pct(p.pct)} of money received) could not be linked to a known customer.` }),
    activity_gap: (p) => ({ title: "Gap in incoming payments", detail: `No incoming payments between ${dateLabel(p.from)} and ${dateLabel(p.to)} (${count(p.days, "day")}).` }),
    late_spike: (p) => ({ title: "Sales jump just before applying", detail: `The last 2 months average ${money(p.avg)}, ${pct(p.pct, 0)} above the previous 10 months.` }),
    existing_debt: (p) => ({ title: "Existing finance payments", detail: `Recurring finance installments of about ${money(p.monthly)} a month.` }),
  },
  ar: {
    coverage: (p) => ({ title: "تغطية الأشهر الاثني عشر غير مكتملة", detail: [
      p.missing_invoice_months?.length ? `لا توجد فواتير لأشهر ${p.missing_invoice_months.map(monthShort).join("، ")}.` : "",
      ...(p.missing_statements || []).map((s) => `لا يوجد كشف لأشهر ${s.months.map(monthShort).join("، ")} للحساب المنتهي بـ ${s.account_last4}.`)].filter(Boolean).join(" ") }),
    statement_balance: (p) => ({ title: "أرصدة الكشوف لا تتطابق", detail: `${countAr(p.count, NOUNS_AR.statement)} لا تجتاز فحص الرصيد الجاري. قد يعني ذلك ملف PDF معدّلًا أو خطأ في القراءة.` }),
    low_match_rate: (p, f) => ({ title: f.severity === "critical" ? "نسبة منخفضة من المبيعات مؤكدة من البنك" : "جزء من المبيعات غير مؤكد من البنك", detail: `${pct(p.rate)} من قيمة الفواتير المستحقة مؤكدة بإيداعات بنكية.` }),
    unmatched_large: (p) => ({ title: `فواتير فوق ${money(p.threshold)} متأخرة ولم تُحصّل (${p.count})`, detail: `${money(p.amount)} مفوترة ولم يُعثر عليها في كشوف الحساب.` }),
    stopped_paying: (p) => ({ title: `توقف عن السداد: ${custName(p)}`, detail: `لا توجد دفعات منذ ${dateLabel(p.last_payment)}. ${money(p.amount)} متأخرة على ${countAr(p.count, NOUNS_AR.invoice)}.` }),
    concentration: (p) => ({ title: "المبيعات تعتمد على عدد قليل من العملاء", detail: `أكبر عميل ${pct(p.top1)} وأكبر 5 عملاء ${pct(p.top5)} من المبيعات.` }),
    related_party: (p) => ({ title: `طرف ذو علاقة محتمل: ${custName(p)}`, detail:
      `${pct(p.share)} من المبيعات. المؤشرات: ${reasonList(p, "ar").join("؛ ")}.` +
      (p.returned_pct ? ` أُعيد تحويل ${pct(p.returned_pct, 0)} من الأموال المستلمة منه إليه خلال أيام.` : "") +
      ` المبيعات دون هذا العميل: ${money(p.revenue_ex_monthly)} شهريًا.` }),
    duplicates: (p) => ({ title: `صفوف مكررة في سجل الفواتير (${p.count})`, detail: "الصفوف المتطابقة (الرقم والعميل والمبلغ نفسها) احتُسبت مرة واحدة." }),
    entity_mismatch: (p) => ({ title: `فواتير صادرة من منشأة أخرى (${p.count})`, detail: `الرقم الضريبي للبائع يختلف عن رقم مقدم الطلب. استُبعد ${money(p.amount)} من المبيعات.` }),
    fx_converted: (p) => ({ title: `فواتير بالدولار حُوّلت (${p.count})`, detail: `حُوّلت بسعر الربط الثابت ${p.rate} مع الاحتفاظ بالمبالغ الأصلية.` }),
    unidentified_inflows: (p) => ({ title: "إيداعات من دافعين غير معروفين", detail: `${money(p.amount)} (${pct(p.pct)} من الأموال المستلمة) تعذّر ربطها بعميل معروف.` }),
    activity_gap: (p) => ({ title: "انقطاع في الدفعات الواردة", detail: `لا توجد دفعات واردة بين ${dateLabel(p.from)} و${dateLabel(p.to)} (${countAr(p.days, NOUNS_AR.day)}).` }),
    late_spike: (p) => ({ title: "قفزة في المبيعات قبل التقديم مباشرة", detail: `متوسط آخر شهرين ${money(p.avg)}، أعلى بنسبة ${pct(p.pct, 0)} من الأشهر العشرة السابقة.` }),
    existing_debt: (p) => ({ title: "التزامات تمويلية قائمة", detail: `أقساط تمويل متكررة بنحو ${money(p.monthly)} شهريًا.` }),
  },
};
function flagText(f) {
  const build = FLAG_TEXT[state.lang][f.type];
  if (build && f.params && Object.keys(f.params).length) {
    try { return build(f.params, f); } catch { /* fall through to the server's text */ }
  }
  if (ar()) return { title: isoNumbers((f.title_ar || f.title).replace(/ريال/g, "ر.س")), detail: isoNumbers((f.detail_ar || f.detail).replace(/ريال/g, "ر.س")) };
  return { title: f.title, detail: f.detail };
}
const SEV = {
  critical: { cls: "crit", icon: "warning-octagon" },
  warning: { cls: "warn", icon: "warning" },
  info: { cls: "info", icon: "info" },
};

// ---------- data ----------
class ApiError extends Error {
  constructor(status, body) { super(body?.error?.message || `HTTP ${status}`); this.status = status; this.code = body?.error?.code; this.details = body?.error?.details; }
}
async function getJSON(url, opts) {
  let res;
  try { res = await fetch(url, opts); } catch { throw new ApiError(0, { error: { code: "NETWORK" } }); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body);
  return body;
}
function errorText(e) {
  if (e.code === "NETWORK") return t("err.network");
  if (e.code === "INVALID_FILE_TYPE") return t(e.details?.files ? "err.INVALID_FILE_TYPE.stm" : "err.INVALID_FILE_TYPE.inv");
  if (e.code && I18N.en[`err.${e.code}`]) return t(`err.${e.code}`);
  return t("err.generic", e.status || "?");
}

async function loadSample() {
  $("loadError").hidden = true;
  revokeUploads(); // back to the sample: the uploaded files' object URLs are no longer needed
  try {
    setReport(await getJSON(`${API}/applications/demo/report`), "sample");
  } catch (e) {
    $("loadError").innerHTML = `${icon("warning-circle")}<span>${esc(t("err.load"))} ${esc(errorText(e))}</span>`;
    $("loadError").hidden = false;
    $("glance").innerHTML = "";
  }
}

function setReport(report, source) {
  state.report = report;
  state.source = source;
  state.page = 0; state.status = "all"; state.evidence = null; state.memo = null;
  state.allocByInv = new Map();
  for (const a of report.allocations) {
    if (!state.allocByInv.has(a.invoice_number)) state.allocByInv.set(a.invoice_number, []);
    state.allocByInv.get(a.invoice_number).push(a);
  }
  state.creditByRef = new Map(report.credits.map((c) => [c.reference, c]));
  $("uploadBanner").hidden = source !== "upload";
  render();
}

// ---------- static text & language ----------
function applyStaticText() {
  const root = document.documentElement;
  root.lang = state.lang;
  root.dir = ar() ? "rtl" : "ltr";
  document.title = t("doc.title");
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
  document.querySelectorAll(".lang-switch button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === state.lang)));
  $("toggleTable").textContent = $("ledgerTable").hidden ? t("table.show") : t("table.hide");
  document.querySelectorAll(".file input").forEach(fileName);
  $("writeMemoLabel").textContent = state.memo ? t("memo.rewrite") : t("memo.write");
}

function setLang(lang) {
  if (lang === state.lang) return;
  state.lang = lang === "en" ? "en" : "ar";
  try { localStorage.setItem("lang", state.lang); } catch { /* storage is optional */ }
  state.memo = null; // a memo is written in one language; write it again in the other
  applyStaticText();
  if (state.report) render();
}

// ---------- tabs ----------
function showTab(name, { focus = false, push = true } = {}) {
  if (!TABS.includes(name)) name = "overview";
  state.tab = name;
  for (const n of TABS) {
    const tab = $(`tab-${n}`), panel = $(`p-${n}`), on = n === name;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    panel.hidden = !on;
  }
  if (name === "overview" && state.report) drawLedger(state.report.monthly); // width may have changed while hidden
  // phone bottom nav mirrors the sidebar; "How it was built" lives under More
  document.querySelectorAll(".bottom-nav [data-tab]").forEach((b) => b.toggleAttribute("aria-current", false));
  document.querySelector(`.bottom-nav > [data-tab="${name}"]`)?.setAttribute("aria-current", "page");
  if (name === "built") $("moreBtn").setAttribute("aria-current", "page"); else $("moreBtn").removeAttribute("aria-current");
  closeMore();
  if (focus) $(`tab-${name}`).focus();
  if (push) { try { history.replaceState(null, "", `#${name}`); } catch { /* sandboxed */ } }
}
function wireTabs() {
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".nav [data-tab], .bottom-nav [data-tab], .more-menu [data-tab]");
    if (b) goToTab(b.dataset.tab);
  });
  // vertical tablist: Up/Down move between sections
  $("tabs").addEventListener("keydown", (e) => {
    const i = TABS.indexOf(state.tab);
    let n = null;
    if (e.key === "ArrowDown") n = TABS[(i + 1) % TABS.length];
    else if (e.key === "ArrowUp") n = TABS[(i - 1 + TABS.length) % TABS.length];
    else if (e.key === "Home") n = TABS[0];
    else if (e.key === "End") n = TABS.at(-1);
    if (n) { e.preventDefault(); showTab(n, { focus: true }); }
  });
  $("moreBtn").onclick = (e) => {
    e.stopPropagation();
    const open = $("moreMenu").hidden;
    $("moreMenu").hidden = !open;
    $("moreBtn").setAttribute("aria-expanded", String(open));
    if (open) $("moreMenu").querySelector("button").focus();
  };
  $("moreUpload").onclick = () => { closeMore(); openUpload(); };
  document.addEventListener("click", (e) => { if (!e.target.closest(".more-menu, #moreBtn")) closeMore(); });
}
function closeMore() {
  if ($("moreMenu").hidden) return;
  $("moreMenu").hidden = true;
  $("moreBtn").setAttribute("aria-expanded", "false");
}
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function goToTab(name) {
  showTab(name);
  const top = Math.max(0, $("main").getBoundingClientRect().top + window.scrollY - 12);
  if (window.scrollY > top) window.scrollTo({ top, behavior: reduceMotion() ? "auto" : "smooth" });
}

// ---------- render ----------
function render() {
  const r = state.report;
  $("main").setAttribute("aria-busy", "false");
  renderApplicant(r);
  renderGlance(r);
  drawLedger(r.monthly);
  $("ledgerTable").innerHTML = ledgerTable(r.monthly);
  renderFlags(r);
  renderFigures(r);
  renderRevenue(r);
  renderCustomers(r);
  renderStatusSeg();
  renderInvoices();
  renderMemo();
  renderBuilt(r);
}

function renderApplicant(r) {
  const a = r.applicant || {};
  const primary = (ar() && a.legal_name_ar) || a.legal_name || t("app.uploaded");
  const secondary = ar() ? (a.legal_name_ar ? a.legal_name : "") : a.legal_name_ar || "";
  $("appName").textContent = primary;
  const alt = $("appNameAlt");
  alt.textContent = secondary || "";
  alt.lang = ar() ? "en" : "ar";
  alt.dir = ar() ? "ltr" : "rtl";
  alt.hidden = !secondary;
  const none = esc(t("fact.none"));
  const facts = [
    [t("fact.period"), esc(`${dateLabel(r.period.start)} - ${dateLabel(r.period.end)}`)],
    [t("fact.sector"), esc((ar() && SECTORS_AR[a.sector]) || a.sector || t("fact.none"))],
    [t("fact.cr"), a.cr_number ? ltr(a.cr_number) : none],
    [t("fact.vat"), a.vat_number ? ltr(a.vat_number) : none],
  ];
  $("appFacts").innerHTML = facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("");
}

function renderGlance(r) {
  const m = r.metrics, flags = r.flags;
  const related = flags.find((f) => f.type === "related_party");
  const critRevenue = flags.find((f) => f.severity === "critical" && ["low_match_rate", "statement_balance", "coverage"].includes(f.type));
  const lowWarn = flags.find((f) => f.type === "low_match_rate" && f.severity === "warning");
  // The green check is reserved for a clean result: no related party and no critical revenue flag.
  let tone = "good", ic = "check-circle";
  if (critRevenue) { tone = "crit"; ic = "warning-octagon"; }
  else if (related) { tone = "neutral"; ic = "scales"; }
  else if (lowWarn) { tone = "warn"; ic = "warning"; }
  // Red is kept for the critical case; the related-party caveat is a neutral pointer to its flag.
  const realNote = critRevenue
    ? `<p class="gnote crit">${icon("warning-octagon")}<button class="link" data-goflag="${flags.indexOf(critRevenue)}">${esc(t("g.critRev"))}</button></p>`
    : related
      ? `<p class="gnote">${icon("arrow-circle-down")}<button class="link" data-goflag="${flags.indexOf(related)}">${esc(t("g.related", pct(related.params?.share ?? 0)))}</button></p>`
      : "";

  const crit = flags.filter((f) => f.severity === "critical").length;
  const warn = flags.filter((f) => f.severity === "warning").length;
  const top = flags[0];
  const attTone = crit ? "crit" : warn ? "warn" : "good";
  const attIcon = crit ? "warning-octagon" : warn ? "warning" : "check-circle";
  const attention = top && (crit || warn)
    ? `<div class="gmid"><div class="gbig">${nf0.format(crit + warn)} <small>${esc(t("g.signals"))}</small></div>
       <div class="counts">${crit ? `<span class="pill crit">${icon("warning-octagon")}${esc(count(crit, "critical"))}</span>` : ""}${warn ? `<span class="pill warn">${icon("warning")}${esc(count(warn, "warning"))}</span>` : ""}</div></div>
       <p class="gnote">${icon("arrow-circle-down")}<span>${esc(t("g.top"))} <button class="link" data-goflag="0">${esc(flagText(top).title)}</button></span></p>`
    : `<div class="gmid"><p class="gtext">${esc(t("g.none"))}</p></div>`;
  const q = (text, name) => `<h3 class="gq"><span class="gicon">${icon(name)}</span>${esc(text)}</h3>`;

  // Each card: question, then the number with its one-line explanation, then the caveat pinned to the bottom.
  $("glance").innerHTML = `
    <article class="gcard glass ${tone}">
      ${q(t("g.real"), ic)}
      <div class="gmid"><div class="gbig">${pct(m.match_rate)}</div>
        <div class="meter" role="img" aria-label="${esc(t("g.meterAria", pct(m.match_rate)))}"><i style="width:${Math.min(100, m.match_rate * 100)}%"></i></div>
        <p class="gtext">${esc(t("g.realText"))}</p></div>
      ${realNote}
    </article>
    <article class="gcard glass neutral">
      ${q(t("g.stable"), "chart-line")}
      <div class="gmid"><div class="gbig">${esc(moneyShort(m.avg_monthly_revenue_net))}</div>${sparkline(r.monthly, m)}<p class="gtext">${esc(t("g.stableText"))}</p></div>
      <div class="gnote chips"><span class="pill info">${icon("wave-sine")}${esc(t("g.vary", pct(m.revenue_volatility_cv, 0)))}</span><span class="pill info">${icon("arrow-up")}${esc(t("g.peak", monthShort(m.peak_month)))}</span><span class="pill info">${icon("arrow-down")}${esc(t("g.low", monthShort(m.low_month)))}</span></div>
    </article>
    <article class="gcard glass ${attTone}">
      ${q(t("g.attention"), attIcon)}
      ${attention}
    </article>`;
}

// 12 months of net sales; time runs left to right in both languages, like the main chart.
function sparkline(monthly, m) {
  const v = monthly.map((d) => d.revenue_net || 0);
  if (v.length < 2) return "";
  const W = 240, H = 40, lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * W).toFixed(1)},${(H - 3 - ((x - lo) / span) * (H - 6)).toFixed(1)}`);
  const label = t("g.sparkAria", monthShort(monthly[0].month), monthShort(monthly.at(-1).month), monthShort(m.peak_month), monthShort(m.low_month));
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}" dir="ltr">
    <polygon class="area" points="0,${H} ${pts.join(" ")} ${W},${H}"/><polyline points="${pts.join(" ")}"/></svg>`;
}

function focusFlag(i) {
  goToTab("overview");
  const el = document.querySelector(`.flag[data-i="${i}"]`);
  if (!el) return;
  document.querySelectorAll(".flag.highlight").forEach((x) => x.classList.remove("highlight"));
  el.classList.add("highlight");
  el.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "center" });
  el.querySelector(".flag-title").focus({ preventScroll: true });
  setTimeout(() => el.classList.remove("highlight"), 2400);
}

// ---------- chart ----------
function drawLedger(monthly) {
  // draw at the container's real width so axis text stays 12px
  const W = Math.max(560, Math.round($("ledgerChart").parentElement.clientWidth) || 1100), H = 300, padL = 56, padR = 8, padT = 12;
  const twoLine = (W - padL - padR) / monthly.length < 72; // narrow: month over year so labels never collide
  const padB = twoLine ? 44 : 30;
  const max = Math.max(...monthly.map((d) => d.invoiced_gross || 0)) || 1;
  const step = max > 1.5e6 ? 500000 : 250000;
  const top = Math.ceil(max / step) * step;
  const y = (v) => padT + (H - padT - padB) * (1 - v / top);
  const colW = (W - padL - padR) / monthly.length;
  const barW = Math.min(56, colW * 0.6);
  const unit = ar() ? "م" : "M";
  let svg = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false"><g class="grid">`;
  for (let v = 0; v <= top; v += step) svg += `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/>`;
  svg += `</g><g class="axis">`;
  for (let v = 0; v <= top; v += step) {
    svg += `<text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end">${v === 0 ? "0" : (v / 1e6).toFixed(2).replace(/\.?0+$/, "") + unit}</text>`;
  }
  monthly.forEach((d, i) => {
    const x = padL + colW * i + colW / 2;
    svg += twoLine
      ? `<text x="${x}" y="${H - 24}" text-anchor="middle">${esc(asDate(d.month).toLocaleDateString(locale(), { month: "short" }))}<tspan x="${x}" dy="15">${esc(d.month.slice(2, 4))}</tspan></text>`
      : `<text x="${x}" y="${H - 8}" text-anchor="middle">${esc(monthShort(d.month))}</text>`;
  });
  svg += `</g>`;
  const segs = [["collected", "var(--c-confirmed)"], ["open_past_due", "var(--c-pastdue)"], ["not_yet_due", "var(--c-notdue)"]];
  monthly.forEach((d, i) => {
    const x = padL + colW * i + (colW - barW) / 2;
    let base = 0;
    svg += `<g class="col" data-i="${i}"><rect class="hit" x="${padL + colW * i}" y="${padT}" width="${colW}" height="${H - padT - padB}"/>`;
    const parts = segs.filter(([k]) => (d[k] || 0) > 0);
    parts.forEach(([k, color], j) => {
      const v = d[k];
      const y0 = y(base), y1 = y(base + v);
      const gap = j > 0 ? 2 : 0;
      const h = Math.max(y0 - y1 - gap, 0.5);
      const isTop = j === parts.length - 1;
      const rad = isTop ? Math.min(4, h / 2) : 0;
      // rounded top on the last segment only, square at the baseline
      svg += isTop
        ? `<path d="M${x},${y0 - gap} V${y1 + rad} Q${x},${y1} ${x + rad},${y1} H${x + barW - rad} Q${x + barW},${y1} ${x + barW},${y1 + rad} V${y0 - gap} Z" fill="${color}"/>`
        : `<rect x="${x}" y="${y1}" width="${barW}" height="${h}" fill="${color}"/>`;
      base += v;
    });
    svg += `</g>`;
  });
  svg += `</svg>`;
  const el = $("ledgerChart");
  el.innerHTML = svg;
  el.setAttribute("aria-label", t("chart.aria", monthShort(monthly[0].month), monthShort(monthly.at(-1).month)));
  el.querySelectorAll(".col").forEach((g) => {
    const d = monthly[+g.dataset.i];
    g.addEventListener("mousemove", (ev) => showTip(ev, ledgerTip(d)));
    g.addEventListener("mouseleave", hideTip);
  });
}
function ledgerTip(d) {
  const due = (d.collected || 0) + (d.open_past_due || 0);
  const row = (label, v, color) => `<div class="row"><span>${color ? `<i style="background:var(${color})"></i>` : ""}${esc(label)}</span><span>${esc(v)}</span></div>`;
  return `<b>${esc(monthLong(d.month))}</b>` +
    row(t("tip.invoiced"), moneyShort(d.invoiced_gross || 0)) +
    row(t("tip.confirmed"), moneyShort(d.collected || 0), "--c-confirmed") +
    row(t("tip.pastdue"), moneyShort(d.open_past_due || 0), "--c-pastdue") +
    row(t("tip.notdue"), moneyShort(d.not_yet_due || 0), "--c-notdue") +
    (due ? row(t("tip.share"), pct((d.collected || 0) / due)) : "");
}
function ledgerTable(monthly) {
  const cols = ["col.net", "col.invoiced", "col.confirmed", "col.pastdue", "col.notdue", "col.inflows", "col.balance"];
  const keys = ["revenue_net", "invoiced_gross", "collected", "open_past_due", "not_yet_due", "inflows", "closing_balance"];
  return `<table class="data"><thead><tr><th>${esc(t("col.month"))}</th>${cols.map((c) => `<th class="n">${esc(t(c))}</th>`).join("")}</tr></thead><tbody>` +
    monthly.map((d) => `<tr><td>${esc(monthLong(d.month))}</td>${keys.map((k) => `<td class="n">${esc(money(d[k] || 0))}</td>`).join("")}</tr>`).join("") + "</tbody></table>";
}

// ---------- flags ----------
function renderFlags(r) {
  if (!r.flags.length) {
    $("flags").innerHTML = `<p class="note">${icon("check-circle")} ${esc(t("g.none"))}</p>`;
    return;
  }
  const groups = ["critical", "warning", "info"]
    .map((sev) => [sev, r.flags.map((f, i) => [f, i]).filter(([f]) => f.severity === sev)])
    .filter(([, l]) => l.length);
  $("flags").innerHTML = groups.map(([sev, list]) => `
    <section class="sev-group" aria-label="${esc(t(`sev.${sev}`))}">
      <h3><span class="pill ${SEV[sev].cls}">${icon(SEV[sev].icon)}${esc(t(`sev.${sev}`))} (${list.length})</span></h3>
      <ol class="flags">${list.map(([f, i]) => {
        const { title, detail } = flagText(f);
        return `<li class="flag ${SEV[sev].cls}" data-i="${i}"><p class="flag-title" tabindex="-1">${esc(title)}</p><p>${esc(detail)}</p>${flagAction(f, i)}</li>`;
      }).join("")}</ol>
    </section>`).join("");
}
function flagAction(f, i) {
  const ev = f.evidence || [];
  if (!ev.length) return "";
  if (typeof ev[0] === "object") return `<button class="link" data-flag="${i}" data-kind="transfers">${icon("bank")}${esc(t("flag.transfers", ev.length))}</button>`;
  if (/^(INV|CN)-/.test(ev[0])) return `<button class="link" data-flag="${i}" data-kind="invoices">${icon("receipt")}${esc(t("flag.invoices", ev.length))}</button>`;
  if (/^C\d+/.test(ev[0])) return `<button class="link" data-flag="${i}" data-kind="customers">${icon("users")}${esc(t("flag.customers"))}</button>`;
  return "";
}
function runFlagAction(i, kind) {
  const f = state.report.flags[i];
  if (kind === "transfers") return openTransfers(f);
  if (kind === "customers") return goToTab("customers");
  state.evidence = new Set(f.evidence); state.status = "evidence"; state.page = 0; state.search = ""; $("invSearch").value = "";
  renderStatusSeg(); renderInvoices();
  goToTab("invoices");
}

// ---------- key figures ----------
let tipSeq = 0;
function tipButton(text, label) {
  const id = `tip${++tipSeq}`;
  return `<span class="tipwrap"><button type="button" class="tipbtn" aria-describedby="${id}" aria-label="${esc(t("fig.why"))}: ${esc(label)}">${icon("info")}</button><span role="tooltip" id="${id}" class="tip">${esc(text)}</span></span>`;
}
function renderFigures(r) {
  const m = r.metrics, F = FIG_TEXT[state.lang];
  const na = ar() ? "غير متاح" : "n/a";
  const rows = [
    ["avg", money(m.avg_monthly_revenue_net), ar() ? `${moneyShort(m.total_revenue_net)} خلال 12 شهرًا` : `${moneyShort(m.total_revenue_net)} over 12 months`],
    ["cv", pct(m.revenue_volatility_cv, 0), ar() ? `الذروة ${monthShort(m.peak_month)}، الأدنى ${monthShort(m.low_month)}` : `Peak ${monthShort(m.peak_month)}, low ${monthShort(m.low_month)}`],
    ["days", m.avg_days_to_payment != null ? count(Math.round(m.avg_days_to_payment), "day") : na, ""],
    ["top5", pct(m.top5_concentration), ar() ? `أكبر عميل ${pct(m.top1_concentration)}` : `Largest customer ${pct(m.top1_concentration)}`],
    ["pastdue", money(m.receivables_past_due), ""],
    ["balance", m.avg_month_end_balance != null ? money(m.avg_month_end_balance) : na, m.min_month_end_balance != null ? (ar() ? `الأدنى ${money(m.min_month_end_balance)}` : `Lowest ${money(m.min_month_end_balance)}`) : ""],
    ["debt", m.monthly_debt_service ? (ar() ? `${money(m.monthly_debt_service)} شهريًا` : `${money(m.monthly_debt_service)} a month`) : (ar() ? "لا يوجد" : "None found"), ""],
    ["inflows", pct(m.inflows_explained_by_invoices), ar() ? `من أصل ${moneyShort(m.total_inflows)} مستلمة` : `of ${moneyShort(m.total_inflows)} received`],
  ];
  $("figures").innerHTML = rows.map(([k, v, s]) => `<div class="fig"><div class="fig-label"><span>${esc(F[k][0])}</span>${tipButton(F[k][1], F[k][0])}</div>
    <div class="fig-value">${esc(v)}</div>${s ? `<div class="fig-sub">${esc(s)}</div>` : ""}</div>`).join("");
}

// ---------- revenue verification ----------
function renderRevenue(r) {
  const sum = (k) => r.monthly.reduce((s, d) => s + (d[k] || 0), 0);
  const collected = sum("collected"), pastdue = sum("open_past_due"), notdue = sum("not_yet_due");
  $("revStats").innerHTML = `
    <div class="stat confirmed"><span>${esc(t("rev.confirmed"))}</span><strong>${esc(moneyShort(collected))}</strong><span>${esc(t("rev.ofDue", moneyShort(collected + pastdue)))}</span></div>
    <div class="stat pastdue"><span>${esc(t("rev.pastdue"))}</span><strong>${esc(moneyShort(pastdue))}</strong><span>${esc(pct(pastdue / ((collected + pastdue) || 1)))}</span></div>
    <div class="stat notdue"><span>${esc(t("rev.notdue"))}</span><strong>${esc(moneyShort(notdue))}</strong><span>${esc(count(r.metrics.invoice_status?.not_yet_due || 0, "invoice"))}</span></div>`;
  $("revTable").outerHTML = ledgerTable(r.monthly).replace('<table class="data">', '<table class="data" id="revTable">');
  $("aging").innerHTML = r.aging.map((a, i) => `<div class="age b${i}"><span>${esc((ar() && a.bucket_ar) || a.bucket)}</span>
    <strong>${esc(money(a.amount))}</strong><span>${esc(count(a.invoices, "invoice"))}</span></div>`).join("");
}

// ---------- customers ----------
function renderCustomers(r) {
  const list = state.showAllCustomers ? r.customers : r.customers.slice(0, 10);
  const maxShare = r.customers[0]?.share || 1;
  $("custNote").textContent = t("cust.note", count(r.customers.length, "customer"));
  const tog = $("toggleCust");
  tog.hidden = r.customers.length <= 10;
  tog.textContent = state.showAllCustomers ? t("cust.top") : t("cust.all");
  const H = ["cust.name", "cust.type", "cust.share", "cust.sales", "cust.days", "cust.overdue", "cust.signals"].map((k) => t(k));
  const sig = { related_party: ["crit", "warning-octagon"], stopped_paying: ["warn", "warning"] };
  const name = (c) => ar() && c.name_ar
    ? `<span>${esc(c.name_ar)}</span><span class="sub" lang="en" dir="ltr">${esc(c.name_en)}</span>`
    : `<span>${esc(c.name_en)}</span>${c.name_ar ? `<span class="sub" lang="ar" dir="rtl">${esc(c.name_ar)}</span>` : ""}`;
  const terms = (d) => (d === "" || d == null ? "" : d === "0" ? t("cust.cash") : t("cust.terms", d));
  $("custTable").innerHTML = `<thead><tr>${H.map((h, i) => `<th${[3, 4, 5].includes(i) ? ' class="n"' : ""}>${esc(h)}</th>`).join("")}</tr></thead><tbody>` +
    list.map((c) => `<tr>
      <td class="lead">${name(c)}</td>
      <td data-label="${esc(H[1])}"><div>${esc(SEGMENTS[state.lang][c.segment] || c.segment || "")}${terms(c.terms_days) ? `<span class="sub">${esc(terms(c.terms_days))}</span>` : ""}</div></td>
      <td data-label="${esc(H[2])}"><div class="share"><span>${pct(c.share)}</span><i class="share-bar" style="width:${Math.max(2, (c.share / maxShare) * 100)}%"></i></div></td>
      <td class="n" data-label="${esc(H[3])}">${esc(money(c.revenue_net))}</td>
      <td class="n" data-label="${esc(H[4])}">${c.avg_days_to_pay ?? "-"}</td>
      <td class="n" data-label="${esc(H[5])}">${c.outstanding_past_due ? esc(money(c.outstanding_past_due)) : "-"}</td>
      <td data-label="${esc(H[6])}"><div class="chips">${(c.signals || []).map((s) => `<span class="pill ${sig[s]?.[0] || "info"}">${icon(sig[s]?.[1] || "info")}${esc(t(`sig.${s}`))}</span>`).join("") || "-"}</div></td></tr>`).join("") + "</tbody>";
}

// ---------- invoices ----------
function renderStatusSeg() {
  const counts = { all: 0 };
  for (const i of state.report.invoices) { counts.all++; counts[i.status] = (counts[i.status] || 0) + 1; }
  const opts = [["all", t("inv.all")], ["unmatched", t("st.unmatched")], ["partial", t("st.partial")], ["not_yet_due", t("st.not_yet_due")], ["matched", t("st.matched")]];
  if (state.evidence) opts.push(["evidence", t("inv.flagged")]);
  $("statusSeg").innerHTML = opts.map(([k, label]) => `<button type="button" data-status="${k}" aria-pressed="${state.status === k}">${esc(label)}<span class="count">${k === "evidence" ? state.evidence.size : counts[k] || 0}</span></button>`).join("");
}
function filteredInvoices() {
  const q = state.search.trim().toLowerCase();
  return state.report.invoices.filter((i) =>
    (state.status === "all" || (state.status === "evidence" ? state.evidence?.has(i.number) : i.status === state.status)) &&
    i.expected_sar >= (state.min || 0) &&
    (!q || i.number.toLowerCase().includes(q) || (i.customer || "").toLowerCase().includes(q) || (i.customer_name_on_invoice || "").includes(state.search.trim()))
  ).sort((a, b) => b.issue_date.localeCompare(a.issue_date) || b.number.localeCompare(a.number));
}
function timing(i) {
  if (i.status === "matched" && i.days_to_pay != null) return t("t.paid", count(i.days_to_pay, "day"));
  if (i.days_past_due > 0) return t("t.late", count(i.days_past_due, "day"));
  return t("t.due", dateLabel(i.due_date));
}
const STATUS_ICON = { matched: "check-circle", partial: "circle-half", unmatched: "warning", not_yet_due: "clock" };
const statusBadge = (s) => `<span class="status ${s}">${icon(STATUS_ICON[s] || "circle")}${esc(t(`st.${s}`))}</span>`;
function renderInvoices() {
  const rows = filteredInvoices();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  state.page = Math.min(state.page, pages - 1);
  const slice = rows.slice(state.page * PAGE, state.page * PAGE + PAGE);
  const H = ["inv.no", "inv.customer", "inv.amount", "inv.status", "inv.timing"].map((k) => t(k));
  $("invTable").innerHTML = `<thead><tr>${H.map((h, i) => `<th${i === 2 ? ' class="n"' : ""}>${esc(h)}</th>`).join("")}<th><span class="sr-only">${esc(t("inv.open"))}</span></th></tr></thead><tbody>` +
    (slice.map((i) => `<tr class="clickable" tabindex="0" data-no="${esc(i.number)}" aria-label="${esc(t("inv.open"))} ${esc(i.number)}">
      <td class="lead">${ltr(i.number)}<span class="sub">${esc(dateLabel(i.issue_date))}</span></td>
      <td data-label="${esc(H[1])}"><div>${esc(i.customer)}${i.flags.length ? `<span class="sub">${esc(i.flags.map((f) => t(`if.${f}`)).join(ar() ? "، " : ", "))}</span>` : ""}</div></td>
      <td class="n" data-label="${esc(H[2])}"><div>${esc(money2(i.expected_sar))}${i.original_currency !== "SAR" ? `<span class="sub">${esc(i.original_currency)} ${nf2.format(i.original_total)}</span>` : ""}</div></td>
      <td data-label="${esc(H[3])}">${statusBadge(i.status)}</td>
      <td data-label="${esc(H[4])}">${esc(timing(i))}</td>
      <td class="open-cue" aria-hidden="true">${icon("caret-right", "flip")}</td></tr>`).join("") ||
      `<tr><td colspan="6">${esc(t("inv.empty"))}</td></tr>`) + "</tbody>";
  $("invCount").textContent = rows.length ? t("inv.count", state.page * PAGE + 1, state.page * PAGE + slice.length, rows.length) : t("inv.zero");
  $("prevPage").disabled = state.page === 0;
  $("nextPage").disabled = state.page >= pages - 1;
}

// ---------- drawer ----------
let lastFocus = null;
function openDrawer(head, body) {
  lastFocus = document.activeElement;
  hideTip();
  $("drawerHead").innerHTML = head;
  $("drawerBody").innerHTML = body;
  $("drawer").classList.add("open");
  $("drawer").setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  $("closeDrawer").focus();
}
function closeDrawer() {
  if (!$("drawer").classList.contains("open")) return;
  $("drawer").classList.remove("open");
  $("drawer").setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  lastFocus?.focus();
}
function trapFocus(e) {
  if (e.key !== "Tab" || !$("drawer").classList.contains("open")) return;
  const f = [...$("drawer").querySelectorAll("button, a[href], [tabindex]:not([tabindex='-1'])")].filter((x) => !x.disabled);
  if (!f.length) return;
  if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
  else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
}

function openInvoice(no) {
  const i = state.report.invoices.find((x) => x.number === no);
  if (!i) return;
  const allocs = state.allocByInv.get(no) || [];
  const paid = allocs.reduce((s, a) => s + a.amount_sar, 0);
  const share = i.expected_sar ? Math.min(1, paid / i.expected_sar) : 0;
  const tone = i.status === "matched" ? "good" : i.status === "not_yet_due" ? "info" : "warn";
  const head = `<p class="kicker">${esc(t("d.invoice"))}</p><h2 id="drawerTitle">${ltr(i.number)}</h2><span class="pill ${tone}">${icon(STATUS_ICON[i.status])}${esc(t(`st.${i.status}`))}</span>`;
  const pays = allocs.map((a) => {
    const tx = state.creditByRef.get(a.bank_ref) || {};
    const shared = tx.credit && Math.abs(tx.credit - a.amount_sar) > 0.01;
    return `<div class="pay">
      <div class="pay-top"><span class="pay-amt">${esc(money2(a.amount_sar))}</span><span>${esc(dateLabel(a.date))}</span></div>
      <div class="pay-desc">${esc(tx.description || a.bank_ref)}</div>
      <div class="pay-src">${tx.source_file ? pdfLink(tx.source_file, tx.source_page) : ""}${refCopy(a.bank_ref)}</div>
      <div class="pay-meta">
        <span>${icon("link-simple")}${esc(t("d.method", t(`m.${a.method}`), pct(a.confidence, 0)))}</span>
        <span>${icon("bank")}${esc(t("d.account", tx.bank || "", (tx.iban || "").slice(-4)))}</span>
      </div>
      ${shared ? `<p class="note">${esc(t("d.shared", money2(tx.credit)))}</p>` : ""}
    </div>`;
  }).join("");
  const body = `<div class="trail">
    <section class="trail-step"><span class="trail-dot">${icon("receipt")}</span><h3>${esc(t("d.step1"))}</h3>
      <dl class="kv">
        <dt>${esc(t("d.customer"))}</dt><dd>${esc(i.customer)}</dd>
        <dt>${esc(t("d.issued"))}</dt><dd>${esc(dateLabel(i.issue_date))}</dd>
        <dt>${esc(t("d.due"))}</dt><dd>${esc(dateLabel(i.due_date))}<small>${esc(timing(i))}</small></dd>
        <dt>${esc(t("d.net"))}</dt><dd>${esc(money2(i.net_sar))}${i.original_currency !== "SAR" ? `<small>${esc(t("d.fx", i.original_currency, nf2.format(i.original_total)))}</small>` : ""}</dd>
        <dt>${esc(t("d.expected"))}</dt><dd>${esc(money2(i.expected_sar))}${i.credit_note ? `<small>${esc(t("d.creditNote", i.credit_note))}</small>` : ""}</dd>
      </dl>
    </section>
    <section class="trail-step"><span class="trail-dot">${icon("table")}</span><h3>${esc(t("d.step2"))}</h3>
      ${sourceRow(i)}
    </section>
    <section class="trail-step"><span class="trail-dot">${icon("bank")}</span><h3>${esc(t("d.step3"))}</h3>
      <div class="paid-sum"><div class="row"><span>${esc(t("d.paid"))}</span><strong>${esc(t("d.of", money2(paid), money2(i.expected_sar)))}</strong></div>
        <div class="bar" role="img" aria-label="${pct(share, 0)}"><i style="width:${share * 100}%"></i></div></div>
      ${pays || `<p class="empty-pay">${esc(t("d.none"))}${i.status === "not_yet_due" ? ` ${esc(t("d.notDue"))}` : ""}</p>`}
    </section>
  </div>`;
  openDrawer(head, body);
}

function openTransfers(flag) {
  const { title, detail } = flagText(flag);
  const sev = SEV[flag.severity];
  const head = `<p class="kicker">${esc(t(`sev.${flag.severity}`))}</p><h2 id="drawerTitle">${esc(title)}</h2>`;
  const total = flag.evidence.reduce((s, x) => s + x.amount, 0);
  const rows = flag.evidence.map((x) => `<div class="pay">
      <div class="pay-top"><span class="pay-amt">${esc(money2(x.amount))}</span><span>${esc(dateLabel(x.date))}</span></div>
      <div class="pay-desc">${esc(x.description)}</div>
      <div class="pay-src">${pdfLink(x.source_file, x.source_page)}${refCopy(x.reference)}</div>
    </div>`).join("");
  openDrawer(head, `<div class="flag ${sev.cls}"><p>${esc(detail)}</p></div>
    <h3>${esc(t("d.transfersTitle"))}: ${esc(count(flag.evidence.length, "transfer"))}${ar() ? "، " : ", "}${esc(money(total))}</h3>${rows}`);
}

// ---------- sources: every figure is one click from its document ----------
const SAMPLE_INVOICES = "invoices_2025-10_to_2026-09.xlsx";
// Uploaded files never leave the browser's memory: object URLs stand in for server paths.
function setUploads(fd) {
  revokeUploads();
  const inv = fd.get("invoices");
  state.uploads = {
    invoices: { name: inv.name, url: URL.createObjectURL(inv) },
    statements: new Map(fd.getAll("statements").map((f) => [f.name, URL.createObjectURL(f)])),
  };
}
function revokeUploads() {
  if (!state.uploads) return;
  URL.revokeObjectURL(state.uploads.invoices.url);
  state.uploads.statements.forEach((u) => URL.revokeObjectURL(u));
  state.uploads = null;
}
function pdfHref(file, page) {
  const base = state.source === "upload"
    ? state.uploads?.statements.get(file)
    : `${API}/sample-data/statements/${encodeURIComponent(file)}?inline=1`;
  return base ? `${base}#page=${page || 1}` : null;
}
function pdfLink(file, page) {
  const label = `${ltr(file)} <small>${esc(t("src.page", page || 1))}</small>`;
  const href = pdfHref(file, page);
  if (!href) return `<span class="src">${icon("file-pdf")}<span>${label}</span></span>`;
  return `<a class="src" href="${esc(href)}" target="_blank" rel="noopener" aria-label="${esc(t("src.openPdf", file, page || 1))}">${icon("file-pdf")}<span>${label}</span></a>`;
}
function refCopy(ref) {
  return `<span class="ref">${esc(t("d.ref"))} ${ltr(ref)}<button type="button" class="copy" data-copy="${esc(ref)}" aria-label="${esc(t("src.copy", ref))}" title="${esc(t("src.copyShort"))}">${icon("copy")}</button></span>`;
}
async function copyRef(btn) {
  const text = btn.dataset.copy;
  try { await navigator.clipboard.writeText(text); } catch {
    const ta = Object.assign(document.createElement("textarea"), { value: text });
    document.body.append(ta); ta.select();
    try { document.execCommand("copy"); } catch { /* nothing else to try */ }
    ta.remove();
  }
  btn.classList.add("done"); btn.innerHTML = icon("check");
  $("liveMsg").textContent = t("src.copied");
  setTimeout(() => { btn.classList.remove("done"); btn.innerHTML = icon("copy"); $("liveMsg").textContent = ""; }, 1600);
}
// Browsers can't show .xlsx, so the drawer redraws the source row as the spreadsheet shows it.
function sourceRow(i) {
  const m = /^(.*)!row (\d+)$/.exec(i.source_ref || "");
  if (!m) return `<p class="note">${esc(i.source_ref || "")}</p>`;
  const [, sheet, row] = m;
  const dmy = (s) => (s ? s.split("-").reverse().join("/") : "");
  const cols = [
    ["A", "Invoice No", i.number], ["B", "Invoice Date", dmy(i.issue_date)], ["C", "Due Date", dmy(i.due_date)],
    ["D", "Customer Name", i.customer_name_on_invoice || i.customer], ["I", "Currency", i.original_currency], ["L", "Total", nf2.format(i.original_total), true],
  ];
  const up = state.source === "upload" ? state.uploads?.invoices : null;
  const href = up ? up.url : `${API}/sample-data/${SAMPLE_INVOICES}`;
  const fileName = up ? up.name : SAMPLE_INVOICES;
  const td = (v, num) => `<td${num ? ' class="num"' : ""}>${esc(v)}</td>`;
  return `<div class="sheet">
    <div class="sheet-scroll" dir="ltr"><table class="xl" lang="en">
      <thead><tr><th class="g"></th>${cols.map(([c]) => `<th>${c}</th>`).join("")}</tr></thead>
      <tbody>
        <tr class="hdr"><th class="g" scope="row"></th>${cols.map(([, h]) => `<td>${esc(h)}</td>`).join("")}</tr>
        <tr class="gap"><th class="g">⋮</th><td colspan="${cols.length}"></td></tr>
        <tr class="hit"><th class="g" scope="row">${row}</th>${cols.map(([, , v, num]) => td(v, num)).join("")}</tr>
      </tbody>
    </table></div>
    <div class="sheet-foot">
      <span class="sheet-tab">${icon("table")}<bdi dir="ltr">${esc(sheet)}</bdi></span>
      <a class="src" href="${esc(href)}" download="${esc(fileName)}">${icon("file-xls")}<span>${esc(t("src.xls", row))}</span></a>
    </div>
  </div>
  <p class="sheet-note">${esc(t("src.hidden"))}</p>`;
}

// ---------- memo ----------
function renderMarkdown(md) {
  const lines = esc(md).split("\n");
  let html = "", list = null;
  const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const l = raw.trim();
    if (/^#{1,3} /.test(l)) { close(); html += `<h2>${inline(l.replace(/^#+ /, ""))}</h2>`; }
    else if (/^[-*] /.test(l)) { if (list !== "ul") { close(); html += "<ul>"; list = "ul"; } html += `<li>${inline(l.slice(2))}</li>`; }
    else if (/^\d+[.)] /.test(l)) { if (list !== "ol") { close(); html += "<ol>"; list = "ol"; } html += `<li>${inline(l.replace(/^\d+[.)] /, ""))}</li>`; }
    else if (l) { close(); html += `<p>${inline(l)}</p>`; }
    else close();
  }
  close();
  return html;
}
function renderMemo() {
  $("writeMemoLabel").textContent = state.memo ? t("memo.rewrite") : t("memo.write");
  if (!state.memo) { $("memoBody").innerHTML = `<div class="memo-empty">${icon("note-pencil")}<span>${esc(t("memo.empty"))}</span></div>`; return; }
  const memo = state.memo;
  const src = memo.source === "claude" ? t("memo.claude", memo.model) : /ANTHROPIC_API_KEY/.test(memo.note || "") ? t("memo.template") : memo.note ? t("memo.fallback") : t("memo.templatePlain");
  $("memoBody").innerHTML = renderMarkdown(ar() ? isoNumbers(memo.memo_markdown.replace(/ريال/g, "ر.س")) : memo.memo_markdown) + `<p class="memo-source">${esc(src)}</p>`;
}
async function writeMemo() {
  const r = state.report, btn = $("writeMemo"), lang = state.lang;
  btn.disabled = true; $("writeMemoLabel").textContent = t("memo.writing");
  $("memoBody").innerHTML = `<p class="note">${esc(t("memo.wait"))}</p><div class="loading-block" style="margin-top:16px">${[90, 75, 85, 60, 80].map((w) => `<div class="skeleton" style="height:14px;width:${w}%"></div>`).join("")}</div>`;
  try {
    const pkg = Object.fromEntries(["applicant", "period", "metrics", "monthly", "customers", "aging", "flags", "data_quality"].map((k) => [k, r[k]]));
    const memo = await getJSON(`${API}/memo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...pkg, lang }) });
    if (lang !== state.lang || r !== state.report) return; // language or applicant changed while writing
    state.memo = memo;
    renderMemo();
  } catch (e) {
    $("memoBody").innerHTML = `<p class="load-error">${icon("warning-circle")}<span>${esc(t("memo.error"))} ${esc(errorText(e))}</span></p>`;
    $("writeMemoLabel").textContent = state.memo ? t("memo.rewrite") : t("memo.write");
  } finally {
    btn.disabled = false;
  }
}

// ---------- how it was built ----------
async function renderBuilt(r) {
  const q = r.data_quality;
  const missing = q.invoice_months_missing.length + Object.values(q.statement_months_missing).flat().length;
  const stmOk = q.statements_passing_balance_check === q.statements;
  const checks = [
    [true, t("q.rows"), t("q.rowsSub", q.duplicates_removed, q.credit_notes), nf0.format(q.rows_read)],
    [true, t("q.fx"), t("q.fxSub"), nf0.format(q.fx_converted)],
    [!q.entity_mismatch, t("q.entity"), t("q.entitySub"), nf0.format(q.entity_mismatch)],
    [stmOk, t("q.stm"), t("q.stmSub"), t("q.of", q.statements_passing_balance_check, q.statements)],
    [true, t("q.tx"), q.accounts.map((a) => `${a.bank} ••${(a.iban || "").slice(-4)}`).join(ar() ? "، " : ", "), nf0.format(q.statement_rows)],
    [!missing, t("q.months"), missing ? t("q.monthsMissing") : t("q.monthsOk"), missing ? t("q.gaps") : t("q.complete")],
    [!r.review_queue.length, t("q.review"), t("q.reviewSub"), nf0.format(r.review_queue.length)],
  ];
  $("checks").innerHTML = checks.map(([ok, label, sub, v]) => `<li class="check ${ok ? "ok" : "attn"}">${icon(ok ? "check-circle" : "warning")}<div><b>${esc(label)}</b><small>${esc(sub)}</small></div><span class="v">${esc(v)}</span></li>`).join("");
  // uncertain payer names, each with the statement page it came from
  $("review").innerHTML = r.review_queue.length ? `<h3>${esc(t("q.reviewTitle"))}</h3>` + r.review_queue.map((x) => {
    const tx = state.creditByRef.get(x.bank_ref) || {};
    return `<div class="pay">
      <div class="pay-top"><span class="pay-amt">${esc(money2(x.amount))}</span><span>${esc(dateLabel(x.date))}</span></div>
      <div class="pay-desc">${esc(x.description)}</div>
      <div class="pay-src">${tx.source_file ? pdfLink(tx.source_file, tx.source_page) : ""}${refCopy(x.bank_ref)}</div>
      <div class="pay-meta"><span>${icon("user-focus")}${esc(t("q.reviewItem", x.suggested_customer || "-", pct(x.name_confidence || 0, 0)))}</span></div>
    </div>`;
  }).join("") : "";

  const byMethod = {};
  for (const a of r.allocations) byMethod[a.method] = (byMethod[a.method] || 0) + a.amount_sar;
  const total = Object.values(byMethod).reduce((s, v) => s + v, 0) || 1;
  const order = ["reference", "statement", "exact", "cash_batch", "fifo"];
  const rank = (k) => (order.includes(k) ? order.indexOf(k) : 99);
  const methods = Object.entries(byMethod).sort((a, b) => rank(a[0]) - rank(b[0]));
  const maxV = Math.max(...methods.map(([, v]) => v), 1);
  $("methods").innerHTML = methods.map(([k, v]) => `<div class="method"><span>${esc(t(`m.${k}`))}</span><i style="width:${(v / maxV) * 100}%"></i><span class="v">${pct(v / total)}</span></div>`).join("");

  const acc = q.matching_accuracy;
  $("accuracy").innerHTML = acc
    ? [["q.precision", "q.precisionTip", acc.precision], ["q.recall", "q.recallTip", acc.recall]].map(([l, tip, v]) =>
      `<div class="fig"><div class="fig-label"><span>${esc(t(l))}</span>${tipButton(t(tip), t(l))}</div><div class="fig-value">${pct(v)}</div></div>`).join("")
    : `<p class="note">${esc(t("q.noAccuracy"))}</p>`;

  try {
    if (!state.files) state.files = await getJSON(`${API}/sample-data`);
    const files = state.files.map((f) => ({ ...f, path: f.path.split("\\").join("/") }));
    const main = files.filter((f) => (!f.path.startsWith("statements/") && !f.path.endsWith(".json")) || f.path === "organization.json");
    const stm = files.filter((f) => f.path.startsWith("statements/"));
    const kb = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
    const link = (f, label) => `<a href="${API}/sample-data/${encodeURI(f.path)}" download dir="ltr">${esc(label || f.path)}</a>`;
    $("sampleFiles").innerHTML = main.map((f) => `<li>${icon("download-simple")}${link(f)}<span class="size" dir="ltr">${kb(f.bytes)}</span></li>`).join("") +
      `<li class="statements-list">${icon("file-pdf")} ${esc(t("q.statements", stm.length))}: ${stm.map((f) => link(f, f.path.replace("statements/", "").replace(".pdf", ""))).join(", ")}</li>`;
  } catch { /* the file list is optional */ }
}

// ---------- chart tooltip ----------
function showTip(ev, html) {
  const tip = $("tooltip");
  tip.innerHTML = html; tip.hidden = false;
  tip.dir = ar() ? "rtl" : "ltr";
  const b = tip.getBoundingClientRect();
  let x = ev.clientX + 14, y = ev.clientY + 14;
  if (x + b.width > innerWidth - 8) x = ev.clientX - b.width - 14;
  if (y + b.height > innerHeight - 8) y = ev.clientY - b.height - 14;
  tip.style.left = `${Math.max(8, x)}px`; tip.style.top = `${Math.max(8, y)}px`;
}
function hideTip() { $("tooltip").hidden = true; }

function openUpload() { $("uploadError").hidden = true; $("uploadDialog").showModal(); }

function fileName(input) {
  const out = input.closest(".file").querySelector(".file-name");
  const files = [...input.files];
  out.textContent = !files.length ? t("up.none") : files.length === 1 ? files[0].name : t("up.many", files.length);
}

// ---------- events ----------
function wire() {
  wireTabs();
  document.querySelectorAll(".file input").forEach((inp) => inp.addEventListener("change", () => fileName(inp)));
  document.querySelectorAll(".lang-switch button").forEach((b) => { b.onclick = () => setLang(b.dataset.lang); });
  $("toggleTable").onclick = () => {
    const open = $("ledgerTable").hidden;
    $("ledgerTable").hidden = !open;
    $("toggleTable").setAttribute("aria-expanded", String(open));
    $("toggleTable").textContent = open ? t("table.hide") : t("table.show");
  };
  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-goflag]");
    if (go) return focusFlag(+go.dataset.goflag);
    const fb = e.target.closest("button[data-flag]");
    if (fb) return runFlagAction(+fb.dataset.flag, fb.dataset.kind);
    const tr = e.target.closest("#invTable tr.clickable");
    if (tr) return openInvoice(tr.dataset.no);
    const cp = e.target.closest("button.copy");
    if (cp) return copyRef(cp);
    const tipb = e.target.closest(".tipbtn");
    document.querySelectorAll(".tipwrap.open").forEach((w) => { if (!tipb || w !== tipb.parentElement) w.classList.remove("open"); });
    if (tipb) tipb.parentElement.classList.toggle("open");
  });
  $("invTable").addEventListener("keydown", (e) => {
    const tr = e.target.closest("tr.clickable");
    if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openInvoice(tr.dataset.no); }
  });
  $("statusSeg").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-status]");
    if (!b) return;
    state.status = b.dataset.status; state.page = 0;
    if (state.status !== "evidence") state.evidence = null;
    renderStatusSeg(); renderInvoices();
  });
  $("toggleCust").onclick = () => { state.showAllCustomers = !state.showAllCustomers; renderCustomers(state.report); };
  let deb;
  $("invSearch").oninput = (e) => { clearTimeout(deb); deb = setTimeout(() => { state.search = e.target.value; state.page = 0; renderInvoices(); }, 150); };
  $("invMin").oninput = (e) => { state.min = +e.target.value || 0; state.page = 0; renderInvoices(); };
  $("prevPage").onclick = () => { state.page--; renderInvoices(); };
  $("nextPage").onclick = () => { state.page++; renderInvoices(); };
  $("closeDrawer").onclick = closeDrawer;
  $("drawer").onclick = (e) => { if (e.target === $("drawer")) closeDrawer(); };
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!$("moreMenu").hidden) { closeMore(); $("moreBtn").focus(); }
      closeDrawer(); document.querySelectorAll(".tipwrap.open").forEach((w) => w.classList.remove("open"));
    }
    trapFocus(e);
  });
  $("writeMemo").onclick = writeMemo;
  $("openUpload").onclick = openUpload;
  $("cancelUpload").onclick = () => $("uploadDialog").close();
  $("backToSample").onclick = loadSample;
  $("uploadForm").onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("submitUpload");
    btn.disabled = true; btn.textContent = t("up.busy");
    $("uploadError").hidden = true;
    try {
      const fd = new FormData(e.target);
      for (const k of ["customers", "organization"]) if (!fd.get(k)?.size) fd.delete(k);
      const report = await getJSON(`${API}/analyze`, { method: "POST", body: fd });
      setUploads(fd);
      setReport(report, "upload");
      $("uploadDialog").close();
      window.scrollTo({ top: 0 });
    } catch (err) {
      $("uploadError").innerHTML = `${icon("warning-circle")}<span>${esc(errorText(err))}</span>`;
      $("uploadError").hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = t("up.submit");
    }
  };
  let rz;
  addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => state.report && !$("p-overview").hidden && drawLedger(state.report.monthly), 150); });
  addEventListener("hashchange", () => showTab(location.hash.slice(1), { push: false }));
}

let saved = null;
try { saved = localStorage.getItem("lang"); } catch { /* storage is optional */ }
state.lang = saved === "en" ? "en" : "ar";
applyStaticText();
wire();
showTab(location.hash.slice(1) || "overview", { push: false });
loadSample();
