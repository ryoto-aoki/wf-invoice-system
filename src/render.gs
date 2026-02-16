function onOpen() {
  try {
    applyDocsStateFormatting_(SpreadsheetApp.getActiveSpreadsheet());
  } catch (e) {}

  SpreadsheetApp.getUi()
    .createMenu('帳票')
    .addItem('Web管理画面を開く', 'showWebAppLaunchDialog')
    .addItem('請求書作成UIを開く', 'openInvoiceSidebar')
    .addItem('帳票テンプレートを再生成', 'refreshAllTemplatesDesign')
    .addSeparator()
    .addItem('選択行の帳票PDFを生成', 'renderSelectedInvoiceFromDocs')
    .addItem('選択行を見積書へ変換', 'convertSelectedDocToQuote')
    .addItem('選択行を請求書へ変換', 'convertSelectedDocToInvoice')
    .addItem('選択行を納品書へ変換', 'convertSelectedDocToDelivery')
    .addSeparator()
    .addItem('テストデータ投入', 'seedTestDataManual')
    .addItem('スモークテスト実行', 'smokeTestManual')
    .addToUi();
}

function renderSelectedInvoiceFromDocs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    SpreadsheetApp.getUi().alert('スプレッドシートから実行してください。');
    return;
  }
  const sheet = ss.getActiveSheet();
  if (sheet.getName() !== SHEETS.DOCS) {
    SpreadsheetApp.getUi().alert('DOCSシートで対象行を選択してください。');
    return;
  }

  const row = sheet.getActiveRange().getRow();
  if (row <= 1) {
    SpreadsheetApp.getUi().alert('ヘッダ行ではなくデータ行を選択してください。');
    return;
  }

  const map = getHeaderMap_(sheet);
  if (!map.doc_id) {
    SpreadsheetApp.getUi().alert('DOCSシートのヘッダに doc_id 列がありません。');
    return;
  }
  const docId = String(sheet.getRange(row, map.doc_id).getValue() || '').trim();
  if (!docId) {
    SpreadsheetApp.getUi().alert('doc_id が空です。');
    return;
  }

  const check = validateSelectedDocForRender_(ss, docId);
  if (!check.ok) {
    SpreadsheetApp.getUi().alert('入力不足', check.message, SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }

  const preview = buildRenderPreview_(ss, docId);
  const confirm = SpreadsheetApp.getUi().alert(
    '生成前確認',
    [
      'doc_id: ' + docId,
      '帳票種別: ' + preview.docTypeLabel,
      'ファイル名: ' + preview.pdfName,
      '金額: ' + formatYen_(preview.payableTotal),
      '退避予定: ' + preview.oldCount + ' 件'
    ].join('\n'),
    SpreadsheetApp.getUi().ButtonSet.OK_CANCEL
  );
  if (confirm !== SpreadsheetApp.getUi().Button.OK) return;

  const result = renderPdfForDocId(docId);
  SpreadsheetApp.getUi().alert(
    'PDF生成完了',
    ['ファイル名: ' + result.pdfName, 'URL: ' + result.pdfUrl].join('\n'),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function validateSelectedDocForRender_(ss, docId) {
  const docsSheet = ss.getSheetByName(SHEETS.DOCS);
  const doc = getRowByKey_(docsSheet, 'doc_id', docId);
  if (!doc) return {ok: false, message: 'DOCS に対象行がありません。'};

  const type = getDocTypeCode_(doc.doc_type);
  const missing = [];
  if (!DOC_TYPES[type]) missing.push('doc_type');
  if (!String(doc.client_id || '').trim()) missing.push('client_id');
  if (!String(doc.title || '').trim()) missing.push('title');

  const lines = getRowsByKey_(ss.getSheetByName(SHEETS.LINES), 'doc_id', docId);
  if (!lines.length) missing.push('LINES（明細）');

  if (missing.length) {
    return {ok: false, message: '以下を入力してください:\n- ' + missing.join('\n- ')};
  }
  return {ok: true};
}

function buildRenderPreview_(ss, docId) {
  ensureSettingsExtendedColumns_(ss);
  const settings = getSingletonRow_(ss.getSheetByName(SHEETS.SETTINGS));
  const doc = getRowByKey_(ss.getSheetByName(SHEETS.DOCS), 'doc_id', docId);
  const client = getRowByKey_(ss.getSheetByName(SHEETS.CLIENTS), 'client_id', doc.client_id);
  const lines = getRowsByKey_(ss.getSheetByName(SHEETS.LINES), 'doc_id', docId);
  const calc = calculateTotals_(lines, doc, settings);
  const issueDate = toDate_(doc.issue_date) || new Date();
  const docType = getDocTypeCode_(doc.doc_type);
  const docCfg = getDocTypeConfig_(docType);

  const outputFolder = DriveApp.getFolderById(String(settings.output_folder_id || '').trim());
  const pdfName = buildPdfFileName_(issueDate, client.client_name_for_filename, calc.payableTotal, docType);

  let oldCount = 0;
  const it = outputFolder.getFilesByName(pdfName);
  while (it.hasNext()) {
    oldCount += 1;
    it.next();
  }

  return {
    pdfName: pdfName,
    docType: docType,
    docTypeLabel: docCfg.labelJa,
    payableTotal: calc.payableTotal,
    oldCount: oldCount
  };
}

function renderPdfForDocId(docId) {
  const ss = getWorkingSpreadsheet_();
  ensureSettingsExtendedColumns_(ss);
  const settings = getSingletonRow_(ss.getSheetByName(SHEETS.SETTINGS));

  const docsSheet = ss.getSheetByName(SHEETS.DOCS);
  const doc = getRowByKey_(docsSheet, 'doc_id', docId);
  if (!doc) throw new Error('DOCS.doc_id が見つかりません: ' + docId);

  const docType = getDocTypeCode_(doc.doc_type);
  const docCfg = getDocTypeConfig_(docType);

  const client = getRowByKey_(ss.getSheetByName(SHEETS.CLIENTS), 'client_id', doc.client_id);
  if (!client) throw new Error('CLIENTS.client_id が見つかりません: ' + doc.client_id);

  const lines = getRowsByKey_(ss.getSheetByName(SHEETS.LINES), 'doc_id', docId);
  if (!lines.length) throw new Error('LINES が0件です: ' + docId);

  const bank = selectBankRecord_(ss, doc, client, settings);
  const calc = calculateTotals_(lines, doc, settings);

  const templateKey = docCfg.templateKey || TEMPLATE_KEYS[DOC_TYPE_INVOICE];
  let templateId = String(settings[templateKey] || '').trim();
  if (!templateId) {
    templateId = String(settings[TEMPLATE_KEYS[DOC_TYPE_INVOICE]] || '').trim();
  }
  if (!templateId) throw new Error('SETTINGS のテンプレートIDが未設定です。');

  const templateFile = DriveApp.getFileById(templateId);
  const workDocFile = templateFile.makeCopy('tmp_' + docId + '_' + Date.now());

  const issueDate = toDate_(doc.issue_date) || new Date();
  const dueDate = toDate_(doc.due_date);

  renderDocTemplate_(workDocFile.getId(), {
    doc: doc,
    docType: docType,
    docCfg: docCfg,
    client: client,
    bank: bank,
    settings: settings,
    lines: lines,
    calc: calc,
    issueDate: issueDate,
    dueDate: dueDate
  });

  const outputFolderId = String(settings.output_folder_id || '').trim();
  if (!outputFolderId) throw new Error('SETTINGS.output_folder_id が未設定です。');
  const outputFolder = DriveApp.getFolderById(outputFolderId);

  const baseName = buildPdfFileName_(issueDate, client.client_name_for_filename, calc.payableTotal, docType);
  const renamedOld = archiveSameNameFiles_(outputFolder, baseName);

  const pdfFile = outputFolder.createFile(workDocFile.getBlob().getAs(MimeType.PDF).setName(baseName));
  const revisionNo = Number(doc.revision_no || 0) + 1;

  safeTrashFile_(workDocFile);
  updateDocsAfterRender_(docsSheet, doc.__rowIndex, {
    latest_pdf_file_id: pdfFile.getId(),
    latest_pdf_url: pdfFile.getUrl(),
    latest_pdf_name: baseName,
    revision_no: revisionNo,
    last_rendered_at: new Date(),
    total_payable: calc.payableTotal,
    total_invoice_amount: calc.invoiceTotal,
    total_info_only: calc.infoOnlyTotal,
    doc_state: 'ISSUED'
  });

  appendIssueLog_(ss.getSheetByName(SHEETS.ISSUE_LOG), {
    doc_id: docId,
    revision_no: revisionNo,
    action: 'RENDER_' + docType,
    pdf_file_id: pdfFile.getId(),
    pdf_name: baseName,
    pdf_url: pdfFile.getUrl(),
    old_pdf_renamed_to: renamedOld.join(', '),
    change_reason: String(doc.change_reason || '')
  });

  return {
    pdfFileId: pdfFile.getId(),
    pdfName: baseName,
    pdfUrl: pdfFile.getUrl(),
    archived: renamedOld,
    docId: docId,
    docType: docType
  };
}

function renderDocTemplate_(docId, ctx) {
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();
  body.clear();

  const recipient = [
    String(ctx.client.client_name || ''),
    String(ctx.client.honorific || '').trim()
  ].filter(Boolean).join(' ');

  const issuerName = String(ctx.settings.issuer_name || '');
  const issueDate = formatDate_(ctx.issueDate);
  const dueDate = ctx.dueDate ? formatDate_(ctx.dueDate) : '';

  const title = body.appendParagraph(ctx.docCfg.labelJa || '帳票');
  title.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  title.editAsText().setBold(true).setFontSize(24).setForegroundColor('#0f172a');

  body.appendParagraph('');

  const top = body.appendTable([
    [recipient || '宛名未設定', issuerName || '発行者未設定'],
    ['件名: ' + String(ctx.doc.title || ctx.docCfg.defaultTitle || ''), '番号: ' + String(ctx.doc.doc_id || '')],
    [String(ctx.docCfg.dueLabel || '期日') + ': ' + dueDate, '発行日: ' + issueDate],
    ['', '〒' + String(ctx.settings.issuer_postal || '') + ' ' + String(ctx.settings.issuer_address || '')],
    ['', 'TEL: ' + String(ctx.settings.issuer_tel || '')],
    ['', '登録番号: ' + String(ctx.settings.invoice_reg_no || '')]
  ]);
  styleTopTable_(top);

  body.appendParagraph('');

  const amountLabel = body.appendParagraph(ctx.docCfg.totalLabel || '金額');
  amountLabel.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  amountLabel.editAsText().setFontSize(11).setForegroundColor('#475569');

  const amountBox = body.appendTable([[formatYen_(ctx.calc.payableTotal)]]);
  styleAmountBox_(amountBox);

  body.appendParagraph('');

  const detailsTitle = body.appendParagraph('明細');
  detailsTitle.editAsText().setBold(true).setFontSize(12).setForegroundColor('#0f766e');

  const detailRows = buildLineRows_(ctx.lines);
  const detailsTable = body.appendTable(detailRows);
  styleDetailTable_(detailsTable);

  body.appendParagraph('');

  const summaryTable = body.appendTable(buildSummaryRows_(ctx.calc));
  styleSummaryTable_(summaryTable);

  const infoText = infoBlockText_(ctx.lines, ctx.doc);
  if (infoText) {
    body.appendParagraph('');
    const infoHeading = body.appendParagraph('参考情報');
    infoHeading.editAsText().setBold(true).setFontSize(11).setForegroundColor('#0f766e');
    const info = body.appendParagraph(infoText);
    info.editAsText().setFontSize(10).setForegroundColor('#0f172a');
  }

  const bankText = bankInfoText_(ctx.bank, ctx.doc);
  if (bankText) {
    body.appendParagraph('');
    const bankHeading = body.appendParagraph('お振込先');
    bankHeading.editAsText().setBold(true).setFontSize(11).setForegroundColor('#0f766e');
    const bank = body.appendParagraph(bankText);
    bank.editAsText().setFontSize(10).setForegroundColor('#0f172a');
  }

  const note = String(ctx.doc.note || ctx.client.default_doc_note || '').trim();
  if (note) {
    body.appendParagraph('');
    const noteHeading = body.appendParagraph('備考');
    noteHeading.editAsText().setBold(true).setFontSize(11).setForegroundColor('#0f766e');
    const noteBody = body.appendParagraph(note);
    noteBody.editAsText().setFontSize(10).setForegroundColor('#0f172a');
  }

  const sealEnabled = toBoolean_(ctx.doc.seal_enabled, toBoolean_(ctx.settings.seal_enabled_default, true));
  const sealId = String(ctx.settings.seal_image_file_id || '').trim();
  if (sealEnabled && sealId) {
    body.appendParagraph('');
    const marker = body.appendParagraph('{{SEAL_IMAGE}}');
    marker.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
    insertSealImage_(body, sealId, Number(ctx.settings.seal_size_px || 96));
  }

  doc.saveAndClose();
}

function buildLineRows_(lines) {
  const rows = [[
    'No', '品目', '内容', '数量', '単位', '単価', '金額', '税区分'
  ]];

  const filtered = lines
    .filter(function(line) { return String(line.line_role || '').toUpperCase() !== 'INFO_ONLY'; })
    .sort(function(a, b) { return Number(a.line_no || 0) - Number(b.line_no || 0); });

  filtered.forEach(function(line) {
    rows.push([
      String(Number(line.line_no || 0) || ''),
      String(line.item_name || ''),
      String(line.description || ''),
      String(Number(line.qty || 0) || ''),
      String(line.unit || ''),
      formatNumberWithComma_(Number(line.unit_price || 0)),
      formatNumberWithComma_(getLineAmount_(line)),
      normalizeTaxLabel_(line.tax_category)
    ]);
  });

  if (rows.length === 1) {
    rows.push(['', '明細なし', '', '', '', '', '', '']);
  }

  return rows;
}

function buildSummaryRows_(calc) {
  const r10 = calc.taxByRate[10] || {base: 0, tax: 0, total: 0};
  const r8 = calc.taxByRate[8] || {base: 0, tax: 0, total: 0};
  const taxTotal = Number(r10.tax || 0) + Number(r8.tax || 0);
  const subtotal = Number(calc.invoiceTotal || 0) - taxTotal;

  return [
    ['小計', formatYen_(subtotal)],
    ['消費税(10%)', formatYen_(r10.tax)],
    ['消費税(8%)', formatYen_(r8.tax)],
    ['消費税計', formatYen_(taxTotal)],
    ['お支払金額', formatYen_(calc.payableTotal)]
  ];
}

function normalizeTaxLabel_(category) {
  const c = String(category || '').toUpperCase();
  if (c === 'TAX_10') return '10%';
  if (c === 'TAX_8') return '8%';
  return '非課税';
}

function styleTopTable_(table) {
  for (var r = 0; r < table.getNumRows(); r += 1) {
    for (var c = 0; c < table.getRow(r).getNumCells(); c += 1) {
      var cell = table.getRow(r).getCell(c);
      var text = cell.editAsText();
      text.setFontSize(10).setForegroundColor('#0f172a');
      if (r === 0) {
        text.setBold(true).setFontSize(12);
      }
      if (c === 1) {
        setTableCellParagraphAlignment_(cell, DocumentApp.HorizontalAlignment.RIGHT);
      }
      if (r >= 3 && c === 0) {
        text.setForegroundColor('#ffffff');
      }
    }
  }
}

function styleAmountBox_(table) {
  var cell = table.getRow(0).getCell(0);
  var text = cell.editAsText();
  text.setBold(true).setFontSize(22).setForegroundColor('#111827');
  setTableCellParagraphAlignment_(cell, DocumentApp.HorizontalAlignment.CENTER);
}

function styleDetailTable_(table) {
  for (var r = 0; r < table.getNumRows(); r += 1) {
    for (var c = 0; c < table.getRow(r).getNumCells(); c += 1) {
      var cell = table.getRow(r).getCell(c);
      var text = cell.editAsText();
      text.setFontSize(9);
      if (r === 0) {
        text.setBold(true).setForegroundColor('#334155');
      } else {
        text.setBold(false).setForegroundColor('#0f172a');
      }
      if (c === 3 || c === 5 || c === 6) {
        setTableCellParagraphAlignment_(cell, DocumentApp.HorizontalAlignment.RIGHT);
      }
      if (c === 0 || c === 4 || c === 7) {
        setTableCellParagraphAlignment_(cell, DocumentApp.HorizontalAlignment.CENTER);
      }
    }
  }
}

function styleSummaryTable_(table) {
  for (var r = 0; r < table.getNumRows(); r += 1) {
    var labelCell = table.getRow(r).getCell(0);
    var valCell = table.getRow(r).getCell(1);
    labelCell.editAsText().setFontSize(10).setForegroundColor('#334155');
    valCell.editAsText().setFontSize(10).setForegroundColor('#111827');
    setTableCellParagraphAlignment_(valCell, DocumentApp.HorizontalAlignment.RIGHT);

    if (r === table.getNumRows() - 1) {
      labelCell.editAsText().setBold(true).setFontSize(11);
      valCell.editAsText().setBold(true).setFontSize(13);
    }
  }
}

function setTableCellParagraphAlignment_(cell, align) {
  for (var i = 0; i < cell.getNumChildren(); i += 1) {
    var child = cell.getChild(i);
    if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
      child.asParagraph().setAlignment(align);
    }
  }
}

function insertSealImage_(body, fileId, sizePx) {
  const found = body.findText('{{SEAL_IMAGE}}');
  if (!found) return;

  try {
    const blob = DriveApp.getFileById(fileId).getBlob();
    const text = found.getElement().asText();
    text.deleteText(found.getStartOffset(), found.getEndOffsetInclusive());
    const image = text.getParent().asParagraph().appendInlineImage(blob);
    if (sizePx > 0) {
      image.setWidth(sizePx);
      image.setHeight(sizePx);
    }
  } catch (e) {
    body.replaceText(escapeRegex_('{{SEAL_IMAGE}}'), '');
  }
}

function convertSelectedDocToQuote() {
  return convertSelectedDocToType_('QUOTE');
}

function convertSelectedDocToInvoice() {
  return convertSelectedDocToType_('INVOICE');
}

function convertSelectedDocToDelivery() {
  return convertSelectedDocToType_('DELIVERY_NOTE');
}

function convertSelectedDocToType_(targetType) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return;
  const sheet = ss.getActiveSheet();
  if (sheet.getName() !== SHEETS.DOCS) {
    SpreadsheetApp.getUi().alert('DOCSシートで対象行を選択してください。');
    return;
  }
  const map = getHeaderMap_(sheet);
  const row = sheet.getActiveRange().getRow();
  if (row <= 1) {
    SpreadsheetApp.getUi().alert('ヘッダ行ではなくデータ行を選択してください。');
    return;
  }
  const sourceDocId = String(sheet.getRange(row, map.doc_id).getValue() || '').trim();
  if (!sourceDocId) {
    SpreadsheetApp.getUi().alert('doc_id が空です。');
    return;
  }

  const res = convertDocToType_(sourceDocId, targetType, false);
  SpreadsheetApp.getUi().alert('変換完了', '新しいdoc_id: ' + res.new_doc_id, SpreadsheetApp.getUi().ButtonSet.OK);
  return res;
}

