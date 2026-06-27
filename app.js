const express = require('express');
const path = require('path');
const fs = require('fs');
const { marked } = require('marked');
const schemas = require('./lib/schemas');

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
  // Modes (IA v2)
  pages.push({ loc: `${baseUrl}/modes`, priority: '0.8', changefreq: 'monthly' });
  pages.push({ loc: `${baseUrl}/modes?lang=en`, priority: '0.7', changefreq: 'monthly' });
  Object.entries(modeMap).forEach(([slug, info]) => {
    if (info.external) return; // private-villa → external
    pages.push({ loc: `${baseUrl}/modes/${slug}`, priority: '0.7', changefreq: 'monthly' });
    pages.push({ loc: `${baseUrl}/modes/${slug}?lang=en`, priority: '0.6', changefreq: 'monthly' });
  });
  // Journal (IA v2)
  pages.push({ loc: `${baseUrl}/journal`, priority: '0.8', changefreq: 'monthly' });
  pages.push({ loc: `${baseUrl}/journal?lang=en`, priority: '0.7', changefreq: 'monthly' });
  guidesData.forEach(g => {
    pages.push({ loc: `${baseUrl}/journal/${g.slug}`, priority: '0.7', changefreq: 'monthly' });
    pages.push({ loc: `${baseUrl}/journal/${g.slug}?lang=en`, priority: '0.6', changefreq: 'monthly' });
  });
  // Brands (IA v2)
  pages.push({ loc: `${baseUrl}/brands`, priority: '0.8', changefreq: 'monthly' });
  pages.push({ loc: `${baseUrl}/brands?lang=en`, priority: '0.7', changefreq: 'monthly' });
  brandsData.filter(b => !b.external).forEach(b => {
    pages.push({ loc: `${baseUrl}/brands/${b.slug}`, priority: '0.6', changefreq: 'monthly' });
    pages.push({ loc: `${baseUrl}/brands/${b.slug}?lang=en`, priority: '0.5', changefreq: 'monthly' });
  });
  // Brand-routes (IA v2 — /routes/<slug>)
  Object.values(routesIndex).forEach(r => {
    pages.push({ loc: `${baseUrl}/routes/${r.slug}`, priority: '0.7', changefreq: 'monthly' });
    pages.push({ loc: `${baseUrl}/routes/${r.slug}?lang=en`, priority: '0.6', changefreq: 'monthly' });
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

// Load guides data
const guidesPath = path.join(__dirname, 'data', 'guides.json');
let guidesData = [];
try {
  guidesData = JSON.parse(fs.readFileSync(guidesPath, 'utf-8'));
} catch (err) {
  console.error('Failed to load guides:', err.message);
}

// Load brands data
const brandsPath = path.join(__dirname, 'data', 'brands.json');
let brandsData = [];
try {
  brandsData = JSON.parse(fs.readFileSync(brandsPath, 'utf-8'));
} catch (err) {
  console.error('Failed to load brands:', err.message);
}

// Load brand-routes data (per-brand curated routes)
const brandRoutes = {}; // { brandSlug: [routeObj, ...] }
const routesIndex = {}; // { routeSlug: { ...route, brand: brandSlug } }
try {
  const brandRoutesDir = path.join(__dirname, 'data', 'brand-routes');
  if (fs.existsSync(brandRoutesDir)) {
    fs.readdirSync(brandRoutesDir).forEach(brandSlug => {
      const dir = path.join(brandRoutesDir, brandSlug);
      if (!fs.statSync(dir).isDirectory()) return;
      brandRoutes[brandSlug] = [];
      fs.readdirSync(dir).filter(f => f.endsWith('.json')).forEach(f => {
        const obj = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
        obj.slug = obj.slug || path.basename(f, '.json');
        obj.brand = brandSlug;
        // Normalize hero_path → /images/brands/<brand>/<slug>-hero.jpg
        obj.hero_path = `/images/brands/${brandSlug}/${obj.slug}-hero.jpg`;
        brandRoutes[brandSlug].push(obj);
        routesIndex[obj.slug] = obj;
      });
    });
  }
} catch (err) {
  console.error('Failed to load brand-routes:', err.message);
}

// Mode definitions (IA v2 — replaces /themes)
const modeMap = {
  'slow-stay': {
    zh: '慢游慢栖', en: 'Slow Stay', icon: '🛏️', themeTag: null,
    body_zh: '慢游慢栖（Slow Stay）是 WR Journeys 的核心叙事。我们不做"5 国 10 天打卡之旅"，每条线路都在同一个目的地停足够久 — 三晚是底线，五至七晚是常态。住得久，才能在清晨听到当地的人声鼓声、在午后避开导览队伍、在夜里和酒店主理人喝一杯。\n\n我们筛选的住宿都是单家精品酒店或山居 boutique — 匠庐、松赞、Aman、Como、Six Senses。从云贵高原到香格里拉、从托斯卡纳到马尔代夫，每一处都建议你停下来，把"地方"当作"人"对待。',
    body_en: 'Slow Stay is WR Journeys\' core narrative. We don\'t build "five-country, ten-day box-ticking" itineraries — every route lingers long enough at each destination: three nights minimum, five to seven the norm. Only when you stay this long do you start to hear the local rhythm at dawn, slip past tour groups in the afternoon, share a drink with the owner at night.\n\nOur selected lodging is single-house boutique only — Jianglu, Songtsam, Aman, Como, Six Senses. Across the Yunnan-Guizhou plateau, Shangri-la, Tuscany, the Maldives — we suggest you stop, and treat the place as a person.',
  },
  'cruise': {
    zh: '邮轮慢游', en: 'Cruise', icon: '🛳️', themeTag: null,
    body_zh: '邮轮慢游用另一种方式实现 slow stay — 你睡觉时船在移动，醒来在新的港口，住宿和位移合二为一。WR Journeys 主推 Explora Journeys 与 Silversea 等慢奢系列。\n\nExplora 是 MSC 集团的高端线，地中海与北欧线路为主，餐饮与水疗投入对标顶级度假村，没有传统邮轮的赌场和大型剧场。我们正在接入 Explora 2026 春夏季航线，欢迎留下联系方式让顾问回复。',
    body_en: 'Cruise is another expression of slow stay — the ship moves while you sleep, you wake in a new port, accommodation and movement become one. WR Journeys recommends slow-luxury lines: Explora Journeys, Silversea and similar.\n\nExplora is MSC group\'s premium brand, focused on Mediterranean and Northern Europe routes, with dining and spa investment on par with top resorts and none of the traditional casino-and-mega-theater clutter. We\'re onboarding 2026 spring/summer Explora routes — leave your contact and our advisor will follow up.',
  },
  'safari':        { zh: 'Safari 探险', en: 'Safari Adventure', icon: '🦁', themeTag: 'safari' },
  'heritage':      { zh: '人文遗产', en: 'Heritage & Culture', icon: '🏛️', themeTag: 'cultural' },
  'private-villa': { zh: '私人别墅', en: 'Private Villa', icon: '🏝️', themeTag: null,
    external: 'https://ai-test.wildroadgroup.com/villas' },
  'adventure':     { zh: '户外冒险', en: 'Adventure', icon: '🏔️', themeTag: 'adventure' },
  'island':        { zh: '海岛度假', en: 'Island Getaway', icon: '🏝️', themeTag: 'island' },
};
// Old /themes/:slug → new /modes/:slug
const themeToMode = {
  luxury:    'slow-stay',
  safari:    'safari',
  cultural:  'heritage',
  adventure: 'adventure',
  island:    'island',
  city:      'heritage',
};

// Type label map
const guideTypeLabels = {
  seasonal: { zh: '季节指南', en: 'Seasonal Guide' },
  budget: { zh: '预算指南', en: 'Budget Guide' },
  wildlife: { zh: '野生动物', en: 'Wildlife Guide' },
  beach: { zh: '海滩度假', en: 'Beach Guide' },
  destination: { zh: '目的地指南', en: 'Destination Guide' },
  luxury: { zh: '奢华旅行', en: 'Luxury Guide' },
  romance: { zh: '浪漫之旅', en: 'Romance Guide' },
  culture: { zh: '文化艺术', en: 'Culture Guide' },
  wellness: { zh: '康养度假', en: 'Wellness Guide' },
  adventure: { zh: '户外冒险', en: 'Adventure Guide' },
  food: { zh: '美食指南', en: 'Food Guide' },
  tips: { zh: '实用攻略', en: 'Practical Tips' },
  honeymoon: { zh: '蜜月指南', en: 'Honeymoon Guide' },
  family: { zh: '亲子旅行', en: 'Family Travel' },
  shopping: { zh: '购物指南', en: 'Shopping Guide' },
  fashion: { zh: '时装周', en: 'Fashion Week' }
};

// Generate content HTML based on guide type
function generateGuideContent(guide, destInfo, lang) {
  const isEn = lang === 'en';
  const destName = isEn ? (destInfo.en || guide.destination).split('.')[0] : (destInfo.zh || guide.destination).split('。')[0];
  const sections = [];

  switch (guide.type) {
    case 'seasonal':
      sections.push({ h2: isEn ? 'Spring (March – May)' : '春季（3月 – 5月）', p: isEn
        ? 'Spring brings wildflowers to Alpine meadows and comfortable temperatures around 10-18°C. It\'s an ideal time for city sightseeing with fewer crowds. Lake boats and scenic trains begin their summer schedules. Hotel rates are lower than peak season, making it excellent value for luxury travelers.'
        : '春季阿尔卑斯山野花盛开，气温约 10-18°C，适合城市观光，游客较少。湖上游船和观景列车陆续恢复运营。酒店价格低于旺季，是奢华旅行者的性价比之选。' });
      sections.push({ h2: isEn ? 'Summer (June – August)' : '夏季（6月 – 8月）', p: isEn
        ? 'Peak season with warm temperatures 18-28°C. Perfect for hiking, lake swimming, and outdoor dining. The Jungfrau region, Lucerne, and Interlaken are at their best. Book premium hotels and scenic train seats well in advance — this is when Switzerland truly shines.'
        : '夏季气温 18-28°C，是徒步、湖中游泳和户外用餐的最佳时节。少女峰地区、卢塞恩和因特拉肯最为迷人。建议提前预订高端酒店和观景列车座位。' });
      sections.push({ h2: isEn ? 'Autumn (September – November)' : '秋季（9月 – 11月）', p: isEn
        ? 'Golden foliage transforms the landscape. Temperatures cool to 8-15°C, ideal for wine harvest festivals and scenic train rides. Fewer tourists mean more exclusive experiences at top restaurants and hotels. The grape harvest season in Lavaux is particularly magical.'
        : '金黄色的秋叶装点大地，气温降至 8-15°C，适合葡萄酒丰收节和观景列车之旅。游客减少，顶级餐厅和酒店的体验更加私密。拉沃葡萄园梯田的丰收季尤为迷人。' });
      sections.push({ h2: isEn ? 'Winter (December – February)' : '冬季（12月 – 2月）', p: isEn
        ? 'A winter wonderland for skiing, snowboarding, and Christmas markets. Zermatt, St. Moritz, and Verbier offer world-class slopes. Don\'t miss the Glacier Express in snow. Après-ski culture, fondue dinners, and spa days make Swiss winters unforgettable.'
        : '滑雪、单板滑雪和圣诞市集的冬季仙境。采尔马特、圣莫里茨和韦尔比耶拥有世界级雪道。雪中冰川快车不容错过。滑雪后的社交文化、奶酪火锅晚餐和水疗体验让瑞士冬日难忘。' });
      break;

    case 'budget':
      sections.push({ h2: isEn ? 'Accommodation' : '住宿', p: isEn
        ? 'Switzerland offers luxury without breaking the bank. Stay at five-star properties like The Dolder Grand or Badrutt\'s Palace during shoulder season (April-May, September-October) for 30-40% less than peak rates. Consider lakefront boutique hotels in smaller towns like Montreux or Thun for exceptional value.'
        : '瑞士可以享受奢华而不破费。在淡季（4-5月、9-10月）入住 The Dolder Grand 或 Badrutt\'s Palace 等五星级酒店，价格比旺季低 30-40%。蒙特勒或图恩等小城的湖畔精品酒店性价比极高。' });
      sections.push({ h2: isEn ? 'Transportation' : '交通', p: isEn
        ? 'The Swiss Travel Pass is the best investment — unlimited travel on trains, buses, and boats plus free museum entries. First-class passes cost more but include panoramic window seats on scenic routes. The Glacier Express and Bernina Express are must-do experiences.'
        : '瑞士旅行通票是最划算的投资——无限次乘坐火车、巴士和游船，还免费参观博物馆。一等座通票价格更高但包含观景路线的景观座。冰川快车和伯尔尼纳快车是必体验项目。' });
      sections.push({ h2: isEn ? 'Dining' : '餐饮', p: isEn
        ? 'Michelin-starred restaurants in Switzerland are surprisingly accessible. Lunch menus at top restaurants often cost half the dinner price. For authentic experiences, try local Fondue Stubes and raclette rooms. Supermarkets like Coop and Migros offer excellent ready-made gourmet options for picnics.'
        : '瑞士的米其林餐厅出人意料地平易近人。顶级餐厅的午餐套餐通常只有晚餐价格的一半。想体验地道美食，可以尝试当地的奶酪火锅餐厅和拉可雷特餐厅。Coop 和 Migros 超市提供出色的即食美食适合野餐。' });
      sections.push({ h2: isEn ? 'Estimated Daily Budget' : '每日预算参考', table: isEn ? [
        ['Item', 'Budget', 'Premium', 'Luxury'],
        ['Hotel', 'CHF 150-250', 'CHF 350-600', 'CHF 800+'],
        ['Meals', 'CHF 50-80', 'CHF 100-200', 'CHF 250+'],
        ['Transport', 'CHF 30-50', 'CHF 80-150', 'CHF 200+'],
        ['Activities', 'CHF 30-60', 'CHF 80-150', 'CHF 200+'],
        ['Total / Day', 'CHF 260-440', 'CHF 610-1100', 'CHF 1450+']
      ] : [
        ['项目', '经济', '高端', '奢华'],
        ['住宿', 'CHF 150-250', 'CHF 350-600', 'CHF 800+'],
        ['餐饮', 'CHF 50-80', 'CHF 100-200', 'CHF 250+'],
        ['交通', 'CHF 30-50', 'CHF 80-150', 'CHF 200+'],
        ['活动', 'CHF 30-60', 'CHF 80-150', 'CHF 200+'],
        ['每天合计', 'CHF 260-440', 'CHF 610-1100', 'CHF 1450+']
      ] });
      break;

    case 'wildlife':
      sections.push({ h2: isEn ? 'The Great Migration' : '角马大迁徙', p: isEn
        ? 'Each year, over 1.5 million wildebeest, 200,000 zebras, and 350,000 gazelles make a circular trek between the Serengeti and Kenya\'s Masai Mara. This is the largest overland migration on Earth — a raw, primal spectacle that defies description.'
        : '每年超过 150 万头角马、20 万匹斑马和 35 万只瞪羚在塞伦盖蒂和肯尼亚马赛马拉之间进行环形迁徙。这是地球上最大规模的陆地动物迁徙——一场原始而震撼的奇观。' });
      sections.push({ h2: isEn ? 'Best Time to Witness' : '最佳观赏时间', ul: isEn
        ? ['January-March: Calving season in Southern Serengeti — thousands of births daily', 'April-May: Herds move north through Central Serengeti', 'June-July: Western Corridor — dramatic Grumeti River crossings', 'August-October: Northern Serengeti — Mara River crossings (peak drama)', 'November-December: Herds return south through Eastern Serengeti']
        : ['1月-3月：南部塞伦盖蒂产仔季——每天数千头幼崽诞生', '4月-5月：兽群穿越中部塞伦盖蒂向北移动', '6月-7月：西部走廊——壮观的格鲁美地河过河', '8月-10月：北部塞伦盖蒂——马拉河过河（高潮场景）', '11月-12月：兽群经东部塞伦盖蒂返回南方'] });
      sections.push({ h2: isEn ? 'Other Wildlife Highlights' : '其他野生动物亮点', p: isEn
        ? 'The Big Five — lion, leopard, elephant, rhino, and buffalo — are all found here. Cheetahs hunt on the open plains, hippos crowd the rivers, and over 500 bird species have been recorded. Night drives reveal aardvarks, bush babies, and nocturnal predators.'
        : '非洲五大——狮子、豹子、大象、犀牛和水牛——全部在此栖息。猎豹在开阔平原上捕猎，河马挤满河流，已记录超过 500 种鸟类。夜间驱车可发现土豚、婴猴和夜行性掠食者。' });
      break;

    case 'beach':
      sections.push({ h2: isEn ? 'Top Beaches' : '最佳海滩', p: isEn
        ? 'From pristine white-sand beaches to crystal-clear turquoise waters, discover the finest coastal destinations. Whether you prefer secluded coves or vibrant beach clubs, there\'s a perfect stretch of sand waiting for you.'
        : '从原始白沙滩到清澈碧绿的海水，探索最迷人的海岸目的地。无论您偏爱隐秘海湾还是热闹的海滩俱乐部，都有一片完美的沙滩在等您。' });
      sections.push({ h2: isEn ? 'Best Time to Visit' : '最佳旅行时间', p: isEn
        ? 'Dry season offers the best beach weather with calm waters ideal for swimming, snorkeling, and water sports. Avoid monsoon seasons when heavy rains and rough seas can limit beach activities.'
        : '旱季提供最佳海滩天气，风平浪静，适合游泳、浮潜和水上运动。避开季风季节，暴雨和大浪会限制海滩活动。' });
      sections.push({ h2: isEn ? 'Luxury Beach Stays' : '奢华海滨住宿', p: isEn
        ? 'Stay at world-class beachfront resorts with private pools, butler service, and overwater villas. Many properties offer direct beach access, sunset cocktails, and private dining on the sand.'
        : '入住世界级的海滨度假村，享受私人泳池、管家服务和海上别墅。许多酒店提供直达沙滩的通道、日落鸡尾酒和沙滩私人晚宴。' });
      break;

    case 'destination':
      sections.push({ h2: isEn ? 'Getting There & Around' : '交通指南', p: isEn
        ? 'Fly into the main international airport and take advantage of excellent public transportation. High-speed trains, regional buses, and private transfers connect all major attractions. Consider a rental car for countryside exploration.'
        : '飞抵主要国际机场后，可利用便捷的公共交通。高速列车、区域巴士和私人接送连接所有主要景点。乡村探索建议租车自驾。' });
      sections.push({ h2: isEn ? 'Must-See Attractions' : '必游景点', p: isEn
        ? 'From iconic landmarks to hidden gems, plan your itinerary around the top attractions. Leave time for spontaneous discoveries — some of the best travel moments happen unplanned.'
        : '从标志性景点到隐秘宝藏，围绕顶级景点规划行程。留出自由探索的时间——最美好的旅行时刻往往来自意外发现。' });
      sections.push({ h2: isEn ? 'Where to Stay' : '住宿推荐', p: isEn
        ? 'Choose from heritage luxury hotels, design-forward boutiques, or intimate guesthouses. Each offers a unique perspective on local culture and hospitality.'
        : '从传承奢华酒店、设计精品酒店到温馨民宿，每种选择都提供独特的当地文化和待客之道体验。' });
      break;

    case 'luxury':
      sections.push({ h2: isEn ? 'Top Luxury Hotels' : '顶级奢华酒店', p: isEn
        ? 'Experience world-class hospitality at the finest luxury properties. From historic grand dames to cutting-edge design hotels, these are the addresses that define luxury travel.'
        : '在最顶级的奢华酒店体验世界级的待客之道。从历史悠久的经典酒店到前沿设计酒店，这些地址定义了奢华旅行。' });
      sections.push({ h2: isEn ? 'Private Experiences' : '私享体验', p: isEn
        ? 'Go beyond the ordinary with exclusive private tours, after-hours museum visits, helicopter transfers, and personal shopping experiences. These are the moments that transform a trip into an unforgettable journey.'
        : '通过专属私人导览、闭馆后博物馆参观、直升机接送和个人购物体验，超越寻常旅行。这些时刻将旅程变为难忘的记忆。' });
      sections.push({ h2: isEn ? 'Fine Dining' : '精致餐饮', p: isEn
        ? 'Michelin-starred restaurants, chef\'s table experiences, and private dining rooms await. From traditional cuisine reimagined by celebrity chefs to avant-garde tasting menus, every meal becomes an event.'
        : '米其林星级餐厅、主厨餐桌体验和私人包间等您光临。从名厨重新演绎的传统菜肴到前卫品鉴菜单，每顿饭都成为一场盛事。' });
      break;

    case 'romance':
      sections.push({ h2: isEn ? 'Romantic Highlights' : '浪漫亮点', p: isEn
        ? 'From sunset Seine River cruises to candlelit dinners in hidden courtyards, every moment is designed for two. The city\'s timeless beauty creates the perfect backdrop for romance.'
        : '从塞纳河日落游船到隐秘庭院的烛光晚餐，每个瞬间都为两个人而设计。这座城市永恒的美丽创造了完美的浪漫背景。' });
      sections.push({ h2: isEn ? 'Couples Itinerary' : '情侣行程推荐', ul: isEn
        ? ['Morning: Private walking tour of Montmartre with a local art historian', 'Afternoon: Exclusive perfume-making workshop in a historic atelier', 'Evening: Michelin-starred dinner with Eiffel Tower views', 'Night: Moonlight stroll along the Pont des Arts']
        : ['上午：与当地艺术史学家同游蒙马特私人步行导览', '下午：在历史工坊参加专属香水制作体验', '傍晚：在埃菲尔铁塔景观米其林餐厅享用晚餐', '夜晚：艺术桥上的月光漫步'] });
      sections.push({ h2: isEn ? 'Luxury Stays for Two' : '双人奢华住宿', p: isEn
        ? 'Book a suite with views of iconic landmarks. Many luxury hotels offer romance packages including champagne, flowers, and spa treatments for couples.'
        : '预订一间地标景观套房。许多奢华酒店提供浪漫套餐，包含香槟、鲜花和双人水疗护理。' });
      break;

    case 'culture':
      sections.push({ h2: isEn ? 'Museums & Galleries' : '博物馆与画廊', p: isEn
        ? 'Home to some of the world\'s greatest art collections and museums. From classical masterpieces to contemporary installations, the cultural scene is unmatched. Many museums offer private guided tours and after-hours access.'
        : '拥有世界上最伟大的艺术收藏和博物馆。从古典杰作到当代装置艺术，文化场景无与伦比。许多博物馆提供私人导览和闭馆后参观。' });
      sections.push({ h2: isEn ? 'Architecture & Heritage' : '建筑与遗产', p: isEn
        ? 'Centuries of architectural evolution are on display — Gothic cathedrals, Renaissance palaces, Art Nouveau townhouses, and contemporary landmarks. Walking through the city is like browsing an open-air architecture museum.'
        : '数个世纪的建筑演变尽收眼底——哥特大教堂、文艺复兴宫殿、新艺术运动联排别墅和当代地标。漫步城市犹如浏览一座露天建筑博物馆。' });
      sections.push({ h2: isEn ? 'Cultural Experiences' : '文化体验', ul: isEn
        ? ['Private guided tours of world-famous art collections', 'Behind-the-scenes visits to artist studios and workshops', 'Opera, ballet, and classical music performances', 'Cultural walking tours with local historians']
        : ['世界知名艺术收藏的私人导览', '艺术家工作室和工作坊的幕后探访', '歌剧、芭蕾和古典音乐演出', '与当地历史学家同行的文化步行之旅'] });
      break;

    case 'wellness':
      sections.push({ h2: isEn ? 'Wellness Retreats' : '康养度假村', p: isEn
        ? 'Bali is a global wellness destination offering world-class spa treatments, yoga retreats, and holistic healing programs. From clifftop meditation centers to jungle spa sanctuaries, every aspect of wellbeing is covered.'
        : '巴厘岛是全球康养目的地，提供世界级水疗护理、瑜伽静修和整体疗愈项目。从悬崖冥想中心到丛林水疗圣殿，涵盖身心健康各个方面。' });
      sections.push({ h2: isEn ? 'Spa & Healing' : '水疗与疗愈', ul: isEn
        ? ['Traditional Balinese massage using local herbs and flowers', 'Sound healing and meditation in sacred temples', 'Detox and nutrition programs at luxury wellness resorts', 'Yoga and breathwork sessions overlooking rice terraces']
        : ['使用当地草本和花卉的传统巴厘岛按摩', '神圣寺庙中的音疗和冥想', '奢华康养度假村的排毒和营养项目', '俯瞰梯田的瑜伽和呼吸练习'] });
      sections.push({ h2: isEn ? 'Best Wellness Season' : '最佳康养季节', p: isEn
        ? 'Dry season (April-October) offers the best conditions for outdoor wellness activities. The Ubud area, surrounded by rice paddies and sacred rivers, is the spiritual heart of Bali\'s wellness scene.'
        : '旱季（4-10月）提供户外康养活动的最佳条件。被稻田和圣河环绕的乌布地区是巴厘岛康养文化的精神核心。' });
      break;

    case 'adventure':
      sections.push({ h2: isEn ? 'Adventure Activities' : '冒险活动', p: isEn
        ? 'From world-class hiking trails to adrenaline-pumping water sports, this destination offers adventure at every turn. Professional guides and premium equipment ensure safety without sacrificing thrills.'
        : '从世界级的徒步路线到令人心跳加速的水上运动，这个目的地处处充满冒险。专业向导和顶级装备确保安全与刺激并存。' });
      sections.push({ h2: isEn ? 'Recommended Routes & Trails' : '推荐路线', ul: isEn
        ? ['Scenic hiking trails with breathtaking panoramic views', 'White-water rafting through tropical gorges', 'Mountain biking on rugged terrain with expert guides', 'Zip-line and canopy tours through ancient forests']
        : ['拥有壮丽全景的风景徒步路线', '穿越热带峡谷的白水漂流', '专家向导带领的越野山地自行车', '穿越原始森林的索道和树冠之旅'] });
      sections.push({ h2: isEn ? 'What to Pack' : '装备建议', p: isEn
        ? 'Sturdy hiking boots, moisture-wicking clothing, sun protection, and a quality daypack are essentials. Most adventure operators provide specialized equipment, but bringing your own ensures the best fit.'
        : '坚固的徒步鞋、速干衣物、防晒用品和优质日行背包是必备品。大多数冒险运营商提供专业装备，但自带装备确保最佳适配。' });
      break;

    case 'food':
      sections.push({ h2: isEn ? 'Street Food Scene' : '街头美食', p: isEn
        ? 'The street food culture here is legendary — bustling night markets, roadside stalls, and hidden shophouse restaurants serve some of the most authentic flavors you\'ll find anywhere. Many street vendors have earned Michelin Bib Gourmand recognition.'
        : '这里的街头美食文化名扬天下——热闹的夜市、路边摊和隐秘的店屋餐厅提供最正宗的味道。许多街头小贩已获得米其林必比登推荐。' });
      sections.push({ h2: isEn ? 'Must-Try Dishes' : '必尝菜品', ul: isEn
        ? ['Signature street food specialties from legendary vendors', 'Regional dishes unique to this destination', 'Fusion cuisine blending tradition with modern techniques', 'Seasonal specialties and festival foods']
        : ['传奇摊位的招牌街头美食', '这个目的地独有的地方菜肴', '传统与现代技法融合的创新料理', '季节性特色美食和节庆食品'] });
      sections.push({ h2: isEn ? 'Michelin & Fine Dining' : '米其林与精致餐饮', p: isEn
        ? 'The fine dining scene rivals the world\'s best. Celebrity chef restaurants, innovative tasting menus, and restaurants pushing culinary boundaries. Book well in advance for the most sought-after tables.'
        : '精致餐饮场景媲美世界最佳。名厨餐厅、创新品鉴菜单和突破烹饪边界的餐厅。最受欢迎的餐桌需提前预订。' });
      break;

    case 'tips':
      sections.push({ h2: isEn ? 'Before You Go' : '出发前准备', p: isEn
        ? 'Check visa requirements, vaccination recommendations, and travel insurance options well in advance. Pack neutral-colored clothing for safari, a good camera with zoom lens, and binoculars.'
        : '提前确认签证要求、疫苗接种建议和旅行保险方案。准备中性色衣物（Safari 用）、优质长焦相机和双筒望远镜。' });
      sections.push({ h2: isEn ? 'On the Ground' : '实地攻略', ul: isEn
        ? ['Currency and payment methods — carry cash for remote areas', 'Local customs and etiquette to respect', 'Health and safety precautions', 'Communication — SIM cards and connectivity']
        : ['货币和支付方式——偏远地区请携带现金', '需尊重的当地习俗和礼仪', '健康和安全注意事项', '通讯——SIM 卡和网络连接'] });
      sections.push({ h2: isEn ? 'Insider Tips' : '内部提示', p: isEn
        ? 'The best safari experiences come from experienced guides who know animal behavior and migration patterns. Choose operators with excellent reviews and conservation credentials. Early morning and late afternoon game drives offer the best wildlife sightings.'
        : '最佳 Safari 体验来自了解动物行为和迁徙规律的资深向导。选择口碑优秀、具有环保资质的运营商。清晨和傍晚的驱车游猎最容易发现野生动物。' });
      break;

    default:
      sections.push({ h2: isEn ? 'Overview' : '概览', p: isEn
        ? `Discover everything you need to know for an unforgettable trip. This comprehensive guide covers the essentials for planning your journey.`
        : `探索让您的旅程难以忘怀所需的一切信息。这份综合指南涵盖了规划旅程的要点。` });
  }

  // Build HTML
  let html = '';
  sections.forEach(function(s) {
    if (s.h2) html += `<div class="gd-section"><h2>${s.h2}</h2>`;
    if (s.p) html += `<p>${s.p}</p>`;
    if (s.ul) {
      html += '<ul>';
      s.ul.forEach(function(li) { html += `<li>${li}</li>`; });
      html += '</ul>';
    }
    if (s.table) {
      html += '<table class="gd-budget-table">';
      s.table.forEach(function(row, i) {
        const tag = i === 0 ? 'th' : 'td';
        html += '<tr>' + row.map(function(cell) { return `<${tag}>${cell}</${tag}>`; }).join('') + '</tr>';
      });
      html += '</table>';
    }
    html += '</div>';
  });
  return html;
}

// Generate FAQ items for a guide
function generateFaqItems(guide, destInfo, lang) {
  const isEn = lang === 'en';
  switch (guide.type) {
    case 'seasonal':
      return [
        { q_zh: '瑞士旅行的最佳季节是什么？', a_zh: '取决于您的旅行目的：夏季（6-8月）适合徒步和户外活动，冬季（12-2月）适合滑雪，春秋两季性价比最高且游客较少。', q_en: 'When is the best time to visit Switzerland?', a_en: 'It depends on your purpose: summer (June-August) for hiking and outdoors, winter (December-February) for skiing, and shoulder seasons for better value with fewer crowds.' },
        { q_zh: '瑞士旅行需要多少预算？', a_zh: '每日预算从经济型 260-440 CHF 到奢华型 1450 CHF 以上不等。使用瑞士旅行通票可大幅节省交通费用。', q_en: 'How much budget do I need for Switzerland?', a_en: 'Daily budget ranges from CHF 260-440 for budget travelers to CHF 1,450+ for luxury. A Swiss Travel Pass significantly reduces transportation costs.' }
      ];
    case 'budget':
      return [
        { q_zh: '瑞士旅行通票值得买吗？', a_zh: '非常值得。瑞士旅行通票覆盖火车、巴士、游船和博物馆门票，3天通票约 232 CHF，单次冰川快车就值回票价。', q_en: 'Is the Swiss Travel Pass worth it?', a_en: 'Absolutely. It covers trains, buses, boats, and museum entries. A 3-day pass costs ~CHF 232 — a single Glacier Express ride nearly pays for it.' },
        { q_zh: '如何在瑞士省钱又不失奢华体验？', a_zh: '选择淡季入住五星酒店、午餐时段品尝米其林餐厅、使用旅行通票、参加免费的城市导览。', q_en: 'How to save money without losing the luxury experience?', a_en: 'Book five-star hotels in shoulder season, try Michelin restaurants at lunch, use the Travel Pass, and join free city walking tours.' }
      ];
    case 'wildlife':
      return [
        { q_zh: '角马大迁徙的最佳观赏月份？', a_zh: '6-7月格鲁美地河过河和 8-10月马拉河过河最为壮观。1-3月南部产仔季也非常震撼。', q_en: 'Best months to see the Great Migration?', a_en: 'June-July for Grumeti River crossings and August-October for the dramatic Mara River crossings. January-March calving season is also spectacular.' },
        { q_zh: 'Safari 需要提前多久预订？', a_zh: '建议至少提前 6-12 个月预订旺季（7-10月）的顶级营地，如 Singita 或 &Beyond。', q_en: 'How far in advance should I book a safari?', a_en: 'Book 6-12 months ahead for peak season (July-October) at top lodges like Singita or &Beyond.' }
      ];
    case 'beach':
      return [
        { q_zh: '海滩度假的最佳季节？', a_zh: '旱季海水清澈、风平浪静，最适合浮潜和水上活动。具体月份因目的地而异。', q_en: 'When is beach season?', a_en: 'Dry season offers the clearest water and calmest seas, ideal for snorkeling and water sports. Specific months vary by destination.' }
      ];
    case 'food':
      return [
        { q_zh: '街头食品安全吗？', a_zh: '选择人流量大的摊位、食物现做现卖的餐厅。避开生冷食物，随身携带肠胃药以防万一。', q_en: 'Is street food safe?', a_en: 'Choose busy stalls with high turnover and freshly cooked food. Avoid raw items and carry stomach medicine as a precaution.' },
        { q_zh: '需要给小费吗？', a_zh: '高端餐厅通常加收服务费，无需额外小费。街头小吃无需小费，但可四舍五入账单。', q_en: 'Should I tip?', a_en: 'Fine dining restaurants usually include service charge. No tipping needed at street food stalls, but rounding up the bill is appreciated.' }
      ];
    default:
      return [
        { q_zh: '最佳的旅行时间是什么时候？', a_zh: '建议在气候最适宜的旺季前往，以获得最佳体验。具体时间请参考我们的季节指南。', q_en: 'When is the best time to visit?', a_en: 'We recommend visiting during peak season for the best experience. See our seasonal guide for specific timing.' },
        { q_zh: '需要提前预订吗？', a_zh: '旺季建议提前 2-3 个月预订酒店和活动，尤其是高端和私密体验项目。', q_en: 'Should I book in advance?', a_en: 'Book hotels and activities 2-3 months ahead for peak season, especially for premium and private experiences.' }
      ];
  }
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
    maldives: { zh: '马尔代夫', en: 'Maldives', flag: '🇲🇻' },
    japan: { zh: '日本', en: 'Japan', flag: '🇯🇵' },
    dubai: { zh: '迪拜', en: 'Dubai', flag: '🇦🇪' },
    greece: { zh: '希腊', en: 'Greece', flag: '🇬🇷' },
    morocco: { zh: '摩洛哥', en: 'Morocco', flag: '🇲🇦' },
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
    coverImage: destDesc.coverImage || null,
    gallery: destDesc.gallery || [],
  };

  res.render('destination-detail', {
    destination, trips: countryTrips, lang,
    title: (lang === 'en' ? destination.name_en : destination.name_zh) + ' | WR Travel'
  });
});

