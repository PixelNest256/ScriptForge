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

// src/shared/hash.js
function parseUserscriptMeta(code) {
  const meta = {};
  const lines = code.split("\n");
  let inBlock = false;
  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "// ==UserScript==") {
      inBlock = true;
      continue;
    }
    if (line === "// ==/UserScript==") {
      bodyStart = i + 1;
      break;
    }
    if (inBlock) {
      const m = line.match(/^\/\/ @(\w+)\s+(.+)$/);
      if (m) {
        const key = m[1];
        const val = m[2].trim();
        if (key === "match") {
          meta.match = meta.match || [];
          meta.match.push(val);
        } else {
          meta[key] = val;
        }
      }
    }
  }
  const body = lines.slice(bodyStart).join("\n").trim();
  return { meta, body };
}

// src/shared/llm.js
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
async function chatCompletionStream({ systemPrompt, userPrompt, settings, onToken }) {
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
    temperature: 0.3,
    stream: true
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
  if (!res.ok) {
    const rawText = await res.text().catch(() => "");
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
    }
    throw new Error(parseApiError(res.status, data));
  }
  let fullText = "";
  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("Streaming not supported by this browser");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  let charsSinceYield = 0;
  function extractDelta(parsed) {
    return parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content ?? parsed.choices?.[0]?.text ?? null;
  }
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let payload = trimmed;
      if (payload.startsWith("data:")) {
        payload = payload.slice(5).trim();
      } else if (!payload.startsWith("{") && !payload.startsWith("[")) {
        continue;
      }
      if (payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload);
        const delta = extractDelta(parsed);
        if (delta) {
          fullText += delta;
          try { onToken?.(delta); } catch {}
          charsSinceYield += delta.length;
          if (charsSinceYield > 5) {
            charsSinceYield = 0;
            await new Promise((r) => requestAnimationFrame(r));
          }
        }
      } catch {
      }
    }
  }
  if (!fullText.trim()) {
    throw new Error("API returned an empty response. Check model name and context length");
  }
  return fullText.trim();
}
function isRetryableApiError(err) {
  const m = String(err?.message || "");
  return /provider returned error/i.test(m) || /context|token|length|too large|maximum/i.test(m) || /empty/i.test(m);
}

// src/shared/page-capture-fn.js
function capturePageContextInPage(mode) {
  const MAX_HTML = 6e4;
  const MAX_DOM_NODES = 450;
  const MAX_DEPTH = 14;
  const MAX_TEXT = 120;
  const url = location.href;
  const title = document.title;
  if (mode === "html") {
    let content = document.documentElement.outerHTML;
    let truncated2 = false;
    if (content.length > MAX_HTML) {
      content = content.slice(0, MAX_HTML);
      truncated2 = true;
    }
    return { mode: "html", url, title, content, truncated: truncated2, length: content.length };
  }
  const lines = [];
  let nodeCount = 0;
  let truncated = false;
  function walk(node, depth) {
    if (nodeCount >= MAX_DOM_NODES) {
      truncated = true;
      return;
    }
    if (depth > MAX_DEPTH) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (!t) return;
      lines.push(`${"  ".repeat(depth)}text: ${t.slice(0, MAX_TEXT)}`);
      nodeCount++;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node;
    const tag = el.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "noscript") return;
    let label = tag;
    if (el.id) label += `#${el.id}`;
    if (el.className && typeof el.className === "string") {
      const classes = el.className.trim().split(/\s+/).filter(Boolean).slice(0, 6);
      if (classes.length) label += `.${classes.join(".")}`;
    }
    const attrs = [];
    const role = el.getAttribute("role");
    const aria = el.getAttribute("aria-label");
    const href = tag === "a" ? el.getAttribute("href") : null;
    const src = tag === "img" ? el.getAttribute("src") : null;
    if (role) attrs.push(`role=${role}`);
    if (aria) attrs.push(`aria-label="${aria.slice(0, 60)}"`);
    if (href) attrs.push(`href="${href.slice(0, 80)}"`);
    if (src) attrs.push(`src="${src.slice(0, 80)}"`);
    const attrStr = attrs.length ? ` [${attrs.join(", ")}]` : "";
    lines.push(`${"  ".repeat(depth)}${label}${attrStr}`);
    nodeCount++;
    for (const child of el.childNodes) {
      walk(child, depth + 1);
      if (truncated) return;
    }
  }
  walk(document.documentElement, 0);
  return {
    mode: "dom",
    url,
    title,
    content: lines.join("\n"),
    truncated,
    length: lines.length
  };
}

