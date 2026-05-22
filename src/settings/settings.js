import { MSG } from '../shared/messages.js';
import { loadSettingsForm, readSettingsForm, renderProviderDropdown, syncProviderDropdown } from '../popup/settings-ui.js';
import { createMessenger } from '../popup/messaging.js';
import { showToast } from '../popup/modal.js';
import { chatCompletion } from '../shared/llm.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const send = createMessenger();

function showSection(name) {
  $$('.settings-section').forEach((s) => s.classList.remove('active'));
  $$('.sidebar-item').forEach((s) => s.classList.remove('active'));
  const section = $(`#section-${name}`);
  if (section) section.classList.add('active');
  const item = $(`.sidebar-item[data-section="${name}"]`);
  if (item) item.classList.add('active');
}

async function loadAndRender() {
  const ver = chrome.runtime.getManifest().version;
  const el = $('#header-version');
  if (el) el.textContent = `v${ver}`;

  $$('.sidebar-item').forEach((item) => {
    item.addEventListener('click', () => showSection(item.dataset.section));
  });

  const providerEl = $('#settings-provider');
  if (providerEl) renderProviderDropdown(providerEl);

  $('#btn-toggle-api-key')?.addEventListener('click', () => {
    const input = $('#api-key');
    const btn = $('#btn-toggle-api-key');
    if (!input || !btn) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    btn.title = isPassword ? 'Hide API key' : 'Show API key';
    btn.innerHTML = isPassword
      ? `<svg viewBox="0 -960 960 960" width="16" height="16" fill="currentColor"><path d="M480-320q75 0 127.5-52.5T660-500q0-75-52.5-127.5T480-680q-75 0-127.5 52.5T300-500q0 75 52.5 127.5T480-320Zm0-80q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29Zm0 200q-146 0-265-81.5T40-500q56-137 175-218.5T480-800q146 0 265 81.5T920-500q-56 137-175 218.5T480-200Zm0-300Zm0 220q113 0 207.5-59.5T832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280Z"/></svg>`
      : `<svg viewBox="0 -960 960 960" width="16" height="16" fill="currentColor"><path d="M480-320q75 0 127.5-52.5T660-500q0-75-52.5-127.5T480-680q-75 0-127.5 52.5T300-500q0 75 52.5 127.5T480-320Zm0-80q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29Zm0 200q-146 0-265-81.5T40-500q56-137 175-218.5T480-800q146 0 265 81.5T920-500q-56 137-175 218.5T480-200Zm0-300Zm0 220q113 0 207.5-59.5T832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280Z"/></svg>`;
  });

  $('#btn-save-settings')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const status = $('#settings-status');
    try {
      const settings = readSettingsForm();
      await send(MSG.SAVE_SETTINGS, { settings });
      status.textContent = 'Saved';
    } catch (err) {
      status.textContent = `Save failed: ${err.message}`;
    }
  });

  $('#btn-save-settings-privacy')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const status = $('#settings-status-privacy');
    try {
      const settings = readSettingsForm();
      await send(MSG.SAVE_SETTINGS, { settings });
      status.textContent = 'Saved';
    } catch (err) {
      status.textContent = `Save failed: ${err.message}`;
    }
  });

  $$('.context-card').forEach((card) => {
    card.addEventListener('click', async () => {
      $$('.context-card').forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      const val = card.dataset.value;
      const radio = document.querySelector(`input[name="page-context-mode"][value="${val}"]`);
      if (radio) radio.checked = true;
      try {
        const settings = readSettingsForm();
        await send(MSG.SAVE_SETTINGS, { settings });
      } catch (err) {
        showToast(`Save failed: ${err.message}`);
      }
    });
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

  try {
    const { settings } = await send(MSG.GET_SETTINGS);
    loadSettingsForm(settings);
    const checkedRadio = document.querySelector('input[name="page-context-mode"]:checked');
    if (checkedRadio) {
      $$('.context-card').forEach((c) => c.classList.toggle('active', c.dataset.value === checkedRadio.value));
    }
  } catch (err) {
    showToast(`Failed to load settings: ${err.message}`);
  }
}

document.addEventListener('DOMContentLoaded', loadAndRender);
