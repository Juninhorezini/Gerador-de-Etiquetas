const STORAGE_KEY_PRODUCTS = "packLabel.products.v1";
const STORAGE_KEY_SETTINGS = "packLabel.settings.v1";
const STORAGE_KEY_SYNC_META = "packLabel.syncMeta.v1";

function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatNow() {
  const now = new Date();
  return `${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}/${now.getFullYear()} ${pad2(now.getHours())}:${pad2(
    now.getMinutes(),
  )}:${pad2(now.getSeconds())}`;
}

function parseCSV(text) {
  const arr = [];
  let quote = false;
  let row = 0;
  let col = 0;
  for (let c = 0; c < text.length; c++) {
    const cc = text[c];
    const nc = text[c + 1];
    arr[row] = arr[row] || [];
    arr[row][col] = arr[row][col] || "";
    if (cc === '"' && quote && nc === '"') {
      arr[row][col] += cc;
      c++;
      continue;
    }
    if (cc === '"') {
      quote = !quote;
      continue;
    }
    if (cc === "," && !quote) {
      col++;
      continue;
    }
    if (cc === "\r" && nc === "\n" && !quote) {
      row++;
      col = 0;
      c++;
      continue;
    }
    if ((cc === "\n" || cc === "\r") && !quote) {
      row++;
      col = 0;
      continue;
    }
    arr[row][col] += cc;
  }
  return arr;
}

function safeNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function loadProducts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PRODUCTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((p) => ({
        ean: String(p.ean ?? "").trim(),
        codigo: String(p.codigo ?? "").trim(),
        descricao: String(p.descricao ?? "").trim(),
        cor: String(p.cor ?? "").trim(),
        quantidade: String(p.quantidade ?? "").trim(),
      }))
      .filter((p) => p.codigo || p.cor || p.ean || p.descricao);
  } catch {
    return [];
  }
}

function saveProducts(products) {
  localStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(products));
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
}

function loadSyncMeta() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SYNC_META);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveSyncMeta(meta) {
  localStorage.setItem(STORAGE_KEY_SYNC_META, JSON.stringify(meta));
}

function buildProductKey(codigo, cor) {
  return `${normalizeKey(codigo)}|${normalizeKey(cor)}`;
}

function uniqId(prefix = "id") {
  return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
}

const SHEETS_SYNC_CONFIG = Object.freeze({
  spreadsheetId: "1CWw8zKMf1ww08gynis7qIAYFjaYJo3PYb8bghp35zYE",
  defaultSheetName: "Packs",
  endpointMetaName: "pack-sync-endpoint",
  timeoutMs: 12000,
});

function normalizeProductRecord(record) {
  if (!record || typeof record !== "object") return null;
  const codigo = normalizeKey(record.codigo ?? record.CODIGO ?? record.produto ?? record.PRODUTO ?? record.sku ?? record.SKU);
  const cor = normalizeKey(record.cor ?? record.COR);
  if (!codigo || !cor) return null;
  return {
    ean: String(record.ean ?? record.EAN ?? "").trim(),
    codigo,
    descricao: String(record.descricao ?? record.DESCRICAO ?? "").trim(),
    cor,
    quantidade: String(record.quantidade ?? record.QUANTIDADE ?? record.qtd ?? record.QTD ?? "").trim(),
  };
}

function areProductsEqual(a, b) {
  return (
    a.ean === b.ean &&
    a.codigo === b.codigo &&
    a.descricao === b.descricao &&
    a.cor === b.cor &&
    a.quantidade === b.quantidade
  );
}

function mergeProductsByKey(baseProducts, incomingProducts) {
  const nextProducts = baseProducts.slice();
  const indexByKey = new Map(nextProducts.map((product, index) => [buildProductKey(product.codigo, product.cor), index]));
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const incoming of incomingProducts) {
    const key = buildProductKey(incoming.codigo, incoming.cor);
    const idx = indexByKey.get(key);
    if (idx == null) {
      nextProducts.push(incoming);
      indexByKey.set(key, nextProducts.length - 1);
      inserted++;
      continue;
    }

    if (areProductsEqual(nextProducts[idx], incoming)) {
      unchanged++;
      continue;
    }

    nextProducts[idx] = incoming;
    updated++;
  }

  return { products: nextProducts, inserted, updated, unchanged };
}

function formatSyncDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

function getSheetsSyncEndpointUrl() {
  const metaEl = document.querySelector(`meta[name="${SHEETS_SYNC_CONFIG.endpointMetaName}"]`);
  return String(metaEl?.getAttribute("content") ?? "").trim();
}

function buildSheetsSyncUrl() {
  const endpointUrl = getSheetsSyncEndpointUrl();
  if (!endpointUrl) return "";
  const url = new URL(endpointUrl, window.location.href);
  if (!url.searchParams.has("sheet")) url.searchParams.set("sheet", SHEETS_SYNC_CONFIG.defaultSheetName);
  if (!url.searchParams.has("spreadsheetId")) url.searchParams.set("spreadsheetId", SHEETS_SYNC_CONFIG.spreadsheetId);
  return url.toString();
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error("A resposta não está em JSON válido.");
    }
    if (!response.ok) {
      throw new Error(data?.error || `Falha HTTP ${response.status}`);
    }
    return data;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function setRootLabelSize(widthMm, heightMm) {
  document.documentElement.style.setProperty("--label-w", `${widthMm}mm`);
  document.documentElement.style.setProperty("--label-h", `${heightMm}mm`);
}

