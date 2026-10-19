"use strict";

const API = "/api";
const PAGE = 25;
const state = { report: null, source: "sample", status: "all", search: "", min: 0, page: 0, allocByInv: new Map(), creditByRef: new Map(), lang: "en" };
const $ = (id) => document.getElementById(id);

// ---------- language ----------
const I18N = {
  en: {
    "doc.title": "Financing Package Review",
    "lang.switch": "عربي", "lang.switchLabel": "التبديل إلى العربية",
    "skip": "Skip to content", "brand.name": "Qawafel", "brand.sub": "financing package", "nav.data": "Data",
    "nav.upload": "Analyze your own files", "nav.sample": "Sample data",
    "banner.text": "Showing the files you uploaded.", "banner.back": "Back to the sample applicant",
    "loading": "Reading invoices and bank statements…",
    "legend": "Legend", "legend.collected": "Confirmed by bank deposits", "legend.pastdue": "Past due, not found in bank", "legend.notdue": "Not yet due",
    "table.show": "Show as table", "table.hide": "Hide table",
    "chart.caption": "Monthly invoiced value split into confirmed, past due and not yet due.",
    "att.title": "Needs attention", "att.note": "Signals for the analyst to judge. Qawafel does not score or decide.",
    "fig.title": "Key figures", "cust.title": "Who pays this business",
    "aging.title": "Unpaid invoices by age", "aging.note": "Outstanding at the end of the period, by days past the due date.",
    "inv.title": "Invoices and the payments behind them", "inv.filter": "Filter invoices",
    "inv.search": "Customer or invoice", "inv.searchPh": "e.g. Al Majd or INV-26-0412", "inv.min": "Min. SAR",
    "prev": "Previous", "next": "Next",
    "memo.title": "Briefing memo", "memo.write": "Write memo", "memo.rewrite": "Rewrite memo", "memo.writing": "Writing…",
    "memo.note": "Drafted by Claude from the verified figures above. It summarises evidence and questions; it does not recommend a decision.",
    "q.title": "How this package was built", "q.sample": "Sample data", "q.sampleNote": "Fully synthetic. The applicant, customers and banks are fictional.",
    "close": "Close",
    "up.title": "Analyze your own files",
    "up.note": "Statements must use the sample banks' PDF layout (one parser per bank template). Download the sample files to see the expected format.",
    "up.inv": "Invoices (.xlsx)", "up.stm": "Bank statements (.pdf, up to 36)", "up.cust": "Customer master (.csv, optional)", "up.org": "Applicant profile (.json, optional)",
    "up.cancel": "Cancel", "up.submit": "Analyze files", "up.busy": "Analyzing…",
  },
  ar: {
    "doc.title": "مراجعة ملف التمويل",
    "lang.switch": "English", "lang.switchLabel": "Switch to English",
    "skip": "انتقل إلى المحتوى", "brand.name": "قوافل", "brand.sub": "ملف التمويل", "nav.data": "البيانات",
    "nav.upload": "حلّل ملفاتك", "nav.sample": "بيانات العينة",
    "banner.text": "تُعرض الملفات التي رفعتها.", "banner.back": "العودة إلى مقدم الطلب النموذجي",
    "loading": "جارٍ قراءة الفواتير وكشوف الحساب البنكية…",
    "legend": "مفتاح الألوان", "legend.collected": "مؤكدة بإيداعات بنكية", "legend.pastdue": "متأخرة ولم يُعثر عليها في البنك", "legend.notdue": "لم تستحق بعد",
    "table.show": "اعرض كجدول", "table.hide": "إخفاء الجدول",
    "chart.caption": "قيمة الفواتير الشهرية مقسّمة إلى مؤكدة ومتأخرة ولم تستحق بعد.",
    "att.title": "يحتاج إلى انتباه", "att.note": "مؤشرات يقيّمها المحلل. قوافل لا تمنح تقييمًا ولا تتخذ القرار.",
    "fig.title": "أرقام رئيسية", "cust.title": "من يدفع لهذه المنشأة",
    "aging.title": "الفواتير غير المسددة حسب العمر", "aging.note": "المبالغ القائمة في نهاية الفترة، حسب الأيام بعد تاريخ الاستحقاق.",
    "inv.title": "الفواتير والمدفوعات المرتبطة بها", "inv.filter": "تصفية الفواتير",
    "inv.search": "العميل أو الفاتورة", "inv.searchPh": "مثال: Al Majd أو INV-26-0412", "inv.min": "الحد الأدنى (ريال)",
    "prev": "السابق", "next": "التالي",
    "memo.title": "مذكرة إحاطة", "memo.write": "اكتب المذكرة", "memo.rewrite": "أعد كتابة المذكرة", "memo.writing": "جارٍ الكتابة…",
    "memo.note": "يصوغها Claude من الأرقام الموثّقة أعلاه. تلخّص الأدلة والأسئلة ولا توصي بقرار.",
    "q.title": "كيف أُعدّ هذا الملف", "q.sample": "بيانات العينة", "q.sampleNote": "بيانات اصطناعية بالكامل. مقدم الطلب والعملاء والبنوك وهمية.",
    "close": "إغلاق",
    "up.title": "حلّل ملفاتك",
    "up.note": "يجب أن تتبع الكشوف تنسيق PDF للبنوك النموذجية (محلّل واحد لكل قالب بنك). نزّل ملفات العينة للاطلاع على التنسيق المطلوب.",
    "up.inv": "الفواتير (.xlsx)", "up.stm": "كشوف الحساب (.pdf، حتى 36)", "up.cust": "سجل العملاء (.csv، اختياري)", "up.org": "ملف مقدم الطلب (.json، اختياري)",
    "up.cancel": "إلغاء", "up.submit": "حلّل الملفات", "up.busy": "جارٍ التحليل…",
  },
};
const ar = () => state.lang === "ar";
const t = (k) => I18N[state.lang][k] ?? I18N.en[k] ?? k;
const L = (en, arText) => (ar() ? arText : en);

