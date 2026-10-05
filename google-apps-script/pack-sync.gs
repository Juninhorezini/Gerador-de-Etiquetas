const PACK_SYNC_CONFIG = {
  spreadsheetId: "1CWw8zKMf1ww08gynis7qIAYFjaYJo3PYb8bghp35zYE",
  defaultSheetName: "Packs",
  fields: ["ean", "codigo", "descricao", "cor", "quantidade"],
};

function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const sheetName = String(params.sheet || PACK_SYNC_CONFIG.defaultSheetName).trim() || PACK_SYNC_CONFIG.defaultSheetName;
    const spreadsheet = SpreadsheetApp.openById(PACK_SYNC_CONFIG.spreadsheetId);
    const sheet = spreadsheet.getSheetByName(sheetName);

    if (!sheet) {
      return jsonResponse({
        ok: false,
        error: 'A aba "' + sheetName + '" nao foi encontrada.',
      });
    }

    const values = sheet.getDataRange().getDisplayValues();
    const products = sheetValuesToProducts(values);

    return jsonResponse({
      ok: true,
      spreadsheetId: PACK_SYNC_CONFIG.spreadsheetId,
      sheetName,
      rows: products.length,
      columns: PACK_SYNC_CONFIG.fields,
      generatedAt: new Date().toISOString(),
      products,
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error && error.message ? error.message : "Falha ao ler a planilha.",
    });
  }
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function sheetValuesToProducts(values) {
  if (!Array.isArray(values) || values.length === 0) return [];

  const header = values[0].map(normalizeHeaderName);
  const indexMap = buildIndexMap(header);
  const products = [];

  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex] || [];
    const product = {
      ean: getCellValue(row, indexMap.ean),
      codigo: normalizeKey(getCellValue(row, indexMap.codigo)),
      descricao: getCellValue(row, indexMap.descricao),
      cor: normalizeKey(getCellValue(row, indexMap.cor)),
      quantidade: getCellValue(row, indexMap.quantidade),
    };

    if (!product.codigo || !product.cor) continue;
    products.push(product);
  }

  return products;
}

function buildIndexMap(header) {
  const aliases = {
    ean: ["ean", "codigo_de_barras", "codigodebarras", "barcode"],
    codigo: ["codigo", "produto", "sku", "codigo_do_produto", "codigoproduto"],
    descricao: ["descricao", "descricao", "descricao_do_produto", "descricaodoproduto"],
    cor: ["cor"],
    quantidade: ["quantidade", "qtd", "pack"],
  };

  const fallback = {
    ean: 0,
    codigo: 1,
    descricao: 2,
    cor: 3,
    quantidade: 4,
  };

  const indexMap = {};
  Object.keys(aliases).forEach(function (field) {
    const idx = header.findIndex(function (name) {
      return aliases[field].indexOf(name) >= 0;
    });
    indexMap[field] = idx >= 0 ? idx : fallback[field];
  });
  return indexMap;
}

function getCellValue(row, index) {
  if (!Array.isArray(row) || index < 0 || index >= row.length) return "";
  return String(row[index] == null ? "" : row[index]).trim();
}

function normalizeHeaderName(value) {
  return String(value == null ? "" : value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeKey(value) {
  return String(value == null ? "" : value)
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}
