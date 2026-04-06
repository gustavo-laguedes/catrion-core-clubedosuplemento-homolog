// app.js
const app = document.getElementById("app");
const router = window.CoreRouter.createRouter({ mountEl: app });

window.coreRouterInstance = router;

(async () => {
  try {
    let isLogged = false;

    if (window.CoreAuth?.bootstrap) {
      const result = await window.CoreAuth.bootstrap();
      isLogged = !!result?.ok && !!window.CoreAuth?.getCurrentUser?.();

      console.log("[CORE] bootstrap result:", result);
      console.log("[CORE] current user after bootstrap:", window.CoreAuth?.getCurrentUser?.());
      console.log("[CORE] active tenant after bootstrap:", window.CoreAuth?.getActiveTenantId?.());
    }

    if (isLogged) {
      const user = window.CoreAuth.getCurrentUser();
      updateUserUI(user);

      setActiveSidebar("home");
      router.render("home");
    } else {
      router.render("login");
    }
  } catch (e) {
    console.warn("CoreAuth.bootstrap falhou:", e);
    router.render("login");
  }
})();

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-go-home]");
  if (!el) return;

  setActiveSidebar("home");
  router.go("home");
});


function setActiveSidebar(routeName) {
  document.querySelectorAll(".sidebar-link").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.route === routeName);
  });
}

window.setActiveSidebar = setActiveSidebar;

document.addEventListener("click", (e) => {
  const navBtn = e.target.closest(".sidebar-link[data-route]");
  if (!navBtn) return;

  const route = navBtn.dataset.route;
  if (!route) return;

  router.go(route);
  setActiveSidebar(route);
});

// acessibilidade: Enter/Espaço no “logo”
document.addEventListener("keydown", (e) => {
  const el = document.activeElement;
  if (!el || el.id !== "btnGoHome") return;

  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    router.go("home");
  }
});

window.coreRouterInstance = router;
window.setActiveSidebar = setActiveSidebar;


// ===== refs DOM (config global) =====
const adminAuthOverlay = document.getElementById("adminAuthOverlay");
const adminPasswordInput = document.getElementById("adminPasswordInput");
const adminAuthError = document.getElementById("adminAuthError");

const systemConfigOverlay = document.getElementById("systemConfigOverlay");

const adminUsersOverlay = document.getElementById("adminUsersOverlay");
const btnAdminUsersClose = document.getElementById("btnAdminUsersClose");

const adminUsersList = document.getElementById("adminUsersList");
const adminUsersLoading = document.getElementById("adminUsersLoading");
const adminUsersEmpty = document.getElementById("adminUsersEmpty");
const adminUsersFeedback = document.getElementById("adminUsersFeedback");
const adminUsersSearch = document.getElementById("adminUsersSearch");
const btnAdminNewUser = document.getElementById("btnAdminNewUser");

const adminUserFormOverlay = document.getElementById("adminUserFormOverlay");
const adminUserFormTitle = document.getElementById("adminUserFormTitle");
const adminUserFormSubtitle = document.getElementById("adminUserFormSubtitle");
const btnAdminUserFormClose = document.getElementById("btnAdminUserFormClose");
const btnAdminUserFormCancel = document.getElementById("btnAdminUserFormCancel");
const btnAdminUserFormSave = document.getElementById("btnAdminUserFormSave");
const btnAdminUserSendReset = document.getElementById("btnAdminUserSendReset");
const adminUserFormFeedback = document.getElementById("adminUserFormFeedback");

const adminUserId = document.getElementById("adminUserId");
const adminUserEmail = document.getElementById("adminUserEmail");

const adminUserRole = document.getElementById("adminUserRole");


const configMachines = document.getElementById("machinesSection");

// machines
const machineForm = document.getElementById("machineForm");
const btnNewMachine = document.getElementById("btnNewMachine");
const saveMachineBtn = document.getElementById("saveMachine");
const machineNameInput = document.getElementById("machineName");
const machinesList = document.getElementById("machineList");


/* =========================
   CUSTOMERS STORE (Supabase)
========================= */

