/* تنظیمات و مدیریت داده‌ها */
"use strict";

async function loadSettings() {
  try {
    const d = await apiGet("/api/settings");
    const s = d.settings;
    $("#s-start").value = s.start_time || "08:30";
    $("#s-hours").value = s.work_hours != null ? s.work_hours : 8;
    $("#s-company").value = s.company || "";
    const th = s.threshold != null ? s.threshold : 0.363;
    $("#s-threshold").value = th;
    $("#s-threshold-val").textContent = toFa(Number(th).toFixed(2)).replace(".", "٫");
  } catch (e) { toast(e.message, "err"); }
}

async function loadState() {
  try {
    const d = await apiGet("/api/state");
    $("#i-engine").innerHTML = d.engine_ready
      ? '<span class="badge ok"><span class="dot"></span>آماده</span>'
      : '<span class="badge danger">غیرفعال</span>';
    $("#i-emps").textContent = toFa(d.employee_count);
    $("#i-faces").textContent = toFa(d.registered_faces);
  } catch (e) { /* بی‌صدا */ }
}

$("#s-threshold").addEventListener("input", e => {
  $("#s-threshold-val").textContent = toFa(Number(e.target.value).toFixed(2)).replace(".", "٫");
});

$("#save-settings").onclick = async () => {
  const payload = {
    start_time: $("#s-start").value.trim(),
    work_hours: parseFloat($("#s-hours").value) || 8,
    threshold: parseFloat($("#s-threshold").value),
    company: $("#s-company").value.trim(),
  };
  try {
    setLoader(true);
    await apiPost("/api/settings", payload);
    toast("تنظیمات ذخیره شد.", "ok");
  } catch (e) { toast(e.message, "err"); }
  finally { setLoader(false); }
};

/* ---------- مدیریت داده‌ها ---------- */
$("#seed-btn").onclick = async () => {
  if (!confirm("ساخت دادهٔ نمونه؟ این کار داده‌های فعلی کارمندان و تردد را جایگزین می‌کند.")) return;
  try {
    setLoader(true);
    const d = await apiPost("/api/seed", {});
    toast(`${toFa(d.employees)} کارمند و ${toFa(d.records)} رکورد تردد ساخته شد.`, "ok");
    loadState();
  } catch (e) { toast(e.message, "err"); }
  finally { setLoader(false); }
};

$("#backup-btn").onclick = () => { window.location = "/api/backup"; };

$("#restore-btn").onclick = () => $("#restore-file").click();
$("#restore-file").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      setLoader(true);
      await apiPost("/api/restore", data);
      toast("داده‌ها از فایل پشتیبان بازگردانی شد.", "ok");
      loadSettings(); loadState();
    } catch (err) {
      toast("فایل پشتیبان نامعتبر است.", "err");
    } finally {
      setLoader(false);
      e.target.value = "";
    }
  };
  reader.readAsText(file);
});

$("#reset-btn").onclick = async () => {
  if (!confirm("همهٔ داده‌ها (کارمندان، چهره‌ها، ترددها و مرخصی‌ها) پاک شود؟ این کار بازگشت‌ناپذیر است.")) return;
  try {
    setLoader(true);
    await apiPost("/api/reset", {});
    toast("همهٔ داده‌ها پاک شد.", "ok");
    loadSettings(); loadState();
  } catch (e) { toast(e.message, "err"); }
  finally { setLoader(false); }
};

loadSettings();
loadState();
