import express from "express";
import * as cheerio from "cheerio";

const app = express();
const PORT = Number(process.env.PORT) || 10000;
const HOST = "0.0.0.0";

const PCK_BASE = "https://classroom.google.com/u/0/n/pck";
const FETCH_TIMEOUT_MS = 15000;

app.disable("x-powered-by");
app.use(express.static("public"));

function idToUrl(id) {
  return `${PCK_BASE}?v=${encodeURIComponent(id)}`;
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml"
      }
    });

    const text = await response.text();

    if (!response.ok) {
      const error = new Error(`Upstream HTTP ${response.status}`);
      error.status = response.status;
      error.body = text.slice(0, 500);
      throw error;
    }

    return {
      html: text,
      finalUrl: response.url,
      status: response.status,
      contentType: response.headers.get("content-type") || ""
    };
  } finally {
    clearTimeout(timer);
  }
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlText(value) {
  return cleanText(
    cheerio.load("<div></div>")("div").text(String(value ?? ""))
  );
}

function extractVideoId(value) {
  try {
    const u = new URL(value, PCK_BASE);
    if (u.pathname !== "/u/0/n/pck") return null;
    const id = u.searchParams.get("v");
    return id ? id.trim() : null;
  } catch {
    return null;
  }
}

function addFound(found, id, title = "") {
  id = cleanText(id);
  if (!id || id.length > 300) return;

  title = cleanText(title) || `動画 ${id}`;

  if (!found.has(id)) {
    found.set(id, {
      id,
      title,
      url: idToUrl(id)
    });
  } else if (
    found.get(id).title.startsWith("動画 ") &&
    !title.startsWith("動画 ")
  ) {
    found.get(id).title = title;
  }
}

