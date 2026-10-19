"use strict";

const API = "/api";
const PAGE = 25;
const state = { report: null, source: "sample", status: "all", search: "", min: 0, page: 0, allocByInv: new Map(), creditByRef: new Map() };
const $ = (id) => document.getElementById(id);

// ---------- formatting ----------
const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sar = (x) => `SAR ${nf0.format(x)}`;
const sar2 = (x) => `SAR ${nf2.format(x)}`;
const sarShort = (x) => Math.abs(x) >= 1e6 ? `SAR ${(x / 1e6).toFixed(2)}M` : `SAR ${nf0.format(Math.round(x / 1e3))}K`;
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const monthLabel = (m) => new Date(m + "-01T00:00:00").toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
const monthLong = (m) => new Date(m + "-01T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const dateLabel = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const STATUS_TEXT = { matched: "Paid", partial: "Partly paid", unmatched: "Not found in bank", not_yet_due: "Not yet due" };
const METHOD_TEXT = {
  reference: "Transfer quotes the invoice number", statement: "Monthly statement payment", exact: "Exact amount match",
  fifo: "Oldest-first allocation", cash_batch: "Weekly cash deposit",
};
const SEV_ICON = {
  critical: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 0.5h5l3 3v5l-3 3h-5l-3-3v-5z" fill="currentColor"/><path d="M6 3v3.5M6 8.3v.2" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/></svg>',
  warning: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 .8 11.5 11H.5z" fill="currentColor"/><path d="M6 4.5v3M6 9.2v.2" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/></svg>',
  info: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5.5" fill="currentColor"/><path d="M6 5.5v3.2M6 3.4v.2" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/></svg>',
};
const SEV_TEXT = { critical: "Critical", warning: "Warning", info: "Note" };

// ---------- data ----------
async function getJSON(url, opts) {
  const res = await fetch(url, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `Request failed (${res.status}).`);
  return body;
}

async function loadSample() {
  $("loading").hidden = false;
  $("loadError").hidden = true;
  try {
    setReport(await getJSON(`${API}/applications/demo/report`), "sample");
  } catch (e) {
    $("loadError").textContent = `The package could not be loaded: ${e.message}`;
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
  renderQuality(r);
  $("disclaimer").textContent = r.disclaimer;
}

function renderApplicant(r) {
  const a = r.applicant || {};
  $("appName").textContent = a.legal_name || "Uploaded applicant";
  $("appNameAr").textContent = a.legal_name_ar || "";
  $("appNameAr").hidden = !a.legal_name_ar;
  const facts = [
    ["Period", `${dateLabel(r.period.start)} – ${dateLabel(r.period.end)}`],
    ["Sector", a.sector || "Not provided"],
    ["CR number", a.cr_number || "Not provided"],
    ["VAT number", a.vat_number || "Not provided"],
  ];
  $("appFacts").innerHTML = facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
}

function renderHero(r) {
  const m = r.metrics;
  $("heroRate").textContent = pct(m.match_rate);
  $("heroText").textContent = "of invoiced sales that should have been paid by now is confirmed by bank deposits.";
  const statusCounts = m.invoice_status || {};
  $("heroSub").textContent =
    `${sarShort(m.collectible_collected_gross)} of ${sarShort(m.collectible_invoiced_gross)} traced to deposits across ` +
    `${r.data_quality.accounts.length} bank account${r.data_quality.accounts.length === 1 ? "" : "s"}. ` +
    `Invoices issued in the last weeks are shown as not yet due (${nf0.format(statusCounts.not_yet_due || 0)} invoices).` +
    (r.flags.some((f) => f.type === "related_party") ? " This includes payments from a possible related party, flagged below." : "");
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
  let svg = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><g class="grid">`;
  for (let v = 0; v <= top; v += step) {
    svg += `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/>`;
  }
  svg += `</g><g class="axis">`;
  for (let v = 0; v <= top; v += step) {
    svg += `<text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end">${v === 0 ? "0" : (v / 1e6).toFixed(v % 1e6 ? 2 : 0).replace(/\.?0+$/, "") + "M"}</text>`;
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
  el.setAttribute("aria-label", `Monthly invoiced sales, ${monthLabel(monthly[0].month)} to ${monthLabel(monthly.at(-1).month)}. Use "Show as table" for exact values.`);
  el.querySelectorAll(".col").forEach((g) => {
    const d = monthly[+g.dataset.i];
    g.addEventListener("mousemove", (ev) => showTip(ev, ledgerTip(d)));
    g.addEventListener("mouseleave", hideTip);
  });
}

function ledgerTip(d) {
  const collectible = (d.collected || 0) + (d.open_past_due || 0);
  return `<b>${monthLong(d.month)}</b>
    <div class="row"><span>Invoiced (incl. VAT)</span><span>${sarShort(d.invoiced_gross || 0)}</span></div>
    <div class="row"><span><i style="background:var(--collected)"></i>Confirmed</span><span>${sarShort(d.collected || 0)}</span></div>
    <div class="row"><span><i style="background:var(--pastdue)"></i>Past due</span><span>${sarShort(d.open_past_due || 0)}</span></div>
    <div class="row"><span><i style="background:var(--notdue)"></i>Not yet due</span><span>${sarShort(d.not_yet_due || 0)}</span></div>
    ${collectible ? `<div class="row"><span>Confirmed of due</span><span>${pct((d.collected || 0) / collectible)}</span></div>` : ""}`;
}

function renderLedgerTable(monthly) {
  const rows = monthly.map((d) => `<tr><td>${monthLong(d.month)}</td><td class="num">${sar(d.revenue_net || 0)}</td>
    <td class="num">${sar(d.invoiced_gross || 0)}</td><td class="num">${sar(d.collected || 0)}</td>
    <td class="num">${sar(d.open_past_due || 0)}</td><td class="num">${sar(d.not_yet_due || 0)}</td>
    <td class="num">${sar(d.inflows || 0)}</td><td class="num">${sar(d.closing_balance || 0)}</td></tr>`).join("");
  $("ledgerTable").innerHTML = `<table class="data"><thead><tr><th>Month</th><th class="num">Net sales (excl. VAT)</th>
    <th class="num">Invoiced (incl. VAT)</th><th class="num">Confirmed</th><th class="num">Past due</th><th class="num">Not yet due</th>
    <th class="num">Bank inflows</th><th class="num">Month-end balance</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderFlags(r) {
  $("flags").innerHTML = r.flags.map((f, i) => {
    const ev = f.evidence || [];
    let action = "";
    if (ev.length && typeof ev[0] === "object") action = `<button class="link" data-flag="${i}" data-kind="transfers">Show the ${ev.length} transfers</button>`;
    else if (ev.length && /^(INV|CN)-/.test(ev[0])) action = `<button class="link" data-flag="${i}" data-kind="invoices">Show ${ev.length === 1 ? "the invoice" : `the ${ev.length} invoices`}</button>`;
    return `<li class="flag ${f.severity}"><div class="flag-head"><span class="sev">${SEV_ICON[f.severity]}${SEV_TEXT[f.severity]}</span>
      <span class="flag-title">${esc(f.title)}</span></div><p>${esc(f.detail)}</p>${action}</li>`;
  }).join("") || `<li class="flag info"><p>No risk signals were found in these documents.</p></li>`;
}

function renderFigures(r) {
  const m = r.metrics;
  const rows = [
    ["Average monthly net sales", sar(m.avg_monthly_revenue_net), `${sarShort(m.total_revenue_net)} over 12 months, excl. VAT`],
    ["Month-to-month variation", pct(m.revenue_volatility_cv, 0), `Peak ${monthLabel(m.peak_month)}, low ${monthLabel(m.low_month)}`],
    ["Average time to get paid", m.avg_days_to_payment != null ? `${Math.round(m.avg_days_to_payment)} days` : "n/a", "From invoice date, weighted by value"],
    ["Top 5 customers' share", pct(m.top5_concentration), `Largest customer ${pct(m.top1_concentration)}`],
    ["Receivables past due date", sar(m.receivables_past_due), "Unpaid after the due date, all ages"],
    ["Average month-end balance", m.avg_month_end_balance != null ? sar(m.avg_month_end_balance) : "n/a", m.min_month_end_balance != null ? `Lowest ${sar(m.min_month_end_balance)}` : ""],
    ["Existing finance installments", m.monthly_debt_service ? `${sar(m.monthly_debt_service)}/mo` : "None found", "Detected in bank debits"],
    ["Bank inflows explained by invoices", pct(m.inflows_explained_by_invoices), `${sarShort(m.total_inflows)} received in total`],
  ];
  $("figures").innerHTML = rows.map(([k, v, s]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}${s ? `<small>${esc(s)}</small>` : ""}</dd></div>`).join("");
}

let showAllCustomers = false;
function renderCustomers(r) {
  const list = showAllCustomers ? r.customers : r.customers.slice(0, 10);
  const maxShare = r.customers[0]?.share || 1;
  const signal = { related_party: ["critical", "Possible related party"], stopped_paying: ["warning", "Stopped paying"] };
  $("custNote").innerHTML = `${r.customers.length} customers. Payment time is weighted by invoice value. ` +
    (r.customers.length > 10 ? `<button class="link" id="toggleCust">${showAllCustomers ? "Show top 10" : "Show all"}</button>` : "");
  $("custTable").innerHTML = `<thead><tr><th>Customer</th><th>Type</th><th>Share of sales</th><th class="num">Net sales</th>
    <th class="num">Days to pay</th><th class="num">Overdue 30+ days</th><th>Signals</th></tr></thead><tbody>` +
    list.map((c) => `<tr><td>${esc(c.name_en)}${c.name_ar ? `<span class="sub ar" lang="ar">${esc(c.name_ar)}</span>` : ""}</td>
      <td>${esc((c.segment || "").replace("_", " "))}${c.terms_days !== "" ? `<span class="sub">${c.terms_days === "0" ? "Cash" : `${c.terms_days}-day terms`}</span>` : ""}</td>
      <td>${pct(c.share)}<div class="share-bar"><i style="width:${(c.share / maxShare) * 100}%"></i></div></td>
      <td class="num">${sar(c.revenue_net)}</td>
      <td class="num">${c.avg_days_to_pay ?? "–"}</td>
      <td class="num">${c.outstanding_past_due ? sar(c.outstanding_past_due) : "–"}</td>
      <td>${(c.signals || []).map((s) => `<span class="chip ${signal[s]?.[0] || ""}">${signal[s]?.[1] || s}</span>`).join("")}</td></tr>`).join("") + "</tbody>";
  const t = $("toggleCust");
  if (t) t.onclick = () => { showAllCustomers = !showAllCustomers; renderCustomers(r); };
}

function renderAging(r) {
  $("agingBars").innerHTML = r.aging.map((a, i) => `<div class="age b${i}"><span>${esc(a.bucket)}</span>
    <strong>${sar(a.amount)}</strong><span>${a.invoices} invoice${a.invoices === 1 ? "" : "s"}</span></div>`).join("");
}

// ---------- invoices ----------
function renderStatusSeg() {
  const counts = { all: 0 };
  for (const i of state.report.invoices) { counts.all++; counts[i.status] = (counts[i.status] || 0) + 1; }
  const opts = [["all", "All"], ["unmatched", "Not found in bank"], ["partial", "Partly paid"], ["not_yet_due", "Not yet due"], ["matched", "Paid"], ["evidence", "Flagged"]];
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
  $("invTable").innerHTML = `<thead><tr><th>Invoice</th><th>Customer</th><th class="num">Amount (incl. VAT)</th><th>Status</th><th class="num">Timing</th></tr></thead><tbody>` +
    (slice.map((i) => `<tr class="clickable" tabindex="0" data-no="${esc(i.number)}">
      <td>${esc(i.number)}<span class="sub">${dateLabel(i.issue_date)}</span></td>
      <td>${esc(i.customer)}${i.flags.length ? `<span class="sub">${i.flags.map(flagText).join(", ")}</span>` : ""}</td>
      <td class="num">${sar2(i.expected_sar)}${i.original_currency !== "SAR" ? `<span class="sub">${i.original_currency} ${nf2.format(i.original_total)}</span>` : ""}</td>
      <td><span class="status ${i.status}">${STATUS_TEXT[i.status]}</span></td>
      <td class="num">${timing(i)}</td></tr>`).join("") || `<tr><td colspan="5">No invoices match these filters. Clear the search or choose another status.</td></tr>`) + "</tbody>";
  $("invCount").textContent = rows.length ? `${state.page * PAGE + 1}–${state.page * PAGE + slice.length} of ${nf0.format(rows.length)} invoices` : "0 invoices";
  $("prevPage").disabled = state.page === 0;
  $("nextPage").disabled = state.page >= pages - 1;
  $("invTable").querySelectorAll("tr.clickable").forEach((tr) => {
    tr.onclick = () => openInvoice(tr.dataset.no);
    tr.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openInvoice(tr.dataset.no); } };
  });
}

