'use strict';
/* =========================================================
   AI 協作：給使用者的說明、給 AI 的提示詞、匯入 AI 產生的內容
   ========================================================= */

const AI_PROMPT_FILE = 'ai-prompt.md';
let AI_PROMPT_TEXT = null;
function loadAIPrompt() {
  if (AI_PROMPT_TEXT) return Promise.resolve(AI_PROMPT_TEXT);
  return fetch(AI_PROMPT_FILE + '?v=1').then(r => { if (!r.ok) throw new Error(r.status); return r.text(); }).then(t => (AI_PROMPT_TEXT = t));
}

/* ---------- 匯入：AI 的簡易格式（tree） ---------- */
const AI_NODE_FIELDS = {
  emoji: v => typeof v === 'string' ? v.slice(0, 8) : undefined,
  zhuyin: v => !!v, blank: v => !!v, isBold: v => !!v, isItalic: v => !!v, isUnderline: v => !!v,
  writingMode: v => v === 'vertical' ? 'vertical' : 'horizontal',
  fontSize: v => { const n = +v; return n >= 8 && n <= 80 ? n : undefined; },
  shape: v => ['rounded-rect', 'rect', 'capsule', 'ellipse', 'none'].includes(v) ? v : undefined,
  fontFamily: v => ['sans', 'kai', 'serif'].includes(v) ? v : undefined
};
const AI_COLOR_FIELDS = ['fillColor', 'borderColor', 'fontColor', 'lineColor'];
const isHex = v => typeof v === 'string' && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v);

function buildFromAI(d) {
  const t0 = d.tree;
  if (!t0 || typeof t0 !== 'object') throw new Error('沒有 tree');
  const p = newProject(String(d.name || t0.text || '心智圖').split('\n')[0]);
  if (d.palette && PALETTES.find(x => x.id === d.palette)) p.palette = d.palette;
  const idMap = {}, colors = {}, extra = { boxes: [] };
  let alt = 0;
  const apply = (n, t) => {
    for (const k in AI_NODE_FIELDS) if (t[k] !== undefined) { const v = AI_NODE_FIELDS[k](t[k]); if (v !== undefined) n[k] = v; }
    const c = {}; AI_COLOR_FIELDS.forEach(k => { if (isHex(t[k])) c[k] = normHex(t[k]); });
    if (Object.keys(c).length) colors[n.id] = c;
    if (t.collapsed) n.isCollapsed = true;
    if (t.id != null) idMap[String(t.id)] = n.id;
  };
  const mk = (t, parent, side, lvl) => {
    if (!t || typeof t !== 'object') return;
    const n = makeNode(String(t.text ?? '').replace(/\\n/g, '\n'), parent ? parent.id : null, side, lvl);
    if (!parent) n.id = 'root';
    p.nodes[n.id] = n;
    apply(n, t);
    if (parent) parent.children.push(n.id);
    (Array.isArray(t.children) ? t.children : []).forEach(c => {
      let s = side;
      if (!parent) s = c && (c.side === 'left' || c.side === 'right') ? c.side : (alt++ % 2 === 0 ? 'right' : 'left');
      mk(c, n, s, lvl + 1);
    });
  };
  mk(t0, null, 'center', 0);
  (Array.isArray(d.boxes) ? d.boxes : []).forEach(b => {
    if (!b || typeof b !== 'object') return;
    const n = makeNode(String(b.text ?? '').replace(/\\n/g, '\n'), null, 'free', 1);
    n.shape = 'capsule';
    p.nodes[n.id] = n; apply(n, b);
    extra.boxes.push({ id: n.id, x: typeof b.x === 'number' ? b.x : null, y: typeof b.y === 'number' ? b.y : null });
  });
  extra.links = (Array.isArray(d.links) ? d.links : []).map(l => {
    const a = idMap[String(l && l.from)], b = idMap[String(l && l.to)];
    if (!a || !b || a === b) return null;
    const arrow = l.arrow || 'end';
    return { id: uid('l'), a: { node: a, x: 0, y: 0 }, b: { node: b, x: 0, y: 0 }, color: isHex(l.color) ? normHex(l.color) : '#475569', width: 3,
      dash: ['dashed', 'dotted'].includes(l.dash) ? l.dash : 'solid', arrowStart: arrow === 'both', arrowEnd: arrow !== 'none', label: String(l.label || ''), bend: null };
  }).filter(Boolean);
  extra.colors = colors;
  return { p, extra };
}

