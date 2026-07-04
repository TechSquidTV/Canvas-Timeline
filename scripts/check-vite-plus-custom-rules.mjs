import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';

const localPathPattern = /(['"`])\/(?:Users|home)\//;
const sourceFilePattern = /\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/;
const hookFilePattern = /\.(?:cts|mts|ts|tsx)$/;
const camelCasePattern = /^[a-z][a-zA-Z0-9]*$/;
const kebabCasePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const pascalCasePattern = /^[A-Z][a-zA-Z0-9]*$/;

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter((file) => file.length > 0 && existsSync(file));

const failures = [];

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