window.CustomersStore = (function () {
  function requireSb() {
  const candidates = [
    window.sb,
    window.CoreSupabase?.client,
    window.supabase
  ];

  const sb = candidates.find(c => c && typeof c.from === "function") || null;

  if (!sb) {
    throw new Error("Cliente Supabase não encontrado ou inválido em window.");
  }

  return sb;
}

  function getTenantId() {
    const auth = window.CoreAuth;
    if (auth?.getCurrentTenantId) return auth.getCurrentTenantId();
    if (auth?.getTenantId) return auth.getTenantId();

    const u = auth?.getCurrentUser?.() || null;
    return u?.tenant_id || u?.tenantId || null;
  }

  function mapRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name || "",
      phone: row.phone || "",
      doc: row.doc || "",
      notes: row.notes || "",
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null
    };
  }

  async function list({ limit = 1000, orderBy = "name", ascending = true } = {}) {
    const sb = requireSb();
    const tenantId = getTenantId();
    if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");

    let query = sb
      .from("customers")
      .select("*")
      .eq("tenant_id", tenantId)
      .order(orderBy, { ascending });

    if (limit) query = query.limit(limit);

    const { data, error } = await query;
    if (error) {
  console.error("[CustomersStore.list] erro Supabase:", {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
    tenantId
  });
  throw error;
}

    return (data || []).map(mapRow);
  }

  async function create(payload = {}) {
    const sb = requireSb();
    const tenantId = getTenantId();
    if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");

    const row = {
      tenant_id: tenantId,
      name: String(payload.name || "").trim(),
      phone: String(payload.phone || "").trim() || null,
      doc: String(payload.doc || "").trim() || null,
      notes: String(payload.notes || "").trim() || null
    };

    const { data, error } = await sb
  .from("customers")
  .insert(row)
  .select("*")
  .single();

if (error) {
  console.error("[CustomersStore.create] erro Supabase:", {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
    row
  });

  const detailedMessage = [
    error.code ? `[${error.code}]` : "",
    error.message || "",
    error.details || "",
    error.hint || ""
  ].filter(Boolean).join(" ");

  throw new Error(detailedMessage || "Não foi possível salvar o cliente.");
}

return mapRow(data);
  }

  async function update(id, payload = {}) {
    const sb = requireSb();
    const tenantId = getTenantId();
    if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");
    if (!id) throw new Error("ID do cliente é obrigatório.");

    const row = {
      name: String(payload.name || "").trim(),
      phone: String(payload.phone || "").trim() || null,
      doc: String(payload.doc || "").trim() || null,
      notes: String(payload.notes || "").trim() || null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await sb
      .from("customers")
      .update(row)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();

   if (error) {
  console.error("[CustomersStore.update] erro Supabase:", {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
    id,
    tenantId,
    row
  });

  const detailedMessage = [
    error.code ? `[${error.code}]` : "",
    error.message || "",
    error.details || "",
    error.hint || ""
  ].filter(Boolean).join(" ");

  throw new Error(detailedMessage || "Não foi possível atualizar o cliente.");
}

return mapRow(data);
  }

  async function remove(id) {
    const sb = requireSb();
    const tenantId = getTenantId();
    if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");
    if (!id) throw new Error("ID do cliente é obrigatório.");

    const { error } = await sb
      .from("customers")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (error) {
  console.error("[CustomersStore.remove] erro Supabase:", {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
    id,
    tenantId
  });

  const detailedMessage = [
    error.code ? `[${error.code}]` : "",
    error.message || "",
    error.details || "",
    error.hint || ""
  ].filter(Boolean).join(" ");

  throw new Error(detailedMessage || "Não foi possível excluir o cliente.");
}
    return true;
  }

  return {
    list,
    create,
    update,
    remove
  };
})();


/* =========================
   MACHINES STORE (Supabase)
========================= */

window.MachinesStore = (function () {
  function requireSb() {
    const candidates = [
      window.sb,
      window.CoreSupabase?.client,
      window.supabase
    ];

    const sb = candidates.find(c => c && typeof c.from === "function") || null;

    if (!sb) {
      throw new Error("Cliente Supabase não encontrado ou inválido em window.");
    }

    return sb;
  }

  function getTenantId() {
    const auth = window.CoreAuth;
    if (auth?.getCurrentTenantId) return auth.getCurrentTenantId();
    if (auth?.getTenantId) return auth.getTenantId();

    const u = auth?.getCurrentUser?.() || null;
    return u?.tenant_id || u?.tenantId || null;
  }

  function normalizeRates(rates) {
  const src = rates && typeof rates === "object" ? rates : {};
  const out = {};

  Object.keys(src).forEach(key => {
    const raw = src[key];

    if (raw && typeof raw === "object") {
      out[String(key)] = {
        enabled: raw.enabled !== false,
        rate: Number(raw.rate || 0)
      };
      return;
    }

    out[String(key)] = {
      enabled: true,
      rate: Number(raw || 0)
    };
  });

  return out;
}

  function mapRow(row) {
    if (!row) return null;

    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name || "",
      rates: normalizeRates(row.rates || {}),
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
      raw: row
    };
  }

  async function list({ limit = 1000, orderBy = "name", ascending = true } = {}) {
    const sb = requireSb();
    const tenantId = getTenantId();
    if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");

    let query = sb
      .from("machines")
      .select("*")
      .eq("tenant_id", tenantId)
      .order(orderBy, { ascending });

    if (limit) query = query.limit(limit);

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map(mapRow);
  }

  async function create(payload = {}) {
    const sb = requireSb();
    const tenantId = getTenantId();
    if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");

    const row = {
      tenant_id: tenantId,
      name: String(payload.name || "").trim(),
      rates: normalizeRates(payload.rates || {})
    };

    const { data, error } = await sb
      .from("machines")
      .insert(row)
      .select("*")
      .single();

    if (error) throw error;
    return mapRow(data);
  }

  async function update(id, payload = {}) {
    const sb = requireSb();
    const tenantId = getTenantId();
    if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");
    if (!id) throw new Error("ID da maquininha é obrigatório.");

    const row = {
      name: String(payload.name || "").trim(),
      rates: normalizeRates(payload.rates || {}),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await sb
      .from("machines")
      .update(row)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();

    if (error) {
  console.error("[MachinesStore.update] erro Supabase:", {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
    id,
    row,
    tenantId
  });

  const detailedMessage = [
    error.code ? `[${error.code}]` : "",
    error.message || "",
    error.details || "",
    error.hint || ""
  ].filter(Boolean).join(" ");

  throw new Error(detailedMessage || "Não foi possível atualizar a maquininha.");
}
    return mapRow(data);
  }

  async function remove(id) {
    const sb = requireSb();
    const tenantId = getTenantId();
    if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");
    if (!id) throw new Error("ID da maquininha é obrigatório.");

    const { error } = await sb
      .from("machines")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (error) throw error;
    return true;
  }

  return {
    list,
    create,
    update,
    remove
  };
})();


