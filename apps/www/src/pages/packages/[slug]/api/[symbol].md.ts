import type { APIRoute, GetStaticPaths } from 'astro';
import { apiReference, type ApiPackage, type ApiSymbol } from '@/lib/api-reference';
import { buildApiSymbolMarkdown } from '@/lib/api-markdown';

interface Props {
  packageDoc: ApiPackage;
  symbol: ApiSymbol;
}

export const getStaticPaths = (() => {
  return apiReference.packages.flatMap((packageDoc) =>
    packageDoc.symbols.map((symbol) => ({
      params: { slug: packageDoc.slug, symbol: symbol.slug },
      props: { packageDoc, symbol },
    }))
  );
}) satisfies GetStaticPaths;

export const GET = (({ props }) => {
  return new Response(buildApiSymbolMarkdown(props.packageDoc, props.symbol), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
}) satisfies APIRoute<Props>;
