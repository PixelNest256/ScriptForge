import {
  parseUserscriptMeta,
  verifyScriptHash,
  normalizeUserscriptCode,
  bodyForHash,
  sha256,
  embedHash,
} from '../shared/hash.js';
import { getScripts, saveScript } from '../shared/storage.js';
import { normalizeMatchPatterns } from '../shared/match.js';
import { urlMatchesAny } from '../shared/match.js';

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

/** Userscript 本文をコンテンツスクリプト実行用にラップ */
export function wrapUserScriptBody(body) {
  const trimmed = body.trim();
  if (/^\(?\s*function/.test(trimmed) || trimmed.startsWith('(function')) {
    return trimmed;
  }
  return `(function () {\n  'use strict';\n${body}\n})();`;
}

/**
 * 指定URLにマッチする有効スクリプトを返す。
 * コンテンツスクリプトブリッジ方式のため、API登録は不要。
 */
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

/** 互換用: 現在はコンテンツスクリプトブリッジ方式のため即時解決 */
export async function syncAllUserScripts() {
  console.log('[ScriptForge] syncAllUserScripts: content script bridge mode (no API registration needed)');
  return { registered: 0, cleared: 0 };
}

/** CRLF 等でずれた hash を本文から再計算して修復 */
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
  console.info(`[ScriptForge] Repaired hash for script ${script.id}`);
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
    } catch {
      // Tab may not have content script loaded yet
    }
  }
}
