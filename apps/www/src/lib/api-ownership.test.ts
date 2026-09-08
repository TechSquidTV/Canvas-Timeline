import { describe, expect, test } from 'vite-plus/test';
import { apiReference, apiSymbolHref, getApiSymbol } from '#www/lib/api-reference';

describe('API declaration ownership', () => {
  test('routes aggregate re-exports and transitive exports to their declaration owner', () => {
    expect(apiSymbolHref('timeline', 'timeline-engine')).toBe('/packages/core/api/timeline-engine');
    expect(apiSymbolHref('timeline', 'rational-time')).toBe('/packages/utils/api/rational-time');
    expect(apiSymbolHref('core', 'timeline-engine')).toBe('/packages/core/api/timeline-engine');
  });

  test('every canonical target exists, owns the same declaration, and points to itself', () => {
    for (const packageDoc of apiReference.packages) {
      for (const symbol of packageDoc.symbols) {
        const owner = getApiSymbol(symbol.canonicalPackageSlug, symbol.slug);
        expect(owner, `${packageDoc.slug}.${symbol.name}`).toBeDefined();
        expect(owner?.canonicalPackageSlug).toBe(symbol.canonicalPackageSlug);
        expect(owner?.name).toBe(symbol.name);
        expect(owner?.kind).toBe(symbol.kind);
        expect(owner?.source?.fileName).toBe(symbol.source?.fileName);
        expect(owner?.source?.line).toBe(symbol.source?.line);
      }
    }
  });

  test('does not emit a link to an unknown symbol', () => {
    expect(() => apiSymbolHref('core', 'missing-symbol')).toThrow('Unknown API symbol');
  });
});
