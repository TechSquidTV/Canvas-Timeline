import istanbulCoverage from 'istanbul-lib-coverage';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const { createCoverageMap, createCoverageSummary } = istanbulCoverage;

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));
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

const summaries = new Map(packageNames.map((name) => [name, createCoverageSummary()]));
const coveredPackages = new Set();
const map = createCoverageMap(coverage);
for (const filename of map.files()) {
  const relative = path.relative(packageRoot, filename);
  if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
  const packageName = relative.split(path.sep)[0];
  const summary = summaries.get(packageName);
  if (!summary) continue;
  coveredPackages.add(packageName);
  summary.merge(map.fileCoverageFor(filename).toSummary());
}
const missing = packageNames.filter((name) => !coveredPackages.has(name));
if (missing.length > 0) throw new Error(`Missing package coverage: ${missing.join(', ')}`);
function percent(counter) {
  return counter.total === 0 ? null : counter.pct === 'Unknown' ? 0 : counter.pct;
}

const rows = [...summaries.entries()].map(([packageName, summary]) => ({
  packageName,
  statements: percent(summary.statements),
  branches: percent(summary.branches),
  functions: percent(summary.functions),
  lines: percent(summary.lines),
}));

const failedRows = rows.filter((row) => row.lines !== null && row.lines < minimumLineCoverage);

console.log(`Package line coverage threshold: ${minimumLineCoverage.toFixed(2)}%`);
console.log('| Package | Statements | Branches | Functions | Lines |');
console.log('|---|---:|---:|---:|---:|');
function formatPercent(value) {
  return value === null ? 'N/A' : `${value.toFixed(2)}%`;
}
for (const row of rows) {
  console.log(
    `| ${row.packageName} | ${formatPercent(row.statements)} | ${formatPercent(row.branches)} | ${formatPercent(row.functions)} | ${formatPercent(row.lines)} |`
  );
}
console.log('N/A means no executable statements for that metric; missing package reports fail.');

if (failedRows.length > 0) {
  const failedPackages = failedRows
    .map((row) => `${row.packageName} (${row.lines.toFixed(2)}%)`)
    .join(', ');
  throw new Error(`Package line coverage below threshold: ${failedPackages}`);
}