function applyStaticText() {
  const root = document.documentElement;
  root.lang = state.lang;
  root.dir = ar() ? "rtl" : "ltr";
  document.title = t("doc.title");
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
  const b = $("langToggle");
  b.textContent = t("lang.switch");
  b.lang = ar() ? "en" : "ar";
  b.setAttribute("aria-label", t("lang.switchLabel"));
  $("toggleTable").textContent = $("ledgerTable").hidden ? t("table.show") : t("table.hide");
}

function setLang(lang) {
  state.lang = lang === "ar" ? "ar" : "en";
  try { localStorage.setItem("lang", state.lang); } catch { /* storage is optional */ }
  applyStaticText();
  if (state.report) render();
}

// ---------- formatting ----------
const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateLocale = () => (ar() ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB");
const sar = (x) => L(`SAR ${nf0.format(x)}`, `${nf0.format(x)} ريال`);
const sar2 = (x) => L(`SAR ${nf2.format(x)}`, `${nf2.format(x)} ريال`);
const sarShort = (x) => Math.abs(x) >= 1e6
  ? L(`SAR ${(x / 1e6).toFixed(2)}M`, `${(x / 1e6).toFixed(2)} مليون ريال`)
  : L(`SAR ${nf0.format(Math.round(x / 1e3))}K`, `${nf0.format(Math.round(x / 1e3))} ألف ريال`);
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const monthLabel = (m) => new Date(m + "-01T00:00:00").toLocaleDateString(dateLocale(), { month: "short", year: "2-digit" });
const monthLong = (m) => new Date(m + "-01T00:00:00").toLocaleDateString(dateLocale(), { month: "long", year: "numeric" });
const dateLabel = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString(dateLocale(), { day: "numeric", month: "short", year: "numeric" }) : "";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Arabic counted noun: 1 and 2 have their own forms, 3-10 take the plural, 11+ the singular
const countAr = (n, [one, two, few, many]) => n === 1 ? one : n === 2 ? two : (n % 100 >= 3 && n % 100 <= 10) ? `${n} ${few}` : `${n} ${many}`;
const DAYS_AR = ["يوم واحد", "يومان", "أيام", "يومًا"];
const INVOICES_AR = ["فاتورة واحدة", "فاتورتان", "فواتير", "فاتورة"];
const days = (n) => L(`${n} days`, countAr(n, DAYS_AR));
const STATUS_TEXT = {
  en: { matched: "Paid", partial: "Partly paid", unmatched: "Not found in bank", not_yet_due: "Not yet due" },
  ar: { matched: "مسددة", partial: "مسددة جزئيًا", unmatched: "غير موجودة في البنك", not_yet_due: "لم تستحق بعد" },
};
const METHOD_TEXT = {
  en: {
    reference: "Transfer quotes the invoice number", statement: "Monthly statement payment", exact: "Exact amount match",
    fifo: "Oldest-first allocation", cash_batch: "Weekly cash deposit",
  },
  ar: {
    reference: "التحويل يذكر رقم الفاتورة", statement: "سداد كشف حساب شهري", exact: "تطابق تام في المبلغ",
    fifo: "تخصيص للأقدم أولًا", cash_batch: "إيداع نقدي أسبوعي",
  },
};
const statusText = (s) => STATUS_TEXT[state.lang][s] || s;
const methodText = (m) => METHOD_TEXT[state.lang][m] || m;
const SEV_ICON = {
  critical: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 0.5h5l3 3v5l-3 3h-5l-3-3v-5z" fill="currentColor"/><path d="M6 3v3.5M6 8.3v.2" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/></svg>',
  warning: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 .8 11.5 11H.5z" fill="currentColor"/><path d="M6 4.5v3M6 9.2v.2" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/></svg>',
  info: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5.5" fill="currentColor"/><path d="M6 5.5v3.2M6 3.4v.2" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/></svg>',
};
const SEV_TEXT = { en: { critical: "Critical", warning: "Warning", info: "Note" }, ar: { critical: "حرج", warning: "تحذير", info: "ملاحظة" } };
const SEGMENT_AR = { export: "تصدير", grocery: "بقالة", horeca: "فنادق ومطاعم", key_account: "عميل رئيسي", related: "ذو علاقة", supermarket: "سوبرماركت" };
const SECTOR_AR = { "Food and FMCG wholesale": "تجارة الجملة للأغذية والسلع الاستهلاكية" };
const flagTitle = (f) => (ar() && f.title_ar) || f.title;
const flagDetail = (f) => (ar() && f.detail_ar) || f.detail;

// ---------- data ----------
async function getJSON(url, opts) {
  const res = await fetch(url, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || L(`Request failed (${res.status}).`, `فشل الطلب (${res.status}).`));
  return body;
}

async function loadSample() {
  $("loading").hidden = false;
  $("loadError").hidden = true;
  try {
    setReport(await getJSON(`${API}/applications/demo/report`), "sample");
  } catch (e) {
    $("loadError").textContent = L(`The package could not be loaded: ${e.message}`, `تعذّر تحميل الملف: ${e.message}`);
    $("loadError").hidden = false;
  } finally {
    $("loading").hidden = true;
  }
}

function setReport(report, source) {
  state.report = report;
  state.source = source;
  state.page = 0;
  state.allocByInv = new Map();
  for (const a of report.allocations) {
    if (!state.allocByInv.has(a.invoice_number)) state.allocByInv.set(a.invoice_number, []);
    state.allocByInv.get(a.invoice_number).push(a);
  }
  state.creditByRef = new Map(report.credits.map((c) => [c.reference, c]));
  $("uploadBanner").hidden = source !== "upload";
  render();
}

// ---------- render ----------
function render() {
  const r = state.report;
  for (const id of ["applicant", "hero", "body", "disclaimer"]) $(id).hidden = false;
  $("main").setAttribute("aria-busy", "false");
  renderApplicant(r);
  renderHero(r);
  renderFlags(r);
  renderFigures(r);
  renderCustomers(r);
  renderAging(r);
  renderStatusSeg();
  renderInvoices();
  $("memoBody").innerHTML = "";
  $("writeMemo").textContent = t("memo.write");
  renderQuality(r);
  $("disclaimer").textContent = (ar() && r.disclaimer_ar) || r.disclaimer;
}

function renderApplicant(r) {
  const a = r.applicant || {};
  const primary = (ar() && a.legal_name_ar) || a.legal_name || L("Uploaded applicant", "مقدم الطلب المرفوع");
  const secondary = ar() ? (a.legal_name_ar ? a.legal_name : "") : a.legal_name_ar || "";
  $("appName").textContent = primary;
  $("appNameAr").textContent = secondary || "";
  $("appNameAr").lang = ar() ? "en" : "ar";
  $("appNameAr").dir = ar() ? "ltr" : "rtl";
  $("appNameAr").hidden = !secondary;
  const none = L("Not provided", "غير متوفر");
  const facts = [
    [L("Period", "الفترة"), `${dateLabel(r.period.start)} – ${dateLabel(r.period.end)}`],
    [L("Sector", "القطاع"), (ar() && SECTOR_AR[a.sector]) || a.sector || none],
    [L("CR number", "السجل التجاري"), a.cr_number || none],
    [L("VAT number", "الرقم الضريبي"), a.vat_number || none],
  ];
  $("appFacts").innerHTML = facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
}

function renderHero(r) {
  const m = r.metrics;
  $("heroRate").textContent = pct(m.match_rate);
  $("heroText").textContent = L("of invoiced sales that should have been paid by now is confirmed by bank deposits.",
    "من المبيعات المفوترة التي كان يجب سدادها حتى الآن مؤكدة بإيداعات بنكية.");
  const statusCounts = m.invoice_status || {};
  const accounts = r.data_quality.accounts.length;
  const related = r.flags.some((f) => f.type === "related_party");
  $("heroSub").textContent = ar()
    ? `تم تتبّع ${sarShort(m.collectible_collected_gross)} من أصل ${sarShort(m.collectible_invoiced_gross)} إلى إيداعات في ` +
      `${accounts === 1 ? "حساب بنكي واحد" : `${accounts} حسابات بنكية`}. ` +
      `الفواتير الصادرة في الأسابيع الأخيرة تظهر كـ«لم تستحق بعد» (${nf0.format(statusCounts.not_yet_due || 0)} فاتورة).` +
      (related ? " يشمل ذلك دفعات من طرف ذي علاقة محتمل، مُشار إليه أدناه." : "")
    : `${sarShort(m.collectible_collected_gross)} of ${sarShort(m.collectible_invoiced_gross)} traced to deposits across ` +
      `${accounts} bank account${accounts === 1 ? "" : "s"}. ` +
      `Invoices issued in the last weeks are shown as not yet due (${nf0.format(statusCounts.not_yet_due || 0)} invoices).` +
      (related ? " This includes payments from a possible related party, flagged below." : "");
  drawLedger(r.monthly);
  renderLedgerTable(r.monthly);
}

function drawLedger(monthly) {
  const W = 1100, H = 300, padL = 56, padR = 8, padT = 12, padB = 30;
  const max = Math.max(...monthly.map((d) => d.invoiced_gross || 0)) || 1;
  const step = max > 1.5e6 ? 500000 : 250000;
  const top = Math.ceil(max / step) * step;
  const y = (v) => padT + (H - padT - padB) * (1 - v / top);
  const colW = (W - padL - padR) / monthly.length;
  const barW = Math.min(56, colW * 0.62);
  const mUnit = L("M", "م");
  let svg = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><g class="grid">`;
  for (let v = 0; v <= top; v += step) {
    svg += `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/>`;
  }
  svg += `</g><g class="axis">`;
  for (let v = 0; v <= top; v += step) {
    svg += `<text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end">${v === 0 ? "0" : (v / 1e6).toFixed(v % 1e6 ? 2 : 0).replace(/\.?0+$/, "") + mUnit}</text>`;
  }
  monthly.forEach((d, i) => {
    svg += `<text x="${padL + colW * i + colW / 2}" y="${H - 8}" text-anchor="middle">${monthLabel(d.month)}</text>`;
  });
  svg += `</g>`;
  const segs = [["collected", "var(--collected)"], ["open_past_due", "var(--pastdue)"], ["not_yet_due", "var(--notdue)"]];
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
      const r = isTop ? Math.min(4, h / 2) : 0;
      // rounded top on the last segment only, square at the baseline
      svg += isTop
        ? `<path d="M${x},${y0 - gap} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + barW - r} Q${x + barW},${y1} ${x + barW},${y1 + r} V${y0 - gap} Z" fill="${color}"/>`
        : `<rect x="${x}" y="${y1}" width="${barW}" height="${h}" fill="${color}"/>`;
      base += v;
    });
    svg += `</g>`;
  });
  svg += `</svg>`;
  const el = $("ledgerChart");
  el.innerHTML = svg;
  el.setAttribute("aria-label", L(
    `Monthly invoiced sales, ${monthLabel(monthly[0].month)} to ${monthLabel(monthly.at(-1).month)}. Use "Show as table" for exact values.`,
    `المبيعات المفوترة شهريًا، من ${monthLabel(monthly[0].month)} إلى ${monthLabel(monthly.at(-1).month)}. استخدم «اعرض كجدول» للقيم الدقيقة.`));
  el.querySelectorAll(".col").forEach((g) => {
    const d = monthly[+g.dataset.i];
    g.addEventListener("mousemove", (ev) => showTip(ev, ledgerTip(d)));
    g.addEventListener("mouseleave", hideTip);
  });
}

