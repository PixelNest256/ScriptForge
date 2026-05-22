import * as walk from 'acorn-walk';

const BLOCKED = {
  eval: 'eval() は許可されていません',
  new_function: 'new Function() は許可されていません',
  string_setTimeout: 'setTimeout に文字列を渡すことは許可されていません',
  string_setInterval: 'setInterval に文字列を渡すことは許可されていません',
  dynamic_import: '動的 import() は許可されていません',
  external_script: '外部 script の注入は許可されていません',
  concat_access: '文字列連結による API 迂回は許可されていません',
};

export function detectDangerousPatterns(ast) {
  const blocked = [];

  walk.simple(ast, {
    CallExpression(node) {
      if (isEvalCall(node)) {
        blocked.push({ pattern: 'eval', line: node.loc?.start.line, message: BLOCKED.eval });
      }
      if (isNewFunctionCall(node)) {
        blocked.push({
          pattern: 'new_function',
          line: node.loc?.start.line,
          message: BLOCKED.new_function,
        });
      }
      if (isStringTimer(node, 'setTimeout')) {
        blocked.push({
          pattern: 'string_setTimeout',
          line: node.loc?.start.line,
          message: BLOCKED.string_setTimeout,
        });
      }
      if (isStringTimer(node, 'setInterval')) {
        blocked.push({
          pattern: 'string_setInterval',
          line: node.loc?.start.line,
          message: BLOCKED.string_setInterval,
        });
      }
      if (isDynamicImportCall(node)) {
        blocked.push({
          pattern: 'dynamic_import',
          line: node.loc?.start.line,
          message: BLOCKED.dynamic_import,
        });
      }
    },
    NewExpression(node) {
      if (node.callee.type === 'Identifier' && node.callee.name === 'Function') {
        blocked.push({
          pattern: 'new_function',
          line: node.loc?.start.line,
          message: BLOCKED.new_function,
        });
      }
    },
    Import() {
      blocked.push({
        pattern: 'dynamic_import',
        line: 0,
        message: BLOCKED.dynamic_import,
      });
    },
    MemberExpression(node) {
      if (isConcatPropertyAccess(node)) {
        blocked.push({
          pattern: 'concat_access',
          line: node.loc?.start.line,
          message: BLOCKED.concat_access,
        });
      }
    },
    AssignmentExpression(node) {
      if (isExternalScriptSrc(node)) {
        blocked.push({
          pattern: 'external_script',
          line: node.loc?.start.line,
          message: BLOCKED.external_script,
        });
      }
    },
  });

  const seen = new Set();
  return blocked.filter((b) => {
    const key = `${b.pattern}:${b.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isEvalCall(node) {
  if (node.callee.type === 'Identifier' && node.callee.name === 'eval') return true;
  if (
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.property?.name === 'eval'
  ) {
    return true;
  }
  return false;
}

function isNewFunctionCall(node) {
  return node.callee?.type === 'NewExpression' && node.callee.callee?.name === 'Function';
}

function isStringTimer(node, name) {
  if (node.callee.type !== 'Identifier' || node.callee.name !== name) return false;
  const arg = node.arguments[0];
  return arg?.type === 'Literal' && typeof arg.value === 'string';
}

function isDynamicImportCall(node) {
  return node.callee.type === 'Import';
}

function isConcatPropertyAccess(node) {
  if (!node.computed) return false;
  const prop = node.property;
  if (prop.type === 'BinaryExpression' && prop.operator === '+') return true;
  if (prop.type === 'TemplateLiteral' && prop.expressions.length > 0) return true;
  return false;
}

function isExternalScriptSrc(node) {
  const left = node.left;
  if (left?.type !== 'MemberExpression' || left.property?.name !== 'src') return false;
  const obj = left.object;
  if (
    obj?.type === 'Identifier' &&
    obj.name === 'script' &&
    node.right?.type === 'Literal' &&
    typeof node.right.value === 'string' &&
    /^https?:\/\//.test(node.right.value)
  ) {
    return true;
  }
  if (
    obj?.type === 'MemberExpression' &&
    obj.property?.name === 'src' &&
    node.right?.type === 'Literal' &&
    typeof node.right.value === 'string' &&
    /^https?:\/\//.test(node.right.value)
  ) {
    return true;
  }
  return false;
}