/* =========================
   AP CATEGORIES STORE (Supabase)
========================= */

window.APCategoriesStore = (function () {
  function requireSb() {
    const candidates = [
      window.sb,
      window.CoreSupabase?.client,
      window.supabase
    ];
    const sb = candidates.find(c => c && typeof c.from === "function") || null;
    if (!sb) throw new Error("Cliente Supabase não encontrado ou inválido em window.");
    return sb;
  }

  function getTenantId() {
    const auth = window.CoreAuth;
    if (auth?.getCurrentTenantId) return auth.getCurrentTenantId();
    if (auth?.getTenantId) return auth.getTenantId();
    const u = auth?.getCurrentUser?.() || null;
    return u?.tenant_id || u?.tenantId || null;
  }

  function mapRow(row) {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: String(row.name || "").trim(),
      createdAt: row.created_at || null
    };
  }

  async function list({ limit = 1000, orderBy = "name", ascending = true } = {}) {
    const sb = requireSb();
    const tenantId = getTenantId();
    if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");

    let query = sb
      .from("ap_categories")
      .select("*")
      .eq("tenant_id", tenantId)
      .order(orderBy, { ascending });

    if (limit) query = query.limit(limit);

    const { data, error } = await query;
    if (error) {
  console.error("[APCategoriesStore.list] erro Supabase:", {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
    tenantId
  });

  const detailedMessage = [
    error.code ? `[${error.code}]` : "",
    error.message || "",
    error.details || "",
    error.hint || ""
  ].filter(Boolean).join(" ");

  throw new Error(detailedMessage || "Não foi possível carregar as categorias.");
}
    return (data || []).map(mapRow);
  }

  async function create(payload = {}) {
    const sb = requireSb();
    const tenantId = getTenantId();
    if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");

    const row = {
      tenant_id: tenantId,
      name: String(payload.name || "").trim()
    };

    const { data, error } = await sb
      .from("ap_categories")
      .insert(row)
      .select("*")
      .single();

    if (error) throw error;
    return mapRow(data);
  }

  async function remove(id) {
  const sb = requireSb();
  const tenantId = getTenantId();
  if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");
  if (!id) throw new Error("ID da categoria é obrigatório.");

  const { error } = await sb
    .from("ap_categories")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("[APCategoriesStore.remove] erro Supabase:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      id,
      tenantId
    });

    const detailedMessage = [
      error.code ? `[${error.code}]` : "",
      error.message || "",
      error.details || "",
      error.hint || ""
    ].filter(Boolean).join(" ");

    throw new Error(detailedMessage || "Não foi possível excluir a categoria.");
  }

  return true;
}

  return { list, create, remove };
})();


/* =========================
   AP PAYABLES STORE (Supabase)
========================= */

window.APPayablesStore = (function () {
  function requireSb() {
    const candidates = [
      window.sb,
      window.CoreSupabase?.client,
      window.supabase
    ];
    const sb = candidates.find(c => c && typeof c.from === "function") || null;
    if (!sb) throw new Error("Cliente Supabase não encontrado ou inválido em window.");
    return sb;
  }

  function getTenantId() {
    const auth = window.CoreAuth;
    if (auth?.getCurrentTenantId) return auth.getCurrentTenantId();
    if (auth?.getTenantId) return auth.getTenantId();
    const u = auth?.getCurrentUser?.() || null;
    return u?.tenant_id || u?.tenantId || null;
  }

  function mapRow(row) {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      title: row.title || "",
      categoryId: row.category_id || null,
      category: row.category_name || "",
      supplier: row.supplier || "",
      amount: Number(row.amount || 0),
      dueDate: row.due_date || "",
      status: row.status || "pending",
      paidAt: row.paid_at || null,
      paidMethod: row.paid_method || "",
      notes: row.notes || "",
      groupId: row.group_id || "",
      installment: row.installment != null ? Number(row.installment) : null,
      installments: row.installments != null ? Number(row.installments) : null,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null
    };
  }

  async function list({ limit = 5000, orderBy = "due_date", ascending = true } = {}) {
    const sb = requireSb();
    const tenantId = getTenantId();
    if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");

    let query = sb
      .from("ap_payables")
      .select("*")
      .eq("tenant_id", tenantId)
      .order(orderBy, { ascending });

    if (limit) query = query.limit(limit);

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(mapRow);
  }

  async function create(payload = {}) {
    const sb = requireSb();
    const tenantId = getTenantId();
    if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");

    const row = {
      tenant_id: tenantId,
      title: String(payload.title || "").trim(),
      category_id: payload.categoryId || null,
      category_name: String(payload.category || "").trim() || null,
      supplier: String(payload.supplier || "").trim() || null,
      amount: Number(payload.amount || 0),
      due_date: payload.dueDate || null,
      status: String(payload.status || "pending"),
      paid_at: payload.paidAt || null,
      paid_method: String(payload.paidMethod || "").trim() || null,
      notes: String(payload.notes || "").trim() || null,
      group_id: String(payload.groupId || "").trim() || null,
      installment: payload.installment != null ? Number(payload.installment) : null,
      installments: payload.installments != null ? Number(payload.installments) : null
    };

    const { data, error } = await sb
      .from("ap_payables")
      .insert(row)
      .select("*")
      .single();

    if (error) throw error;
    return mapRow(data);
  }

  async function update(id, payload = {}) {
  const sb = requireSb();
  const tenantId = getTenantId();
  if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");
  if (!id) throw new Error("ID da conta é obrigatório.");

  const row = {
    title: String(payload.title || "").trim(),
    category_id: payload.categoryId || null,
    category_name: String(payload.category || "").trim() || null,
    supplier: String(payload.supplier || "").trim() || null,
    amount: Number(payload.amount || 0),
    due_date: payload.dueDate || null,
    status: String(payload.status || "pending"),
    paid_at: payload.paidAt || null,
    paid_method: String(payload.paidMethod || "").trim() || null,
    notes: String(payload.notes || "").trim() || null,
    group_id: String(payload.groupId || "").trim() || null,
    installment: payload.installment != null ? Number(payload.installment) : null,
    installments: payload.installments != null ? Number(payload.installments) : null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await sb
    .from("ap_payables")
    .update(row)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();

  if (error) throw error;

  return mapRow(data);
}

  async function remove(id) {
  const sb = requireSb();
  const tenantId = getTenantId();
  if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");
  if (!id) throw new Error("ID da conta é obrigatório.");

  const { error } = await sb
    .from("ap_payables")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("[APPayablesStore.remove] erro Supabase:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      id,
      tenantId
    });

    const detailedMessage = [
      error.code ? `[${error.code}]` : "",
      error.message || "",
      error.details || "",
      error.hint || ""
    ].filter(Boolean).join(" ");

    throw new Error(detailedMessage || "Não foi possível excluir a conta.");
  }

  return true;
}

  return { list, create, update, remove };
})();


