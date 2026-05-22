import { MSG } from '../shared/messages.js';
import { LLM_PRESETS, normalizeLlmSettings, settingsForStorage, chatCompletion } from '../shared/llm.js';
import { normalizePageContextSettings, PAGE_CONTEXT_HTML, PAGE_CONTEXT_DOM } from '../shared/page-context.js';
import { showToast } from './modal.js';

const $ = (sel) => document.querySelector(sel);

export function renderProviderDropdown(container) {
  container.innerHTML = '';
  const select = document.createElement('select');
  select.id = 'api-provider';
  for (const preset of LLM_PRESETS) {
    const opt = document.createElement('option');
    opt.value = preset.id;
    opt.textContent = preset.label;
    select.appendChild(opt);
  }
  const custom = document.createElement('option');
  custom.value = '__custom__';
  custom.textContent = 'Custom';
  select.appendChild(custom);

  select.addEventListener('change', () => {
    const urlInput = $('#api-base-url');
    if (select.value === '__custom__') {
      urlInput.disabled = false;
      urlInput.style.opacity = '1';
    } else {
      const preset = LLM_PRESETS.find((p) => p.id === select.value);
      if (preset) {
        urlInput.value = preset.baseUrl;
      }
      urlInput.disabled = true;
      urlInput.style.opacity = '0.5';
    }
  });

  container.appendChild(select);
}

export function syncProviderDropdown() {
  const select = $('#api-provider');
  const urlInput = $('#api-base-url');
  if (!select || !urlInput) return;
  const currentUrl = urlInput.value.trim();
  const match = LLM_PRESETS.find((p) => p.baseUrl === currentUrl);
  if (match) {
    select.value = match.id;
    urlInput.disabled = true;
    urlInput.style.opacity = '0.5';
  } else {
    select.value = '__custom__';
    urlInput.disabled = false;
    urlInput.style.opacity = '1';
  }
}

export function renderSettingsPresets(container) {
  container.innerHTML = '';
  for (const preset of LLM_PRESETS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn secondary preset-btn';
    btn.textContent = preset.label;
    btn.title = preset.baseUrl;
    btn.addEventListener('click', () => applyPreset(preset));
    container.appendChild(btn);
  }
}

function applyPreset(preset) {
  $('#api-base-url').value = preset.baseUrl;
  $('#api-model').value = preset.model;
}

export function loadSettingsForm(settings) {
  const llm = normalizeLlmSettings(settings);
  const page = normalizePageContextSettings(settings);
  $('#api-base-url').value = llm.llmBaseUrl;
  $('#api-key').value = llm.llmApiKey;
  $('#api-model').value = llm.llmModel;
  const mode = page.pageContextMode;
  const radio = document.querySelector(`input[name="page-context-mode"][value="${mode}"]`);
  if (radio) radio.checked = true;
  syncProviderDropdown();
}

export function readSettingsForm() {
  const mode =
    document.querySelector('input[name="page-context-mode"]:checked')?.value ||
    PAGE_CONTEXT_DOM;
  return settingsForStorage({
    baseUrl: $('#api-base-url').value.trim() || 'https://api.openai.com/v1',
    apiKey: $('#api-key').value.trim(),
    model: $('#api-model').value,
    pageContextMode: mode,
  });
}

export function initSettings(send) {
  const presetsEl = $('#settings-presets');
  if (presetsEl) renderSettingsPresets(presetsEl);

  const saveBtn = $('#btn-save-settings');
  console.log('[ScriptForge] save button found:', !!saveBtn);
  saveBtn?.addEventListener('click', async (e) => {
    console.log('[ScriptForge] save button clicked');
    e.preventDefault();
    try {
      const settings = readSettingsForm();
      console.log('[ScriptForge] sending settings:', settings);
      await send(MSG.SAVE_SETTINGS, { settings });
      console.log('[ScriptForge] settings saved successfully');
      $('#settings-status').textContent = 'Saved';
    } catch (err) {
      console.error('[ScriptForge] save settings error:', err);
      $('#settings-status').textContent = `Save failed: ${err.message}`;
    }
  });

  $('#btn-test-api')?.addEventListener('click', async () => {
    const status = $('#settings-status');
    status.textContent = 'Testing connection...';
    try {
      const form = readSettingsForm();
      await chatCompletion({
        systemPrompt: 'Reply with exactly: OK',
        userPrompt: 'ping',
        settings: form,
      });
      status.textContent = 'Connection successful';
    } catch (e) {
      status.textContent = `Connection failed: ${e.message}`;
      showToast(`Connection failed: ${e.message}`);
    }
  });
}

export { PAGE_CONTEXT_HTML, PAGE_CONTEXT_DOM };
