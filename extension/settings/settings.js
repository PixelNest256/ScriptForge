// src/shared/messages.js
var MSG = {
  GET_SCRIPTS: "GET_SCRIPTS",
  SAVE_SCRIPT: "SAVE_SCRIPT",
  DELETE_SCRIPT: "DELETE_SCRIPT",
  TOGGLE_SCRIPT: "TOGGLE_SCRIPT",
  INJECT_TAB: "INJECT_TAB",
  ANALYZE_CODE: "ANALYZE_CODE",
  GET_SETTINGS: "GET_SETTINGS",
  SAVE_SETTINGS: "SAVE_SETTINGS",
  VERIFY_HASH: "VERIFY_HASH",
  EXPORT_SCRIPT: "EXPORT_SCRIPT",
  IMPORT_SCRIPT: "IMPORT_SCRIPT",
  OPEN_CONFIRM: "OPEN_CONFIRM"
};

// src/shared/llm.js
var LLM_PRESETS = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini"
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini"
  },
  {
    id: "ollama",
    label: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.2"
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    model: "local-model"
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile"
  }
];
var DEFAULT_LLM = {
  llmBaseUrl: "https://api.openai.com/v1",
  llmApiKey: "",
  llmModel: "gpt-4o-mini",
  pageContextMode: "dom"
};
function normalizeLlmSettings(settings = {}) {
  const baseUrl = (settings.llmBaseUrl || settings.apiBaseUrl || DEFAULT_LLM.llmBaseUrl).replace(/\/+$/, "");
  const pageContextMode = settings.pageContextMode === "html" ? "html" : "dom";
  return {
    llmBaseUrl: baseUrl,
    llmApiKey: settings.llmApiKey || settings.anthropicApiKey || "",
    llmModel: settings.llmModel || settings.anthropicModel || DEFAULT_LLM.llmModel,
    pageContextMode
  };
}
function settingsForStorage(form) {
  return {
    llmBaseUrl: form.baseUrl.replace(/\/+$/, ""),
    llmApiKey: form.apiKey,
    llmModel: form.model.trim(),
    pageContextMode: form.pageContextMode === "html" ? "html" : "dom"
  };
}
function chatCompletionsUrl(baseUrl) {
  const base = baseUrl.replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) return base;
  return `${base}/chat/completions`;
}
function buildProviderHeaders(baseUrl, apiKey) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (baseUrl.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = "https://github.com/scriptforge";
    headers["X-Title"] = "ScriptForge";
  }
  return headers;
}
function parseApiError(status, body) {
  if (body == null) return `API error ${status}`;
  if (typeof body === "string") return body.slice(0, 500);
  const err = body.error;
  if (typeof err === "string") return enrichApiError(err, status, body);
  if (err && typeof err === "object") {
    const parts = [
      err.message,
      typeof err.metadata?.raw === "string" ? err.metadata.raw : null,
      err.metadata?.provider_name ? `provider: ${err.metadata.provider_name}` : null,
      err.code != null ? `code: ${err.code}` : null
    ].filter(Boolean);
    if (parts.length) return enrichApiError(parts.join(" \u2014 "), status, body);
  }
  const msg = body.message || body.detail;
  if (typeof msg === "string") return enrichApiError(msg, status, body);
  if (Array.isArray(msg)) {
    return enrichApiError(msg.map((m) => m?.message || m?.msg || m).join(", "), status, body);
  }
  try {
    const brief = JSON.stringify(body).slice(0, 400);
    return enrichApiError(`API error ${status}: ${brief}`, status, body);
  } catch {
    return `API error ${status}`;
  }
}
function enrichApiError(message, status, body) {
  const m = String(message || "");
  const hints = [];
  if (/provider returned error/i.test(m)) {
    hints.push("Upstream provider returned an error (model outage or temporary overload)");
    hints.push('Try "DOM Tree" mode in settings (lighter than full HTML)');
    hints.push("Try a different model name (e.g. openai/gpt-4o-mini on OpenRouter)");
  }
  if (/context|token|length|too large|maximum/i.test(m)) {
    hints.push("Page context is too large. Select DOM Tree in settings or try on a simpler page");
  }
  if (status === 401 || /auth|api.?key|unauthorized/i.test(m)) {
    hints.push("API key is invalid or not set");
  }
  if (status === 404 || /model.*not found|does not exist/i.test(m)) {
    hints.push("Model name does not exist. Check the provider documentation for the correct ID");
  }
  if (hints.length === 0) return m;
  return `${m}

[Troubleshooting hints]
${hints.map((h) => `\u2022 ${h}`).join("\n")}`;
}
function extractMessageContent(data) {
  const choice = data?.choices?.[0];
  if (!choice) return "";
  if (choice.error) {
    const e = choice.error;
    throw new Error(
      typeof e === "string" ? e : e.message || "Model returned an error"
    );
  }
  if (choice.finish_reason === "error") {
    throw new Error("Model finished with error (finish_reason: error)");
  }
  const content = choice.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => typeof part === "string" ? part : part?.text || "").join("");
  }
  return choice.text || "";
}
async function chatCompletion({ systemPrompt, userPrompt, settings }) {
  const { llmBaseUrl, llmApiKey, llmModel } = normalizeLlmSettings(settings);
  if (!llmModel?.trim()) {
    throw new Error("Please set a model name");
  }
  const url = chatCompletionsUrl(llmBaseUrl);
  const headers = buildProviderHeaders(llmBaseUrl, llmApiKey);
  const body = {
    model: llmModel.trim(),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    max_tokens: 4096,
    temperature: 0.3
  };
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
  } catch (netErr) {
    throw new Error(
      `Network error: ${netErr.message} (check URL, CORS, or local API status)`
    );
  }
  const rawText = await res.text();
  let data = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(
      `API returned non-JSON (${res.status}): ${rawText.slice(0, 200)}`
    );
  }
  if (data.error) {
    throw new Error(parseApiError(res.status, data));
  }
  if (!res.ok) {
    throw new Error(parseApiError(res.status, data));
  }
  const text = extractMessageContent(data);
  if (!text?.trim()) {
    throw new Error(
      "API returned an empty response. Check model name and context length"
    );
  }
  return text.trim();
}