/* =========================
   ADMIN / CONFIGURAÇÕES
========================= */

const ADMIN_PASSWORD = localStorage.getItem("core_admin_master_password") || "adminconfig00";
const DEV_PROTECTED_EMAIL = "gustavo.laguedes@gmail.com";
let pendingAdminTarget = "users";

/* ---------- AUTH ---------- */
function openAdminAuth(target = "users") {
  pendingAdminTarget = target === "system" ? "system" : "users";

  adminAuthOverlay.classList.remove("core-hidden");
  adminPasswordInput.value = "";
  adminAuthError.classList.add("hidden");
  adminPasswordInput.focus();
}

function closeAdminAuth() {
  adminAuthOverlay.classList.add("core-hidden");
}

function confirmAdminAuth() {
  if (adminPasswordInput.value !== ADMIN_PASSWORD) {
    adminAuthError.classList.remove("hidden");
    return;
  }

  adminAuthError.classList.add("hidden");
  localStorage.setItem("core_admin_authorized", "true");

  closeAdminAuth();

  if (pendingAdminTarget === "system") {
    openSystemConfig();
    return;
  }

  openAdminUsers();
}

if (adminPasswordInput) {
  adminPasswordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirmAdminAuth();
  });
}


async function openSystemConfig() {
  systemConfigOverlay.classList.remove("core-hidden");
  switchConfigTab("machines");
  await loadMachines();
  renderMachines();
}

function closeSystemConfig() {
  systemConfigOverlay.classList.add("core-hidden");
}

async function openAdminUsers() {
  if (!adminUsersOverlay) return;
  adminUsersOverlay.classList.remove("core-hidden");
  await loadAdminUsers();
}

function closeAdminUsers() {
  if (!adminUsersOverlay) return;
  adminUsersOverlay.classList.add("core-hidden");
}

let adminUsersCache = [];

function setAdminUsersFeedback(message = "", type = "error") {
  if (!adminUsersFeedback) return;

  if (!message) {
    adminUsersFeedback.textContent = "";
    adminUsersFeedback.className = "admin-users-feedback hidden";
    return;
  }

  adminUsersFeedback.textContent = message;
  adminUsersFeedback.className = `admin-users-feedback admin-users-feedback--${type}`;
}

function escapeAdminHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderAdminUsersList(list) {
  if (!adminUsersList || !adminUsersEmpty) return;

  adminUsersList.innerHTML = "";

  if (!list.length) {
    adminUsersEmpty.classList.remove("hidden");
    return;
  }

  adminUsersEmpty.classList.add("hidden");

  adminUsersList.innerHTML = list.map((user) => {
    const role = String(user.role || "OPER").toUpperCase();
    const status = String(user.status || "active").toLowerCase();
    const initials = String(user.full_name || user.email || "U")
      .trim()
      .slice(0, 1)
      .toUpperCase();

    return `
      <div class="admin-user-row" data-user-id="${user.id}">
        <div class="admin-user-row__main">
          <div class="admin-user-row__avatar">${initials}</div>

          <div class="admin-user-row__meta">
            <div class="admin-user-row__name">${escapeAdminHtml(user.full_name || "Usuário sem nome")}</div>
            <div class="admin-user-row__email">${escapeAdminHtml(user.email || "")}</div>

            <div class="admin-user-row__badges">
              <span class="admin-role-badge">${role}</span>
              <span class="admin-status-badge ${status === "blocked" ? "admin-status-badge--blocked" : "admin-status-badge--active"}">
                ${status === "blocked" ? "Bloqueado" : "Ativo"}
              </span>
            </div>
          </div>
        </div>

        <div class="admin-user-row__actions">
  <button
    class="admin-action-btn admin-action-btn--edit"
    type="button"
    data-action="edit"
    data-user-id="${user.id}"
  >
    Editar
  </button>

  <button
    class="admin-action-btn admin-action-btn--warn"
    type="button"
    data-action="toggle-status"
    data-user-id="${user.id}"
  >
    ${status === "blocked" ? "Desbloquear" : "Bloquear"}
  </button>

  <button
    class="admin-action-btn"
    type="button"
    data-action="first-access"
    data-user-id="${user.id}"
  >
    Primeiro acesso
  </button>

  <button
    class="admin-action-btn admin-action-btn--danger"
    type="button"
    data-action="delete"
    data-user-id="${user.id}"
  >
    Excluir
  </button>
</div>
      </div>
    `;
  }).join("");
}

