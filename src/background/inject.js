import {
  parseUserscriptMeta,
  verifyScriptHash,
  normalizeUserscriptCode,
  bodyForHash,
  sha256,
  embedHash,
} from '../shared/hash.js';
import { getScripts, saveScript } from '../shared/storage.js';
import { normalizeMatchPatterns, urlMatchesAny } from '../shared/match.js';

const SCRIPT_ID_PREFIX = 'scriptforge-';

export function userScriptRegistrationId(scriptId) {
  return `${SCRIPT_ID_PREFIX}${scriptId}`;
}

function getMatchPatterns(script) {
  let patterns = script.matches?.length
    ? [...script.matches]
    : parseUserscriptMeta(script.code).meta.match || [];
  patterns = normalizeMatchPatterns(patterns.map((p) => p.trim()).filter(Boolean));
  return patterns.length ? patterns : ['<all_urls>'];
}

export function wrapUserScriptBody(body) {
  const trimmed = body.trim();
  if (/^\(?\s*function/.test(trimmed) || trimmed.startsWith('(function')) {
    return trimmed;
  }
  return `(function () {\n  'use strict';\n${body}\n})();`;
}

export async function getMatchingScriptsForUrl(url) {
  const scripts = await getScripts();
  const result = [];

  for (const script of scripts) {
    if (!script.enabled || !script.approved || !script.code) continue;

    const hashCheck = await verifyScriptHash(script);
    if (!hashCheck.ok) continue;

    const matches = getMatchPatterns(script);
    if (!urlMatchesAny(url, matches)) continue;

    const { body } = parseUserscriptMeta(script.code);
    result.push({
      id: script.id,
      code: wrapUserScriptBody(body),
    });
  }

  return result;
}

export async function syncAllUserScripts() {
  return { registered: 0, cleared: 0 };
}

async function tryRepairScriptHash(script) {
  const code = normalizeUserscriptCode(script.code);
  const body = bodyForHash(code);
  const hash = await sha256(body);
  const repairedCode = embedHash(code, hash);
  const repaired = {
    ...script,
    code: repairedCode,
    hash,
  };
  await saveScript(repaired);
  return repaired;
}

export async function injectScriptsForTab(tabId, url) {
  const scripts = await getMatchingScriptsForUrl(url);
  if (!scripts.length) return;

  for (const script of scripts) {
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'scriptforge-exec',
        code: script.code,
        scriptId: script.id,
      });
    } catch {}
  }
}
