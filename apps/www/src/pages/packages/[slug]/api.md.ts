import type { APIRoute, GetStaticPaths } from 'astro';
import { apiReference, type ApiPackage } from '#www/lib/api-reference';
import { buildApiPackageMarkdown } from '#www/lib/api-markdown';

interface Props {
  packageDoc: ApiPackage;
}

export const getStaticPaths = (() => {
  return apiReference.packages.map((packageDoc) => ({
    params: { slug: packageDoc.slug },
    props: { packageDoc },
  }));
}) satisfies GetStaticPaths;

export const GET = (({ props }) => {
  return new Response(buildApiPackageMarkdown(props.packageDoc), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
}) satisfies APIRoute<Props>;
