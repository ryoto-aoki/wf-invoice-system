function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  const api = String(params.api || '').trim();

  if (api) {
    return handleApiGet_(api, params);
  }

  const view = String(params.view || 'app');
  const file = view === 'sidebar' ? 'ui/invoice_form' : 'ui/web_app';
  return HtmlService.createHtmlOutputFromFile(file)
    .setTitle('wf-invoice-system')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  const api = String(params.api || '').trim();
  if (!api) return jsonResponse_({ok: false, error: 'api parameter is required'});

  try {
    const payload = parseJsonBody_(e);
    const data = handleApiPost_(api, payload);
    return jsonResponse_({ok: true, data: data});
  } catch (err) {
    return jsonResponse_({ok: false, error: String(err && err.message ? err.message : err)});
  }
}

function handleApiGet_(api, params) {
  try {
    let data;
    if (api === 'health') {
      data = {status: 'ok', now: new Date().toISOString()};
    } else if (api === 'bootstrap') {
      data = getWebAppBootstrap();
    } else if (api === 'listDocs') {
      data = listDocsForWeb({
        limit: Number(params.limit || 200),
        doc_type: String(params.doc_type || ''),
        state: String(params.state || ''),
        client_id: String(params.client_id || '')
      });
    } else if (api === 'docDetail') {
      data = getDocDetailForWeb(String(params.doc_id || ''));
    } else {
      return jsonResponse_({ok: false, error: 'unknown api: ' + api});
    }

    return jsonResponse_({ok: true, data: data});
  } catch (err) {
    return jsonResponse_({ok: false, error: String(err && err.message ? err.message : err)});
  }
}

function handleApiPost_(api, payload) {
  if (api === 'createClient') return createClientForWeb(payload || {});
  if (api === 'createDoc') return createAndRenderDocFromUi(payload || {});
  if (api === 'convertDoc') return convertDocForWeb(payload || {});
  if (api === 'renderDoc') return renderInvoiceByDocIdForWeb(String((payload || {}).doc_id || ''));
  throw new Error('unknown api: ' + api);
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function parseJsonBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  const raw = String(e.postData.contents || '').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error('invalid JSON body');
  }
}

function getWebAppBootstrap() {
  const base = getInvoiceUiBootstrap_();
  const summary = getWebSummary_();
  return {
    timezone: base.timezone,
    clients: base.clients,
    doc_types: base.doc_types || [],
    defaults: {
      default_price_mode: base.default_price_mode,
      default_rounding_mode: base.default_rounding_mode,
      default_payment_terms_days: base.default_payment_terms_days
    },
    summary: summary,
    docs: listDocsForWeb({limit: 100})
  };
}

function listDocsForWeb(filters) {
  const ss = getWorkingSpreadsheet_();
  const docsSheet = ss.getSheetByName(SHEETS.DOCS);
  const clientsSheet = ss.getSheetByName(SHEETS.CLIENTS);
  const options = filters || {};

  const clientMap = buildClientNameMap_(clientsSheet);
  const map = getHeaderMap_(docsSheet);
  const lastRow = docsSheet.getLastRow();
  if (lastRow < 2) return [];

  const values = docsSheet.getRange(2, 1, lastRow - 1, docsSheet.getLastColumn()).getValues();
  const rows = values.map(function(row) {
    const doc = rowToObject_(row, map);
    return {
      doc_id: String(doc.doc_id || ''),
      doc_type: String(doc.doc_type || ''),
      client_id: String(doc.client_id || ''),
      client_name: clientMap[String(doc.client_id || '')] || String(doc.client_id || ''),
      issue_date: formatIsoDate_(doc.issue_date),
      due_date: formatIsoDate_(doc.due_date),
      title: String(doc.title || ''),
      doc_state: String(doc.doc_state || ''),
      total_payable: Number(doc.total_payable || 0),
      revision_no: Number(doc.revision_no || 0),
      latest_pdf_url: String(doc.latest_pdf_url || ''),
      latest_pdf_name: String(doc.latest_pdf_name || ''),
      last_rendered_at: formatIsoDateTime_(doc.last_rendered_at)
    };
  }).filter(function(doc) {
    if (!doc.doc_id) return false;
    if (options.doc_type && String(options.doc_type).toUpperCase() !== String(doc.doc_type).toUpperCase()) return false;
    if (options.client_id && String(options.client_id) !== doc.client_id) return false;
    if (options.state && String(options.state).toUpperCase() !== String(doc.doc_state).toUpperCase()) return false;
    return true;
  });

  rows.sort(function(a, b) {
    return String(b.doc_id).localeCompare(String(a.doc_id));
  });

  const limit = Number(options.limit || 100);
  return rows.slice(0, limit);
}