// Journal listing (IA v2 canonical; /guides 301 → here)
app.get('/journal', (req, res) => {
  const lang = req.query.lang === 'en' ? 'en' : 'zh';
  const grouped = {};
  const destOrder = ['switzerland', 'tanzania', 'italy', 'uk', 'france', 'indonesia', 'thailand', 'maldives', 'japan', 'dubai', 'greece', 'morocco'];
  destOrder.forEach(d => { grouped[d] = []; });
  guidesData.forEach(g => {
    if (!grouped[g.destination]) grouped[g.destination] = [];
    grouped[g.destination].push(g);
  });
  Object.keys(grouped).forEach(k => { if (grouped[k].length === 0) delete grouped[k]; });
  res.render('journal', { grouped, destinations: destinationsData, lang });
});

// Journal detail
app.get('/journal/:slug', (req, res) => {
  const guide = guidesData.find(g => g.slug === req.params.slug);
  if (!guide) return res.status(404).render('404');
  const lang = req.query.lang === 'en' ? 'en' : 'zh';
  const destInfo = destinationsData[guide.destination] || {};
  const typeInfo = guideTypeLabels[guide.type] || { zh: guide.type, en: guide.type };
  const typeLabel = lang === 'en' ? typeInfo.en : typeInfo.zh;

  const relatedTrips = itineraries.filter(t =>
    (t.regions || []).some(r => r.toLowerCase().replace(/\s+/g, '-') === guide.destination)
  );

  const contentHtml = guide.content_zh || guide.content_en
    ? marked.parse(lang === 'en' ? (guide.content_en || guide.content_zh) : (guide.content_zh || guide.content_en))
    : generateGuideContent(guide, destInfo, lang);
  const faqItems = generateFaqItems(guide, destInfo, lang);

  res.render('journal-detail', {
    guide, destInfo, relatedTrips, lang, typeLabel, contentHtml, faqItems,
    destinations: destinationsData,
    baseUrl: 'https://itinerary.wildroadgroup.com',
    title: (lang === 'en' ? guide.title_en : guide.title_zh) + ' | WR Journeys'
  });
});

