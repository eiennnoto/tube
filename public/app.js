const app = document.getElementById('app');
const searchForm = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');
const listBtn = document.getElementById('listBtn');
const menuBtn = document.getElementById('menuBtn');
const sidebar = document.getElementById('sidebar');

function escapeHtml(value='') {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function getCookie(name) {
  const prefix = `${name}=`;
  const item = document.cookie.split('; ').find(x => x.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : '';
}

function getVideoList() {
  try {
    const parsed = JSON.parse(getCookie('videoList') || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 50) : [];
  } catch { return []; }
}

function saveVideoList(ids) {
  const unique = [...new Set(ids)].slice(0, 50);
  document.cookie = `videoList=${encodeURIComponent(JSON.stringify(unique))}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

function addToList(id) {
  const ids = getVideoList();
  if (!ids.includes(id)) ids.unshift(id);
  saveVideoList(ids);
}

function removeFromList(id) {
  saveVideoList(getVideoList().filter(x => x !== id));
}

function route() {
  const path = location.pathname;
  const params = new URLSearchParams(location.search);
  if (path === '/watch') return renderWatch(params.get('v') || '');
  if (path === '/list') return renderList();
  if (path === '/results') return renderSearch(params.get('q') || '');
  return renderHome();
}

function emptyState() {
  return document.getElementById('emptyTemplate').content.cloneNode(true);
}

function cardHtml(item) {
  return `<a class="card" href="/watch?v=${encodeURIComponent(item.id)}">
    <div class="thumb">${item.thumbnail ? `<img src="${escapeHtml(item.thumbnail)}" alt="">` : '<div class="play">▶</div>'}</div>
    <h3>${escapeHtml(item.title || `動画 ${item.id}`)}</h3>
    <p>${escapeHtml(item.description || item.id)}</p>
  </a>`;
}

async function renderHome() {
  app.innerHTML = '';
  app.appendChild(emptyState());
}

async function renderSearch(q) {
  if (!q) return renderHome();
  app.innerHTML = `<div class="loading">検索中…</div>`;
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '検索に失敗しました');

    const results = data.results || [];
    app.innerHTML = `<h1 class="page-title">「${escapeHtml(q)}」の検索結果</h1>
      <div class="notice">検索元: Google Classroomの <code>/u/0/n/pck?q=...</code></div>
      ${results.length ? `<div class="grid">${results.map(cardHtml).join('')}</div>` : '<div class="empty"><h2>結果がありません</h2></div>'}`;
  } catch (error) {
    app.innerHTML = `<div class="error"><strong>検索エラー</strong><br>${escapeHtml(error.message)}</div>`;
  }
}

async function renderWatch(id) {
  if (!id) return renderHome();
  app.innerHTML = `<div class="loading">動画情報を読み込み中…</div>`;
  try {
    const response = await fetch(`/api/video/${encodeURIComponent(id)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '動画情報の取得に失敗しました');

    app.innerHTML = `<section class="watch">
      <div class="player player-external">
        <div class="external-player-icon">▶</div>
        <h2>Classroomで動画を再生</h2>
        <p>Google Classroomの動画ページは、このサイト内のiframeでは再生できない場合があります。</p>
        <a class="watch-btn" href="https://classroom.google.com/u/0/n/player?v=${encodeURIComponent(id)}" target="_blank" rel="noopener noreferrer">動画を再生する</a>
      </div>
      <h1>${escapeHtml(data.title)}</h1>
      <div class="meta">${escapeHtml(data.description || '概要欄はありません。')}</div>
      <div class="actions"><button class="action" id="addBtn">＋ 動画リストに追加</button><a class="action" href="https://classroom.google.com/u/0/n/player?v=${encodeURIComponent(id)}" target="_blank" rel="noopener">Classroomで開く</a></div>
      <div class="small">動画ID: ${escapeHtml(id)}</div>
    </section>`;
    document.getElementById('addBtn').addEventListener('click', () => {
      addToList(id);
      document.getElementById('addBtn').textContent = '✓ 動画リストに追加済み';
    });
  } catch (error) {
    app.innerHTML = `<div class="error"><strong>動画情報エラー</strong><br>${escapeHtml(error.message)}<br><br>動画自体はClassroomのURLを直接開くことで確認できる場合があります。</div>`;
  }
}

async function renderList() {
  const ids = getVideoList();
  if (!ids.length) {
    app.innerHTML = '<div class="empty"><div class="empty-icon">📚</div><h2>動画リストは空です</h2><p>動画ページで「動画リストに追加」を押すと、ここに保存されます。</p></div>';
    return;
  }

  app.innerHTML = `<h1 class="page-title">動画リスト</h1><div id="listStatus" class="status">読み込み中…</div>`;
  const rows = [];
  for (const id of ids) {
    try {
      const r = await fetch(`/api/video/${encodeURIComponent(id)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'error');
      rows.push(`<div class="list-row">
        <a href="/watch?v=${encodeURIComponent(id)}"><div class="thumb">${data.thumbnail ? `<img src="${escapeHtml(data.thumbnail)}" alt="">` : '<div class="play">▶</div>'}</div></a>
        <div><a href="/watch?v=${encodeURIComponent(id)}" style="color:inherit;text-decoration:none"><h3>${escapeHtml(data.title)}</h3></a><div class="small">${escapeHtml(data.description || id)}</div></div>
        <button class="remove" data-id="${escapeHtml(id)}">削除</button>
      </div>`);
    } catch {
      rows.push(`<div class="list-row"><div class="thumb"><div class="play">▶</div></div><div><h3>動画 ${escapeHtml(id)}</h3><div class="small">動画情報を取得できませんでした</div></div><button class="remove" data-id="${escapeHtml(id)}">削除</button></div>`);
    }
  }

  app.innerHTML = `<h1 class="page-title">動画リスト</h1><div class="list">${rows.join('')}</div>`;
  app.querySelectorAll('.remove').forEach(btn => btn.addEventListener('click', () => {
    removeFromList(btn.dataset.id);
    renderList();
  }));
}

searchForm.addEventListener('submit', event => {
  event.preventDefault();
  const q = searchInput.value.trim();
  if (!q) return;
  history.pushState({}, '', `/results?q=${encodeURIComponent(q)}`);
  route();
});
listBtn.addEventListener('click', () => { history.pushState({}, '', '/list'); route(); });
menuBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
window.addEventListener('popstate', route);
route();
