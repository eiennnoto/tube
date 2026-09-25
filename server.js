import express from 'express';
import * as cheerio from 'cheerio';

const app = express();
const PORT = process.env.PORT || 8080;
const CLASSROOM_ORIGIN = 'https://classroom.google.com';
const cache = new Map();
const CACHE_MS = 30_000;

app.use(express.static('public', { extensions: ['html'] }));

function cleanId(value) {
  if (!value) return '';
  return String(value).trim().replace(/[^a-zA-Z0-9._~-]/g, '');
}

function classroomUrl(path) {
  return `${CLASSROOM_ORIGIN}${path}`;
}

async function fetchClassroom(path) {
  const now = Date.now();
  const cached = cache.get(path);
  if (cached && now - cached.time < CACHE_MS) return cached.response.clone();

  const response = await fetch(classroomUrl(path), {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.8,en;q=0.6'
    }
  });

  cache.set(path, { time: now, response: response.clone() });
  return response;
}

function firstText($, selectors) {
  for (const selector of selectors) {
    const text = $(selector).first().text().replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  return '';
}

function firstAttr($, selectors, attr) {
  for (const selector of selectors) {
    const value = $(selector).first().attr(attr);
    if (value) return value.trim();
  }
  return '';
}

function absoluteUrl(value, base = CLASSROOM_ORIGIN) {
  try {
    return new URL(value, base).href;
  } catch {
    return '';
  }
}

function extractIds(html) {
  const ids = new Set();
  const patterns = [
    /(?:https?:\/\/classroom\.google\.com)?\/u\/0\/n\/player\?v=([a-zA-Z0-9._~-]+)/g,
    /(?:^|[\"\'])\/player\?v=([a-zA-Z0-9._~-]+)/g,
    /(?:[?&])v=([a-zA-Z0-9._~-]+)/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const id = cleanId(match[1]);
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

function parseSearch(html, query) {
  const $ = cheerio.load(html);
  const results = [];
  const ids = extractIds(html);
  const seen = new Set();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/(?:^|\/)n\/player\?v=([a-zA-Z0-9._~-]+)/) || href.match(/[?&]v=([a-zA-Z0-9._~-]+)/);
    if (!match) return;

    const id = cleanId(match[1]);
    if (!id || seen.has(id)) return;
    seen.add(id);

    const title = ($(el).text() || '').replace(/\\s+/g, ' ').trim() || `動画 ${id}`;
    const thumb = absoluteUrl($(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src') || '');
    results.push({ id, title, description: '', thumbnail: thumb });
  });

  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    results.push({ id, title: `動画 ${id}`, description: '', thumbnail: '' });
  }

  return {
    query,
    source: classroomUrl(`/u/0/n/pck?q=${encodeURIComponent(query)}`),
    results: results.slice(0, 100)
  };
}

function parseMetadata(html, id) {
  const $ = cheerio.load(html);
  const title = firstAttr($, ['meta[property="og:title"]', 'meta[name="twitter:title"]'], 'content')
    || firstText($, ['title', 'h1'])
    || `動画 ${id}`;
  const description = firstAttr($, ['meta[property="og:description"]', 'meta[name="description"]', 'meta[name="twitter:description"]'], 'content') || '';
  const thumbnail = firstAttr($, ['meta[property="og:image"]', 'meta[name="twitter:image"]'], 'content');
  return {
    id,
    title,
    description,
    thumbnail: absoluteUrl(thumbnail),
    source: classroomUrl(`/u/0/n/pck?v=${encodeURIComponent(id)}`)
  };
}

app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: '検索文字列がありません。' });

  try {
    const path = `/u/0/n/pck?q=${encodeURIComponent(q)}`;
    const response = await fetchClassroom(path);
    const html = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Google Classroomから ${response.status} が返りました。`,
        status: response.status,
        source: classroomUrl(path)
      });
    }

    const data = parseSearch(html, q);
    res.json(data);
  } catch (error) {
    res.status(502).json({
      error: 'Google Classroomへの接続に失敗しました。',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/video/:id', async (req, res) => {
  const id = cleanId(req.params.id);
  if (!id) return res.status(400).json({ error: '動画IDがありません。' });

  try {
    const path = `/u/0/n/pck?v=${encodeURIComponent(id)}`;
    const response = await fetchClassroom(path);
    const html = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Google Classroomから ${response.status} が返りました。`,
        status: response.status,
        source: classroomUrl(path)
      });
    }

    res.json(parseMetadata(html, id));
  } catch (error) {
    res.status(502).json({
      error: '動画情報の取得に失敗しました。',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/player-url/:id', (req, res) => {
  const id = cleanId(req.params.id);
  if (!id) return res.status(400).json({ error: '動画IDがありません。' });
  res.json({ url: classroomUrl(`/u/0/n/player?v=${encodeURIComponent(id)}`) });
});

app.get('*splat', (req, res) => {
  res.sendFile(process.cwd() + '/public/index.html');
});

app.listen(PORT, () => {
  console.log(`ClassroomTube listening on port ${PORT}`);
});
