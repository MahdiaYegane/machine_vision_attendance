/* ابزارهای مشترک سمت کلاینت */
"use strict";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ---------- ارقام و اعداد فارسی ---------- */
const FA = "۰۱۲۳۴۵۶۷۸۹";
function toFa(s) { return String(s).replace(/[0-9]/g, d => FA[d]); }
function faNum(n) { return Number(n).toLocaleString("fa-IR"); }

/* ---------- ساعت زندهٔ شمسی ---------- */
function startClock() {
  const dEl = $("#clock-date"), tEl = $("#clock-time");
  if (!dEl && !tEl) return;
  const dFmt = new Intl.DateTimeFormat("fa-IR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const tFmt = new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const tick = () => {
    const now = new Date();
    if (dEl) dEl.textContent = dFmt.format(now);
    if (tEl) tEl.textContent = tFmt.format(now);
  };
  tick();
  setInterval(tick, 1000);
}

/* ---------- لودر و توست ---------- */
function setLoader(on) { const l = $("#loader"); if (l) l.classList.toggle("show", !!on); }

function toast(msg, type = "") {
  const wrap = $("#toasts"); if (!wrap) return;
  const el = document.createElement("div");
  el.className = "toast " + type;
  const icon = type === "ok"
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
    : type === "err"
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  el.innerHTML = icon + "<span>" + msg + "</span>";
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateY(8px)"; setTimeout(() => el.remove(), 250); }, 3200);
}

/* ---------- فراخوانی API ---------- */
async function api(path, opts = {}) {
  const o = Object.assign({ headers: {} }, opts);
  if (o.body && typeof o.body !== "string") {
    o.headers["Content-Type"] = "application/json";
    o.body = JSON.stringify(o.body);
  }
  const res = await fetch(path, o);
  let data = {};
  try { data = await res.json(); } catch (e) { /* ممکن است فایل باشد */ }
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || "خطایی رخ داد (" + res.status + ").");
  }
  return data;
}
const apiGet = p => api(p);
const apiPost = (p, b) => api(p, { method: "POST", body: b || {} });
const apiPut = (p, b) => api(p, { method: "PUT", body: b || {} });
const apiDel = p => api(p, { method: "DELETE" });

/* ---------- وب‌کم ---------- */
async function startCamera(videoEl, opts = {}) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("مرورگر به دوربین دسترسی ندارد. از https یا localhost استفاده کنید.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  videoEl.srcObject = stream;
  await videoEl.play().catch(() => { });
  return stream;
}
function stopCamera(stream) {
  if (stream) stream.getTracks().forEach(t => t.stop());
}

/* یک فریم از ویدئو می‌گیرد و {dataUrl, w, h} برمی‌گرداند (کوچک‌شده برای ارسال سریع‌تر). */
function captureFrame(videoEl, maxW = 640) {
  const vw = videoEl.videoWidth || 640, vh = videoEl.videoHeight || 480;
  const scale = Math.min(1, maxW / vw);
  const w = Math.round(vw * scale), h = Math.round(vh * scale);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d").drawImage(videoEl, 0, 0, w, h);
  return { dataUrl: c.toDataURL("image/jpeg", 0.82), w, h };
}

/* ---------- شروع ---------- */
document.addEventListener("DOMContentLoaded", startClock);
