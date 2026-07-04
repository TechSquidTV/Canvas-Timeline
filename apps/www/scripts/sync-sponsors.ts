import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { site } from '../src/data/site';
import {
  emptySponsorsSnapshot,
  normalizeSponsorsSnapshot,
  type GitHubSponsorsAccount,
  type GitHubSponsorsResponse,
  type SponsorsSnapshot,
} from '../src/lib/sponsors';

type GitHubGraphQlResponse = {
  readonly data?: GitHubSponsorsResponse;
  readonly errors?: readonly {
    readonly message: string;
  }[];
};

const pageSize = 100;
const sponsorsToken = process.env.GITHUB_SPONSORS_TOKEN;
const outputPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/data/sponsors.generated.ts'
);

const query = `#graphql
query CanvasTimelineSponsors($login: String!, $sponsorshipsCursor: String) {
  user(login: $login) {
    ...CanvasTimelineSponsorsAccount
  }
  organization(login: $login) {
    ...CanvasTimelineSponsorsAccount
  }
}

fragment CanvasTimelineSponsorsAccount on Sponsorable {
    sponsorshipsAsMaintainer(
      first: ${pageSize}
      after: $sponsorshipsCursor
      activeOnly: true
      includePrivate: true
    ) {
      nodes {
        isActive
        isOneTimePayment
        privacyLevel
        sponsorEntity {
          __typename
          ... on User {
            login
            name
            url
            avatarUrl(size: 96)
          }
          ... on Organization {
            login
            name
            url
            avatarUrl(size: 96)
          }
        }
        tier {
          id
          name
          monthlyPriceInDollars
          isOneTime
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
    sponsorsListing {
      tiers(first: 100) {
        nodes {
          id
          name
          monthlyPriceInDollars
          isOneTime
        }
      }
    }
  }
}`;

async function main() {
  const token = sponsorsToken;

  if (!token) {
    await writeSnapshot(emptySponsorsSnapshot);
    console.info('GITHUB_SPONSORS_TOKEN is not set. Wrote an empty Sponsors snapshot.');
    return;
  }

  const snapshot = await fetchSponsorsSnapshot(token);

  await writeSnapshot(
    normalizeSponsorsSnapshot(snapshot, site.sponsorship.tiers, new Date().toISOString())
  );
  console.info('Wrote GitHub Sponsors snapshot.');
}

async function fetchSponsorsSnapshot(token: string): Promise<GitHubSponsorsResponse> {
  let cursor: string | null = null;
  let sponsorsListing: GitHubSponsorsAccount['sponsorsListing'] = null;
  let sponsorshipNodes: NonNullable<GitHubSponsorsAccount['sponsorshipsAsMaintainer']>['nodes'] =
    [];

  do {
    const body = await fetchSponsorsPage(token, cursor);
    const account = body.user ?? body.organization ?? null;

    if (!account) {
      throw new Error(
        `GitHub Sponsors GraphQL response did not include sponsors account "${site.sponsorship.accountLogin}".`
      );
    }

    const sponsorships = account.sponsorshipsAsMaintainer;

    if (!sponsorships) {
      throw new Error('GitHub Sponsors GraphQL response did not include sponsorships.');
    }

    sponsorsListing = account.sponsorsListing;
    sponsorshipNodes = [...(sponsorshipNodes ?? []), ...(sponsorships.nodes ?? [])];

    cursor = sponsorships.pageInfo.hasNextPage ? sponsorships.pageInfo.endCursor : null;
  } while (cursor);

  return {
    organization: {
      sponsorshipsAsMaintainer: {
        nodes: sponsorshipNodes,
        pageInfo: {
          endCursor: null,
          hasNextPage: false,
        },
      },
      sponsorsListing,
    },
  };
}

async function fetchSponsorsPage(
  token: string,
  sponsorshipsCursor: string | null
): Promise<GitHubSponsorsResponse> {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      authorization: `bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': 'canvas-timeline-sponsors-sync',
    },
    body: JSON.stringify({
      query,
      variables: {
        login: site.sponsorship.accountLogin,
        sponsorshipsCursor,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `GitHub Sponsors GraphQL request failed: ${response.status} ${response.statusText}`
    );
  }

  const body = (await response.json()) as GitHubGraphQlResponse;

  if (body.errors?.length) {
    throw new Error(body.errors.map((error) => error.message).join('\n'));
  }

  if (!body.data) {
    throw new Error('GitHub Sponsors GraphQL response did not include data.');
  }

  return body.data;
}

async function writeSnapshot(snapshot: SponsorsSnapshot) {
  const source = formatSnapshotSource(snapshot);

  await mkdir(dirname(outputPath), { recursive: true });

  const currentSource = await readFile(outputPath, 'utf8').catch(() => '');

  if (currentSource === source) {
    return;
  }

  await writeFile(outputPath, source);
}

function formatSnapshotSource(snapshot: SponsorsSnapshot): string {
  return `import type { SponsorsSnapshot } from '@/lib/sponsors';

export const sponsorsSnapshot = {
  source: ${stringLiteral(snapshot.source)},
  generatedAt: ${snapshot.generatedAt ? stringLiteral(snapshot.generatedAt) : 'null'},
  sponsors: ${formatSponsors(snapshot.sponsors)},
  privateSponsors: ${formatPrivateSponsors(snapshot.privateSponsors)},
} satisfies SponsorsSnapshot;
`;
}

function formatSponsors(sponsors: SponsorsSnapshot['sponsors']): string {
  if (sponsors.length === 0) {
    return '[]';
  }

  return `[
    ${sponsors
      .map(
        (sponsor) => `{
      login: ${stringLiteral(sponsor.login)},
      name: ${stringLiteral(sponsor.name)},
      url: ${stringLiteral(sponsor.url)},
      avatarUrl: ${stringLiteral(sponsor.avatarUrl)},
      kind: ${stringLiteral(sponsor.kind)},
      tier: ${stringLiteral(sponsor.tier)},
      githubTierName: ${stringLiteral(sponsor.githubTierName)},
      monthlyPriceInDollars: ${sponsor.monthlyPriceInDollars},
    }`
      )
      .join(',\n    ')},
  ]`;
}

function formatPrivateSponsors(privateSponsors: SponsorsSnapshot['privateSponsors']): string {
  if (privateSponsors.length === 0) {
    return '[]';
  }

  return `[
    ${privateSponsors
      .map(
        (privateSponsor) => `{
      tier: ${stringLiteral(privateSponsor.tier)},
      count: ${privateSponsor.count},
    }`
      )
      .join(',\n    ')},
  ]`;
}

function stringLiteral(value: string): string {
  const jsonString = JSON.stringify(value);
  const jsonStringBody = jsonString.slice(1, -1).replaceAll("'", "\\'");

  return `'${jsonStringBody}'`;
}

await main();