// src/shared/page-context.js
var PAGE_CONTEXT_HTML = "html";
var PAGE_CONTEXT_DOM = "dom";
var API_CONTENT_LIMIT = {
  dom: 28e3,
  html: 45e3
};
function normalizePageContextSettings(settings = {}) {
  const mode = settings.pageContextMode === PAGE_CONTEXT_HTML ? PAGE_CONTEXT_HTML : PAGE_CONTEXT_DOM;
  return { pageContextMode: mode };
}
var RESTRICTED_PREFIXES = ["chrome://", "chrome-extension://", "edge://", "about:", "devtools://"];
function isRestrictedUrl(url) {
  if (!url) return true;
  return RESTRICTED_PREFIXES.some((p) => url.startsWith(p));
}
async function captureActiveTabPageContext(mode) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab");
  if (isRestrictedUrl(tab.url)) {
    throw new Error("Cannot get HTML/DOM from this page (browser internal page)");
  }
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: capturePageContextInPage,
    args: [mode]
  });
  if (!result?.content) {
    throw new Error("Failed to get page content");
  }
  return result;
}
function limitPageContextForApi(pageContext, maxChars) {
  const defaultMax = maxChars ?? API_CONTENT_LIMIT[pageContext.mode] ?? API_CONTENT_LIMIT.dom;
  if (pageContext.content.length <= defaultMax) {
    return { ...pageContext, apiTruncated: false };
  }
  return {
    ...pageContext,
    content: pageContext.content.slice(0, defaultMax),
    truncated: true,
    apiTruncated: true
  };
}
function buildMinimalPagePrompt(userPrompt, pageContext) {
  return `Generate a userscript for this page.

URL: ${pageContext.url}
Title: ${pageContext.title}

Note: Full page snapshot was omitted because the API request failed (likely too large). Use common patterns for this site type and the user request.

User request:
${userPrompt}

Use @match like: ${suggestMatchPattern(pageContext.url)}`;
}
function suggestMatchPattern(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/*`;
  } catch {
    return "*://*/*";
  }
}
function buildPromptWithPageContext(userPrompt, pageContext) {
  const modeLabel = pageContext.mode === PAGE_CONTEXT_HTML ? "HTML (full page)" : "DOM (serialized tree)";
  const truncNote = pageContext.truncated ? "\nNote: Content was truncated due to size limits." : "";
  return `You are generating a userscript for the following web page.

## Current page
- URL: ${pageContext.url}
- Title: ${pageContext.title}
- Snapshot type: ${modeLabel}${truncNote}

## Page ${pageContext.mode.toUpperCase()} snapshot
\`\`\`
${pageContext.content}
\`\`\`

## User request
${userPrompt}

Use the page snapshot above to choose accurate selectors (@match should use the current URL pattern: ${pageContext.url}).`;
}

