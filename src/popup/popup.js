import { MSG } from '../shared/messages.js';
import { generateScriptStream, analyzeAndOpenConfirm } from './chat.js';
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
    const label = pageContextMode === 'html' ? 'Full HTML' : 'DOM Tree';
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url ? new URL(tab.url).hostname : '(no tab)';
    el.textContent = `Will send ${label} from current tab on generate — ${url}`;
  } catch (e) {
    el.textContent = `Could not load settings: ${e.message}`;
  }
}

function initScriptListDelegation() {
  const list = $('#script-list');
  if (!list || list.dataset.bound) return;
  list.dataset.bound = '1';

  list.addEventListener('click', async (e) => {
    const header = e.target.closest('.script-header[data-action="toggle"]');
    if (header && !e.target.closest('.toggle')) {
      e.preventDefault();
      const id = header.dataset.id;
      if (id) {
        const details = document.getElementById(`details-${id}`);
        const collapseBtn = header.querySelector('.collapse-btn');
        if (details) {
          details.classList.toggle('expanded');
          collapseBtn?.classList.toggle('expanded');
        }
      }
      return;
    }

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
      showToast(`Toggle failed: ${err.message}`);
      cb.checked = !cb.checked;
    }
  });
}

async function handleDelete(id, btn) {
  const ok = await showConfirm('Delete this script?');
  if (!ok) return;

  btn.disabled = true;
  try {
    await send(MSG.DELETE_SCRIPT, { id });
    await loadScripts();
    showToast('Deleted', false);
  } catch (err) {
    showToast(`Delete failed: ${err.message}`);
    btn.disabled = false;
  }
}

