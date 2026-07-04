import { openGraphImage, openGraphRouteForPath } from '../lib/open-graph';

export type SiteLink = {
  readonly label: string;
  readonly href: string;
};

export type SponsorshipTierId = 'backer' | 'supporter' | 'bronze' | 'silver' | 'gold';

export type SponsorshipTier = {
  readonly id: SponsorshipTierId;
  readonly label: string;
  readonly githubTierName: string;
  readonly monthlyPriceInDollars: number;
  readonly description: string;
};

type PackageResourceLinks = {
  readonly npm: SiteLink;
  readonly github: SiteLink;
};

export type PackageResourceSlug =
  | 'timeline'
  | 'core'
  | 'react'
  | 'html-media-adapter'
  | 'mediabunny-adapter'
  | 'renderer'
  | 'utils';

const packageResources = {
  timeline: {
    npm: {
      label: 'NPM',
      href: 'https://www.npmjs.com/package/@techsquidtv/canvas-timeline',
    },
    github: {
      label: 'GitHub',
      href: 'https://github.com/techsquidtv/canvas-timeline/tree/main/packages/timeline',
    },
  },
  core: {
    npm: {
      label: 'NPM',
      href: 'https://www.npmjs.com/package/@techsquidtv/canvas-timeline-core',
    },
    github: {
      label: 'GitHub',
      href: 'https://github.com/techsquidtv/canvas-timeline/tree/main/packages/core',
    },
  },
  react: {
    npm: {
      label: 'NPM',
      href: 'https://www.npmjs.com/package/@techsquidtv/canvas-timeline-react',
    },
    github: {
      label: 'GitHub',
      href: 'https://github.com/techsquidtv/canvas-timeline/tree/main/packages/react',
    },
  },
  'html-media-adapter': {
    npm: {
      label: 'NPM',
      href: 'https://www.npmjs.com/package/@techsquidtv/canvas-timeline-html-media-adapter',
    },
    github: {
      label: 'GitHub',
      href: 'https://github.com/techsquidtv/canvas-timeline/tree/main/packages/html-media-adapter',
    },
  },
  'mediabunny-adapter': {
    npm: {
      label: 'NPM',
      href: 'https://www.npmjs.com/package/@techsquidtv/canvas-timeline-mediabunny-adapter',
    },
    github: {
      label: 'GitHub',
      href: 'https://github.com/techsquidtv/canvas-timeline/tree/main/packages/mediabunny-adapter',
    },
  },
  renderer: {
    npm: {
      label: 'NPM',
      href: 'https://www.npmjs.com/package/@techsquidtv/canvas-timeline-renderer',
    },
    github: {
      label: 'GitHub',
      href: 'https://github.com/techsquidtv/canvas-timeline/tree/main/packages/renderer',
    },
  },
  utils: {
    npm: {
      label: 'NPM',
      href: 'https://www.npmjs.com/package/@techsquidtv/canvas-timeline-utils',
    },
    github: {
      label: 'GitHub',
      href: 'https://github.com/techsquidtv/canvas-timeline/tree/main/packages/utils',
    },
  },
} satisfies Record<PackageResourceSlug, PackageResourceLinks>;

const sponsorship = {
  label: 'Sponsor Canvas Timeline',
  href: 'https://github.com/sponsors/techsquidtv',
  accountLogin: 'techsquidtv',
  projectName: 'Canvas Timeline',
  tiers: [
    {
      id: 'backer',
      label: 'Backer',
      githubTierName: 'Buy me a cookie',
      monthlyPriceInDollars: 5,
      description: 'A small monthly thank-you with a GitHub Sponsor badge.',
    },
    {
      id: 'supporter',
      label: 'Supporter',
      githubTierName: 'Canvas Timeline - Supporter',
      monthlyPriceInDollars: 25,
      description: 'Listed with other Canvas Timeline supporters on the site.',
    },
    {
      id: 'bronze',
      label: 'Bronze',
      githubTierName: 'Canvas Timeline - Bronze',
      monthlyPriceInDollars: 50,
      description: 'Bronze placement for teams backing the editor engine.',
    },
    {
      id: 'silver',
      label: 'Silver',
      githubTierName: 'Canvas Timeline - Silver',
      monthlyPriceInDollars: 100,
      description: 'Silver placement for organizations investing in the roadmap.',
    },
    {
      id: 'gold',
      label: 'Gold',
      githubTierName: 'Canvas Timeline - Gold',
      monthlyPriceInDollars: 250,
      description: 'Prominent placement for major Canvas Timeline sponsors.',
    },
  ],
} satisfies {
  readonly label: string;
  readonly href: string;
  readonly accountLogin: string;
  readonly projectName: string;
  readonly tiers: readonly SponsorshipTier[];
};

export const site = {
  name: 'Canvas Timeline',
  description: 'A Canvas-based timeline editor and engine for React applications.',
  url: 'https://canvastimeline.com',
  repository: {
    label: 'GitHub',
    href: 'https://github.com/techsquidtv/canvas-timeline',
  },
  sponsorship,
  primaryNav: [
    { label: 'Docs', href: '/docs' },
    { label: 'Packages', href: '/packages' },
    { label: 'Registry', href: '/packages/react/registry' },
    { label: 'Demos', href: '/demos' },
    { label: 'Blog', href: '/blog' },
    { label: 'Sponsor', href: sponsorship.href },
  ],
  packageResources,
  footerGroups: [
    {
      title: 'Learn',
      links: [
        { label: 'Docs', href: '/docs' },
        { label: 'Getting started', href: '/docs/getting-started' },
        { label: 'Demos', href: '/demos' },
        { label: 'Blog', href: '/blog' },
      ],
    },
    {
      title: 'Packages',
      links: [
        { label: 'Main package', href: '/packages/timeline' },
        { label: 'Core', href: '/packages/core' },
        { label: 'React', href: '/packages/react' },
        { label: 'Renderer', href: '/packages/renderer' },
      ],
    },
    {
      title: 'Resources',
      links: [
        { label: 'NPM', href: packageResources.timeline.npm.href },
        { label: 'GitHub', href: 'https://github.com/techsquidtv/canvas-timeline' },
        { label: 'React registry', href: '/packages/react/registry' },
        { label: 'Sponsor', href: sponsorship.href },
      ],
    },
  ],
  defaultSocialImage: {
    src: openGraphRouteForPath('/'),
    alt: openGraphImage.alt,
    width: openGraphImage.width,
    height: openGraphImage.height,
  },
};

export function packageResourceLinks(slug: PackageResourceSlug): SiteLink[] {
  const resource = site.packageResources[slug];

  return [resource.npm, resource.github];
}
