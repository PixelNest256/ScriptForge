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
async function sha256(text) {
  const normalized = normalizeScriptBody(text);
  const data = new TextEncoder().encode(normalized);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}
function normalizeScriptBody(body) {
  return String(body).replace(/\r\n/g, "\n").trim();
}
function normalizeUserscriptCode(code) {
  return String(code).replace(/\r\n/g, "\n");
}
function bodyForHash(code) {
  const { body } = parseUserscriptMeta(code);
  return normalizeScriptBody(body);
}
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
function embedHash(code, hash) {
  if (code.includes("@hash")) {
    return code.replace(/\/\/ @hash\s+.+/i, `// @hash         ${hash}`);
  }
  return code.replace(
    "// ==/UserScript==",
    `// @hash         ${hash}
// ==/UserScript==`
  );
}

// src/shared/match.js
function normalizeMatchPattern(pattern) {
  const p = String(pattern).trim();
  if (!p) return p;
  if (p.includes("*")) return p;
  if (p.endsWith("/")) return `${p}*`;
  return p;
}
function normalizeMatchPatterns(patterns) {
  return [...new Set(patterns.map(normalizeMatchPattern).filter(Boolean))];
}

// src/shared/storage.js
function createScriptId() {
  return crypto.randomUUID();
}

// src/permissions_ui/confirm.js
var RISK_LABEL = { high: "High", medium: "Medium", low: "Low" };
async function init() {
  const { pendingScript } = await chrome.storage.local.get("pendingScript");
  if (!pendingScript) {
    document.body.innerHTML = "<p>No script to review.</p>";
    return;
  }
  const { code, meta, permissions, notDetected } = pendingScript;
  const name = meta.name || "Untitled";
  const matches = (meta.match || []).join(", ") || "\u2014";
  document.getElementById("script-info").textContent = `Script: ${name}
Matches: ${matches}`;
  const detectedEl = document.getElementById("perm-detected");
  if (!permissions?.length) {
    detectedEl.innerHTML = '<p class="meta">No special permissions detected (DOM manipulation only).</p>';
  } else {
    for (const p of permissions) {
      const div = document.createElement("div");
      div.className = "perm-item";
      const domains = p.domains?.length ? `<br><small>Targets: ${p.domains.join(", ")}</small>` : "";
      div.innerHTML = `
        <h4 class="risk-${p.risk}">${p.label} (risk: ${RISK_LABEL[p.risk] || p.risk})</h4>
        <p class="meta">${p.description || ""}${domains}</p>
      `;
      detectedEl.appendChild(div);
    }
  }
  if (pendingScript.lintWarnings?.length) {
    const warn = document.createElement("p");
    warn.className = "status";
    warn.textContent = `Warning: ${pendingScript.lintWarnings.join(" / ")}`;
    document.querySelector(".not-detected")?.before(warn);
  }
  const notEl = document.getElementById("perm-not-detected");
  for (const p of notDetected || []) {
    const li = document.createElement("li");
    li.textContent = `\u2705 ${p.label} \u2014 not detected`;
    notEl.appendChild(li);
  }
  document.getElementById("btn-reject").addEventListener("click", async () => {
    await chrome.storage.local.remove("pendingScript");
    window.close();
  });
  document.getElementById("btn-approve").addEventListener("click", async () => {
    const status = document.getElementById("confirm-status");
    status.textContent = "Saving...";
    try {
      const normalizedCode = normalizeUserscriptCode(code);
      const body = bodyForHash(normalizedCode);
      const hash = await sha256(body);
      let finalCode = embedHash(normalizedCode, hash);
      const { meta: m } = parseUserscriptMeta(finalCode);
      const { pendingEditId } = await chrome.storage.local.get("pendingEditId");
      let enabled = true;
      let version = m.version || "1.0";
      if (pendingEditId) {
        const { scripts } = await chrome.runtime.sendMessage({ type: MSG.GET_SCRIPTS });
        const old = scripts?.find((s) => s.id === pendingEditId);
        if (old) {
          enabled = old.enabled;
          const parts = String(old.version || "1.0").split(".");
          const minor = parseInt(parts[1] || 0, 10) + 1;
          version = `${parts[0]}.${minor}`;
        }
      }
      const script = {
        id: pendingEditId || createScriptId(),
        name: m.name || name,
        description: m.description || "",
        matches: normalizeMatchPatterns(m.match || []),
        code: finalCode,
        enabled,
        approved: true,
        hash,
        permissions: permissions || [],
        version,
        generatedBy: m["generated-by"] || "",
        generatedAt: m["generated-at"] || (/* @__PURE__ */ new Date()).toISOString(),
        edited: !!pendingEditId
      };
      await chrome.runtime.sendMessage({ type: MSG.SAVE_SCRIPT, script });
      await chrome.storage.local.remove(["pendingScript", "pendingEditId"]);
      status.textContent = "Saved";
      setTimeout(() => window.close(), 600);
    } catch (e) {
      status.textContent = e.message;
    }
  });
}
init();
