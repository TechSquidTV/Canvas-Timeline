import type { SponsorsSnapshot } from '@/lib/sponsors';

export const sponsorsSnapshot = {
  source: 'empty',
  generatedAt: null,
  sponsors: [],
  privateSponsors: [],
} satisfies SponsorsSnapshot;