async function loadAdminUsers() {
  if (!window.AdminApi?.listUsers) {
    setAdminUsersFeedback("AdminApi não carregada.");
    return;
  }

  try {
    setAdminUsersFeedback("");
    if (adminUsersLoading) adminUsersLoading.classList.remove("hidden");
    if (adminUsersEmpty) adminUsersEmpty.classList.add("hidden");
    if (adminUsersList) adminUsersList.innerHTML = "";

    const result = await window.AdminApi.listUsers();
    adminUsersCache = Array.isArray(result?.users) ? result.users : [];

    renderAdminUsersList(adminUsersCache);
  } catch (err) {
    console.error("[ADMIN USERS] erro ao carregar usuários:", err);
    setAdminUsersFeedback(err?.message || "Não foi possível carregar os usuários.");
  } finally {
    if (adminUsersLoading) adminUsersLoading.classList.add("hidden");
  }
}

function setAdminUserFormFeedback(message = "", type = "error") {
  if (!adminUserFormFeedback) return;

  if (!message) {
    adminUserFormFeedback.textContent = "";
    adminUserFormFeedback.className = "hidden";
    return;
  }

  adminUserFormFeedback.textContent = message;
  adminUserFormFeedback.className = `admin-users-feedback admin-users-feedback--${type}`;
}

function clearAdminUserForm() {
  if (adminUserId) adminUserId.value = "";
  if (adminUserEmail) adminUserEmail.value = "";
  if (adminUserRole) adminUserRole.value = "OPER";

  setAdminUserFormFeedback("");

  if (btnAdminUserSendReset) {
    btnAdminUserSendReset.style.display = "none";
  }
}

function openAdminUserCreateForm() {
  clearAdminUserForm();

  if (adminUserFormTitle) adminUserFormTitle.textContent = "Novo usuário";
  if (adminUserFormSubtitle) adminUserFormSubtitle.textContent = "Criar usuário e enviar primeiro acesso";

  if (adminUserEmail) adminUserEmail.disabled = false;

  if (adminUserFormOverlay) {
    adminUserFormOverlay.classList.remove("core-hidden");
  }
}

function closeAdminUserForm() {
  if (!adminUserFormOverlay) return;
  adminUserFormOverlay.classList.add("core-hidden");
}

async function saveAdminUser() {
  if (!window.AdminApi?.createUser) {
    setAdminUserFormFeedback("AdminApi não carregada.");
    return;
  }

  const email = String(adminUserEmail?.value || "").trim().toLowerCase();
  const role = String(adminUserRole?.value || "").trim().toUpperCase();

  if (!email) {
    setAdminUserFormFeedback("Digite o e-mail do usuário.");
    return;
  }

  if (!role) {
    setAdminUserFormFeedback("Selecione o papel do usuário.");
    return;
  }

  try {
    setAdminUserFormFeedback("");
    if (btnAdminUserFormSave) {
      btnAdminUserFormSave.disabled = true;
      btnAdminUserFormSave.textContent = "Salvando...";
    }

    await window.AdminApi.createUser({ email, role });

    closeAdminUserForm();
    await loadAdminUsers();

    setAdminUsersFeedback("Usuário criado e e-mail de primeiro acesso enviado.", "success");
  } catch (err) {
    console.error("[ADMIN USERS] erro ao criar usuário:", err);
    setAdminUserFormFeedback(err?.message || "Não foi possível criar o usuário.");
  } finally {
    if (btnAdminUserFormSave) {
      btnAdminUserFormSave.disabled = false;
      btnAdminUserFormSave.textContent = "Salvar";
    }
  }
}

async function sendAdminFirstAccess(userId) {
  if (!window.AdminApi?.sendFirstAccess) {
    setAdminUsersFeedback("AdminApi não carregada.");
    return;
  }

  try {
    setAdminUsersFeedback("");
    await window.AdminApi.sendFirstAccess({ user_id: userId });
    setAdminUsersFeedback("E-mail de primeiro acesso enviado com sucesso.", "success");
  } catch (err) {
    console.error("[ADMIN USERS] erro ao enviar primeiro acesso:", err);
    setAdminUsersFeedback(err?.message || "Não foi possível enviar o primeiro acesso.");
  }
}

if (btnAdminUsersClose) {
  btnAdminUsersClose.addEventListener("click", closeAdminUsers);
}

if (adminUsersOverlay) {
  adminUsersOverlay.addEventListener("click", (e) => {
    if (e.target === adminUsersOverlay) {
      closeAdminUsers();
    }
  });
}