function renderInvoiceByDocIdForWeb(docId) {
  const value = String(docId || '').trim();
  if (!value) throw new Error('doc_id が未指定です。');
  return renderPdfForDocId(value);
}

function getDocDetailForWeb(docId) {
  const value = String(docId || '').trim();
  if (!value) throw new Error('doc_id が未指定です。');

  const ss = getWorkingSpreadsheet_();
  const doc = getRowByKey_(ss.getSheetByName(SHEETS.DOCS), 'doc_id', value);
  if (!doc) throw new Error('DOCS に該当doc_idがありません: ' + value);

  const client = getRowByKey_(ss.getSheetByName(SHEETS.CLIENTS), 'client_id', doc.client_id);
  const lines = getRowsByKey_(ss.getSheetByName(SHEETS.LINES), 'doc_id', value)
    .sort(function(a, b) { return Number(a.line_no || 0) - Number(b.line_no || 0); })
    .map(function(line) {
      return {
        line_no: Number(line.line_no || 0),
        item_name: String(line.item_name || ''),
        qty: Number(line.qty || 0),
        unit: String(line.unit || ''),
        unit_price: Number(line.unit_price || 0),
        amount: getLineAmount_(line),
        line_role: String(line.line_role || ''),
        tax_category: String(line.tax_category || '')
      };
    });

  return {
    doc: {
      doc_id: String(doc.doc_id || ''),
      doc_type: String(doc.doc_type || ''),
      client_id: String(doc.client_id || ''),
      client_name: client ? String(client.client_name || '') : '',
      issue_date: formatIsoDate_(doc.issue_date),
      due_date: formatIsoDate_(doc.due_date),
      title: String(doc.title || ''),
      note: String(doc.note || ''),
      price_mode: String(doc.price_mode || ''),
      rounding_mode: String(doc.rounding_mode || ''),
      doc_state: String(doc.doc_state || ''),
      revision_no: Number(doc.revision_no || 0),
      latest_pdf_url: String(doc.latest_pdf_url || ''),
      latest_pdf_name: String(doc.latest_pdf_name || ''),
      total_payable: Number(doc.total_payable || 0)
    },
    lines: lines
  };
}

function getWebSummary_() {
  const docs = listDocsForWeb({limit: 500});
  const issued = docs.filter(function(d) { return String(d.doc_state).toUpperCase() === 'ISSUED'; });
  const draft = docs.filter(function(d) { return String(d.doc_state).toUpperCase() !== 'ISSUED'; });

  return {
    invoice_count: docs.length,
    issued_count: issued.length,
    draft_count: draft.length,
    payable_total: docs.reduce(function(acc, d) { return acc + Number(d.total_payable || 0); }, 0)
  };
}

function buildClientNameMap_(clientsSheet) {
  const out = {};
  const map = getHeaderMap_(clientsSheet);
  const lastRow = clientsSheet.getLastRow();
  if (lastRow < 2) return out;

  const values = clientsSheet.getRange(2, 1, lastRow - 1, clientsSheet.getLastColumn()).getValues();
  values.forEach(function(row) {
    const obj = rowToObject_(row, map);
    const id = String(obj.client_id || '');
    if (!id) return;
    out[id] = String(obj.client_name || id);
  });
  return out;
}

