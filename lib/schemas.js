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
    slogan: 'A real advisor, from first conversation to return',
    description: 'WR Journeys is a human-curated journey house. AI helps the team connect, research, and coordinate faster; real advisors listen, plan, and stay responsible from the first idea through the traveller\'s return.',
    areaServed: ['China', 'United States', 'United Kingdom', 'Germany', 'France', 'Italy', 'Australia', 'Singapore', 'Hong Kong']
      .map(c => ({ '@type': 'Country', name: c })),
    knowsLanguage: ['zh-CN', 'en'],
  };
}

function localizedPath(path, lang = 'zh') {
  return lang === 'en' ? `/en${path}` : path;
}

function brandOrganization(brand, lang = 'zh') {
  const kind = brand.type === 'own' ? 'TravelAgency' : 'Organization';
  const path = localizedPath(`/brands/${brand.slug}`, lang);
  const obj = {
    '@context': 'https://schema.org',
    '@type': kind,
    '@id': entityId(path, 'brand'),
    name: bilingual(brand.name_zh, brand.name_en),
    url: url(path),
    description: lang === 'en' ? brand.summary_en : brand.summary_zh,
    inLanguage: lang === 'en' ? 'en' : 'zh-CN',
  };
  if (Array.isArray(brand.verified_same_as) && brand.verified_same_as.length) {
    obj.sameAs = brand.verified_same_as;
  }
  return obj;
}

function brandCollectionPage(brand, lang = 'zh', description = '', image = '') {
  const path = localizedPath(`/brands/${brand.slug}`, lang);
  const obj = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': entityId(path, 'webpage'),
    url: url(path),
    name: lang === 'en' ? brand.name_en : brand.name_zh,
    description: description || (lang === 'en' ? brand.summary_en : brand.summary_zh),
    inLanguage: lang === 'en' ? 'en' : 'zh-CN',
    isPartOf: { '@id': entityId('', 'website') },
    publisher: { '@id': entityId('', 'org') },
    about: {
      '@type': 'Brand',
      name: lang === 'en' ? brand.name_en : brand.name_zh,
      alternateName: lang === 'en' ? brand.name_zh : brand.name_en,
    },
  };
  if (image) obj.primaryImageOfPage = { '@type': 'ImageObject', url: url(image) };
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
    description: 'Human-curated slow-luxury journeys with a real advisor from first conversation to return.',
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

function faqPage(items, lang = 'zh') {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: lang === 'en' ? 'en' : 'zh-CN',
    mainEntity: items.map(item => ({
      '@type': 'Question',
      name: lang === 'en' ? item.q_en : item.q_zh,
      acceptedAnswer: {
        '@type': 'Answer',
        text: lang === 'en' ? item.a_en : item.a_zh,
      },
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
  travelAgency, brandOrganization, brandCollectionPage, website,
  breadcrumbList, itemList, faqPage, touristTrip, journalArticle,
};