if (adminUsersSearch) {
  adminUsersSearch.addEventListener("input", () => {
    const q = String(adminUsersSearch.value || "").trim().toLowerCase();

    const filtered = adminUsersCache.filter((user) => {
      const name = String(user.full_name || "").toLowerCase();
      const email = String(user.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });

    renderAdminUsersList(filtered);
  });
}

if (btnAdminNewUser) {
  btnAdminNewUser.addEventListener("click", openAdminUserCreateForm);
}

if (btnAdminUserFormClose) {
  btnAdminUserFormClose.addEventListener("click", closeAdminUserForm);
}

if (btnAdminUserFormCancel) {
  btnAdminUserFormCancel.addEventListener("click", closeAdminUserForm);
}

if (adminUserFormOverlay) {
  adminUserFormOverlay.addEventListener("click", (e) => {
    if (e.target === adminUserFormOverlay) {
      closeAdminUserForm();
    }
  });
}

if (btnAdminUserFormSave) {
  btnAdminUserFormSave.addEventListener("click", saveAdminUser);
}

if (adminUsersList) {
  adminUsersList.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const userId = btn.dataset.userId;

    if (!action || !userId) return;

    if (action === "first-access") {
      await sendAdminFirstAccess(userId);
      return;
    }
  });
}

/* ---------- TABS ---------- */
function switchConfigTab(tab) {
  if (configMachines) {
    configMachines.classList.toggle("hidden", tab !== "machines");
  }

  document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
  const btn = document.querySelector(`.tab[data-tab="${tab}"]`);
  if (btn) btn.classList.add("active");

  if (machineForm) machineForm.classList.add("hidden");
editingMachineId = null;
if (saveMachineBtn) saveMachineBtn.textContent = "Salvar";
}

/* =========================
   MAQUININHAS
========================= */

let editingMachineId = null;
let machinesCache = [];

function getRateInput(key){
  return document.querySelector(`[data-rate="${key}"]`);
}

function getRateCheckbox(key){
  return document.querySelector(`[data-rate-enabled="${key}"]`);
}

function setRateEnabled(key, enabled){
  const input = getRateInput(key);
  const checkbox = getRateCheckbox(key);

  const isEnabled = !!enabled;

  if (checkbox) checkbox.checked = isEnabled;

  if (input){
    input.disabled = !isEnabled;
    input.classList.toggle("is-disabled-rate", !isEnabled);

    if (!isEnabled){
      input.value = "";
    }
  }
}

function bindRateToggles(){
  document.querySelectorAll("[data-rate-enabled]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const key = checkbox.dataset.rateEnabled;
      const input = getRateInput(key);
      const enabled = checkbox.checked;

      if (input){
        input.disabled = !enabled;
        input.classList.toggle("is-disabled-rate", !enabled);

        if (!enabled){
          input.value = "";
        }
      }
    });
  });
}


function clearMachineForm(){
  machineNameInput.value = "";

  document.querySelectorAll("[data-rate]").forEach(inp => {
    inp.value = "";
    inp.disabled = false;
    inp.classList.remove("is-disabled-rate");
  });

  document.querySelectorAll("[data-rate-enabled]").forEach(chk => {
    chk.checked = true;
  });

  editingMachineId = null;
  if (saveMachineBtn) saveMachineBtn.textContent = "Salvar";
}

function showMachineForm(){
  machineForm.classList.toggle("hidden");
  if (!machineForm.classList.contains("hidden")) {
    machineNameInput.focus();
  } else {
    clearMachineForm();
  }
}

async function loadMachines(){
  try{
    if (!window.MachinesStore?.list){
      console.warn("[APP] MachinesStore não encontrado.");
      machinesCache = [];
      return machinesCache;
    }

    machinesCache = await window.MachinesStore.list({
      limit: 1000,
      orderBy: "name",
      ascending: true
    });

    return machinesCache;
  }catch(err){
    console.error("[APP] Erro ao carregar maquininhas:", err);
    machinesCache = [];
    return machinesCache;
  }
}

async function startEditMachine(id){
  if (!id) return;

  const m = machinesCache.find(x => String(x.id) === String(id));
  if (!m) return;

  editingMachineId = m.id;
  machineForm.classList.remove("hidden");
  machineNameInput.value = m.name || "";

  document.querySelectorAll("[data-rate]").forEach(inp => {
  const key = inp.dataset.rate;
  const cfg = m.rates?.[key] || { enabled: true, rate: 0 };

  inp.value = cfg.enabled ? Number(cfg.rate || 0) : "";
  inp.disabled = !cfg.enabled;
  inp.classList.toggle("is-disabled-rate", !cfg.enabled);

  const checkbox = getRateCheckbox(key);
  if (checkbox) checkbox.checked = !!cfg.enabled;
});

  saveMachineBtn.textContent = "Salvar alterações";
}

async function saveMachine(){
  const name = machineNameInput.value.trim();
  if (!name) return;

  const rates = {};

document.querySelectorAll("[data-rate]").forEach(inp => {
  const key = inp.dataset.rate;
  const checkbox = getRateCheckbox(key);
  const enabled = checkbox ? checkbox.checked : true;

  rates[key] = {
    enabled,
    rate: enabled ? Number(inp.value || 0) : 0
  };
});

  try{
    if (editingMachineId === null){
      await window.MachinesStore.create({ name, rates });
    } else {
      await window.MachinesStore.update(editingMachineId, { name, rates });
    }

    await loadMachines();
    renderMachines();

    clearMachineForm();
    machineForm.classList.add("hidden");
  }catch(err){
    console.error("[APP] Erro ao salvar maquininha:", err);
    alert("Não foi possível salvar a maquininha.");
  }
}

