/* گزارش‌ها — داده از موتور گزارش پایتون (تقویم شمسی) */
"use strict";

let rep = null;           // آخرین گزارش دریافتی
let rangeFrom = "", rangeTo = "";
let filtersInit = false;
let detailRow = null;

const STATUS_BADGE = {
  approved: '<span class="badge ok">تأیید‌شده</span>',
  rejected: '<span class="badge danger">رد‌شده</span>',
  pending: '<span class="badge muted">در انتظار</span>',
};

/* ---------- تب‌ها ---------- */
$$(".tabs button").forEach(b => b.onclick = () => {
  $$(".tabs button").forEach(x => x.classList.remove("active"));
  b.classList.add("active");
  const t = b.dataset.tab;
  $("#tab-att").style.display = t === "att" ? "" : "none";
  $("#tab-leave").style.display = t === "leave" ? "" : "none";
  if (t === "leave") loadLeaves();
});

/* ---------- گزارش حضور و غیاب ---------- */
function buildQuery() {
  const p = new URLSearchParams();
  const f = $("#f-from").value.trim(), t = $("#f-to").value.trim();
  if (f) p.set("from", f);
  if (t) p.set("to", t);
  if ($("#f-unit").value) p.set("unit", $("#f-unit").value);
  if ($("#f-emp").value) p.set("employee", $("#f-emp").value);
  return p.toString();
}

async function loadReport() {
  try {
    setLoader(true);
    const d = await apiGet("/api/reports?" + buildQuery());
    rep = d.report;
    rangeFrom = rep.from; rangeTo = rep.to;
    $("#f-from").value = rep.from;
    $("#f-to").value = rep.to;

    if (!filtersInit) {
      $("#f-unit").innerHTML = '<option value="">همهٔ واحدها</option>' +
        d.units.map(u => `<option value="${u}">${u}</option>`).join("");
      const opts = '<option value="">همهٔ کارمندان</option>' +
        d.employees.map(e => `<option value="${e.id}">${e.name}</option>`).join("");
      $("#f-emp").innerHTML = opts;
      $("#lv-emp").innerHTML = '<option value="">— انتخاب کنید —</option>' +
        d.employees.map(e => `<option value="${e.id}">${e.name}</option>`).join("");
      filtersInit = true;
    }
    renderReport();
  } catch (e) { toast(e.message, "err"); }
  finally { setLoader(false); }
}

function renderReport() {
  const body = $("#rep-body");
  if (!rep.rows.length) {
    body.innerHTML = `<tr><td colspan="10"><div class="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/></svg>
      <p>داده‌ای برای این بازه نیست</p><span>بازهٔ تاریخ یا فیلترها را تغییر دهید.</span></div></td></tr>`;
    return;
  }
  body.innerHTML = rep.rows.map((r, i) => `
    <tr>
      <td>${r.code ? toFa(r.code) : "—"}</td>
      <td><b>${r.name}</b></td>
      <td>${r.unit || "—"}</td>
      <td>${toFa(r.working_days)}</td>
      <td><span class="num s-present">${toFa(r.present)}</span></td>
      <td><span class="num s-absent">${toFa(r.absent)}</span></td>
      <td><span class="num s-late">${toFa(r.late)}</span></td>
      <td>${toFa(r.overtime)}</td>
      <td>${STATUS_BADGE[r.approval] || STATUS_BADGE.pending}</td>
      <td style="text-align:left;white-space:nowrap;"><button class="btn sm ghost" data-detail="${i}">جزئیات</button></td>
    </tr>`).join("");
  $$("[data-detail]", body).forEach(b => b.onclick = () => openDetail(rep.rows[+b.dataset.detail]));
}

/* ---------- مودال جزئیات ---------- */
const dModal = $("#detail-modal");
const DAY_STATUS = {
  present: '<span class="badge ok">حاضر</span>',
  absent: '<span class="badge danger">غایب</span>',
};

