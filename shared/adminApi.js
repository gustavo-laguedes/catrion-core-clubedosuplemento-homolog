(function () {
  const BASE_HEADERS = {
    "Content-Type": "application/json"
  };

  function getAdminHeaders() {
    const isAdminAuthorized = localStorage.getItem("core_admin_authorized") === "true";

    if (!isAdminAuthorized) {
      throw new Error("Área administrativa não autorizada.");
    }

    return {
      ...BASE_HEADERS,
      "x-core-admin-auth": "true"
    };
  }

  async function callFn(name, body = {}) {
    const headers = getAdminHeaders();

    const response = await fetch(
      `${window.ENV.SUPABASE_URL}/functions/v1/${name}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      }
    );

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload?.error || "Falha na chamada administrativa.");
    }

    return payload;
  }

  async function listUsers() {
    return callFn("admin-list-users");
  }

  async function createUser({ email, role }) {
    return callFn("admin-create-user", { email, role });
  }

  async function updateUser({ user_id, full_name, email, role, status }) {
    return callFn("admin-update-user", {
      user_id,
      full_name,
      email,
      role,
      status
    });
  }

  async function deleteUser({ user_id }) {
    return callFn("admin-delete-user", { user_id });
  }

  async function sendReset({ email }) {
    return callFn("admin-send-reset", { email });
  }

  async function sendFirstAccess({ user_id }) {
  return callFn("admin-send-first-access", { user_id });
}

  window.AdminApi = {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  sendReset,
  sendFirstAccess
};
})();