function renderMachines(){
  machinesList.innerHTML = "";

  machinesCache.forEach((m) => {
    machinesList.innerHTML += `
      <div class="list-item">
        <div>
          <div style="font-weight:950; color:#0f172a;">${m.name}</div>
          <div class="meta">
  Débito: <b>${m.rates?.debito?.enabled ? `${Number(m.rates?.debito?.rate || 0)}%` : "desabilitado"}</b> •
  Crédito 1x: <b>${m.rates?.["1"]?.enabled ? `${Number(m.rates?.["1"]?.rate || 0)}%` : "desabilitado"}</b> •
  Crédito 2x: <b>${m.rates?.["2"]?.enabled ? `${Number(m.rates?.["2"]?.rate || 0)}%` : "desabilitado"}</b>
</div>
        </div>
        <div class="actions">
          <button class="icon-action edit" title="Editar" onclick="startEditMachine('${m.id}')">✏️</button>
          <button class="icon-action del" title="Excluir" onclick="removeMachine('${m.id}')">✖</button>
        </div>
      </div>
    `;
  });
}

async function removeMachine(id){
  if (!id) return;

  const ok = confirm("Deseja realmente excluir esta maquininha?");
  if (!ok) return;

  try{
    await window.MachinesStore.remove(id);

    await loadMachines();
    renderMachines();

    if (editingMachineId === id){
      clearMachineForm();
      machineForm.classList.add("hidden");
    }
  }catch(err){
    console.error("[APP] Erro ao excluir maquininha:", err);
    alert("Não foi possível excluir a maquininha.");
  }
}

if (btnNewMachine){
  btnNewMachine.addEventListener("click", showMachineForm);
}

if (saveMachineBtn){
  saveMachineBtn.addEventListener("click", async () => {
    await saveMachine();
  });
}

bindRateToggles();

/* =========================
   CHAT GLOBAL (LocalStorage)
   1 sala / todos
========================= */

const CHAT_KEY = "core.chat.v1";
const CHAT_READ_KEY = "core.chat.readAt.v1"; // por usuário

const btnChat = document.getElementById("btnChat");
const chatUnreadBadge = document.getElementById("chatUnreadBadge");

const chatOverlay = document.getElementById("chatOverlay");
const btnChatClose = document.getElementById("btnChatClose");
const btnChatClear = document.getElementById("btnChatClear");
// Modal limpar chat (senha admin)
const chatClearOverlay = document.getElementById("chatClearOverlay");
const btnChatClearClose = document.getElementById("btnChatClearClose");
const btnChatClearCancel = document.getElementById("btnChatClearCancel");
const btnChatClearConfirm = document.getElementById("btnChatClearConfirm");
const chatClearPass = document.getElementById("chatClearPass");
const chatClearError = document.getElementById("chatClearError");

const chatList = document.getElementById("chatList");
const chatInput = document.getElementById("chatInput");
const btnChatSend = document.getElementById("btnChatSend");

function chatNowISO(){ return new Date().toISOString(); }
function chatFmtTime(iso){
  try { return new Date(iso).toLocaleString("pt-BR"); }
  catch { return ""; }
}

