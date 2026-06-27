// JSON-LD schema generators for WR Journeys
// JS port of wr-journeys-design-bak/schemas/ (Python)

const SITE_URL = 'https://itinerary.wildroadgroup.com';

function url(path = '') {
  if (!path) return SITE_URL;
  if (!path.startsWith('/')) path = '/' + path;
  return SITE_URL + path;
}

function entityId(path, kind) {
  return `${url(path)}#${kind}`;
}

function bilingual(zh, en) {
  const out = [];
  if (zh) out.push({ '@language': 'zh-CN', '@value': zh });
  if (en) out.push({ '@language': 'en', '@value': en });
  return out;
}

function priceSpecification(price, currency = 'CNY', description = 'Starting from') {
  return {
    '@type': 'PriceSpecification',
    minPrice: price,
    priceCurrency: currency,
    description,
    valueAddedTaxIncluded: false,
  };
}

function audience(geographicAreas = [], languages = []) {
  const aud = { '@type': 'PeopleAudience' };
  if (geographicAreas.length) {
    aud.geographicArea = geographicAreas.map(g => ({ '@type': 'Country', name: g }));
  }
  if (languages.length) aud.availableLanguage = languages;
  return aud;
}

// --- Organization ---

function travelAgency() {
  return {
    '@context': 'https://schema.org',
    '@type': 'TravelAgency',
    '@id': entityId('', 'org'),
    name: 'WR Journeys',
    alternateName: ['野路逸行', 'WR Travel'],
    url: url('/'),
    logo: url('/favicon.png'),
    areaServed: ['China', 'United States', 'United Kingdom', 'Germany', 'France', 'Italy', 'Australia', 'Singapore', 'Hong Kong']
      .map(c => ({ '@type': 'Country', name: c })),
    knowsLanguage: ['zh-CN', 'en'],
  };
}

function brandOrganization(brand) {
  const kind = brand.type === 'own' ? 'TravelAgency' : 'Organization';
  const path = `/brands/${brand.slug}`;
  const obj = {
    '@context': 'https://schema.org',
    '@type': kind,
    '@id': entityId(path, 'brand'),
    name: bilingual(brand.name_zh, brand.name_en),
    url: url(path),
    description: brand.summary_en || brand.summary_zh,
  };
  if (brand.external_url) obj.sameAs = [brand.external_url];
  return obj;
}

// --- WebSite ---

function website() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': entityId('', 'website'),
    url: url('/'),
    name: 'WR Journeys',
    inLanguage: ['zh-CN', 'en'],
    publisher: { '@id': entityId('', 'org') },
  };
}

// --- BreadcrumbList ---

function breadcrumbList(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: url(it.path),
    })),
  };
}

// --- ItemList (for /brands, /modes, /destinations, /journal indices) ---

function itemList(items, listName) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listName,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: it.url.startsWith('http') ? it.url : url(it.url),
      name: it.name,
    })),
  };
}

// --- TouristTrip (for /routes/:slug) ---

function touristTrip(route, brand, lang = 'zh') {
  const isEn = lang === 'en';
  const path = `/routes/${route.slug}`;
  const obj = {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    '@id': entityId(path, 'trip'),
    name: isEn ? route.title_en : route.title_zh,
    description: isEn ? route.subtitle_en : route.subtitle_zh,
    url: url(path),
    duration: `P${route.days}D`,
    inLanguage: ['zh-CN', 'en'],
    touristType: 'Luxury slow travel',
  };
  if (route.hero_path) obj.image = url(route.hero_path);
  if (brand) {
    obj.provider = {
      '@type': brand.type === 'own' ? 'TravelAgency' : 'Organization',
      '@id': entityId(`/brands/${brand.slug}`, 'brand'),
      name: brand.name_en || brand.name_zh,
    };
  }
  // Inbound audience hint
  obj.audience = audience(
    ['United States', 'United Kingdom', 'Germany', 'France', 'Italy', 'Australia', 'Singapore', 'Hong Kong'],
    ['en', 'zh-CN']
  );
  return obj;
}

// --- Article (for /journal/:slug) ---

function journalArticle(guide, lang = 'zh') {
  const isEn = lang === 'en';
  const path = `/journal/${guide.slug}`;
  const obj = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': entityId(path, 'article'),
    headline: isEn ? guide.title_en : guide.title_zh,
    description: isEn ? (guide.description_en || guide.subtitle_en || '') : (guide.description_zh || guide.subtitle_zh || ''),
    url: url(path),
    inLanguage: isEn ? 'en' : 'zh-CN',
    publisher: { '@id': entityId('', 'org') },
  };
  if (guide.datePublished) obj.datePublished = guide.datePublished;
  if (guide.image) obj.image = url(guide.image);
  return obj;
}

module.exports = {
  SITE_URL, url, entityId, bilingual, priceSpecification, audience,
  travelAgency, brandOrganization, website,
  breadcrumbList, itemList, touristTrip, journalArticle,
};
