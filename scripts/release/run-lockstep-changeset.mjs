import { spawn } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const changesetConfigPath = path.join(repositoryRoot, '.changeset/config.json');
const packagesDirectory = path.join(repositoryRoot, 'packages');
const changesetCliPath = path.join(repositoryRoot, 'node_modules/@changesets/cli/bin.js');
const supportedCommands = new Set(['status', 'version']);

const [command, ...commandArguments] = process.argv.slice(2);

if (!command || !supportedCommands.has(command)) {
  console.error(
    'Usage: node scripts/release/run-lockstep-changeset.mjs <status|version> [...args]'
  );
  process.exitCode = 1;
} else {
  process.exitCode = await runLockstepChangeset(command, commandArguments);
}

async function runLockstepChangeset(changesetCommand, changesetArguments) {
  const maskedPeers = await maskFixedGroupWorkspacePeers();

  try {
    return await runChangeset(changesetCommand, changesetArguments);
  } finally {
    await restoreWorkspacePeers(maskedPeers);
  }
}

async function maskFixedGroupWorkspacePeers() {
  const config = await readJson(changesetConfigPath);
  const fixedGroupByPackage = new Map();

  for (const [groupIndex, group] of (config.fixed ?? []).entries()) {
    for (const packageName of group) {
      fixedGroupByPackage.set(packageName, groupIndex);
    }
  }

  const packageDirectories = await readdir(packagesDirectory, { withFileTypes: true });
  const maskedPeers = [];

  try {
    for (const directory of packageDirectories) {
      if (!directory.isDirectory()) continue;

      const manifestPath = path.join(packagesDirectory, directory.name, 'package.json');
      const manifest = await readJson(manifestPath);
      const packageGroup = fixedGroupByPackage.get(manifest.name);

      if (packageGroup === undefined || !manifest.peerDependencies) continue;

      let changed = false;

      for (const [peerName, peerRange] of Object.entries(manifest.peerDependencies)) {
        const isWorkspacePeer = typeof peerRange === 'string' && peerRange.startsWith('workspace:');
        const isSameFixedGroup = fixedGroupByPackage.get(peerName) === packageGroup;

        if (!isWorkspacePeer || !isSameFixedGroup) continue;

        // Changesets evaluates peer bumps before reconciling a fixed group. Masking
        // only intra-group workspace peers avoids a false major while keeping the
        // published manifests exact; the original range is restored after versioning.
        maskedPeers.push({ manifestPath, peerName, peerRange });
        manifest.peerDependencies[peerName] = '*';
        changed = true;
      }

      if (changed) await writeJson(manifestPath, manifest);
    }
  } catch (error) {
    await restoreWorkspacePeers(maskedPeers);
    throw error;
  }

  return maskedPeers;
}

async function restoreWorkspacePeers(maskedPeers) {
  const peersByManifest = Map.groupBy(maskedPeers, ({ manifestPath }) => manifestPath);

  for (const [manifestPath, peers] of peersByManifest) {
    const manifest = await readJson(manifestPath);
    manifest.peerDependencies ??= {};

    for (const { peerName, peerRange } of peers) {
      manifest.peerDependencies[peerName] = peerRange;
    }

    await writeJson(manifestPath, manifest);
  }
}

function runChangeset(changesetCommand, changesetArguments) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [changesetCliPath, changesetCommand, ...changesetArguments],
      {
        cwd: repositoryRoot,
        stdio: 'inherit',
      }
    );

    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (signal) {
        reject(new Error(`Changesets exited from signal ${signal}.`));
        return;
      }

      resolve(code ?? 1);
    });
  });
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
