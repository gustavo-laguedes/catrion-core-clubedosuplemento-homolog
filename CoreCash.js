/* CoreCash.js
   Caixa (localStorage) - sessão + eventos + resumo (inclui lucro preparado)
*/
(function (global) {
 function getCashTenantKey(base) {
  const tenantId =
    window.CatrionTenant?.getActiveTenantId?.() ||
    localStorage.getItem("catrion_active_tenant") ||
    "default";

  return `${base}.${tenantId}`;
}

function getSessionKey() {
  return getCashTenantKey("core.cash.session.v1");
}

function getEventsKey() {
  return getCashTenantKey("core.cash.events.v1");
}
  const MAX_EVENTS = 20000; // histórico grande pro modo local-dev (ajuste se quiser)

  // =========================
// Sync Supabase (fire-and-forget)
// =========================
async function syncEnsureRemoteSession(session) {
  if (!window.CashStore?.openSession) return null;
  if (!session?.isOpen) return null;

  // já temos id remoto salvo
  if (session.remoteSessionId) return session.remoteSessionId;

  try {
    // 1) primeiro tenta reaproveitar uma sessão aberta já existente no Supabase
    if (window.CashStore?.getLatestOpenSession) {
      const existing = await window.CashStore.getLatestOpenSession();

      if (existing?.id) {
        session.remoteSessionId = existing.id;
        saveSession(session);
        return session.remoteSessionId;
      }
    }

    // 2) se não existir nenhuma aberta, cria uma nova
    const row = await window.CashStore.openSession({
      openedBy: session.openedBy || "system",
      openingCashCents: Math.round(Number(session.initialAmount || 0) * 100),
      note: session.notes || ""
    });

    session.remoteSessionId = row?.id || null;
    saveSession(session);
    return session.remoteSessionId;
  } catch (e) {
    // 3) se bater conflito de sessão aberta duplicada, tenta buscar a já existente
    const msg = String(e?.message || "");
    const code = String(e?.code || "");

    const isDuplicateOpenSession =
      code === "23505" ||
      msg.includes("unique_open_cash_per_tenant");

    if (isDuplicateOpenSession && window.CashStore?.getLatestOpenSession) {
      try {
        const existing = await window.CashStore.getLatestOpenSession();

        if (existing?.id) {
          session.remoteSessionId = existing.id;
          saveSession(session);
          return session.remoteSessionId;
        }
      } catch (lookupErr) {
        console.warn("[CoreCash] Falha ao reaproveitar sessão aberta no Supabase:", lookupErr);
      }
    }

    console.warn("[CoreCash] Falha ao abrir sessão no Supabase (mantendo local):", e);
    return null;
  }
}

async function syncEventToSupabase(evt) {
  try {
    if (!window.CashStore) return;

    const session = loadSession();
    if (!session) return;

    // garante sessão remota se estiver aberto
    const remoteId =
      session.remoteSessionId ||
      (session.isOpen ? await syncEnsureRemoteSession(session) : null);

    // se caixa já fechou e nunca teve remoteId, não tem como linkar (deixa local)
    if (!remoteId) return;

    const amountCents = Math.round(Number(evt?.amount ?? evt?.total ?? 0) * 100);

    // vamos salvar "by", "notes", "saleId" e "meta" dentro de note (texto)
    const noteObj = {
  by: evt?.by ?? null,
  saleId: evt?.saleId ?? null,
  notes: evt?.meta?.notes ?? "",
  meta: evt?.meta ?? null,

  // dados completos para reconstruir venda remota
  total: evt?.total ?? null,
  payments: evt?.payments ?? null,
  costTotal: evt?.costTotal ?? null,
  profit: evt?.profit ?? null,
  amount: evt?.amount ?? null
};

    await window.CashStore.addEvent({
      sessionId: remoteId,
      kind: String(evt?.type || ""),     // <-- AQUI é o principal: usa evt.type
      amountCents,
      note: JSON.stringify(noteObj)
    });
  } catch (e) {
    console.warn("[CoreCash] Falha ao inserir evento no Supabase (mantendo local):", e);
  }
}

async function syncCloseToSupabase(session) {
  try {
    if (!window.CashStore) return;

    // se não tem remoteSessionId, não dá pra fechar remotamente
    if (!session?.remoteSessionId) return;

    await window.CashStore.closeSession({
      sessionId: session.remoteSessionId,
      closedBy: session.closedBy || "system",
      closingCashCountedCents: Math.round(Number(session.finalAmount || 0) * 100),
      note: session.notes || ""
    });

    // também registra evento CLOSE (opcional, mas eu gosto de ter)
    await window.CashStore.addEvent({
      sessionId: session.remoteSessionId,
      kind: "CLOSE",
      amountCents: Math.round(Number(session.finalAmount || 0) * 100),
      by: session.closedBy || "system",
      meta: { notes: session.notes || "" }
    });
  } catch (e) {
    console.warn("[CoreCash] Falha ao fechar sessão no Supabase (mantendo local):", e);
  }
}

// === Integração simples com Estoque (localStorage) ===
const KEY_PRODUCTS = "core.products.v1";
const KEY_MOVES    = "core.stock.movements.v1";

function safeArr(raw) {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

function loadProductsLS() {
  return safeArr(localStorage.getItem(KEY_PRODUCTS));
}

function saveProductsLS(list) {
  try { localStorage.setItem(KEY_PRODUCTS, JSON.stringify(list || [])); } catch {}
}

function getActorNameLS(fallback) {
  // tenta pegar do CoreAuth ou do "Olá, Fulano"
  try {
    const a = window.CoreAuth;
    if (a?.getCurrentUser) {
      const u = a.getCurrentUser();
      if (u?.name) return u.name;
      if (u?.displayName) return u.displayName;
    }
    const hello = document.getElementById("userHello")?.textContent || "";
    const cleaned = String(hello).trim()
      .replace(/^Olá[,!]?\s*/i, "")
      .replace(/\s*\(.*?\)\s*/g, "")
      .trim();
    return cleaned || fallback || "operador";
  } catch {
    return fallback || "operador";
  }
}

function appendMoveLS(move) {
  const arr = safeArr(localStorage.getItem(KEY_MOVES));
  arr.push({
    ...move,
    createdBy: move.createdBy || getActorNameLS(move.createdBy),
  });
  try { localStorage.setItem(KEY_MOVES, JSON.stringify(arr)); } catch {}
}

// devolve estoque da venda removida (se tiver meta.items)
function restoreStockFromSaleEvent(removedEvt) {
  const items = removedEvt?.meta?.items;
  if (!Array.isArray(items) || items.length === 0) return { restored: 0, skipped: 0 };

  const products = loadProductsLS();
  if (!products.length) return { restored: 0, skipped: items.length };

  // índice por ID e por SKU (fallback)
const byId = new Map(
  products.map(p => [String(p.id || "").trim(), p]).filter(([k]) => !!k)
);

const bySku = new Map(
  products.map(p => [String(p.sku || "").trim(), p]).filter(([k]) => !!k)
);


  let restored = 0;
  let skipped = 0;

  const actor = getActorNameLS(removedEvt?.by || "operador");
  const ref = removedEvt?.saleId || removedEvt?.id || "sale";

  for (const it of items) {
    const qty = Number(it?.qty || 0);
    if (!qty || qty <= 0) { skipped++; continue; }

    // ✅ primeiro tenta por productId (mais confiável)
const pid = String(it?.productId || "").trim();
let prod = pid ? byId.get(pid) : null;

// fallback: tenta por SKU/barcode/code
if (!prod) {
  const sku = String(it?.sku || it?.barcode || it?.code || "").trim();
  if (sku) prod = bySku.get(sku);
}

if (!prod) { skipped++; continue; }


    prod.stockOnHand = Number(prod.stockOnHand || 0) + qty;
    restored++;

    appendMoveLS({
      id: `mov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      productId: prod.id,
      type: "IN",
      qty,
      reason: "sale_cancel",
      ref,
      note: `Estorno de venda removida (${ref})`,
      createdAt: new Date().toISOString(),
      createdBy: actor
    });
  }

  saveProductsLS(products);
  return { restored, skipped };
}


  function nowISO() {
    return new Date().toISOString();
  }

  function isSameDayBR(isoA, isoB) {
  if (!isoA || !isoB) return false;

  const a = new Date(isoA);
  const b = new Date(isoB);

  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isTodayISO(iso) {
  return isSameDayBR(iso, new Date().toISOString());
}

function canCancelEvent(evt) {
  if (!evt || evt.cancelledAt) return false;

  if (isTodayISO(evt.at)) return true;

  return evt.type === "SALE";
}


  function uid(prefix = "evt") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function safeParse(json, fallback) {
    try { return JSON.parse(json); } catch { return fallback; }
  }

  function loadSession() {
  const raw = localStorage.getItem(getSessionKey());
  return raw ? safeParse(raw, null) : null;
}

  function saveSession(session) {
  if (!session) {
    localStorage.removeItem(getSessionKey());
    return;
  }

  try {
    localStorage.setItem(getSessionKey(), JSON.stringify(session));
  } catch (e) {
    // se falhar, pelo menos não trava o sistema
  }
}

function loadEvents() {
  const raw = localStorage.getItem(getEventsKey());
  const arr = raw ? safeParse(raw, []) : [];
  return Array.isArray(arr) ? arr : [];
}

async function loadRemoteSession() {
  try {
    if (!window.CashStore?.getLatestOpenSession) return null;
    const row = await window.CashStore.getLatestOpenSession();
    if (!row) return null;

    return {
      isOpen: row.status === "open",
      openedAt: row.opened_at,
      openedBy: row.opened_by || "system",
      initialAmount: Number(row.opening_cash_cents || 0) / 100,
      notes: row.note || "",
      closedAt: row.closed_at || null,
      closedBy: row.closed_by || null,
      finalAmount: row.closing_cash_counted_cents != null
        ? Number(row.closing_cash_counted_cents || 0) / 100
        : null,
      remoteSessionId: row.id
    };
  } catch (e) {
    console.warn("[CoreCash] Falha ao carregar sessão remota:", e);
    return null;
  }
}

function mapRemoteEvent(row) {
  let noteObj = {};
  try {
    noteObj = row?.note ? JSON.parse(row.note) : {};
  } catch {
    noteObj = {};
  }

  const typeMap = {
    OPEN: "OPEN",
    CLOSE: "CLOSE",
    SUPPLY: "SUPPLY",
    WITHDRAW: "WITHDRAW",
    SALE: "SALE"
  };

  return {
  id: row.id,
  type: typeMap[String(row.kind || "").toUpperCase()] || String(row.kind || "").toUpperCase(),
  at: row.created_at,
  by: noteObj?.by || "system",

  // mantém amount genérico
  amount: noteObj?.amount != null
    ? Number(noteObj.amount || 0)
    : Number(row.amount_cents || 0) / 100,

  saleId: noteObj?.saleId || null,
  meta: noteObj?.meta || {},
  note: row.note || null,

  // reconstrução completa da venda remota
  total: noteObj?.total != null ? Number(noteObj.total || 0) : null,
  payments: noteObj?.payments || null,
  costTotal: noteObj?.costTotal != null ? Number(noteObj.costTotal || 0) : 0,
  profit: noteObj?.profit != null ? Number(noteObj.profit || 0) : 0
};
}

async function loadRemoteEvents(sessionId) {
  try {
    if (!window.CashStore?.listEvents || !sessionId) return [];
    const rows = await window.CashStore.listEvents({ sessionId, limit: 500 });
    return (rows || []).map(mapRemoteEvent);
  } catch (e) {
    console.warn("[CoreCash] Falha ao carregar eventos remotos:", e);
    return [];
  }
}


  function saveEvents(events) {
  let list = Array.isArray(events) ? events : [];

  // limite duro (mantém mais recentes: você usa unshift)
  if (list.length > MAX_EVENTS) {
    list = list.slice(0, MAX_EVENTS);
  }

  // fusível: tenta salvar, se estourar quota corta e tenta de novo
  const trySave = (arr) => {
  localStorage.setItem(getEventsKey(), JSON.stringify(arr));
  return true;
};

  // tentativa 1: salva tudo (já limitado)
  try {
    trySave(list);
    return;
  } catch (e) {}

  // tentativa 2: corta pela metade
  try {
    list = list.slice(0, Math.max(1000, Math.floor(list.length / 2)));
    trySave(list);
    return;
  } catch (e) {}

  // tentativa 3: salva só os últimos 2000
  try {
    list = list.slice(0, Math.min(list.length, 2000));
    trySave(list);
    return;
  } catch (e) {}

  // tentativa 4: salva só os últimos 300
  try {
    list = list.slice(0, Math.min(list.length, 300));
    trySave(list);
    return;
  } catch (e) {}

  // tentativa 5: desiste sem travar o sistema (não lança erro)
}



  function addEvent(evt) {
    const events = loadEvents();
    events.unshift(evt); // mais recente primeiro
    saveEvents(events);
    return evt;
  }

  function ensureOpenSession() {
    const s = loadSession();
    return s && s.isOpen;
  }

  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function normalizeMoney(v) {
    const n = Number(v);
    if (!isFinite(n)) return 0;
    return round2(n);
  }

  function normalizePayments(payments) {
    const p = payments || {};
    return {
      cash:       normalizeMoney(p.cash || 0),
      pix:        normalizeMoney(p.pix || 0),
      cardCredit: normalizeMoney(p.cardCredit || 0),
      cardDebit:  normalizeMoney(p.cardDebit || 0),
    };
  }

  


  function buildSummary(events) {
    const out = {
      salesCount: 0,
      salesTotal: 0,
      byPayment: { cash: 0, pix: 0, cardCredit: 0, cardDebit: 0 },
      suppliesCash: 0,
      withdrawsCash: 0,
      costTotal: 0,
      profitTotal: 0,
      profitPct: 0,
    };

    (events || []).forEach(e => {
      if (e.cancelledAt) return;
      if (e.type === "SALE") {
        out.salesCount += 1;

        const pay = normalizePayments(e.payments);
        out.byPayment.cash       = round2(out.byPayment.cash + pay.cash);
        out.byPayment.pix        = round2(out.byPayment.pix + pay.pix);
        out.byPayment.cardCredit = round2(out.byPayment.cardCredit + pay.cardCredit);
        out.byPayment.cardDebit  = round2(out.byPayment.cardDebit + pay.cardDebit);

        const total = normalizeMoney(
          e.total != null ? e.total : (pay.cash + pay.pix + pay.cardCredit + pay.cardDebit)
        );
        out.salesTotal = round2(out.salesTotal + total);

        const cost = normalizeMoney(e.costTotal || 0);
        out.costTotal = round2(out.costTotal + cost);

        const profit = normalizeMoney(e.profit != null ? e.profit : (total - cost));
        out.profitTotal = round2(out.profitTotal + profit);
      }

      if (e.type === "SUPPLY") out.suppliesCash = round2(out.suppliesCash + normalizeMoney(e.amount));
      if (e.type === "WITHDRAW") out.withdrawsCash = round2(out.withdrawsCash + normalizeMoney(e.amount));
    });

    out.profitPct = out.salesTotal > 0 ? round2((out.profitTotal / out.salesTotal) * 100) : 0;
    return out;
  }

  function getSessionEvents(){
  const events = loadEvents();
  const s = loadSession();

  // ✅ caixa fechado = resumo zerado
  if (!s?.openedAt || !s.isOpen) return [];

  const start = new Date(s.openedAt).getTime();
  return events.filter(e => new Date(e.at).getTime() >= start);
}

function getTodayEvents() {
  const events = loadEvents();
  const today = new Date();

  return events.filter(e => isSameDayBR(e.at, today));
}


  

  function rebuildSessionFromEvents(events){
  const list = Array.isArray(events) ? [...events] : [];
  const activeEvents = list.filter(e => !e.cancelledAt);

  // se não tem nenhum OPEN ativo, não existe sessão
  const opens = activeEvents.filter(e => e.type === "OPEN");
  if (!opens.length) {
    saveSession(null);
    return null;
  }

  const mostRecent = (arr) =>
    arr.reduce((best, cur) => {
      const tb = best ? new Date(best.at).getTime() : -Infinity;
      const tc = cur ? new Date(cur.at).getTime() : -Infinity;
      return tc > tb ? cur : best;
    }, null);

  const lastOpen = mostRecent(opens);

  const openAt = new Date(lastOpen.at).getTime();
  const closesAfterOpen = activeEvents.filter(
    e => e.type === "CLOSE" && new Date(e.at).getTime() >= openAt
  );
  const lastClose = closesAfterOpen.length ? mostRecent(closesAfterOpen) : null;

  const isOpen = !lastClose;

  const session = {
    isOpen,
    openedAt: lastOpen.at,
    openedBy: lastOpen.by || "—",
    initialAmount: Number(lastOpen.amount || 0),
    notes: lastOpen.meta?.notes || "",
    closedAt: isOpen ? null : lastClose.at,
    closedBy: isOpen ? null : (lastClose.by || "—"),
    finalAmount: isOpen ? null : Number(lastClose.amount || 0),
  };

  saveSession(session);
  return session;
}


  const CoreCash = {
  keys: {
    getSessionKey,
    getEventsKey
  },

  async ensureRemoteSession() {
    const session = loadSession();
    if (!session?.isOpen) return null;
    return await syncEnsureRemoteSession(session);
  },

    async getSession() {
    const remote = await loadRemoteSession();
    if (remote) {
      saveSession(remote);
      return remote;
    }
    return loadSession();
  },

  async isOpen() {
    const s = await this.getSession();
    return !!(s && s.isOpen);
  },

  async getEvents() {
    const session = await this.getSession();
    if (session?.remoteSessionId) {
      const remoteEvents = await loadRemoteEvents(session.remoteSessionId);
      if (remoteEvents.length) {
        saveEvents(remoteEvents);
        return remoteEvents;
      }
    }
    return loadEvents();
  },
    canCancelEvent(event){
  return canCancelEvent(event);
},

    cancelEvent(eventId, { by = "system", reason = "Cancelado manualmente" } = {}){
  const events = loadEvents();
  const idx = events.findIndex(e => String(e.id) === String(eventId));
  if (idx < 0) return { ok:false, reason:"Evento não encontrado." };

  const evt = events[idx];

  if (!canCancelEvent(evt)) {
    return { ok:false, reason:"Este movimento não pode mais ser cancelado." };
  }

  if (evt.cancelledAt) {
    return { ok:false, reason:"Este movimento já está cancelado." };
  }

  evt.cancelledAt = nowISO();
  evt.cancelledBy = by;
  evt.cancelReason = reason || "Cancelado manualmente";

  let stockRestore = null;
  if (evt?.type === "SALE") {
    stockRestore = restoreStockFromSaleEvent(evt);
  }

  saveEvents(events);
  rebuildSessionFromEvents(events);

  return { ok:true, event: evt, stockRestore };
},




    open({ initialAmount = 0, by = "system", notes = "" } = {}) {
      const current = loadSession();
      if (current && current.isOpen) {
        return { ok: false, reason: "Caixa já está aberto.", session: current };
      }

      const session = {
        isOpen: true,
        openedAt: nowISO(),
        openedBy: by,
        initialAmount: normalizeMoney(initialAmount),
        notes: notes || "",
        closedAt: null,
        closedBy: null,
        finalAmount: null,
      };

      saveSession(session);

      addEvent({
        id: uid("evt"),
        type: "OPEN",
        at: session.openedAt,
        by,
        amount: session.initialAmount,
        meta: { notes: session.notes || "" }
      });

      // fire-and-forget: cria sessão no supabase e registra OPEN
syncEnsureRemoteSession(session).then(() => {
  // opcional: registra o OPEN como evento remoto também
  const evtOpen = { type:"OPEN", amount: session.initialAmount, by, meta:{ notes: session.notes || "" } };
  syncEventToSupabase(evtOpen);
});

      return { ok: true, session };
    },

    close({ finalAmount = 0, by = "system", notes = "" } = {}) {
      const session = loadSession();
      if (!session || !session.isOpen) {
        return { ok: false, reason: "Não existe caixa aberto para fechar.", session: session || null };
      }

      session.isOpen = false;
      session.closedAt = nowISO();
      session.closedBy = by;
      session.finalAmount = normalizeMoney(finalAmount);
      if (notes) session.notes = notes;

      saveSession(session);

      addEvent({
        id: uid("evt"),
        type: "CLOSE",
        at: session.closedAt,
        by,
        amount: session.finalAmount,
        meta: { notes: notes || "" }
      });

      // fire-and-forget: fecha remoto
syncCloseToSupabase(session);

      return { ok: true, session };
    },

    supply({ amount, by = "system", notes = "" } = {}) {
      if (!ensureOpenSession()) return { ok: false, reason: "Abra o caixa antes de lançar suprimento." };
      const v = normalizeMoney(amount);
      if (v <= 0) return { ok: false, reason: "Informe um valor válido (> 0)." };

      const evt = addEvent({
        id: uid("evt"),
        type: "SUPPLY",
        at: nowISO(),
        by,
        amount: v,
        meta: { notes: notes || "" }
      });

      syncEventToSupabase(evt);

      return { ok: true, event: evt };
    },

    withdraw({ amount, by = "system", notes = "" } = {}) {
      if (!ensureOpenSession()) return { ok: false, reason: "Abra o caixa antes de lançar sangria." };
      const v = normalizeMoney(amount);
      if (v <= 0) return { ok: false, reason: "Informe um valor válido (> 0)." };

      const evt = addEvent({
        id: uid("evt"),
        type: "WITHDRAW",
        at: nowISO(),
        by,
        amount: v,
        meta: { notes: notes || "" }
      });

      syncEventToSupabase(evt);

      return { ok: true, event: evt };
    },

    registerSale({ saleId, total, payments, costTotal = 0, profit = null, by = "system", meta = {} } = {}) {

      if (!ensureOpenSession()) {
        return { ok: false, reason: "Caixa fechado. Abra o caixa para registrar vendas no log." };
      }

      const pay = normalizePayments(payments);
      const tot = normalizeMoney(total || (pay.cash + pay.pix + pay.cardCredit + pay.cardDebit));
      if (tot <= 0) return { ok: false, reason: "Total inválido." };

      const cost = normalizeMoney(costTotal || 0);

// ✅ Se a Venda mandar profit (já líquido com taxa), usa ele.
// Senão, mantém o fallback antigo (tot - cost).
const profitNorm = (profit != null)
  ? normalizeMoney(profit)
  : normalizeMoney(tot - cost);


      const evt = addEvent({
        id: uid("evt"),
        type: "SALE",
        at: nowISO(),
        by,
        saleId: saleId || uid("sale"),
        total: tot,
        payments: pay,
        costTotal: cost,
        profit: profitNorm,
        meta: meta || {}
      });

      syncEventToSupabase(evt);

      return { ok: true, event: evt };
    },

        async getSummary() {
      const events = await this.getEvents();
      const today = new Date();

      const todayEvents = (events || []).filter(e => isSameDayBR(e.at, today));
      return buildSummary(todayEvents);
    },

    async getTheoreticalCash() {
      const s = await this.getSession();
      const events = await this.getEvents();

      const initial = s ? normalizeMoney(s.initialAmount) : 0;
      const start = s?.openedAt ? new Date(s.openedAt).getTime() : null;

      const sessionEvents = start
        ? (events || []).filter(e => new Date(e.at).getTime() >= start)
        : [];

      const summary = buildSummary(sessionEvents);
      return round2(initial + summary.suppliesCash - summary.withdrawsCash + summary.byPayment.cash);
    }
  };

  global.CoreCash = CoreCash;
})(window);