function ledgerTip(d) {
  const collectible = (d.collected || 0) + (d.open_past_due || 0);
  return `<b>${monthLong(d.month)}</b>
    <div class="row"><span>${L("Invoiced (incl. VAT)", "المفوتر (شامل الضريبة)")}</span><span>${sarShort(d.invoiced_gross || 0)}</span></div>
    <div class="row"><span><i style="background:var(--collected)"></i>${L("Confirmed", "مؤكد")}</span><span>${sarShort(d.collected || 0)}</span></div>
    <div class="row"><span><i style="background:var(--pastdue)"></i>${L("Past due", "متأخر")}</span><span>${sarShort(d.open_past_due || 0)}</span></div>
    <div class="row"><span><i style="background:var(--notdue)"></i>${L("Not yet due", "لم يستحق بعد")}</span><span>${sarShort(d.not_yet_due || 0)}</span></div>
    ${collectible ? `<div class="row"><span>${L("Confirmed of due", "المؤكد من المستحق")}</span><span>${pct((d.collected || 0) / collectible)}</span></div>` : ""}`;
}

function renderLedgerTable(monthly) {
  const rows = monthly.map((d) => `<tr><td>${monthLong(d.month)}</td><td class="num">${sar(d.revenue_net || 0)}</td>
    <td class="num">${sar(d.invoiced_gross || 0)}</td><td class="num">${sar(d.collected || 0)}</td>
    <td class="num">${sar(d.open_past_due || 0)}</td><td class="num">${sar(d.not_yet_due || 0)}</td>
    <td class="num">${sar(d.inflows || 0)}</td><td class="num">${sar(d.closing_balance || 0)}</td></tr>`).join("");
  const heads = ar()
    ? ["الشهر", "صافي المبيعات (دون الضريبة)", "المفوتر (شامل الضريبة)", "مؤكد", "متأخر", "لم يستحق بعد", "التدفقات البنكية الواردة", "رصيد نهاية الشهر"]
    : ["Month", "Net sales (excl. VAT)", "Invoiced (incl. VAT)", "Confirmed", "Past due", "Not yet due", "Bank inflows", "Month-end balance"];
  $("ledgerTable").innerHTML = `<table class="data"><thead><tr>${heads.map((h, i) => `<th${i ? ' class="num"' : ""}>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
}

