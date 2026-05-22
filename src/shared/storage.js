const SCRIPTS_KEY = 'scripts';
const SETTINGS_KEY = 'settings';

export async function getScripts() {
  const { [SCRIPTS_KEY]: scripts = [] } = await chrome.storage.local.get(SCRIPTS_KEY);
  return scripts;
}

export async function saveScript(script) {
  const scripts = await getScripts();
  const idx = scripts.findIndex((s) => s.id === script.id);
  if (idx >= 0) {
    scripts[idx] = script;
  } else {
    scripts.push(script);
  }
  await chrome.storage.local.set({ [SCRIPTS_KEY]: scripts });
  return script;
}

export async function deleteScript(id) {
  const scripts = (await getScripts()).filter((s) => s.id !== id);
  await chrome.storage.local.set({ [SCRIPTS_KEY]: scripts });
}

export async function getScript(id) {
  return (await getScripts()).find((s) => s.id === id);
}

export async function toggleScript(id, enabled) {
  const scripts = await getScripts();
  const s = scripts.find((x) => x.id === id);
  if (s) {
    s.enabled = enabled;
    await chrome.storage.local.set({ [SCRIPTS_KEY]: scripts });
  }
  return s;
}

export async function getSettings() {
  const { [SETTINGS_KEY]: settings = {} } = await chrome.storage.local.get(SETTINGS_KEY);
  return settings;
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  return settings;
}

export function createScriptId() {
  return crypto.randomUUID();
}
