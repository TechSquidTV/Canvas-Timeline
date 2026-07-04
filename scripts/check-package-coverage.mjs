import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const workspaceRoot = process.cwd();
const coveragePath = path.join(workspaceRoot, 'coverage', 'coverage-final.json');
const packageRoot = path.join(workspaceRoot, 'packages');
const minimumLineCoverage = Number(process.env.PACKAGE_LINE_COVERAGE_MINIMUM ?? 80);

if (!Number.isFinite(minimumLineCoverage) || minimumLineCoverage < 0) {
  throw new Error('PACKAGE_LINE_COVERAGE_MINIMUM must be a non-negative number.');
}

if (!fs.existsSync(coveragePath)) {
  throw new Error('Missing coverage/coverage-final.json. Run vp test run --coverage first.');
}

const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
const packageNames = fs
  .readdirSync(packageRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));

const summaries = new Map(
  packageNames.map((packageName) => [
    packageName,
    {
      statements: { covered: 0, total: 0 },
      branches: { covered: 0, total: 0 },
      functions: { covered: 0, total: 0 },
      lines: { covered: 0, total: 0 },
    },
  ])
);

function addCounter(summary, metric, covered, total) {
  summary[metric].covered += covered;
  summary[metric].total += total;
}

function percent(counter) {
  return counter.total === 0 ? 100 : (counter.covered / counter.total) * 100;
}

for (const [absoluteFilePath, fileCoverage] of Object.entries(coverage)) {
  const relativeFilePath = path.relative(workspaceRoot, absoluteFilePath);
  const packageMatch = relativeFilePath.match(/^packages\/([^/]+)\//u);
  if (packageMatch === null) {
    continue;
  }

  const summary = summaries.get(packageMatch[1]);
  if (summary === undefined) {
    continue;
  }

  const statements = Object.values(fileCoverage.s ?? {});
  addCounter(
    summary,
    'statements',
    statements.filter((count) => count > 0).length,
    statements.length
  );

  const functions = Object.values(fileCoverage.f ?? {});
  addCounter(summary, 'functions', functions.filter((count) => count > 0).length, functions.length);

  const branches = Object.values(fileCoverage.b ?? {}).flat();
  addCounter(summary, 'branches', branches.filter((count) => count > 0).length, branches.length);

  const coveredLines = new Set();
  const executableLines = new Set();
  for (const [statementId, location] of Object.entries(fileCoverage.statementMap ?? {})) {
    for (let line = location.start.line; line <= location.end.line; line += 1) {
      executableLines.add(line);
      if ((fileCoverage.s?.[statementId] ?? 0) > 0) {
        coveredLines.add(line);
      }
    }
  }
  addCounter(summary, 'lines', coveredLines.size, executableLines.size);
}

const rows = [...summaries.entries()].map(([packageName, summary]) => ({
  packageName,
  statements: percent(summary.statements),
  branches: percent(summary.branches),
  functions: percent(summary.functions),
  lines: percent(summary.lines),
  raw: summary,
}));

const failedRows = rows.filter((row) => row.lines < minimumLineCoverage);

console.log(`Package line coverage threshold: ${minimumLineCoverage.toFixed(2)}%`);
console.log('| Package | Statements | Branches | Functions | Lines |');
console.log('|---|---:|---:|---:|---:|');
for (const row of rows) {
  console.log(
    `| ${row.packageName} | ${row.statements.toFixed(2)}% | ${row.branches.toFixed(
      2
    )}% | ${row.functions.toFixed(2)}% | ${row.lines.toFixed(2)}% |`
  );
}

if (failedRows.length > 0) {
  const failedPackages = failedRows
    .map((row) => `${row.packageName} (${row.lines.toFixed(2)}%)`)
    .join(', ');
  throw new Error(`Package line coverage below threshold: ${failedPackages}`);
}
