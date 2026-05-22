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
    label: "Ollama\uFF08\u30ED\u30FC\u30AB\u30EB\uFF09",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.2"
  },
  {
    id: "lmstudio",
    label: "LM Studio\uFF08\u30ED\u30FC\u30AB\u30EB\uFF09",
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
    hints.push("\u4E0A\u6D41\u30D7\u30ED\u30D0\u30A4\u30C0\u304C\u30A8\u30E9\u30FC\u3092\u8FD4\u3057\u307E\u3057\u305F\uFF08\u30E2\u30C7\u30EB\u969C\u5BB3\u30FB\u4E00\u6642\u7684\u306A\u904E\u8CA0\u8377\u306E\u3053\u3068\u304C\u3042\u308A\u307E\u3059\uFF09");
    hints.push("\u8A2D\u5B9A\u306E\u300CDOM\u30C4\u30EA\u30FC\u300D\u30E2\u30FC\u30C9\u3092\u8A66\u3059\uFF08HTML\u5168\u6587\u3088\u308A\u8EFD\u91CF\uFF09");
    hints.push("\u5225\u306E\u30E2\u30C7\u30EB\u540D\u306B\u5909\u66F4\uFF08\u4F8B: OpenRouter \u306A\u3089 openai/gpt-4o-mini\uFF09");
  }
  if (/context|token|length|too large|maximum/i.test(m)) {
    hints.push("\u30DA\u30FC\u30B8\u60C5\u5831\u304C\u5927\u304D\u3059\u304E\u307E\u3059\u3002\u8A2D\u5B9A\u3067 DOM \u30C4\u30EA\u30FC\u3092\u9078\u3076\u304B\u3001\u8981\u7D20\u306E\u5C11\u306A\u3044\u30DA\u30FC\u30B8\u3067\u8A66\u3057\u3066\u304F\u3060\u3055\u3044");
  }
  if (status === 401 || /auth|api.?key|unauthorized/i.test(m)) {
    hints.push("API \u30AD\u30FC\u304C\u7121\u52B9\u307E\u305F\u306F\u672A\u8A2D\u5B9A\u3067\u3059");
  }
  if (status === 404 || /model.*not found|does not exist/i.test(m)) {
    hints.push("\u30E2\u30C7\u30EB\u540D\u304C\u5B58\u5728\u3057\u307E\u305B\u3093\u3002\u30D7\u30ED\u30D0\u30A4\u30C0\u306E\u30C9\u30AD\u30E5\u30E1\u30F3\u30C8\u3067\u6B63\u3057\u3044 ID \u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044");
  }
  if (hints.length === 0) return m;
  return `${m}

\u3010\u5BFE\u51E6\u306E\u30D2\u30F3\u30C8\u3011
${hints.map((h) => `\u30FB${h}`).join("\n")}`;
}
function extractMessageContent(data) {
  const choice = data?.choices?.[0];
  if (!choice) return "";
  if (choice.error) {
    const e = choice.error;
    throw new Error(
      typeof e === "string" ? e : e.message || "\u30E2\u30C7\u30EB\u304C\u30A8\u30E9\u30FC\u3092\u8FD4\u3057\u307E\u3057\u305F"
    );
  }
  if (choice.finish_reason === "error") {
    throw new Error("\u30E2\u30C7\u30EB\u304C\u30A8\u30E9\u30FC\u7D42\u4E86\u3057\u307E\u3057\u305F\uFF08finish_reason: error\uFF09");
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
    throw new Error("\u30E2\u30C7\u30EB\u540D\u3092\u8A2D\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044");
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
      `\u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u30A8\u30E9\u30FC: ${netErr.message}\uFF08URL\u30FBCORS\u30FB\u30ED\u30FC\u30AB\u30EB API \u306E\u8D77\u52D5\u3092\u78BA\u8A8D\uFF09`
    );
  }
  const rawText = await res.text();
  let data = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(
      `API \u304C JSON \u4EE5\u5916\u3092\u8FD4\u3057\u307E\u3057\u305F (${res.status}): ${rawText.slice(0, 200)}`
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
      "API \u304B\u3089\u7A7A\u306E\u5FDC\u7B54\u304C\u8FD4\u3055\u308C\u307E\u3057\u305F\u3002\u30E2\u30C7\u30EB\u540D\u30FB\u30B3\u30F3\u30C6\u30AD\u30B9\u30C8\u9577\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044"
    );
  }
  return text.trim();
}
function isRetryableApiError(err) {
  const m = String(err?.message || "");
  return /provider returned error/i.test(m) || /context|token|length|too large|maximum/i.test(m) || /empty|空の応答/i.test(m);
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
  if (!tab?.id) throw new Error("\u30A2\u30AF\u30C6\u30A3\u30D6\u306A\u30BF\u30D6\u304C\u3042\u308A\u307E\u305B\u3093");
  if (isRestrictedUrl(tab.url)) {
    throw new Error("\u3053\u306E\u30DA\u30FC\u30B8\u3067\u306F HTML / DOM \u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\uFF08\u30D6\u30E9\u30A6\u30B6\u5185\u90E8\u30DA\u30FC\u30B8\uFF09");
  }
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: capturePageContextInPage,
    args: [mode]
  });
  if (!result?.content) {
    throw new Error("\u30DA\u30FC\u30B8\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F");
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
Output ONLY a complete Tampermonkey-compatible userscript with NO markdown fences.

Requirements:
- Start with // ==UserScript== block containing @name, @description, @match (at least one), @version
- End metadata with // ==/UserScript==
- Body must be an IIFE: (function () { 'use strict'; ... })();
- NEVER use eval, new Function, dynamic import(), or string arguments to setTimeout/setInterval
- Prefer DOM styling/manipulation only unless user explicitly needs network/storage
- Use @match patterns appropriate for the current page URL provided in the user message
- Use selectors that match the provided page HTML or DOM snapshot
- Add @generated-by and @generated-at in metadata (@generated-by should include the model name)
- Write code in JavaScript only`;
async function generateScript(prompt, settings) {
  const llm = normalizeLlmSettings(settings);
  const { pageContextMode } = normalizePageContextSettings(settings);
  if (!llm.llmApiKey && !isLocalBaseUrl(llm.llmBaseUrl)) {
    throw new Error("API\u30AD\u30FC\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093\uFF08\u30ED\u30FC\u30AB\u30EB API \u306E\u5834\u5408\u306F\u7A7A\u3067\u3082\u53EF\uFF09");
  }
  const pageContext = await captureActiveTabPageContext(pageContextMode);
  const limited = limitPageContextForApi(pageContext);
  let userPrompt = buildPromptWithPageContext(prompt, limited);
  let usedMinimal = false;
  try {
    const text = await chatCompletion({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      settings
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
    throw new Error(`\u69CB\u6587\u30A8\u30E9\u30FC: ${result.syntaxError}`);
  }
  if (result.blocked?.length) {
    const msgs = result.blocked.map((b) => b.message).join("\n");
    throw new Error(`\u30D6\u30ED\u30C3\u30AF\u3055\u308C\u307E\u3057\u305F:
${msgs}`);
  }
  if (result.lintErrors?.length) {
    throw new Error(`Lint \u30A8\u30E9\u30FC:
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
      <button type="button" class="btn secondary" data-modal="cancel">\u30AD\u30E3\u30F3\u30BB\u30EB</button>
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
function showEditDialog(code, title = "\u30B9\u30AF\u30EA\u30D7\u30C8\u3092\u7DE8\u96C6") {
  return new Promise((resolve) => {
    const overlay = $("#edit-overlay");
    const textarea = $("#edit-code");
    const titleEl = $("#edit-title");
    if (!overlay || !textarea) {
      const result = window.prompt("\u30B9\u30AF\u30EA\u30D7\u30C8\u3092\u7DE8\u96C6:", code);
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
function showPrompt(message, defaultValue = "") {
  return new Promise((resolve) => {
    const overlay = $("#prompt-overlay");
    const input = $("#prompt-input");
    const msg = $("#prompt-message");
    if (!overlay || !input) {
      resolve(window.prompt(message, defaultValue));
      return;
    }
    msg.textContent = message;
    input.value = defaultValue;
    overlay.classList.remove("hidden");
    input.focus();
    const close = (result) => {
      overlay.classList.add("hidden");
      resolve(result);
    };
    $("#prompt-cancel").onclick = () => close(null);
    $("#prompt-ok").onclick = () => close(input.value.trim() || null);
    overlay.onclick = (e) => {
      if (e.target === overlay) close(null);
    };
  });
}

// src/popup/settings-ui.js
var $2 = (sel) => document.querySelector(sel);
function renderSettingsPresets(container) {
  container.innerHTML = "";
  for (const preset of LLM_PRESETS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn secondary preset-btn";
    btn.textContent = preset.label;
    btn.title = preset.baseUrl;
    btn.addEventListener("click", () => applyPreset(preset));
    container.appendChild(btn);
  }
}
function applyPreset(preset) {
  $2("#api-base-url").value = preset.baseUrl;
  $2("#api-model").value = preset.model;
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
function initSettings(send2) {
  const presetsEl = $2("#settings-presets");
  if (presetsEl) renderSettingsPresets(presetsEl);
  const saveBtn = $2("#btn-save-settings");
  console.log("[ScriptForge] save button found:", !!saveBtn);
  saveBtn?.addEventListener("click", async (e) => {
    console.log("[ScriptForge] save button clicked");
    e.preventDefault();
    try {
      const settings = readSettingsForm();
      console.log("[ScriptForge] sending settings:", settings);
      await send2(MSG.SAVE_SETTINGS, { settings });
      console.log("[ScriptForge] settings saved successfully");
      $2("#settings-status").textContent = "\u4FDD\u5B58\u3057\u307E\u3057\u305F";
    } catch (err) {
      console.error("[ScriptForge] save settings error:", err);
      $2("#settings-status").textContent = `\u4FDD\u5B58\u5931\u6557: ${err.message}`;
    }
  });
  $2("#btn-test-api")?.addEventListener("click", async () => {
    const status = $2("#settings-status");
    status.textContent = "\u63A5\u7D9A\u30C6\u30B9\u30C8\u4E2D...";
    try {
      const form = readSettingsForm();
      await chatCompletion({
        systemPrompt: "Reply with exactly: OK",
        userPrompt: "ping",
        settings: form
      });
      status.textContent = "\u63A5\u7D9A\u6210\u529F";
    } catch (e) {
      status.textContent = `\u63A5\u7D9A\u5931\u6557: ${e.message}`;
      showToast(`\u63A5\u7D9A\u5931\u6557: ${e.message}`);
    }
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

// src/popup/popup.js
var $3 = (sel) => document.querySelector(sel);
var $$ = (sel) => document.querySelectorAll(sel);
var send = createMessenger();
var scriptsCache = [];
function showView(name) {
  $$(".view").forEach((v) => v.classList.add("hidden"));
  $3(`#view-${name}`)?.classList.remove("hidden");
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
  const el = $3("#page-context-hint");
  if (!el) return;
  try {
    const { settings } = await send(MSG.GET_SETTINGS);
    const { pageContextMode } = normalizePageContextSettings(settings);
    const label = pageContextMode === "html" ? "HTML \u5168\u6587" : "DOM \u30C4\u30EA\u30FC";
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url ? new URL(tab.url).hostname : "\uFF08\u30BF\u30D6\u306A\u3057\uFF09";
    el.textContent = `\u751F\u6210\u6642\u306B\u73FE\u5728\u306E\u30BF\u30D6\u3078 ${label} \u3092\u9001\u4FE1\u3057\u307E\u3059 \u2014 ${url}`;
  } catch (e) {
    el.textContent = `\u8A2D\u5B9A\u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093: ${e.message}`;
  }
}
function initScriptListDelegation() {
  const list = $3("#script-list");
  if (!list || list.dataset.bound) return;
  list.dataset.bound = "1";
  list.addEventListener("click", async (e) => {
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
      showToast(`\u6709\u52B9\u5316\u306E\u5909\u66F4\u306B\u5931\u6557: ${err.message}`);
      cb.checked = !cb.checked;
    }
  });
}
async function handleDelete(id, btn) {
  const ok = await showConfirm("\u3053\u306E\u30B9\u30AF\u30EA\u30D7\u30C8\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F");
  if (!ok) return;
  btn.disabled = true;
  try {
    await send(MSG.DELETE_SCRIPT, { id });
    await loadScripts();
    showToast("\u524A\u9664\u3057\u307E\u3057\u305F", false);
  } catch (err) {
    showToast(`\u524A\u9664\u306B\u5931\u6557: ${err.message}`);
    btn.disabled = false;
  }
}
async function handleEdit(id) {
  const s = scriptsCache.find((x) => x.id === id);
  if (!s) {
    showToast("\u30B9\u30AF\u30EA\u30D7\u30C8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
    return;
  }
  const code = await showEditDialog(s.code, `${s.name || "\u7121\u984C"} \u3092\u7DE8\u96C6`);
  if (code == null || code === s.code) return;
  try {
    await chrome.storage.local.set({ pendingEditId: id });
    await analyzeAndOpenConfirm(code);
  } catch (err) {
    showToast(`\u7DE8\u96C6\u306E\u4FDD\u5B58\u306B\u5931\u6557: ${err.message}`);
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
    showToast(`\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u306B\u5931\u6557: ${err.message}`);
  }
}
async function loadScripts() {
  const list = $3("#script-list");
  const empty = $3("#list-empty");
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
        <h3>${escapeHtml(s.name || "\u7121\u984C")}</h3>
        <p class="meta">${escapeHtml(matches)} \xB7 v${escapeHtml(s.version || "1.0")}</p>
        <div class="actions">
          <label class="toggle">
            <input type="checkbox" data-id="${escapeAttr(s.id)}" ${s.enabled ? "checked" : ""} />
            \u6709\u52B9
          </label>
          <button type="button" class="btn secondary" data-action="export" data-id="${escapeAttr(s.id)}">\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8</button>
          <button type="button" class="btn secondary" data-action="edit" data-id="${escapeAttr(s.id)}">\u7DE8\u96C6</button>
          <button type="button" class="btn danger" data-action="delete" data-id="${escapeAttr(s.id)}">\u524A\u9664</button>
        </div>
      `;
      list.appendChild(li);
    }
  } catch (err) {
    showToast(`\u4E00\u89A7\u306E\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557: ${err.message}`);
    scriptsCache = [];
    list.innerHTML = "";
    empty?.classList.remove("hidden");
  }
}
async function loadSettings() {
  try {
    const { settings } = await send(MSG.GET_SETTINGS);
    loadSettingsForm(settings);
  } catch (err) {
    showToast(`\u8A2D\u5B9A\u306E\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557: ${err.message}`);
  }
}
function initChat() {
  const form = $3("#chat-form");
  const messages = $3("#chat-messages");
  const status = $3("#chat-status");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $3("#chat-input");
    const prompt = input.value.trim();
    if (!prompt) return;
    appendBubble(messages, "user", prompt);
    input.value = "";
    status.textContent = "\u751F\u6210\u4E2D...";
    $3("#btn-send").disabled = true;
    try {
      const { settings } = await send(MSG.GET_SETTINGS);
      status.textContent = "\u30DA\u30FC\u30B8\u3092\u53D6\u5F97\u3057\u3066\u751F\u6210\u4E2D...";
      const { code, pageContext } = await generateScript(prompt, settings);
      const modeLabel = pageContext.mode === "html" ? "HTML\u5168\u6587" : "DOM\u30C4\u30EA\u30FC";
      const trunc = pageContext.truncated || pageContext.apiTruncated ? "\uFF08\u4E00\u90E8\u7701\u7565\uFF09" : "";
      const minimal = pageContext.minimalFallback ? "\u30FB\u30DA\u30FC\u30B8\u60C5\u5831\u306A\u3057\u3067\u518D\u8A66\u884C\u6E08" : "";
      appendBubble(
        messages,
        "assistant",
        `\u30B9\u30AF\u30EA\u30D7\u30C8\u3092\u751F\u6210\u3057\u307E\u3057\u305F\uFF08${modeLabel}${trunc}${minimal}\uFF09\u3002\u6A29\u9650\u78BA\u8A8D\u753B\u9762\u3092\u958B\u304D\u307E\u3059...`
      );
      await analyzeAndOpenConfirm(code);
      status.textContent = "\u6A29\u9650\u78BA\u8A8D\u753B\u9762\u3067\u627F\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044";
      window.addEventListener("focus", () => loadScripts(), { once: true });
    } catch (err) {
      status.textContent = err.message;
      appendBubble(messages, "assistant", `\u30A8\u30E9\u30FC: ${err.message}`);
    } finally {
      $3("#btn-send").disabled = false;
    }
  });
}
function appendBubble(container, role, text) {
  if (!container) return;
  const div = document.createElement("div");
  div.className = `chat-bubble ${role}`;
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}
function initImport() {
  const fileInput = $3("#import-file");
  $3("#btn-import-file")?.addEventListener("click", () => fileInput?.click());
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
  $3("#btn-import-url")?.addEventListener("click", async () => {
    const url = await showPrompt("\u30A4\u30F3\u30DD\u30FC\u30C8\u3059\u308B .user.js \u306E URL:");
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
  $3("#btn-open-sidepanel")?.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.windowId) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
  });
}
function showReloadHint() {
  const existing = $3("#reload-hint");
  if (existing) {
    existing.classList.remove("hidden");
    return;
  }
  const p = document.createElement("p");
  p.id = "reload-hint";
  p.className = "status";
  p.textContent = "\u53CD\u6620\u3059\u308B\u306B\u306F\u5BFE\u8C61\u30DA\u30FC\u30B8\u3092\u518D\u8AAD\u307F\u8FBC\u307F\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
  $3("#view-list")?.prepend(p);
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
  initTabs();
  initScriptListDelegation();
  initSettings(send);
  initChat();
  initImport();
  initSidePanel();
  loadScripts();
  loadSettings();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.scripts) loadScripts();
  });
});
