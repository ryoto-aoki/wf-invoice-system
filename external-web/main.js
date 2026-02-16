const state = { clients: [], docTypes: [], docs: [] };

function setStatus(msg) {
  document.getElementById('status').textContent = msg || '';
}

function ymd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function apiGet(api, params = {}) {
  const q = new URLSearchParams({ api, ...params });
  const res = await fetch(`/gas?${q.toString()}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'API error');
  return json.data;
}

async function apiPost(api, payload = {}) {
  const res = await fetch(`/gas?api=${encodeURIComponent(api)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'API error');
  return json.data;
}

function renderSelect(id, items, valueKey, labelKey) {
  const el = document.getElementById(id);
  el.innerHTML = '';
  items.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = item[valueKey];
    opt.textContent = item[labelKey];
    el.appendChild(opt);
  });
}

function addLine(seed = null) {
  const node = document.getElementById('lineTpl').content.firstElementChild.cloneNode(true);
  if (seed) {
    node.querySelectorAll('[data-k]').forEach((el) => {
      const k = el.getAttribute('data-k');
      if (seed[k] !== undefined) el.value = seed[k];
    });
  }
  document.getElementById('lines').appendChild(node);
}

function collectLines() {
  return [...document.querySelectorAll('#lines .card')].map((row) => {
    const out = {};
    row.querySelectorAll('[data-k]').forEach((el) => { out[el.getAttribute('data-k')] = el.value; });
    return out;
  });
}

function renderDocs() {
  const tbody = document.getElementById('docs');
  tbody.innerHTML = '';
  state.docs.forEach((d) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${d.doc_id}</td>
      <td>${d.doc_type}</td>
      <td>${d.client_name || ''}</td>
      <td>${d.title || ''}</td>
      <td>${d.latest_pdf_url ? `<a href="${d.latest_pdf_url}" target="_blank">開く</a>` : '-'}</td>
      <td>
        <select data-doc="${d.doc_id}">
          <option value="QUOTE">見積書</option>
          <option value="INVOICE">請求書</option>
          <option value="DELIVERY_NOTE">納品書</option>
          <option value="RECEIPT">領収書</option>
          <option value="PAYMENT_STATEMENT">支払明細書</option>
        </select>
        <button onclick="convertDoc('${d.doc_id}', this.previousElementSibling.value)">変換生成</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function reloadDocs() {
  setStatus('一覧取得中...');
  try {
    state.docs = await apiGet('listDocs', { limit: 100 });
    renderDocs();
    setStatus('一覧を更新しました。');
  } catch (e) {
    setStatus(`エラー: ${e.message}`);
  }
}

async function createDoc() {
  setStatus('帳票生成中...');
  try {
    const payload = {
      doc_type: document.getElementById('docType').value,
      client_id: document.getElementById('clientId').value,
      issue_date: document.getElementById('issueDate').value,
      due_date: document.getElementById('dueDate').value,
      title: document.getElementById('title').value,
      note: document.getElementById('note').value,
      price_mode: document.getElementById('priceMode').value,
      rounding_mode: document.getElementById('roundingMode').value,
      lines: collectLines()
    };
    const res = await apiPost('createDoc', payload);
    setStatus(`生成完了: ${res.docId}\n${res.pdfUrl}`);
    await reloadDocs();
  } catch (e) {
    setStatus(`エラー: ${e.message}`);
  }
}

async function convertDoc(sourceDocId, targetType) {
  setStatus('変換中...');
  try {
    const res = await apiPost('convertDoc', {
      source_doc_id: sourceDocId,
      target_doc_type: targetType,
      render_now: true
    });
    setStatus(`変換完了: ${res.new_doc_id}\n${res.pdf_url || ''}`);
    await reloadDocs();
  } catch (e) {
    setStatus(`エラー: ${e.message}`);
  }
}

async function init() {
  setStatus('初期化中...');
  try {
    const b = await apiGet('bootstrap');
    state.clients = b.clients || [];
    state.docTypes = b.doc_types || [];

    renderSelect('clientId', state.clients.map((c) => ({ value: c.client_id, label: `${c.name} (${c.client_id})` })), 'value', 'label');
    renderSelect('docType', state.docTypes.map((d) => ({ value: d.code, label: d.label })), 'value', 'label');

    document.getElementById('issueDate').value = ymd(new Date());
    const due = new Date(); due.setDate(due.getDate() + Number((b.defaults || {}).default_payment_terms_days || 30));
    document.getElementById('dueDate').value = ymd(due);
    document.getElementById('title').value = 'ご請求書';
    addLine();
    state.docs = b.docs || [];
    renderDocs();
    setStatus('準備完了');
  } catch (e) {
    setStatus(`初期化エラー: ${e.message}`);
  }
}

window.addLine = addLine;
window.createDoc = createDoc;
window.reloadDocs = reloadDocs;
window.convertDoc = convertDoc;

init();
