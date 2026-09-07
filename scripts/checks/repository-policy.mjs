import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import ts from 'typescript';

const repoRootUrl = new URL('../../', import.meta.url);
const repoRootPath = fileURLToPath(repoRootUrl);
const localPathPattern = /(?:file:\/\/\/|\/(?:Users|home)\/[^/\s]+\/|[a-z]:\\Users\\[^\\\s]+\\)/i;
const sourceFilePattern = /\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/;
const contentImportFilePattern = /\.(?:astro|mdx)$/;
const skillFilePattern = /^\.agents\/skills\/.*\/SKILL\.md$/;
const relativeContentImportPattern =
  /^\s*import(?:\s+[\s\S]*?\s+from)?\s+['"](?<specifier>\.{1,2}\/[^'"]+)['"]/gm;
const hookFilePattern = /\.(?:cts|mts|ts|tsx)$/;
const camelCasePattern = /^[a-z][a-zA-Z0-9]*$/;
const kebabCasePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const pascalCasePattern = /^[A-Z][a-zA-Z0-9]*$/;
const removedPublicApiGuards = [
  {
    file: 'packages/react/package.json',
    pattern: /"\.\/docs-metadata"/,
    message: 'React package must not expose docs-only metadata as a public subpath.',
  },
  {
    file: 'packages/react/src/index.ts',
    pattern: /export\s+\*\s+from\s+['"]\.\/context['"]|TimelineContext(Value)?/,
    message: 'React root must not export provider context internals.',
  },
  {
    file: 'packages/react/src/timecodeInput/index.ts',
    pattern:
      /\b(?:formatTimecode|parseTimecode|TimecodeFrameRate|TimecodeFormat|TimecodeFormatOptions|TimecodeParseOptions|TimecodeParseRounding)\b/,
    message: 'React timecode input must not re-export utility timecode helpers or aliases.',
  },
  {
    file: 'packages/react/src/timecodeInput/timecode.ts',
    pattern: /[\s\S]/,
    message: 'React timecode helper wrapper must stay removed; use utils timecode helpers.',
    mustNotExist: true,
  },
  {
    file: 'packages/core/src/index.ts',
    pattern: /export\s+\*\s+from\s+['"]\.\/emitter['"]/,
    message: 'Core root must not export the internal event emitter primitive.',
  },
  {
    file: 'packages/core/package.json',
    pattern: /"\.\/snapshot"/,
    message: 'Core package must not expose internal snapshot helpers as a public subpath.',
  },
  {
    file: 'packages/core/src/index.ts',
    pattern: /export\s+\*\s+from\s+['"]\.\/snapshot['"]/,
    message: 'Core root must not barrel internal snapshot helpers.',
  },
  {
    file: 'packages/core/src/lean.ts',
    pattern: /[\s\S]/,
    message: 'Core lean helper module must stay renamed; use the internal snapshot module.',
    mustNotExist: true,
  },
  {
    file: 'packages/core/src/engine.ts',
    pattern:
      /export\s+(?:function|const)\s+(?:createLeanClip|createLeanTrack|createLeanTracks|stringifyLeanTracks|createLeanMarkers|createLeanClipGroups|createClipSnapshot|createTrackSnapshot|createTrackSnapshots|stringifyTrackSnapshots|createMarkerSnapshots|createClipGroupSnapshots)\b|export\s+\{[^}]*\b(?:createLeanClip|createLeanTrack|createLeanTracks|stringifyLeanTracks|createLeanMarkers|createLeanClipGroups|createClipSnapshot|createTrackSnapshot|createTrackSnapshots|stringifyTrackSnapshots|createMarkerSnapshots|createClipGroupSnapshots)\b[^}]*\}/,
    message: 'Core engine entrypoint must not export internal snapshot helpers.',
  },
];

const files = execFileSync('git', ['ls-files'], { cwd: repoRootPath, encoding: 'utf8' })
  .split('\n')
  .filter((file) => file.length > 0 && existsSync(resolveRepoFile(file)));

const failures = [];

checkRemovedPublicApiGuards();

for (const file of files) {
  if (
    !sourceFilePattern.test(file) &&
    !contentImportFilePattern.test(file) &&
    !skillFilePattern.test(file)
  ) {
    continue;
  }

  const sourceText = readFileSync(resolveRepoFile(file), 'utf8');
  if (localPathPattern.test(sourceText)) {
    failures.push(`${file}: contains a hardcoded local absolute path`);
  }

  if (skillFilePattern.test(file)) {
    continue;
  }

  if (contentImportFilePattern.test(file)) {
    checkContentAliasedImports(file, sourceText);
    continue;
  }

  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForFile(file)
  );

  checkAliasedImports(sourceFile, sourceFile);
  checkNamingConventions(file);
}

for (const file of files) {
  if (!hookFilePattern.test(file)) {
    continue;
  }

  const sourceText = readFileSync(resolveRepoFile(file), 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  checkHookGrouping(sourceFile, sourceFile);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

function checkHookGrouping(node, sourceFile) {
  if (ts.isBlock(node)) {
    let hasSeenHook = false;
    let hasSeenNonHookAfterHook = false;

    for (const statement of node.statements) {
      const hookStatement = isHookStatement(statement);

      if (hookStatement) {
        hasSeenHook = true;
        if (hasSeenNonHookAfterHook) {
          const position = sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile));
          failures.push(
            `${sourceFile.fileName}:${position.line + 1}:${position.character + 1}: React hooks must be grouped together`
          );
        }
      } else if (hasSeenHook && !ts.isVariableStatement(statement)) {
        hasSeenNonHookAfterHook = true;
      }
    }
  }

  ts.forEachChild(node, (child) => checkHookGrouping(child, sourceFile));
}

