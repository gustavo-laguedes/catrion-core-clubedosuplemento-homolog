// pages/produtos/produtos.js
(function () {
  window.CorePageModules = window.CorePageModules || {};

  // =========================
// Fonte oficial: Supabase (cache em memória)
// =========================
let PRODUCTS_CACHE = []; // lista “viva” da tela

function getProducts(){
  return Array.isArray(PRODUCTS_CACHE) ? PRODUCTS_CACHE : [];
}

function setProducts(list){
  PRODUCTS_CACHE = Array.isArray(list) ? list : [];
}

// =========================
// Compat: manter chamadas antigas funcionando (agora em memória)
// =========================
function loadProducts(){
  return getProducts();
}

function saveProducts(list){
  setProducts(list);
}

  // =========================
// Taxonomia do nome (Categoria + Sub1..Sub4)
// =========================
const CAT_SEP = " • ";

function getTaxStorageKey(levelKey) {
  const tenantId =
    window.CoreAuth?.requireTenantId?.() ||
    localStorage.getItem("catrion_active_tenant") ||
    "default";

  return `core.products.tax.${tenantId}.${levelKey}.v1`;
}


function cleanStr(v){ return String(v ?? "").trim(); }

function loadTax(levelKey){
  const key = getTaxStorageKey(levelKey);
  if (!key) return [];

  try{
    const x = JSON.parse(localStorage.getItem(key) || "[]");
    const list = Array.isArray(x) ? x.map(cleanStr).filter(Boolean) : [];
    return [...new Set(list)];
  }catch{
    return [];
  }
}

function saveTax(levelKey, list){
  const key = getTaxStorageKey(levelKey);
  if (!key) return;

  const clean = (list || []).map(cleanStr).filter(Boolean);
  const uniq = [...new Set(clean)];
  localStorage.setItem(key, JSON.stringify(uniq));
}


function ensureDefaults(){
  // não força mais categoria padrão
  return;
}


function joinNameFromParts(parts){
  const segs = (parts || []).map(cleanStr).filter(Boolean);
  return segs.join(CAT_SEP);
}

function splitNameToParts(name){
  const s = cleanStr(name);
  if (!s) return { cat:"", sub1:"", sub2:"", sub3:"" };
  const arr = s.split(CAT_SEP).map(cleanStr).filter(Boolean);
  return {
    cat:  arr[0] || "",
    sub1: arr[1] || "",
    sub2: arr[2] || "",
    sub3: arr[3] || "",
  };
}


// garante que produto antigo tenha campos cat/subs
function ensureTaxFields(p){
  if (!p) return p;

  // se já tem algum dos campos, só normaliza
    const hasAny =
    p.cat != null || p.sub1 != null || p.sub2 != null || p.sub3 != null;


  if (!hasAny){
    // tenta inferir do name antigo
    const inf = splitNameToParts(p.name);
    p.cat  = inf.cat;
    p.sub1 = inf.sub1;
    p.sub2 = inf.sub2;
    p.sub3 = inf.sub3;
  }

  p.cat  = cleanStr(p.cat);
  p.sub1 = cleanStr(p.sub1);
  p.sub2 = cleanStr(p.sub2);
  p.sub3 = cleanStr(p.sub3);
    // se existir lixo antigo, limpa
  if ("sub4" in p) delete p.sub4;

  // nome sempre coerente
  p.name = joinNameFromParts([p.cat, p.sub1, p.sub2, p.sub3]);


  return p;
}

function ensureUnitField(p){
  if (!p) return p;
  const u = cleanStr(p.unit);
  p.unit = u || "UN"; // padrão
  return p;
}


// UI: click no input => escolhe/dita; botão + => cria novo
function bindTaxPicker({ levelKey, inputSel, btnAddSel, onChange }){
  const input = document.querySelector(inputSel);
  const btnAdd = btnAddSel ? document.querySelector(btnAddSel) : null;
if (!input) return;


  const dlg = document.querySelector("#dlgTax");
  const title = document.querySelector("#taxTitle");
  const search = document.querySelector("#taxSearch");
  const listBox = document.querySelector("#taxList");
  const inpNew = document.querySelector("#taxNewValue");
  const btnCreate = document.querySelector("#taxAdd");

  if (!dlg || !title || !search || !listBox || !inpNew || !btnCreate) {
    console.warn("[Tax] dlgTax não encontrado no HTML.");
    return;
  }

  // evita bind duplo no mesmo input
  if (input.dataset.taxBound === "1") return;
  input.dataset.taxBound = "1";

    const prettyName = {
    cat: "Categoria",
    sub1: "Subcategoria 1",
    sub2: "Subcategoria 2",
    sub3: "Subcategoria 3",
  }[levelKey] || "Selecionar";


  function renderList(filterText = "") {
    const q = cleanStr(filterText).toLowerCase();
    const items = loadTax(levelKey)
      .filter(v => !q || v.toLowerCase().includes(q))
      .sort((a,b)=> a.localeCompare(b, "pt-BR"));

    listBox.innerHTML = "";

    if (!items.length) {
      const div = document.createElement("div");
      div.className = "muted mini";
      div.textContent = "Nada encontrado.";
      listBox.appendChild(div);
      return;
    }
items.forEach(v => {
  const row = document.createElement("div");
  row.className = "tax-item";

  row.innerHTML = `
    <div class="t">${escapeHtml(v)}</div>
    <div class="right">
      <div class="x">clique para selecionar</div>
      <button type="button" class="tax-del" title="Excluir">🗑️</button>
    </div>
  `;

  // clique no item seleciona
  row.addEventListener("click", () => {
    input.value = v;
    dlg.close();
    onChange && onChange();
  });

  // clique no lixo exclui (sem selecionar)
  const btnDel = row.querySelector(".tax-del");
  btnDel.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();

    const ok = confirm(`Excluir "${v}"?`);
    if (!ok) return;

    // remove do storage
    const cur = loadTax(levelKey);
    const next = cur.filter(x => x !== v);
    saveTax(levelKey, next);

    // se o campo atual estava usando esse valor, limpa
    if (cleanStr(input.value) === v) {
      input.value = "";
      onChange && onChange();
    }

    // re-renderiza mantendo o filtro digitado
    renderList(search.value);
  });

  listBox.appendChild(row);
});

  }

    function openPicker() {
    // >>> guarda qual picker está “ativo” agora
    dlg._taxCtx = { levelKey, input, onChange, prettyName };

    title.textContent = prettyName;
    search.value = "";
    inpNew.value = "";

    renderList("");

    dlg.showModal();
    setTimeout(() => search.focus(), 50);
  }

  // =========================================================
  // Handler GLOBAL do botão Adicionar / Enter (usa dlg._taxCtx)
  // =========================================================
  if (!dlg.dataset.taxGlobalBound) {
    dlg.dataset.taxGlobalBound = "1";

    function addNewFromUI_Global() {
      const ctx = dlg._taxCtx;
      if (!ctx) return;

      const val = cleanStr(inpNew.value);
      if (!val) return;

      const list = loadTax(ctx.levelKey);
      if (!list.includes(val)) {
        list.push(val);
        saveTax(ctx.levelKey, list);
      }

      ctx.input.value = val;
      dlg.close();
      ctx.onChange && ctx.onChange();
    }

    btnCreate.addEventListener("click", addNewFromUI_Global);

    inpNew.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        addNewFromUI_Global();
      }
    });
  }


  

  // abrir lista clicando no campo
  input.addEventListener("click", openPicker);

    // botão + (se existir) abre o mesmo picker, já com foco no “novo valor”
  if (btnAdd) {
    btnAdd.addEventListener("click", (ev) => {
      ev.preventDefault();
      openPicker();
      setTimeout(() => inpNew.focus(), 80);
    });
  }


  // busca
  search.addEventListener("input", () => renderList(search.value));

  
}

