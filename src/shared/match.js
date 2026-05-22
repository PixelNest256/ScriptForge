/** Normalize @match patterns for Chrome userScripts */
export function normalizeMatchPattern(pattern) {
  const p = String(pattern).trim();
  if (!p) return p;
  if (p.includes('*')) return p;
  if (p.endsWith('/')) return `${p}*`;
  return p;
}

export function normalizeMatchPatterns(patterns) {
  return [...new Set(patterns.map(normalizeMatchPattern).filter(Boolean))];
}

export function urlMatchesPattern(url, pattern) {
  try {
    const regex = patternToRegex(pattern);
    return regex.test(url);
  } catch {
    return false;
  }
}

export function urlMatchesAny(url, patterns) {
  if (!patterns?.length) return false;
  return patterns.some((p) => urlMatchesPattern(url, p));
}

function patternToRegex(pattern) {
  const normalized = normalizeMatchPattern(pattern);
  let escaped = normalized.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  escaped = escaped.replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}
