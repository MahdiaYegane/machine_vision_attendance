/* مدیریت کارمندان */
const modal = $("#emp-modal");

function openModal(emp) {
  $("#modal-title").textContent = emp ? "ویرایش کارمند" : "افزودن کارمند";
  $("#f-id").value = emp ? emp.id : "";
  $("#f-name").value = emp ? emp.name : "";
  $("#f-code").value = emp ? emp.code : "";
  $("#f-position").value = emp ? emp.position : "";
  $("#f-unit").value = emp ? emp.unit : "";
  $("#f-status").value = emp ? emp.status : "فعال";
  modal.classList.add("show");
  setTimeout(() => $("#f-name").focus(), 50);
}
function closeModal() { modal.classList.remove("show"); }

async function loadEmployees() {
  try {
    const d = await apiGet("/api/employees");
    const body = $("#emp-body");
    if (!d.employees.length) {
      body.innerHTML = `<tr><td colspan="7"><div class="empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        <p>هنوز کارمندی اضافه نشده است</p><span>برای شروع، یک کارمند اضافه کنید.</span></div></td></tr>`;
      return;
    }
    body.innerHTML = d.employees.map(e => `
      <tr>
        <td>${e.code ? toFa(e.code) : "—"}</td>
        <td><b>${e.name}</b></td>
        <td>${e.position || "—"}</td>
        <td>${e.unit || "—"}</td>
        <td>${e.has_face
          ? `<span class="badge ok"><span class="dot"></span>${toFa(e.samples)} نمونه</span>`
          : `<span class="badge muted">ثبت نشده</span>`}</td>
        <td><span class="badge ${e.status === "فعال" ? "ok" : "muted"}">${e.status}</span></td>
        <td style="text-align:left;white-space:nowrap;">
          <button class="btn sm ghost" data-edit='${encodeURIComponent(JSON.stringify(e))}'>ویرایش</button>
          <button class="btn sm danger-ghost" data-del="${e.id}" data-name="${e.name}">حذف</button>
        </td>
      </tr>`).join("");

    $$("[data-edit]", body).forEach(b => b.onclick = () => openModal(JSON.parse(decodeURIComponent(b.dataset.edit))));
    $$("[data-del]", body).forEach(b => b.onclick = () => removeEmp(b.dataset.del, b.dataset.name));
  } catch (e) { toast(e.message, "err"); }
}

async function save() {
  const id = $("#f-id").value;
  const payload = {
    name: $("#f-name").value.trim(),
    code: $("#f-code").value.trim(),
    position: $("#f-position").value.trim(),
    unit: $("#f-unit").value.trim(),
    status: $("#f-status").value,
  };
  if (!payload.name) { toast("نام کارمند را وارد کنید.", "err"); return; }
  try {
    setLoader(true);
    if (id) { await apiPut("/api/employees/" + id, payload); toast("اطلاعات کارمند به‌روزرسانی شد.", "ok"); }
    else { await apiPost("/api/employees", payload); toast("کارمند اضافه شد.", "ok"); }
    closeModal(); loadEmployees();
  } catch (e) { toast(e.message, "err"); }
  finally { setLoader(false); }
}

async function removeEmp(id, name) {
  if (!confirm("حذف «" + name + "»؟ ترددهای ثبت‌شدهٔ این کارمند نیز حذف می‌شود.")) return;
  try {
    setLoader(true);
    await apiDel("/api/employees/" + id);
    toast("کارمند حذف شد.", "ok"); loadEmployees();
  } catch (e) { toast(e.message, "err"); }
  finally { setLoader(false); }
}

$("#add-btn").onclick = () => openModal(null);
$("#save-btn").onclick = save;
$$("[data-close]", modal).forEach(b => b.onclick = closeModal);
modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
loadEmployees();
