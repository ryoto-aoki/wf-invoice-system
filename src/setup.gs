function setup() {
  const timezone = Session.getScriptTimeZone() || 'Asia/Tokyo';
  const stamp = Utilities.formatDate(new Date(), timezone, 'yyyyMMdd_HHmmss');
  const ss = SpreadsheetApp.create('wf-invoice-system_' + stamp);

  initializeSheets_(ss);
  applyValidations_(ss);
  applyDocsStateFormatting_(ss);

  const root = DriveApp.getRootFolder();
  const templateFolder = root.createFolder('wf-invoice-system_templates_' + stamp);
  const outputFolder = root.createFolder('wf-invoice-system_output_' + stamp);
  const templates = createAllTemplateDocs_(templateFolder, stamp);

  writeInitialSettings_(ss, {
    timezone: timezone,
    outputFolderId: outputFolder.getId(),
    templateFolderId: templateFolder.getId(),
    templates: templates
  });

  ScriptApp.newTrigger('onOpen').forSpreadsheet(ss).onOpen().create();
  PropertiesService.getScriptProperties().setProperty('WF_SPREADSHEET_ID', ss.getId());

  return {
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    outputFolderId: outputFolder.getId(),
    templateFolderId: templateFolder.getId(),
    templates: templates
  };
}

function initializeSheets_(ss) {
  const first = ss.getSheets()[0];
  first.setName(SHEETS.SETTINGS);

  Object.keys(SHEETS).forEach(function(key) {
    const name = SHEETS[key];
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    sheet.clear();
    const headers = HEADERS[name];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  });
}

function applyValidations_(ss) {
  const docs = ss.getSheetByName(SHEETS.DOCS);
  const lines = ss.getSheetByName(SHEETS.LINES);

  setValidationByHeader_(docs, 'doc_type', Object.keys(DOC_TYPES));
  setValidationByHeader_(docs, 'price_mode', ['EXCL', 'INCL']);
  setValidationByHeader_(docs, 'rounding_mode', ['FLOOR', 'ROUND', 'CEIL']);
  setValidationByHeader_(docs, 'show_bank_info', ['TRUE', 'FALSE']);
  setValidationByHeader_(docs, 'seal_enabled', ['TRUE', 'FALSE']);
  setValidationByHeader_(docs, 'info_block_enabled', ['TRUE', 'FALSE']);

  setValidationByHeader_(lines, 'line_role', ['NORMAL', 'INFO_ONLY']);
  setValidationByHeader_(lines, 'tax_category', ['TAX_10', 'TAX_8', 'NON_TAX']);
}

function applyDocsStateFormatting_(ss) {
  const docs = ss.getSheetByName(SHEETS.DOCS);
  const map = getHeaderMap_(docs);
  if (!map.doc_state) return;

  const maxRows = Math.max(docs.getMaxRows() - 1, 1);
  const maxCols = docs.getLastColumn();
  const target = docs.getRange(2, 1, maxRows, maxCols);
  const colLetter = columnToLetter_(map.doc_state);

  const rules = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$' + colLetter + '2="DRAFT"')
      .setBackground('#f8fafc')
      .setRanges([target])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$' + colLetter + '2="READY"')
      .setBackground('#fff7ed')
      .setRanges([target])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$' + colLetter + '2="ISSUED"')
      .setBackground('#ecfdf3')
      .setRanges([target])
      .build()
  ];

  docs.setConditionalFormatRules(rules);
}