async function handleEdit(id) {
  const s = scriptsCache.find((x) => x.id === id);
  if (!s) {
    showToast('Script not found');
    return;
  }

  const code = await showEditDialog(s.code, `Edit ${s.name || 'Untitled'}`);
  if (code == null || code === s.code) return;

  try {
    await chrome.storage.local.set({ pendingEditId: id });
    await analyzeAndOpenConfirm(code);
  } catch (err) {
    showToast(`Edit save failed: ${err.message}`);
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
    showToast(`Export failed: ${err.message}`);
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
        <div class="script-header" data-action="toggle" data-id="${escapeAttr(s.id)}">
          <button type="button" class="collapse-btn" data-id="${escapeAttr(s.id)}">
            <svg class="v-icon" width="12" height="12" viewBox="0 0 12 12"><path d="M 1,3.5 L 6,8.5 L 11,3.5" /></svg>
          </button>
           <span class="script-name">${escapeHtml(s.name || 'Untitled')}</span>
          <label class="toggle">
            <input type="checkbox" data-id="${escapeAttr(s.id)}" ${s.enabled ? 'checked' : ''} />
            <span class="slider"></span>
          </label>
        </div>
        <div class="script-details" id="details-${escapeAttr(s.id)}">
          <p class="meta">${escapeHtml(matches)} · v${escapeHtml(s.version || '1.0')}</p>
          <div class="actions">
            <button type="button" class="btn secondary" data-action="export" data-id="${escapeAttr(s.id)}">
              <svg viewBox="0 -960 960 960" width="14" height="14" fill="currentColor"><path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/></svg>
              Download
            </button>
            <button type="button" class="btn secondary" data-action="edit" data-id="${escapeAttr(s.id)}">
              <svg viewBox="0 -960 960 960" width="14" height="14" fill="currentColor"><path d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z"/></svg>
              Edit
            </button>
            <button type="button" class="btn danger" data-action="delete" data-id="${escapeAttr(s.id)}">
              <svg viewBox="0 -960 960 960" width="14" height="14" fill="currentColor"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg>
              Delete
            </button>
          </div>
        </div>
      `;
      list.appendChild(li);
    }
  } catch (err) {
    showToast(`Failed to load list: ${err.message}`);
    scriptsCache = [];
    list.innerHTML = '';
    empty?.classList.remove('hidden');
  }
}

function initHeader() {
  const ver = chrome.runtime.getManifest().version;
  const el = $('#header-version');
  if (el) el.textContent = `v${ver}`;

  $('#btn-open-settings')?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'settings/settings.html' });
  });
}

function renderMarkdown(text) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const codeBlocks = [];

  let processed = escaped.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const langClass = lang ? ` class="lang-${escapeHtml(lang)}"` : '';
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre${langClass}><code>${code.trim()}</code></pre>`);
    return `\x00CODEBLOCK${idx}\x00`;
  });

  const fenceMatch = processed.match(/```(\w*)\n([\s\S]*)$/);
  if (fenceMatch) {
    const [, lang, code] = fenceMatch;
    const langClass = lang ? ` class="lang-${escapeHtml(lang)}"` : '';
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre${langClass}><code>${code}</code></pre>`);
    processed = processed.slice(0, fenceMatch.index) + `\x00CODEBLOCK${idx}\x00`;
  }

  const withInlineCode = processed.replace(/`([^`]+)`/g, '<code>$1</code>');
  const withBold = withInlineCode.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const withItalic = withBold.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  const withBreaks = withItalic.replace(/\n/g, '<br>');

  return withBreaks.replace(/\x00CODEBLOCK(\d+)\x00/g, (_, i) => codeBlocks[+i]);
}

function initChat() {
  const form = $('#chat-form');
  const output = $('#chat-output');
  const status = $('#chat-status-bar');
  const input = $('#chat-input');
  const sendBtn = $('#btn-send');
  const emptyState = $('#chat-empty-state');

  function showIdle() {
    emptyState?.classList.remove('hidden');
    if (output) output.classList.add('hidden');
  }

  function showActive() {
    emptyState?.classList.add('hidden');
    if (output) {
      output.innerHTML = '';
      output.classList.remove('hidden');
      output.classList.add('chat-output-streaming');
    }
  }

  function autoResize() {
    if (!input) return;
    const prevHeight = input.style.height;
    input.style.height = 'auto';
    const newHeight = Math.min(input.scrollHeight, 120) + 'px';
    if (prevHeight !== newHeight) {
      input.style.height = newHeight;
    }
  }

  function updateSendButton() {
    if (!sendBtn || !input) return;
    sendBtn.disabled = !input.value.trim();
  }

  input?.addEventListener('input', () => {
    autoResize();
    updateSendButton();
  });

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form?.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const prompt = input.value.trim();
    if (!prompt || sendBtn?.disabled) return;

    sendBtn.disabled = true;
    input.value = '';
    updateSendButton();
    autoResize();

    status.textContent = 'Generating...';
    showActive();

    let fullText = '';
    let callbackCount = 0;

    try {
      const { settings } = await send(MSG.GET_SETTINGS);
      console.log('[SF] settings received. baseUrl:', settings.llmBaseUrl, 'model:', settings.llmModel);
      status.textContent = 'Fetching page and generating...';

      const { code, pageContext } = await generateScriptStream(prompt, settings, (token) => {
        callbackCount++;
        if (callbackCount <= 3 || callbackCount % 10 === 0) {
          console.log('[SF] onToken #' + callbackCount + ' token len:', token.length, 'total len:', (fullText.length + token.length));
        }
        fullText += token;
        const html = renderMarkdown(fullText);
        output.innerHTML = html;
        output.scrollTop = output.scrollHeight;
      });
      console.log('[SF] generateScriptStream done. onToken called', callbackCount, 'times');

      output?.classList.remove('chat-output-streaming');
      const modeLabel = pageContext.mode === 'html' ? 'Full HTML' : 'DOM Tree';
      const trunc = pageContext.truncated || pageContext.apiTruncated ? ' (truncated)' : '';
      const minimal = pageContext.minimalFallback ? '· retried without page context' : '';
      status.textContent = `Script generated (${modeLabel}${trunc}${minimal}). Opening permission review...`;
      await analyzeAndOpenConfirm(code);
      status.textContent = '';
    } catch (err) {
      output?.classList.remove('chat-output-streaming');
      status.textContent = err.message;
      if (!fullText) {
        output.innerHTML = `<div class="chat-output-error">${escapeHtml(err.message)}</div>`;
      }
    } finally {
      output?.classList.remove('chat-output-streaming');
      sendBtn.disabled = false;
      updateSendButton();
    }
  });

  showIdle();
  updateSendButton();
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
  p.textContent = 'Reload the target page for changes to take effect.';
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
  initHeader();
  initTabs();
  initScriptListDelegation();
  initChat();
  initImport();
  initSidePanel();
  loadScripts();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.scripts) loadScripts();
  });
});