const flagText = (f) => ({ fx_converted: "Converted from USD", entity_mismatch: "Issued by another entity", number_reused: "Invoice number reused" }[f] || f);
function timing(i) {
  if (i.status === "matched" && i.days_to_pay != null) return `Paid in ${i.days_to_pay} days`;
  if (i.days_past_due > 0) return `${i.days_past_due} days past due`;
  return `Due ${dateLabel(i.due_date)}`;
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
    const t = state.creditByRef.get(a.bank_ref) || {};
    const shared = t.credit && Math.abs(t.credit - a.amount_sar) > 0.01;
    return `<div class="pay"><div class="pay-top"><span>${dateLabel(a.date)}</span><span>${sar2(a.amount_sar)}</span></div>
      <p>${esc(t.description || a.bank_ref)}</p>
      <p class="meta">${esc(METHOD_TEXT[a.method] || a.method)} (confidence ${Math.round(a.confidence * 100)}%)${shared ? `. Part of a ${sar2(t.credit)} transfer that paid several invoices` : ""}.</p>
      <p class="meta">${esc(t.bank || "")} account ending ${esc((t.iban || "").slice(-4))}, ref ${esc(a.bank_ref)}, ${esc(t.source_file || "")} page ${t.source_page ?? ""}</p></div>`;
  }).join("");
  openDrawer(`<h2 id="drawerTitle">${esc(i.number)}</h2>
    <p class="source">Source: invoice register, ${esc(i.source_ref)}</p>
    <dl class="kv">
      <div><dt>Customer</dt><dd>${esc(i.customer)}${i.customer_name_on_invoice !== i.customer ? `<small class="ar" lang="ar">On invoice: ${esc(i.customer_name_on_invoice)}</small>` : ""}</dd></div>
      <div><dt>Issued / due</dt><dd>${dateLabel(i.issue_date)}<small>Due ${dateLabel(i.due_date)}</small></dd></div>
      <div><dt>Net (excl. VAT)</dt><dd>${sar2(i.net_sar)}${i.original_currency !== "SAR" ? `<small>${i.original_currency} ${nf2.format(i.original_total)} at 3.75</small>` : ""}</dd></div>
      <div><dt>Expected payment</dt><dd>${sar2(i.expected_sar)}${i.credit_note ? `<small>After credit note ${esc(i.credit_note)}</small>` : ""}</dd></div>
      <div><dt>Status</dt><dd><span class="status ${i.status}">${STATUS_TEXT[i.status]}</span><small>${esc(timing(i))}</small></dd></div>
    </dl>
    <h3>Payments found in the bank statements</h3>
    ${pays || `<p class="panel-note">No matching deposit was found in the uploaded statements${i.status === "not_yet_due" ? ". The invoice is not yet due." : "."}</p>`}`);
}

