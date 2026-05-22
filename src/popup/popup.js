import { MSG } from '../shared/messages.js';
import { generateScript, analyzeAndOpenConfirm } from './chat.js';
import { initSettings, loadSettingsForm } from './settings-ui.js';
import { normalizePageContextSettings } from '../shared/page-context.js';
import { createMessenger } from './messaging.js';
import { showConfirm, showEditDialog, showPrompt, showToast } from './modal.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const send = createMessenger();

let scriptsCache = [];

function showView(name) {
  $$('.view').forEach((v) => v.classList.add('hidden'));
  $(`#view-${name}`)?.classList.remove('hidden');
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
}

function initTabs() {
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      showView(tab.dataset.view);
      if (tab.dataset.view === 'chat') updatePageContextHint();
    });
  });
}

async function updatePageContextHint() {
  const el = $('#page-context-hint');
  if (!el) return;
  try {
    const { settings } = await send(MSG.GET_SETTINGS);
    const { pageContextMode } = normalizePageContextSettings(settings);
    const label = pageContextMode === 'html' ? 'HTML 全文' : 'DOM ツリー';
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url ? new URL(tab.url).hostname : '（タブなし）';
    el.textContent = `生成時に現在のタブへ ${label} を送信します — ${url}`;
  } catch (e) {
    el.textContent = `設定を読み込めません: ${e.message}`;
  }
}

function initScriptListDelegation() {
  const list = $('#script-list');
  if (!list || list.dataset.bound) return;
  list.dataset.bound = '1';

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (!id) return;

    if (action === 'delete') await handleDelete(id, btn);
    if (action === 'edit') await handleEdit(id);
    if (action === 'export') await handleExport(id);
  });

  list.addEventListener('change', async (e) => {
    const cb = e.target;
    if (!cb.matches('input[type="checkbox"][data-id]')) return;
    try {
      const res = await send(MSG.TOGGLE_SCRIPT, { id: cb.dataset.id, enabled: cb.checked });
      if (res?.reloadHint) showReloadHint();
    } catch (err) {
      showToast(`有効化の変更に失敗: ${err.message}`);
      cb.checked = !cb.checked;
    }
  });
}

async function handleDelete(id, btn) {
  const ok = await showConfirm('このスクリプトを削除しますか？');
  if (!ok) return;

  btn.disabled = true;
  try {
    await send(MSG.DELETE_SCRIPT, { id });
    await loadScripts();
    showToast('削除しました', false);
  } catch (err) {
    showToast(`削除に失敗: ${err.message}`);
    btn.disabled = false;
  }
}

async function handleEdit(id) {
  const s = scriptsCache.find((x) => x.id === id);
  if (!s) {
    showToast('スクリプトが見つかりません');
    return;
  }

  const code = await showEditDialog(s.code, `${s.name || '無題'} を編集`);
  if (code == null || code === s.code) return;

  try {
    await chrome.storage.local.set({ pendingEditId: id });
    await analyzeAndOpenConfirm(code);
  } catch (err) {
    showToast(`編集の保存に失敗: ${err.message}`);
  }
}

