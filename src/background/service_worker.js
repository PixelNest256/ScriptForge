import { MSG } from '../shared/messages.js';
import {
  getScripts,
  saveScript,
  deleteScript,
  toggleScript,
  getSettings,
  saveSettings,
  createScriptId,
} from '../shared/storage.js';
import { analyzeCode } from '../analyzer/index.js';
import {
  sha256,
  embedHash,
  bodyForHash,
  normalizeUserscriptCode,
  verifyScriptHash,
} from '../shared/hash.js';
import { getMatchingScriptsForUrl } from './inject.js';

const SCRIPTFORGE_REQUEST = 'scriptforge-request';

chrome.runtime.onInstalled.addListener(async () => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === SCRIPTFORGE_REQUEST && sender.tab) {
    getMatchingScriptsForUrl(message.url)
      .then((scripts) => {
        if (scripts.length && sender.tab.id) {
          injectScriptsIntoTab(sender.tab.id, scripts);
        }
        sendResponse({ ok: true, count: scripts.length });
      })
      .catch((err) => {
        console.error('[ScriptForge] getMatchingScriptsForUrl error:', err);
        sendResponse({ error: err.message });
      });
    return true;
  }

  handleMessage(message)
    .then((result) => sendResponse(result ?? { ok: true }))
    .catch((err) => {
      sendResponse({ error: err?.message || String(err) });
    });
  return true;
});

async function injectScriptsIntoTab(tabId, scripts) {
  for (const script of scripts) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (code) => {
          const s = document.createElement('script');
          s.textContent = code;
          (document.head || document.documentElement).appendChild(s);
          s.remove();
        },
        args: [script.code],
        world: 'MAIN',
      });
    } catch {}
  }
}

async function handleMessage(message) {
  switch (message.type) {
    case MSG.GET_SCRIPTS:
      return { scripts: await getScripts() };

    case MSG.SAVE_SCRIPT: {
      const script = message.script;
      if (!script.id) script.id = createScriptId();
      if (script.code) {
        script.code = normalizeUserscriptCode(script.code);
        if (!script.hash) {
          const body = bodyForHash(script.code);
          script.hash = await sha256(body);
          script.code = embedHash(script.code, script.hash);
        }
      }
      script.approved = script.approved ?? true;
      await saveScript(script);
      return { script, reloadHint: true };
    }

    case MSG.DELETE_SCRIPT: {
      if (!message.id) return { error: 'Script ID is missing' };
      await deleteScript(message.id);
      return { ok: true };
    }

    case MSG.TOGGLE_SCRIPT: {
      const s = await toggleScript(message.id, message.enabled);
      return { script: s, reloadHint: true };
    }

    case MSG.INJECT_TAB:
      if (message.tabId && message.url) {
        const scripts = await getMatchingScriptsForUrl(message.url);
        if (scripts.length) {
          await injectScriptsIntoTab(message.tabId, scripts);
        }
      }
      return { ok: true, reloadHint: true };

    case MSG.ANALYZE_CODE:
      return analyzeCode(message.code);

    case MSG.GET_SETTINGS:
      return { settings: await getSettings() };

    case MSG.SAVE_SETTINGS:
      await saveSettings(message.settings);
      return { settings: message.settings };

    case MSG.VERIFY_HASH: {
      const script = (await getScripts()).find((s) => s.id === message.id);
      if (!script) return { ok: false };
      return verifyScriptHash(script);
    }

    case MSG.EXPORT_SCRIPT: {
      const script = (await getScripts()).find((s) => s.id === message.id);
      return { code: script?.code || '' };
    }

    case MSG.IMPORT_SCRIPT:
      return analyzeCode(message.code);

    default:
      return { error: 'Unknown message type' };
  }
}
