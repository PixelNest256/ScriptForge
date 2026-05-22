import * as walk from 'acorn-walk';

export const PERMISSION_CATALOG = {
  network: {
    id: 'network',
    label: 'Network',
    risk: 'high',
    description: 'fetch / XMLHttpRequest / WebSocket communication',
  },
  keyboard: {
    id: 'keyboard',
    label: 'Keyboard Input',
    risk: 'high',
    description: 'Keyboard event monitoring',
  },
  cookie: {
    id: 'cookie',
    label: 'Cookie',
    risk: 'high',
    description: 'document.cookie access',
  },
  clipboard: {
    id: 'clipboard',
    label: 'Clipboard',
    risk: 'medium',
    description: 'navigator.clipboard access',
  },
  storage: {
    id: 'storage',
    label: 'Local Storage',
    risk: 'medium',
    description: 'localStorage / sessionStorage',
  },
  dom_read: {
    id: 'dom_read',
    label: 'DOM Read',
    risk: 'low',
    description: 'Page content reading',
  },
  dom_write: {
    id: 'dom_write',
    label: 'DOM Write',
    risk: 'low',
    description: 'Page appearance or structure changes',
  },
};

export function detectPermissions(ast) {
  const found = new Map();
  const networkDomains = new Set();

  walk.simple(ast, {
    CallExpression(node) {
      checkNetwork(node, found, networkDomains);
      checkDomWrite(node, found);
    },
    MemberExpression(node) {
      checkCookie(node, found);
      checkStorage(node, found);
      checkClipboard(node, found);
      checkDomRead(node, found);
      checkDomWriteMember(node, found);
    },
    NewExpression(node) {
      if (node.callee.type === 'Identifier' && node.callee.name === 'WebSocket') {
        addPerm(found, 'network', { domains: [] });
      }
    },
  });

  walk.simple(ast, {
    CallExpression(node) {
      if (isAddEventListener(node, ['keydown', 'keyup', 'keypress'])) {
        addPerm(found, 'keyboard');
      }
    },
  });

  return Array.from(found.values()).map((p) => ({
    ...PERMISSION_CATALOG[p.id],
    ...p,
    domains: p.domains?.length ? [...p.domains] : undefined,
  }));
}

function addPerm(found, id, extra = {}) {
  const existing = found.get(id) || { id, domains: [] };
  if (extra.domains) {
    existing.domains = [...new Set([...(existing.domains || []), ...extra.domains])];
  }
  found.set(id, existing);
}

function checkNetwork(node, found, domains) {
  const callee = node.callee;
  if (callee.type === 'Identifier' && callee.name === 'fetch') {
    extractUrlDomain(node.arguments[0], domains);
    addPerm(found, 'network', { domains: [...domains] });
  }
  if (callee.type === 'Identifier' && callee.name === 'WebSocket') {
    extractUrlDomain(node.arguments[0], domains);
    addPerm(found, 'network', { domains: [...domains] });
  }
  if (
    callee.type === 'MemberExpression' &&
    callee.object?.name === 'XMLHttpRequest' &&
    callee.property?.name === 'open'
  ) {
    extractUrlDomain(node.arguments[1], domains);
    addPerm(found, 'network', { domains: [...domains] });
  }
}

function extractUrlDomain(arg, domains) {
  if (arg?.type === 'Literal' && typeof arg.value === 'string') {
    try {
      const u = new URL(arg.value);
      domains.add(u.hostname);
    } catch {
      /* ignore */
    }
  }
}

function isAddEventListener(node, events) {
  const c = node.callee;
  if (
    c.type === 'MemberExpression' &&
    c.property?.name === 'addEventListener' &&
    node.arguments[0]?.type === 'Literal'
  ) {
    return events.includes(node.arguments[0].value);
  }
  return false;
}

function checkCookie(node, found) {
  if (
    node.object?.type === 'Identifier' &&
    node.object.name === 'document' &&
    node.property?.name === 'cookie'
  ) {
    addPerm(found, 'cookie');
  }
}

function checkStorage(node, found) {
  const name = node.object?.name;
  if (name === 'localStorage' || name === 'sessionStorage') {
    addPerm(found, 'storage');
  }
}

function checkClipboard(node, found) {
  if (node.object?.type === 'Identifier' && node.object.name === 'navigator') {
    if (node.property?.name === 'clipboard') addPerm(found, 'clipboard');
  }
}

function checkDomRead(node, found) {
  const prop = node.property?.name;
  if (['textContent', 'innerText', 'value'].includes(prop)) {
    addPerm(found, 'dom_read');
  }
  if (prop === 'innerHTML') {
    addPerm(found, 'dom_read');
  }
}

function checkDomWrite(node, found) {
  const c = node.callee;
  if (
    c.type === 'MemberExpression' &&
    ['appendChild', 'insertBefore', 'replaceChild', 'removeChild'].includes(c.property?.name)
  ) {
    addPerm(found, 'dom_write');
  }
  if (c.type === 'Identifier' && ['append', 'prepend', 'replaceWith'].includes(c.name)) {
    addPerm(found, 'dom_write');
  }
}

function checkDomWriteMember(node, found) {
  const prop = node.property?.name;
  if (['innerHTML', 'outerHTML', 'insertAdjacentHTML'].includes(prop)) {
    addPerm(found, 'dom_write');
  }
  if (prop === 'style') {
    addPerm(found, 'dom_write');
  }
}
