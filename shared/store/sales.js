// shared/store/sales.js
(function () {
  function assertClient() {
    if (!window.sb) throw new Error("Supabase client não inicializado (window.sb indefinido).");
  }

  function tenantId() {
    return window.CatrionTenant.requireTenantId();
  }

  async function requireOpenCashSessionId() {
  const s = await window.CoreCash?.getSession?.();

  // 1) Se existe caixa local aberto, tenta garantir a sessão remota agora
  if (s?.isOpen) {
    if (s.remoteSessionId) return s.remoteSessionId;

    if (window.CoreCash?.ensureRemoteSession) {
      const ensuredId = await window.CoreCash.ensureRemoteSession();
      if (ensuredId) return ensuredId;
    }
  }

  // 2) Fallback: busca no Supabase a última sessão aberta do tenant
  if (window.CashStore?.getLatestOpenSession) {
    const open = await window.CashStore.getLatestOpenSession();
    if (open?.id) return open.id;
  }

  throw new Error("Caixa fechado ou sessão não sincronizada. Abra o caixa para finalizar a venda.");
}

  function toCents(v) {
    const n = Number(v || 0);
    return Math.round(n * 100);
  }

  function normalizePaymentMethod(payments) {
    const used = [];
    if (Number(payments?.cash || 0) > 0) used.push("cash");
    if (Number(payments?.pix || 0) > 0) used.push("pix");
    if (Number(payments?.cardCredit || 0) > 0 || Number(payments?.cardDebit || 0) > 0) used.push("card");
    if (used.length === 0) return "cash";
    if (used.length === 1) return used[0] === "card" ? "card" : used[0];
    return "mixed";
  }

  async function createSaleWithItems({
    subtotal,
    discount,
    total,
    payments,
    items,
    customerSnapshot = null,
    note = null,
    cashSessionId = null,
    status = "paid",
  }) {
    assertClient();
    const tId = tenantId();

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("createSaleWithItems(): items vazio.");
    }

    // 1️⃣ Criar header da venda
    const finalCashSessionId = cashSessionId || await requireOpenCashSessionId();

    const salePayload = {
      tenant_id: tId,
      cash_session_id: finalCashSessionId,
      customer_id: null,
      status,
      payment_method: normalizePaymentMethod(payments),
      subtotal_cents: toCents(subtotal),
      discount_cents: toCents(discount),
      total_cents: toCents(total),
      note: note || (customerSnapshot ? JSON.stringify({ customer: customerSnapshot }) : null),
      created_at: new Date().toISOString(),
    };

    const { data: saleRow, error: saleErr } = await window.sb
      .from("sales")
      .insert([salePayload])
      .select("id, tenant_id, created_at")
      .single();

    if (saleErr) throw saleErr;

    const saleId = saleRow.id;

    // 2️⃣ Buscar custo atual dos produtos
    const productIds = items.map(it => it.productId);

    const { data: productsData, error: prodErr } = await window.sb
      .from("products")
      .select("id, cost_cents")
      .in("id", productIds);

    if (prodErr) throw prodErr;

    const costMap = {};
    for (const p of productsData) {
      costMap[p.id] = p.cost_cents || 0;
    }

    // 3️⃣ Criar itens com custo congelado
    const itemsPayload = items.map(it => {
      const qty = Number(it.qty || 0);
      const unitPriceCents = toCents(it.unitPrice);
      const unitCostCents = Number(costMap[it.productId] || 0);

      if (!it.productId) throw new Error("sale_items: product_id vazio.");
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("sale_items: qty inválida.");

      return {
        tenant_id: tId,
        sale_id: saleId,
        product_id: it.productId,
        qty,
        unit_price_cents: unitPriceCents,
        unit_cost_cents: unitCostCents, // ← custo congelado
        line_total_cents: unitPriceCents * qty,
        created_at: new Date().toISOString(),
      };
    });

    const { error: itemsErr } = await window.sb
      .from("sale_items")
      .insert(itemsPayload);

    if (itemsErr) throw itemsErr;

    return { saleId, createdAt: saleRow.created_at };
  }

  async function getSummaryByPeriod(startDateISO, endDateISO) {
  assertClient();
  const tId = tenantId();

  const { data, error } = await window.sb
    .from("v_sales_summary")
    .select("*")
    .eq("tenant_id", tId)
    .gte("created_at", startDateISO)
    .lte("created_at", endDateISO);

  if (error) throw error;

  return data || [];
}

async function list({
  limit = 100,
  orderBy = "created_at",
  ascending = false,
  startDateISO = null,
  endDateISO = null,
} = {}) {
  assertClient();
  const tId = tenantId();

  let query = window.sb
    .from("sales")
    .select(`
      id,
      tenant_id,
      created_at,
      status,
      payment_method,
      subtotal_cents,
      discount_cents,
      total_cents,
      note,
      sale_items (
        product_id,
        qty,
        unit_price_cents,
        unit_cost_cents,
        line_total_cents
      )
    `)
    .eq("tenant_id", tId)
    .order(orderBy, { ascending })
    .limit(limit);

  if (startDateISO) {
    query = query.gte("created_at", startDateISO);
  }

  if (endDateISO) {
    query = query.lte("created_at", endDateISO);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((sale) => {
    let customerSnapshot = null;

    if (sale.note) {
      try {
        const parsed = JSON.parse(sale.note);
        customerSnapshot = parsed?.customer || null;
      } catch {
        customerSnapshot = null;
      }
    }

    return {
      id: sale.id,
      tenantId: sale.tenant_id,
      createdAt: sale.created_at,
      status: sale.status,
      paymentMethod: sale.payment_method,

      subtotal: Number(sale.subtotal_cents || 0) / 100,
      discount: Number(sale.discount_cents || 0) / 100,
      total: Number(sale.total_cents || 0) / 100,

      customerSnapshot,
      customer: customerSnapshot,

      items: (sale.sale_items || []).map((item) => ({
        productId: item.product_id,
        qty: Number(item.qty || 0),
        unitPrice: Number(item.unit_price_cents || 0) / 100,
        unitCost: Number(item.unit_cost_cents || 0) / 100,
        lineTotal: Number(item.line_total_cents || 0) / 100,
      })),
    };
  });
}

async function cancelSale(saleId) {
  assertClient();
  const tId = tenantId();

  if (!saleId) {
    throw new Error("cancelSale(): saleId é obrigatório.");
  }

  const { data, error } = await window.sb
    .from("sales")
    .update({ status: "cancelled" })
    .eq("id", saleId)
    .eq("tenant_id", tId)
    .select("id,status")
    .single();

  if (error) throw error;
  return data;
}

  window.SalesStore = { 
  createSaleWithItems,
  getSummaryByPeriod,
  list,
  cancelSale
};
})();