function openAIProject(d) {
  const { p, extra } = buildFromAI(d);
  addProject(p);                         // 套配色＋排版
  for (const id in extra.colors) Object.assign(P.nodes[id], extra.colors[id]);
  P.links.push(...extra.links);
  // 獨立框：有給位置就用，沒給就排在心智圖上方
  const ids = new Set(Object.keys(P.nodes).filter(id => !isFree(P.nodes[id])));
  const b = contentBounds(ids);
  let x = b.x;
  extra.boxes.forEach(bx => {
    const n = P.nodes[bx.id];
    Object.assign(n, { borderColor: '#0ea5e9', fillColor: tintFill('#0ea5e9', 1), lineColor: '#0ea5e9', fontColor: textCol(), ...(extra.colors[bx.id] || {}) });
    nodeBox(n);
    if (bx.x != null && bx.y != null) { n.x = bx.x; n.y = bx.y; }
    else { n.x = x + n.width / 2; n.y = b.y - 70 - n.height / 2; x += n.width + 40; }
  });
  LAY.clear(); layoutAndRender(); resetHistory(); syncPanel(); fitView(false); scheduleSave();
}

/* 判斷一包資料是什麼格式，開成新畫布 */
function importData(d, nameHint) {
  if (!d || typeof d !== 'object') throw new Error('不是物件');
  if (d.tree) { openAIProject(d); return; }
  const proj = d.app === 'mindmap-editor' && d.project ? d.project : (d.nodes && d.rootId ? d : null);
  if (proj) {
    if (!proj.nodes || !proj.nodes[proj.rootId || 'root']) throw new Error('找不到中心主題');
    const p = { ...newProject(proj.name), ...proj, id: uid('p') };
    p.rootId = p.rootId || 'root';
    p.links = Array.isArray(p.links) ? p.links.filter(l => l && l.a && l.b) : [];
    // 修補：補上缺少的樣式、讓 parentId 與 children 一致
    for (const id in p.nodes) {
      const n = p.nodes[id];
      p.nodes[id] = { ...BASE_STYLE, offsetX: 0, offsetY: 0, x: 0, y: 0, ...n, id, children: Array.isArray(n.children) ? n.children.filter(c => p.nodes[c]) : [] };
      p.nodes[id].fontFamily = fontKey(p.nodes[id].fontFamily);
      p.nodes[id].text = String(p.nodes[id].text ?? '');
    }
    for (const id in p.nodes) p.nodes[id].children.forEach(c => { p.nodes[c].parentId = id; });
    for (const id in p.nodes) { const n = p.nodes[id]; if (n.parentId && !p.nodes[n.parentId]) n.parentId = null; if (n.parentId && !p.nodes[n.parentId].children.includes(id)) p.nodes[n.parentId].children.push(id); if (!n.parentId && id !== p.rootId) n.side = 'free'; }
    p.nodes[p.rootId].parentId = null;
    LAY.clear(); addProject(p, true); return;
  }
  if (d.root) { addProject(fromOldNodes(d, nameHint || '匯入的心智圖'), true); layoutAndRender(); return; }
  throw new Error('看不懂的格式');
}

