import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildDocsIndexMarkdown } from '#www/lib/docs-markdown';

export const GET = (async () => {
  const docs = await getCollection('docs');

  return markdownResponse(buildDocsIndexMarkdown(docs));
}) satisfies APIRoute;

function markdownResponse(markdown: string) {
  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
}