function columnToLetter_(n) {
  let s = '';
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function writeInitialSettings_(ss, cfg) {
  const sheet = ss.getSheetByName(SHEETS.SETTINGS);
  const map = getHeaderMap_(sheet);
  const row = new Array(sheet.getLastColumn()).fill('');

  row[map.settings_id - 1] = 'SETTINGS_1';
  row[map.default_price_mode - 1] = 'EXCL';
  row[map.default_rounding_mode - 1] = 'ROUND';
  row[map.default_payment_terms_days - 1] = 30;
  row[map.seal_image_file_id - 1] = '';
  row[map.seal_enabled_default - 1] = 'TRUE';
  row[map.seal_size_px - 1] = 96;
  row[map.output_folder_id - 1] = cfg.outputFolderId;
  row[map.template_folder_id - 1] = cfg.templateFolderId;
  row[map.timezone - 1] = cfg.timezone;

  Object.keys(DOC_TYPES).forEach(function(type) {
    const key = DOC_TYPES[type].templateKey;
    if (!map[key]) return;
    row[map[key] - 1] = cfg.templates[type];
  });

  sheet.getRange(2, 1, 1, row.length).setValues([row]);
}

function createAllTemplateDocs_(templateFolder, stamp) {
  const out = {};
  Object.keys(DOC_TYPES).forEach(function(type) {
    out[type] = createTemplateDocForType_(templateFolder, stamp, type).getId();
  });
  return out;
}

function createTemplateDocForType_(templateFolder, stamp, docType) {
  const cfg = getDocTypeConfig_(docType);
  const file = DocumentApp.create(cfg.labelJa + '_Template_' + stamp);
  const doc = DocumentApp.openById(file.getId());
  const body = doc.getBody();

  body.clear();
  body.appendParagraph('{{DOC_TITLE}}').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('No: {{DOC_NO}}');
  body.appendParagraph('発行日: {{ISSUE_DATE}}');
  body.appendParagraph(cfg.dueLabel + ': {{DUE_DATE}}');
  body.appendParagraph('宛先: {{CLIENT_DISPLAY_NAME}}');
  body.appendParagraph('件名: {{SUBJECT}}');
  body.appendParagraph('{{LINES_TABLE}}');
  body.appendParagraph('{{TAX_SUMMARY}}');
  body.appendParagraph('{{INFO_BLOCK}}');
  body.appendParagraph('{{BANK_INFO}}');
  body.appendParagraph('{{ISSUER_NAME}}');
  body.appendParagraph('〒{{ISSUER_POSTAL}} {{ISSUER_ADDRESS}}');
  body.appendParagraph('TEL: {{ISSUER_TEL}}');
  body.appendParagraph('適格請求書発行事業者番号: {{INVOICE_REG_NO}}');
  body.appendParagraph(cfg.totalLabel + ': {{TOTAL_PAYABLE}}');
  body.appendParagraph('備考: {{NOTE}}');
  body.appendParagraph('{{SEAL_IMAGE}}');

  doc.saveAndClose();

  const moved = DriveApp.getFileById(file.getId());
  templateFolder.addFile(moved);
  DriveApp.getRootFolder().removeFile(moved);
  return moved;
}

// Editor-friendly wrappers (placed in setup.gs so they appear with setup).
function seedTestDataManual() {
  return seedTestData_();
}

function smokeTestManual() {
  return smokeTest_();
}

function refreshAllTemplatesDesign() {
  const ss = getWorkingSpreadsheet_();
  ensureSettingsExtendedColumns_(ss);
  const settingsSheet = ss.getSheetByName(SHEETS.SETTINGS);
  const map = getHeaderMap_(settingsSheet);
  const settings = getSingletonRow_(settingsSheet);

  let templateFolderId = String(settings.template_folder_id || '').trim();
  let templateFolder;
  if (templateFolderId) {
    templateFolder = DriveApp.getFolderById(templateFolderId);
  } else {
    templateFolder = DriveApp.getRootFolder().createFolder('wf-invoice-system_templates_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss'));
    settingsSheet.getRange(2, map.template_folder_id).setValue(templateFolder.getId());
    templateFolderId = templateFolder.getId();
  }

  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  const out = {};
  Object.keys(DOC_TYPES).forEach(function(type) {
    const docFile = createTemplateDocForType_(templateFolder, stamp, type);
    out[type] = docFile.getId();
    const key = DOC_TYPES[type].templateKey;
    if (map[key]) settingsSheet.getRange(2, map[key]).setValue(docFile.getId());
  });

  return {
    template_folder_id: templateFolderId,
    templates: out
  };
}

function refreshInvoiceTemplateDesign() {
  return refreshAllTemplatesDesign();
}
