import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import {
  discoverPublishablePackages,
  readJson,
} from '@techsquidtv/canvas-timeline-scripts/repository';

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const packagesRoot = join(workspaceRoot, 'packages');
const defaultConcurrency = 3;
const binExtension = process.platform === 'win32' ? '.cmd' : '';
const binPath = (command) =>
  join(workspaceRoot, 'node_modules', '.bin', `${command}${binExtension}`);

const run = (command, args, options = {}) =>
  new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });
    let output = '';

    child.stdout.on('data', (chunk) => {
      output += chunk;
    });

    child.stderr.on('data', (chunk) => {
      output += chunk;
    });

    child.on('error', rejectRun);
    child.on('exit', (code) => {
      if (code === 0) {
        resolveRun(output);
        return;
      }

      const error = new Error(`${command} ${args.join(' ')} exited with ${code}`);
      error.output = output;
      rejectRun(error);
    });
  });

const readManifest = (directory) => readJson(join(directory, 'package.json'));

const packPackage = async (packageDir, packageName) => {
  const packDir = await mkdtemp(join(tmpdir(), 'canvas-timeline-pack-'));

  try {
    await run('pnpm', ['pack', '--pack-destination', packDir], {
      cwd: packageDir,
    });

    const entries = await readdir(packDir);
    const tarball = entries.find((entry) => entry.endsWith('.tgz'));

    if (!tarball) {
      throw new Error(`No tarball produced for ${packageName}`);
    }

    return {
      cleanup: () => rm(packDir, { force: true, recursive: true }),
      tarballPath: join(packDir, tarball),
    };
  } catch (error) {
    await rm(packDir, { force: true, recursive: true });
    throw error;
  }
};

const getCssEntrypoints = (manifest) => {
  if (!manifest.exports || typeof manifest.exports !== 'object') {
    return [];
  }

  return Object.keys(manifest.exports).filter((entrypoint) => entrypoint.endsWith('.css'));
};

const flushOutput = (output) => {
  if (output.length > 0) {
    process.stdout.write(output.endsWith('\n') ? output : `${output}\n`);
  }
};

const checkPackage = async (packageDir) => {
  const manifest = await readManifest(packageDir);
  let output = `\nChecking ${manifest.name}\n`;

  try {
    output += await run(binPath('publint'), ['run', '--strict', '--pack', 'pnpm', packageDir]);

    const packedPackage = await packPackage(packageDir, manifest.name);

    try {
      const attwArgs = [packedPackage.tarballPath, '--profile', 'esm-only', '--no-emoji'];
      const cssEntrypoints = getCssEntrypoints(manifest);

      if (cssEntrypoints.length > 0) {
        attwArgs.push('--exclude-entrypoints', ...cssEntrypoints);
      }

      output += await run(binPath('attw'), attwArgs);
    } finally {
      await packedPackage.cleanup();
    }

    flushOutput(output);
  } catch (error) {
    flushOutput(output);

    if (typeof error.output === 'string') {
      flushOutput(error.output);
    }

    throw error;
  }
};

const parseConcurrency = () => {
  const rawValue = process.env.PACKAGE_CHECK_CONCURRENCY;

  if (rawValue === undefined) {
    return defaultConcurrency;
  }

  const parsedValue = Number(rawValue);

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new Error('PACKAGE_CHECK_CONCURRENCY must be a positive integer.');
  }

  return parsedValue;
};

const checkPackages = async (packageDirs) => {
  const concurrency = Math.min(parseConcurrency(), packageDirs.length);
  let nextPackageIndex = 0;

  console.log(`Checking ${packageDirs.length} packages with concurrency ${concurrency}.`);

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (nextPackageIndex < packageDirs.length) {
        const packageDir = packageDirs[nextPackageIndex];
        nextPackageIndex += 1;
        await checkPackage(packageDir);
      }
    })
  );
};

const packageDirs = (await discoverPublishablePackages(packagesRoot)).map(
  ({ directory }) => directory
);

await checkPackages(packageDirs);