function renderFlags(r) {
  $("flags").innerHTML = r.flags.map((f, i) => {
    const ev = f.evidence || [];
    let action = "";
    if (ev.length && typeof ev[0] === "object") action = `<button class="link" data-flag="${i}" data-kind="transfers">${L(`Show the ${ev.length} transfers`, `اعرض التحويلات (${ev.length})`)}</button>`;
    else if (ev.length && /^(INV|CN)-/.test(ev[0])) action = `<button class="link" data-flag="${i}" data-kind="invoices">${ar() ? (ev.length === 1 ? "اعرض الفاتورة" : `اعرض الفواتير (${ev.length})`) : (ev.length === 1 ? "Show the invoice" : `Show the ${ev.length} invoices`)}</button>`;
    return `<li class="flag ${f.severity}"><div class="flag-head"><span class="sev">${SEV_ICON[f.severity]}${SEV_TEXT[state.lang][f.severity]}</span>
      <span class="flag-title">${esc(flagTitle(f))}</span></div><p>${esc(flagDetail(f))}</p>${action}</li>`;
  }).join("") || `<li class="flag info"><p>${L("No risk signals were found in these documents.", "لم تُرصد أي مؤشرات مخاطر في هذه المستندات.")}</p></li>`;
}

function renderFigures(r) {
  const m = r.metrics;
  const na = L("n/a", "غير متاح");
  const rows = [
    [L("Average monthly net sales", "متوسط صافي المبيعات الشهرية"), sar(m.avg_monthly_revenue_net), L(`${sarShort(m.total_revenue_net)} over 12 months, excl. VAT`, `${sarShort(m.total_revenue_net)} خلال 12 شهرًا، دون الضريبة`)],
    [L("Month-to-month variation", "التذبذب من شهر لآخر"), pct(m.revenue_volatility_cv, 0), L(`Peak ${monthLabel(m.peak_month)}, low ${monthLabel(m.low_month)}`, `الذروة ${monthLabel(m.peak_month)}، الأدنى ${monthLabel(m.low_month)}`)],
    [L("Average time to get paid", "متوسط مدة التحصيل"), m.avg_days_to_payment != null ? days(Math.round(m.avg_days_to_payment)) : na, L("From invoice date, weighted by value", "من تاريخ الفاتورة، مرجّح بالقيمة")],
    [L("Top 5 customers' share", "حصة أكبر 5 عملاء"), pct(m.top5_concentration), L(`Largest customer ${pct(m.top1_concentration)}`, `أكبر عميل ${pct(m.top1_concentration)}`)],
    [L("Receivables past due date", "ذمم تجاوزت تاريخ الاستحقاق"), sar(m.receivables_past_due), L("Unpaid after the due date, all ages", "غير مسددة بعد الاستحقاق، جميع الأعمار")],
    [L("Average month-end balance", "متوسط رصيد نهاية الشهر"), m.avg_month_end_balance != null ? sar(m.avg_month_end_balance) : na, m.min_month_end_balance != null ? L(`Lowest ${sar(m.min_month_end_balance)}`, `الأدنى ${sar(m.min_month_end_balance)}`) : ""],
    [L("Existing finance installments", "أقساط التمويل القائمة"), m.monthly_debt_service ? `${sar(m.monthly_debt_service)}${L("/mo", " شهريًا")}` : L("None found", "لا يوجد"), L("Detected in bank debits", "مرصودة في الخصومات البنكية")],
    [L("Bank inflows explained by invoices", "التدفقات الواردة المفسَّرة بالفواتير"), pct(m.inflows_explained_by_invoices), L(`${sarShort(m.total_inflows)} received in total`, `إجمالي المستلم ${sarShort(m.total_inflows)}`)],
  ];
  $("figures").innerHTML = rows.map(([k, v, s]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}${s ? `<small>${esc(s)}</small>` : ""}</dd></div>`).join("");
}

let showAllCustomers = false;
function renderCustomers(r) {
  const list = showAllCustomers ? r.customers : r.customers.slice(0, 10);
  const maxShare = r.customers[0]?.share || 1;
  const signal = {
    related_party: ["critical", L("Possible related party", "طرف ذو علاقة محتمل")],
    stopped_paying: ["warning", L("Stopped paying", "توقف عن السداد")],
  };
  $("custNote").innerHTML = L(`${r.customers.length} customers. Payment time is weighted by invoice value. `, `${r.customers.length} عميلًا. مدة السداد مرجّحة بقيمة الفاتورة. `) +
    (r.customers.length > 10 ? `<button class="link" id="toggleCust">${showAllCustomers ? L("Show top 10", "اعرض أكبر 10") : L("Show all", "اعرض الكل")}</button>` : "");
  const heads = ar()
    ? ["العميل", "النوع", "الحصة من المبيعات", "صافي المبيعات", "أيام السداد", "متأخر 30+ يومًا", "المؤشرات"]
    : ["Customer", "Type", "Share of sales", "Net sales", "Days to pay", "Overdue 30+ days", "Signals"];
  const name = (c) => ar()
    ? `${c.name_ar ? `<span lang="ar">${esc(c.name_ar)}</span><span class="sub" lang="en" dir="ltr">${esc(c.name_en)}</span>` : esc(c.name_en)}`
    : `${esc(c.name_en)}${c.name_ar ? `<span class="sub ar" lang="ar">${esc(c.name_ar)}</span>` : ""}`;
  const segment = (s) => (ar() && SEGMENT_AR[s]) || (s || "").replace("_", " ");
  const terms = (d) => d === "0" ? L("Cash", "نقدًا") : L(`${d}-day terms`, `آجل ${countAr(+d, DAYS_AR)}`);
  $("custTable").innerHTML = `<thead><tr>${heads.map((h, i) => `<th${i === 3 || i === 4 || i === 5 ? ' class="num"' : ""}>${h}</th>`).join("")}</tr></thead><tbody>` +
    list.map((c) => `<tr><td>${name(c)}</td>
      <td>${esc(segment(c.segment))}${c.terms_days !== "" ? `<span class="sub">${terms(c.terms_days)}</span>` : ""}</td>
      <td>${pct(c.share)}<div class="share-bar"><i style="width:${(c.share / maxShare) * 100}%"></i></div></td>
      <td class="num">${sar(c.revenue_net)}</td>
      <td class="num">${c.avg_days_to_pay ?? "–"}</td>
      <td class="num">${c.outstanding_past_due ? sar(c.outstanding_past_due) : "–"}</td>
      <td>${(c.signals || []).map((s) => `<span class="chip ${signal[s]?.[0] || ""}">${signal[s]?.[1] || s}</span>`).join("")}</td></tr>`).join("") + "</tbody>";
  const tg = $("toggleCust");
  if (tg) tg.onclick = () => { showAllCustomers = !showAllCustomers; renderCustomers(r); };
}

function renderAging(r) {
  $("agingBars").innerHTML = r.aging.map((a, i) => `<div class="age b${i}"><span>${esc((ar() && a.bucket_ar) || a.bucket)}</span>
    <strong>${sar(a.amount)}</strong><span>${L(`${a.invoices} invoice${a.invoices === 1 ? "" : "s"}`, countAr(a.invoices, INVOICES_AR))}</span></div>`).join("");
}

// ---------- invoices ----------
function renderStatusSeg() {
  const counts = { all: 0 };
  for (const i of state.report.invoices) { counts.all++; counts[i.status] = (counts[i.status] || 0) + 1; }
  const opts = [["all", L("All", "الكل")], ["unmatched", statusText("unmatched")], ["partial", statusText("partial")],
    ["not_yet_due", statusText("not_yet_due")], ["matched", statusText("matched")], ["evidence", L("Flagged", "المُشار إليها")]];
  $("statusSeg").innerHTML = opts.filter(([k]) => k !== "evidence" || state.evidence)
    .map(([k, label]) => `<button type="button" data-status="${k}" aria-pressed="${state.status === k}">${label}${k !== "evidence" ? ` <span class="sub" style="display:inline">${counts[k] || 0}</span>` : ""}</button>`).join("");
  $("statusSeg").querySelectorAll("button").forEach((b) => b.onclick = () => {
    state.status = b.dataset.status; state.page = 0;
    if (state.status !== "evidence") state.evidence = null;
    renderStatusSeg(); renderInvoices();
  });
}

function filteredInvoices() {
  const q = state.search.trim().toLowerCase();
  return state.report.invoices.filter((i) =>
    (state.status === "all" || (state.status === "evidence" ? state.evidence?.has(i.number) : i.status === state.status)) &&
    i.expected_sar >= (state.min || 0) &&
    (!q || i.number.toLowerCase().includes(q) || (i.customer || "").toLowerCase().includes(q) || (i.customer_name_on_invoice || "").includes(state.search.trim()))
  ).sort((a, b) => b.issue_date.localeCompare(a.issue_date) || b.number.localeCompare(a.number));
}

function renderInvoices() {
  const rows = filteredInvoices();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  state.page = Math.min(state.page, pages - 1);
  const slice = rows.slice(state.page * PAGE, state.page * PAGE + PAGE);
  const heads = ar()
    ? ["الفاتورة", "العميل", "المبلغ (شامل الضريبة)", "الحالة", "التوقيت"]
    : ["Invoice", "Customer", "Amount (incl. VAT)", "Status", "Timing"];
  $("invTable").innerHTML = `<thead><tr>${heads.map((h, i) => `<th${i === 2 || i === 4 ? ' class="num"' : ""}>${h}</th>`).join("")}</tr></thead><tbody>` +
    (slice.map((i) => `<tr class="clickable" tabindex="0" data-no="${esc(i.number)}">
      <td>${esc(i.number)}<span class="sub">${dateLabel(i.issue_date)}</span></td>
      <td>${esc(i.customer)}${i.flags.length ? `<span class="sub">${i.flags.map(flagText).join(L(", ", "، "))}</span>` : ""}</td>
      <td class="num">${sar2(i.expected_sar)}${i.original_currency !== "SAR" ? `<span class="sub">${i.original_currency} ${nf2.format(i.original_total)}</span>` : ""}</td>
      <td><span class="status ${i.status}">${statusText(i.status)}</span></td>
      <td class="num">${timing(i)}</td></tr>`).join("") || `<tr><td colspan="5">${L("No invoices match these filters. Clear the search or choose another status.", "لا توجد فواتير تطابق هذه المرشحات. امسح البحث أو اختر حالة أخرى.")}</td></tr>`) + "</tbody>";
  $("invCount").textContent = rows.length
    ? L(`${state.page * PAGE + 1}–${state.page * PAGE + slice.length} of ${nf0.format(rows.length)} invoices`, `${state.page * PAGE + 1}–${state.page * PAGE + slice.length} من ${countAr(rows.length, INVOICES_AR)}`)
    : L("0 invoices", "0 فاتورة");
  $("prevPage").disabled = state.page === 0;
  $("nextPage").disabled = state.page >= pages - 1;
  $("invTable").querySelectorAll("tr.clickable").forEach((tr) => {
    tr.onclick = () => openInvoice(tr.dataset.no);
    tr.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openInvoice(tr.dataset.no); } };
  });
}

const FLAG_TEXT = {
  en: { fx_converted: "Converted from USD", entity_mismatch: "Issued by another entity", number_reused: "Invoice number reused" },
  ar: { fx_converted: "محوّلة من الدولار", entity_mismatch: "صادرة من منشأة أخرى", number_reused: "رقم فاتورة مكرر" },
};
const flagText = (f) => FLAG_TEXT[state.lang][f] || f;
function timing(i) {
  if (i.status === "matched" && i.days_to_pay != null) return L(`Paid in ${i.days_to_pay} days`, `سُددت خلال ${countAr(i.days_to_pay, DAYS_AR)}`);
  if (i.days_past_due > 0) return L(`${i.days_past_due} days past due`, `متأخرة ${countAr(i.days_past_due, DAYS_AR)}`);
  return L(`Due ${dateLabel(i.due_date)}`, `تستحق ${dateLabel(i.due_date)}`);
}

// ---------- drawer ----------
let lastFocus = null;
function openDrawer(html) {
  lastFocus = document.activeElement;
  $("drawerBody").innerHTML = html;
  $("drawer").classList.add("open");
  $("drawer").setAttribute("aria-hidden", "false");
  $("closeDrawer").focus();
}
function closeDrawer() {
  $("drawer").classList.remove("open");
  $("drawer").setAttribute("aria-hidden", "true");
  lastFocus?.focus();
}

function openInvoice(no) {
  const i = state.report.invoices.find((x) => x.number === no);
  if (!i) return;
  const allocs = state.allocByInv.get(no) || [];
  const pays = allocs.map((a) => {
    const tx = state.creditByRef.get(a.bank_ref) || {};
    const shared = tx.credit && Math.abs(tx.credit - a.amount_sar) > 0.01;
    const conf = Math.round(a.confidence * 100);
    return `<div class="pay"><div class="pay-top"><span>${dateLabel(a.date)}</span><span>${sar2(a.amount_sar)}</span></div>
      <p dir="ltr">${esc(tx.description || a.bank_ref)}</p>
      <p class="meta">${esc(methodText(a.method))} (${L("confidence", "الثقة")} ${conf}%)${shared ? L(`. Part of a ${sar2(tx.credit)} transfer that paid several invoices`, `. جزء من تحويل بقيمة ${sar2(tx.credit)} سدّد عدة فواتير`) : ""}.</p>
      <p class="meta">${L(`${esc(tx.bank || "")} account ending ${esc((tx.iban || "").slice(-4))}, ref ${esc(a.bank_ref)}, ${esc(tx.source_file || "")} page ${tx.source_page ?? ""}`,
        `${esc(tx.bank || "")}، الحساب المنتهي بـ ${esc((tx.iban || "").slice(-4))}، المرجع ${esc(a.bank_ref)}، ${esc(tx.source_file || "")} صفحة ${tx.source_page ?? ""}`)}</p></div>`;
  }).join("");
  openDrawer(`<h2 id="drawerTitle">${esc(i.number)}</h2>
    <p class="source">${L(`Source: invoice register, ${esc(i.source_ref)}`, `المصدر: سجل الفواتير، ${esc(i.source_ref)}`)}</p>
    <dl class="kv">
      <div><dt>${L("Customer", "العميل")}</dt><dd>${esc(i.customer)}${i.customer_name_on_invoice !== i.customer ? `<small class="ar" lang="ar">${L("On invoice", "في الفاتورة")}: ${esc(i.customer_name_on_invoice)}</small>` : ""}</dd></div>
      <div><dt>${L("Issued / due", "الإصدار / الاستحقاق")}</dt><dd>${dateLabel(i.issue_date)}<small>${L("Due", "تستحق")} ${dateLabel(i.due_date)}</small></dd></div>
      <div><dt>${L("Net (excl. VAT)", "الصافي (دون الضريبة)")}</dt><dd>${sar2(i.net_sar)}${i.original_currency !== "SAR" ? `<small>${i.original_currency} ${nf2.format(i.original_total)} ${L("at", "بسعر")} 3.75</small>` : ""}</dd></div>
      <div><dt>${L("Expected payment", "الدفعة المتوقعة")}</dt><dd>${sar2(i.expected_sar)}${i.credit_note ? `<small>${L("After credit note", "بعد إشعار دائن")} ${esc(i.credit_note)}</small>` : ""}</dd></div>
      <div><dt>${L("Status", "الحالة")}</dt><dd><span class="status ${i.status}">${statusText(i.status)}</span><small>${esc(timing(i))}</small></dd></div>
    </dl>
    <h3>${L("Payments found in the bank statements", "الدفعات الموجودة في كشوف الحساب")}</h3>
    ${pays || `<p class="panel-note">${L("No matching deposit was found in the uploaded statements", "لم يُعثر على إيداع مطابق في الكشوف المرفوعة")}${i.status === "not_yet_due" ? L(". The invoice is not yet due.", ". الفاتورة لم تستحق بعد.") : "."}</p>`}`);
}

function openTransfers(flag) {
  const rows = flag.evidence.map((tx) => `<tr><td>${dateLabel(tx.date)}</td><td><span dir="ltr">${esc(tx.description)}</span><span class="sub">${esc(tx.reference)}, ${esc(tx.source_file)} ${L("p.", "ص")}${tx.source_page}</span></td><td class="num">${sar2(tx.amount)}</td></tr>`).join("");
  openDrawer(`<h2 id="drawerTitle">${esc(flagTitle(flag))}</h2><p class="panel-note">${esc(flagDetail(flag))}</p>
    <h3>${L("Outgoing transfers to this customer", "التحويلات الصادرة إلى هذا العميل")}</h3><div class="table-wrap"><table class="data"><thead><tr><th>${L("Date", "التاريخ")}</th><th>${L("Description", "الوصف")}</th><th class="num">${L("Amount", "المبلغ")}</th></tr></thead><tbody>${rows}</tbody></table></div>`);
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

function memoNote(memo) {
  if (!ar()) return esc(memo.note || "Template memo.");
  if (/ANTHROPIC_API_KEY/.test(memo.note || "")) return "لم يُضبط مفتاح ANTHROPIC_API_KEY؛ تُعرض مذكرة القالب.";
  if (memo.note) return "المذكرة الذكية غير متاحة حاليًا؛ تُعرض مذكرة القالب.";
  return "مذكرة القالب.";
}

async function writeMemo() {
  const r = state.report, btn = $("writeMemo"), lang = state.lang;
  btn.disabled = true; btn.textContent = t("memo.writing");
  $("memoBody").innerHTML = `<p class="panel-note">${L("Drafting from the figures above. This can take up to 30 seconds.", "تجري الصياغة من الأرقام أعلاه. قد يستغرق ذلك حتى 30 ثانية.")}</p>`;
  try {
    const pkg = Object.fromEntries(["applicant", "period", "metrics", "monthly", "customers", "aging", "flags", "data_quality"].map((k) => [k, r[k]]));
    pkg.lang = lang;
    const memo = await getJSON(`${API}/memo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pkg) });
    if (lang !== state.lang || r !== state.report) return; // language or applicant changed while writing
    const src = memo.source === "claude"
      ? L(`Written by Claude (${esc(memo.model)}) from the verified package. Check figures against the sections above before relying on it.`,
        `كتبها Claude (${esc(memo.model)}) من الملف الموثّق. تحقّق من الأرقام مقابل الأقسام أعلاه قبل الاعتماد عليها.`)
      : memoNote(memo);
    $("memoBody").innerHTML = renderMarkdown(memo.memo_markdown) + `<p class="memo-source">${src}</p>`;
    btn.textContent = t("memo.rewrite");
  } catch (e) {
    $("memoBody").innerHTML = `<p class="load-error">${L("The memo could not be written", "تعذّرت كتابة المذكرة")}: ${esc(e.message)}</p>`;
    btn.textContent = t("memo.write");
  } finally {
    btn.disabled = false;
  }
}

