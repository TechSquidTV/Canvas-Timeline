export const openGraphImage = {
  width: 1200,
  height: 630,
  alt: 'Canvas Timeline documentation and engineering guides',
} as const;

export function openGraphRouteForPath(pathname: string): string {
  const normalizedPathname = pathname.replace(/\/index$/u, '/');
  const slug = normalizedPathname === '/' ? 'index' : normalizedPathname.replace(/^\/|\/$/gu, '');

  return `/open-graph/${slug}.png`;
}
