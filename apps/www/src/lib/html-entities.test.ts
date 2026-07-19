import { describe, expect, test } from 'vite-plus/test';

import { decodeHtmlAttribute } from '#www/lib/html-entities';

describe('decodeHtmlAttribute', () => {
  test('decodes supported entities once', () => {
    expect(decodeHtmlAttribute('A &amp; B &quot;C&quot; &#39;D&#39; &lt;E&gt;')).toBe(
      'A & B "C" \'D\' <E>'
    );
    expect(decodeHtmlAttribute('&amp;quot;')).toBe('&quot;');
  });
});
