const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3099;

// Set EJS as view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

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

// Homepage route
app.get('/', (req, res) => {
  res.render('index', { 
    itineraries: itineraries,
    title: 'WR Travel · 行程手册'
  });
});

// Individual itinerary page
app.get('/:id', (req, res) => {
  const id = req.params.id;
  
  // Skip requests for static assets and API
  if (id.startsWith('api/') || id.includes('.')) {
    return res.status(404).send('Not found');
  }
  
  const itinerary = itineraries.find(item => item.id === id);
  
  if (!itinerary) {
    return res.status(404).render('itinerary', {
      itinerary: null,
      brochureHtml: null,
      title: '未找到 - WR Travel'
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
  
  res.render('itinerary', {
    itinerary: itinerary,
    brochureHtml: brochureHtml,
    title: itinerary.title + ' - WR Travel'
  });
});

app.listen(PORT, () => {
  console.log(`WR Travel itinerary site running at http://localhost:${PORT}`);
});
