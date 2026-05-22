import { ESLint } from 'eslint';
import { readFileSync } from 'fs';

const code = process.argv[2] || readFileSync(0, 'utf8');

const eslint = new ESLint({
  overrideConfig: {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        navigator: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        MutationObserver: 'readonly',
      },
    },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-unused-vars': 'warn',
    },
  },
});

const [result] = await eslint.lintText(code, { filePath: 'generated.user.js' });
const errors = result.messages.filter((m) => m.severity === 2);
if (errors.length) {
  console.error('ESLint errors:');
  for (const e of errors) console.error(`  ${e.line}:${e.column} ${e.message}`);
  process.exit(1);
}
console.log('ESLint OK');
