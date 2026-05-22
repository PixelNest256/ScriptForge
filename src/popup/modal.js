const $ = (sel) => document.querySelector(sel);

export function showToast(message, isError = true) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('p');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.toggle('toast-error', isError);
  el.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => el.classList.add('hidden'), 5000);
}

export function showConfirm(message) {
  return new Promise((resolve) => {
    const overlay = $('#modal-overlay');
    const msg = $('#modal-message');
    const actions = $('#modal-actions');
    if (!overlay || !msg || !actions) {
      resolve(window.confirm(message));
      return;
    }

    msg.textContent = message;
    actions.innerHTML = `
      <button type="button" class="btn secondary" data-modal="cancel">キャンセル</button>
      <button type="button" class="btn danger" data-modal="ok">OK</button>
    `;
    overlay.classList.remove('hidden');

    const close = (result) => {
      overlay.classList.add('hidden');
      actions.replaceChildren();
      resolve(result);
    };

    actions.onclick = (e) => {
      const btn = e.target.closest('[data-modal]');
      if (!btn) return;
      close(btn.dataset.modal === 'ok');
    };
    overlay.onclick = (e) => {
      if (e.target === overlay) close(false);
    };
  });
}

export function showEditDialog(code, title = 'スクリプトを編集') {
  return new Promise((resolve) => {
    const overlay = $('#edit-overlay');
    const textarea = $('#edit-code');
    const titleEl = $('#edit-title');
    if (!overlay || !textarea) {
      const result = window.prompt('スクリプトを編集:', code);
      resolve(result);
      return;
    }

    if (titleEl) titleEl.textContent = title;
    textarea.value = code;
    overlay.classList.remove('hidden');
    textarea.focus();

    const close = (result) => {
      overlay.classList.add('hidden');
      resolve(result);
    };

    $('#edit-cancel').onclick = () => close(null);
    $('#edit-save').onclick = () => close(textarea.value);
    overlay.onclick = (e) => {
      if (e.target === overlay) close(null);
    };
  });
}

export function showPrompt(message, defaultValue = '') {
  return new Promise((resolve) => {
    const overlay = $('#prompt-overlay');
    const input = $('#prompt-input');
    const msg = $('#prompt-message');
    if (!overlay || !input) {
      resolve(window.prompt(message, defaultValue));
      return;
    }

    msg.textContent = message;
    input.value = defaultValue;
    overlay.classList.remove('hidden');
    input.focus();

    const close = (result) => {
      overlay.classList.add('hidden');
      resolve(result);
    };

    $('#prompt-cancel').onclick = () => close(null);
    $('#prompt-ok').onclick = () => close(input.value.trim() || null);
    overlay.onclick = (e) => {
      if (e.target === overlay) close(null);
    };
  });
}
