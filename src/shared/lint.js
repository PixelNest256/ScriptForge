/**
 * Lightweight lint checks for generated userscript body (runs in extension).
 */
export function lintGeneratedBody(body) {
  const warnings = [];
  const errors = [];

  if (/\beval\s*\(/.test(body)) errors.push('eval() が含まれています');
  if (/\bnew\s+Function\s*\(/.test(body)) errors.push('new Function() が含まれています');
  if (/setTimeout\s*\(\s*['"`]/.test(body)) errors.push('setTimeout に文字列が渡されています');
  if (/setInterval\s*\(\s*['"`]/.test(body)) errors.push('setInterval に文字列が渡されています');

  if (body.length > 50000) warnings.push('スクリプトが大きすぎます（50KB超）');
  if ((body.match(/\bfunction\b/g) || []).length > 50) {
    warnings.push('関数が多すぎます。意図したコードか確認してください');
  }

  return { ok: errors.length === 0, errors, warnings };
}
