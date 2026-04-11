// shared/store/cash.js
(function () {
  function assertClient() {
    if (!window.sb) throw new Error("Supabase client não inicializado (window.sb indefinido).");
    if (!window.CatrionTenant?.requireTenantId) throw new Error("CatrionTenant não carregado.");
  }

  async function openSession({ openedBy = "system", openingCashCents = 0, note = "" } = {}) {
  assertClient();

  return window.CatrionTenantContext.withTenant(async (tenantId) => {
    const payload = {
      tenant_id: tenantId,
      status: "open",
      opened_by: openedBy,
      opened_at: new Date().toISOString(),
      opening_cash_cents: Number(openingCashCents || 0),
      note: note || null
    };

    const { data: row, error } = await window.sb
      .from("cash_sessions")
      .insert([payload])
      .select("*")
      .single();

    if (error) throw error;
    return row;
  });
}


  async function closeSession({
  sessionId,
  closedBy = "system",
  closingCashCountedCents = 0,
  note = ""
} = {}) {
  assertClient();
  if (!sessionId) throw new Error("closeSession(): sessionId obrigatório.");

  return window.CatrionTenantContext.withTenant(async (tenantId) => {
    const patch = {
      status: "closed",
      closed_by: closedBy,
      closed_at: new Date().toISOString(),
      closing_cash_counted_cents: Number(closingCashCountedCents || 0),
      note: note || null
    };

    const { data: row, error } = await window.sb
      .from("cash_sessions")
      .update(patch)
      .eq("id", sessionId)
      .eq("tenant_id", tenantId) // <- proteção extra
      .select("*")
      .single();

    if (error) throw error;
    return row;
  });
}

  async function getLatestOpenSession() {
  assertClient();

  return window.CatrionTenantContext.withTenant(async (tenantId) => {
    const { data: rows, error } = await window.sb
      .from("cash_sessions")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1);

    if (error) throw error;
    return (rows && rows[0]) ? rows[0] : null;
  });
}

  async function getLatestSession() {
  assertClient();

  return window.CatrionTenantContext.withTenant(async (tenantId) => {
    const { data: rows, error } = await window.sb
      .from("cash_sessions")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("opened_at", { ascending: false })
      .limit(1);

    if (error) throw error;
    return (rows && rows[0]) ? rows[0] : null;
  });
}

  // ---------- CASH EVENTS ----------
  async function addEvent({
  sessionId,
  kind,
  amountCents = 0,
  by = "system",
  saleId = null,
  meta = null,
  note = ""
} = {}) {
  assertClient();
  if (!sessionId) throw new Error("addEvent(): sessionId obrigatório.");
  if (!kind) throw new Error("addEvent(): kind obrigatório.");

  return window.CatrionTenantContext.withTenant(async (tenantId) => {
    const payload = {
      tenant_id: tenantId,
      cash_session_id: sessionId,
      kind: String(kind),
      amount_cents: Number(amountCents || 0),
      note: note || null,
      created_at: new Date().toISOString(),
    };

    const { data: row, error } = await window.sb
      .from("cash_events")
      .insert([payload])
      .select("*")
      .single();

    if (error) throw error;
    return row;
  });
}

  async function listEvents({ sessionId, limit = 500 } = {}) {
  assertClient();
  if (!sessionId) throw new Error("listEvents(): sessionId obrigatório.");

  return window.CatrionTenantContext.withTenant(async (tenantId) => {
    const { data: rows, error } = await window.sb
      .from("cash_events")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("cash_session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return rows || [];
  });
}
 window.CashStore = {
  openSession,
  closeSession,
  getLatestOpenSession,
  getLatestSession,
  addEvent,
  listEvents
};
})();