function chatLoad(){
  try{
    const raw = localStorage.getItem(CHAT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  }catch(e){
    return [];
  }
}

function chatSave(list){
  localStorage.setItem(CHAT_KEY, JSON.stringify(list || []));
}

function chatGetSessionUser(){
  // tenta pegar de CoreAuth; fallback pro texto da topbar
  const s = window.CoreAuth?.getCurrentUser?.();
  if (s && (s.name || s.user || s.username)){
    return {
      id: String(s.id || s.user || s.username || s.name),
      name: String(s.name || s.user || s.username),
      role: String(s.role || "FUNC")
    };
  }

  const hello = document.getElementById("userHello")?.textContent || "Usuário";
  const cleaned = String(hello)
    .replace(/^Olá[,!]?\s*/i, "")
    .replace(/\s*\(.*?\)\s*/g, "")
    .trim();

  return { id: cleaned || "user", name: cleaned || "Usuário", role: "FUNC" };
}

function chatLoadUsers(){
  try{
    const raw = localStorage.getItem("core_users");
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  }catch{
    return [];
  }
}

function isAdminSession(){
  const s = window.CoreAuth?.getCurrentUser?.();
  const role = String(s?.role || "").toUpperCase();
  return role === "ADMIN" || role === "DEV";
}

function validateAdminPassword(pass){
  return String(pass || "").trim() === String(ADMIN_PASSWORD || "").trim();
}

function chatClearAll(){
  localStorage.removeItem(CHAT_KEY);
  localStorage.removeItem(CHAT_READ_KEY);
  chatRender();
  chatRefreshBadge();
}

btnChatClear?.addEventListener("click", () => {
  // só ADMIN/DEV pode nem abrir o modal
  if (!isAdminSession()){
    alert("Apenas ADMIN pode limpar o chat.");
    return;
  }
  openChatClearModal();
});

btnChatClearClose?.addEventListener("click", closeChatClearModal);
btnChatClearCancel?.addEventListener("click", closeChatClearModal);

chatClearOverlay?.addEventListener("click", (e) => {
  if (e.target === chatClearOverlay) closeChatClearModal();
});

btnChatClearConfirm?.addEventListener("click", () => {
  const pass = String(chatClearPass?.value || "").trim();

  if (!pass){
    chatClearError.textContent = "Digite a senha do ADMIN.";
    chatClearError.classList.remove("hidden");
    chatClearPass?.focus();
    return;
  }

  if (!validateAdminPassword(pass)){
    chatClearError.textContent = "Senha inválida.";
    chatClearError.classList.remove("hidden");
    chatClearPass?.select();
    chatClearPass?.focus();
    return;
  }

  // ✅ limpa de verdade
  chatClearAll();

  // fecha modal
  closeChatClearModal();
});

chatClearPass?.addEventListener("keydown", (e) => {
  if (e.key === "Enter"){
    e.preventDefault();
    btnChatClearConfirm?.click();
  }
  if (e.key === "Escape"){
    e.preventDefault();
    closeChatClearModal();
  }
});


function chatLoadReadMap(){
  try{
    const raw = localStorage.getItem(CHAT_READ_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  }catch{
    return {};
  }
}

function chatSaveReadMap(obj){
  localStorage.setItem(CHAT_READ_KEY, JSON.stringify(obj || {}));
}

function chatGetReadAt(userId){
  const map = chatLoadReadMap();
  return map[userId] ? Number(map[userId]) : 0;
}

function chatMarkRead(){
  const u = chatGetSessionUser();
  const map = chatLoadReadMap();
  map[u.id] = Date.now();
  chatSaveReadMap(map);
  chatRefreshBadge();
}

function chatHasUnread(){
  const u = chatGetSessionUser();
  const msgs = chatLoad();
  if (!msgs.length) return false;

  const lastTs = msgs[msgs.length - 1]?.ts || 0;
  const readAt = chatGetReadAt(u.id);
  return Number(lastTs) > Number(readAt);
}

function chatRefreshBadge(){
  if (!chatUnreadBadge) return;
  const has = chatHasUnread();
  chatUnreadBadge.classList.toggle("hidden", !has);
}

function chatRender(){
  if (!chatList) return;

  const msgs = chatLoad();
  if (!msgs.length){
    chatList.innerHTML = `<div class="muted" style="padding:10px;font-weight:900;">Sem mensagens ainda.</div>`;
    return;
  }

  chatList.innerHTML = msgs.map(m => {
    const initial = String(m.byName || "?").trim().slice(0,1).toUpperCase();
    const role = m.byRole ? ` (${m.byRole})` : "";
    return `
      <div class="chat-msg">
        <div class="chat-avatar">${initial}</div>
        <div class="chat-bubble">
          <div class="chat-meta">
            <span>${m.byName || "—"}${role}</span>
            <span class="time">${chatFmtTime(m.at)}</span>
          </div>
          <div class="chat-text">${escapeHtml(String(m.text || ""))}</div>
        </div>
      </div>
    `;
  }).join("");

  // scroll pro fim
  chatList.scrollTop = chatList.scrollHeight;
}

function escapeHtml(str){
  return str
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function chatOpen(){
  if (!chatOverlay) return;
  chatOverlay.classList.remove("core-hidden");
  chatRender();
  chatMarkRead();
  setTimeout(() => chatInput?.focus(), 30);
}

function chatClose(){
  if (!chatOverlay) return;
  chatOverlay.classList.add("core-hidden");
}

function openChatClearModal(){
  if (!chatClearOverlay) return;

  chatClearError?.classList.add("hidden");
  if (chatClearPass) chatClearPass.value = "";

  chatClearOverlay.classList.remove("core-hidden");
  setTimeout(() => chatClearPass?.focus(), 30);
}

function closeChatClearModal(){
  if (!chatClearOverlay) return;
  chatClearOverlay.classList.add("core-hidden");
}


function chatSend(){
  const text = String(chatInput?.value || "").trim();
  if (!text) return;

  const u = chatGetSessionUser();
  const msgs = chatLoad();

  msgs.push({
    id: `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`,
    at: chatNowISO(),
    ts: Date.now(),
    byId: u.id,
    byName: u.name,
    byRole: u.role,
    text
  });

  // limite simples pra não explodir localStorage
  const MAX = 300;
  const next = msgs.length > MAX ? msgs.slice(msgs.length - MAX) : msgs;

  chatSave(next);
  chatInput.value = "";
  chatRender();
  chatMarkRead();
}

// listeners
btnChat?.addEventListener("click", (e) => { e.preventDefault(); chatOpen(); });
btnChatClose?.addEventListener("click", chatClose);
chatOverlay?.addEventListener("click", (e) => { if (e.target === chatOverlay) chatClose(); });

btnChatSend?.addEventListener("click", chatSend);
chatInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter"){
    e.preventDefault();
    chatSend();
  }
  if (e.key === "Escape"){
    e.preventDefault();
    chatClose();
  }
});

// atualiza badge quando storage muda (outra aba/janela)
window.addEventListener("storage", (e) => {
  if (e.key === CHAT_KEY || e.key === CHAT_READ_KEY){
    chatRefreshBadge();
    // se o chat estiver aberto, re-renderiza
    if (chatOverlay && !chatOverlay.classList.contains("core-hidden")){
      chatRender();
      chatMarkRead();
    }
  }
});

// init
chatRefreshBadge();

// expõe API global (se quiser mandar msg do DEV/rotas etc)
window.CoreChat = {
  open: chatOpen,
  close: chatClose,
  send: (text) => {
    if (!text) return;
    if (!chatInput) return;
    chatInput.value = String(text);
    chatSend();
  },
  refreshBadge: chatRefreshBadge
};

function updateUserUI(user) {
  const el = document.getElementById("userHello");
  if (!el || !user) return;

  const name = user.name || user.email || "Usuário";
  const role = user.role || "USER";

  el.textContent = `Olá, ${name} (${role})`;
}