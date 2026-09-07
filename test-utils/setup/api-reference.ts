import { execFileSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

// Only the docs test project runs this setup. Reuse the normal cached docs task.
export default function setup() {
  execFileSync('vp', ['run', 'docs:api'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    stdio: 'pipe',
  });
}
