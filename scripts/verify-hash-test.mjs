import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { parseUserscriptMeta, bodyForHash } from '../src/shared/hash.js';

const exported = readFileSync('test-exported.user.js', 'utf8');

const fullBody = `(function () {
    'use strict';

    // Apply a CSS rule that adds a black, rounded border to the main content container and all its descendant elements.
    // The second <div> (fixed position overlay) is excluded to avoid styling injected elements.
    const style = document.createElement('style');
    style.textContent = \`
        body > div:not([style*="position: fixed"]),
        body > div:not([style*="position: fixed"]) * {
            border: 1px solid black;
            border-radius: 5px;
        }
    \`;
    document.head.appendChild(style);
})();`;

const expected = 'sha256:514990c220203ed8577b9732c2c603dd410682dd7769610bbc20560ccadf796c';

const fromFile = bodyForHash(exported);
const hFile = 'sha256:' + createHash('sha256').update(fromFile.trim()).digest('hex');
const hFull = 'sha256:' + createHash('sha256').update(fullBody.trim()).digest('hex');

const normalized = fromFile.replace(/\r\n/g, '\n');
const hNorm = 'sha256:' + createHash('sha256').update(normalized.trim()).digest('hex');

console.log('from exported file (CRLF):', hFile, hFile === expected);
console.log('from exported file (LF norm):', hNorm, hNorm === expected);
console.log('from full body text:', hFull, hFull === expected);
console.log('meta hash line:', parseUserscriptMeta(exported).meta.hash);