function convertDocToType_(sourceDocId, targetType, renderNow) {
  const ss = getWorkingSpreadsheet_();
  const docsSheet = ss.getSheetByName(SHEETS.DOCS);
  const linesSheet = ss.getSheetByName(SHEETS.LINES);

  const sourceDoc = getRowByKey_(docsSheet, 'doc_id', sourceDocId);
  if (!sourceDoc) throw new Error('変換元doc_idが見つかりません: ' + sourceDocId);

  const sourceLines = getRowsByKey_(linesSheet, 'doc_id', sourceDocId).sort(function(a, b) {
    return Number(a.line_no || 0) - Number(b.line_no || 0);
  });
  if (!sourceLines.length) throw new Error('変換元の明細がありません。');

  const newType = getDocTypeCode_(targetType);
  const newDocId = nextDocIdForType_(docsSheet, newType);
  const docsMap = getHeaderMap_(docsSheet);
  const linesMap = getHeaderMap_(linesSheet);

  const newDocRow = new Array(docsSheet.getLastColumn()).fill('');
  newDocRow[docsMap.doc_id - 1] = newDocId;
  newDocRow[docsMap.doc_type - 1] = newType;
  newDocRow[docsMap.client_id - 1] = sourceDoc.client_id;
  newDocRow[docsMap.issue_date - 1] = new Date();
  newDocRow[docsMap.due_date - 1] = toDate_(sourceDoc.due_date) || new Date();
  newDocRow[docsMap.title - 1] = sourceDoc.title || getDocTypeConfig_(newType).defaultTitle;
  newDocRow[docsMap.note - 1] = sourceDoc.note;
  newDocRow[docsMap.price_mode - 1] = sourceDoc.price_mode || 'EXCL';
  newDocRow[docsMap.rounding_mode - 1] = sourceDoc.rounding_mode || 'ROUND';
  newDocRow[docsMap.bank_id - 1] = sourceDoc.bank_id;
  newDocRow[docsMap.show_bank_info - 1] = sourceDoc.show_bank_info || 'TRUE';
  newDocRow[docsMap.seal_enabled - 1] = sourceDoc.seal_enabled || 'TRUE';
  newDocRow[docsMap.info_block_enabled - 1] = sourceDoc.info_block_enabled || 'TRUE';
  newDocRow[docsMap.doc_state - 1] = 'DRAFT';
  newDocRow[docsMap.change_reason - 1] = 'converted from ' + sourceDocId;
  newDocRow[docsMap.revision_no - 1] = 0;
  docsSheet.appendRow(newDocRow);

  sourceLines.forEach(function(line, idx) {
    const lineRow = new Array(linesSheet.getLastColumn()).fill('');
    lineRow[linesMap.line_id - 1] = newDocId + '-L' + pad2_(idx + 1);
    lineRow[linesMap.doc_id - 1] = newDocId;
    lineRow[linesMap.line_no - 1] = idx + 1;
    lineRow[linesMap.item_name - 1] = line.item_name;
    lineRow[linesMap.description - 1] = line.description;
    lineRow[linesMap.qty - 1] = line.qty;
    lineRow[linesMap.unit - 1] = line.unit;
    lineRow[linesMap.unit_price - 1] = line.unit_price;
    lineRow[linesMap.amount - 1] = line.amount;
    lineRow[linesMap.line_role - 1] = line.line_role;
    lineRow[linesMap.tax_category - 1] = line.tax_category;
    linesSheet.appendRow(lineRow);
  });

  if (renderNow) {
    const renderRes = renderPdfForDocId(newDocId);
    return {new_doc_id: newDocId, doc_type: newType, rendered: true, pdf_url: renderRes.pdfUrl};
  }

  return {new_doc_id: newDocId, doc_type: newType, rendered: false};
}

function nextDocIdForType_(docsSheet, docType) {
  const prefix = 'D' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd') + '-';
  const map = getHeaderMap_(docsSheet);
  const lastRow = docsSheet.getLastRow();
  if (lastRow < 2) return prefix + '0001';

  const values = docsSheet.getRange(2, 1, lastRow - 1, docsSheet.getLastColumn()).getValues();
  let maxNo = 0;
  values.forEach(function(row) {
    const id = String(row[map.doc_id - 1] || '');
    if (id.indexOf(prefix) !== 0) return;
    const n = Number(id.slice(prefix.length));
    if (!isNaN(n) && n > maxNo) maxNo = n;
  });

  return prefix + ('000' + (maxNo + 1)).slice(-4);
}