function extractSearchResults(html) {
  const $ = cheerio.load(html);
  const found = new Map();

  // 1) Normal links and common data-* attributes.
  $("a[href], [data-href], [data-url], [data-video-id], [data-id]").each((_, el) => {
    const $el = $(el);

    const candidates = [
      $el.attr("href"),
      $el.attr("data-href"),
      $el.attr("data-url"),
      $el.attr("data-video-id"),
      $el.attr("data-id")
    ].filter(Boolean);

    let id = null;

    for (const value of candidates) {
      const direct = extractVideoId(value);
      if (direct) {
        id = direct;
        break;
      }

      // Also accept bare values such as "?v=ABC".
      const m = String(value).match(/(?:[?&]v=)([^&#"'\\\s]+)/i);
      if (m) {
        id = decodeURIComponent(m[1]);
        break;
      }
    }

    if (!id) return;

    const text =
      cleanText($el.text()) ||
      cleanText($el.attr("aria-label")) ||
      cleanText($el.attr("title"));

    addFound(found, id, text);
  });

  // Decode common escaped representations used inside JSON/script state.
  const decoded = html
    .replace(/\\u003d/gi, "=")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003f/gi, "?")
    .replace(/\\u002F/gi, "/")
    .replace(/\\\\/g, "\\")
    .replace(/&amp;/gi, "&");

  const candidates = [
    html,
    decoded,
    decodeURIComponentSafe(decoded)
  ];

  for (const text of candidates) {
    // Full PCK URL.
    const fullUrl = /https?:\/\/classroom\.google\.com\/u\/0\/n\/pck[?#][^"'\\<>\s]*/gi;
    let match;
    while ((match = fullUrl.exec(text)) !== null) {
      const id = extractVideoId(match[0]);
      if (id) addFound(found, id);
    }

    // PCK path + query.
    const pathQuery = /\/u\/0\/n\/pck[?#][^"'\\<>\s]*/gi;
    while ((match = pathQuery.exec(text)) !== null) {
      const id = extractVideoId(match[0]);
      if (id) addFound(found, id);
    }

    // Bare "?v=..." / "&v=..." patterns in nearby PCK-like markup.
    const bare = /(?:[?&]v=)([A-Za-z0-9._~:%-]+)/gi;
    while ((match = bare.exec(text)) !== null) {
      const before = text.slice(Math.max(0, match.index - 160), match.index);
      const after = text.slice(match.index, Math.min(text.length, match.index + 260));

      // Avoid collecting arbitrary unrelated query parameters.
      if (/pck|classroom\.google\.com/i.test(before + after)) {
        addFound(found, decodeURIComponent(match[1]));
      }
    }
  }

  // 3) Heuristic: give nearby visible text to IDs when the page exposes
  // the ID in a small element but not as an ordinary anchor.
  for (const [id, item] of found) {
    if (!item.title.startsWith("動画 ")) continue;

    const escapedId = $.escapeSelector ? $.escapeSelector(id) : id.replace(/[^\w-]/g, "\\$&");
    const node = $(`[data-video-id="${escapedId}"], [data-id="${escapedId}"]`).first();

    if (node.length) {
      const parentText = cleanText(node.parent().text());
      if (parentText && parentText.length < 300) {
        item.title = parentText;
      }
    }
  }

  return [...found.values()].slice(0, 50);
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractVideoInfo(html, requestedId) {
  const $ = cheerio.load(html);

  const title =
    cleanText($('meta[property="og:title"]').attr("content")) ||
    cleanText($('meta[name="twitter:title"]').attr("content")) ||
    cleanText($("title").text()) ||
    `動画 ${requestedId}`;

  const description =
    cleanText($('meta[property="og:description"]').attr("content")) ||
    cleanText($('meta[name="description"]').attr("content")) ||
    "";

  let iframeSrc = "";
  $("iframe[src]").each((_, el) => {
    if (iframeSrc) return;
    const src = $(el).attr("src");
    if (src) iframeSrc = src;
  });

  // Fallback if the iframe is represented in raw HTML/script text.
  if (!iframeSrc) {
    const m = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (m) iframeSrc = m[1];
  }

  if (iframeSrc) {
    try {
      iframeSrc = new URL(iframeSrc, PCK_BASE).toString();
    } catch {
      iframeSrc = "";
    }
  }

  return {
    id: requestedId,
    title,
    description,
    iframeSrc,
    pageUrl: idToUrl(requestedId)
  };
}

app.get("/api/search", async (req, res) => {
  const q = cleanText(req.query.q);
  if (!q) return res.json({ query: "", results: [] });

  try {
    const url = `${PCK_BASE}?q=${encodeURIComponent(q)}`;
    const upstream = await fetchHtml(url);
    const { html, finalUrl, status, contentType } = upstream;
    const results = extractSearchResults(html);

    const isGoogleLogin =
      /(^|\.)accounts\.google\.com/i.test(finalUrl) ||
      /ServiceLogin|signin/i.test(finalUrl) ||
      /accounts\.google\.com/i.test(html.slice(0, 200000));

    res.json({
      query: q,
      source: url,
      finalUrl,
      upstreamStatus: status,
      contentType,
      isGoogleLogin,
      htmlLength: html.length,
      results
    });
  } catch (error) {
    console.error("SEARCH_ERROR", error);
    res.status(502).json({
      error: "検索元ページを取得できませんでした。",
      detail: error.message
    });
  }
});

app.get("/api/video/:id", async (req, res) => {
  const id = cleanText(req.params.id);
  if (!id || id.length > 300) {
    return res.status(400).json({ error: "動画IDが不正です。" });
  }

  try {
    const sourceUrl = idToUrl(id);
    const { html, finalUrl } = await fetchHtml(sourceUrl);
    const info = extractVideoInfo(html, id);

    res.json({
      ...info,
      sourceUrl,
      finalUrl
    });
  } catch (error) {
    console.error("VIDEO_ERROR", error);
    res.status(502).json({
      error: "動画ページを取得できませんでした。",
      detail: error.message
    });
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/{*splat}", (_req, res) => {
  res.sendFile("index.html", { root: "public" });
});

app.listen(PORT, HOST, () => {
  console.log(`Listening on http://${HOST}:${PORT}`);
});
