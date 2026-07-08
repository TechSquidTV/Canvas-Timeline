function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function inlineProseHtml(value: string) {
  const parts: string[] = [];
  const codePattern = /`([^`\n]+)`/g;
  let cursor = 0;

  for (const match of value.matchAll(codePattern)) {
    const matchIndex = match.index ?? 0;
    parts.push(escapeHtml(value.slice(cursor, matchIndex)));
    parts.push(`<code>${escapeHtml(match[1] ?? '')}</code>`);
    cursor = matchIndex + match[0].length;
  }

  parts.push(escapeHtml(value.slice(cursor)));
  return parts.join('');
}
