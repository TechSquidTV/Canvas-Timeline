const htmlAttributeEntities: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&lt;': '<',
  '&gt;': '>',
};

/** Decodes supported HTML attribute entities without recursively unescaping values. */
export function decodeHtmlAttribute(value: string): string {
  return value.replace(
    /&(amp|quot|#39|lt|gt);/gu,
    (entity) => htmlAttributeEntities[entity] ?? entity
  );
}
