import { MSG } from '../shared/messages.js';
import {
  sha256,
  embedHash,
  bodyForHash,
  parseUserscriptMeta,
  normalizeUserscriptCode,
} from '../shared/hash.js';
import { normalizeMatchPatterns } from '../shared/match.js';
import { createScriptId } from '../shared/storage.js';

const RISK_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };

async function init() {
  const { pendingScript } = await chrome.storage.local.get('pendingScript');
  if (!pendingScript) {
    document.body.innerHTML = '<p>No script to review.</p>';
    return;
  }

  const { code, meta, permissions, notDetected } = pendingScript;
  const name = meta.name || 'Untitled';
  const matches = (meta.match || []).join(', ') || '—';

  document.getElementById('script-info').textContent =
    `Script: ${name}\nMatches: ${matches}`;

  const detectedEl = document.getElementById('perm-detected');
  if (!permissions?.length) {
    detectedEl.innerHTML =
      '<p class="meta">No special permissions detected (DOM manipulation only).</p>';
  } else {
    for (const p of permissions) {
      const div = document.createElement('div');
      div.className = 'perm-item';
      const domains = p.domains?.length
        ? `<br><small>Targets: ${p.domains.join(', ')}</small>`
        : '';
      div.innerHTML = `
        <h4 class="risk-${p.risk}">${p.label} (risk: ${RISK_LABEL[p.risk] || p.risk})</h4>
        <p class="meta">${p.description || ''}${domains}</p>
      `;
      detectedEl.appendChild(div);
    }
  }

  if (pendingScript.lintWarnings?.length) {
    const warn = document.createElement('p');
    warn.className = 'status';
    warn.textContent = `Warning: ${pendingScript.lintWarnings.join(' / ')}`;
    document.querySelector('.not-detected')?.before(warn);
  }

  const notEl = document.getElementById('perm-not-detected');
  for (const p of notDetected || []) {
    const li = document.createElement('li');
    li.textContent = `✅ ${p.label} — not detected`;
    notEl.appendChild(li);
  }

  document.getElementById('btn-reject').addEventListener('click', async () => {
    await chrome.storage.local.remove('pendingScript');
    window.close();
  });

  document.getElementById('btn-approve').addEventListener('click', async () => {
    const status = document.getElementById('confirm-status');
    status.textContent = 'Saving...';
    try {
      const normalizedCode = normalizeUserscriptCode(code);
      const body = bodyForHash(normalizedCode);
      const hash = await sha256(body);
      let finalCode = embedHash(normalizedCode, hash);
      const { meta: m } = parseUserscriptMeta(finalCode);

      const { pendingEditId } = await chrome.storage.local.get('pendingEditId');
      let enabled = true;
      let version = m.version || '1.0';

      if (pendingEditId) {
        const { scripts } = await chrome.runtime.sendMessage({ type: MSG.GET_SCRIPTS });
        const old = scripts?.find((s) => s.id === pendingEditId);
        if (old) {
          enabled = old.enabled;
          const parts = String(old.version || '1.0').split('.');
          const minor = parseInt(parts[1] || 0, 10) + 1;
          version = `${parts[0]}.${minor}`;
        }
      }

      const script = {
        id: pendingEditId || createScriptId(),
        name: m.name || name,
        description: m.description || '',
        matches: normalizeMatchPatterns(m.match || []),
        code: finalCode,
        enabled,
        approved: true,
        hash,
        permissions: permissions || [],
        version,
        generatedBy: m['generated-by'] || '',
        generatedAt: m['generated-at'] || new Date().toISOString(),
        edited: !!pendingEditId,
      };

      await chrome.runtime.sendMessage({ type: MSG.SAVE_SCRIPT, script });
      await chrome.storage.local.remove(['pendingScript', 'pendingEditId']);
      status.textContent = 'Saved';
      setTimeout(() => window.close(), 600);
    } catch (e) {
      status.textContent = e.message;
    }
  });
}

init();