// 301: /guides → /journal
app.get('/guides', (req, res) => {
  res.redirect(301, '/journal' + (req.query.lang === 'en' ? '?lang=en' : ''));
});
app.get('/guides/:slug', (req, res) => {
  res.redirect(301, '/journal/' + req.params.slug + (req.query.lang === 'en' ? '?lang=en' : ''));
});

// Modes listing (IA v2 canonical; /themes 301 → here)
app.get('/modes', (req, res) => {
  const lang = req.query.lang === 'en' ? 'en' : 'zh';
  const themes = Object.entries(modeMap).map(([slug, info]) => {
    let count = 0;
    if (info.themeTag) {
      count = itineraries.filter(t =>
        (t.tags || []).some(tag => tag.toLowerCase().includes(info.themeTag)) ||
        (t.tags_en || []).some(tag => tag.toLowerCase().includes(info.themeTag))
      ).length;
    }
    return { slug, zh: info.zh, en: info.en, icon: info.icon, count };
  });
  res.render('modes', { themes, lang, title: lang === 'en' ? 'Travel Modes | WR Journeys' : '出行模式 | WR Journeys' });
});

// Mode detail
app.get('/modes/:theme', (req, res) => {
  const slug = req.params.theme;
  const lang = req.query.lang === 'en' ? 'en' : 'zh';
  const info = modeMap[slug];
  if (!info) return res.status(404).send('Not found');
  if (info.external) return res.redirect(302, info.external);
  let trips = [];
  if (info.themeTag) {
    trips = itineraries.filter(t =>
      (t.tags || []).some(tag => tag.toLowerCase().includes(info.themeTag)) ||
      (t.tags_en || []).some(tag => tag.toLowerCase().includes(info.themeTag))
    );
  }
  const body = lang === 'en' ? (info.body_en || '') : (info.body_zh || '');
  res.render('mode-detail', {
    theme: slug,
    info: { zh: info.zh, en: info.en },
    trips, lang, body,
    title: (lang === 'en' ? info.en : info.zh) + ' | WR Journeys'
  });
});

