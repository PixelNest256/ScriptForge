export async function sha256(text) {
  const normalized = normalizeScriptBody(text);
  const data = new TextEncoder().encode(normalized);
  const buf = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `sha256:${hex}`;
}

/** Normalize line endings before hash calculation (prevent Windows CRLF issues) */
export function normalizeScriptBody(body) {
  return String(body).replace(/\r\n/g, '\n').trim();
}

export function normalizeUserscriptCode(code) {
  return String(code).replace(/\r\n/g, '\n');
}

export function bodyForHash(code) {
  const { body } = parseUserscriptMeta(code);
  return normalizeScriptBody(body);
}

export function parseUserscriptMeta(code) {
  const meta = {};
  const lines = code.split('\n');
  let inBlock = false;
  let bodyStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '// ==UserScript==') {
      inBlock = true;
      continue;
    }
    if (line === '// ==/UserScript==') {
      bodyStart = i + 1;
      break;
    }
    if (inBlock) {
      const m = line.match(/^\/\/ @(\w+)\s+(.+)$/);
      if (m) {
        const key = m[1];
        const val = m[2].trim();
        if (key === 'match') {
          meta.match = meta.match || [];
          meta.match.push(val);
        } else {
          meta[key] = val;
        }
      }
    }
  }

  const body = lines.slice(bodyStart).join('\n').trim();
  return { meta, body };
}

export function embedHash(code, hash) {
  if (code.includes('@hash')) {
    return code.replace(/\/\/ @hash\s+.+/i, `// @hash         ${hash}`);
  }
  return code.replace(
    '// ==/UserScript==',
    `// @hash         ${hash}\n// ==/UserScript==`
  );
}

export async function verifyScriptHash(script) {
  if (!script.hash || !script.code) return { ok: false, reason: 'missing_hash' };
  const body = bodyForHash(script.code);
  const computed = await sha256(body);
  return { ok: computed === script.hash, computed, expected: script.hash };
}
