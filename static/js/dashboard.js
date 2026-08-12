/* داشبورد */
async function loadDashboard() {
  try {
    const d = await apiGet("/api/dashboard");
    $("#st-total").textContent = faNum(d.total_employees);
    $("#st-present").textContent = faNum(d.present_today);
    $("#st-late").textContent = faNum(d.late_today);
    $("#st-absent").textContent = faNum(d.absent_today);

    const body = $("#recent-body");
    if (!d.recent.length) {
      body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:32px;">امروز ترددی ثبت نشده است.</td></tr>';
      return;
    }
    body.innerHTML = d.recent.map(r => `
      <tr>
        <td>${r.name}</td>
        <td>${r.code ? toFa(r.code) : "—"}</td>
        <td><span class="badge ${r.type}"><span class="dot"></span>${r.type === "in" ? "ورود" : "خروج"}</span></td>
        <td>${toFa(r.time)}</td>
      </tr>`).join("");
  } catch (e) {
    toast(e.message, "err");
  }
}
loadDashboard();
