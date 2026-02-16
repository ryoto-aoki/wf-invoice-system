/**
 * Test-only helpers. Not required for production operation.
 * Called from local scripts via clasp run.
 */

function seedTestData_() {
  const ss = getWorkingSpreadsheet_();

  const settingsSheet = mustGetSheet_(ss, SHEETS.SETTINGS);
  const clientsSheet = mustGetSheet_(ss, SHEETS.CLIENTS);
  const banksSheet = mustGetSheet_(ss, SHEETS.BANK_ACCOUNTS);
  const docsSheet = mustGetSheet_(ss, SHEETS.DOCS);
  const linesSheet = mustGetSheet_(ss, SHEETS.LINES);

  // SETTINGS row 2 exists by setup(); only fill blank-ish defaults for testability.
  const settingsMap = getHeaderMap_(settingsSheet);
  const settingsRow = settingsSheet.getRange(2, 1, 1, settingsSheet.getLastColumn()).getValues()[0];
  setIfEmpty_(settingsRow, settingsMap, 'settings_id', 'SETTINGS_1');
  setIfEmpty_(settingsRow, settingsMap, 'issuer_name', '株式会社テスト商事');
  setIfEmpty_(settingsRow, settingsMap, 'issuer_postal', '100-0001');
  setIfEmpty_(settingsRow, settingsMap, 'issuer_address', '東京都千代田区1-1-1');
  setIfEmpty_(settingsRow, settingsMap, 'issuer_tel', '03-1234-5678');
  setIfEmpty_(settingsRow, settingsMap, 'invoice_reg_no', 'T1234567890123');
  setIfEmpty_(settingsRow, settingsMap, 'default_price_mode', 'EXCL');
  setIfEmpty_(settingsRow, settingsMap, 'default_rounding_mode', 'ROUND');
  setIfEmpty_(settingsRow, settingsMap, 'default_bank_id', 'BANK001');
  // Intentionally keep seal_image_file_id empty by default.
  settingsSheet.getRange(2, 1, 1, settingsRow.length).setValues([settingsRow]);

  upsertByKey_(clientsSheet, 'client_id', 'C001', {
    client_id: 'C001',
    client_name: 'ウィルフォワード株式会社',
    client_name_for_filename: 'ウィルフォワード',
    honorific: '御中',
    postal: '150-0002',
    address: '東京都渋谷区渋谷1-1-1',
    contact_person: '請求担当',
    email: 'billing@example.com',
    tel: '03-0000-0000',
    preferred_bank_id: '',
    default_doc_note: 'お振込期限までにご対応をお願いします。',
    is_active: 'TRUE'
  });

  upsertByKey_(banksSheet, 'bank_id', 'BANK001', {
    bank_id: 'BANK001',
    label: 'メイン口座',
    bank_name: 'みずほ銀行',
    branch_name: '東京中央支店',
    account_type: '普通',
    account_no: '1234567',
    account_name_kana: 'カ）テストショウジ',
    note: '',
    is_default: 'TRUE',
    is_active: 'TRUE'
  });

  upsertByKey_(docsSheet, 'doc_id', 'DOC-SEED-0001', {
    doc_id: 'DOC-SEED-0001',
    doc_type: 'INVOICE',
    client_id: 'C001',
    issue_date: new Date(),
    due_date: addDays_(new Date(), 30),
    title: 'テスト請求書（seed）',
    note: 'seedTestData_ による初期投入',
    price_mode: 'EXCL',
    rounding_mode: 'ROUND',
    bank_id: '',
    show_bank_info: 'TRUE',
    seal_enabled: 'TRUE',
    info_block_enabled: 'TRUE',
    doc_state: 'DRAFT',
    change_reason: 'seed',
    revision_no: 0
  });

  upsertByKey_(linesSheet, 'line_id', 'LINE-SEED-0001', {
    line_id: 'LINE-SEED-0001',
    doc_id: 'DOC-SEED-0001',
    line_no: 1,
    item_name: '開発作業費',
    description: '',
    qty: 1,
    unit: '式',
    unit_price: 100000,
    amount: '',
    line_role: 'NORMAL',
    tax_category: 'TAX_10'
  });

  upsertByKey_(linesSheet, 'line_id', 'LINE-SEED-0002', {
    line_id: 'LINE-SEED-0002',
    doc_id: 'DOC-SEED-0001',
    line_no: 2,
    item_name: '立替交通費',
    description: '',
    qty: 1,
    unit: '式',
    unit_price: 10000,
    amount: '',
    line_role: 'NORMAL',
    tax_category: 'NON_TAX'
  });

  upsertByKey_(linesSheet, 'line_id', 'LINE-SEED-0003', {
    line_id: 'LINE-SEED-0003',
    doc_id: 'DOC-SEED-0001',
    line_no: 3,
    item_name: '参考: 次月繰越',
    description: '',
    qty: 1,
    unit: '式',
    unit_price: 5000,
    amount: '',
    line_role: 'INFO_ONLY',
    tax_category: 'TAX_10'
  });

  const result = {
    status: 'ok',
    seededDocId: 'DOC-SEED-0001',
    message: 'seed data applied (idempotent upsert)'
  };
  Logger.log(JSON.stringify(result));
  return result;
}