// ---------- quality + files ----------
async function renderQuality(r) {
  const q = r.data_quality;
  const byMethod = {};
  for (const a of r.allocations) byMethod[a.method] = (byMethod[a.method] || 0) + a.amount_sar;
  const total = Object.values(byMethod).reduce((s, v) => s + v, 0) || 1;
  const missing = q.invoice_months_missing.length + Object.values(q.statement_months_missing).flat().length;
  const rows = [
    [L("Invoice rows read", "صفوف الفواتير المقروءة"), nf0.format(q.rows_read), L(`${q.duplicates_removed} duplicates removed, ${q.credit_notes} credit notes netted`, `حُذف ${q.duplicates_removed} مكرر، وخُصمت ${q.credit_notes} إشعارات دائنة`)],
    [L("Foreign-currency invoices", "فواتير بعملة أجنبية"), nf0.format(q.fx_converted), L("Converted at the USD 3.75 peg", "حُوّلت بسعر ربط الدولار 3.75")],
    [L("Invoices from another entity", "فواتير من منشأة أخرى"), nf0.format(q.entity_mismatch), L("Excluded from sales", "مستبعدة من المبيعات")],
    [L("Bank statements", "كشوف الحساب"), L(`${q.statements_passing_balance_check} of ${q.statements} pass`, `${q.statements_passing_balance_check} من ${q.statements} ناجحة`), L("Every row checked against the running balance", "كل صف فُحص مقابل الرصيد الجاري")],
    [L("Transactions extracted", "المعاملات المستخرجة"), nf0.format(q.statement_rows), q.accounts.map((a) => `${a.bank} ••${(a.iban || "").slice(-4)}`).join(", ")],
    [L("Months missing", "أشهر ناقصة"), missing ? L("Yes", "نعم") : L("None", "لا يوجد"), L("Invoices and statements cover 12 months", "الفواتير والكشوف تغطي 12 شهرًا")],
    ...Object.entries(byMethod).sort((a, b) => b[1] - a[1]).map(([k, v]) => [`${L("Matched by", "طريقة المطابقة")}: ${methodText(k)}`, pct(v / total), sarShort(v)]),
    [L("Payer names sent to human review", "أسماء دافعين أُحيلت للمراجعة البشرية"), nf0.format(r.review_queue.length), L("Matches below 0.80 name confidence", "مطابقات بثقة اسم أقل من 0.80")],
  ];
  if (q.matching_accuracy) rows.push([L("Matching accuracy on sample data", "دقة المطابقة على بيانات العينة"), `${pct(q.matching_accuracy.precision)} / ${pct(q.matching_accuracy.recall)}`, L("Precision / recall vs. generator ground truth", "الدقة / الاسترجاع مقارنة بالحقيقة المرجعية للمولّد")]);
  $("quality").innerHTML = rows.map(([k, v, s]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}${s ? `<small>${esc(s)}</small>` : ""}</dd></div>`).join("");

  try {
    if (!state.files) state.files = await getJSON(`${API}/sample-data`);
    const files = state.files;
    const main = files.filter((f) => !f.path.startsWith("statements/") && !f.path.endsWith(".json") || f.path === "organization.json");
    const stm = files.filter((f) => f.path.startsWith("statements/"));
    const kb = (b) => b > 1e6 ? L(`${(b / 1e6).toFixed(1)} MB`, `${(b / 1e6).toFixed(1)} م.ب`) : L(`${Math.max(1, Math.round(b / 1e3))} KB`, `${Math.max(1, Math.round(b / 1e3))} ك.ب`);
    const link = (f, label) => `<a href="${API}/sample-data/${encodeURI(f.path)}" download dir="ltr">${esc(label || f.path)}</a>`;
    $("sampleFiles").innerHTML = main.map((f) => `<li>${link(f)}<span>${kb(f.bytes)}</span></li>`).join("") +
      `<li>${L(`Bank statements (${stm.length} PDFs)`, `كشوف الحساب (${stm.length} ملف PDF)`)}: ${stm.map((f) => link(f, f.path.replace("statements/", "").replace(".pdf", ""))).join(", ")}</li>`;
  } catch { /* file list is optional */ }
}

// ---------- tooltip ----------
function showTip(ev, html) {
  const tip = $("tooltip");
  tip.innerHTML = html; tip.hidden = false;
  tip.dir = ar() ? "rtl" : "ltr";
  const r = tip.getBoundingClientRect();
  let x = ev.clientX + 14, y = ev.clientY + 14;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - 14;
  tip.style.left = `${x}px`; tip.style.top = `${y}px`;
}
function hideTip() { $("tooltip").hidden = true; }

// ---------- events ----------
function wire() {
  $("langToggle").onclick = () => setLang(ar() ? "en" : "ar");
  $("toggleTable").onclick = () => {
    const open = $("ledgerTable").hidden;
    $("ledgerTable").hidden = !open;
    $("toggleTable").setAttribute("aria-expanded", String(open));
    $("toggleTable").textContent = open ? t("table.hide") : t("table.show");
  };
  $("flags").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-flag]");
    if (!b) return;
    const f = state.report.flags[+b.dataset.flag];
    if (b.dataset.kind === "transfers") return openTransfers(f);
    state.evidence = new Set(f.evidence); state.status = "evidence"; state.page = 0; state.search = ""; $("invSearch").value = "";
    renderStatusSeg(); renderInvoices();
    document.querySelector(".invoices").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
  let deb;
  $("invSearch").oninput = (e) => { clearTimeout(deb); deb = setTimeout(() => { state.search = e.target.value; state.page = 0; renderInvoices(); }, 150); };
  $("invMin").oninput = (e) => { state.min = +e.target.value || 0; state.page = 0; renderInvoices(); };
  $("prevPage").onclick = () => { state.page--; renderInvoices(); };
  $("nextPage").onclick = () => { state.page++; renderInvoices(); };
  $("closeDrawer").onclick = closeDrawer;
  $("drawer").onclick = (e) => { if (e.target === $("drawer")) closeDrawer(); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("drawer").classList.contains("open")) closeDrawer(); });
  $("writeMemo").onclick = writeMemo;
  $("openUpload").onclick = () => { $("uploadError").hidden = true; $("uploadDialog").showModal(); };
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
      setReport(await getJSON(`${API}/analyze`, { method: "POST", body: fd }), "upload");
      $("uploadDialog").close();
      window.scrollTo({ top: 0 });
    } catch (err) {
      $("uploadError").textContent = err.message; $("uploadError").hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = t("up.submit");
    }
  };
}

let savedLang = "en";
try { savedLang = localStorage.getItem("lang") || "en"; } catch { /* storage is optional */ }
state.lang = savedLang === "ar" ? "ar" : "en";
applyStaticText();
wire();
loadSample();
