// API から doc_types が返ってこない場合のフォールバック（帳票種別を必ず選べるようにする）
const DOC_TYPES_FALLBACK = [
  { code: 'QUOTE', label: '見積書' },
  { code: 'INVOICE', label: '請求書' },
  { code: 'DELIVERY_NOTE', label: '納品書' },
  { code: 'RECEIPT', label: '領収書' },
  { code: 'PAYMENT_STATEMENT', label: '支払明細書' }
];

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

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderDocs() {
  const tbody = document.getElementById('docs');
  tbody.innerHTML = '';
  state.docs.forEach((d) => {
    const id = escapeHtml(d.doc_id);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${id}</td>
      <td>${escapeHtml(d.doc_type)}</td>
      <td>${escapeHtml(d.client_name || '')}</td>
      <td>${escapeHtml(d.title || '')}</td>
      <td>${d.latest_pdf_url ? `<a href="${escapeHtml(d.latest_pdf_url)}" target="_blank">開く</a>` : '-'}</td>
      <td style="white-space:nowrap;">
        <select data-doc="${id}">
          <option value="QUOTE">見積書</option>
          <option value="INVOICE">請求書</option>
          <option value="DELIVERY_NOTE">納品書</option>
          <option value="RECEIPT">領収書</option>
          <option value="PAYMENT_STATEMENT">支払明細書</option>
        </select>
        <button onclick="convertDoc('${id}', this.previousElementSibling.value)">変換</button>
        <button class="sub" onclick="duplicateDoc('${id}')">複製</button>
        <button class="sub" onclick="openBatchModal('${id}')">一括</button>
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

  // API 失敗でも帳票種別・日付・明細は使えるようにする
  renderSelect('docType', DOC_TYPES_FALLBACK.map((d) => ({ value: d.code, label: d.label })), 'value', 'label');
  document.getElementById('issueDate').value = ymd(new Date());
  const defaultDue = new Date();
  defaultDue.setDate(defaultDue.getDate() + 30);
  document.getElementById('dueDate').value = ymd(defaultDue);
  document.getElementById('title').value = 'ご請求書';
  if (!document.querySelectorAll('#lines .card').length) addLine();

  try {
    const b = await apiGet('bootstrap');
    state.clients = b.clients || [];
    state.docTypes = b.doc_types || [];

    renderSelect('clientId', state.clients.map((c) => ({ value: c.client_id, label: `${c.name} (${c.client_id})` })), 'value', 'label');

    if (state.docTypes.length) {
      renderSelect('docType', state.docTypes.map((d) => ({ value: d.code, label: d.label })), 'value', 'label');
    }

    const terms = Number((b.defaults || {}).default_payment_terms_days || 30);
    const due = new Date();
    due.setDate(due.getDate() + terms);
    document.getElementById('dueDate').value = ymd(due);

    state.docs = b.docs || [];
    renderDocs();
    setStatus('準備完了');
  } catch (e) {
    setStatus(`初期化エラー: ${e.message}\n※帳票種別・明細は手動入力で使えます`);
  }
}

// --- 取引先モーダル（新規 / 編集 共通） ---
let editingClientId = null;

function setModalFields(data) {
  document.getElementById('cm_name').value = data.name || '';
  document.getElementById('cm_honorific').value = data.honorific || '御中';
  document.getElementById('cm_postal').value = data.postal || '';
  document.getElementById('cm_address').value = data.address || '';
  document.getElementById('cm_contact').value = data.contact_person || '';
  document.getElementById('cm_email').value = data.email || '';
  document.getElementById('cm_tel').value = data.tel || '';
  document.getElementById('cmStatus').textContent = '';
}

function openClientModal() {
  editingClientId = null;
  document.getElementById('cmTitle').textContent = '取引先を新規作成';
  document.getElementById('cmSubmitBtn').textContent = '登録する';
  setModalFields({});
  document.getElementById('clientModal').classList.add('open');
}

function openEditClientModal() {
  const sel = document.getElementById('clientId');
  const clientId = sel.value;
  if (!clientId) {
    setStatus('編集する取引先を選択してください');
    return;
  }
  const client = state.clients.find((c) => c.client_id === clientId);
  if (!client) {
    setStatus('取引先が見つかりません');
    return;
  }
  editingClientId = clientId;
  document.getElementById('cmTitle').textContent = `取引先を編集: ${client.name}`;
  document.getElementById('cmSubmitBtn').textContent = '更新する';
  setModalFields({
    name: client.name || '',
    honorific: client.honorific || '御中',
    postal: client.postal || '',
    address: client.address || '',
    contact_person: client.contact_person || '',
    email: client.email || '',
    tel: client.tel || ''
  });
  document.getElementById('clientModal').classList.add('open');
}

function closeClientModal() {
  editingClientId = null;
  document.getElementById('clientModal').classList.remove('open');
}

async function submitClient() {
  const name = document.getElementById('cm_name').value.trim();
  if (!name) {
    document.getElementById('cmStatus').textContent = '取引先名を入力してください';
    return;
  }

  const payload = {
    client_name: name,
    honorific: document.getElementById('cm_honorific').value.trim(),
    postal: document.getElementById('cm_postal').value.trim(),
    address: document.getElementById('cm_address').value.trim(),
    contact_person: document.getElementById('cm_contact').value.trim(),
    email: document.getElementById('cm_email').value.trim(),
    tel: document.getElementById('cm_tel').value.trim()
  };

  if (editingClientId) {
    // --- 編集モード ---
    document.getElementById('cmStatus').textContent = '更新中...';
    try {
      payload.client_id = editingClientId;
      const res = await apiPost('updateClient', payload);
      const idx = state.clients.findIndex((c) => c.client_id === editingClientId);
      if (idx !== -1) {
        state.clients[idx].name = res.client_name;
        state.clients[idx].honorific = res.honorific || '';
        state.clients[idx].postal = payload.postal;
        state.clients[idx].address = payload.address;
        state.clients[idx].contact_person = payload.contact_person;
        state.clients[idx].email = payload.email;
        state.clients[idx].tel = payload.tel;
      }
      refreshClientSelect(editingClientId);
      closeClientModal();
      setStatus(`取引先を更新しました: ${res.client_name} (${editingClientId})`);
    } catch (e) {
      document.getElementById('cmStatus').textContent = `エラー: ${e.message}`;
    }
  } else {
    // --- 新規モード ---
    document.getElementById('cmStatus').textContent = '登録中...';
    try {
      const res = await apiPost('createClient', payload);
      state.clients.push({
        client_id: res.client_id,
        name: res.client_name,
        filename: res.client_name_for_filename,
        honorific: payload.honorific,
        postal: payload.postal,
        address: payload.address,
        contact_person: payload.contact_person,
        email: payload.email,
        tel: payload.tel
      });
      refreshClientSelect(res.client_id);
      closeClientModal();
      setStatus(`取引先を登録しました: ${res.client_name} (${res.client_id})`);
    } catch (e) {
      document.getElementById('cmStatus').textContent = `エラー: ${e.message}`;
    }
  }
}

function refreshClientSelect(selectValue) {
  renderSelect('clientId', state.clients.map((c) => ({ value: c.client_id, label: `${c.name} (${c.client_id})` })), 'value', 'label');
  if (selectValue) document.getElementById('clientId').value = selectValue;
}

// --- 複製 ---
async function duplicateDoc(sourceDocId) {
  if (!confirm(`${sourceDocId} を複製しますか？（同じ宛名・明細でコピーします）`)) return;
  setStatus('複製中...');
  try {
    const res = await apiPost('duplicateDoc', { source_doc_id: sourceDocId });
    setStatus(`複製完了: ${res.docId}\n${res.pdfUrl || ''}`);
    await reloadDocs();
  } catch (e) {
    setStatus(`エラー: ${e.message}`);
  }
}

// --- 宛名違い一括作成モーダル ---
let batchSourceDocId = null;

function openBatchModal(sourceDocId) {
  batchSourceDocId = sourceDocId;
  const src = state.docs.find((d) => d.doc_id === sourceDocId);
  document.getElementById('batchTitle').textContent =
    `一括作成（元: ${sourceDocId}${src ? ' / ' + (src.title || '') : ''})`;
  document.getElementById('batchStatus').textContent = '';

  const container = document.getElementById('batchClientList');
  container.innerHTML = '';
  state.clients.forEach((c) => {
    const label = document.createElement('label');
    label.style.cssText = 'display:flex; align-items:center; gap:6px; padding:4px 0; cursor:pointer;';
    label.innerHTML = `<input type="checkbox" value="${escapeHtml(c.client_id)}" style="width:auto;" />
      <span>${escapeHtml(c.name)} (${escapeHtml(c.client_id)})</span>`;
    container.appendChild(label);
  });

  document.getElementById('batchModal').classList.add('open');
}

function closeBatchModal() {
  batchSourceDocId = null;
  document.getElementById('batchModal').classList.remove('open');
}

function batchSelectAll(checked) {
  document.querySelectorAll('#batchClientList input[type="checkbox"]').forEach((cb) => { cb.checked = checked; });
}

async function submitBatch() {
  const checkboxes = document.querySelectorAll('#batchClientList input[type="checkbox"]:checked');
  const clientIds = [...checkboxes].map((cb) => cb.value);
  if (!clientIds.length) {
    document.getElementById('batchStatus').textContent = '取引先を1つ以上選んでください';
    return;
  }
  if (!confirm(`${clientIds.length} 社分の帳票を一括作成します。よろしいですか？`)) return;

  document.getElementById('batchStatus').textContent = `作成中... (0/${clientIds.length})`;
  try {
    const res = await apiPost('batchCreateDoc', {
      source_doc_id: batchSourceDocId,
      client_ids: clientIds
    });
    let msg = `一括作成完了: ${res.total} 件成功`;
    if (res.failed) msg += `、${res.failed} 件失敗`;
    if (res.errors && res.errors.length) {
      msg += '\n失敗: ' + res.errors.map((e) => `${e.client_id}: ${e.error}`).join(', ');
    }
    document.getElementById('batchStatus').textContent = msg;
    setStatus(msg);
    await reloadDocs();
  } catch (e) {
    document.getElementById('batchStatus').textContent = `エラー: ${e.message}`;
  }
}

window.addLine = addLine;
window.createDoc = createDoc;
window.reloadDocs = reloadDocs;
window.convertDoc = convertDoc;
window.duplicateDoc = duplicateDoc;
window.openClientModal = openClientModal;
window.openEditClientModal = openEditClientModal;
window.closeClientModal = closeClientModal;
window.submitClient = submitClient;
window.openBatchModal = openBatchModal;
window.closeBatchModal = closeBatchModal;
window.batchSelectAll = batchSelectAll;
window.submitBatch = submitBatch;

init();