const KEY_MOVES = "core.stock.movements.v1";
const KEY_PURCHASES = "core.stock.purchases.v1";

  function appendMove(move) {
  let arr = [];
  try { arr = JSON.parse(localStorage.getItem(KEY_MOVES) || "[]"); } catch { arr = []; }

 const withActor = {
  ...move,
  createdBy: move.createdBy || getActorName()
};


  arr.push(withActor);
  localStorage.setItem(KEY_MOVES, JSON.stringify(arr));
}


  function getActorName(){
  const a = window.CoreAuth;
  const hello = document.getElementById("userHello")?.textContent || "";
  if (a?.getCurrentUser) {
    const u = a.getCurrentUser();
    if (u?.name) return u.name;
    if (u?.displayName) return u.displayName;
  }
  const cleaned = String(hello).trim()
    .replace(/^Olá[,!]?\s*/i, "")
    .replace(/\s*\(.*?\)\s*/g, "")
    .trim();
  return cleaned || "operador";
}


  // =========================
  // Helpers
  // =========================
  function uid(prefix = "id") {
    const s = (crypto?.randomUUID ? crypto.randomUUID() : (
      "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      })
    ));
    return `${prefix}_${s}`;
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function toCents(input) {
    const str = String(input ?? "").trim();
    if (!str) return 0;
    const norm = str.replace(/\./g, "").replace(",", ".");
    const n = Number(norm);
    if (Number.isNaN(n)) return 0;
    return Math.round(n * 100);
  }

  function fmtBRL(cents) {
    const n = Number(cents || 0) / 100;
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  // =========================
// Máscara de dinheiro (digita e vai pra esquerda) — BRL
// =========================
function moneyMaskBRL(inputEl){
  if (!inputEl) return;

  // evita duplicar listeners
  if (inputEl.dataset.moneyBound === "1") return;
  inputEl.dataset.moneyBound = "1";

  function onlyDigits(s){ return String(s || "").replace(/\D/g, ""); }

  function formatDigits(digits){
    digits = onlyDigits(digits);
    if (!digits) return "0,00";

    // limita tamanho (evita valores absurdos)
    digits = digits.slice(0, 12);

    // garante ao menos 3 dígitos pra recortar centavos
    const padded = digits.padStart(3, "0");
    const intPart = padded.slice(0, -2);
    const decPart = padded.slice(-2);

    const intFmt = Number(intPart).toLocaleString("pt-BR");
    return `${intFmt},${decPart}`;
  }

  function apply(){
    const digits = onlyDigits(inputEl.value);
    inputEl.value = formatDigits(digits);

    // mantém o cursor no fim (simples e eficiente)
    try{
      inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
    }catch{}
  }

  inputEl.addEventListener("input", apply);

  inputEl.addEventListener("focus", () => {
    if (!inputEl.value) inputEl.value = "0,00";
    apply();
  });

  inputEl.addEventListener("blur", () => {
    if (!inputEl.value) inputEl.value = "0,00";
    apply();
  });

  // inicia formatado
  apply();
}

  function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


  function normalizeSku(s) { return String(s || "").trim(); }
  function normalizeName(s) { return String(s || "").trim(); }

 
  function profitPct(priceCents, costCents) {
  const cost = Number(costCents || 0);
  const price = Number(priceCents || 0);
  if (cost <= 0) return null;
  const pct = ((price - cost) / cost) * 100;
  return Math.round(pct * 10) / 10;
}



  // =========================
  // Filtros
  // =========================
  function getFilters() {
    const q = (document.querySelector("#inpSearch")?.value || "").trim().toLowerCase();
    const status = document.querySelector("#selStatus")?.value || "all";
    const stock = document.querySelector("#selStock")?.value || "all";
    return { q, status, stock };
  }

  function bindFilters() {
    const inp = document.querySelector("#inpSearch");
    const selStatus = document.querySelector("#selStatus");
    const selStock = document.querySelector("#selStock");

    if (!inp || !selStatus || !selStock) return;
    if (inp.dataset.bound === "1") return;
    inp.dataset.bound = "1";

    const refresh = () => renderProductsTable(getFilters());
    inp.addEventListener("input", refresh);
    selStatus.addEventListener("change", refresh);
    selStock.addEventListener("change", refresh);
  }

  // =========================
  // Ordenação
  // =========================
  let SORT = { key: "name", dir: "asc" };

  function getSortValue(p, key) {
    if (key === "profitPct") {
      const cost = Number(p.costCents || 0);
      const price = Number(p.priceCents || 0);
      if (cost <= 0) return -Infinity;
      return (price - cost) / cost;
    }

        if (key === "unit") {
      return String(p.unit || "").toLowerCase();
    }

    if (key === "actionState") {
  const stock = Number(p.stockOnHand || 0);
  const min = Number(p.stockMin || 0);

  if (min <= 0) return 3; // sem mínimo configurado
  if (stock <= 0) return 0; // mais urgente
  if (stock <= min) return 1;
  if (stock <= (min + Math.max(1, Math.ceil(min * 0.2)))) return 2;
  return 3; // acima do mínimo
}

    const v = p[key];
    if (typeof v === "string") return v.toLowerCase();
    return Number(v ?? 0);
  }

  function applySort(products) {
    const { key, dir } = SORT;
    const mult = dir === "asc" ? 1 : -1;

    return products.sort((a, b) => {
      const av = getSortValue(a, key);
      const bv = getSortValue(b, key);

      if (typeof av === "string" || typeof bv === "string") {
        return String(av).localeCompare(String(bv), "pt-BR") * mult;
      }
      return (av - bv) * mult;
    });
  }

  function bindSortHeaders() {
    const tbl = document.querySelector("#tblProducts");
    if (!tbl || tbl.dataset.sortBound === "1") return;
    tbl.dataset.sortBound = "1";

    tbl.querySelectorAll("thead th[data-sort]").forEach(th => {
      th.addEventListener("click", () => {
        const key = th.getAttribute("data-sort");
        if (!key) return;

        if (SORT.key === key) SORT.dir = (SORT.dir === "asc") ? "desc" : "asc";
        else { SORT.key = key; SORT.dir = "asc"; }

        renderProductsTable(getFilters());
        highlightSortHeader();
      });
    });

    highlightSortHeader();
  }

  function highlightSortHeader() {
    const tbl = document.querySelector("#tblProducts");
    if (!tbl) return;

    tbl.querySelectorAll("thead th[data-sort]").forEach(th => {
      const key = th.getAttribute("data-sort");
      th.classList.toggle("is-sort", key === SORT.key);
      th.dataset.dir = (key === SORT.key) ? SORT.dir : "";
    });
  }

  // =========================
  // File -> base64 (para foto)
  // =========================
  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // =========================
  // Tabela Produtos
  // =========================
  function renderProductsTable(filters = null) {
    const tbody = document.querySelector("#tblProducts tbody");
    const empty = document.querySelector("#emptyState");
    if (!tbody) return;

    const a = window.CoreAuth;
const u =
  a?.getCurrentUser?.() ||
  a?.getUser?.() ||
  a?.currentUser ||
  a?.user ||
  a?.session?.user ||
  a?.state?.user ||
  null;

const role = String(u?.role || "OPER").toUpperCase();
const canViewCosts = !!window.CoreAuth?.can?.("canViewProductCosts");
const canCreateProducts = !!window.CoreAuth?.can?.("canCreateProducts");
const canEditProducts = !!window.CoreAuth?.can?.("canEditProducts");
const canDeleteProducts = !!window.CoreAuth?.can?.("canDeleteProducts");
const canMoveStock = !!window.CoreAuth?.can?.("canMoveStock");
const isReadOnlyProducts = !canEditProducts && !canCreateProducts && !canMoveStock;



    const f = filters || getFilters();
   let products = getProducts().slice().map(ensureTaxFields).map(ensureUnitField);
// NÃO grava em lugar nenhum aqui



    if (f.q) {
      products = products.filter(p => {
        const name = String(p.name || "").toLowerCase();
        const sku = String(p.sku || "").toLowerCase();
        return name.includes(f.q) || sku.includes(f.q);
      });
    }

    if (f.status === "active" || f.status === "inactive") {
      products = products.filter(p => (p.status || "active") === f.status);
    }

    if (f.stock === "low") {
      products = products.filter(p => {
        const stock = Number(p.stockOnHand || 0);
        const min = Number(p.stockMin || 0);
        return min > 0 && stock <= min;
      });
    } else if (f.stock === "zero") {
      products = products.filter(p => Number(p.stockOnHand || 0) <= 0);
    }

    applySort(products);

    tbody.innerHTML = "";

    if (products.length === 0) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    for (const p of products) {
      const imgHtml = p.imageData
        ? `<img class="thumb" src="${p.imageData}" alt="">`
        : `<div class="thumb" style="display:grid;place-items:center;font-size:11px;font-weight:700;color:rgba(0,0,0,.55)">IMG</div>`;

      const statusPill = p.status === "inactive"
        ? `<span class="pill off">Inativo</span>`
        : `<span class="pill">Ativo</span>`;

      const stock = Number(p.stockOnHand || 0);
      const min = Number(p.stockMin || 0);

      const costC = Number(p.costCents || 0);
const profit = profitPct(p.priceCents || 0, costC);

const costStr = canViewCosts
  ? (costC ? fmtBRL(costC) : "—")
  : "*****";

const profitStr = canViewCosts
  ? (profit == null ? "—" : `${profit}%`)
  : "*****";


      let hintTop = "Sem mínimo";
let hintBottom = "Sem regra";
let hintClass = "ok";

if (min > 0) {
  const buffer = Math.max(1, Math.ceil(min * 0.2));
  const near = min + buffer;

  if (stock <= 0) {
    hintTop = "Zerado";
    hintBottom = `Comprar agora • min ${min}`;
    hintClass = "danger";
  } else if (stock <= min) {
    hintTop = "No mínimo";
    hintBottom = `Comprar agora • min ${min}`;
    hintClass = "warn";
  } else if (stock <= near) {
    hintTop = "Perto do mínimo";
    hintBottom = `Planejar compra • min ${min}`;
    hintClass = "warn";
  } else {
    hintTop = "Acima do mínimo";
    hintBottom = `OK • min ${min}`;
    hintClass = "ok";
  }
}

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="thumb-col thumb-cell" data-view="${p.id}">${imgHtml}</td>
        <td class="name-cell" data-view="${p.id}">${escapeHtml(p.name || "")}</td>
        <td>${escapeHtml(p.sku || "")}</td>
        <td>${fmtBRL(Number(p.priceCents || 0))}</td>
        <td>${costStr}</td>

                <td>${profitStr}</td>
        <td>${(min > 0 && stock <= min) ? `<span class="pill low">${stock}</span>` : `<span class="pill">${stock}</span>`}</td>
        <td>${escapeHtml(p.unit || "UN")}</td>
        <td>${statusPill}</td>
        <td class="actions">
  <div class="row-actions">
    <div class="hint ${hintClass}">
      <span class="hint-top">${hintTop}</span>
      <span class="hint-bottom">${hintBottom}</span>
    </div>
  </div>
</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // clique em foto/nome abre modal view
  function bindTableClicks() {
    const tbl = document.querySelector("#tblProducts");
    if (!tbl || tbl.dataset.bound === "1") return;
    tbl.dataset.bound = "1";

    tbl.addEventListener("click", (ev) => {
      const el = ev.target.closest("[data-view]");
      if (!el) return;
      openProductView(el.getAttribute("data-view"));
    });
  }

  // =========================
  // Modal View/Edit Produto
  // =========================
  function bindProductViewModal() {
    const dlg = document.querySelector("#dlgProductView");
    const frm = document.querySelector("#frmProductView");
    if (!dlg || !frm || dlg.dataset.bound === "1") return;
    dlg.dataset.bound = "1";

    const btnEdit = document.querySelector("#pv_btnEdit");
    const btnSave = document.querySelector("#pv_btnSave");
    const btnClose = document.querySelector("#pv_btnClose");
    const btnDelete = document.querySelector("#pv_btnDelete");

    const photoPick = document.querySelector("#pv_photoPick");
    const photoFile = document.querySelector("#pv_photoFile");
    const photoImg = document.querySelector("#pv_photoImg");
    const photoEmpty = document.querySelector("#pv_photoEmpty");
    const photoData = document.querySelector("#pv_photoData");

    function setReadOnly(ro) {
  const allowEdit = !!window.CoreAuth?.can?.("canEditProducts");
  const allowDelete = !!window.CoreAuth?.can?.("canDeleteProducts");

  document.querySelectorAll("#dlgProductView .pv-inp").forEach(inp => {
    inp.disabled = ro || !allowEdit;
    inp.classList.toggle("pv-ro", ro || !allowEdit);
  });

  if (btnSave) btnSave.hidden = ro || !allowEdit;
  if (btnDelete) btnDelete.hidden = !allowDelete;
  if (btnEdit) btnEdit.hidden = !ro || !allowEdit;
  if (btnClose) btnClose.textContent = ro ? "Fechar" : "Cancelar";
}

    if (photoPick && photoFile) {
      photoPick.addEventListener("click", () => {
        if (btnSave && btnSave.hidden) return;
        photoFile.click();
      });

      photoFile.addEventListener("change", async () => {
        const file = photoFile.files && photoFile.files[0];
        if (!file) return;
        if (file.size > 1024 * 1024) return alert("Imagem muito grande (limite 1MB).");

        const dataUrl = await fileToDataURL(file);
        if (photoData) photoData.value = dataUrl;
        if (photoImg) {
          photoImg.src = dataUrl;
          photoImg.style.display = "block";
        }
        if (photoEmpty) photoEmpty.style.display = "none";
      });
    }

    if (btnDelete) {
      btnDelete.addEventListener("click", () => {
        const id = document.querySelector("#pv_id")?.value;
                if (!window.CoreAuth?.can?.("canDeleteProducts")) {
          alert("Você não tem permissão para excluir produtos.");
          return;
        }
        if (!id) return;

        const ok = confirm("Tem certeza que deseja excluir este produto? Essa ação não pode ser desfeita.");
        if (!ok) return;

        const products = loadProducts();
        (async () => {
  try {
    await window.ProductsStore.remove(id);

    const products = loadProducts();
    saveProducts(products.filter(p => p.id !== id));
    renderProductsTable(getFilters());

    const dlgMove = document.querySelector("#dlgMove");
    if (dlgMove && dlgMove._mv && typeof dlgMove._mv.rebuildProductDatalist === "function") {
      dlgMove._mv.rebuildProductDatalist();
    }

    dlg.close();
  } catch (e) {
    console.error("[Produtos] Erro ao excluir no Supabase:", e);
    alert("Erro ao excluir no banco. Veja o console.");
  }
})();


      });
    }

    if (btnEdit) btnEdit.addEventListener("click", () => setReadOnly(false));

    frm.addEventListener("submit", (ev) => {
      ev.preventDefault();
            if (!window.CoreAuth?.can?.("canEditProducts")) {
        alert("Você não tem permissão para editar produtos.");
        return;
      }

      if (ev.submitter && ev.submitter.value === "cancel") {
        dlg.close();
        return;
      }

      const id = document.querySelector("#pv_id")?.value;
      const products = loadProducts();
      const p = products.find(x => x.id === id);
      if (!p) return;

      


      const sku = normalizeSku(document.querySelector("#pv_sku")?.value);
const unit = cleanStr(document.querySelector("#pv_unit")?.value) || (p.unit || "UN");

const priceCents = toCents(document.querySelector("#pv_price")?.value);
const costCents = toCents(document.querySelector("#pv_cost")?.value);
const stockOnHand = parseInt(document.querySelector("#pv_stock")?.value || "0", 10) || 0;
const stockMin = parseInt(document.querySelector("#pv_min")?.value || "0", 10) || 0;
const status = document.querySelector("#pv_status")?.value || "active";
const imageData = document.querySelector("#pv_photoData")?.value || p.imageData || "";

if (priceCents <= 0) return alert("Informe um preço válido.");

if (sku) {
  const skuExists = products.some(x => x.id !== id && String(x.sku || "").trim() === sku);
  if (skuExists) return alert("Já existe outro produto com esse SKU.");
}

const cat  = cleanStr(document.querySelector("#pv_cat")?.value);
const sub1 = cleanStr(document.querySelector("#pv_sub1")?.value);
const sub2 = cleanStr(document.querySelector("#pv_sub2")?.value);
const sub3 = cleanStr(document.querySelector("#pv_sub3")?.value);

if (!cat) return alert("Informe a categoria.");

const genName = joinNameFromParts([cat, sub1, sub2, sub3]);
if (!genName) return alert("Não foi possível gerar o nome do produto.");

p.sku = sku;
p.unit = unit;
p.priceCents = priceCents;
p.costCents = costCents || 0;
p.stockOnHand = stockOnHand;
p.stockMin = stockMin;
p.status = status;
p.imageData = imageData;
p.name = cleanStr(p.name); // mantém o nome gerado
p.cat = cat;
p.sub1 = sub1;
p.sub2 = sub2;
p.sub3 = sub3;
p.name = genName;   


     (async () => {
  try {
    const patch = {
      name: p.name,
      sku: p.sku,
      unit: p.unit,
      priceCents: p.priceCents,
      costCents: p.costCents,
      stockOnHand: p.stockOnHand,
      stockMin: p.stockMin,
      status: p.status,
      imageData: p.imageData,
      cat: p.cat,
      sub1: p.sub1,
      sub2: p.sub2,
      sub3: p.sub3,
    };

    const updated = await window.ProductsStore.update(id, patch);

    const products = loadProducts();
    const idx = products.findIndex(x => x.id === id);
    if (idx >= 0) products[idx] = updated;
    else products.push(updated);
    saveProducts(products);

    renderProductsTable(getFilters());

    const dlgMove = document.querySelector("#dlgMove");
    if (dlgMove && dlgMove._mv && typeof dlgMove._mv.rebuildProductDatalist === "function") {
      dlgMove._mv.rebuildProductDatalist();
    }

    setReadOnly(true);
    dlg.close();
  } catch (e) {
    console.error("[Produtos] Erro ao atualizar no Supabase:", e);
    alert("Erro ao salvar alterações no banco. Veja o console.");
  }
})();
    });

    dlg.addEventListener("close", () => setReadOnly(true));
    setReadOnly(true);

  // máscara BRL no modal de edição também
moneyMaskBRL(document.querySelector("#pv_price"));
moneyMaskBRL(document.querySelector("#pv_cost"));  

function refreshViewName(){
  const cat  = cleanStr(document.querySelector("#pv_cat")?.value);
  const sub1 = cleanStr(document.querySelector("#pv_sub1")?.value);
  const sub2 = cleanStr(document.querySelector("#pv_sub2")?.value);
  const sub3 = cleanStr(document.querySelector("#pv_sub3")?.value);

  const pvName = document.querySelector("#pv_name_gen");
  if (pvName) pvName.value = joinNameFromParts([cat, sub1, sub2, sub3]);
}

// bind dos pickers de taxonomia no modal view/edit
bindTaxPicker({ levelKey:"cat",  inputSel:"#pv_cat",  btnAddSel:null, onChange: refreshViewName });
bindTaxPicker({ levelKey:"sub1", inputSel:"#pv_sub1", btnAddSel:null, onChange: refreshViewName });
bindTaxPicker({ levelKey:"sub2", inputSel:"#pv_sub2", btnAddSel:null, onChange: refreshViewName });
bindTaxPicker({ levelKey:"sub3", inputSel:"#pv_sub3", btnAddSel:null, onChange: refreshViewName });

refreshViewName();
  
  }

  function openProductView(id) {
    const dlg = document.querySelector("#dlgProductView");
    if (!dlg) return;

    const p = loadProducts().find(x => x.id === id);
if (!p) return;

ensureTaxFields(p);

// Taxonomia (visual)
const pvCat  = document.querySelector("#pv_cat");
const pvSub1 = document.querySelector("#pv_sub1");
const pvSub2 = document.querySelector("#pv_sub2");
const pvSub3 = document.querySelector("#pv_sub3");

if (pvCat)  pvCat.value  = p.cat  || "";
if (pvSub1) pvSub1.value = p.sub1 || "";
if (pvSub2) pvSub2.value = p.sub2 || "";
if (pvSub3) pvSub3.value = p.sub3 || "";


document.querySelector("#pv_id").value = p.id;
const pvName = document.querySelector("#pv_name_gen");
if (pvName) pvName.value = p.name || "";


    document.querySelector("#pv_sku").value = p.sku || "";
    const pvUnit = document.querySelector("#pv_unit");
if (pvUnit) pvUnit.value = p.unit || "UN";
    document.querySelector("#pv_price").value = ((Number(p.priceCents || 0) / 100).toFixed(2)).replace(".", ",");
    document.querySelector("#pv_cost").value = ((Number(p.costCents || 0) / 100).toFixed(2)).replace(".", ",");
    document.querySelector("#pv_stock").value = Number(p.stockOnHand || 0);
    document.querySelector("#pv_min").value = Number(p.stockMin || 0);
    document.querySelector("#pv_status").value = p.status || "active";
    moneyMaskBRL(document.querySelector("#pv_price"));
moneyMaskBRL(document.querySelector("#pv_cost"));

    const photoImg = document.querySelector("#pv_photoImg");
    const photoEmpty = document.querySelector("#pv_photoEmpty");
    const photoData = document.querySelector("#pv_photoData");
    const photoFile = document.querySelector("#pv_photoFile");

    if (photoFile) photoFile.value = "";
    if (photoData) photoData.value = p.imageData || "";

    if (p.imageData) {
      if (photoImg) {
        photoImg.src = p.imageData;
        photoImg.style.display = "block";
      }
      if (photoEmpty) photoEmpty.style.display = "none";
    } else {
      if (photoImg) {
        photoImg.src = "";
        photoImg.style.display = "none";
      }
      if (photoEmpty) photoEmpty.style.display = "grid";
    }

    dlg.showModal();
  }

  // =========================
  // Modal Novo Produto (foto clicável + X)
  // =========================
  function setupPhotoPick() {
    const inpFile = document.querySelector("#prd_imageFile");
    const pick = document.querySelector("#prd_photoPick");
    const imgPrev = document.querySelector("#prd_imagePreview");
    const empty = document.querySelector("#prd_imageEmpty");
    const inpData = document.querySelector("#prd_imageData");
    const btnX = document.querySelector("#prd_photoClear");

    if (!inpFile || !pick || !imgPrev || !empty || !inpData || !btnX) return;
    if (pick.dataset.bound === "1") return;
    pick.dataset.bound = "1";

    pick.addEventListener("click", (ev) => {
      if (ev.target === btnX) return;
      ev.preventDefault();
      ev.stopPropagation();
      inpFile.click();
    });

    btnX.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      inpFile.value = "";
      inpData.value = "";
      imgPrev.src = "";
      imgPrev.style.display = "none";
      empty.style.display = "grid";
      btnX.style.display = "none";
    });

    inpFile.addEventListener("change", async () => {
      const file = inpFile.files && inpFile.files[0];
      if (!file) return;

      if (file.size > 1024 * 1024) {
        alert("Imagem muito grande (limite 1MB).");
        inpFile.value = "";
        return;
      }

      const dataUrl = await fileToDataURL(file);
      inpData.value = dataUrl;

      imgPrev.src = dataUrl;
      imgPrev.style.display = "block";
      empty.style.display = "none";
      btnX.style.display = "grid";
    });
  }

  function bindCreateProductForm() {
    const dlgProduct = document.querySelector("#dlgProduct");
    const frmProduct = document.querySelector("#frmProduct");
    if (!dlgProduct || !frmProduct || frmProduct.dataset.bound === "1") return;
    frmProduct.dataset.bound = "1";


// preview do nome (gerado)
function refreshNewName(){
  const cat  = cleanStr(document.querySelector("#prd_cat")?.value);
  const sub1 = cleanStr(document.querySelector("#prd_sub1")?.value);
  const sub2 = cleanStr(document.querySelector("#prd_sub2")?.value);
  const sub3 = cleanStr(document.querySelector("#prd_sub3")?.value);

    const name = joinNameFromParts([cat, sub1, sub2, sub3]);

  const out = document.querySelector("#prd_name_gen");
  if (out) out.value = name;
}

// aplica máscara BRL nos campos de dinheiro do "Novo produto"
moneyMaskBRL(document.querySelector("#prd_price"));
moneyMaskBRL(document.querySelector("#prd_cost"));

bindTaxPicker({ levelKey:"cat",  inputSel:"#prd_cat",  btnAddSel:"#prdCatAdd",  onChange: refreshNewName });
bindTaxPicker({ levelKey:"sub1", inputSel:"#prd_sub1", btnAddSel:"#prdSub1Add", onChange: refreshNewName });
bindTaxPicker({ levelKey:"sub2", inputSel:"#prd_sub2", btnAddSel:"#prdSub2Add", onChange: refreshNewName });
bindTaxPicker({ levelKey:"sub3", inputSel:"#prd_sub3", btnAddSel:"#prdSub3Add", onChange: refreshNewName });

refreshNewName();



    frmProduct.addEventListener("submit", (ev) => {
      ev.preventDefault();
            if (!window.CoreAuth?.can?.("canCreateProducts")) {
        alert("Você não tem permissão para cadastrar produtos.");
        return;
      }

      if (ev.submitter && ev.submitter.value === "cancel") {
        dlgProduct.close();
        return;
      }

      const cat  = cleanStr(document.querySelector("#prd_cat")?.value);
const sub1 = cleanStr(document.querySelector("#prd_sub1")?.value);
const sub2 = cleanStr(document.querySelector("#prd_sub2")?.value);
const sub3 = cleanStr(document.querySelector("#prd_sub3")?.value);

const name = joinNameFromParts([cat, sub1, sub2, sub3]);



      const sku = normalizeSku(document.querySelector("#prd_sku")?.value);
      const unit = cleanStr(document.querySelector("#prd_unit")?.value) || "UN";

      const priceCents = toCents(document.querySelector("#prd_price")?.value);
      const costCents = toCents(document.querySelector("#prd_cost")?.value);
      const stockOnHand = parseInt(document.querySelector("#prd_stockOnHand")?.value || "0", 10) || 0;
      const stockMin = parseInt(document.querySelector("#prd_stockMin")?.value || "0", 10) || 0;
      const status = document.querySelector("#prd_status")?.value || "active";
      const imageData = document.querySelector("#prd_imageData")?.value || "";

      if (!cat) return alert("Informe a categoria.");

      if (priceCents <= 0) return alert("Informe um preço válido.");

      const products = loadProducts();
      if (sku) {
  const skuExists = products.some(p => String(p.sku || "").trim() === sku);
  if (skuExists) return alert("Já existe um produto com esse SKU.");
}


      const prod = {
  name,  // gerado
  cat,
  sub1,
  sub2,
  sub3,
    sku,
  unit,
  priceCents,
  costCents: costCents || 0,
  stockOnHand,
  stockMin,
  status,
  imageData,
  createdAt: new Date().toISOString()
};



      (async () => {
  try {
    const created = await window.ProductsStore.create(prod);

    const products = loadProducts();
    products.push(created);
    saveProducts(products);

    renderProductsTable(getFilters());

    const dlgMove = document.querySelector("#dlgMove");
    if (dlgMove && dlgMove._mv && typeof dlgMove._mv.rebuildProductDatalist === "function") {
      dlgMove._mv.rebuildProductDatalist();
    }

    dlgProduct.close();
  } catch (e) {
    console.error("[Produtos] Erro ao criar no Supabase:", e);
    alert("Erro ao salvar o produto no banco. Veja o console.");
  }
})();
    });
  }

  // =========================
  // Movimentar estoque (Compra / Perda / Ajuste)
  // =========================
  function setupMoveModal() {
    const dlg = document.querySelector("#dlgMove");
    if (!dlg) return;

    if (dlg.dataset.bound === "1") return;
    dlg.dataset.bound = "1";

    const kind = dlg.querySelector("#mv_kind");
    const hint = dlg.querySelector("#mv_hint");
    const secPurchase = dlg.querySelector("#mv_purchase");
    const secLoss = dlg.querySelector("#mv_loss");
    const secAdjust = dlg.querySelector("#mv_adjust");

    const pQuery = dlg.querySelector("#mv_p_query");
    const pAdd = dlg.querySelector("#mv_p_add");
    const pList = dlg.querySelector("#mv_p_list");
    const pNF = dlg.querySelector("#mv_p_nf");
    const pSupplier = dlg.querySelector("#mv_p_supplier");
    const pDate = dlg.querySelector("#mv_p_date");
    const pTotal = dlg.querySelector("#mv_p_total");

    const lQuery = dlg.querySelector("#mv_l_query");
    const lQty = dlg.querySelector("#mv_l_qty");
    const lDate = dlg.querySelector("#mv_l_date");
    const lNote = dlg.querySelector("#mv_l_note");

    const aQuery = dlg.querySelector("#mv_a_query");
    const aFinal = dlg.querySelector("#mv_a_final");
    const aDate = dlg.querySelector("#mv_a_date");
    const aNote = dlg.querySelector("#mv_a_note");

    const frm = dlg.querySelector("#frmMove");

    const pMenu = dlg.querySelector("#mv_p_menu");
    const lMenu = dlg.querySelector("#mv_l_menu");
    const aMenu = dlg.querySelector("#mv_a_menu");

    const head = dlg.querySelector("#mv_purchase .mv-items-head"); // cabeçalho da lista compra

    // datalist pode existir ou não
    const dl = dlg.querySelector("#mv_products_list");

    if (!kind || !secPurchase || !secLoss || !secAdjust || !frm) {
      console.warn("[Mov] Elementos do dlgMove não encontrados. Verifique IDs no HTML.");
      return;
    }

    let purchaseItems = [];

    // selecionados pelo autocomplete bonito
    let selectedPurchaseId = null;
    let selectedLossId = null;
    let selectedAdjustId = null;

    // ====== FOTO DENTRO DO INPUT (Perda/Ajuste/Compra) ======
    function setInputThumb(inputEl, product) {
      if (!inputEl) return;

      if (product && product.imageData) {
        inputEl.style.backgroundImage = `url("${product.imageData}")`;
        inputEl.style.backgroundRepeat = "no-repeat";
        inputEl.style.backgroundPosition = "10px center";
        inputEl.style.backgroundSize = "26px 26px";
        inputEl.style.paddingLeft = "44px";
      } else {
        inputEl.style.backgroundImage = "";
        inputEl.style.backgroundPosition = "";
        inputEl.style.backgroundSize = "";
        inputEl.style.paddingLeft = "";
      }
    }

    function clearInputThumb(inputEl) {
      setInputThumb(inputEl, null);
    }

    function rebuildProductDatalist() {
      if (!dl) return;
      const products = loadProducts()
        .filter(p => p.status !== "inactive")
        .sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));

      dl.innerHTML = products.map(p => {
        const sku = String(p.sku || "").trim();
        const name = String(p.name || "").trim();
        const pretty = `${name} (${sku})`;
        return `
          <option value="${escapeHtml(sku)}"></option>
          <option value="${escapeHtml(pretty)}"></option>
        `;
      }).join("");
    }

    function resolveProductIdFromQuery(query) {
      const q = String(query || "").trim();
      if (!q) return null;

      const products = loadProducts();

      const bySku = products.find(p => String(p.sku || "").trim() === q);
      if (bySku) return bySku.id;

      const m = q.match(/\(([^)]+)\)\s*$/);
      if (m) {
        const sku = m[1].trim();
        const bySku2 = products.find(p => String(p.sku || "").trim() === sku);
        if (bySku2) return bySku2.id;
      }

      const byName = products.find(p =>
        String(p.name || "").trim().toLowerCase() === q.toLowerCase()
      );
      return byName ? byName.id : null;
    }

    function setKind(v) {
      secPurchase.hidden = v !== "PURCHASE";
      secLoss.hidden = v !== "LOSS";
      secAdjust.hidden = v !== "ADJUST";
      if (hint) hint.hidden = (v !== "");
    }

    // =========================
    // Autocomplete bonito (Venda-like)
    // =========================
    function attachAutocomplete(inputEl, menuEl, onPick, onTypingReset) {
      if (!inputEl || !menuEl) return;
      if (inputEl.dataset.acBound === "1") return;
      inputEl.dataset.acBound = "1";

      let items = [];
      let active = -1;

      function getList(q) {
        const query = String(q || "").trim().toLowerCase();
        const list = loadProducts().filter(p => (p.status || "active") !== "inactive");

        if (!query) return list.slice(0, 8);

        const exactSku = list.filter(p => String(p.sku || "").toLowerCase() === query);
        const contains = list.filter(p => {
          const name = String(p.name || "").toLowerCase();
          const sku = String(p.sku || "").toLowerCase();
          return name.includes(query) || sku.includes(query);
        });

        const seen = new Set();
        const out = [];
        for (const p of [...exactSku, ...contains]) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          out.push(p);
          if (out.length >= 8) break;
        }
        return out;
      }

      function renderMenu(q) {
        items = getList(q);
        active = -1;

        if (!items.length) {
          menuEl.hidden = true;
          menuEl.innerHTML = "";
          return;
        }

        menuEl.hidden = false;
        menuEl.innerHTML = items.map((p, idx) => {
          const thumb = p.imageData ? `<img src="${p.imageData}" alt="">` : `IMG`;
          return `
            <div class="ac-item" data-idx="${idx}">
              <div class="ac-thumb">${thumb}</div>
              <div class="ac-main">
                <div class="ac-name">${escapeHtml(p.name || "")}</div>
                <div class="ac-sub">Estoque: ${Number(p.stockOnHand || 0)}</div>
              </div>
              <div class="ac-sku">${escapeHtml(p.sku || "")}</div>
            </div>
          `;
        }).join("");

        menuEl.querySelectorAll(".ac-item").forEach(el => {
          el.addEventListener("mousedown", (ev) => {
            ev.preventDefault();
            const idx = parseInt(el.getAttribute("data-idx"), 10);
            pick(idx);
          });
        });
      }

      function highlight() {
        menuEl.querySelectorAll(".ac-item").forEach(el => el.classList.remove("is-active"));
        const el = menuEl.querySelector(`.ac-item[data-idx="${active}"]`);
        if (el) el.classList.add("is-active");
      }

      function pick(idx) {
        const p = items[idx];
        if (!p) return;

        inputEl.value = `${p.name} (${p.sku})`;
        menuEl.hidden = true;
        menuEl.innerHTML = "";
        onPick(p);
      }

      inputEl.addEventListener("input", () => {
        if (onTypingReset) onTypingReset();
        renderMenu(inputEl.value);
      });

      inputEl.addEventListener("focus", () => renderMenu(inputEl.value));

      inputEl.addEventListener("blur", () => {
        setTimeout(() => {
          menuEl.hidden = true;
          menuEl.innerHTML = "";
        }, 120);
      });

      inputEl.addEventListener("keydown", (ev) => {
        if (menuEl.hidden) return;

        if (ev.key === "ArrowDown") {
          ev.preventDefault();
          active = Math.min(items.length - 1, active + 1);
          highlight();
        } else if (ev.key === "ArrowUp") {
          ev.preventDefault();
          active = Math.max(0, active - 1);
          highlight();
        } else if (ev.key === "Enter") {
          ev.preventDefault();
          pick(active >= 0 ? active : 0);
        } else if (ev.key === "Escape") {
          menuEl.hidden = true;
          menuEl.innerHTML = "";
        }
      });
    }

    // instala autocomplete nos 3 inputs + aplica miniatura no input (perda/ajuste e compra)
    attachAutocomplete(
      pQuery, pMenu,
      (p) => { selectedPurchaseId = p.id; setInputThumb(pQuery, p); },
      () => { selectedPurchaseId = null; clearInputThumb(pQuery); }
    );
    attachAutocomplete(
      lQuery, lMenu,
      (p) => { selectedLossId = p.id; setInputThumb(lQuery, p); },
      () => { selectedLossId = null; clearInputThumb(lQuery); }
    );
    attachAutocomplete(
      aQuery, aMenu,
      (p) => { selectedAdjustId = p.id; setInputThumb(aQuery, p); },
      () => { selectedAdjustId = null; clearInputThumb(aQuery); }
    );

    // =========================
    // Compra listagem e total
    // =========================
    function calcTotal() {
      const total = purchaseItems.reduce((acc, it) => acc + (it.qty * it.costCents), 0);
      if (pTotal) pTotal.textContent = fmtBRL(total);
      return total;
    }

    function patchPurchaseHeaderForPhoto() {
      if (!head) return;
      if (head.dataset.patched === "1") return;
      head.dataset.patched = "1";

      // adiciona coluna "FOTO" antes do ITEM
      head.innerHTML = `
        <div>FOTO</div>
        <div>ITEM</div>
        <div>QTD</div>
        <div>CUSTO (R$)</div>
        <div></div>
      `;

      // força grid com 5 colunas
      head.style.display = "grid";
      head.style.gridTemplateColumns = "48px 1fr 90px 140px 44px";
      head.style.gap = "10px";
      head.style.alignItems = "center";
    }

    function renderPurchaseList() {
      if (!pList) return;
      patchPurchaseHeaderForPhoto();

      pList.innerHTML = "";

      if (purchaseItems.length === 0) {
        const emptyRow = document.createElement("div");
        emptyRow.className = "mv-item";
        emptyRow.style.display = "grid";
        emptyRow.style.gridTemplateColumns = "48px 1fr 90px 140px 44px";
        emptyRow.style.gap = "10px";
        emptyRow.style.alignItems = "center";
        emptyRow.innerHTML = `<div></div><div class="mini">Nenhum item adicionado</div><div></div><div></div><div></div>`;
        pList.appendChild(emptyRow);
        calcTotal();
        return;
      }

      const products = loadProducts();
      const byId = new Map(products.map(p => [p.id, p]));

      purchaseItems.forEach((it) => {
        const p = byId.get(it.productId);
        const name = p ? `${p.name} (${p.sku})` : it.productId;

        const thumbHtml = (p && p.imageData)
          ? `<img src="${p.imageData}" style="width:100%;height:100%;object-fit:cover;display:block;">`
          : `<div style="font-size:11px;font-weight:800;color:rgba(0,0,0,.45);">IMG</div>`;

        const row = document.createElement("div");
        row.className = "mv-item";
        row.style.display = "grid";
        row.style.gridTemplateColumns = "48px 1fr 90px 140px 44px";
        row.style.gap = "10px";
        row.style.alignItems = "center";

        row.innerHTML = `
          <div style="width:48px;height:48px;border-radius:14px;overflow:hidden;border:1px solid rgba(0,0,0,.10);background:rgba(0,0,0,.03);display:grid;place-items:center;">
            ${thumbHtml}
          </div>
          <div>${escapeHtml(name)}</div>
          <input class="inp" inputmode="numeric" value="${it.qty}" data-k="qty">
          <input class="inp" inputmode="decimal" value="${(it.costCents/100).toFixed(2).replace(".", ",")}" data-k="cost">
          <button type="button" class="rm" title="Remover">🗑️</button>
        `;

        row.querySelector('[data-k="qty"]').addEventListener("input", (e) => {
          const v = parseInt(e.target.value || "0", 10);
          it.qty = Number.isFinite(v) && v > 0 ? v : 0;
          calcTotal();
        });

        row.querySelector('[data-k="cost"]').addEventListener("input", (e) => {
          it.costCents = toCents(e.target.value);
          calcTotal();
        });

        row.querySelector(".rm").addEventListener("click", () => {
          purchaseItems = purchaseItems.filter(x => x !== it);
          renderPurchaseList();
        });

        pList.appendChild(row);
      });

      calcTotal();
    }

    function addPurchaseItemFromQuery() {
      if (!pQuery) return;

      let productId = selectedPurchaseId;
      if (!productId) productId = resolveProductIdFromQuery(pQuery.value);

      if (!productId) {
        alert("Produto não encontrado. Digite um SKU válido ou selecione na lista.");
        pQuery.focus();
        pQuery.select?.();
        return;
      }

      const found = purchaseItems.find(x => x.productId === productId);
      if (found) found.qty += 1;
      else purchaseItems.push({ productId, qty: 1, costCents: 0 });

      renderPurchaseList();

      selectedPurchaseId = null;
      pQuery.value = "";
      clearInputThumb(pQuery);
      pQuery.focus();
    }

    if (pAdd) pAdd.addEventListener("click", addPurchaseItemFromQuery);

    // Enter no input (se menu fechado) adiciona
    if (pQuery) {
      pQuery.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" && (!pMenu || pMenu.hidden)) {
          ev.preventDefault();
          addPurchaseItemFromQuery();
        }
      });
    }

    kind.addEventListener("change", () => setKind(kind.value));

    frm.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (!window.CoreAuth?.can?.("canMoveStock")) {
        alert("Você não tem permissão para movimentar estoque.");
        return;
      }
      if (ev.submitter && ev.submitter.value === "cancel") {
        dlg.close();
        return;
      }

      const k = kind.value;

      // COMPRA
      if (k === "PURCHASE") {
        if (purchaseItems.length === 0) return alert("Adicione pelo menos 1 item na compra.");

        const nf = (pNF?.value || "").trim();
        const supplier = (pSupplier?.value || "").trim();
        const date = pDate?.value || todayISO();

        const purchaseId = uid("pur");
const actor = getActorName();

// salva compra completa (para relatórios/detalhes)
let purchases = [];
try { purchases = JSON.parse(localStorage.getItem(KEY_PURCHASES) || "[]"); } catch { purchases = []; }

const purchase = {
  id: purchaseId,
  nf: nf || "",
  supplier: supplier || "",
  date: date || todayISO(),
  createdAt: new Date().toISOString(),
  createdBy: actor,
  items: purchaseItems.map(it => ({
    productId: it.productId,
    qty: Number(it.qty || 0),
    costCents: Number(it.costCents || 0)
  }))
};

purchases.unshift(purchase);
localStorage.setItem(KEY_PURCHASES, JSON.stringify(purchases));



        const products = loadProducts();
const byId = new Map(products.map(p => [p.id, p]));

for (const it of purchaseItems) {
  if (!it.qty || it.qty <= 0) continue;

  const prod = byId.get(it.productId);
  if (!prod) continue;

  // 1) ledger no Supabase
  await window.StockStore.addMove({
    productId: prod.id,
    kind: "in",
    qty: Number(it.qty || 0),
    note: `Compra${nf ? " • NF " + nf : ""}${supplier ? " • " + supplier : ""}${date ? " • " + date : ""}`,
    ref: purchaseId
  });

  // 2) atualiza estoque no Supabase (pra UI ficar instantânea)
  const newStock = Number(prod.stockOnHand || 0) + Number(it.qty || 0);

  const patch = { stockOnHand: newStock };
  if (Number(it.costCents || 0) > 0) patch.costCents = Number(it.costCents || 0);

  const updated = await window.ProductsStore.update(prod.id, patch);

  // 3) atualiza cache
  byId.set(prod.id, updated);
}

// commit cache
saveProducts(Array.from(byId.values()));

renderProductsTable(getFilters());
dlg.close();
return;
      }

      // PERDA
      if (k === "LOSS") {
        let productId = selectedLossId || resolveProductIdFromQuery(lQuery?.value);
        const qty = parseInt(lQty?.value || "0", 10);
        const date = lDate?.value || todayISO();
        const note = (lNote?.value || "").trim();

        if (!productId) return alert("Produto não encontrado.");
        if (!qty || qty <= 0) return alert("Quantidade inválida.");

        const products = loadProducts();
        const prod = products.find(p => p.id === productId);
        if (!prod) return alert("Produto inválido.");

        const before = Number(prod.stockOnHand || 0);
        if (before - qty < 0) return alert("Estoque insuficiente para registrar perda.");

       const nextStock = before - qty;

// 1) ledger no Supabase
await window.StockStore.addMove({
  productId: prod.id,
  kind: "out",
  qty: Number(qty),
  note: `Perda${date ? " • " + date : ""}${note ? " • " + note : ""}`,
  ref: null
});

// 2) atualiza estoque no Supabase
const updated = await window.ProductsStore.update(prod.id, {
  stockOnHand: nextStock
});

// 3) atualiza cache em memória
const idx = products.findIndex(p => p.id === prod.id);
if (idx >= 0) products[idx] = updated;

saveProducts(products);
renderProductsTable(getFilters());
dlg.close();
return;
      }

      // AJUSTE
      if (k === "ADJUST") {
        let productId = selectedAdjustId || resolveProductIdFromQuery(aQuery?.value);
        const finalVal = parseInt(aFinal?.value || "0", 10);
        const date = aDate?.value || todayISO();
        const note = (aNote?.value || "").trim();

        if (!productId) return alert("Produto não encontrado.");
        if (!Number.isFinite(finalVal) || finalVal < 0) return alert("Estoque final inválido.");

        const products = loadProducts();
        const prod = products.find(p => p.id === productId);
        if (!prod) return alert("Produto inválido.");

        const before = Number(prod.stockOnHand || 0);
        const delta = finalVal - before;
        if (delta === 0) return alert("Estoque final igual ao atual.");

        // delta > 0 = entrada, delta < 0 = saída
const moveKind = delta > 0 ? "in" : "out";

// 1) ledger no Supabase
await window.StockStore.addMove({
  productId: prod.id,
  kind: moveKind,
  qty: Math.abs(delta),
  note: `Ajuste (final ${finalVal}) • antes ${before}${date ? " • " + date : ""}${note ? " • " + note : ""}`,
  ref: null
});

// 2) atualiza estoque no Supabase
const updated = await window.ProductsStore.update(prod.id, {
  stockOnHand: finalVal
});

// 3) atualiza cache em memória
const idx = products.findIndex(p => p.id === prod.id);
if (idx >= 0) products[idx] = updated;

saveProducts(products);
renderProductsTable(getFilters());
dlg.close();
return;
      }

      alert("Selecione um tipo de movimentação.");
    });

    dlg._mv = {
      rebuildProductDatalist,
      setKind,
      reset: () => {
        rebuildProductDatalist();

        kind.value = "";
        setKind("");

        purchaseItems = [];
        renderPurchaseList();

        selectedPurchaseId = null;
        selectedLossId = null;
        selectedAdjustId = null;

        if (pMenu) { pMenu.hidden = true; pMenu.innerHTML = ""; }
        if (lMenu) { lMenu.hidden = true; lMenu.innerHTML = ""; }
        if (aMenu) { aMenu.hidden = true; aMenu.innerHTML = ""; }

        if (pQuery) { pQuery.value = ""; clearInputThumb(pQuery); }
        if (pNF) pNF.value = "";
        if (pSupplier) pSupplier.value = "";
        if (pDate) pDate.value = todayISO();
        if (pTotal) pTotal.textContent = fmtBRL(0);

        if (lQuery) { lQuery.value = ""; clearInputThumb(lQuery); }
        if (lQty) lQty.value = "";
        if (lDate) lDate.value = todayISO();
        if (lNote) lNote.value = "";

        if (aQuery) { aQuery.value = ""; clearInputThumb(aQuery); }
        if (aFinal) aFinal.value = "";
        if (aDate) aDate.value = todayISO();
        if (aNote) aNote.value = "";
      }
    };
  }

  function openMoveModal() {
  const dlg = document.querySelector("#dlgMove");
  if (!dlg) {
    alert("Modal #dlgMove não encontrado no HTML.");
    return;
  }
  if (!dlg._mv) {
    alert("Modal de movimentação não inicializou. Verifique IDs do #dlgMove (veja console).");
    console.warn("[Mov] dlg._mv não existe. Provável mismatch de IDs no HTML do dlgMove.");
    return;
  }
  dlg._mv.reset();
}

  // =========================
  // Inicialização da página
  // =========================
  window.CorePageModules.produtos = function () {
    const btnNewProduct = document.querySelector("#btnNewProduct");
    const btnNewMovement = document.querySelector("#btnNewMovement");
    const dlgProduct = document.querySelector("#dlgProduct");
    const dlgMove = document.querySelector("#dlgMove");

    const canCreateProducts = !!window.CoreAuth?.can?.("canCreateProducts");
const canMoveStock = !!window.CoreAuth?.can?.("canMoveStock");

    if (!btnNewProduct || !dlgProduct || !btnNewMovement || !dlgMove) {
      console.warn("[Produtos] Elementos não encontrados. Verifique IDs no HTML.");
      return;
    }

    setupPhotoPick();
    bindCreateProductForm();
    setupMoveModal();
    bindProductViewModal();
    bindTableClicks();
    bindFilters();
    bindSortHeaders();

    if (btnNewProduct) {
  btnNewProduct.disabled = !canCreateProducts;
  btnNewProduct.classList.toggle("is-disabled", !canCreateProducts);
}

if (btnNewMovement) {
  btnNewMovement.disabled = !canMoveStock;
  btnNewMovement.classList.toggle("is-disabled", !canMoveStock);
}

    (async () => {
  try {
    const list = await window.ProductsStore.list({ limit: 1000 });
setProducts(list);
  } catch (e) {
    console.error("[Produtos] Falha ao carregar do Supabase:", e);
  } finally {
    renderProductsTable(getFilters());
  }
})();

    btnNewProduct.onclick = () => {
  if (!window.CoreAuth?.can?.("canCreateProducts")) {
    alert("Você não tem permissão para cadastrar produtos.");
    return;
  }
  dlgProduct.showModal();
};

    btnNewMovement.onclick = () => {
  if (!window.CoreAuth?.can?.("canMoveStock")) {
    alert("Você não tem permissão para movimentar estoque.");
    return;
  }

  openMoveModal();
  dlgMove.showModal();
};
  };
})();
