const state = {
  currentId: null,
  searchResults: []
};

const els = {
  homePage: document.querySelector("#homePage"),
  videoPage: document.querySelector("#videoPage"),
  listPage: document.querySelector("#listPage"),
  results: document.querySelector("#results"),
  savedList: document.querySelector("#savedList"),
  pageTitle: document.querySelector("#pageTitle"),
  status: document.querySelector("#status"),
  searchForm: document.querySelector("#searchForm"),
  searchInput: document.querySelector("#searchInput"),
  player: document.querySelector("#player"),
  videoTitle: document.querySelector("#videoTitle"),
  videoDescription: document.querySelector("#videoDescription"),
  openClassroom: document.querySelector("#openClassroom"),
  clearListBtn: document.querySelector("#clearListBtn"),
  sidebar: document.querySelector("#sidebar"),
  menuBtn: document.querySelector("#menuBtn")
};

const COOKIE_NAME = "pck_video_ids";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const MAX_IDS = 40;

function getCookie(name) {
  const prefix = `${name}=`;
  const found = document.cookie
    .split("; ")
    .find(row => row.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : "";
}

function getSavedIds() {
  const value = getCookie(COOKIE_NAME);
  if (!value) return [];
  return value
    .split(",")
    .map(id => id.trim())
    .filter(Boolean)
    .slice(0, MAX_IDS);
}

function saveIds(ids) {
  const unique = [...new Set(ids)].slice(0, MAX_IDS);
  document.cookie =
    `${COOKIE_NAME}=${encodeURIComponent(unique.join(","))}; ` +
    `Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
}

function addToList(id) {
  if (!id) return;
  saveIds([id, ...getSavedIds()]);
  renderSavedList();
}

function removeFromList(id) {
  saveIds(getSavedIds().filter(x => x !== id));
  renderSavedList();
}

function isSaved(id) {
  return getSavedIds().includes(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(text) {
  els.status.textContent = text || "";
}

function showPage(page) {
  els.homePage.hidden = page !== "home";
  els.videoPage.hidden = page !== "video";
  els.listPage.hidden = page !== "list";

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.page === page);
  });
}

function renderResults(results) {
  if (!results.length) {
    els.results.innerHTML =
      `<div class="empty">検索結果がありません。<br>取得元のページがログインを要求している場合は、この方式では結果を取得できません。</div>`;
    return;
  }

  els.results.innerHTML = results.map(item => `
    <article class="card" data-id="${escapeHtml(item.id)}">
      <div class="thumb"><div class="play">▶</div></div>
      <div class="card-title">${escapeHtml(item.title)}</div>
      <div class="card-id">${escapeHtml(item.id)}</div>
    </article>
  `).join("");

  els.results.querySelectorAll(".card").forEach(card => {
    card.addEventListener("click", () => openVideo(card.dataset.id));
  });
}

async function search(q, pushUrl = true) {
  q = q.trim();
  if (!q) {
    els.pageTitle.textContent = "おすすめ / 検索結果";
    setStatus("");
    els.results.innerHTML = `<div class="empty">上の検索欄から動画を検索してください。</div>`;
    return;
  }

  showPage("home");
  els.pageTitle.textContent = `「${q}」の検索結果`;
  setStatus("検索中…");

  if (pushUrl) {
    history.pushState({ q }, "", `/?q=${encodeURIComponent(q)}`);
  }

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || data.error || "検索エラー");
    }

    state.searchResults = data.results || [];

    if (!state.searchResults.length && data.isGoogleLogin) {
      els.results.innerHTML =
        `<div class="empty">
          Google Classroom側がログインページを返しました。<br>
          RenderサーバーにはあなたのGoogleログイン状態がないため、検索結果を取得できません。<br><br>
          <small>取得先: ${escapeHtml(data.finalUrl || "")}</small>
        </div>`;
      setStatus("Googleログインが必要");
    } else if (!state.searchResults.length) {
      els.results.innerHTML =
        `<div class="empty">
          検索結果を抽出できませんでした。<br>
          <small>取得URL: ${escapeHtml(data.finalUrl || "")}</small><br>
          <small>HTML: ${escapeHtml(String(data.htmlLength ?? ""))} bytes / HTTP ${escapeHtml(String(data.upstreamStatus ?? ""))}</small>
        </div>`;
      setStatus("0 件");
    } else {
      renderResults(state.searchResults);
      setStatus(`${state.searchResults.length} 件`);
    }
  } catch (error) {
    console.error(error);
    els.results.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    setStatus("取得失敗");
  }
}

async function openVideo(id, pushUrl = true) {
  if (!id) return;

  state.currentId = id;
  showPage("video");
  els.videoTitle.textContent = "読み込み中…";
  els.videoDescription.textContent = "";
  els.player.removeAttribute("src");
  els.openClassroom.href =
    `https://classroom.google.com/u/0/n/pck?v=${encodeURIComponent(id)}`;

  if (pushUrl) {
    history.pushState({ v: id }, "", `/?v=${encodeURIComponent(id)}`);
  }

  try {
    const response = await fetch(`/api/video/${encodeURIComponent(id)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || data.error || "動画情報の取得に失敗しました");
    }

    els.videoTitle.textContent = data.title || `動画 ${id}`;
    els.videoDescription.textContent = data.description || "";
    els.openClassroom.href = data.pageUrl;

    // Embed the Classroom player directly from the video ID.
    els.player.src = `https://classroom.google.com/u/0/n/player?v=${encodeURIComponent(id)}`;
  } catch (error) {
    console.error(error);
    els.videoTitle.textContent = `動画 ${id}`;
    els.videoDescription.textContent = error.message;
    els.player.src = `https://classroom.google.com/u/0/n/player?v=${encodeURIComponent(id)}`;
  }
}

function refreshSaveButtons() {}


async function renderSavedList() {
  const ids = getSavedIds();

  if (!ids.length) {
    els.savedList.innerHTML =
      `<div class="empty">まだ動画がありません。</div>`;
    return;
  }

  els.savedList.innerHTML = ids.map(id => `
    <article class="list-card" data-id="${escapeHtml(id)}">
      <div class="list-thumb">▶</div>
      <div class="list-text">
        <div class="list-title">動画 ${escapeHtml(id)}</div>
      </div>
    </article>
  `).join("");

  // Fetch titles so the list is more YouTube-like.
  await Promise.all(ids.map(async id => {
    const card = els.savedList.querySelector(`[data-id="${CSS.escape(id)}"] .list-title`);
    if (!card) return;

    try {
      const response = await fetch(`/api/video/${encodeURIComponent(id)}`);
      const data = await response.json();
      if (response.ok && data.title) {
        card.textContent = data.title;
      }
    } catch {
      // Keep the ID fallback.
    }
  }));

  els.savedList.querySelectorAll(".list-card").forEach(card => {
    card.addEventListener("click", () => openVideo(card.dataset.id));
  });
}

els.searchForm.addEventListener("submit", event => {
  event.preventDefault();
  search(els.searchInput.value);
});



els.clearListBtn.addEventListener("click", () => {
  saveIds([]);
  renderSavedList();
});

els.sidebar.addEventListener("click", event => {
  const btn = event.target.closest(".nav-item");
  if (!btn) return;

  if (btn.dataset.page === "list") {
    showPage("list");
    history.pushState({}, "", "/");
    renderSavedList();
  } else {
    showPage("home");
    history.pushState({}, "", "/");
  }
});

window.addEventListener("popstate", () => initFromUrl());

async function initFromUrl() {
  const params = new URLSearchParams(location.search);

  if (params.get("v")) {
    await openVideo(params.get("v"), false);
    return;
  }

  if (params.get("q")) {
    els.searchInput.value = params.get("q");
    await search(params.get("q"), false);
    return;
  }

  showPage("home");
  els.results.innerHTML =
    `<div class="empty">上の検索欄から動画を検索してください。</div>`;
}

renderSavedList();
initFromUrl();
