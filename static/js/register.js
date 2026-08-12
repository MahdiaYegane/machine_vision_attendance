/* ثبت چهره — فریم وب‌کم گرفته و برای پردازش به پایتون فرستاده می‌شود.
   نمایش زندهٔ کادر تشخیص (bounding box) با همان موتور OpenCV سمت سرور. */
"use strict";

let stream = null;
let employees = [];
let current = null;          // کارمند انتخاب‌شده
let sessionThumbs = [];      // تصویرهای گرفته‌شده در همین نشست (dataURL)
let serverCount = 0;         // تعداد نمونه‌های ذخیره‌شده روی سرور

let previewing = false;      // حلقهٔ پیش‌نمایش زنده فعال است
let busy = false;            // جلوگیری از ارسال هم‌زمان فریم
let faceSeen = false;        // در آخرین فریم، چهره دیده شد؟

const vf = $("#reg-vf");
const video = $("#reg-video");
const canvas = $("#reg-canvas");

async function loadEmployees() {
  try {
    const d = await apiGet("/api/employees");
    employees = d.employees;
    const sel = $("#emp-select");
    sel.innerHTML = '<option value="">— انتخاب کنید —</option>' +
      employees.map(e => `<option value="${e.id}">${e.name}${e.code ? " (" + toFa(e.code) + ")" : ""}</option>`).join("");
    if (employees.length === 0) {
      $("#sel-info").innerHTML = 'هنوز کارمندی ثبت نشده است. ابتدا از صفحهٔ <b>«کارمندان»</b> یک نفر اضافه کنید.';
    }
  } catch (e) { toast(e.message, "err"); }
}

function selectEmployee(id) {
  current = employees.find(e => e.id === id) || null;
  sessionThumbs = [];
  serverCount = current ? (current.samples || 0) : 0;
  const info = $("#sel-info");
  const clearBtn = $("#clear-samples");
  if (!current) {
    info.textContent = "برای ثبت چهره ابتدا یک کارمند را انتخاب کنید.";
    clearBtn.style.display = "none";
    renderSamples();
    return;
  }
  info.innerHTML = `<b>${current.name}</b> — ${current.position || "بدون سمت"} · واحد ${current.unit || "—"}`;
  clearBtn.style.display = serverCount > 0 ? "block" : "none";
  renderSamples();
}

function renderSamples() {
  const box = $("#samples");
  const older = Math.max(0, serverCount - sessionThumbs.length);
  const empty = Math.max(0, 5 - Math.max(serverCount, sessionThumbs.length));
  let html = "";
  sessionThumbs.forEach((src, i) => {
    html += `<div class="sample"><span class="n">${toFa(i + 1)}</span><img src="${src}" alt=""></div>`;
  });
  for (let i = 0; i < older; i++) {
    html += `<div class="sample-empty" style="border-style:solid;border-color:var(--success);color:var(--success);">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div>`;
  }
  for (let i = 0; i < empty; i++) {
    html += `<div class="sample-empty">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>`;
  }
  box.innerHTML = html;
}

/* ---------- کادر تشخیص زنده ---------- */
function drawBox(boxArr, w, h) {
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  if (!boxArr) return;
  const [x, y, bw, bh] = boxArr;
  ctx.lineWidth = Math.max(2, Math.round(w / 180));
  ctx.strokeStyle = "#12b886";
  ctx.strokeRect(x, y, bw, bh);
}
function clearCanvas() {
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

async function previewLoop() {
  if (!previewing) return;
  if (video.readyState >= 2 && !busy) {
    busy = true;
    try {
      const frame = captureFrame(video, 800);
      const d = await apiPost("/api/recognize", { image: frame.dataUrl });
      drawBox(d.box, frame.w, frame.h);
      faceSeen = !!d.face_found;
      $("#cam-state").textContent = d.face_found
        ? "چهره تشخیص داده شد ✔"
        : "صورتی دیده نمی‌شود — مقابل دوربین قرار بگیرید";
    } catch (e) {
      faceSeen = false;
      $("#cam-state").textContent = "خطا در تشخیص: " + e.message;
    } finally {
      busy = false;
    }
  }
  if (previewing) setTimeout(previewLoop, 600);
}

$("#emp-select").onchange = e => selectEmployee(e.target.value);

$("#cam-start").onclick = async () => {
  try {
    stream = await startCamera(video);
    vf.classList.add("scanning");
    $("#reg-hint").style.display = "none";
    $("#cam-state").textContent = "دوربین روشن است";
    $("#cam-start").disabled = true;
    $("#cam-stop").disabled = false;
    $("#capture").disabled = false;     // همیشه قابل کلیک؛ اعتبارسنجی هنگام کلیک
    previewing = true;
    previewLoop();
  } catch (e) { toast(e.message, "err"); }
};

$("#cam-stop").onclick = () => {
  previewing = false;
  stopCamera(stream); stream = null;
  clearCanvas();
  vf.classList.remove("scanning", "matched");
  $("#reg-hint").style.display = "";
  $("#cam-state").textContent = "دوربین خاموش است";
  $("#cam-start").disabled = false;
  $("#cam-stop").disabled = true;
  $("#capture").disabled = true;
};

$("#capture").onclick = async () => {
  if (!stream) { toast("ابتدا دوربین را روشن کنید.", "err"); return; }
  if (!current) { toast("ابتدا یک کارمند را از فهرست انتخاب کنید.", "err"); return; }
  if (serverCount >= 5) { toast("برای این کارمند ۵ نمونه ثبت شده و کافی است.", "err"); return; }
  if (!faceSeen) { toast("چهره‌ای دیده نمی‌شود؛ صورت را کامل مقابل دوربین بگیرید.", "err"); return; }
  const frame = captureFrame(video, 960);
  try {
    setLoader(true);
    const d = await apiPost("/api/face/register", { employee_id: current.id, image: frame.dataUrl });
    serverCount = d.samples;
    sessionThumbs.push(frame.dataUrl);
    if (sessionThumbs.length > 5) sessionThumbs = sessionThumbs.slice(-5);
    vf.classList.add("matched");
    setTimeout(() => vf.classList.remove("matched"), 650);
    const emp = employees.find(e => e.id === current.id);
    if (emp) { emp.samples = serverCount; emp.has_face = serverCount > 0; }
    $("#clear-samples").style.display = serverCount > 0 ? "block" : "none";
    renderSamples();
    toast(`نمونه ثبت شد (${toFa(serverCount)} از ۵).`, "ok");
  } catch (e) {
    toast(e.message, "err");
  } finally { setLoader(false); }
};

$("#clear-samples").onclick = async () => {
  if (!current) return;
  if (!confirm("حذف همهٔ نمونه‌های چهرهٔ «" + current.name + "»؟")) return;
  try {
    setLoader(true);
    await apiDel("/api/face/" + current.id);
    serverCount = 0; sessionThumbs = [];
    const emp = employees.find(e => e.id === current.id);
    if (emp) { emp.samples = 0; emp.has_face = false; }
    $("#clear-samples").style.display = "none";
    renderSamples();
    toast("نمونه‌های چهره حذف شد.", "ok");
  } catch (e) { toast(e.message, "err"); }
  finally { setLoader(false); }
};

window.addEventListener("beforeunload", () => { previewing = false; stopCamera(stream); });

loadEmployees();
renderSamples();