async function handleExport(id) {
  try {
    const { code } = await send(MSG.EXPORT_SCRIPT, { id });
    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({
      url,
      filename: `scriptforge-${id.slice(0, 8)}.user.js`,
      saveAs: true,
    });
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (err) {
    showToast(`エクスポートに失敗: ${err.message}`);
  }
}

async function loadScripts() {
  const list = $('#script-list');
  const empty = $('#list-empty');
  if (!list) return;

  try {
    const { scripts } = await send(MSG.GET_SCRIPTS);
    scriptsCache = scripts || [];
    list.innerHTML = '';

    if (!scriptsCache.length) {
      empty?.classList.remove('hidden');
      return;
    }
    empty?.classList.add('hidden');

    for (const s of scriptsCache) {
      const li = document.createElement('li');
      li.className = 'script-item';
      const matches = (s.matches || []).join(', ') || '—';
      li.innerHTML = `
        <h3>${escapeHtml(s.name || '無題')}</h3>
        <p class="meta">${escapeHtml(matches)} · v${escapeHtml(s.version || '1.0')}</p>
        <div class="actions">
          <label class="toggle">
            <input type="checkbox" data-id="${escapeAttr(s.id)}" ${s.enabled ? 'checked' : ''} />
            有効
          </label>
          <button type="button" class="btn secondary" data-action="export" data-id="${escapeAttr(s.id)}">エクスポート</button>
          <button type="button" class="btn secondary" data-action="edit" data-id="${escapeAttr(s.id)}">編集</button>
          <button type="button" class="btn danger" data-action="delete" data-id="${escapeAttr(s.id)}">削除</button>
        </div>
      `;
      list.appendChild(li);
    }
  } catch (err) {
    showToast(`一覧の読み込みに失敗: ${err.message}`);
    scriptsCache = [];
    list.innerHTML = '';
    empty?.classList.remove('hidden');
  }
}

async function loadSettings() {
  try {
    const { settings } = await send(MSG.GET_SETTINGS);
    loadSettingsForm(settings);
  } catch (err) {
    showToast(`設定の読み込みに失敗: ${err.message}`);
  }
}

function initChat() {
  const form = $('#chat-form');
  const messages = $('#chat-messages');
  const status = $('#chat-status');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#chat-input');
    const prompt = input.value.trim();
    if (!prompt) return;

    appendBubble(messages, 'user', prompt);
    input.value = '';
    status.textContent = '生成中...';
    $('#btn-send').disabled = true;

    try {
      const { settings } = await send(MSG.GET_SETTINGS);
      status.textContent = 'ページを取得して生成中...';
      const { code, pageContext } = await generateScript(prompt, settings);
      const modeLabel = pageContext.mode === 'html' ? 'HTML全文' : 'DOMツリー';
      const trunc = pageContext.truncated || pageContext.apiTruncated ? '（一部省略）' : '';
      const minimal = pageContext.minimalFallback ? '・ページ情報なしで再試行済' : '';
      appendBubble(
        messages,
        'assistant',
        `スクリプトを生成しました（${modeLabel}${trunc}${minimal}）。権限確認画面を開きます...`
      );
      await analyzeAndOpenConfirm(code);
      status.textContent = '権限確認画面で承認してください';
      window.addEventListener('focus', () => loadScripts(), { once: true });
    } catch (err) {
      status.textContent = err.message;
      appendBubble(messages, 'assistant', `エラー: ${err.message}`);
    } finally {
      $('#btn-send').disabled = false;
    }
  });
}

function appendBubble(container, role, text) {
  if (!container) return;
  const div = document.createElement('div');
  div.className = `chat-bubble ${role}`;
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function initImport() {
  const fileInput = $('#import-file');
  $('#btn-import-file')?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const code = await file.text();
    fileInput.value = '';
    try {
      await analyzeAndOpenConfirm(code);
    } catch (e) {
      showToast(e.message);
    }
  });

  $('#btn-import-url')?.addEventListener('click', async () => {
    const url = await showPrompt('インポートする .user.js の URL:');
    if (!url) return;
    try {
      const res = await fetch(url);
      const code = await res.text();
      await analyzeAndOpenConfirm(code);
    } catch (e) {
      showToast(e.message);
    }
  });
}

function initSidePanel() {
  $('#btn-open-sidepanel')?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.windowId) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
  });
}

function showReloadHint() {
  const existing = $('#reload-hint');
  if (existing) {
    existing.classList.remove('hidden');
    return;
  }
  const p = document.createElement('p');
  p.id = 'reload-hint';
  p.className = 'status';
  p.textContent = '反映するには対象ページを再読み込みしてください。';
  $('#view-list')?.prepend(p);
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initScriptListDelegation();
  initSettings(send);
  initChat();
  initImport();
  initSidePanel();
  loadScripts();
  loadSettings();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.scripts) loadScripts();
  });
});