// src/shared/page-context.js
var PAGE_CONTEXT_HTML = "html";
var PAGE_CONTEXT_DOM = "dom";
function normalizePageContextSettings(settings = {}) {
  const mode = settings.pageContextMode === PAGE_CONTEXT_HTML ? PAGE_CONTEXT_HTML : PAGE_CONTEXT_DOM;
  return { pageContextMode: mode };
}

// src/popup/modal.js
var $ = (sel) => document.querySelector(sel);
function showToast(message, isError = true) {
  let el = $("#toast");
  if (!el) {
    el = document.createElement("p");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.toggle("toast-error", isError);
  el.classList.remove("hidden");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => el.classList.add("hidden"), 5e3);
}

// src/popup/settings-ui.js
var $2 = (sel) => document.querySelector(sel);
function renderProviderDropdown(container) {
  container.innerHTML = "";
  const select = document.createElement("select");
  select.id = "api-provider";
  for (const preset of LLM_PRESETS) {
    const opt = document.createElement("option");
    opt.value = preset.id;
    opt.textContent = preset.label;
    select.appendChild(opt);
  }
  const custom = document.createElement("option");
  custom.value = "__custom__";
  custom.textContent = "Custom";
  select.appendChild(custom);
  select.addEventListener("change", () => {
    const urlInput = $2("#api-base-url");
    if (select.value === "__custom__") {
      urlInput.disabled = false;
      urlInput.style.opacity = "1";
    } else {
      const preset = LLM_PRESETS.find((p) => p.id === select.value);
      if (preset) {
        urlInput.value = preset.baseUrl;
      }
      urlInput.disabled = true;
      urlInput.style.opacity = "0.5";
    }
  });
  container.appendChild(select);
}
function syncProviderDropdown() {
  const select = $2("#api-provider");
  const urlInput = $2("#api-base-url");
  if (!select || !urlInput) return;
  const currentUrl = urlInput.value.trim();
  const match = LLM_PRESETS.find((p) => p.baseUrl === currentUrl);
  if (match) {
    select.value = match.id;
    urlInput.disabled = true;
    urlInput.style.opacity = "0.5";
  } else {
    select.value = "__custom__";
    urlInput.disabled = false;
    urlInput.style.opacity = "1";
  }
}
function loadSettingsForm(settings) {
  const llm = normalizeLlmSettings(settings);
  const page = normalizePageContextSettings(settings);
  $2("#api-base-url").value = llm.llmBaseUrl;
  $2("#api-key").value = llm.llmApiKey;
  $2("#api-model").value = llm.llmModel;
  const mode = page.pageContextMode;
  const radio = document.querySelector(`input[name="page-context-mode"][value="${mode}"]`);
  if (radio) radio.checked = true;
  syncProviderDropdown();
}
function readSettingsForm() {
  const mode = document.querySelector('input[name="page-context-mode"]:checked')?.value || PAGE_CONTEXT_DOM;
  return settingsForStorage({
    baseUrl: $2("#api-base-url").value.trim() || "https://api.openai.com/v1",
    apiKey: $2("#api-key").value.trim(),
    model: $2("#api-model").value,
    pageContextMode: mode
  });
}

