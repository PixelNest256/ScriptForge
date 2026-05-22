/**
 * Content script bridge: signals page load to service worker.
 * The actual script injection is done by the service worker via chrome.scripting.executeScript.
 */
const SCRIPTFORGE_REQUEST = 'scriptforge-request';

// Notify service worker that page has loaded
chrome.runtime.sendMessage({ type: SCRIPTFORGE_REQUEST, url: location.href }, (response) => {
  if (response?.error) {
    console.error('[ScriptForge] script request error:', response.error);
  }
});
