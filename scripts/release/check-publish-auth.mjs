import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;

if (!requestUrl || !requestToken) {
  throw new Error('Publishing requires the GitHub Actions OIDC request URL and token.');
}

const url = new URL(requestUrl);
url.searchParams.set('audience', 'npm:registry.npmjs.org');
const identityResponse = await globalThis.fetch(url, {
  headers: { Authorization: `Bearer ${requestToken}` },
});
if (!identityResponse.ok) {
  throw new Error(`GitHub OIDC identity request failed: HTTP ${identityResponse.status}`);
}
const identity = await identityResponse.json();
if (typeof identity.value !== 'string') {
  throw new Error('GitHub OIDC response did not contain an identity token.');
}

const config = JSON.parse(
  await readFile(new URL('../../.changeset/config.json', import.meta.url), 'utf8')
);
for (const name of config.fixed.flat()) {
  const response = await globalThis.fetch(
    `https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/${encodeURIComponent(name)}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${identity.value}`, 'Content-Length': '0' },
      body: '',
    }
  );
  if (!response.ok) {
    const error = await response.json();
    // Only report error fields; successful responses contain credentials.
    throw new Error(
      `npm OIDC exchange failed for ${name}: HTTP ${response.status}; ${error.message ?? error.body?.message ?? 'no error message'}`
    );
  }
  await response.body?.cancel();
  console.log(`npm trusted publishing verified: ${name}`);
}
