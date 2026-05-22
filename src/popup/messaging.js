export function createMessenger() {
  return function send(type, payload = {}) {
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