function setPreviewMeta(widthMm, heightMm) {
  previewMeta.textContent = `${widthMm} × ${heightMm} mm`;
}

function updatePrintPageStyle(widthMm, heightMm) {
  let styleEl = document.getElementById("printPageStyle");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "printPageStyle";
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `@media print {@page{size:${widthMm}mm ${heightMm}mm;margin:0;}body{margin:0;padding:0;}}`;
}

function renderLabelInto(mountEl, data, { idSuffix, forPrint, forPreview }) {
  const barcodeId = `barcode-${idSuffix}`;
  mountEl.innerHTML = `
    <div class="label${forPreview ? " label--preview" : ""}" role="group" aria-label="Etiqueta Pack">
      <div class="label__left">
        <div class="label__pack">PACK: ${escapeHtml(data.codigo)} - ${escapeHtml(data.cor)}</div>
        <div class="label__desc">${escapeHtml(data.descricao)}</div>
        <div class="label__dt">${escapeHtml(data.dataHora)}</div>
        <div class="label__qtd">${escapeHtml(data.quantidade)} Unidades</div>
      </div>
      <div class="label__barcode">
        <svg id="${barcodeId}"></svg>
      </div>
    </div>
  `;
  const svg = mountEl.querySelector(`#${cssEscape(barcodeId)}`);
  renderBarcode(svg, data.ean);
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderBarcode(svgEl, value) {
  const v = String(value ?? "").trim();
  if (!svgEl) return;
  if (!v) {
    svgEl.innerHTML = "";
    barcodeStatus.textContent = "Código de barras: vazio";
    return;
  }
  if (!window.JsBarcode) {
    svgEl.innerHTML = "";
    barcodeStatus.textContent = "Código de barras: biblioteca não carregada (internet bloqueada?)";
    return;
  }

  const opts = {
    displayValue: true,
    fontSize: 14,
    width: 2.1,
    height: 56,
    margin: 0,
    textMargin: 1,
    font: "monospace",
  };

  try {
    window.JsBarcode(svgEl, v, { ...opts, format: "EAN13" });
    barcodeStatus.textContent = "Código de barras: EAN13";
  } catch {
    try {
      window.JsBarcode(svgEl, v, { ...opts, format: "CODE128", fontSize: 13, width: 2.0 });
      barcodeStatus.textContent = "Código de barras: CODE128 (fallback)";
    } catch {
      svgEl.innerHTML = "";
      barcodeStatus.textContent = "Código de barras: inválido";
    }
  }
}

function fitPreviewToStage() {
  const labelEl = previewMount.querySelector(".label");
  if (!labelEl) return;
  labelEl.style.transform = "";
  const stage = previewStage;
  const stageRect = stage.getBoundingClientRect();
  const labelRect = labelEl.getBoundingClientRect();
  const padding = 16;
  const maxW = Math.max(0, stageRect.width - padding * 2);
  const maxH = Math.max(0, stageRect.height - padding * 2);
  const scale = Math.min(1, maxW / labelRect.width, maxH / labelRect.height);
  labelEl.style.transform = `scale(${scale})`;
}

function getCurrentLabelData() {
  const codigo = normalizeKey(inpCodigoBusca.value) || normalizeKey(inpCodigoCad.value);
  const cor = normalizeKey(inpCorBusca.value) || normalizeKey(inpCorCad.value);
  const descricao = String(inpDescricao.value ?? "").trim();
  const ean = String(inpEan.value ?? "").trim();
  const quantidade = String(inpQuantidade.value ?? "").trim();
  const useNow = chkNow.checked;
  const dataHora = useNow ? formatNow() : String(inpDataHora.value ?? "").trim() || formatNow();
  return {
    codigo: codigo || "—",
    cor: cor || "—",
    descricao: descricao || "—",
    ean,
    quantidade: quantidade || "0",
    dataHora,
  };
}

function updatePreview() {
  const data = getCurrentLabelData();
  renderLabelInto(previewMount, data, { idSuffix: "preview", forPrint: false, forPreview: true });
  fitPreviewToStage();
}

function setStatus(el, kind, text) {
  el.classList.remove("status--muted", "status--ok", "status--warn", "status--err");
  el.classList.add(`status--${kind}`);
  el.textContent = text;
}

function findProductBySearch(products, codigo, cor) {
  const k = buildProductKey(codigo, cor);
  return products.find((p) => buildProductKey(p.codigo, p.cor) === k) ?? null;
}

function applyProductToLabelInputs(product) {
  inpEan.value = product.ean ?? "";
  inpDescricao.value = product.descricao ?? "";
  inpQuantidade.value = product.quantidade ?? "";
}

function applyProductToCadastroInputs(product) {
  inpCodigoCad.value = product.codigo ?? "";
  inpCorCad.value = product.cor ?? "";
  inpDescricaoCad.value = product.descricao ?? "";
  inpEanCad.value = product.ean ?? "";
  inpQtdCad.value = product.quantidade ?? "";
}

function clearCadastroInputs() {
  inpCodigoCad.value = "";
  inpCorCad.value = "";
  inpDescricaoCad.value = "";
  inpEanCad.value = "";
  inpQtdCad.value = "";
}

function clearLabelInputs(keepSearch) {
  if (!keepSearch) {
    inpCodigoBusca.value = "";
    inpCorBusca.value = "";
  }
  inpEan.value = "";
  inpDescricao.value = "";
  inpQuantidade.value = "";
}

function renderProductsTable() {
  const filter = normalizeKey(inpFiltro.value);
  const rows = products
    .slice()
    .sort((a, b) => buildProductKey(a.codigo, a.cor).localeCompare(buildProductKey(b.codigo, b.cor)))
    .filter((p) => {
      if (!filter) return true;
      const hay = normalizeKey(`${p.codigo} ${p.cor} ${p.ean} ${p.descricao} ${p.quantidade}`);
      return hay.includes(filter);
    });

  const frag = document.createDocumentFragment();
  for (const p of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(p.codigo)}</td>
      <td>${escapeHtml(p.cor)}</td>
      <td>${escapeHtml(p.ean)}</td>
      <td>${escapeHtml(p.quantidade)}</td>
      <td>${escapeHtml(p.descricao)}</td>
      <td class="table__actions">
        <span class="act">
          <button class="chip" type="button" data-act="edit" data-key="${escapeHtml(buildProductKey(p.codigo, p.cor))}">Editar</button>
          <button class="chip chip--danger" type="button" data-act="del" data-key="${escapeHtml(
            buildProductKey(p.codigo, p.cor),
          )}">Excluir</button>
        </span>
      </td>
    `;
    frag.appendChild(tr);
  }
  tbodyProdutos.replaceChildren(frag);
}

function upsertProductFromCadastro() {
  const codigo = normalizeKey(inpCodigoCad.value);
  const cor = normalizeKey(inpCorCad.value);
  if (!codigo || !cor) {
    setStatus(cadStatus, "err", "Informe Produto e Cor para salvar no cadastro.");
    return;
  }

  const product = {
    codigo,
    cor,
    descricao: String(inpDescricaoCad.value ?? "").trim(),
    ean: String(inpEanCad.value ?? "").trim(),
    quantidade: String(inpQtdCad.value ?? "").trim(),
  };

  const k = buildProductKey(codigo, cor);
  const idx = products.findIndex((p) => buildProductKey(p.codigo, p.cor) === k);
  if (idx >= 0) products[idx] = product;
  else products.push(product);

  saveProducts(products);
  renderProductsTable();
  setStatus(cadStatus, "ok", idx >= 0 ? "Produto atualizado com sucesso." : "Produto cadastrado com sucesso.");
}

function handleSearchApply() {
  const codigo = normalizeKey(inpCodigoBusca.value);
  const cor = normalizeKey(inpCorBusca.value);
  if (!codigo || !cor) {
    setStatus(searchStatus, "muted", "Digite Produto e Cor para localizar no cadastro (ou preencha manualmente).");
    return;
  }
  const found = findProductBySearch(products, codigo, cor);
  if (found) {
    applyProductToLabelInputs(found);
    setStatus(searchStatus, "ok", `Encontrado no cadastro: ${found.codigo} | ${found.cor}`);
  } else {
    setStatus(searchStatus, "warn", "Não encontrado no cadastro. Preencha os dados manualmente ou cadastre.");
  }
}

function getPrintSettings() {
  const widthMm = safeNumber(inpWmm.value, 100);
  const heightMm = safeNumber(inpHmm.value, 35);
  const qtyStr = String(inpQtdPrint.value ?? "").trim();
  if (!qtyStr) return { widthMm, heightMm, qty: null };
  const qtyRaw = Number.isFinite(inpQtdPrint.valueAsNumber) ? inpQtdPrint.valueAsNumber : safeNumber(qtyStr, NaN);
  const qty = Math.max(1, Math.min(999, Math.floor(qtyRaw)));
  return { widthMm, heightMm, qty: Number.isFinite(qty) ? qty : null };
}

function validatePrintQty({ report }) {
  const raw = String(inpQtdPrint.value ?? "").trim();
  if (!raw) {
    inpQtdPrint.setCustomValidity("Informe a quantidade de etiquetas.");
    if (report) {
      inpQtdPrint.reportValidity();
      inpQtdPrint.focus();
    }
    return null;
  }

  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    inpQtdPrint.setCustomValidity("Informe um número inteiro positivo (mínimo 1).");
    if (report) {
      inpQtdPrint.reportValidity();
      inpQtdPrint.focus();
    }
    return null;
  }

  const qty = Math.max(1, Math.min(999, Math.floor(n)));
  inpQtdPrint.setCustomValidity("");
  if (report) inpQtdPrint.reportValidity();
  return qty;
}

function updateSizeFromPreset() {
  const preset = selTamanho.value;
  if (preset === "100x35") {
    inpWmm.value = "100";
    inpHmm.value = "35";
  }
  if (preset === "100x50") {
    inpWmm.value = "100";
    inpHmm.value = "50";
  }
  const { widthMm, heightMm } = getPrintSettings();
  setRootLabelSize(widthMm, heightMm);
  setPreviewMeta(widthMm, heightMm);
  updatePrintPageStyle(widthMm, heightMm);
  updatePreview();
}

function buildPrintArea() {
  const { widthMm, heightMm, qty } = getPrintSettings();
  if (!qty) {
    printRoot.replaceChildren();
    printRoot.removeAttribute("data-label-count");
    return;
  }
  setRootLabelSize(widthMm, heightMm);
  setPreviewMeta(widthMm, heightMm);
  updatePrintPageStyle(widthMm, heightMm);

  const data = getCurrentLabelData();
  const frag = document.createDocumentFragment();
  for (let i = 0; i < qty; i++) {
    const mount = document.createElement("div");
    renderLabelInto(mount, data, { idSuffix: `print-${i}-${uniqId("x")}`, forPrint: true, forPreview: false });
    frag.appendChild(mount.firstElementChild);
  }
  printRoot.replaceChildren(frag);
  printRoot.setAttribute("data-label-count", String(qty));
}

function canPrintOrExport() {
  const data = getCurrentLabelData();
  return data.codigo !== "—" && data.cor !== "—" && data.descricao !== "—";
}

function printLabels() {
  if (!canPrintOrExport()) {
    setStatus(searchStatus, "err", "Preencha os dados mínimos (Produto, Cor e Descrição) antes de imprimir.");
    return;
  }
  const qty = validatePrintQty({ report: true });
  if (!qty) return;
  inpQtdPrint.value = String(qty);
  buildPrintArea();
  window.print();
}

async function exportPdf() {
  if (!canPrintOrExport()) {
    setStatus(searchStatus, "err", "Preencha os dados mínimos (Produto, Cor e Descrição) antes de exportar.");
    return;
  }

  const qty = validatePrintQty({ report: true });
  if (!qty) return;
  inpQtdPrint.value = String(qty);

  if (!window.jspdf || !window.jspdf.jsPDF) {
    setStatus(importStatus, "warn", "Biblioteca de PDF não carregou. Use Imprimir e selecione “Salvar em PDF”.");
    printLabels();
    return;
  }

  if (!window.html2canvas) {
    setStatus(importStatus, "warn", "Biblioteca de renderização não carregou. Use Imprimir e selecione “Salvar em PDF”.");
    printLabels();
    return;
  }

  const { widthMm, heightMm } = getPrintSettings();
  const data = getCurrentLabelData();
  const stage = getOrCreatePdfStage(widthMm, heightMm);

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({
    orientation: widthMm >= heightMm ? "landscape" : "portrait",
    unit: "mm",
    format: [widthMm, heightMm],
    compress: true,
  });

  pdf.setProperties({
    title: `PACK ${normalizeKey(data.codigo)}-${normalizeKey(data.cor)}`,
    subject: "Etiqueta Pack",
    creator: "Gerador de Etiquetas Pack",
  });

  for (let i = 0; i < qty; i++) {
    if (i > 0) pdf.addPage([widthMm, heightMm], widthMm >= heightMm ? "landscape" : "portrait");

    stage.replaceChildren();
    const mount = document.createElement("div");
    renderLabelInto(mount, data, { idSuffix: `pdf-${i}-${uniqId("p")}`, forPrint: true, forPreview: false });
    stage.appendChild(mount.firstElementChild);

    if (document.fonts && typeof document.fonts.ready?.then === "function") {
      await document.fonts.ready;
    }
    await new Promise((r) => requestAnimationFrame(() => r()));

    const canvas = await window.html2canvas(stage.firstElementChild, {
      backgroundColor: "#ffffff",
      scale: 4,
      useCORS: true,
    });

    const imgData = canvas.toDataURL("image/png");
    pdf.addImage(imgData, "PNG", 0, 0, widthMm, heightMm, undefined, "FAST");
  }

  const filenameBase = `PACK_${normalizeKey(data.codigo)}-${normalizeKey(data.cor)}`.replace(/[^a-zA-Z0-9_-]+/g, "_");
  pdf.save(`${filenameBase}.pdf`);
}

function getOrCreatePdfStage(widthMm, heightMm) {
  let el = document.getElementById("pdfStage");
  if (!el) {
    el = document.createElement("div");
    el.id = "pdfStage";
    el.style.position = "fixed";
    el.style.left = "-200vw";
    el.style.top = "0";
    el.style.background = "#fff";
    el.style.zIndex = "-1";
    document.body.appendChild(el);
  }
  el.style.width = `${widthMm}mm`;
  el.style.height = `${heightMm}mm`;
  return el;
}

async function importCsvFile(file) {
  if (!file) return;
  const text = await file.text();
  const rows = parseCSV(text).filter((r) => r.some((c) => String(c ?? "").trim().length));
  if (rows.length < 2) {
    setStatus(importStatus, "err", "CSV vazio ou inválido.");
    return;
  }

  const header = rows[0].map((h) => normalizeKey(h));
  const idx = (name) => header.findIndex((h) => h === normalizeKey(name));
  const iEan = idx("EAN");
  const iCodigo = idx("CODIGO");
  const iDescricao = idx("DESCRICAO");
  const iCor = idx("COR");
  const iQtd = idx("QUANTIDADE");

  const fallback = { ean: 0, codigo: 1, descricao: 2, cor: 3, quantidade: 4 };
  const mapIndex = {
    ean: iEan >= 0 ? iEan : fallback.ean,
    codigo: iCodigo >= 0 ? iCodigo : fallback.codigo,
    descricao: iDescricao >= 0 ? iDescricao : fallback.descricao,
    cor: iCor >= 0 ? iCor : fallback.cor,
    quantidade: iQtd >= 0 ? iQtd : fallback.quantidade,
  };

  let inserted = 0;
  let updated = 0;

  for (const r of rows.slice(1)) {
    const p = {
      ean: String(r[mapIndex.ean] ?? "").trim(),
      codigo: String(r[mapIndex.codigo] ?? "").trim(),
      descricao: String(r[mapIndex.descricao] ?? "").trim(),
      cor: String(r[mapIndex.cor] ?? "").trim(),
      quantidade: String(r[mapIndex.quantidade] ?? "").trim(),
    };
    const codigo = normalizeKey(p.codigo);
    const cor = normalizeKey(p.cor);
    if (!codigo || !cor) continue;
    p.codigo = codigo;
    p.cor = cor;

    const k = buildProductKey(p.codigo, p.cor);
    const idxExisting = products.findIndex((x) => buildProductKey(x.codigo, x.cor) === k);
    if (idxExisting >= 0) {
      products[idxExisting] = p;
      updated++;
    } else {
      products.push(p);
      inserted++;
    }
  }

  saveProducts(products);
  renderProductsTable();
  setStatus(importStatus, "ok", `Importação concluída: ${inserted} inseridos, ${updated} atualizados.`);
}

async function syncProductsFromSheets() {
  try {
    const url = buildSheetsSyncUrl();
    if (!url) {
      setStatus(syncStatus, "muted", "Google Sheets: configure a URL do Web App para habilitar a sincronização.");
      return { skipped: true };
    }

    setStatus(syncStatus, "muted", "Google Sheets: sincronizando a aba Packs...");

    const payload = await fetchJsonWithTimeout(url, SHEETS_SYNC_CONFIG.timeoutMs);
    if (!payload || payload.ok === false) {
      throw new Error(payload?.error || "Resposta inválida do Google Sheets.");
    }

    const remoteProductsRaw = Array.isArray(payload.products)
      ? payload.products
      : Array.isArray(payload.rows)
        ? payload.rows
        : [];
    const remoteProducts = remoteProductsRaw.map((record) => normalizeProductRecord(record)).filter(Boolean);
    const merged = mergeProductsByKey(products, remoteProducts);

    if (merged.inserted || merged.updated) {
      products = merged.products;
      saveProducts(products);
      renderProductsTable();
      handleSearchApply();
      updatePreview();
    }

    const syncedAt = new Date().toISOString();
    saveSyncMeta({
      lastSuccessAt: syncedAt,
      sheetName: payload.sheetName || SHEETS_SYNC_CONFIG.defaultSheetName,
      rows: remoteProducts.length,
      inserted: merged.inserted,
      updated: merged.updated,
      unchanged: merged.unchanged,
    });

    const summary =
      merged.inserted || merged.updated
        ? `${merged.inserted} novos, ${merged.updated} atualizados`
        : "nenhuma novidade encontrada";
    setStatus(syncStatus, "ok", `Google Sheets: sincronização concluída (${summary}).`);
    return merged;
  } catch (error) {
    const lastSync = loadSyncMeta();
    const lastSyncSuffix = lastSync?.lastSuccessAt
      ? ` Última sincronização concluída em ${formatSyncDateTime(lastSync.lastSuccessAt)}.`
      : "";
    setStatus(syncStatus, "warn", `Google Sheets: não foi possível sincronizar agora; usando o cadastro local.${lastSyncSuffix}`);
    console.error("[sheets-sync]", error);
    return null;
  }
}

const btnPrint = document.getElementById("btnPrint");
const btnPdf = document.getElementById("btnPdf");

const inpCodigoBusca = document.getElementById("inpCodigoBusca");
const inpCorBusca = document.getElementById("inpCorBusca");
const searchStatus = document.getElementById("searchStatus");

const inpEan = document.getElementById("inpEan");
const inpQuantidade = document.getElementById("inpQuantidade");
const inpDescricao = document.getElementById("inpDescricao");
const inpDataHora = document.getElementById("inpDataHora");
const chkNow = document.getElementById("chkNow");

const btnSaveProduto = document.getElementById("btnSaveProduto");
const btnNovoProduto = document.getElementById("btnNovoProduto");
const inpCodigoCad = document.getElementById("inpCodigoCad");
const inpCorCad = document.getElementById("inpCorCad");
const inpDescricaoCad = document.getElementById("inpDescricaoCad");
const inpEanCad = document.getElementById("inpEanCad");
const inpQtdCad = document.getElementById("inpQtdCad");
const cadStatus = document.getElementById("cadStatus");

const fileCsv = document.getElementById("fileCsv");
const btnExportJson = document.getElementById("btnExportJson");
const importStatus = document.getElementById("importStatus");
const syncStatus = document.getElementById("syncStatus");

const inpQtdPrint = document.getElementById("inpQtdPrint");
const selTamanho = document.getElementById("selTamanho");
const inpWmm = document.getElementById("inpWmm");
const inpHmm = document.getElementById("inpHmm");

const previewMount = document.getElementById("previewMount");
const previewMeta = document.getElementById("previewMeta");
const previewStage = document.querySelector(".preview__stage");
const barcodeStatus = document.getElementById("barcodeStatus");

const inpFiltro = document.getElementById("inpFiltro");
const tbodyProdutos = document.getElementById("tbodyProdutos");

const printRoot = document.getElementById("printRoot");

let products = loadProducts();
const syncMeta = loadSyncMeta();

const saved = loadSettings();
if (saved?.size?.widthMm && saved?.size?.heightMm) {
  inpWmm.value = String(saved.size.widthMm);
  inpHmm.value = String(saved.size.heightMm);
  selTamanho.value = "custom";
}
inpQtdPrint.value = "";

updateSizeFromPreset();

inpDataHora.value = formatNow();
setStatus(cadStatus, "muted", "Cadastre produtos para facilitar a busca.");
setStatus(importStatus, "muted", "Importe um CSV ou exporte o cadastro atual.");
if (syncMeta?.lastSuccessAt) {
  setStatus(syncStatus, "muted", `Google Sheets: último sync em ${formatSyncDateTime(syncMeta.lastSuccessAt)}.`);
} else {
  setStatus(syncStatus, "muted", "Google Sheets: sincronização não configurada.");
}
renderProductsTable();
updatePreview();
void syncProductsFromSheets();

function setPanelOpen(sectionEl, open) {
  const titleEl = sectionEl.querySelector(":scope > .panel__title");
  const contentEl = sectionEl.querySelector(":scope > .panel__content");
  if (!(titleEl instanceof HTMLElement) || !(contentEl instanceof HTMLElement)) return;

  if (open) {
    sectionEl.classList.add("is-open");
    contentEl.style.maxHeight = `${contentEl.scrollHeight}px`;
    titleEl.setAttribute("aria-expanded", "true");
    contentEl.setAttribute("aria-hidden", "false");
    return;
  }

  const from = contentEl.scrollHeight;
  contentEl.style.maxHeight = `${from}px`;
  requestAnimationFrame(() => {
    sectionEl.classList.remove("is-open");
    contentEl.style.maxHeight = "0px";
    titleEl.setAttribute("aria-expanded", "false");
    contentEl.setAttribute("aria-hidden", "true");
  });
}

function syncOpenPanelHeights() {
  const openSections = document.querySelectorAll(".panel .panel__section.is-open");
  for (const sectionEl of openSections) {
    const contentEl = sectionEl.querySelector(":scope > .panel__content");
    if (!(contentEl instanceof HTMLElement)) continue;
    contentEl.style.maxHeight = `${contentEl.scrollHeight}px`;
  }
}

function initPanelsAccordion() {
  const sections = document.querySelectorAll(".panel .panel__section");
  let i = 0;
  for (const sectionEl of sections) {
    const titleEl = sectionEl.querySelector(":scope > .panel__title");
    const contentEl = sectionEl.querySelector(":scope > .panel__content");
    if (!(titleEl instanceof HTMLElement) || !(contentEl instanceof HTMLElement)) continue;

    i += 1;
    if (!titleEl.id) titleEl.id = `panel-title-${i}`;
    if (!contentEl.id) contentEl.id = `panel-content-${i}`;

    titleEl.setAttribute("aria-controls", contentEl.id);
    contentEl.setAttribute("aria-labelledby", titleEl.id);
    contentEl.setAttribute("role", "region");

    const open = sectionEl.classList.contains("is-open");
    sectionEl.classList.add("is-init");
    titleEl.setAttribute("aria-expanded", open ? "true" : "false");
    contentEl.setAttribute("aria-hidden", open ? "false" : "true");
    contentEl.style.maxHeight = open ? `${contentEl.scrollHeight}px` : "0px";
    requestAnimationFrame(() => sectionEl.classList.remove("is-init"));

    titleEl.addEventListener("click", () => {
      const nextOpen = !sectionEl.classList.contains("is-open");
      setPanelOpen(sectionEl, nextOpen);
    });
  }

  window.addEventListener("resize", () => syncOpenPanelHeights());
}

function runAccordionTests() {
  const sections = Array.from(document.querySelectorAll(".panel .panel__section"));
  const getTitle = (s) => String(s.querySelector(":scope > .panel__title")?.textContent ?? "").trim().toUpperCase();
  const byTitle = new Map(sections.map((s) => [getTitle(s), s]));

  const expectedOpen = new Set(["BUSCA", "DADOS DA ETIQUETA", "IMPRESSÃO"]);
  const failures = [];

  for (const s of sections) {
    const title = getTitle(s);
    const isOpen = s.classList.contains("is-open");
    const shouldOpen = expectedOpen.has(title);
    if (isOpen !== shouldOpen) failures.push(`Estado inicial inválido: ${title} (esperado ${shouldOpen ? "aberto" : "fechado"})`);
  }

  const cadastro = byTitle.get("CADASTRO DE PRODUTOS");
  if (cadastro) {
    const btn = cadastro.querySelector(":scope > .panel__title");
    if (btn instanceof HTMLElement) {
      const before = cadastro.classList.contains("is-open");
      btn.click();
      const after = cadastro.classList.contains("is-open");
      if (after === before) failures.push("Clique não alternou a seção CADASTRO DE PRODUTOS.");
      const aria = btn.getAttribute("aria-expanded");
      if (aria !== String(after)) failures.push("aria-expanded não está sincronizado após clique.");
      btn.click();
    }
  }

  if (failures.length) {
    console.error("[accordion-tests] FAIL", failures);
    alert(`Falha nos testes do acordeão:\n- ${failures.join("\n- ")}`);
  } else {
    console.log("[accordion-tests] OK");
  }
}

initPanelsAccordion();
if (new URLSearchParams(window.location.search).get("test") === "1") runAccordionTests();

function initEnterKeyNavigation(options = {}) {
  // Navegação automática por Enter:
  // - Ao pressionar Enter em um campo elegível, move o foco para o próximo campo na ordem do DOM.
  // - Se o campo estiver dentro de um <form>, mantém o envio padrão apenas no último campo elegível.
  // - Suporta DOM dinâmico via event delegation (recalcula a lista a cada keydown).
  // Opções:
  // - root: Document/HTMLElement para escutar eventos (padrão: document)
  // - scopeAttribute: atributo para limitar o escopo de navegação (padrão: data-enter-nav-scope)
  // - disabledAttribute: atributo para desativar a feature em um subtree (padrão: data-enter-nav-off="1")
  // - allowTextareaNewline: se true, Shift+Enter em textarea mantém quebra de linha (padrão: true)
  const root = options.root instanceof Document || options.root instanceof HTMLElement ? options.root : document;
  const scopeAttribute = typeof options.scopeAttribute === "string" ? options.scopeAttribute : "data-enter-nav-scope";
  const disabledAttribute = typeof options.disabledAttribute === "string" ? options.disabledAttribute : "data-enter-nav-off";
  const allowTextareaNewline = options.allowTextareaNewline !== false;

  const allowedInputTypes = new Set(["text", "number", "email", "password", "tel"]);
  const eligibleSelector =
    'input:not([type]),input[type="text"],input[type="number"],input[type="email"],input[type="password"],input[type="tel"],textarea,select';

  function isEligible(el) {
    // Filtra: input (text/number/email/password/tel), textarea e select.
    // Exclui: disabled, readonly, hidden/invisível, tabindex=-1 e subtree marcado como desativado.
    if (!(el instanceof HTMLElement)) return false;
    if (el.closest(`[${disabledAttribute}="1"]`)) return false;

    if (el instanceof HTMLInputElement) {
      const t = (el.getAttribute("type") ?? "text").toLowerCase();
      if (!allowedInputTypes.has(t)) return false;
      if (el.disabled || el.readOnly) return false;
    } else if (el instanceof HTMLTextAreaElement) {
      if (el.disabled || el.readOnly) return false;
    } else if (el instanceof HTMLSelectElement) {
      if (el.disabled) return false;
    } else {
      return false;
    }

    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const tabIndex = el.getAttribute("tabindex");
    if (tabIndex === "-1") return false;
    return true;
  }

  function getScopeContainer(target) {
    // Prioridade de escopo:
    // 1) ancestral com [data-enter-nav-scope] (ou atributo configurado)
    // 2) <form> ancestral
    // 3) documento inteiro
    if (!(target instanceof Element)) return document;
    const scoped = target.closest(`[${scopeAttribute}]`);
    if (scoped instanceof HTMLElement) return scoped;
    const form = target.closest("form");
    if (form instanceof HTMLFormElement) return form;
    return document;
  }

  function getEligibleFields(container) {
    // Reavalia a lista de campos na ordem natural do DOM (querySelectorAll preserva ordem).
    const base = container instanceof Document ? container : container;
    const nodes = Array.from(base.querySelectorAll(eligibleSelector));
    return nodes.filter((n) => isEligible(n));
  }

  function handleKeyDown(e) {
    // Detecta Enter via e.key e keyCode=13 para compatibilidade.
    if (e.defaultPrevented) return;
    if (e.isComposing) return;
    if (e.key !== "Enter" && e.keyCode !== 13) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;

    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (!isEligible(target)) return;

    if (allowTextareaNewline && target instanceof HTMLTextAreaElement && e.shiftKey) return;
    if (target.closest(`[${disabledAttribute}="1"]`)) return;

    const container = getScopeContainer(target);
    const fields = getEligibleFields(container);
    const idx = fields.indexOf(target);
    if (idx < 0) return;

    const isLast = idx === fields.length - 1;
    const inForm = container instanceof HTMLFormElement;

    if (!isLast) {
      e.preventDefault();
      const next = fields[idx + 1];
      if (next) next.focus();
      return;
    }

    if (!inForm) {
      // Fora de <form>, evita submit/reload acidental ao pressionar Enter no último campo.
      e.preventDefault();
    }
  }

  root.addEventListener("keydown", handleKeyDown, true);

  return () => root.removeEventListener("keydown", handleKeyDown, true);
}

function runEnterNavigationTests() {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-200vw";
  host.style.top = "0";
  host.setAttribute("data-enter-nav-scope", "1");

  host.innerHTML = `
    <input type="text" id="t1" value="" />
    <input type="text" id="t2" value="" disabled />
    <input type="text" id="t3" value="" />
    <textarea id="ta"></textarea>
    <select id="sel"><option value="1">1</option></select>
    <input type="text" id="t4" value="" readonly />
    <input type="text" id="t5" value="" />
  `;

  document.body.appendChild(host);
  const cleanup = initEnterKeyNavigation({ root: document, scopeAttribute: "data-enter-nav-scope" });

  const t1 = host.querySelector("#t1");
  const t3 = host.querySelector("#t3");
  const ta = host.querySelector("#ta");
  const sel = host.querySelector("#sel");
  const t5 = host.querySelector("#t5");

  const failures = [];
  if (!(t1 instanceof HTMLInputElement) || !(t3 instanceof HTMLInputElement) || !(ta instanceof HTMLTextAreaElement)) {
    failures.push("Elementos de teste não foram criados corretamente.");
  } else {
    t1.focus();
    t1.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
    if (document.activeElement !== t3) failures.push("Enter não pulou o campo disabled.");

    t3.focus();
    t3.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
    if (document.activeElement !== ta) failures.push("Enter não focou o próximo campo (textarea).");

    ta.focus();
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true, shiftKey: true }));
    if (document.activeElement !== ta) failures.push("Shift+Enter no textarea deveria manter o foco no textarea.");

    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
    if (document.activeElement !== sel) failures.push("Enter no textarea não focou o select.");

    sel.focus();
    sel.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
    if (document.activeElement !== t5) failures.push("Enter não pulou o campo readonly.");
  }

  cleanup();
  host.remove();

  if (failures.length) {
    console.error("[enter-nav-tests] FAIL", failures);
    alert(`Falha nos testes de Enter:\n- ${failures.join("\n- ")}`);
  } else {
    console.log("[enter-nav-tests] OK");
  }
}

initEnterKeyNavigation({ root: document });
if (new URLSearchParams(window.location.search).get("enterTest") === "1") runEnterNavigationTests();

function persistSettings() {
  const { widthMm, heightMm } = getPrintSettings();
  saveSettings({ size: { widthMm, heightMm } });
}

window.addEventListener("resize", () => fitPreviewToStage());

btnPrint.addEventListener("click", () => printLabels());
btnPdf.addEventListener("click", () => exportPdf());

btnSaveProduto.addEventListener("click", () => {
  upsertProductFromCadastro();
});

btnNovoProduto.addEventListener("click", () => {
  clearCadastroInputs();
  setStatus(cadStatus, "muted", "Novo produto: preencha e clique em Salvar / Atualizar.");
});

tbodyProdutos.addEventListener("click", (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  const act = target.getAttribute("data-act");
  const key = target.getAttribute("data-key");
  if (!act || !key) return;

  const idx = products.findIndex((p) => buildProductKey(p.codigo, p.cor) === key);
  if (idx < 0) return;

  if (act === "edit") {
    const p = products[idx];
    applyProductToCadastroInputs(p);
    inpCodigoBusca.value = p.codigo;
    inpCorBusca.value = p.cor;
    applyProductToLabelInputs(p);
    setStatus(cadStatus, "ok", "Edição carregada. Ajuste e clique em Salvar / Atualizar.");
    handleSearchApply();
    updatePreview();
  }

  if (act === "del") {
    const p = products[idx];
    const ok = window.confirm(`Excluir o produto ${p.codigo} | ${p.cor}?`);
    if (!ok) return;
    products.splice(idx, 1);
    saveProducts(products);
    renderProductsTable();
    setStatus(cadStatus, "ok", "Produto excluído.");
    handleSearchApply();
    updatePreview();
  }
});

inpFiltro.addEventListener("input", () => renderProductsTable());

fileCsv.addEventListener("change", async () => {
  try {
    await importCsvFile(fileCsv.files?.[0]);
  } catch {
    setStatus(importStatus, "err", "Falha ao importar CSV.");
  } finally {
    fileCsv.value = "";
  }
});

btnExportJson.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(products, null, 2)], { type: "application/json;charset=utf-8" });
  downloadBlob("cadastro-pack.json", blob);
  setStatus(importStatus, "ok", "Exportação iniciada.");
});

function hookLiveInputs(el) {
  el.addEventListener("input", () => updatePreview());
}

hookLiveInputs(inpCodigoBusca);
hookLiveInputs(inpCorBusca);
hookLiveInputs(inpEan);
hookLiveInputs(inpQuantidade);
hookLiveInputs(inpDescricao);
hookLiveInputs(inpDataHora);
chkNow.addEventListener("change", () => updatePreview());

inpCodigoBusca.addEventListener("input", () => {
  handleSearchApply();
});
inpCorBusca.addEventListener("input", () => {
  handleSearchApply();
});

selTamanho.addEventListener("change", () => {
  updateSizeFromPreset();
  persistSettings();
});
inpWmm.addEventListener("input", () => {
  selTamanho.value = "custom";
  updateSizeFromPreset();
  persistSettings();
});
inpHmm.addEventListener("input", () => {
  selTamanho.value = "custom";
  updateSizeFromPreset();
  persistSettings();
});
inpQtdPrint.addEventListener("input", () => {
  validatePrintQty({ report: false });
  persistSettings();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && chkNow.checked) updatePreview();
});

setInterval(() => {
  if (chkNow.checked) updatePreview();
}, 1000);

window.addEventListener("afterprint", () => {
  printRoot.replaceChildren();
});
