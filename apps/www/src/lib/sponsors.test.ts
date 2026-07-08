import { describe, expect, test } from 'vite-plus/test';
import { site } from '#www/data/site';
import { normalizeSponsorsSnapshot, type GitHubSponsorsResponse } from '#www/lib/sponsors';

const tiers = site.sponsorship.tiers;
type SponsorshipNode = NonNullable<
  NonNullable<
    NonNullable<NonNullable<GitHubSponsorsResponse['user']>['sponsorshipsAsMaintainer']>['nodes']
  >[number]
>;

describe('GitHub Sponsors normalization', () => {
  test('groups public user and organization sponsors by Canvas Timeline tiers', () => {
    const snapshot = normalizeSponsorsSnapshot(
      responseWith([
        sponsorship({
          sponsorEntity: {
            __typename: 'User',
            login: 'octocat',
            name: 'The Octocat',
            url: 'https://github.com/octocat',
            avatarUrl: 'https://avatars.githubusercontent.com/u/583231',
          },
          tier: tier('Canvas Timeline - Gold', 250),
        }),
        sponsorship({
          sponsorEntity: {
            __typename: 'Organization',
            login: 'example-org',
            name: null,
            url: 'https://github.com/example-org',
            avatarUrl: 'https://avatars.githubusercontent.com/u/1',
          },
          tier: tier('Canvas Timeline - Bronze', 50),
        }),
      ]),
      tiers,
      '2026-07-03T00:00:00.000Z'
    );

    expect(snapshot.sponsors).toEqual([
      {
        login: 'octocat',
        name: 'The Octocat',
        url: 'https://github.com/octocat',
        avatarUrl: 'https://avatars.githubusercontent.com/u/583231',
        kind: 'user',
        tier: 'gold',
        githubTierName: 'Canvas Timeline - Gold',
        monthlyPriceInDollars: 250,
      },
      {
        login: 'example-org',
        name: 'example-org',
        url: 'https://github.com/example-org',
        avatarUrl: 'https://avatars.githubusercontent.com/u/1',
        kind: 'organization',
        tier: 'bronze',
        githubTierName: 'Canvas Timeline - Bronze',
        monthlyPriceInDollars: 50,
      },
    ]);
  });

  test('counts private sponsors without exposing account details', () => {
    const snapshot = normalizeSponsorsSnapshot(
      responseWith([
        sponsorship({
          privacyLevel: 'PRIVATE',
          sponsorEntity: null,
          tier: tier('Canvas Timeline - Silver', 100),
        }),
      ]),
      tiers,
      '2026-07-03T00:00:00.000Z'
    );

    expect(snapshot.sponsors).toEqual([]);
    expect(snapshot.privateSponsors).toEqual([{ tier: 'silver', count: 1 }]);
  });

  test('ignores active sponsorships with missing or unrelated tiers', () => {
    const snapshot = normalizeSponsorsSnapshot(
      responseWith([
        sponsorship({ tier: null }),
        sponsorship({ tier: tier('Cliparr Gold', 250) }),
        sponsorship({ tier: tier('Totally Custom', 123) }),
      ]),
      tiers,
      '2026-07-03T00:00:00.000Z'
    );

    expect(snapshot.sponsors).toEqual([]);
    expect(snapshot.privateSponsors).toEqual([]);
  });

  test('ignores inactive and one-time sponsorships', () => {
    const snapshot = normalizeSponsorsSnapshot(
      responseWith([
        sponsorship({ isActive: false, tier: tier('Canvas Timeline - Gold', 250) }),
        sponsorship({
          isOneTimePayment: true,
          tier: tier('Canvas Timeline - Gold', 250),
        }),
        sponsorship({
          tier: { ...tier('Canvas Timeline - Gold', 250), isOneTime: true },
        }),
      ]),
      tiers,
      '2026-07-03T00:00:00.000Z'
    );

    expect(snapshot.sponsors).toEqual([]);
    expect(snapshot.privateSponsors).toEqual([]);
  });

  test('maps the shared backer tier by exact GitHub tier name', () => {
    const snapshot = normalizeSponsorsSnapshot(
      responseWith([sponsorship({ tier: tier('Buy me a cookie', 5) })]),
      tiers,
      '2026-07-03T00:00:00.000Z'
    );

    expect(snapshot.sponsors[0]?.tier).toBe('backer');
    expect(snapshot.sponsors[0]?.githubTierName).toBe('Buy me a cookie');
  });
});

function responseWith(nodes: readonly SponsorshipNode[]): GitHubSponsorsResponse {
  return {
    user: {
      sponsorshipsAsMaintainer: {
        nodes,
        pageInfo: {
          endCursor: null,
          hasNextPage: false,
        },
      },
      sponsorsListing: {
        tiers: {
          nodes: tiers.map((configuredTier) =>
            tier(configuredTier.githubTierName, configuredTier.monthlyPriceInDollars)
          ),
        },
      },
    },
  };
}

function sponsorship(overrides: Partial<SponsorshipNode> = {}): SponsorshipNode {
  return {
    isActive: true,
    isOneTimePayment: false,
    privacyLevel: 'PUBLIC',
    sponsorEntity: {
      __typename: 'User',
      login: 'sponsor',
      name: 'Sponsor',
      url: 'https://github.com/sponsor',
      avatarUrl: 'https://avatars.githubusercontent.com/u/2',
    },
    tier: tier('Buy me a cookie', 5),
    ...overrides,
  };
}

function tier(name: string, monthlyPriceInDollars: number) {
  return {
    id: name.toLowerCase().replaceAll(' ', '-'),
    name,
    monthlyPriceInDollars,
    isOneTime: false,
  };
}
