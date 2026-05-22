import { parseCode, getBodySource } from './parser.js';
import { detectDangerousPatterns } from './dangerous_patterns.js';
import { detectPermissions, PERMISSION_CATALOG } from './permission_detector.js';
import { lintGeneratedBody } from '../shared/lint.js';

const RISK_ORDER = { high: 0, medium: 1, low: 2 };

export function analyzeCode(source) {
  const body = getBodySource(source) || source;
  const parsed = parseCode(body);

  if (!parsed.ok) {
    return {
      ok: false,
      blocked: [],
      permissions: [],
      syntaxError: parsed.syntaxError,
      line: parsed.line,
    };
  }

  const blocked = detectDangerousPatterns(parsed.ast);
  if (blocked.length > 0) {
    return {
      ok: false,
      blocked,
      permissions: [],
    };
  }

  const permissions = detectPermissions(parsed.ast).sort(
    (a, b) => (RISK_ORDER[a.risk] ?? 9) - (RISK_ORDER[b.risk] ?? 9)
  );

  const lint = lintGeneratedBody(body);

  const detectedIds = new Set(permissions.map((p) => p.id));
  const notDetected = Object.values(PERMISSION_CATALOG).filter((p) => !detectedIds.has(p.id));

  return {
    ok: true,
    blocked: [],
    permissions,
    notDetected,
    lintWarnings: lint.warnings,
    lintErrors: lint.errors,
  };
}

export { PERMISSION_CATALOG };
