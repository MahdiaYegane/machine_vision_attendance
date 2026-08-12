/* کیوسک — حلقهٔ تشخیص زنده با ارسال فریم به پایتون */
"use strict";

let stream = null;
let running = false;
let busy = false;          // جلوگیری از ارسال هم‌زمان
let currentMatch = null;   // آخرین کارمند شناسایی‌شده
let missCount = 0;

const vf = $("#kiosk-vf");
const video = $("#kioskVideo");
const canvas = $("#kioskCanvas");
const result = $("#result");

const BADGE = {
  idle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M5 21c0-4 3-6 7-6s7 2 7 6"/></svg>',
  scanning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.5"/></svg>',
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  fail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
};

function setState(cls, status, name, sub) {
  result.className = "result-card result-state " + cls;
  $("#result-status").textContent = status;
  $("#result-name").textContent = name || "—";
  $("#result-sub").innerHTML = sub || "";
  $("#result-badge").innerHTML = BADGE[cls] || BADGE.idle;
  vf.classList.toggle("matched", cls === "success");
  vf.classList.toggle("scanning", cls === "scanning");
}

function drawBox(box, w, h) {
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  if (!box) return;
  const [x, y, bw, bh] = box;
  ctx.lineWidth = Math.max(2, Math.round(w / 180));
  ctx.strokeStyle = currentMatch ? "#12b886" : "#f59f00";
  ctx.strokeRect(x, y, bw, bh);
}

function clearCanvas() {
  const ctx = canvas.getContext("2d");
  ctx && ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function applyMatch(m) {
  currentMatch = m;
  const stateTxt = m.today_state === "in"
    ? `آخرین تردد: ورود ساعت ${toFa(m.last_time || "")}`
    : m.today_state === "out"
      ? `آخرین تردد: خروج ساعت ${toFa(m.last_time || "")}`
      : "امروز هنوز ترددی ثبت نشده";
  const sub = `${m.position || "کارمند"}${m.unit ? " · " + m.unit : ""} · <span style="color:var(--muted)">${stateTxt}</span>`;
  setState("success", "تشخیص موفق", m.name, sub);
  // فعال‌سازی دکمه‌ها و برجسته‌کردن پیشنهاد
  const bIn = $("#btn-in"), bOut = $("#btn-out");
  bIn.disabled = false; bOut.disabled = false;
  bIn.classList.toggle("suggest", m.suggested === "in");
  bOut.classList.toggle("suggest", m.suggested === "out");
}

function clearMatch() {
  currentMatch = null;
  $("#btn-in").disabled = true; $("#btn-out").disabled = true;
  $("#btn-in").classList.remove("suggest");
  $("#btn-out").classList.remove("suggest");
}

async function loop() {
  if (!running) return;
  if (video.readyState >= 2 && !busy) {
    busy = true;
    try {
      const frame = captureFrame(video, 800);
      const d = await apiPost("/api/recognize", { image: frame.dataUrl });
      drawBox(d.box, frame.w, frame.h);
      if (d.match) {
        missCount = 0;
        applyMatch(d.match);
      } else if (d.face_found) {
        missCount = 0;
        clearMatch();
        setState("fail", "چهرهٔ ناشناس", "—", "این فرد در سیستم ثبت نشده است");
      } else {
        // چند فریم بدون چهره → حالت جستجو
        if (++missCount >= 2) {
          clearMatch();
          setState("scanning", "در حال جستجوی چهره…", "—", "صورت را روبه‌روی دوربین قرار دهید");
        }
      }
    } catch (e) {
      setState("fail", "خطا در تشخیص", "—", e.message);
    } finally {
      busy = false;
    }
  }
  if (running) setTimeout(loop, 700);
}

$("#kiosk-start").onclick = async () => {
  try {
    stream = await startCamera(video);
    $("#kiosk-hint").style.display = "none";
    $("#kiosk-state").textContent = "دوربین روشن است";
    $("#kiosk-start").disabled = true;
    $("#kiosk-stop").disabled = false;
    running = true; missCount = 0;
    setState("scanning", "در حال جستجوی چهره…", "—", "صورت را روبه‌روی دوربین قرار دهید");
    loop();
  } catch (e) { toast(e.message, "err"); }
};

$("#kiosk-stop").onclick = () => {
  running = false;
  stopCamera(stream); stream = null;
  clearCanvas(); clearMatch();
  $("#kiosk-hint").style.display = "";
  $("#kiosk-state").textContent = "دوربین خاموش است";
  $("#kiosk-start").disabled = false;
  $("#kiosk-stop").disabled = true;
  setState("idle", "در انتظار شناسایی", "—", "دوربین خاموش است");
};

async function logAttendance(type) {
  if (!currentMatch) return;
  try {
    setLoader(true);
    const d = await apiPost("/api/attendance", { employee_id: currentMatch.id, type });
    const label = type === "in" ? "ورود" : "خروج";
    toast(`${label} «${d.name}» ساعت ${toFa(d.record.time)} ثبت شد.`, "ok");
    // به‌روزرسانی پیشنهاد بر اساس وضعیت جدید
    currentMatch.today_state = d.today_state;
    currentMatch.suggested = d.suggested;
    currentMatch.last_time = d.record.time;
    $("#btn-in").classList.toggle("suggest", d.suggested === "in");
    $("#btn-out").classList.toggle("suggest", d.suggested === "out");
    const stateTxt = d.today_state === "in"
      ? `آخرین تردد: ورود ساعت ${toFa(d.record.time)}`
      : `آخرین تردد: خروج ساعت ${toFa(d.record.time)}`;
    $("#result-sub").innerHTML = `${currentMatch.position || "کارمند"}${currentMatch.unit ? " · " + currentMatch.unit : ""} · <span style="color:var(--muted)">${stateTxt}</span>`;
  } catch (e) {
    toast(e.message, "err");
  } finally { setLoader(false); }
}

$("#btn-in").onclick = () => logAttendance("in");
$("#btn-out").onclick = () => logAttendance("out");

window.addEventListener("beforeunload", () => stopCamera(stream));
