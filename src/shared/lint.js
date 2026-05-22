/**
 * Lightweight lint checks for generated userscript body (runs in extension).
 */
export function lintGeneratedBody(body) {
  const warnings = [];
  const errors = [];

  if (/\beval\s*\(/.test(body)) errors.push('eval() is present');
  if (/\bnew\s+Function\s*\(/.test(body)) errors.push('new Function() is present');
  if (/setTimeout\s*\(\s*['"`]/.test(body)) errors.push('String passed to setTimeout');
  if (/setInterval\s*\(\s*['"`]/.test(body)) errors.push('String passed to setInterval');

  if (body.length > 50000) warnings.push('Script is too large (over 50KB)');
  if ((body.match(/\bfunction\b/g) || []).length > 50) {
    warnings.push('Too many functions. Please verify the intended code');
  }

  return { ok: errors.length === 0, errors, warnings };
}
