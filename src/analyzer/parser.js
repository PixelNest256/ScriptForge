import * as acorn from 'acorn';

export function parseCode(source) {
  try {
    const ast = acorn.parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      locations: true,
    });
    return { ok: true, ast };
  } catch (err) {
    return {
      ok: false,
      syntaxError: err.message,
      line: err.loc?.line,
      column: err.loc?.column,
    };
  }
}

export function getBodySource(code) {
  const lines = code.split('\n');
  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '// ==/UserScript==') {
      bodyStart = i + 1;
      break;
    }
  }
  return lines.slice(bodyStart).join('\n');
}
