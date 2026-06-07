const express = require('express');
const path = require('path');
const fs = require('fs');

function extractBrochureContent(html) {
  // Extract <style> blocks (may be multiple)
  const styleMatches = html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
  let styles = styleMatches.join('\n');

  // Scope :root to .brochure-content to avoid CSS variable conflicts
  styles = styles.replace(/:root\s*\{/g, '.brochure-content {');

  // Extract <body> inner content
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : html;

  return { styles, bodyContent };
}

const app = express();
app.disable('x-powered-by');
const PORT = 3099;

// Set EJS as view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Format price for display
function formatPrice(itinerary, lang) {
  if (!itinerary || itinerary.priceType === 'custom') {
    return lang === 'en'
      ? { text: 'Custom Quote', sub: '', discount: null }
      : { text: '定制报价', sub: 'Custom Quote', discount: null };
  }

  const v = itinerary.priceValue;
  const curr = itinerary.priceCurrency;
  const en = lang === 'en';
  let text = '';
  let sub = '';
  let discount = null;

  if (itinerary.priceDiscount) {
    const pct = Math.round(itinerary.priceDiscount * 100);
    discount = en ? `${pct}% off` : `含 ${pct}% 折扣`;
  }

  if (curr === 'CNY') {
    const formatted = v.toLocaleString('zh-CN');
    if (itinerary.priceType === 'perPerson') {
      text = en ? `¥${formatted}/person` : `¥${formatted}/人起`;
      sub = `from ¥${formatted}/person`;
    } else {
      text = `¥${formatted}${en ? '/group' : '/团'}${itinerary.priceGroupSize ? ` (${itinerary.priceGroupSize}${en ? 'pax' : '人'})` : ''}`;
      sub = text;
    }
  } else {
    const rates = { USD: 6.7961, HKD: 0.8673 };
    const rate = rates[curr] || 1;
    const cnyValue = Math.round(v * rate);
    const cnyFormatted = cnyValue.toLocaleString('zh-CN');
    const origFormatted = v.toLocaleString('zh-CN');

    if (itinerary.priceType === 'perPerson') {
      text = `≈¥${cnyFormatted}${en ? '/person' : '/人起'}`;
      sub = `${curr} ${origFormatted}/person`;
    } else {
      text = `≈¥${cnyFormatted}${en ? '/group' : '/团'}${itinerary.priceGroupSize ? ` (${itinerary.priceGroupSize}${en ? 'pax' : '人'})` : ''}`;
      sub = `${curr} ${origFormatted}`;
    }
  }

  return { text, sub, discount };
}

// Make helper available in templates — accepts optional lang param
app.locals.formatPrice = formatPrice;

// Load itineraries data
const itinerariesPath = path.join(__dirname, 'data', 'itineraries.json');
let itineraries = [];
try {
  itineraries = JSON.parse(fs.readFileSync(itinerariesPath, 'utf-8'));
} catch (err) {
  console.error('Failed to load itineraries:', err.message);
}

// API endpoint for search
app.get('/api/itineraries', (req, res) => {
  const query = (req.query.q || '').toLowerCase().trim();
  
  if (!query) {
    return res.json(itineraries);
  }
  
  const filtered = itineraries.filter(item => {
    const titleMatch = item.title.toLowerCase().includes(query);
    const tagMatch = (item.tags || []).some(t => t.toLowerCase().includes(query));
    const regionMatch = (item.regions || []).some(r => r.toLowerCase().includes(query));
    const subtitleMatch = (item.subtitle || '').toLowerCase().includes(query);
    return titleMatch || tagMatch || regionMatch || subtitleMatch;
  });
  
  res.json(filtered);
});

// Sitemap
app.get('/sitemap.xml', (req, res) => {
  const baseUrl = 'https://itinerary.wildroadgroup.com';
  const pages = [
    { loc: `${baseUrl}/`, priority: '1.0', changefreq: 'weekly' },
    { loc: `${baseUrl}/?lang=en`, priority: '0.9', changefreq: 'weekly' },
  ];
  itineraries.forEach(item => {
    pages.push({ loc: `${baseUrl}/${item.id}`, priority: '0.8', changefreq: 'monthly' });
    pages.push({ loc: `${baseUrl}/${item.id}?lang=en`, priority: '0.7', changefreq: 'monthly' });
  });
  // Add destinations
  const countries = getCountries();
  pages.push({ loc: `${baseUrl}/destinations`, priority: '0.9', changefreq: 'monthly' });
  pages.push({ loc: `${baseUrl}/destinations?lang=en`, priority: '0.8', changefreq: 'monthly' });
  countries.forEach(c => {
    pages.push({ loc: `${baseUrl}/destinations/${c.slug}`, priority: '0.8', changefreq: 'monthly' });
    pages.push({ loc: `${baseUrl}/destinations/${c.slug}?lang=en`, priority: '0.7', changefreq: 'monthly' });
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${pages.map(p => `  <url>
    <loc>${p.loc}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
  res.type('application/xml').send(xml);
});

// Load destinations data
const destinationsPath = path.join(__dirname, 'data', 'destinations.json');
let destinationsData = {};
try {
  destinationsData = JSON.parse(fs.readFileSync(destinationsPath, 'utf-8'));
} catch (err) {
  console.error('Failed to load destinations:', err.message);
}

// Extract unique countries from itineraries
function getCountries() {
  const countryMap = {
    switzerland: { zh: '瑞士', en: 'Switzerland', flag: '🇨🇭' },
    tanzania: { zh: '坦桑尼亚', en: 'Tanzania', flag: '🇹🇿' },
    italy: { zh: '意大利', en: 'Italy', flag: '🇮🇹' },
    uk: { zh: '英国', en: 'United Kingdom', flag: '🇬🇧' },
    france: { zh: '法国', en: 'France', flag: '🇫🇷' },
    indonesia: { zh: '印度尼西亚', en: 'Indonesia', flag: '🇮🇩' },
    thailand: { zh: '泰国', en: 'Thailand', flag: '🇹🇭' },
  };
  const found = {};
  itineraries.forEach(item => {
    (item.regions || []).forEach(r => {
      const slug = r.toLowerCase().replace(/\s+/g, '-');
      if (countryMap[slug] && !found[slug]) {
        found[slug] = {
          slug: slug,
          name_zh: countryMap[slug].zh,
          name_en: countryMap[slug].en,
          flag: countryMap[slug].flag,
          count: itineraries.filter(i => (i.regions || []).some(ir => ir.toLowerCase().replace(/\s+/g, '-') === slug)).length
        };
      }
    });
  });
  // Add countries from destinations.json even if no trips yet
  Object.keys(destinationsData).forEach(slug => {
    if (!found[slug] && countryMap[slug]) {
      found[slug] = { slug, name_zh: countryMap[slug].zh, name_en: countryMap[slug].en, flag: countryMap[slug].flag, count: 0 };
    }
  });
  return Object.values(found).sort((a,b) => b.count - a.count);
}

// Destinations listing
app.get('/destinations', (req, res) => {
  const lang = req.query.lang === 'en' ? 'en' : 'zh';
  const countries = getCountries();
  res.render('destinations', { countries, lang, title: lang === 'en' ? 'Destinations | WR Travel' : '探索目的地 | 野路逸行' });
});

// Destination detail
app.get('/destinations/:country', (req, res) => {
  const country = req.params.country.toLowerCase().replace(/\s+/g, '-');
  const lang = req.query.lang === 'en' ? 'en' : 'zh';
  const destDesc = destinationsData[country];
  if (!destDesc) return res.status(404).send('Not found');

  const countryTrips = itineraries.filter(item =>
    (item.regions || []).some(r => r.toLowerCase().replace(/\s+/g, '-') === country)
  );
  const countries = getCountries();
  const dest = countries.find(c => c.slug === country);
  const destination = {
    slug: country,
    name_zh: dest ? dest.name_zh : country,
    name_en: dest ? dest.name_en : country,
    description_zh: destDesc.zh,
    description_en: destDesc.en,
  };

  res.render('destination-detail', {
    destination, trips: countryTrips, lang,
    title: (lang === 'en' ? destination.name_en : destination.name_zh) + ' | WR Travel'
  });
});

// Themes listing
app.get('/themes', (req, res) => {
  const lang = req.query.lang === 'en' ? 'en' : 'zh';
  const themeMap = {
    'luxury': { zh: '奢华旅行', en: 'Luxury Travel', icon: '💎' },
    'safari': { zh: 'Safari 探险', en: 'Safari Adventure', icon: '🦁' },
    'cultural': { zh: '人文探索', en: 'Cultural', icon: '🏛️' },
    'adventure': { zh: '户外冒险', en: 'Adventure', icon: '🏔️' },
    'island': { zh: '海岛度假', en: 'Island Getaway', icon: '🏝️' },
    'city': { zh: '城市观光', en: 'City Tour', icon: '🏙️' },
  };
  const themes = Object.entries(themeMap).map(([slug, info]) => {
    const trips = itineraries.filter(t =>
      (t.tags || []).some(tag => tag.toLowerCase().includes(slug)) ||
      (t.tags_en || []).some(tag => tag.toLowerCase().includes(slug))
    );
    return { slug, ...info, count: trips.length };
  }).filter(t => t.count > 0);
  res.render('themes', { themes, lang, title: lang === 'en' ? 'Travel Themes | WR Travel' : '旅行主题 | 野路逸行' });
});

// Theme detail
app.get('/themes/:theme', (req, res) => {
  const theme = req.params.theme;
  const lang = req.query.lang === 'en' ? 'en' : 'zh';
  const themeMap = {
    'luxury': { zh: '奢华旅行', en: 'Luxury Travel' },
    'safari': { zh: 'Safari 探险', en: 'Safari Adventure' },
    'cultural': { zh: '人文探索', en: 'Cultural' },
    'adventure': { zh: '户外冒险', en: 'Adventure' },
    'island': { zh: '海岛度假', en: 'Island Getaway' },
    'city': { zh: '城市观光', en: 'City Tour' },
  };
  const info = themeMap[theme];
  if (!info) return res.status(404).send('Not found');
  const trips = itineraries.filter(t =>
    (t.tags || []).some(tag => tag.toLowerCase().includes(theme)) ||
    (t.tags_en || []).some(tag => tag.toLowerCase().includes(theme))
  );
  if (!trips.length) return res.status(404).send('No trips found');
  res.render('theme-detail', { theme, info, trips, lang, title: (lang === 'en' ? info.en : info.zh) + ' | WR Travel' });
});

// Homepage route

app.get('/', (req, res) => {
  const lang = req.query.lang === 'en' ? 'en' : 'zh';
  res.render('index', {
    itineraries: itineraries,
    title: lang === 'en' ? 'WR Travel · Itineraries' : 'WR Travel · 行程手册',
    lang: lang
  });
});

// Individual itinerary page
app.get('/:id', (req, res) => {
  const id = req.params.id;
  const lang = req.query.lang === 'en' ? 'en' : 'zh';

  // Skip requests for static assets and API
  if (id.startsWith('api/') || id.includes('.')) {
    return res.status(404).send('Not found');
  }

  const itinerary = itineraries.find(item => item.id === id);

  if (!itinerary) {
    return res.status(404).render('itinerary', {
      itinerary: null,
      brochureHtml: null,
      title: lang === 'en' ? 'Not Found - WR Travel' : '未找到 - WR Travel',
      lang: lang,
      itineraries: itineraries
    });
  }
  
  // Try to read the brochure HTML file
  const brochurePath = path.join(__dirname, 'public', itinerary.brochurePath);
  let brochureHtml = null;
  try {
    brochureHtml = fs.readFileSync(brochurePath, 'utf-8');
  } catch (err) {
    console.error(`Failed to read brochure ${brochurePath}:`, err.message);
  }

  let brochureContent = null;
  if (brochureHtml) {
    brochureContent = extractBrochureContent(brochureHtml);
  }

  res.render('itinerary', {
    itinerary: itinerary,
    brochureContent: brochureContent,
    title: itinerary.title + ' - WR Travel',
    lang: lang,
    itineraries: itineraries
  });
});

app.listen(PORT, () => {
  console.log(`WR Travel itinerary site running at http://localhost:${PORT}`);
});
