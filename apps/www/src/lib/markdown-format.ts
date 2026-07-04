export function markdownTable(headers: string[], rows: string[][]) {
  return [
    `| ${headers.map(escapeMarkdownTableCell).join(' | ')} |`,
    `| ${headers.map(() => ':---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escapeMarkdownTableCell).join(' | ')} |`),
  ].join('\n');
}

export function markdownCode(value: string) {
  const delimiter = '`'.repeat(longestBacktickRun(value) + 1);
  const needsPadding = value.startsWith('`') || value.endsWith('`');

  return needsPadding ? `${delimiter} ${value} ${delimiter}` : `${delimiter}${value}${delimiter}`;
}

export function markdownCodeBlock(value: string, lang: string) {
  const trimmed = value.trim();
  const fence = '`'.repeat(Math.max(3, longestBacktickRun(trimmed) + 1));

  return `${fence}${lang}\n${trimmed}\n${fence}`;
}

export function absoluteUrl(path: string, siteUrl: string) {
  return new URL(path, siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`).toString();
}

export function normalizeMarkdown(value: string) {
  return `${value
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}

function escapeMarkdownTableCell(value: string) {
  return value.split('\\').join('\\\\').split('\n').join('<br>').split('|').join('\\|');
}

function longestBacktickRun(value: string) {
  let longestRun = 0;
  let currentRun = 0;

  for (const character of value) {
    if (character === '`') {
      currentRun += 1;
      longestRun = Math.max(longestRun, currentRun);
    } else {
      currentRun = 0;
    }
  }

  return longestRun;
}
