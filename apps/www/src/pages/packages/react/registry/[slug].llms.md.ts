import type { APIRoute, GetStaticPaths } from 'astro';
import { reactRegistryItems, type ReactRegistryItem } from '#www/data/react-registry';
import { buildReactRegistryLlmMarkdown } from '#www/lib/react-registry-markdown';

interface Props {
  item: ReactRegistryItem;
}

export const getStaticPaths = (() => {
  return reactRegistryItems.map((item) => ({
    params: { slug: item.slug },
    props: { item },
  }));
}) satisfies GetStaticPaths;

export const GET = (({ props }) => {
  return new Response(buildReactRegistryLlmMarkdown(props.item), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
}) satisfies APIRoute<Props>;
