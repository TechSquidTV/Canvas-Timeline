import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

export type PackageManifest = {
  readonly name?: string;
  readonly private?: boolean;
};

export type PublishablePackage<Manifest extends PackageManifest = PackageManifest> = {
  readonly directory: string;
  readonly manifest: Manifest;
};

export async function readJson<Contents>(filePath: string): Promise<Contents> {
  return JSON.parse(await readFile(filePath, 'utf8')) as Contents;
}

export async function discoverPublishablePackages<Manifest extends PackageManifest>(
  packagesRoot: string
): Promise<Array<PublishablePackage<Manifest>>> {
  const entries = await readdir(packagesRoot, { withFileTypes: true });
  const packages: Array<PublishablePackage<Manifest>> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const directory = join(packagesRoot, entry.name);
    const manifest = await readJson<Manifest>(join(directory, 'package.json'));

    if (!manifest.private && manifest.name) {
      packages.push({ directory, manifest });
    }
  }

  return packages.sort((left, right) =>
    basename(left.directory).localeCompare(basename(right.directory))
  );
}
