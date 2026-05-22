/**
 * executeScript でページ内実行される関数（外部スコープ非依存・インポート不可）
 */
export function capturePageContextInPage(mode) {
  const MAX_HTML = 60000;
  const MAX_DOM_NODES = 450;
  const MAX_DEPTH = 14;
  const MAX_TEXT = 120;

  const url = location.href;
  const title = document.title;

  if (mode === 'html') {
    let content = document.documentElement.outerHTML;
    let truncated = false;
    if (content.length > MAX_HTML) {
      content = content.slice(0, MAX_HTML);
      truncated = true;
    }
    return { mode: 'html', url, title, content, truncated, length: content.length };
  }

  const lines = [];
  let nodeCount = 0;
  let truncated = false;

  function walk(node, depth) {
    if (nodeCount >= MAX_DOM_NODES) {
      truncated = true;
      return;
    }
    if (depth > MAX_DEPTH) return;

    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t) return;
      lines.push(`${'  '.repeat(depth)}text: ${t.slice(0, MAX_TEXT)}`);
      nodeCount++;
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node;
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'noscript') return;

    let label = tag;
    if (el.id) label += `#${el.id}`;
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.trim().split(/\s+/).filter(Boolean).slice(0, 6);
      if (classes.length) label += `.${classes.join('.')}`;
    }

    const attrs = [];
    const role = el.getAttribute('role');
    const aria = el.getAttribute('aria-label');
    const href = tag === 'a' ? el.getAttribute('href') : null;
    const src = tag === 'img' ? el.getAttribute('src') : null;
    if (role) attrs.push(`role=${role}`);
    if (aria) attrs.push(`aria-label="${aria.slice(0, 60)}"`);
    if (href) attrs.push(`href="${href.slice(0, 80)}"`);
    if (src) attrs.push(`src="${src.slice(0, 80)}"`);

    const attrStr = attrs.length ? ` [${attrs.join(', ')}]` : '';
    lines.push(`${'  '.repeat(depth)}${label}${attrStr}`);
    nodeCount++;

    for (const child of el.childNodes) {
      walk(child, depth + 1);
      if (truncated) return;
    }
  }

  walk(document.documentElement, 0);

  return {
    mode: 'dom',
    url,
    title,
    content: lines.join('\n'),
    truncated,
    length: lines.length,
  };
}