// src/popup/messaging.js
function createMessenger() {
  return function send2(type, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, ...payload }, (res) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        if (res?.error) {
          reject(new Error(res.error));
          return;
        }
        resolve(res ?? { ok: true });
      });
    });
  };
}

// src/settings/settings.js
var $3 = (sel) => document.querySelector(sel);
var $$ = (sel) => document.querySelectorAll(sel);
var send = createMessenger();
function showSection(name) {
  $$(".settings-section").forEach((s) => s.classList.remove("active"));
  $$(".sidebar-item").forEach((s) => s.classList.remove("active"));
  const section = $3(`#section-${name}`);
  if (section) section.classList.add("active");
  const item = $3(`.sidebar-item[data-section="${name}"]`);
  if (item) item.classList.add("active");
}
async function loadAndRender() {
  const ver = chrome.runtime.getManifest().version;
  const el = $3("#header-version");
  if (el) el.textContent = `v${ver}`;
  $$(".sidebar-item").forEach((item) => {
    item.addEventListener("click", () => showSection(item.dataset.section));
  });
  const providerEl = $3("#settings-provider");
  if (providerEl) renderProviderDropdown(providerEl);
  $3("#btn-toggle-api-key")?.addEventListener("click", () => {
    const input = $3("#api-key");
    const btn = $3("#btn-toggle-api-key");
    if (!input || !btn) return;
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    btn.title = isPassword ? "Hide API key" : "Show API key";
    btn.innerHTML = isPassword ? `<svg viewBox="0 -960 960 960" width="16" height="16" fill="currentColor"><path d="M480-320q75 0 127.5-52.5T660-500q0-75-52.5-127.5T480-680q-75 0-127.5 52.5T300-500q0 75 52.5 127.5T480-320Zm0-80q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29Zm0 200q-146 0-265-81.5T40-500q56-137 175-218.5T480-800q146 0 265 81.5T920-500q-56 137-175 218.5T480-200Zm0-300Zm0 220q113 0 207.5-59.5T832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280Z"/></svg>` : `<svg viewBox="0 -960 960 960" width="16" height="16" fill="currentColor"><path d="M480-320q75 0 127.5-52.5T660-500q0-75-52.5-127.5T480-680q-75 0-127.5 52.5T300-500q0 75 52.5 127.5T480-320Zm0-80q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29Zm0 200q-146 0-265-81.5T40-500q56-137 175-218.5T480-800q146 0 265 81.5T920-500q-56 137-175 218.5T480-200Zm0-300Zm0 220q113 0 207.5-59.5T832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280Z"/></svg>`;
  });
  $3("#btn-save-settings")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const status = $3("#settings-status");
    try {
      const settings = readSettingsForm();
      await send(MSG.SAVE_SETTINGS, { settings });
      status.textContent = "Saved";
    } catch (err) {
      status.textContent = `Save failed: ${err.message}`;
    }
  });
  $3("#btn-save-settings-privacy")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const status = $3("#settings-status-privacy");
    try {
      const settings = readSettingsForm();
      await send(MSG.SAVE_SETTINGS, { settings });
      status.textContent = "Saved";
    } catch (err) {
      status.textContent = `Save failed: ${err.message}`;
    }
  });
  $$(".context-card").forEach((card) => {
    card.addEventListener("click", async () => {
      $$(".context-card").forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
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
  $3("#btn-test-api")?.addEventListener("click", async () => {
    const status = $3("#settings-status");
    status.textContent = "Testing connection...";
    try {
      const form = readSettingsForm();
      await chatCompletion({
        systemPrompt: "Reply with exactly: OK",
        userPrompt: "ping",
        settings: form
      });
      status.textContent = "Connection successful";
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
      $$(".context-card").forEach((c) => c.classList.toggle("active", c.dataset.value === checkedRadio.value));
    }
  } catch (err) {
    showToast(`Failed to load settings: ${err.message}`);
  }
}
document.addEventListener("DOMContentLoaded", loadAndRender);
