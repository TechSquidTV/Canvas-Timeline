import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';

const localPathPattern = /(['"`])\/(?:Users|home)\//;
const sourceFilePattern = /\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/;
const hookFilePattern = /\.(?:cts|mts|ts|tsx)$/;
const camelCasePattern = /^[a-z][a-zA-Z0-9]*$/;
const kebabCasePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const pascalCasePattern = /^[A-Z][a-zA-Z0-9]*$/;
const curatedReactApiSpecs = [
  {
    file: 'packages/react/src/Provider.tsx',
    names: ['TimelineProvider', 'TimelineProviderProps'],
    examples: ['TimelineProvider'],
    returns: [],
    remarksLinks: ['TimelineProvider', 'TimelineProviderProps'],
  },
  {
    file: 'packages/react/src/hooks/core/useTimelineState.ts',
    names: ['useTimelineState'],
    examples: ['useTimelineState'],
    returns: ['useTimelineState'],
    remarksLinks: ['useTimelineState'],
  },
  {
    file: 'packages/react/src/hooks/playback/useTimelineMediaSync.ts',
    names: [
      'TimelineMediaSyncAdapter',
      'UseTimelineMediaSyncOptions',
      'UseTimelineMediaSyncResult',
      'useTimelineMediaSync',
    ],
    examples: ['useTimelineMediaSync'],
    returns: ['useTimelineMediaSync'],
    remarksLinks: [
      'TimelineMediaSyncAdapter',
      'UseTimelineMediaSyncOptions',
      'useTimelineMediaSync',
    ],
  },
];

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter((file) => file.length > 0 && existsSync(file));

const failures = [];

runTsdocQualitySelfTest();

for (const file of files) {
  if (!sourceFilePattern.test(file)) {
    continue;
  }

  const sourceText = readFileSync(file, 'utf8');
  if (localPathPattern.test(sourceText)) {
    failures.push(`${file}: contains a hardcoded local absolute path`);
  }

  checkNamingConventions(file);
}

for (const file of files) {
  if (!hookFilePattern.test(file)) {
    continue;
  }

  const sourceText = readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  checkHookGrouping(sourceFile, sourceFile);
}

for (const spec of curatedReactApiSpecs) {
  if (!existsSync(spec.file)) {
    failures.push(`${spec.file}: curated React API TSDoc file is missing`);
    continue;
  }

  const sourceText = readFileSync(spec.file, 'utf8');
  const sourceFile = ts.createSourceFile(
    spec.file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    spec.file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  checkCuratedApiTsdoc(sourceFile, spec, failures);
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

function runTsdocQualitySelfTest() {
  const passingSource = `
/**
 * Reads a value.
 *
 * @remarks
 * See {@link OtherValue} before using this hook.
 *
 * @param input - Value to read.
 * @template Value - Value type.
 * @returns The current value.
 *
 * @example
 * \`\`\`ts
 * useGoodHook('id');
 * \`\`\`
 */
export function useGoodHook<Value>(input: string): Value {
  throw new Error(input);
}
`;
  const failingSource = `
/** Reads a value. */
export function useBadHook<Value>(input: string): Value {
  throw new Error(input);
}
`;
  const passingFailures = [];
  const failingFailures = [];
  const passingFile = ts.createSourceFile(
    'virtual-passing.ts',
    passingSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const failingFile = ts.createSourceFile(
    'virtual-failing.ts',
    failingSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  checkCuratedApiTsdoc(
    passingFile,
    {
      file: 'virtual-passing.ts',
      names: ['useGoodHook'],
      examples: ['useGoodHook'],
      returns: ['useGoodHook'],
      remarksLinks: ['useGoodHook'],
    },
    passingFailures
  );
  checkCuratedApiTsdoc(
    failingFile,
    {
      file: 'virtual-failing.ts',
      names: ['useBadHook'],
      examples: ['useBadHook'],
      returns: ['useBadHook'],
      remarksLinks: ['useBadHook'],
    },
    failingFailures
  );

  if (passingFailures.length > 0) {
    throw new Error(`TSDoc quality self-test should pass:\n${passingFailures.join('\n')}`);
  }

  if (
    !failingFailures.some((failure) => failure.includes('@remarks')) ||
    !failingFailures.some((failure) => failure.includes('@example')) ||
    !failingFailures.some((failure) => failure.includes('@returns')) ||
    !failingFailures.some((failure) => failure.includes('@param input')) ||
    !failingFailures.some((failure) => failure.includes('@template Value'))
  ) {
    throw new Error(`TSDoc quality self-test did not catch expected failures.`);
  }
}

function checkCuratedApiTsdoc(sourceFile, spec, outputFailures) {
  const declarations = collectExportedDeclarations(sourceFile);

  for (const name of spec.names) {
    const declaration = declarations.get(name);

    if (!declaration) {
      outputFailures.push(`${spec.file}: missing exported API declaration ${name}`);
      continue;
    }

    const tsdoc = tsdocForNode(declaration, sourceFile);

    if (!tsdoc) {
      outputFailures.push(`${spec.file}: ${name} must have a TSDoc block`);
      continue;
    }

    if (!hasSummaryText(tsdoc)) {
      outputFailures.push(`${spec.file}: ${name} must have a TSDoc summary`);
    }

    const remarks = tagText(tsdoc, 'remarks');

    if (!remarks) {
      outputFailures.push(`${spec.file}: ${name} must include @remarks`);
    }

    if (spec.remarksLinks.includes(name) && remarks && !/\{@link\s+[^}]+\}/.test(remarks)) {
      outputFailures.push(`${spec.file}: ${name} @remarks must include a {@link ...} reference`);
    }

    if (spec.examples.includes(name) && !hasTag(tsdoc, 'example')) {
      outputFailures.push(`${spec.file}: ${name} must include @example`);
    }

    if (spec.returns.includes(name) && !hasTag(tsdoc, 'returns')) {
      outputFailures.push(`${spec.file}: ${name} must include @returns`);
    }

    checkParameters(sourceFile, spec.file, name, declaration, tsdoc, outputFailures);
    checkTypeParameters(sourceFile, spec.file, name, declaration, tsdoc, outputFailures);
    checkInterfaceMembers(sourceFile, spec.file, name, declaration, outputFailures);
  }
}

function collectExportedDeclarations(sourceFile) {
  const declarations = new Map();

  for (const statement of sourceFile.statements) {
    if (!isExportedStatement(statement)) {
      continue;
    }

    const declaration = ts.isExportDeclaration(statement) ? undefined : statement;
    const name = declarationName(declaration);

    if (name && declaration) {
      declarations.set(name, declaration);
    }
  }

  return declarations;
}

function declarationName(node) {
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isClassDeclaration(node)) &&
    node.name
  ) {
    return node.name.text;
  }

  return undefined;
}

function isExportedStatement(statement) {
  return Boolean(
    statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function tsdocForNode(node, sourceFile) {
  const jsDocs = node.jsDoc ?? [];
  const jsDoc = jsDocs.at(-1);

  if (!jsDoc) {
    return undefined;
  }

  return jsDoc.getFullText(sourceFile);
}

function hasSummaryText(tsdoc) {
  const withoutDelimiters = tsdoc
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\* ?/, ''))
    .join('\n');
  const summary = withoutDelimiters.split(/\n\s*@/)[0]?.trim() ?? '';

  return summary.length > 0;
}

function hasTag(tsdoc, tagName) {
  return new RegExp(`@${tagName}\\b`).test(tsdoc);
}

function tagText(tsdoc, tagName) {
  const match = tsdoc.match(
    new RegExp(`@${tagName}\\b([\\s\\S]*?)(?=\\n\\s*\\*\\s*@|\\n\\s*@|\\*\\/)`)
  );

  return match?.[1]?.trim() ?? '';
}

function checkParameters(sourceFile, file, name, declaration, tsdoc, outputFailures) {
  if (!ts.isFunctionDeclaration(declaration)) {
    return;
  }

  for (const parameter of declaration.parameters) {
    if (!ts.isIdentifier(parameter.name)) {
      continue;
    }

    const parameterName = parameter.name.text;
    const paramBlock = tsdoc.match(
      new RegExp(
        `@param\\s+${escapeRegExp(parameterName)}\\b([\\s\\S]*?)(?=\\n\\s*\\*\\s*@|\\n\\s*@|\\*\\/)`
      )
    );
    const paramText = paramBlock?.[1]?.trim() ?? '';
    const hasDescription = /-\s+\S/.test(paramText);

    if (!paramBlock) {
      outputFailures.push(`${file}: ${name} must document @param ${parameterName}`);
    }

    if (paramBlock && !hasDescription) {
      const position = sourceFile.getLineAndCharacterOfPosition(parameter.getStart(sourceFile));
      outputFailures.push(
        `${file}:${position.line + 1}:${position.character + 1}: ${name} @param ${parameterName} is empty`
      );
    }
  }
}

function checkTypeParameters(sourceFile, file, name, declaration, tsdoc, outputFailures) {
  const typeParameters = declaration.typeParameters ?? [];

  for (const typeParameter of typeParameters) {
    const typeParameterName = typeParameter.name.text;
    const hasTemplate = new RegExp(
      `@(template|typeParam)\\s+${escapeRegExp(typeParameterName)}\\b[\\s\\S]*?-\\s+\\S`
    ).test(tsdoc);

    if (!hasTemplate) {
      const position = sourceFile.getLineAndCharacterOfPosition(
        typeParameter.name.getStart(sourceFile)
      );
      outputFailures.push(
        `${file}:${position.line + 1}:${position.character + 1}: ${name} must document @template ${typeParameterName}`
      );
    }
  }
}

function checkInterfaceMembers(sourceFile, file, name, declaration, outputFailures) {
  if (!ts.isInterfaceDeclaration(declaration)) {
    return;
  }

  for (const member of declaration.members) {
    const memberName = member.name?.getText(sourceFile);

    if (!memberName) {
      continue;
    }

    const tsdoc = tsdocForNode(member, sourceFile);

    if (!tsdoc || !hasSummaryText(tsdoc)) {
      const position = sourceFile.getLineAndCharacterOfPosition(member.getStart(sourceFile));
      outputFailures.push(
        `${file}:${position.line + 1}:${position.character + 1}: ${name}.${memberName} must have a TSDoc summary`
      );
    }
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
