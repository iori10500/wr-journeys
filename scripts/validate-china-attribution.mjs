import assert from 'node:assert/strict';

const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3099';

async function get(path) {
  const response = await fetch(`${origin}${path}`);
  return { response, html: await response.text() };
}

for (const path of [
  '/destinations/china',
  '/en/destinations/china',
  '/guides/first-trip-to-china',
  '/en/destinations/china/xian',
  '/brands/jianglu',
]) {
  const { response, html } = await get(path);
  assert.equal(response.status, 200, `${path} must render`);
  assert.match(html, /content_group: 'china_inbound'/, `${path} must expose China content group`);
  assert.match(html, /landing_path: '' \|\| location\.pathname/, `${path} must use the browser-visible landing path`);
}

const advisor = await get('/en/advisor?source=china-hub-hero&landing_path=%2Fen%2Fdestinations%2Fchina&content_group=china_inbound');
assert.equal(advisor.response.status, 200);
assert.match(advisor.html, /content_group: 'china_inbound'/, 'Advisor must retain its originating China group');
assert.match(advisor.html, /landing_path: '\/en\/destinations\/china'/, 'Advisor must retain its originating landing path');

const malformed = await get('/advisor?landing_path=https%3A%2F%2Fevil.example&content_group=unknown');
assert.equal(malformed.response.status, 200);
assert.match(malformed.html, /content_group: 'wr_journeys'/, 'Unknown content groups must not be accepted');
assert.doesNotMatch(malformed.html, /evil\.example/, 'External landing paths must not be reflected');

console.log('China landing attribution context: OK');
