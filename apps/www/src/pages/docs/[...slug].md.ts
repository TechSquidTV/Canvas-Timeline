import type { APIRoute, GetStaticPaths } from 'astro';
import type { CollectionEntry } from 'astro:content';
import { getCollection } from 'astro:content';
import { buildDocsMarkdown } from '@/lib/docs-markdown';

type DocsEntry = CollectionEntry<'docs'>;

interface Props {
  entry: DocsEntry;
}

export const getStaticPaths = (async () => {
  const docs = await getCollection('docs');

  return docs.map((entry: DocsEntry) => ({
    params: { slug: entry.id },
    props: { entry },
  }));
}) satisfies GetStaticPaths;

export const GET = (({ props }) => {
  return new Response(buildDocsMarkdown(props.entry), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
}) satisfies APIRoute<Props>;
