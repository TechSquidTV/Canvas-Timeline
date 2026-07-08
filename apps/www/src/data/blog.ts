import type { CollectionEntry } from 'astro:content';
import { getCollection } from 'astro:content';
import { openGraphImage, openGraphRouteForPath } from '#www/lib/open-graph';

export type BlogPost = CollectionEntry<'blog'>;
type BlogPostImage = {
  readonly src: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
};

const publishedDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
  year: 'numeric',
});

export async function getBlogPosts(): Promise<BlogPost[]> {
  const posts = await getCollection(
    'blog',
    (post: BlogPost) => import.meta.env.DEV || !post.data.draft
  );

  return sortBlogPosts(posts);
}

function sortBlogPosts(posts: BlogPost[]): BlogPost[] {
  return [...posts].sort(
    (firstPost, secondPost) =>
      secondPost.data.publishDate.getTime() - firstPost.data.publishDate.getTime()
  );
}

export function getBlogPostUrl(post: BlogPost): string {
  return `/blog/${post.id}`;
}

export function formatBlogDate(date: Date): string {
  return publishedDateFormatter.format(date);
}

export function getBlogPostImage(post: BlogPost): BlogPostImage {
  return (
    post.data.image ?? {
      src: openGraphRouteForPath(getBlogPostUrl(post)),
      alt: openGraphImage.alt,
      width: openGraphImage.width,
      height: openGraphImage.height,
    }
  );
}

export function getReadingMinutes(body: string): number {
  const words = body.trim().split(/\s+/u).filter(Boolean);

  return Math.max(1, Math.ceil(words.length / 225));
}