function formatIsoDate_(value) {
  const d = toDate_(value);
  if (!d) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function formatIsoDateTime_(value) {
  const d = toDate_(value);
  if (!d) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function showWebAppLaunchDialog() {
  const ui = SpreadsheetApp.getUi();
  const url = ScriptApp.getService().getUrl();
  if (!url) {
    ui.alert(
      'Webアプリ未デプロイ',
      'Apps Scriptエディタで「デプロイ > 新しいデプロイ > ウェブアプリ」を実行後、再度このメニューを実行してください。',
      ui.ButtonSet.OK
    );
    return;
  }

  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;padding:12px">'
    + '<p style="margin-top:0">Web管理画面はこちらです。</p>'
    + '<p><a target="_blank" href="' + url + '">管理画面を開く</a></p>'
    + '<p style="color:#666;font-size:12px">※ 開けない場合はデプロイを最新版に更新してください。</p>'
    + '</div>'
  ).setWidth(360).setHeight(160);
  ui.showModalDialog(html, 'Web管理画面');
}

function createClientForWeb(payload) {
  const p = payload || {};
  const name = String(p.client_name || '').trim();
  if (!name) throw new Error('取引先名は必須です。');

  const ss = getWorkingSpreadsheet_();
  const clientsSheet = ss.getSheetByName(SHEETS.CLIENTS);
  const map = getHeaderMap_(clientsSheet);

  const clientId = String(p.client_id || '').trim() || nextClientIdForWeb_(clientsSheet);
  const exists = getRowByKey_(clientsSheet, 'client_id', clientId);
  if (exists) throw new Error('同じ client_id が既に存在します: ' + clientId);

  const honorific = String(p.honorific || '御中').trim();
  const filenameName = String(p.client_name_for_filename || '').trim() || normalizeClientNameForFilename_(name, honorific);

  const row = new Array(clientsSheet.getLastColumn()).fill('');
  row[map.client_id - 1] = clientId;
  row[map.client_name - 1] = name;
  row[map.client_name_for_filename - 1] = filenameName;
  row[map.honorific - 1] = honorific;
  row[map.postal - 1] = String(p.postal || '').trim();
  row[map.address - 1] = String(p.address || '').trim();
  row[map.contact_person - 1] = String(p.contact_person || '').trim();
  row[map.email - 1] = String(p.email || '').trim();
  row[map.tel - 1] = String(p.tel || '').trim();
  row[map.preferred_bank_id - 1] = String(p.preferred_bank_id || '').trim();
  row[map.default_doc_note - 1] = String(p.default_doc_note || '').trim();
  row[map.is_active - 1] = 'TRUE';

  clientsSheet.appendRow(row);
  return {
    client_id: clientId,
    client_name: name,
    client_name_for_filename: filenameName,
    honorific: honorific
  };
}

function nextClientIdForWeb_(sheet) {
  const map = getHeaderMap_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 'C001';

  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var maxNo = 0;
  values.forEach(function(row) {
    const id = String(row[map.client_id - 1] || '').trim();
    const m = id.match(/^C(\d+)$/i);
    if (!m) return;
    const n = Number(m[1]);
    if (!isNaN(n) && n > maxNo) maxNo = n;
  });
  return 'C' + ('000' + (maxNo + 1)).slice(-3);
}

function normalizeClientNameForFilename_(name, honorific) {
  return String(name || '')
    .replace(/株式会社/g, '')
    .replace(/\(株\)/g, '')
    .replace(/（株）/g, '')
    .replace(/㈱/g, '')
    .replace(new RegExp(escapeRegex_(String(honorific || '')), 'g'), '')
    .replace(/御中|様/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function convertDocForWeb(payload) {
  const p = payload || {};
  const sourceDocId = String(p.source_doc_id || '').trim();
  const targetType = getDocTypeCode_(p.target_doc_type || DOC_TYPE_INVOICE);
  const renderNow = toBoolean_(p.render_now, true);
  if (!sourceDocId) throw new Error('source_doc_id が未指定です。');

  return convertDocToType_(sourceDocId, targetType, renderNow);
}
