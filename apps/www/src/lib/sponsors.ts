import type { SponsorshipTier, SponsorshipTierId } from '#www/data/site';

type GitHubSponsorAccountKind = 'user' | 'organization';

export type SponsorEntry = {
  readonly login: string;
  readonly name: string;
  readonly url: string;
  readonly avatarUrl: string;
  readonly kind: GitHubSponsorAccountKind;
  readonly tier: SponsorshipTierId;
  readonly githubTierName: string;
  readonly monthlyPriceInDollars: number;
};

type PrivateSponsorCount = {
  readonly tier: SponsorshipTierId;
  readonly count: number;
};

export type SponsorsSnapshot = {
  readonly source: 'empty' | 'github';
  readonly generatedAt: string | null;
  readonly sponsors: readonly SponsorEntry[];
  readonly privateSponsors: readonly PrivateSponsorCount[];
};

type GitHubSponsorEntity =
  | {
      readonly __typename: 'User';
      readonly login: string;
      readonly name: string | null;
      readonly url: string;
      readonly avatarUrl: string;
    }
  | {
      readonly __typename: 'Organization';
      readonly login: string;
      readonly name: string | null;
      readonly url: string;
      readonly avatarUrl: string;
    };

type GitHubSponsorsTier = {
  readonly id: string;
  readonly name: string;
  readonly monthlyPriceInDollars: number;
  readonly isOneTime: boolean;
};

type GitHubSponsorship = {
  readonly isActive: boolean;
  readonly isOneTimePayment: boolean;
  readonly privacyLevel: 'PRIVATE' | 'PUBLIC';
  readonly sponsorEntity: GitHubSponsorEntity | null;
  readonly tier: GitHubSponsorsTier | null;
};

type GitHubPageInfo = {
  readonly endCursor: string | null;
  readonly hasNextPage: boolean;
};

export type GitHubSponsorsAccount = {
  readonly sponsorshipsAsMaintainer: {
    readonly nodes: readonly (GitHubSponsorship | null)[] | null;
    readonly pageInfo: GitHubPageInfo;
  } | null;
  readonly sponsorsListing: {
    readonly tiers: {
      readonly nodes: readonly GitHubSponsorsTier[] | null;
    } | null;
  } | null;
};

export type GitHubSponsorsResponse = {
  readonly user?: GitHubSponsorsAccount | null;
  readonly organization?: GitHubSponsorsAccount | null;
};

export const emptySponsorsSnapshot = {
  source: 'empty',
  generatedAt: null,
  sponsors: [],
  privateSponsors: [],
} satisfies SponsorsSnapshot;

export function normalizeSponsorsSnapshot(
  response: GitHubSponsorsResponse,
  configuredTiers: readonly SponsorshipTier[],
  generatedAt: string
): SponsorsSnapshot {
  const account = response.user ?? response.organization ?? null;
  const nodes = account?.sponsorshipsAsMaintainer?.nodes ?? [];
  const privateCounts = new Map<SponsorshipTierId, number>();
  const sponsors: SponsorEntry[] = [];

  for (const sponsorship of nodes) {
    if (
      !sponsorship?.isActive ||
      sponsorship.isOneTimePayment ||
      !sponsorship.tier ||
      sponsorship.tier.isOneTime
    ) {
      continue;
    }

    const githubTier = sponsorship.tier;
    const tier = findConfiguredTier(githubTier, configuredTiers);

    if (!tier) {
      continue;
    }

    if (sponsorship.privacyLevel === 'PRIVATE' || !sponsorship.sponsorEntity) {
      privateCounts.set(tier.id, (privateCounts.get(tier.id) ?? 0) + 1);
      continue;
    }

    sponsors.push({
      login: sponsorship.sponsorEntity.login,
      name: sponsorship.sponsorEntity.name?.trim() || sponsorship.sponsorEntity.login,
      url: sponsorship.sponsorEntity.url,
      avatarUrl: sponsorship.sponsorEntity.avatarUrl,
      kind: sponsorship.sponsorEntity.__typename === 'Organization' ? 'organization' : 'user',
      tier: tier.id,
      githubTierName: githubTier.name,
      monthlyPriceInDollars: githubTier.monthlyPriceInDollars,
    });
  }

  return {
    source: 'github',
    generatedAt,
    sponsors: sponsors.sort(compareSponsorEntries),
    privateSponsors: [...privateCounts]
      .map(([tier, count]) => ({ tier, count }))
      .sort((left, right) => tierRank(right.tier) - tierRank(left.tier)),
  };
}

export function sponsorsForTier(
  snapshot: SponsorsSnapshot,
  tier: SponsorshipTierId
): readonly SponsorEntry[] {
  return snapshot.sponsors.filter((sponsor) => sponsor.tier === tier);
}

export function privateSponsorCountForTier(
  snapshot: SponsorsSnapshot,
  tier: SponsorshipTierId
): number {
  return (
    snapshot.privateSponsors.find((privateSponsor) => privateSponsor.tier === tier)?.count ?? 0
  );
}

function findConfiguredTier(
  tier: GitHubSponsorsTier | null,
  configuredTiers: readonly SponsorshipTier[]
): SponsorshipTier | undefined {
  if (!tier) {
    return undefined;
  }

  const normalizedName = normalizeTierName(tier.name);

  return configuredTiers.find((configuredTier) => {
    const normalizedConfiguredName = normalizeTierName(configuredTier.githubTierName);
    const normalizedLabel = normalizeTierName(configuredTier.label);

    return (
      normalizedName === normalizedConfiguredName ||
      (normalizedName.includes('canvas timeline') && normalizedName.includes(normalizedLabel))
    );
  });
}

function compareSponsorEntries(left: SponsorEntry, right: SponsorEntry): number {
  const rankDelta = tierRank(right.tier) - tierRank(left.tier);

  if (rankDelta !== 0) {
    return rankDelta;
  }

  return left.login.localeCompare(right.login);
}

function tierRank(tier: SponsorshipTierId): number {
  switch (tier) {
    case 'gold':
      return 5;
    case 'silver':
      return 4;
    case 'bronze':
      return 3;
    case 'supporter':
      return 2;
    case 'backer':
      return 1;
  }
}

function normalizeTierName(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, ' ');
}
