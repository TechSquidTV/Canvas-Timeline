import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { docsSectionIds } from '#www/data/docs';
import { reactRegistryItems } from '#www/data/react-registry';
import { site } from '#www/data/site';

const reactRegistryKeys = new Set(reactRegistryItems.map((item) => item.slug));

const docs = defineCollection({
  loader: glob({
    base: './src/content/docs',
    pattern: '**/*.{md,mdx}',
  }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    section: z.enum(docsSectionIds),
    order: z.number(),
  }),
});

const blog = defineCollection({
  loader: glob({
    base: './src/content/blog',
    pattern: '**/*.{md,mdx}',
  }),
  schema: z
    .object({
      title: z.string().min(1).max(72),
      description: z.string().min(50).max(160),
      publishDate: z.date(),
      updatedDate: z.date().optional(),
      author: z.string().min(1).max(80),
      tags: z.array(z.string().min(1).max(40)).min(1).max(8),
      faq: z
        .array(
          z
            .object({
              question: z.string().min(1).max(140),
              answer: z.string().min(1).max(600),
            })
            .strict()
        )
        .min(1)
        .max(8)
        .optional(),
      draft: z.boolean().default(false),
      canonicalUrl: z.string().url().optional(),
      image: z
        .object({
          src: z.string().startsWith('/'),
          alt: z.string().min(1).max(140),
          width: z.number().int().positive().default(site.defaultSocialImage.width),
          height: z.number().int().positive().default(site.defaultSocialImage.height),
        })
        .strict()
        .optional(),
    })
    .strict(),
});

const reactRegistryDocs = defineCollection({
  loader: glob({
    base: './src/content/react-registry',
    pattern: '**/*.{md,mdx}',
  }),
  schema: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    registryKey: z.string().refine((key) => reactRegistryKeys.has(key), {
      message: 'Unknown React registry key',
    }),
  }),
});

export const collections = { blog, docs, reactRegistryDocs };