function openDetail(row) {
  detailRow = row;
  $("#detail-title").textContent = "جزئیات حضور — " + row.name;
  $("#detail-summary").innerHTML =
    `بازه: <b dir="ltr">${toFa(rangeFrom)}</b> تا <b dir="ltr">${toFa(rangeTo)}</b> ·
     حاضر ${toFa(row.present)} · غایب ${toFa(row.absent)} · تأخیر ${toFa(row.late)} · اضافه‌کاری ${toFa(row.overtime)} ساعت`;
  const body = $("#detail-body");
  body.innerHTML = (row.daily || []).map(day => `
    <tr>
      <td dir="ltr" style="text-align:right;">${toFa(day.date)}</td>
      <td>${DAY_STATUS[day.status] || day.status}${day.late ? ' <span class="badge muted">تأخیر</span>' : ""}</td>
      <td>${day.first_in ? toFa(day.first_in) : "—"}</td>
      <td>${day.last_out ? toFa(day.last_out) : "—"}</td>
      <td>${day.status === "present" ? toFa(day.worked) : "—"}</td>
    </tr>`).join("") ||
    `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px;">روزی ثبت نشده است.</td></tr>`;
  dModal.classList.add("show");
}
function closeDetail() { dModal.classList.remove("show"); }

async function setApproval(status) {
  if (!detailRow) return;
  try {
    setLoader(true);
    await apiPost("/api/reports/approve", {
      employee_id: detailRow.id, from: rangeFrom, to: rangeTo, status,
    });
    detailRow.approval = status;
    toast(status === "approved" ? "گزارش تأیید شد." : "گزارش رد شد.", "ok");
    closeDetail();
    renderReport();
  } catch (e) { toast(e.message, "err"); }
  finally { setLoader(false); }
}

$("#approve-btn").onclick = () => setApproval("approved");
$("#reject-btn").onclick = () => setApproval("rejected");
$$("[data-close]", dModal).forEach(b => b.onclick = closeDetail);
dModal.addEventListener("click", e => { if (e.target === dModal) closeDetail(); });

$("#apply-filter").onclick = loadReport;
$("#export-btn").onclick = () => { window.location = "/api/reports/export?" + buildQuery(); };

/* ---------- مرخصی‌ها ---------- */
const LEAVE_TYPE = {
  "استحقاقی": "ok", "استعلاجی": "muted", "بدون حقوق": "err", "ساعتی": "muted",
};

async function loadLeaves() {
  try {
    const d = await apiGet("/api/leaves");
    const body = $("#lv-body");
    if (!d.leaves.length) {
      body.innerHTML = `<tr><td colspan="7"><div class="empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <p>مرخصی‌ای ثبت نشده است</p><span>از فرم بالا یک مرخصی ثبت کنید.</span></div></td></tr>`;
      return;
    }
    body.innerHTML = d.leaves.map(lv => `
      <tr>
        <td>${lv.code ? toFa(lv.code) : "—"}</td>
        <td><b>${lv.name}</b></td>
        <td dir="ltr" style="text-align:right;">${toFa(lv.from)}</td>
        <td dir="ltr" style="text-align:right;">${toFa(lv.to)}</td>
        <td><span class="badge ${LEAVE_TYPE[lv.type] || "muted"}">${lv.type}</span></td>
        <td>${lv.note || "—"}</td>
        <td style="text-align:left;"><button class="btn sm danger-ghost" data-del="${lv.id}">حذف</button></td>
      </tr>`).join("");
    $$("[data-del]", body).forEach(b => b.onclick = () => delLeave(b.dataset.del));
  } catch (e) { toast(e.message, "err"); }
}

$("#lv-add").onclick = async () => {
  const payload = {
    employee_id: $("#lv-emp").value,
    from: $("#lv-from").value.trim(),
    to: $("#lv-to").value.trim(),
    type: $("#lv-type").value,
    note: $("#lv-note").value.trim(),
  };
  if (!payload.employee_id) { toast("کارمند را انتخاب کنید.", "err"); return; }
  if (!payload.from || !payload.to) { toast("بازهٔ تاریخ مرخصی را وارد کنید.", "err"); return; }
  try {
    setLoader(true);
    await apiPost("/api/leaves", payload);
    $("#lv-note").value = "";
    toast("مرخصی ثبت شد.", "ok");
    loadLeaves();
  } catch (e) { toast(e.message, "err"); }
  finally { setLoader(false); }
};

async function delLeave(id) {
  if (!confirm("این مرخصی حذف شود؟")) return;
  try {
    setLoader(true);
    await apiDel("/api/leaves/" + id);
    toast("مرخصی حذف شد.", "ok");
    loadLeaves();
  } catch (e) { toast(e.message, "err"); }
  finally { setLoader(false); }
}

loadReport();
