import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export default function setup() {
  execFileSync(process.execPath, ['scripts/generate/api-reference.mjs'], {
    cwd: fileURLToPath(new URL('../../apps/www/', import.meta.url)),
    stdio: 'pipe',
  });
}
