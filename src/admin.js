const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let users = [], me = null, editing = null;

async function api(url, method = "GET", body) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) { location.href = "/login"; return {}; }
  return res.json();
}
const say = (t, bad) => { $("msg").textContent = t; $("msg").classList.toggle("err", !!bad); };

async function load() {
  const r = await api("/api/users");
  if (!r.users) { location.href = "/"; return; }
  users = r.users; me = r.me;
  $("count").textContent = `(${users.length})`;
  $("users").innerHTML = "<tr><th>Username</th><th>Role</th><th>Rides</th><th>Created</th><th></th></tr>" +
    users.map((u) => `<tr><td>${esc(u.username)}${u.id === me ? ' <span class="pill">you</span>' : ""}</td>
      <td>${u.role === "admin" ? IC("crown") + " Admin" : "User"}</td><td>${u.rides}</td><td>${esc(u.created || "")}</td>
      <td class="acts"><button class="ghost sm" data-edit="${u.id}">Edit</button>
      ${u.id === me ? "" : `<button class="ghost sm danger" data-del="${u.id}">Delete</button>`}</td></tr>`).join("");
}

function resetForm() {
  editing = null;
  $("f_user").value = ""; $("f_pw").value = ""; $("f_role").value = "user";
  $("formTitle").textContent = "Add user"; $("save").textContent = "Add user"; $("cancel").hidden = true;
  $("pwLabel").textContent = "Password"; $("f_pw").placeholder = "";
}

$("users").addEventListener("click", async (e) => {
  const ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
  if (ed) {
    const u = users.find((x) => x.id === +ed.dataset.edit);
    editing = u.id;
    $("f_user").value = u.username; $("f_pw").value = ""; $("f_role").value = u.role;
    $("formTitle").textContent = `Edit ${u.username}`; $("save").textContent = "Save changes"; $("cancel").hidden = false;
    $("pwLabel").textContent = "New password"; $("f_pw").placeholder = "leave blank to keep current";
    say(""); window.scrollTo({ top: 0, behavior: "smooth" }); $("f_user").focus();
  }
  if (del) {
    const u = users.find((x) => x.id === +del.dataset.del);
    if (!confirm(`Delete "${u.username}" and all of their rides, routes and profile? This cannot be undone.`)) return;
    const r = await api(`/api/users/${u.id}`, "DELETE");
    say(r.ok ? `Deleted ${u.username}.` : r.error, !r.ok);
    if (editing === u.id) resetForm();
    load();
  }
});

$("save").addEventListener("click", async () => {
  const body = { username: $("f_user").value.trim(), role: $("f_role").value };
  if ($("f_pw").value || !editing) body.password = $("f_pw").value;
  const r = editing ? await api(`/api/users/${editing}`, "PUT", body) : await api("/api/users", "POST", body);
  if (r.ok) { say(editing ? "User updated." : `Added ${body.username}.`); resetForm(); load(); }
  else say(r.error || "Something went wrong.", true);
});
$("cancel").addEventListener("click", () => { resetForm(); say(""); });
$("logout").addEventListener("click", async () => { await api("/api/logout", "POST"); location.href = "/login"; });
load();