// 301: /themes → /modes
app.get('/themes', (req, res) => {
  res.redirect(301, '/modes' + (req.query.lang === 'en' ? '?lang=en' : ''));
});
app.get('/themes/:theme', (req, res) => {
  const newSlug = themeToMode[req.params.theme] || req.params.theme;
  res.redirect(301, '/modes/' + newSlug + (req.query.lang === 'en' ? '?lang=en' : ''));
});

// Brands listing (IA v2 — new)
app.get('/brands', (req, res) => {
  const lang = req.query.lang === 'en' ? 'en' : 'zh';
  const items = brandsData.map(b => ({
    name: lang === 'en' ? b.name_en : b.name_zh,
    url: b.external && b.external_url ? b.external_url : `/brands/${b.slug}`,
  }));
  res.render('brands', {
    brands: brandsData, lang,
    title: lang === 'en' ? 'Brand House | WR Journeys' : '品牌矩阵 | WR Journeys',
    schemas: [
      schemas.website(),
      schemas.travelAgency(),
      schemas.itemList(items, lang === 'en' ? 'WR Journeys Brand House' : 'WR Journeys 品牌矩阵'),
      schemas.breadcrumbList([
        { name: lang === 'en' ? 'Home' : '首页', path: '/' },
        { name: lang === 'en' ? 'Brands' : '品牌矩阵', path: '/brands' },
      ]),
    ],
  });
});