/* 使用者直接貼上 AI 回覆的文字（JSON 或 Markdown 大綱） */
function importAIText(text) {
  text = String(text || '').trim();
  if (!text) { toast('框框裡還沒有內容', 'warn'); return false; }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let body = fence ? fence[1] : text;
  const i = body.indexOf('{'), j = body.lastIndexOf('}');
  if (i >= 0 && j > i) {
    try { importData(JSON.parse(body.slice(i, j + 1))); toast('已開成新的畫布'); return true; }
    catch (e) {
      if (/^\s*[{[]/.test(body)) { toast('AI 給的格式有錯，請跟 AI 說：「請重新輸出合法的 JSON」', 'warn'); return false; }
    }
  }
  const md = fence && !/^\s*[{[]/.test(fence[1]) ? fence[1] : text;
  const t = parseMarkdown(md);
  if (t && t.children.length) { addProject(buildFromTree(t)); toast('已把大綱開成新的畫布'); return true; }
  toast('看不懂這段內容，請確認是 AI 給的心智圖 JSON 或大綱', 'warn');
  return false;
}

/* ---------- 給使用者看的：AI協作需知 ---------- */
function openAIGuide() {
  modal(`<div class="help ai-guide"><h2>🤝 AI協作需知</h2>
  <p>不想自己一格一格打字？可以請 AI 助理（ChatGPT、Claude、Gemini 等）幫你做好整張心智圖，再匯入這個工具繼續編輯、列印、上課投影。</p>

  <h3>做一張新的心智圖：三個步驟</h3>
  <ol class="steps">
    <li>按上方「<b>📜 給AI的提示詞</b>」，<b>下載</b>提示詞檔案（或按「複製」）。</li>
    <li>打開 AI 助理，<b>把提示詞檔案丟進去</b>（或貼上），再用一般的話說你要什麼，例如：<br>
      <span class="say">「幫我做三年級〈小水滴的旅行〉課文結構心智圖，分起因、經過、結果，每段 2～3 個重點，結果那層挖空，全部加注音。」</span></li>
    <li>AI 會給你一個 <b>.json 檔</b>：按上方「📂 開啟檔案」選它。<br>
      如果 AI 給的是一大段文字（程式碼），就全部複製，貼到下面的框框，按「開成新畫布」。</li>
  </ol>

  <h3>修改已經做好的心智圖</h3>
  <ol class="steps">
    <li>在工具裡按「💾 存成檔案」，得到 .json 檔。</li>
    <li>把<b>提示詞檔＋這個 .json 檔</b>一起丟給 AI，說要改哪裡，例如「每個分支再多加一個例子」「把第二層全部挖空」「改成五年級的用字」。</li>
    <li>拿到 AI 改好的檔案，用「📂 開啟檔案」打開（會開在新分頁，原本的不會被蓋掉）。</li>
  </ol>

  <h3>可以這樣跟 AI 說</h3>
  <ul>
    <li>「主題：植物的身體，分根、莖、葉、花、果實、種子，每個寫功能和例子，用森林配色。」</li>
    <li>「把這課的生字『學、校、園』各做一個分支：注音、部首、造詞兩個，造詞挖空。」</li>
    <li>「做『情緒小偵探』：開心、生氣、難過、害怕，每個寫身體感覺和可以怎麼做，加表情符號。」</li>
    <li>「比較青蛙和蟾蜍的相同點和不同點，用連結線標出『相同』。」</li>
  </ul>

  <h3>要注意</h3>
  <ul>
    <li>AI 偶爾會寫錯，<b>匯入後請檢查內容</b>；注音的破音字可以點方塊自己修改。</li>
    <li><b>不要把學生的姓名、個資</b>給 AI。</li>
    <li>匯入失敗時，跟 AI 說「<b>請重新輸出合法的 JSON</b>」，再試一次。</li>
    <li>想要更快：也可以請 AI 只給「Markdown 大綱」，一樣貼到下面的框框。</li>
  </ul>

  <h3>📋 貼上 AI 給的內容</h3>
  <textarea class="code" id="ai-paste" placeholder="把 AI 回覆的 JSON（或大綱）整段貼在這裡"></textarea>
  </div>
  <div class="actions">
    <button class="btn" id="ai-to-prompt">📜 打開給AI的提示詞</button>
    <button class="btn" data-x>關閉</button>
    <button class="btn primary" id="ai-go">開成新畫布</button>
  </div>`, m => {
    $('#ai-go', m).onclick = () => { if (importAIText($('#ai-paste', m).value)) closeModal(); };
    $('#ai-to-prompt', m).onclick = () => openAIPrompt();
  });
}

/* ---------- 給 AI 的提示詞 ---------- */
function openAIPrompt() {
  modal(`<h2>📜 給AI的提示詞</h2>
  <p>這份文字是寫給 AI 看的「說明書」，裡面寫好了這個工具的檔案格式。<b>下載後直接丟給 AI</b>，再說你想要的心智圖內容，AI 就能做出可以匯入的專案檔。</p>
  <div class="actions" style="justify-content:flex-start;margin-top:4px">
    <button class="btn primary" id="ap-dl">⬇️ 下載提示詞檔案</button>
    <button class="btn" id="ap-copy">📋 複製全部文字</button>
    <button class="btn" id="ap-guide">🤝 看AI協作需知</button>
  </div>
  <p class="hint">不知道怎麼用？請看「🤝 AI協作需知」。以下是提示詞內容預覽：</p>
  <textarea class="code" id="ap-text" readonly style="min-height:320px">讀取中…</textarea>
  <div class="actions"><button class="btn" data-x>關閉</button></div>`, m => {
    loadAIPrompt().then(t => { const ta = $('#ap-text', m); if (ta) ta.value = t; })
      .catch(() => { const ta = $('#ap-text', m); if (ta) ta.value = '提示詞讀取失敗，請確認網路連線後重新打開。'; });
    $('#ap-dl', m).onclick = () => loadAIPrompt().then(t => { download('給AI的提示詞_心智圖工具.md', new Blob([t], { type: 'text/markdown;charset=utf-8' })); toast('已下載提示詞檔案'); }).catch(() => toast('下載失敗，請檢查網路', 'warn'));
    $('#ap-copy', m).onclick = () => loadAIPrompt().then(t => {
      const done = () => toast('已複製，可以直接貼給 AI');
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, () => { const ta = $('#ap-text', m); ta.select(); document.execCommand('copy'); done(); });
      else { const ta = $('#ap-text', m); ta.select(); document.execCommand('copy'); done(); }
    });
    $('#ap-guide', m).onclick = () => openAIGuide();
  });
}

ACTIONS['ai-guide'] = openAIGuide;
ACTIONS['ai-prompt'] = openAIPrompt;