// src/popup/chat.js
var SYSTEM_PROMPT = `You are a userscript generator for ScriptForge browser extension.
Think step by step, then output a complete Tampermonkey-compatible userscript inside a single markdown code block (use \`\`\`javascript ... \`\`\`).

Requirements:
- First, explain your approach briefly in natural language (1-3 sentences).
- Then output the userscript code inside \`\`\`javascript ... \`\`\` fences.
- The script must start with // ==UserScript== block containing @name, @description, @match (at least one), @version
- End metadata with // ==/UserScript==
- Body must be an IIFE: (function () { 'use strict'; ... })();
- NEVER use eval, new Function, dynamic import(), or string arguments to setTimeout/setInterval
- Prefer DOM styling/manipulation only unless user explicitly needs network/storage
- Use @match patterns appropriate for the current page URL provided in the user message
- Use selectors that match the provided page HTML or DOM snapshot
- Add @generated-by and @generated-at in metadata (@generated-by should include the model name)
- Write code in JavaScript only`;
async function generateScriptStream(prompt, settings, onToken) {
  const llm = normalizeLlmSettings(settings);
  const { pageContextMode } = normalizePageContextSettings(settings);
  if (!llm.llmApiKey && !isLocalBaseUrl(llm.llmBaseUrl)) {
    throw new Error("API key not set (can be empty for local APIs)");
  }
  const pageContext = await captureActiveTabPageContext(pageContextMode);
  const limited = limitPageContextForApi(pageContext);
  let userPrompt = buildPromptWithPageContext(prompt, limited);
  let usedMinimal = false;
  try {
    const text = await chatCompletionStream({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      settings,
      onToken
    });
    return finishGeneration(text, llm.llmModel, pageContext, limited);
  } catch (firstErr) {
    if (!isRetryableApiError(firstErr)) throw firstErr;
    const smaller = limitPageContextForApi(pageContext, 1e4);
    userPrompt = buildPromptWithPageContext(prompt, smaller);
    try {
      const text = await chatCompletion({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        settings
      });
      onToken?.(text);
      return finishGeneration(text, llm.llmModel, pageContext, smaller);
    } catch (secondErr) {
      if (!isRetryableApiError(secondErr)) throw secondErr;
      userPrompt = buildMinimalPagePrompt(prompt, pageContext);
      usedMinimal = true;
      const text = await chatCompletion({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        settings
      });
      onToken?.(text);
      const result = finishGeneration(text, llm.llmModel, pageContext, pageContext);
      result.pageContext.minimalFallback = usedMinimal;
      return result;
    }
  }
}
function finishGeneration(text, modelTag, pageContext, sentContext) {
  const code = stripCodeFences(text);
  return {
    code: injectGeneratedBy(code, modelTag),
    pageContext: { ...pageContext, sentChars: sentContext.content?.length }
  };
}
function isLocalBaseUrl(baseUrl) {
  try {
    const u = new URL(baseUrl);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}
function injectGeneratedBy(code, model) {
  const stamp = (/* @__PURE__ */ new Date()).toISOString();
  if (code.includes("@generated-by")) {
    return code.replace(/\/\/ @generated-by\s+.+/i, `// @generated-by ${model}`);
  }
  if (code.includes("// ==/UserScript==")) {
    return code.replace(
      "// ==/UserScript==",
      `// @generated-by ${model}
// @generated-at ${stamp}
// ==/UserScript==`
    );
  }
  return code;
}
function stripCodeFences(text) {
  const m = text.match(/```(?:javascript|js)?\s*([\s\S]*?)```/);
  return m ? m[1].trim() : text;
}
async function analyzeAndOpenConfirm(code) {
  const result = await chrome.runtime.sendMessage({ type: MSG.ANALYZE_CODE, code });
  if (result.syntaxError) {
    throw new Error(`Syntax error: ${result.syntaxError}`);
  }
  if (result.blocked?.length) {
    const msgs = result.blocked.map((b) => b.message).join("\n");
    throw new Error(`Blocked:
${msgs}`);
  }
  if (result.lintErrors?.length) {
    throw new Error(`Lint errors:
${result.lintErrors.join("\n")}`);
  }
  const { meta } = parseUserscriptMeta(code);
  await chrome.storage.local.set({
    pendingScript: {
      code,
      meta,
      permissions: result.permissions,
      notDetected: result.notDetected,
      lintWarnings: result.lintWarnings
    }
  });
  const url = chrome.runtime.getURL(
    `permissions_ui/confirm.html?ts=${Date.now()}`
  );
  await chrome.windows.create({
    url,
    type: "popup",
    width: 480,
    height: 560
  });
  return result;
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
function showConfirm(message) {
  return new Promise((resolve) => {
    const overlay = $("#modal-overlay");
    const msg = $("#modal-message");
    const actions = $("#modal-actions");
    if (!overlay || !msg || !actions) {
      resolve(window.confirm(message));
      return;
    }
    msg.textContent = message;
    actions.innerHTML = `
      <button type="button" class="btn secondary" data-modal="cancel">Cancel</button>
      <button type="button" class="btn danger" data-modal="ok">OK</button>
    `;
    overlay.classList.remove("hidden");
    const close = (result) => {
      overlay.classList.add("hidden");
      actions.replaceChildren();
      resolve(result);
    };
    actions.onclick = (e) => {
      const btn = e.target.closest("[data-modal]");
      if (!btn) return;
      close(btn.dataset.modal === "ok");
    };
    overlay.onclick = (e) => {
      if (e.target === overlay) close(false);
    };
  });
}
function showEditDialog(code, title = "Edit Script") {
  return new Promise((resolve) => {
    const overlay = $("#edit-overlay");
    const textarea = $("#edit-code");
    const titleEl = $("#edit-title");
    if (!overlay || !textarea) {
      const result = window.prompt("Edit Script:", code);
      resolve(result);
      return;
    }
    if (titleEl) titleEl.textContent = title;
    textarea.value = code;
    overlay.classList.remove("hidden");
    textarea.focus();
    const close = (result) => {
      overlay.classList.add("hidden");
      resolve(result);
    };
    $("#edit-cancel").onclick = () => close(null);
    $("#edit-save").onclick = () => close(textarea.value);
    overlay.onclick = (e) => {
      if (e.target === overlay) close(null);
    };
  });
}

// src/popup/popup.js
var $2 = (sel) => document.querySelector(sel);
var $$ = (sel) => document.querySelectorAll(sel);
var send = createMessenger();
var scriptsCache = [];
function showView(name) {
  $$(".view").forEach((v) => v.classList.add("hidden"));
  $2(`#view-${name}`)?.classList.remove("hidden");
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
}
function initTabs() {
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      showView(tab.dataset.view);
      if (tab.dataset.view === "chat") updatePageContextHint();
    });
  });
}
async function updatePageContextHint() {
  const el = $2("#page-context-hint");
  if (!el) return;
  try {
    const { settings } = await send(MSG.GET_SETTINGS);
    const { pageContextMode } = normalizePageContextSettings(settings);
    const label = pageContextMode === "html" ? "Full HTML" : "DOM Tree";
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url ? new URL(tab.url).hostname : "(no tab)";
    el.textContent = `Will send ${label} from current tab on generate \u2014 ${url}`;
  } catch (e) {
    el.textContent = `Could not load settings: ${e.message}`;
  }
}
function initScriptListDelegation() {
  const list = $2("#script-list");
  if (!list || list.dataset.bound) return;
  list.dataset.bound = "1";
  list.addEventListener("click", async (e) => {
    const header = e.target.closest('.script-header[data-action="toggle"]');
    if (header && !e.target.closest(".toggle")) {
      e.preventDefault();
      const id2 = header.dataset.id;
      if (id2) {
        const details = document.getElementById(`details-${id2}`);
        const collapseBtn = header.querySelector(".collapse-btn");
        if (details) {
          details.classList.toggle("expanded");
          collapseBtn?.classList.toggle("expanded");
        }
      }
      return;
    }
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (!id) return;
    if (action === "delete") await handleDelete(id, btn);
    if (action === "edit") await handleEdit(id);
    if (action === "export") await handleExport(id);
  });
  list.addEventListener("change", async (e) => {
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
  const ok = await showConfirm("Delete this script?");
  if (!ok) return;
  btn.disabled = true;
  try {
    await send(MSG.DELETE_SCRIPT, { id });
    await loadScripts();
    showToast("Deleted", false);
  } catch (err) {
    showToast(`Delete failed: ${err.message}`);
    btn.disabled = false;
  }
}
async function handleEdit(id) {
  const s = scriptsCache.find((x) => x.id === id);
  if (!s) {
    showToast("Script not found");
    return;
  }
  const code = await showEditDialog(s.code, `Edit ${s.name || "Untitled"}`);
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
    const blob = new Blob([code], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({
      url,
      filename: `scriptforge-${id.slice(0, 8)}.user.js`,
      saveAs: true
    });
    setTimeout(() => URL.revokeObjectURL(url), 5e3);
  } catch (err) {
    showToast(`Export failed: ${err.message}`);
  }
}
async function loadScripts() {
  const list = $2("#script-list");
  const empty = $2("#list-empty");
  if (!list) return;
  try {
    const { scripts } = await send(MSG.GET_SCRIPTS);
    scriptsCache = scripts || [];
    list.innerHTML = "";
    if (!scriptsCache.length) {
      empty?.classList.remove("hidden");
      return;
    }
    empty?.classList.add("hidden");
    for (const s of scriptsCache) {
      const li = document.createElement("li");
      li.className = "script-item";
      const matches = (s.matches || []).join(", ") || "\u2014";
      li.innerHTML = `
        <div class="script-header" data-action="toggle" data-id="${escapeAttr(s.id)}">
          <button type="button" class="collapse-btn" data-id="${escapeAttr(s.id)}">
            <svg class="v-icon" width="12" height="12" viewBox="0 0 12 12"><path d="M 1,3.5 L 6,8.5 L 11,3.5" /></svg>
          </button>
           <span class="script-name">${escapeHtml(s.name || "Untitled")}</span>
          <label class="toggle">
            <input type="checkbox" data-id="${escapeAttr(s.id)}" ${s.enabled ? "checked" : ""} />
            <span class="slider"></span>
          </label>
        </div>
        <div class="script-details" id="details-${escapeAttr(s.id)}">
          <p class="meta">${escapeHtml(matches)} \xB7 v${escapeHtml(s.version || "1.0")}</p>
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
    list.innerHTML = "";
    empty?.classList.remove("hidden");
  }
}
function initHeader() {
  const ver = chrome.runtime.getManifest().version;
  const el = $2("#header-version");
  if (el) el.textContent = `v${ver}`;
  $2("#btn-open-settings")?.addEventListener("click", () => {
    chrome.tabs.create({ url: "settings/settings.html" });
  });
}
function renderMarkdown(text) {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const codeBlocks = [];
  let processed = escaped.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const langClass = lang ? ` class="lang-${escapeHtml(lang)}"` : "";
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre${langClass}><code>${code.trim()}</code></pre>`);
    return `\x00CODEBLOCK${idx}\x00`;
  });
  const fenceMatch = processed.match(/```(\w*)\n([\s\S]*)$/);
  if (fenceMatch) {
    const [, lang, code] = fenceMatch;
    const langClass = lang ? ` class="lang-${escapeHtml(lang)}"` : "";
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre${langClass}><code>${code}</code></pre>`);
    processed = processed.slice(0, fenceMatch.index) + `\x00CODEBLOCK${idx}\x00`;
  }
  const withInlineCode = processed.replace(/`([^`]+)`/g, "<code>$1</code>");
  const withBold = withInlineCode.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  const withItalic = withBold.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  const withBreaks = withItalic.replace(/\n/g, "<br>");
  return withBreaks.replace(/\x00CODEBLOCK(\d+)\x00/g, (_, i) => codeBlocks[+i]);
}
function initChat() {
  const form = $2("#chat-form");
  const output = $2("#chat-output");
  const status = $2("#chat-status-bar");
  const input = $2("#chat-input");
  const sendBtn = $2("#btn-send");
  const emptyState = $2("#chat-empty-state");
  function showIdle() {
    emptyState?.classList.remove("hidden");
    if (output) output.classList.add("hidden");
  }
  function showActive() {
    emptyState?.classList.add("hidden");
    if (output) {
      output.innerHTML = "";
      output.classList.remove("hidden");
      output.classList.add("chat-output-streaming");
    }
  }
  function autoResize() {
    if (!input) return;
    const prevHeight = input.style.height;
    input.style.height = "auto";
    const newHeight = Math.min(input.scrollHeight, 120) + "px";
    if (prevHeight !== newHeight) {
      input.style.height = newHeight;
    }
  }
  function updateSendButton() {
    if (!sendBtn || !input) return;
    sendBtn.disabled = !input.value.trim();
  }
  input?.addEventListener("input", () => {
    autoResize();
    updateSendButton();
  });
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form?.dispatchEvent(new Event("submit", { cancelable: true }));
    }
  });
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const prompt = input.value.trim();
    if (!prompt || sendBtn?.disabled) return;
    sendBtn.disabled = true;
    input.value = "";
    updateSendButton();
    autoResize();
    status.textContent = "Generating...";
    showActive();
    let fullText = "";
    try {
      const { settings } = await send(MSG.GET_SETTINGS);
      status.textContent = "Fetching page and generating...";
      const { code, pageContext } = await generateScriptStream(prompt, settings, (token) => {
        fullText += token;
        output.innerHTML = renderMarkdown(fullText);
        output.scrollTop = output.scrollHeight;
      });
      output?.classList.remove("chat-output-streaming");
      const modeLabel = pageContext.mode === "html" ? "Full HTML" : "DOM Tree";
      const trunc = pageContext.truncated || pageContext.apiTruncated ? " (truncated)" : "";
      const minimal = pageContext.minimalFallback ? "\xB7 retried without page context" : "";
      status.textContent = `Script generated (${modeLabel}${trunc}${minimal}). Opening permission review...`;
      await analyzeAndOpenConfirm(code);
      status.textContent = "";
    } catch (err) {
      output?.classList.remove("chat-output-streaming");
      status.textContent = err.message;
      if (!fullText) {
        output.innerHTML = `<div class="chat-output-error">${escapeHtml(err.message)}</div>`;
      }
    } finally {
      output?.classList.remove("chat-output-streaming");
      sendBtn.disabled = false;
      updateSendButton();
    }
  });
  showIdle();
  updateSendButton();
}
function initImport() {
  const fileInput = $2("#import-file");
  $2("#btn-import-file")?.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const code = await file.text();
    fileInput.value = "";
    try {
      await analyzeAndOpenConfirm(code);
    } catch (e) {
      showToast(e.message);
    }
  });
}
function initSidePanel() {
  $2("#btn-open-sidepanel")?.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.windowId) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
  });
}
function showReloadHint() {
  const existing = $2("#reload-hint");
  if (existing) {
    existing.classList.remove("hidden");
    return;
  }
  const p = document.createElement("p");
  p.id = "reload-hint";
  p.className = "status";
  p.textContent = "Reload the target page for changes to take effect.";
  $2("#view-list")?.prepend(p);
}
function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
document.addEventListener("DOMContentLoaded", () => {
  initHeader();
  initTabs();
  initScriptListDelegation();
  initChat();
  initImport();
  initSidePanel();
  loadScripts();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.scripts) loadScripts();
  });
});