function openTransfers(flag) {
  const rows = flag.evidence.map((t) => `<tr><td>${dateLabel(t.date)}</td><td>${esc(t.description)}<span class="sub">${esc(t.reference)}, ${esc(t.source_file)} p.${t.source_page}</span></td><td class="num">${sar2(t.amount)}</td></tr>`).join("");
  openDrawer(`<h2 id="drawerTitle">${esc(flag.title)}</h2><p class="panel-note">${esc(flag.detail)}</p>
    <h3>Outgoing transfers to this customer</h3><div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Description</th><th class="num">Amount</th></tr></thead><tbody>${rows}</tbody></table></div>`);
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

async function writeMemo() {
  const r = state.report, btn = $("writeMemo");
  btn.disabled = true; btn.textContent = "Writing…";
  $("memoBody").innerHTML = `<p class="panel-note">Drafting from the figures above. This can take up to 30 seconds.</p>`;
  try {
    const pkg = Object.fromEntries(["applicant", "period", "metrics", "monthly", "customers", "aging", "flags", "data_quality"].map((k) => [k, r[k]]));
    const memo = await getJSON(`${API}/memo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pkg) });
    const src = memo.source === "claude" ? `Written by Claude (${esc(memo.model)}) from the verified package. Check figures against the sections above before relying on it.`
      : esc(memo.note || "Template memo.");
    $("memoBody").innerHTML = renderMarkdown(memo.memo_markdown) + `<p class="memo-source">${src}</p>`;
    btn.textContent = "Rewrite memo";
  } catch (e) {
    $("memoBody").innerHTML = `<p class="load-error">The memo could not be written: ${esc(e.message)}</p>`;
    btn.textContent = "Write memo";
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
  const rows = [
    ["Invoice rows read", nf0.format(q.rows_read), `${q.duplicates_removed} duplicates removed, ${q.credit_notes} credit notes netted`],
    ["Foreign-currency invoices", nf0.format(q.fx_converted), "Converted at the USD 3.75 peg"],
    ["Invoices from another entity", nf0.format(q.entity_mismatch), "Excluded from sales"],
    ["Bank statements", `${q.statements_passing_balance_check} of ${q.statements} pass`, "Every row checked against the running balance"],
    ["Transactions extracted", nf0.format(q.statement_rows), q.accounts.map((a) => `${a.bank} ••${(a.iban || "").slice(-4)}`).join(", ")],
    ["Months missing", (q.invoice_months_missing.length + Object.values(q.statement_months_missing).flat().length) ? "Yes" : "None", "Invoices and statements cover 12 months"],
    ...Object.entries(byMethod).sort((a, b) => b[1] - a[1]).map(([k, v]) => [`Matched by: ${METHOD_TEXT[k] || k}`, pct(v / total), sarShort(v)]),
    ["Payer names sent to human review", nf0.format(r.review_queue.length), "Matches below 0.80 name confidence"],
  ];
  if (q.matching_accuracy) rows.push(["Matching accuracy on sample data", `${pct(q.matching_accuracy.precision)} / ${pct(q.matching_accuracy.recall)}`, "Precision / recall vs. generator ground truth"]);
  $("quality").innerHTML = rows.map(([k, v, s]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}${s ? `<small>${esc(s)}</small>` : ""}</dd></div>`).join("");

  if ($("sampleFiles").dataset.loaded) return;
  try {
    const files = await getJSON(`${API}/sample-data`);
    const main = files.filter((f) => !f.path.startsWith("statements/") && !f.path.endsWith(".json") || f.path === "organization.json");
    const stm = files.filter((f) => f.path.startsWith("statements/"));
    const kb = (b) => b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;
    const link = (f, label) => `<a href="${API}/sample-data/${encodeURI(f.path)}" download>${esc(label || f.path)}</a>`;
    $("sampleFiles").innerHTML = main.map((f) => `<li>${link(f)}<span>${kb(f.bytes)}</span></li>`).join("") +
      `<li>Bank statements (${stm.length} PDFs): ${stm.map((f) => link(f, f.path.replace("statements/", "").replace(".pdf", ""))).join(", ")}</li>`;
    $("sampleFiles").dataset.loaded = "1";
  } catch { /* file list is optional */ }
}

// ---------- tooltip ----------
function showTip(ev, html) {
  const t = $("tooltip");
  t.innerHTML = html; t.hidden = false;
  const r = t.getBoundingClientRect();
  let x = ev.clientX + 14, y = ev.clientY + 14;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - 14;
  t.style.left = `${x}px`; t.style.top = `${y}px`;
}
function hideTip() { $("tooltip").hidden = true; }

// ---------- events ----------
function wire() {
  $("toggleTable").onclick = () => {
    const open = $("ledgerTable").hidden;
    $("ledgerTable").hidden = !open;
    $("toggleTable").setAttribute("aria-expanded", String(open));
    $("toggleTable").textContent = open ? "Hide table" : "Show as table";
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
  let t;
  $("invSearch").oninput = (e) => { clearTimeout(t); t = setTimeout(() => { state.search = e.target.value; state.page = 0; renderInvoices(); }, 150); };
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
    btn.disabled = true; btn.textContent = "Analyzing…";
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
      btn.disabled = false; btn.textContent = "Analyze files";
    }
  };
}

wire();
loadSample();
