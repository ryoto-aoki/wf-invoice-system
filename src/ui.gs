function openInvoiceSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('ui/invoice_form')
    .setTitle('帳票作成')
    .setWidth(420);
  SpreadsheetApp.getUi().showSidebar(html);
}

function getInvoiceUiBootstrap() {
  return getInvoiceUiBootstrap_();
}

function createAndRenderInvoiceFromUi(payload) {
  return createAndRenderDocFromUi_(payload);
}

function createAndRenderDocFromUi(payload) {
  return createAndRenderDocFromUi_(payload);
}

function getInvoiceUiBootstrap_() {
  const ss = getWorkingSpreadsheet_();
  ensureSettingsExtendedColumns_(ss);
  const settings = getSingletonRow_(ss.getSheetByName(SHEETS.SETTINGS));
  const clientsSheet = ss.getSheetByName(SHEETS.CLIENTS);
  const clients = getClientRowsForUi_(clientsSheet).map(function(c) {
    return {
      client_id: String(c.client_id || ''),
      name: String(c.client_name || ''),
      filename: String(c.client_name_for_filename || '')
    };
  }).filter(function(c) { return c.client_id; });

  const docTypes = Object.keys(DOC_TYPES).map(function(code) {
    return { code: code, label: DOC_TYPES[code].labelJa };
  });

  return {
    timezone: String(settings.timezone || Session.getScriptTimeZone()),
    default_price_mode: String(settings.default_price_mode || 'EXCL'),
    default_rounding_mode: String(settings.default_rounding_mode || 'ROUND'),
    default_payment_terms_days: Number(settings.default_payment_terms_days || 30),
    clients: clients,
    doc_types: docTypes
  };
}

function getClientRowsForUi_(sheet) {
  const all = getAllRowsAsObjects_(sheet);
  const active = all.filter(function(row) {
    const v = String(row.is_active || '').trim().toUpperCase();
    return v === '' || v === 'TRUE' || v === '1' || v === 'YES' || v === 'Y';
  });
  return active.length ? active : all;
}

function getAllRowsAsObjects_(sheet) {
  const map = getHeaderMap_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  return values.map(function(row, i) {
    const obj = rowToObject_(row, map);
    obj.__rowIndex = i + 2;
    return obj;
  }).filter(function(obj) {
    return String(obj.client_id || '').trim();
  });
}

function createAndRenderDocFromUi_(payload) {
  const ss = getWorkingSpreadsheet_();
  const docsSheet = ss.getSheetByName(SHEETS.DOCS);
  const linesSheet = ss.getSheetByName(SHEETS.LINES);
  const normalized = normalizeUiPayload_(payload);

  const issueDate = normalized.issue_date ? new Date(normalized.issue_date) : new Date();
  const dueDate = normalized.due_date ? new Date(normalized.due_date) : addDays_(issueDate, Number(normalized.payment_terms_days || 30));
  const docId = nextUiDocId_(docsSheet);

  upsertByKeyUi_(docsSheet, 'doc_id', docId, {
    doc_id: docId,
    doc_type: normalized.doc_type,
    client_id: normalized.client_id,
    issue_date: issueDate,
    due_date: dueDate,
    title: normalized.title,
    note: normalized.note,
    price_mode: normalized.price_mode,
    rounding_mode: normalized.rounding_mode,
    bank_id: '',
    show_bank_info: 'TRUE',
    seal_enabled: 'TRUE',
    info_block_enabled: 'TRUE',
    doc_state: 'READY',
    change_reason: 'created from UI',
    revision_no: 0
  });

  normalized.lines.forEach(function(line, idx) {
    const lineId = docId + '-L' + pad2_(idx + 1);
    upsertByKeyUi_(linesSheet, 'line_id', lineId, {
      line_id: lineId,
      doc_id: docId,
      line_no: idx + 1,
      item_name: line.item_name,
      description: line.description,
      qty: Number(line.qty || 0),
      unit: line.unit,
      unit_price: Number(line.unit_price || 0),
      amount: '',
      line_role: line.line_role,
      tax_category: line.tax_category
    });
  });

  const renderResult = renderPdfForDocId(docId);
  return {
    status: 'ok',
    docId: docId,
    docType: normalized.doc_type,
    pdfName: renderResult.pdfName,
    pdfUrl: renderResult.pdfUrl,
    pdfFileId: renderResult.pdfFileId
  };
}

function normalizeUiPayload_(payload) {
  const p = payload || {};
  const lines = (Array.isArray(p.lines) ? p.lines : []).map(function(line) {
    return {
      item_name: String(line.item_name || '').trim(),
      description: String(line.description || '').trim(),
      qty: Number(line.qty || 0),
      unit: String(line.unit || '').trim(),
      unit_price: Number(line.unit_price || 0),
      line_role: String(line.line_role || 'NORMAL').toUpperCase(),
      tax_category: String(line.tax_category || 'TAX_10').toUpperCase()
    };
  }).filter(function(line) {
    return line.item_name && (line.qty || line.unit_price);
  });

  const docType = getDocTypeCode_(p.doc_type || DOC_TYPE_INVOICE);
  if (!String(p.client_id || '').trim()) throw new Error('取引先を選択してください。');
  if (!String(p.title || '').trim()) throw new Error('件名を入力してください。');
  if (!lines.length) throw new Error('明細を1行以上入力してください。');

  return {
    doc_type: docType,
    client_id: String(p.client_id || '').trim(),
    issue_date: p.issue_date,
    due_date: p.due_date,
    payment_terms_days: Number(p.payment_terms_days || 30),
    title: String(p.title || '').trim(),
    note: String(p.note || '').trim(),
    price_mode: String(p.price_mode || 'EXCL').toUpperCase(),
    rounding_mode: String(p.rounding_mode || 'ROUND').toUpperCase(),
    lines: lines
  };
}

function nextUiDocId_(docsSheet) {
  const prefix = 'D' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd') + '-';
  const rows = getRowsByPrefixUi_(docsSheet, 'doc_id', prefix);
  let maxNo = 0;
  rows.forEach(function(row) {
    const num = Number(String(row.doc_id || '').slice(prefix.length));
    if (!isNaN(num) && num > maxNo) maxNo = num;
  });
  return prefix + pad4_(maxNo + 1);
}

function getRowsByPrefixUi_(sheet, keyName, prefix) {
  const map = getHeaderMap_(sheet);
  const lastRow = sheet.getLastRow();
  if (!map[keyName] || lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const rows = [];
  values.forEach(function(row, i) {
    const key = String(row[map[keyName] - 1] || '');
    if (key.indexOf(prefix) !== 0) return;
    const obj = rowToObject_(row, map);
    obj.__rowIndex = i + 2;
    rows.push(obj);
  });
  return rows;
}

function upsertByKeyUi_(sheet, keyName, keyValue, payload) {
  const map = getHeaderMap_(sheet);
  const found = getRowByKey_(sheet, keyName, keyValue);
  if (found && found.__rowIndex) {
    Object.keys(payload).forEach(function(key) {
      if (!map[key]) return;
      sheet.getRange(found.__rowIndex, map[key]).setValue(payload[key]);
    });
    return found.__rowIndex;
  }

  const row = new Array(sheet.getLastColumn()).fill('');
  Object.keys(payload).forEach(function(key) {
    if (!map[key]) return;
    row[map[key] - 1] = payload[key];
  });
  if (!row[map[keyName] - 1]) row[map[keyName] - 1] = keyValue;
  sheet.appendRow(row);
  return sheet.getLastRow();
}

function pad4_(n) {
  return ('000' + n).slice(-4);
}
