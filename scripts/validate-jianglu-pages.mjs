import assert from 'node:assert/strict';

const localOrigin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3099';
const publicOrigin = 'https://itinerary.wildroadgroup.com';
const heroPath = '/images/brands/jianglu/lodges/wunongding/hero-2026.jpg';

function attr(html, tag, name, value, target = 'content') {
  const pattern = new RegExp(`<${tag}[^>]*${name}=["']${value}["'][^>]*${target}=["']([^"']+)["'][^>]*>`, 'i');
  const reverse = new RegExp(`<${tag}[^>]*${target}=["']([^"']+)["'][^>]*${name}=["']${value}["'][^>]*>`, 'i');
  return html.match(pattern)?.[1] || html.match(reverse)?.[1] || '';
}

function jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
}

function decodeHtml(value) {
  return String(value || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function internalLinks(html) {
  return [...new Set([...html.matchAll(/href="([^"#]+)"/g)]
    .map(match => match[1])
    .filter(href => href.startsWith('/'))
    .map(href => href.split('?')[0]))];
}

async function get(path) {
  const response = await fetch(`${localOrigin}${path}`);
  return { response, html: await response.text() };
}

const cases = [
  {
    lang: 'zh',
    path: '/brands/jianglu',
    canonical: `${publicOrigin}/brands/jianglu`,
    title: '匠庐酒店与旅行线路｜贵州、大理、香格里拉｜WR Journeys',
    breadcrumbPaths: ['/', '/brands', '/brands/jianglu'],
    routePrefix: `${publicOrigin}/routes/`,
  },
  {
    lang: 'en',
    path: '/en/brands/jianglu',
    canonical: `${publicOrigin}/en/brands/jianglu`,
    title: 'Jianglu Hotels: Guizhou, Dali & Shangri-La | WR Journeys',
    breadcrumbPaths: ['/en/', '/en/brands', '/en/brands/jianglu'],
    routePrefix: `${publicOrigin}/en/routes/`,
  },
];

for (const item of cases) {
  const { response, html } = await get(item.path);
  assert.equal(response.status, 200, `${item.path} must return 200`);
  assert.equal(decodeHtml(html.match(/<title>(.*?)<\/title>/)?.[1]), item.title);
  assert.equal(attr(html, 'link', 'rel', 'canonical', 'href'), item.canonical);
  assert.equal(attr(html, 'link', 'hreflang', 'zh-CN', 'href'), `${publicOrigin}/brands/jianglu`);
  assert.equal(attr(html, 'link', 'hreflang', 'en', 'href'), `${publicOrigin}/en/brands/jianglu`);
  assert.equal(attr(html, 'link', 'hreflang', 'x-default', 'href'), `${publicOrigin}/brands/jianglu`);
  assert.match(attr(html, 'meta', 'property', 'og:image'), /\/wunongding\/hero-2026\.jpg/);
  assert.match(html, /class="be-region"/);
  assert.equal((html.match(/class="be-atlas-pin /g) || []).length, 3, `${item.path} must show three map pins`);
  assert.equal((html.match(/class="be-visual-scene"/g) || []).length, 3, `${item.path} must show three visual scenes`);
  assert.equal((html.match(/class="be-lodge"/g) || []).length, 8, `${item.path} must show eight stays`);
  assert.equal((html.match(/class="be-route-card"/g) || []).length, 9, `${item.path} must show nine routes`);
  assert.equal((html.match(/class="be-faq"/g) || []).length, 4, `${item.path} must show four FAQs`);
  assert.doesNotMatch(html, /广西|Guangxi/, `${item.path} must not retain the disproven Guangxi geography`);

  const schemas = jsonLd(html);
  const collection = schemas.find(schema => schema['@type'] === 'CollectionPage');
  const breadcrumb = schemas.find(schema => schema['@type'] === 'BreadcrumbList');
  const routeList = schemas.find(schema => schema['@type'] === 'ItemList');
  const faq = schemas.find(schema => schema['@type'] === 'FAQPage');
  assert.equal(collection?.url, item.canonical);
  assert.equal(collection?.inLanguage, item.lang === 'en' ? 'en' : 'zh-CN');
  assert.equal(collection?.about?.['@type'], 'Brand');
  assert.equal(collection?.primaryImageOfPage?.url, `${publicOrigin}${heroPath}`);
  assert.deepEqual(breadcrumb?.itemListElement.map(entry => new URL(entry.item).pathname), item.breadcrumbPaths);
  assert.equal(routeList?.numberOfItems, 9);
  assert.ok(routeList?.itemListElement.every(entry => entry.url.startsWith(item.routePrefix)), `${item.path} route schema URLs must match the page language`);
  assert.equal(faq?.mainEntity.length, 4);
  assert.ok(schemas.every(schema => !Object.hasOwn(schema, 'sameAs')), `${item.path} must not publish unverified sameAs`);

  const links = internalLinks(html);
  const linkResults = await Promise.all(links.map(async link => ({ link, status: (await fetch(`${localOrigin}${link}`)).status })));
  const failures = linkResults.filter(result => result.status >= 400);
  assert.deepEqual(failures, [], `${item.path} has broken internal links`);
}

const sitemap = await get('/sitemap.xml');
assert.equal(sitemap.response.status, 200);
assert.match(sitemap.html, new RegExp(`<loc>${publicOrigin}/brands/jianglu<\\/loc>`));
assert.match(sitemap.html, new RegExp(`<loc>${publicOrigin}/en/brands/jianglu<\\/loc>`));

const generic = await get('/en/brands/songtsam');
assert.equal(generic.response.status, 200, 'Generic brand template must still render');
assert.equal(attr(generic.html, 'link', 'rel', 'canonical', 'href'), `${publicOrigin}/en/brands/songtsam`);

console.log('Jianglu bilingual HTML, metadata, schema, links and sitemap: OK');
