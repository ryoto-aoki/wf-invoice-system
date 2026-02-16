function getWorkingSpreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const id = PropertiesService.getScriptProperties().getProperty('WF_SPREADSHEET_ID');
  if (!id) throw new Error('対象スプレッドシート未設定です。先に setup() を実行してください。');
  return SpreadsheetApp.openById(id);
}

function getHeaderMap_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach(function(h, i) { map[String(h).trim()] = i + 1; });
  return map;
}

function setValidationByHeader_(sheet, headerName, values) {
  const map = getHeaderMap_(sheet);
  if (!map[headerName]) return;
  const range = sheet.getRange(2, map[headerName], Math.max(sheet.getMaxRows() - 1, 1), 1);
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(true).build();
  range.setDataValidation(rule);
}

function getSingletonRow_(sheet) {
  if (!sheet) throw new Error('対象シートが見つかりません。');
  if (sheet.getLastRow() < 2) throw new Error(sheet.getName() + ' の2行目が未設定です。');
  const map = getHeaderMap_(sheet);
  const row = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
  return rowToObject_(row, map);
}

function rowToObject_(row, map) {
  const obj = {};
  Object.keys(map).forEach(function(key) { obj[key] = row[map[key] - 1]; });
  return obj;
}

function getRowsByKey_(sheet, keyName, keyValue) {
  if (!sheet) throw new Error('対象シートが見つかりません。');
  const map = getHeaderMap_(sheet);
  const lastRow = sheet.getLastRow();
  if (!map[keyName] || lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const rows = [];
  values.forEach(function(row, i) {
    if (String(row[map[keyName] - 1] || '').trim() !== String(keyValue || '').trim()) return;
    const obj = rowToObject_(row, map);
    obj.__rowIndex = i + 2;
    rows.push(obj);
  });
  return rows;
}

function getRowByKey_(sheet, keyName, keyValue) {
  const rows = getRowsByKey_(sheet, keyName, keyValue);
  return rows.length ? rows[0] : null;
}

function selectBankRecord_(ss, doc, client, settings) {
  const bankId = String(doc.bank_id || client.preferred_bank_id || settings.default_bank_id || '').trim();
  if (!bankId) return null;
  return getRowByKey_(ss.getSheetByName(SHEETS.BANK_ACCOUNTS), 'bank_id', bankId);
}

function calculateTotals_(lines, doc, settings) {
  const priceMode = String(doc.price_mode || settings.default_price_mode || 'EXCL').toUpperCase();
  const roundingMode = String(doc.rounding_mode || settings.default_rounding_mode || 'ROUND').toUpperCase();

  const taxable = {10: 0, 8: 0};
  let nonTaxTotal = 0;
  let infoOnlyTotal = 0;

  lines.forEach(function(line) {
    const amount = getLineAmount_(line);
    if (String(line.line_role || '').toUpperCase() === 'INFO_ONLY') {
      infoOnlyTotal += amount;
      return;
    }
    const rate = taxRateFromCategory_(line.tax_category);
    if (rate) {
      taxable[rate] += amount;
      return;
    }
    nonTaxTotal += amount;
  });

  const taxByRate = {10: {base: 0, tax: 0, total: 0}, 8: {base: 0, tax: 0, total: 0}};
  let taxableWithTaxTotal = 0;

  [10, 8].forEach(function(rate) {
    const sum = taxable[rate] || 0;
    if (!sum) return;

    let base = 0;
    let tax = 0;
    if (priceMode === 'INCL') {
      tax = applyRounding_(sum * rate / (100 + rate), roundingMode);
      base = sum - tax;
    } else {
      base = sum;
      tax = applyRounding_(base * rate / 100, roundingMode);
    }

    taxByRate[rate] = {base: base, tax: tax, total: base + tax};
    taxableWithTaxTotal += base + tax;
  });

  const invoiceTotal = taxableWithTaxTotal + nonTaxTotal + infoOnlyTotal;
  return {
    taxByRate: taxByRate,
    nonTaxTotal: nonTaxTotal,
    infoOnlyTotal: infoOnlyTotal,
    invoiceTotal: invoiceTotal,
    payableTotal: invoiceTotal - infoOnlyTotal
  };
}

function updateDocsAfterRender_(sheet, rowIndex, patch) {
  const map = getHeaderMap_(sheet);
  Object.keys(patch).forEach(function(key) {
    if (!map[key]) return;
    sheet.getRange(rowIndex, map[key]).setValue(patch[key]);
  });
}

function appendIssueLog_(sheet, payload) {
  const map = getHeaderMap_(sheet);
  const row = new Array(sheet.getLastColumn()).fill('');
  row[map.log_id - 1] = 'LOG_' + Utilities.getUuid();
  row[map.doc_id - 1] = payload.doc_id;
  row[map.revision_no - 1] = payload.revision_no;
  row[map.action - 1] = payload.action;
  row[map.pdf_file_id - 1] = payload.pdf_file_id;
  row[map.pdf_name - 1] = payload.pdf_name;
  row[map.pdf_url - 1] = payload.pdf_url;
  row[map.old_pdf_renamed_to - 1] = payload.old_pdf_renamed_to;
  row[map.created_at - 1] = new Date();
  row[map.created_by - 1] = resolveActorEmail_();
  row[map.change_reason - 1] = payload.change_reason;
  sheet.appendRow(row);
}

function resolveActorEmail_() {
  try {
    const active = Session.getActiveUser().getEmail();
    if (active) return active;
  } catch (e) {
    // Missing userinfo.email scope or restricted execution context.
  }

  try {
    const effective = Session.getEffectiveUser().getEmail();
    if (effective) return effective;
  } catch (e) {
    // Ignore and fallback.
  }

  return 'unknown';
}

function buildPdfFileName_(issueDate, clientNameForFilename, payableTotal, docType) {
  const ymd = Utilities.formatDate(issueDate, Session.getScriptTimeZone(), 'yyyyMMdd');
  const client = String(clientNameForFilename || '').trim();
  if (!client) throw new Error('CLIENTS.client_name_for_filename が空です。');
  const cfg = getDocTypeConfig_(docType);
  return ymd + '_' + client + '_' + formatNumberWithComma_(payableTotal) + '_' + cfg.fileSuffixJa + '.pdf';
}


function archiveSameNameFiles_(folder, baseName) {
  const dot = baseName.lastIndexOf('.');
  const stem = dot >= 0 ? baseName.slice(0, dot) : baseName;
  const ext = dot >= 0 ? baseName.slice(dot) : '';

  const usedOldIndexes = collectUsedOldIndexes_(folder, stem, ext);
  const files = [];
  const it = folder.getFilesByName(baseName);
  while (it.hasNext()) files.push(it.next());

  const renamed = [];
  files.forEach(function(file) {
    const nextIndex = nextAvailableOldIndex_(usedOldIndexes);
    const newName = stem + '_OLD_' + pad2_(nextIndex) + ext;
    file.setName(newName);
    renamed.push(newName);
  });
  return renamed;
}

function collectUsedOldIndexes_(folder, stem, ext) {
  const used = {};
  const pattern = new RegExp('^' + escapeRegex_(stem) + '_OLD_(\\d{2,})' + escapeRegex_(ext) + '$');
  const it = folder.getFiles();
  while (it.hasNext()) {
    const name = it.next().getName();
    const match = name.match(pattern);
    if (!match) continue;
    used[Number(match[1])] = true;
  }
  return used;
}

function nextAvailableOldIndex_(used) {
  let i = 1;
  while (used[i]) i += 1;
  used[i] = true;
  return i;
}

function linesToTableText_(lines) {
  const rows = lines
    .filter(function(line) { return String(line.line_role || '').toUpperCase() !== 'INFO_ONLY'; })
    .sort(function(a, b) { return Number(a.line_no || 0) - Number(b.line_no || 0); });

  if (!rows.length) return '(明細なし)';

  const out = ['No | 品目 | 数量 | 単価 | 金額', '---|---|---:|---:|---:'];
  rows.forEach(function(line) {
    out.push([
      Number(line.line_no || 0),
      String(line.item_name || ''),
      Number(line.qty || 0),
      formatNumberWithComma_(Number(line.unit_price || 0)),
      formatNumberWithComma_(getLineAmount_(line))
    ].join(' | '));
  });
  return out.join('\n');
}

function taxSummaryText_(taxByRate) {
  const r10 = taxByRate[10] || {base: 0, tax: 0, total: 0};
  const r8 = taxByRate[8] || {base: 0, tax: 0, total: 0};
  return [
    '税率 | 課税対象 | 消費税 | 合計',
    '---|---:|---:|---:',
    '10% | ' + formatNumberWithComma_(r10.base) + ' | ' + formatNumberWithComma_(r10.tax) + ' | ' + formatNumberWithComma_(r10.total),
    '8% | ' + formatNumberWithComma_(r8.base) + ' | ' + formatNumberWithComma_(r8.tax) + ' | ' + formatNumberWithComma_(r8.total)
  ].join('\n');
}

function infoBlockText_(lines, doc) {
  if (!toBoolean_(doc.info_block_enabled, true)) return '';
  const rows = lines
    .filter(function(line) { return String(line.line_role || '').toUpperCase() === 'INFO_ONLY'; })
    .sort(function(a, b) { return Number(a.line_no || 0) - Number(b.line_no || 0); });

  if (!rows.length) return '';
  const out = ['[参考情報]'];
  rows.forEach(function(line) {
    out.push('- ' + String(line.item_name || '(項目)') + ': ' + formatNumberWithComma_(getLineAmount_(line)));
  });
  return out.join('\n');
}

function bankInfoText_(bank, doc) {
  if (!toBoolean_(doc.show_bank_info, true) || !bank) return '';
  return [
    'お振込先',
    String(bank.bank_name || ''),
    String(bank.branch_name || ''),
    String(bank.account_type || '') + ' ' + String(bank.account_no || ''),
    String(bank.account_name_kana || ''),
    String(bank.note || '')
  ].filter(Boolean).join('\n');
}

function getLineAmount_(line) {
  const amount = line.amount;
  if (amount !== '' && amount !== null && typeof amount !== 'undefined') return Number(amount) || 0;
  return Number(line.qty || 0) * Number(line.unit_price || 0);
}

function taxRateFromCategory_(category) {
  const c = String(category || '').toUpperCase();
  if (c === 'TAX_10') return 10;
  if (c === 'TAX_8') return 8;
  return 0;
}

function applyRounding_(value, mode) {
  if (mode === 'FLOOR') return Math.floor(value);
  if (mode === 'CEIL') return Math.ceil(value);
  return Math.round(value);
}

function formatDate_(dateValue) {
  return Utilities.formatDate(dateValue, Session.getScriptTimeZone(), 'yyyy/MM/dd');
}

function formatNumberWithComma_(n) {
  return Math.round(Number(n || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatYen_(n) {
  return '¥' + formatNumberWithComma_(n);
}

function toDate_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function toBoolean_(value, fallback) {
  if (value === true || value === false) return value;
  const s = String(value || '').toUpperCase();
  if (s === 'TRUE') return true;
  if (s === 'FALSE') return false;
  return Boolean(fallback);
}

function escapeRegex_(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeTrashFile_(file) {
  try {
    file.setTrashed(true);
  } catch (e) {}
}

function pad2_(n) {
  return ('0' + n).slice(-2);
}

function getDocTypeCode_(value) {
  const code = String(value || DOC_TYPE_INVOICE).trim().toUpperCase();
  return DOC_TYPES[code] ? code : DOC_TYPE_INVOICE;
}

function getDocTypeConfig_(value) {
  return DOC_TYPES[getDocTypeCode_(value)] || DOC_TYPES[DOC_TYPE_INVOICE];
}

function ensureSettingsExtendedColumns_(ss) {
  const sheet = ss.getSheetByName(SHEETS.SETTINGS);
  if (!sheet) return;
  ensureHeadersOnSheet_(sheet, HEADERS.SETTINGS);
  if (sheet.getLastRow() < 2) {
    sheet.appendRow(new Array(sheet.getLastColumn()).fill(''));
  }
}

function ensureHeadersOnSheet_(sheet, requiredHeaders) {
  const current = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(v) {
    return String(v || '').trim();
  });
  const missing = requiredHeaders.filter(function(h) { return current.indexOf(h) < 0; });
  if (!missing.length) return;

  const startCol = sheet.getLastColumn() + 1;
  sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
}