// Brand detail (with optional routes grid)
app.get('/brands/:slug', (req, res) => {
  const brand = brandsData.find(b => b.slug === req.params.slug);
  if (!brand) return res.status(404).send('Brand not found');
  const lang = req.query.lang === 'en' ? 'en' : 'zh';
  if (brand.external && brand.external_url) return res.redirect(302, brand.external_url);
  const routes = brandRoutes[brand.slug] || [];
  res.render('brand-detail', {
    brand, routes, lang,
    schemas: [
      schemas.brandOrganization(brand),
      schemas.breadcrumbList([
        { name: lang === 'en' ? 'Home' : '首页', path: '/' },
        { name: lang === 'en' ? 'Brands' : '品牌矩阵', path: '/brands' },
        { name: lang === 'en' ? brand.name_en : brand.name_zh, path: `/brands/${brand.slug}` },
      ]),
      ...(routes.length ? [schemas.itemList(
        routes.map(r => ({
          name: lang === 'en' ? r.title_en : r.title_zh,
          url: `/routes/${r.slug}`,
        })),
        lang === 'en' ? `${brand.name_en} curated routes` : `${brand.name_zh} 策展线路`
      )] : []),
    ],
  });
});

// Route detail (per-brand curated route, e.g. /routes/guizhou-liangdu-shishi)
app.get('/routes/:slug', (req, res) => {
  const route = routesIndex[req.params.slug];
  if (!route) return res.status(404).send('Route not found');
  const lang = req.query.lang === 'en' ? 'en' : 'zh';
  const brand = brandsData.find(b => b.slug === route.brand) || { slug: route.brand, name_zh: route.brand, name_en: route.brand };
  res.render('route-detail', {
    route, brand, lang,
    schemas: [
      schemas.touristTrip(route, brand, lang),
      schemas.breadcrumbList([
        { name: lang === 'en' ? 'Home' : '首页', path: '/' },
        { name: lang === 'en' ? brand.name_en : brand.name_zh, path: `/brands/${brand.slug}` },
        { name: lang === 'en' ? route.title_en : route.title_zh, path: `/routes/${route.slug}` },
      ]),
    ],
  });
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
  
  // Try to read the brochure HTML file — prefer locale-specific version if available
  const localizedBrochurePath = (lang === 'en' && itinerary.brochurePath_en)
    ? itinerary.brochurePath_en
    : itinerary.brochurePath;
  const brochurePath = path.join(__dirname, 'public', localizedBrochurePath);
  let brochureHtml = null;
  try {
    brochureHtml = fs.readFileSync(brochurePath, 'utf-8');
  } catch (err) {
    console.error(`Failed to read brochure ${brochurePath}:`, err.message);
    // Fallback to default brochure if locale-specific one is missing
    if (localizedBrochurePath !== itinerary.brochurePath) {
      try {
        brochureHtml = fs.readFileSync(path.join(__dirname, 'public', itinerary.brochurePath), 'utf-8');
      } catch (err2) {
        console.error(`Fallback brochure also failed:`, err2.message);
      }
    }
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
    itineraries: itineraries,
    destinations: destinationsData
  });
});

app.listen(PORT, () => {
  console.log(`WR Travel itinerary site running at http://localhost:${PORT}`);
});
