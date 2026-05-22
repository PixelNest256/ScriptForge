import { mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const outDir = 'dist';
const zipName = 'scriptforge-extension.zip';
mkdirSync(outDir, { recursive: true });

const isWin = process.platform === 'win32';
if (isWin) {
  execSync(
    `powershell -Command "Compress-Archive -Path 'extension\\*' -DestinationPath '${join(outDir, zipName)}' -Force"`,
    { stdio: 'inherit' }
  );
} else {
  execSync(`cd extension && zip -r ../${join(outDir, zipName)} .`, { stdio: 'inherit' });
}
console.log(`Created ${join(outDir, zipName)}`);