function smokeTest_() {
  seedTestData_();

  const ss = getWorkingSpreadsheet_();
  const docsSheet = mustGetSheet_(ss, SHEETS.DOCS);
  const linesSheet = mustGetSheet_(ss, SHEETS.LINES);

  const docId = generateSmokeDocId_(docsSheet);
  upsertByKey_(docsSheet, 'doc_id', docId, {
    doc_id: docId,
    doc_type: 'INVOICE',
    client_id: 'C001',
    issue_date: new Date(),
    due_date: addDays_(new Date(), 14),
    title: 'スモークテスト請求書',
    note: 'smokeTest_ generated',
    price_mode: 'EXCL',
    rounding_mode: 'ROUND',
    bank_id: '',
    show_bank_info: 'TRUE',
    seal_enabled: 'TRUE',
    info_block_enabled: 'TRUE',
    doc_state: 'DRAFT',
    change_reason: 'smoke test',
    revision_no: 0
  });

  upsertByKey_(linesSheet, 'line_id', docId + '-L1', {
    line_id: docId + '-L1',
    doc_id: docId,
    line_no: 1,
    item_name: 'スモークテスト作業',
    description: '',
    qty: 1,
    unit: '式',
    unit_price: 50000,
    amount: '',
    line_role: 'NORMAL',
    tax_category: 'TAX_10'
  });

  const renderResult = renderPdfForDocId(docId);
  const renderedDoc = getRowByKey_(docsSheet, 'doc_id', docId);

  if (!renderResult.pdfFileId) throw new Error('smoke test failed: pdf file id is empty');
  if (!renderedDoc.latest_pdf_url) throw new Error('smoke test failed: DOCS.latest_pdf_url is empty');

  const result = {
    status: 'ok',
    docId: docId,
    pdfFileId: renderResult.pdfFileId,
    pdfName: renderResult.pdfName,
    pdfUrl: renderResult.pdfUrl,
    latestPdfUrlInDocs: renderedDoc.latest_pdf_url
  };
  Logger.log(JSON.stringify(result));
  return result;
}

function generateSmokeDocId_(docsSheet) {
  const prefix = 'D' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd') + '-';
  const rows = getRowsByPrefix_(docsSheet, 'doc_id', prefix);
  let maxNo = 0;
  rows.forEach(function(row) {
    const v = String(row.doc_id || '');
    const s = v.slice(prefix.length);
    const n = Number(s);
    if (!isNaN(n) && n > maxNo) maxNo = n;
  });
  return prefix + pad4_(maxNo + 1);
}

function getRowsByPrefix_(sheet, keyName, prefix) {
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

function upsertByKey_(sheet, keyName, keyValue, payload) {
  const map = getHeaderMap_(sheet);
  if (!map[keyName]) throw new Error(sheet.getName() + ' missing key column: ' + keyName);

  const found = getRowByKey_(sheet, keyName, keyValue);
  if (found && found.__rowIndex) {
    writeRowPatch_(sheet, found.__rowIndex, payload);
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

function writeRowPatch_(sheet, rowIndex, patch) {
  const map = getHeaderMap_(sheet);
  Object.keys(patch).forEach(function(key) {
    if (!map[key]) return;
    sheet.getRange(rowIndex, map[key]).setValue(patch[key]);
  });
}

function setIfEmpty_(row, map, key, value) {
  if (!map[key]) return;
  const idx = map[key] - 1;
  if (String(row[idx] || '').trim()) return;
  row[idx] = value;
}

function mustGetSheet_(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('sheet not found: ' + name + '. setup() を先に実行してください。');
  return sheet;
}

function addDays_(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function pad4_(n) {
  return ('000' + n).slice(-4);
}

// Visible wrappers for Apps Script editor run menu.
function seedTestData() {
  return seedTestData_();
}

function smokeTest() {
  return smokeTest_();
}
