const PUBLIC_PACKAGE_NAME = '@techsquidtv/canvas-timeline';

const SOURCE_PACKAGE_IMPORTS = [
  '@techsquidtv/canvas-timeline-core',
  '@techsquidtv/canvas-timeline-react',
  '@techsquidtv/canvas-timeline-renderer',
  '@techsquidtv/canvas-timeline-utils',
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PUBLIC_NAMED_IMPORT_RE = new RegExp(
  String.raw`^import\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]${escapeRegExp(PUBLIC_PACKAGE_NAME)}['"];?\n?`,
  'gm'
);

function mergePublicPackageImports(source: string): string {
  const specifiers: string[] = [];
  const seen = new Set<string>();
  let importIndex = 0;

  const withoutImports = source.replace(
    PUBLIC_NAMED_IMPORT_RE,
    (_statement, typeOnly, importedNames) => {
      for (const importedName of importedNames.split(',')) {
        const trimmedName = importedName.trim();
        const specifier =
          typeOnly && !trimmedName.startsWith('type ') ? `type ${trimmedName}` : trimmedName;
        if (specifier && !seen.has(specifier)) {
          seen.add(specifier);
          specifiers.push(specifier);
        }
      }

      importIndex += 1;
      return importIndex === 1 ? '__PUBLIC_PACKAGE_IMPORT__\n' : '';
    }
  );

  if (specifiers.length === 0) {
    return withoutImports;
  }

  const namedImport =
    specifiers.length <= 3
      ? `import { ${specifiers.join(', ')} } from '${PUBLIC_PACKAGE_NAME}';`
      : [
          'import {',
          ...specifiers.map((specifier) => `  ${specifier},`),
          `} from '${PUBLIC_PACKAGE_NAME}';`,
        ].join('\n');

  return withoutImports.replace('__PUBLIC_PACKAGE_IMPORT__', namedImport);
}

/**
 * Projects source-backed demo files into copyable public-package examples.
 *
 * Live demos should import the real workspace packages they exercise. Displayed
 * snippets should show the public install shape readers are meant to copy.
 */
export function toCopyableDemoSource(source: string): string {
  const publicPackageSource = SOURCE_PACKAGE_IMPORTS.reduce(
    (code, packageName) => code.replaceAll(packageName, PUBLIC_PACKAGE_NAME),
    source
  );

  return mergePublicPackageImports(publicPackageSource);
}
