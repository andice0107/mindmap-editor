'use strict';
/* =========================================================
   GitHub 雲端存檔
   - 每個人用自己的金鑰，存到自己的「私人」repo，別人看不到
   - 金鑰只存在這台裝置的瀏覽器
   - 每張畫布一個檔案：mindmaps/<名稱>__<id>.json
   ========================================================= */

const GH_KEY = 'mindmap-editor-gh';        // {token, owner, repo, login}
const GH_META = 'mindmap-editor-ghmeta';   // {projectId: {path, sha, hash}}
const GH_DIR = 'mindmaps';
const GH = { cfg: null, meta: {}, busy: false, status: 'off', timer: null, listCache: null };
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
GH.cfg = lsGet(GH_KEY, null);
GH.meta = lsGet(GH_META, {});

function hashStr(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + ':' + s.length; }
function b64encode(str) {
  const bytes = new TextEncoder().encode(str); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const ghPathFor = p => `${GH_DIR}/${safeName(p.name).replace(/[#%?&]/g, '')}__${p.id}.json`;
const ghIdFromPath = path => { const m = path.match(/__([A-Za-z0-9]+)\.json$/); return m ? m[1] : null; };
const ghNameFromPath = path => path.replace(/^.*\//, '').replace(/__[A-Za-z0-9]+\.json$/, '');
const encPath = path => path.split('/').map(encodeURIComponent).join('/');

async function gh(method, url, body, opt = {}) {
  const c = opt.cfg || GH.cfg;
  const res = await fetch('https://api.github.com' + url, {
    method,
    headers: { Authorization: 'Bearer ' + c.token, Accept: opt.raw ? 'application/vnd.github.raw' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store'
  });
  if (!res.ok) { const e = new Error('HTTP ' + res.status); e.status = res.status; try { e.body = await res.json(); } catch (x) { } throw e; }
  if (res.status === 204) return null;
  return opt.raw ? res.text() : res.json();
}
const repoUrl = (c = GH.cfg) => `/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`;

/* ---------- 狀態顯示 ---------- */
function ghSetStatus(st, msg) {
  GH.status = st;
  const b = $('#btn-cloud');
  if (!b) return;
  const icon = { off: '☁️', ok: '☁️', busy: '⏳', warn: '⚠️' }[st] || '☁️';
  b.querySelector('.ic').textContent = icon;
  b.querySelector('.lb').textContent = GH.cfg ? '雲端專案' : '登入GitHub';
  b.classList.toggle('warn', st === 'warn');
  b.title = msg || (GH.cfg ? `已登入 ${GH.cfg.login}（${GH.cfg.owner}/${GH.cfg.repo}）` : '登入自己的 GitHub，把專案存到雲端');
  const ss = $('#cloud-state');
  if (ss) ss.textContent = !GH.cfg ? '' : st === 'busy' ? '☁️ 上傳中…' : st === 'warn' ? '☁️ ' + (msg || '還沒上傳') : '☁️ 已同步';
  if (ss) ss.classList.toggle('warn', st === 'warn');
}

/* ---------- 上傳 ---------- */
function ghDirtyProjects() {
  return state.projects.filter(p => { const m = GH.meta[p.id]; return !m || m.hash !== hashStr(JSON.stringify(projectData(p))) || m.path !== ghPathFor(p); });
}
function ghSchedule(delay = 3000) {
  if (!GH.cfg) return;
  clearTimeout(GH.timer);
  GH.timer = setTimeout(ghUploadAll, delay);
}
async function ghUploadAll() {
  if (!GH.cfg || GH.busy) { if (GH.busy) ghSchedule(2000); return; }
  const list = ghDirtyProjects();
  if (!list.length) { ghSetStatus('ok'); return; }
  if (!navigator.onLine) { ghSetStatus('warn', '沒有網路，連上後會自動上傳'); return; }
  GH.busy = true; ghSetStatus('busy');
  try {
    for (const p of list) await ghUploadOne(p);
    ghSetStatus('ok');
  } catch (e) {
    ghSetStatus('warn', e.status === 401 ? '金鑰失效，請重新登入' : '上傳失敗，稍後自動再試');
    if (e.status !== 401) ghSchedule(60000);
  } finally { GH.busy = false; }
}
async function ghUploadOne(p, retried) {
  const data = projectData(p), str = JSON.stringify(data);
  const path = ghPathFor(p), m = GH.meta[p.id] || {};
  const body = { message: `更新心智圖：${p.name}`, content: b64encode(JSON.stringify({ app: 'mindmap-editor', version: 2, project: data }, null, 1)) };
  const sameFile = m.path === path;
  if (sameFile && m.sha) body.sha = m.sha;
  try {
    const r = await gh('PUT', `${repoUrl()}/contents/${encPath(path)}`, body);
    if (m.path && !sameFile && m.sha) { try { await gh('DELETE', `${repoUrl()}/contents/${encPath(m.path)}`, { message: `改名：${p.name}`, sha: m.sha }); } catch (e) { } }
    GH.meta[p.id] = { path, sha: r.content.sha, hash: hashStr(str) };
    lsSet(GH_META, GH.meta);
  } catch (e) {
    if ((e.status === 409 || e.status === 422) && !retried) {
      // 雲端那份被別台裝置改過：把雲端版本另存成新分頁，再用這台的版本更新，兩邊都不會遺失
      const remote = await ghFindRemote(p.id);
      if (remote) {
        try {
          const txt = await gh('GET', `${repoUrl()}/contents/${encPath(remote.path)}`, null, { raw: true });
          const d = JSON.parse(txt);
          if (d && d.project && JSON.stringify(d.project) !== str) {
            const copy = { ...d.project, id: uid('p') };
            const r = copy.nodes[copy.rootId || 'root'];
            if (r) r.text = r.text.split('\n')[0] + '（另一台裝置的版本）' + r.text.split('\n').slice(1).map(x => '\n' + x).join('');
            copy.name = (copy.name || '') + '（另一台裝置的版本）';
            state.projects.push(copy); renderTabs();
            toast(`「${p.name}」在別台裝置也改過，已把那個版本另外開成新分頁`, 'warn');
          }
        } catch (x) { }
        GH.meta[p.id] = { ...m, path: remote.path, sha: remote.sha };
      } else GH.meta[p.id] = { ...m, sha: null };
      return ghUploadOne(p, true);
    }
    throw e;
  }
}
async function ghList() {
  try {
    const arr = await gh('GET', `${repoUrl()}/contents/${GH_DIR}?t=${Date.now()}`);
    GH.listCache = (Array.isArray(arr) ? arr : []).filter(f => f.type === 'file' && /\.json$/i.test(f.name)).map(f => ({ path: f.path, sha: f.sha, size: f.size, id: ghIdFromPath(f.path), name: ghNameFromPath(f.path) }));
  } catch (e) { if (e.status === 404) GH.listCache = []; else throw e; }
  return GH.listCache;
}
async function ghFindRemote(id) { const l = await ghList(); return l.find(f => f.id === id) || null; }
async function ghDownload(f) {
  const txt = await gh('GET', `${repoUrl()}/contents/${encPath(f.path)}`, null, { raw: true });
  const d = JSON.parse(txt);
  if (!d || !d.project || !d.project.nodes) throw new Error('格式不對');
  return d.project;
}
function ghReplaceLocal(proj, f) {
  const i = state.projects.findIndex(p => p.id === proj.id);
  const p = { links: [], ...proj };
  if (i >= 0) state.projects[i] = p; else state.projects.push(p);
  GH.meta[p.id] = { path: f.path, sha: f.sha, hash: hashStr(JSON.stringify(projectData(p))) };
  lsSet(GH_META, GH.meta);
  if (P && P.id === p.id) { P = null; }
  return p;
}

/* 開啟時：已開著的畫布如果雲端比較新（而且這台沒改過），自動換成雲端版本 */
async function ghPullOnStart() {
  if (!GH.cfg || !navigator.onLine) return;
  try {
    const list = await ghList();
    let pulled = 0, active = state.activeId;
    for (const f of list) {
      const local = state.projects.find(p => p.id === f.id);
      const m = GH.meta[f.id];
      if (!local || !m || m.sha === f.sha) continue;
      const localDirty = m.hash !== hashStr(JSON.stringify(projectData(local)));
      const proj = await ghDownload(f);
      if (localDirty) { // 兩邊都改過：雲端版本另開分頁
        const copy = { ...proj, id: uid('p'), name: (proj.name || '') + '（雲端版本）' };
        state.projects.push(copy);
        GH.meta[f.id] = { ...m, sha: f.sha, path: f.path };
      } else { ghReplaceLocal(proj, f); pulled++; }
    }
    if (pulled) {
      P = null; LAY.clear(); switchProject(state.projects.some(p => p.id === active) ? active : state.projects[0].id);
      toast(`已從雲端更新 ${pulled} 張畫布`);
    }
    renderTabs();
    const missing = list.filter(f => !state.projects.some(p => p.id === f.id)).length;
    ghSetStatus('ok', missing ? `雲端還有 ${missing} 張這台沒開的畫布` : '');
    ghSchedule(1500);
  } catch (e) { ghSetStatus('warn', e.status === 401 ? '金鑰失效，請重新登入' : '連不上雲端'); }
}

/* ---------- 登入 ---------- */
function openCloud() { if (GH.cfg) openCloudList(); else openCloudLogin(); }
function openCloudLogin() {
  modal(`<div class="help"><h2>☁️ 登入我的 GitHub</h2>
  <p>登入後，畫布會自動存到<b>你自己的私人 GitHub 空間</b>。換電腦、換 iPad，只要登入同一把金鑰就能打開；別人用他自己的金鑰，只會看到他自己的檔案。</p>
  <label class="field">GitHub 金鑰（github_pat_ 開頭的一長串）<input type="password" id="gh-token" autocomplete="off" placeholder="github_pat_..."></label>
  <label class="field">存放心智圖的私人 repo 名稱<input type="text" id="gh-repo" value="my-mindmaps"></label>
  <p class="hint">金鑰只會存在這台裝置的瀏覽器裡，不會傳給別人。用學校公用電腦時，用完請記得登出。</p>
  <details class="howto"><summary>📖 第一次使用：怎麼建立私人 repo 和金鑰？（點開看步驟）</summary>
  <h3>步驟 1：建立私人 repo（只要做一次）</h3>
  <ol class="steps">
    <li>登入 GitHub 後，打開 <a href="https://github.com/new?name=my-mindmaps&visibility=private" target="_blank" rel="noopener">github.com/new?name=my-mindmaps&amp;visibility=private</a></li>
    <li>確認名稱是 <b>my-mindmaps</b>、選的是 <b>Private（私人）</b>，按綠色「Create repository」。</li>
  </ol>
  <h3>步驟 2：建立金鑰（只要做一次）</h3>
  <ol class="steps">
    <li>打開 <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a></li>
    <li><b>Token name</b>：隨便取，例如「心智圖工具」。<b>Expiration</b>（到期日）：選 <b>Custom</b> 再選一年後，或依需要。</li>
    <li><b>Repository access</b>：選「<b>Only select repositories</b>」，再選 <b>my-mindmaps</b>。</li>
    <li><b>Permissions</b> → <b>Repository permissions</b> → 找到 <b>Contents</b>，改成「<b>Read and write</b>」。（其他都不用動）</li>
    <li>拉到最下面按「<b>Generate token</b>」，把出現的 <b>github_pat_…</b> 整串複製，貼到上面的金鑰框。</li>
  </ol>
  <p class="hint">金鑰只出現一次，建議存到自己的密碼管理或記事本。忘記了就再建一把新的。這把金鑰只能動 my-mindmaps 這一個 repo，其他東西都碰不到。</p>
  </details></div>
  <div class="actions"><button class="btn" data-x>取消</button><button class="btn primary" id="gh-go">登入</button></div>`, m => {
    $('#gh-go', m).onclick = async () => {
      const token = $('#gh-token', m).value.trim();
      let repo = $('#gh-repo', m).value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
      if (!token) { toast('請貼上金鑰', 'warn'); return; }
      if (!repo) { toast('請輸入 repo 名稱', 'warn'); return; }
      $('#gh-go', m).disabled = true; $('#gh-go', m).textContent = '檢查中…';
      try { await ghConnect(token, repo); }
      catch (e) { toast(e.message, 'warn'); }
      finally { const b = $('#gh-go', m); if (b) { b.disabled = false; b.textContent = '登入'; } }
    };
  });
}
async function ghConnect(token, repoIn) {
  const tmp = { token };
  let user;
  try { user = await gh('GET', '/user', null, { cfg: tmp }); }
  catch (e) { throw new Error(e.status === 401 ? '金鑰不對，或金鑰已過期。' : '連不上 GitHub，請檢查網路。'); }
  let owner = user.login, repo = repoIn;
  if (repoIn.includes('/')) [owner, repo] = repoIn.split('/');
  const cfg = { token, owner, repo, login: user.login };
  let info;
  try { info = await gh('GET', repoUrl(cfg), null, { cfg }); }
  catch (e) { throw new Error(e.status === 404 ? `找不到 ${owner}/${repo}，或金鑰沒有開放這個 repo。請確認已建立 repo，並在金鑰設定選了它。` : '讀不到這個 repo。'); }
  if (!info.private) {
    const ok = await new Promise(res => modal(`<h2>⚠️ 這個 repo 是「公開」的！</h2><p>存在 ${esc(owner)}/${esc(repo)} 的心智圖，<b>任何人都看得到</b>。建議改用私人 repo。確定還是要用它嗎？</p>
      <div class="actions"><button class="btn primary" id="pub-no">不要，改用私人 repo</button><button class="btn danger" id="pub-yes">我知道，還是要用</button></div>`,
      m => { $('#pub-no', m).onclick = () => { closeModal(); res(false); }; $('#pub-yes', m).onclick = () => { closeModal(); res(true); }; }));
    if (!ok) throw new Error('已取消。請改用私人 repo。');
  }
  // 試寫一次，確定有寫入權限
  try { await gh('GET', `${repoUrl(cfg)}/contents/${GH_DIR}`, null, { cfg }); }
  catch (e) { if (e.status !== 404) throw new Error('讀不到 repo 的內容，請確認金鑰的 Contents 權限是 Read and write。'); }
  GH.cfg = cfg; lsSet(GH_KEY, cfg);
  GH.meta = {}; lsSet(GH_META, GH.meta);
  ghSetStatus('ok');
  toast(`已登入 ${user.login}，畫布會存到 ${owner}/${repo}`);
  closeModal(); openCloudList(true);
}
function ghLogout(clearLocal) {
  GH.cfg = null; GH.meta = {}; GH.listCache = null;
  try { localStorage.removeItem(GH_KEY); localStorage.removeItem(GH_META); } catch (e) { }
  if (clearLocal) {
    try { localStorage.removeItem(STORE_KEY); localStorage.removeItem(CLIP_KEY); } catch (e) { }
    location.reload(); return;
  }
  ghSetStatus('off'); toast('已登出，這台裝置不會再上傳到雲端');
}

/* ---------- 雲端專案清單 ---------- */
async function openCloudList(afterLogin) {
  const c = GH.cfg;
  const back = modal(`<div class="help"><h2>☁️ 雲端專案</h2>
  <p class="hint">已登入 <b>${esc(c.login)}</b>，存放在私人 repo <b>${esc(c.owner)}/${esc(c.repo)}</b>。這台裝置的畫布有變動就會自動上傳。</p>
  ${afterLogin ? `<div class="cloud-first"><b>要把這台裝置目前的 ${state.projects.length} 張畫布都存到雲端嗎？</b><br><button class="btn primary" id="gh-upall">⬆️ 全部上傳</button> <button class="btn" id="gh-skip">先不要，只用雲端上的</button></div>` : ''}
  <div id="gh-list" class="cloud-list">讀取中…</div></div>
  <div class="actions">
    <button class="btn" id="gh-logout">登出</button>
    <button class="btn" id="gh-sync">🔄 立刻同步</button>
    <button class="btn primary" data-x>關閉</button>
  </div>`, m => {
    $('#gh-logout', m).onclick = () => {
      modal(`<h2>要登出 GitHub 嗎？</h2><p>登出後這台裝置不會再上傳到雲端，雲端上的檔案不會被刪除。</p>
      <label class="check"><input type="checkbox" id="lo-clear"> 同時清除這台裝置裡的所有畫布（用公用電腦時請勾選）</label>
      <div class="actions"><button class="btn" data-x>取消</button><button class="btn danger" id="lo-go">登出</button></div>`, m2 => {
        $('#lo-go', m2).onclick = () => { const cl = $('#lo-clear', m2).checked; closeModal(); ghLogout(cl); };
      });
    };
    $('#gh-sync', m).onclick = async () => { await ghUploadAll(); await ghPullOnStart(); renderCloudList(m); toast('同步完成'); };
    const up = $('#gh-upall', m), sk = $('#gh-skip', m);
    if (up) up.onclick = async () => { $('.cloud-first', m).innerHTML = '上傳中…'; await ghUploadAll(); $('.cloud-first', m).innerHTML = '✅ 已全部上傳'; renderCloudList(m); };
    if (sk) sk.onclick = () => {
      // 這台的畫布標記成「已同步」就不會被上傳
      state.projects.forEach(p => { GH.meta[p.id] = { path: ghPathFor(p), sha: null, hash: hashStr(JSON.stringify(projectData(p))), skip: true }; });
      lsSet(GH_META, GH.meta);
      $('.cloud-first', m).innerHTML = '好的，這台原本的畫布不會上傳（之後有修改的那張才會上傳）。';
    };
    renderCloudList(m);
  });
  return back;
}
async function renderCloudList(m) {
  const box = $('#gh-list', m); if (!box) return;
  try {
    const list = await ghList();
    if (!list.length) { box.innerHTML = '<p>雲端上還沒有畫布。這台的畫布有修改時就會自動存上去。</p>'; return; }
    box.innerHTML = list.map(f => {
      const open = state.projects.some(p => p.id === f.id);
      return `<div class="cloud-row"><span class="cn">📄 ${esc(f.name)}</span><span class="cs">${(f.size / 1024).toFixed(0)} KB${open ? '・已開著' : ''}</span>
        <button class="btn" data-gh-open="${esc(f.path)}">${open ? '切換過去' : '打開'}</button>
        <button class="btn" data-gh-del="${esc(f.path)}" title="從雲端刪除">🗑️</button></div>`;
    }).join('') + (list.some(f => !state.projects.some(p => p.id === f.id)) ? '<div class="actions" style="justify-content:flex-start"><button class="btn" id="gh-openall">全部打開</button></div>' : '');
    $$('[data-gh-open]', box).forEach(b => b.onclick = async () => {
      const f = list.find(x => x.path === b.dataset.ghOpen);
      if (state.projects.some(p => p.id === f.id)) { closeModal(); switchProject(f.id); return; }
      b.disabled = true; b.textContent = '下載中…';
      try { const p = ghReplaceLocal(await ghDownload(f), f); closeModal(); LAY.clear(); switchProject(p.id); renderTabs(); toast(`已打開「${p.name}」`); }
      catch (e) { toast('打不開這個檔案', 'warn'); b.disabled = false; b.textContent = '打開'; }
    });
    $$('[data-gh-del]', box).forEach(b => b.onclick = () => {
      const f = list.find(x => x.path === b.dataset.ghDel);
      confirmBox(`要從雲端刪除「${esc(f.name)}」嗎？`, '雲端上的檔案會刪除（GitHub 的歷史紀錄裡還找得回來）。這台裝置如果開著這張畫布，會保留在這台、但不會再上傳。', '從雲端刪除', async () => {
        try {
          await gh('DELETE', `${repoUrl()}/contents/${encPath(f.path)}`, { message: `刪除心智圖：${f.name}`, sha: f.sha });
          const local = state.projects.find(p => p.id === f.id);
          if (local) { local.id = uid('p'); if (state.activeId === f.id) state.activeId = local.id; GH.meta[local.id] = { path: ghPathFor(local), sha: null, hash: hashStr(JSON.stringify(projectData(local))), skip: true }; }
          delete GH.meta[f.id]; lsSet(GH_META, GH.meta); saveNow(); renderTabs();
          toast('已從雲端刪除'); openCloudList();
        } catch (e) { toast('刪除失敗，請稍後再試', 'warn'); }
      });
    });
    const oa = $('#gh-openall', box);
    if (oa) oa.onclick = async () => {
      oa.disabled = true; oa.textContent = '下載中…';
      let k = 0, last = null;
      for (const f of list) { if (state.projects.some(p => p.id === f.id)) continue; try { last = ghReplaceLocal(await ghDownload(f), f); k++; } catch (e) { } }
      closeModal(); if (last) { LAY.clear(); switchProject(last.id); } renderTabs(); toast(`已打開 ${k} 張雲端畫布`);
    };
  } catch (e) { box.innerHTML = `<p>讀不到雲端清單（${e.status === 401 ? '金鑰失效，請登出後重新登入' : '請檢查網路'}）。</p>`; }
}

/* ---------- 接上主程式 ---------- */
(function hook() {
  const orig = saveNow;
  saveNow = function () { orig(); if (GH.cfg) { ghSetStatus(ghDirtyProjects().length ? 'warn' : 'ok', '還沒上傳'); ghSchedule(); } };
  ACTIONS.cloud = openCloud;
  window.addEventListener('online', () => ghSchedule(500));
  // 已登入：「略過上傳」的畫布被修改後才上傳
  const origDirty = ghDirtyProjects;
  ghDirtyProjects = function () { return origDirty().filter(p => { const m = GH.meta[p.id]; return !(m && m.skip && m.hash === hashStr(JSON.stringify(projectData(p)))); }); };
  ghSetStatus(GH.cfg ? 'ok' : 'off');
  if (GH.cfg) ghPullOnStart();
})();