function checkAliasedImports(node, sourceFile) {
  const moduleSpecifier =
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier !== undefined &&
    ts.isStringLiteralLike(node.moduleSpecifier)
      ? node.moduleSpecifier
      : undefined;

  if (moduleSpecifier && isRelativeSpecifier(moduleSpecifier.text)) {
    const position = sourceFile.getLineAndCharacterOfPosition(moduleSpecifier.getStart(sourceFile));
    failures.push(
      `${sourceFile.fileName}:${position.line + 1}:${position.character + 1}: use a configured alias instead of relative module specifier "${moduleSpecifier.text}"`
    );
  }

  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments.length === 1 &&
    ts.isStringLiteralLike(node.arguments[0]) &&
    isRelativeSpecifier(node.arguments[0].text)
  ) {
    const position = sourceFile.getLineAndCharacterOfPosition(
      node.arguments[0].getStart(sourceFile)
    );
    failures.push(
      `${sourceFile.fileName}:${position.line + 1}:${position.character + 1}: use a configured alias instead of relative module specifier "${node.arguments[0].text}"`
    );
  }

  ts.forEachChild(node, (child) => checkAliasedImports(child, sourceFile));
}

function checkContentAliasedImports(file, sourceText) {
  for (const match of sourceText.matchAll(relativeContentImportPattern)) {
    const specifier = match.groups?.specifier;
    if (specifier === undefined) {
      continue;
    }

    const line = sourceText.slice(0, match.index).split('\n').length;
    failures.push(
      `${file}:${line}: use a configured alias instead of relative module specifier "${specifier}"`
    );
  }
}

function checkRemovedPublicApiGuards() {
  for (const guard of removedPublicApiGuards) {
    const guardPath = resolveRepoFile(guard.file);
    const exists = existsSync(guardPath);

    if (guard.mustNotExist) {
      if (exists) {
        failures.push(`${guard.file}: ${guard.message}`);
      }
      continue;
    }

    if (!exists) {
      failures.push(`${guard.file}: public API guard file is missing`);
      continue;
    }

    const sourceText = readFileSync(guardPath, 'utf8');
    if (guard.pattern.test(sourceText)) {
      failures.push(`${guard.file}: ${guard.message}`);
    }
  }
}

function resolveRepoFile(file) {
  return new URL(file, repoRootUrl);
}

function isHookStatement(statement) {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.some((declaration) => {
      return declaration.initializer !== undefined && isHookCall(declaration.initializer);
    });
  }

  return ts.isExpressionStatement(statement) && isHookCall(statement.expression);
}

function isHookCall(expression) {
  if (!ts.isCallExpression(expression)) {
    return false;
  }

  return isHookName(expression.expression);
}

function isHookName(expression) {
  if (ts.isIdentifier(expression)) {
    return /^use[A-Z0-9]/.test(expression.text);
  }

  return (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'React' &&
    /^use[A-Z0-9]/.test(expression.name.text)
  );
}

function scriptKindForFile(file) {
  if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
    return ts.ScriptKind.TSX;
  }

  if (file.endsWith('.json')) {
    return ts.ScriptKind.JSON;
  }

  return ts.ScriptKind.TS;
}

function isRelativeSpecifier(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

function checkNamingConventions(file) {
  const pathParts = file.split('/');
  const basename = pathParts.at(-1) ?? '';
  const extensionlessBasename = basename.replace(/\.[^.]+$/, '').replace(/\.(?:spec|test)$/, '');
  const testFile = /\.(?:spec|test)\.[^.]+$/.test(basename);

  if (!testFile && file.includes('/src/hooks/') && !camelCasePattern.test(extensionlessBasename)) {
    failures.push(`${file}: hook filenames must be camelCase`);
  }

  if (!testFile && file.includes('/src/components/') && file.endsWith('.tsx')) {
    const componentDirectoryIndex = pathParts.indexOf('components');
    const nestedBelowComponents = componentDirectoryIndex !== pathParts.length - 2;
    if (!nestedBelowComponents && !pascalCasePattern.test(extensionlessBasename)) {
      failures.push(`${file}: component filenames must be PascalCase`);
    }
  }

  for (const directory of directoriesFor(file)) {
    const rule = folderRuleFor(directory);
    if (rule === undefined) {
      continue;
    }

    const segment = directory.split('/').at(-1) ?? '';
    if (isFrameworkRouteSegment(segment)) {
      continue;
    }

    if (rule === 'camelCase' && !camelCasePattern.test(segment)) {
      failures.push(`${directory}/: folder names must be camelCase`);
    }
    if (rule === 'kebab-case' && !kebabCasePattern.test(segment)) {
      failures.push(`${directory}/: folder names must be kebab-case`);
    }
  }
}

function isFrameworkRouteSegment(segment) {
  return segment.startsWith('[') && segment.endsWith(']');
}

function directoriesFor(file) {
  const pathParts = file.split('/');
  return pathParts.slice(0, -1).map((_, index) => pathParts.slice(0, index + 1).join('/'));
}

function folderRuleFor(directory) {
  if (directory.startsWith('apps/www/src/demos/')) {
    return 'kebab-case';
  }

  const wwwCamelCaseRoots = [
    'apps/www/src/components/',
    'apps/www/src/content/',
    'apps/www/src/data/',
    'apps/www/src/layouts/',
    'apps/www/src/lib/',
    'apps/www/src/pages/',
    'apps/www/src/styles/',
  ];
  if (wwwCamelCaseRoots.some((root) => directory.startsWith(root))) {
    return 'camelCase';
  }

  if (/^packages\/[^/]+\/src\//.test(directory)) {
    return 'camelCase';
  }

  return undefined;
}
