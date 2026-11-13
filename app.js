'use strict';
/* =========================================================
   心智圖編輯器 v2
   - 多畫布、自動存檔(localStorage)、觸控/滑鼠/觸控筆
   - 自由連結線（端點可吸附方塊，也可拖開分離）
   - 一鍵套色、範本、圖片/表情符號/注音、挖空學習單
   - 列印 A4/A3、上課投影模式（逐支/逐層出現）
   ========================================================= */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const STORE_KEY = 'mindmap-editor-v2';
const APP_NAME = 'Andice的心智圖工具';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p = 'n') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = o => JSON.parse(JSON.stringify(o));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------------- 字型與樣式 ---------------- */
const FONT_STACK = {
  sans: '"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif',
  kai: '"LXGW WenKai TC","BiauKai","DFKai-SB","標楷體","Kaiti TC",serif',
  serif: '"Noto Serif TC","PMingLiU","Songti TC",serif'
};
function fontKey(f) {
  if (!f) return 'sans';
  if (FONT_STACK[f]) return f;
  if (/kai|楷/i.test(f)) return 'kai';
  if (/georgia|serif|明/i.test(f) && !/sans/i.test(f)) return 'serif';
  return 'sans';
}
const STYLE_KEYS = ['shape', 'fillColor', 'borderColor', 'borderWidth', 'borderStyle', 'fontSize', 'fontFamily', 'fontColor',
  'isBold', 'isItalic', 'isUnderline', 'lineType', 'lineColor', 'lineWidth', 'lineStyle', 'arrowEnd', 'writingMode'];
const BASE_STYLE = {
  shape: 'rounded-rect', fillColor: '#ffffff', borderColor: '#94a3b8', borderWidth: 2, borderStyle: 'solid',
  fontSize: 16, fontFamily: 'sans', fontColor: '#1e293b', isBold: false, isItalic: false, isUnderline: false,
  lineType: 'curve', lineColor: '#94a3b8', lineWidth: 2, lineStyle: 'solid', arrowEnd: false, writingMode: 'horizontal'
};
const LEVEL_STYLE = [
  { shape: 'capsule', fillColor: '#ffffff', borderColor: '#4f46e5', borderWidth: 4, fontSize: 24, isBold: true, lineColor: '#4f46e5', lineWidth: 4 },
  { shape: 'rounded-rect', fillColor: '#eef2ff', borderColor: '#6366f1', borderWidth: 3, fontSize: 19, isBold: true, lineColor: '#6366f1', lineWidth: 3 },
  { shape: 'rounded-rect', fillColor: '#f8fafc', borderColor: '#a5b4fc', borderWidth: 2, fontSize: 16, isBold: false, lineColor: '#a5b4fc', lineWidth: 2 }
];
const PALETTES = [
  { id: 'rainbow', name: '繽紛彩虹', colors: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'], root: '#1e293b' },
  { id: 'candy', name: '馬卡龍', colors: ['#f472b6', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#fb923c', '#2dd4bf', '#f87171'], root: '#7c3aed' },
  { id: 'ocean', name: '海洋藍綠', colors: ['#0284c7', '#0d9488', '#2563eb', '#0891b2', '#4f46e5', '#059669'], root: '#0c4a6e' },
  { id: 'forest', name: '森林大地', colors: ['#15803d', '#b45309', '#65a30d', '#a16207', '#047857', '#9a3412'], root: '#3f3f2e' },
  { id: 'warm', name: '溫暖秋日', colors: ['#d9622b', '#c2410c', '#b7791f', '#9c4a2f', '#e07a5f', '#8a6d3b', '#cc5a71', '#a8572a'], root: '#7a3e1d' },
  { id: 'mono', name: '黑白列印', colors: ['#334155'], root: '#0f172a', mono: true },
  { id: 'indigo', name: '原本的紫色', colors: ['#6366f1'], root: '#4f46e5' }
];
const EMOJIS = ['⭐', '💡', '❓', '❗', '✅', '❌', '📖', '✏️', '🎯', '🔑', '❤️', '😊', '😢', '😡', '🤔', '👍', '🏫', '👦', '👧', '👨‍🏫', '🌳', '🌸', '☀️', '🌧️', '🐶', '🐱', '🍎', '🚗', '🏠', '⏰'];

function mix(hex, t, to = '#ffffff') { // t=0 原色, t=1 目標色
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const a = p(normHex(hex)), b = p(to);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
/* 介面主題：淺色／深色／溫暖 */
const THEMES = {
  light: { name: '淺色', icon: '☀️', bg: '#f8fafc' },
  dark: { name: '深色', icon: '🌙', bg: '#0f172a' },
  warm: { name: '溫暖', icon: '🍂', bg: '#fdf6ec' }
};
let uiTheme = 'light';
try { uiTheme = localStorage.getItem('mindmap-editor-theme') || 'light'; } catch (e) { }
if (!THEMES[uiTheme]) uiTheme = 'light';
document.body.dataset.theme = uiTheme;
const darkUI = () => uiTheme === 'dark';
function tintFill(col, lv) { return darkUI() ? mix(col, lv <= 1 ? 0.7 : 0.8, '#0f172a') : mix(col, lv <= 1 ? 0.84 : 0.93); }
const textCol = () => darkUI() ? '#f1f5f9' : (uiTheme === 'warm' ? '#4a2f1d' : '#1e293b');
function normHex(h) {
  if (!h || typeof h !== 'string') return '#000000';
  if (/^#[0-9a-f]{3}$/i.test(h)) return '#' + [...h.slice(1)].map(c => c + c).join('');
  if (/^#[0-9a-f]{6}$/i.test(h)) return h.toLowerCase();
  return '#000000';
}

/* ---------------- 狀態 ---------------- */
let state = { projects: [], activeId: null };
let P = null;                 // 目前畫布
let selNodes = new Set();     // 選取的方塊
let selLink = null;           // 選取的連結線 id
let view = { x: 0, y: 0, z: 1 };
let drawMode = false, multiMode = false, boxMode = false;
let presenting = false, pState = null;
let hist = [], hi = -1;
const LAY = new Map();        // 文字排版快取（不存檔）

function newProject(name) {
  return { id: uid('p'), name: name || '新的心智圖', rootId: 'root', nodes: {}, links: [], bg: THEMES[uiTheme].bg, grid: true, palette: uiTheme === 'warm' ? 'warm' : 'rainbow', updated: Date.now() };
}
function projectData(p) {
  return { id: p.id, name: p.name, rootId: p.rootId, nodes: p.nodes, links: p.links, bg: p.bg, grid: p.grid, palette: p.palette, updated: p.updated };
}
const N = id => P.nodes[id];
const root = () => P.nodes[P.rootId];
function level(id) { let l = 0, n = N(id); while (n && n.parentId) { l++; n = N(n.parentId); } return n && n.id === P.rootId ? l : -1; }
function isFree(n) { return n.id !== P.rootId && !n.parentId; }
function descendants(id, out = []) { const n = N(id); if (!n) return out; (n.children || []).forEach(c => { if (N(c)) { out.push(c); descendants(c, out); } }); return out; }
function branchTop(id) { let n = N(id); while (n && n.parentId && n.parentId !== P.rootId) n = N(n.parentId); return n; }

function makeNode(text, parentId, side, lvl) {
  const st = { ...BASE_STYLE, ...LEVEL_STYLE[Math.min(lvl, 2)] };
  return { id: uid(), text, parentId: parentId || null, children: [], side: side || 'right', ...st, offsetX: 0, offsetY: 0, x: 0, y: 0 };
}

/* 從範本樹建立 */
function buildFromTree(tree) {
  const p = newProject(tree.text.split('\n')[0]);
  const r = makeNode(tree.text, null, 'center', 0); r.id = 'root'; p.nodes.root = r;
  let alt = 0;
  const add = (t, parent, side, lvl) => {
    const n = makeNode(t.text, parent.id, side, lvl);
    p.nodes[n.id] = n; parent.children.push(n.id);
    (t.children || []).forEach(c => add(c, n, side, lvl + 1));
  };
  (tree.children || []).forEach(c => { const side = c.side || (alt++ % 2 === 0 ? 'right' : 'left'); add(c, r, side, 1); });
  return p;
}

/* 舊版 CodePen 的 .json（整包 nodes）轉成新版 */
function fromOldNodes(obj, name) {
  const p = newProject(name);
  p.palette = null;
  for (const id in obj) {
    const o = obj[id];
    if (!o || typeof o !== 'object') continue;
    const n = { ...BASE_STYLE, ...o };
    n.id = id; n.children = Array.isArray(o.children) ? o.children.filter(c => obj[c]) : [];
    n.fontFamily = fontKey(o.fontFamily);
    n.offsetX = o.offsetX || 0; n.offsetY = o.offsetY || 0;
    p.nodes[id] = n;
  }
  if (!p.nodes.root) throw new Error('no root');
  // 舊版是深色主題：深色底的方塊保留原色即可在淺色畫布上看清楚
  return p;
}

/* ---------------- 注音 ---------------- */
const ZY = { dict: null, loading: false, ready: false };
function loadZhuyin() {
  if (ZY.ready || ZY.loading) return;
  ZY.loading = true;
  toast('注音字典下載中，第一次會比較久…');
  fetch('zhuyin-dict.json').then(r => r.json()).then(d => {
    ZY.dict = d; ZY.ready = true; LAY.clear(); layoutAndRender(); syncPanel(); toast('注音準備好了');
  }).catch(() => { ZY.loading = false; toast('注音字典下載失敗，請檢查網路後再試一次', 'warn'); });
}
const ZY_PREF = { '的': '˙ㄉㄜ', '了': '˙ㄌㄜ', '個': 'ㄍㄜˋ', '和': 'ㄏㄜˊ', '他': 'ㄊㄚ', '誰': 'ㄕㄟˊ', '哪': 'ㄋㄚˇ', '造': 'ㄗㄠˋ', '我': 'ㄨㄛˇ', '三': 'ㄙㄢ', '與': 'ㄩˇ', '上': 'ㄕㄤˋ', '會': 'ㄏㄨㄟˋ', '著': '˙ㄓㄜ', '嗎': '˙ㄇㄚ', '呢': '˙ㄋㄜ', '啊': '˙ㄚ', '吧': '˙ㄅㄚ', '們': '˙ㄇㄣ', '子': 'ㄗˇ', '麼': '˙ㄇㄜ', '什': 'ㄕㄣˊ', '不': 'ㄅㄨˋ', '一': 'ㄧ', '都': 'ㄉㄡ', '打': 'ㄉㄚˇ', '好': 'ㄏㄠˇ', '看': 'ㄎㄢˋ', '這': 'ㄓㄜˋ', '說': 'ㄕㄨㄛ', '要': 'ㄧㄠˋ', '家': 'ㄐㄧㄚ', '長': 'ㄔㄤˊ', '比': 'ㄅㄧˇ', '較': 'ㄐㄧㄠˋ', '為': 'ㄨㄟˋ', '行': 'ㄒㄧㄥˊ', '得': 'ㄉㄜˊ', '地': 'ㄉㄧˋ', '樂': 'ㄌㄜˋ', '中': 'ㄓㄨㄥ', '大': 'ㄉㄚˋ', '還': 'ㄏㄞˊ', '只': 'ㄓˇ', '那': 'ㄋㄚˋ', '看': 'ㄎㄢˋ', '少': 'ㄕㄠˇ', '分': 'ㄈㄣ', '相': 'ㄒㄧㄤ', '同': 'ㄊㄨㄥˊ', '方': 'ㄈㄤ', '點': 'ㄉㄧㄢˇ', '特': 'ㄊㄜˋ' };
const zyPick = v => Array.isArray(v) ? v[0] : (typeof v === 'string' ? v : '');
const isHan = ch => /[㐀-鿿豈-﫿]/.test(ch);
function autoZhuyin(text) { // 回傳每個漢字的注音（依序）
  const out = [];
  const chars = Array.from(text);
  let i = 0;
  while (i < chars.length) {
    if (!isHan(chars[i])) { i++; continue; }
    let done = false;
    for (let L = Math.min(8, chars.length - i); L >= 2; L--) {
      const seg = chars.slice(i, i + L);
      if (!seg.every(isHan)) continue;
      const v = zyPick(ZY.dict[seg.join('')]);
      if (v) { const sy = v.split(/\s+/); if (sy.length === L) { out.push(...sy); i += L; done = true; break; } }
    }
    if (!done) { const v = ZY_PREF[chars[i]] || zyPick(ZY.dict[chars[i]]); out.push(v ? v.split(/\s+/)[0] : ''); i++; }
  }
  return out;
}
function nodeZhuyin(n) {
  const auto = autoZhuyin(n.text || '');
  if (n.zyOverride) {
    const o = n.zyOverride.trim().split(/\s+/);
    if (o.length === auto.length) return o;
  }
  return auto;
}

/* ---------------- 文字排版 ---------------- */
const mctx = document.createElement('canvas').getContext('2d');
function fontCss(n, fs) { return `${n.isItalic ? 'italic ' : ''}${n.isBold ? 700 : 400} ${fs}px ${FONT_STACK[fontKey(n.fontFamily)]}`; }
function measure(n, s, fs) { mctx.font = fontCss(n, fs); return mctx.measureText(s).width; }
const isWide = ch => /[⺀-鿿豈-﫿＀-￯　-〿]/.test(ch) || /\p{Extended_Pictographic}/u.test(ch);

function layoutText(n) {
  const fs = n.fontSize || 16;
  const zyOn = !!(n.zhuyin && ZY.ready);
  const key = [n.text, n.emoji, fs, n.fontFamily, n.isBold, n.isItalic, n.writingMode, zyOn, n.zyOverride].join('|');
  const c = LAY.get(n.id);
  if (c && c.key === key) return c;
  const zys = zyOn ? nodeZhuyin(n) : [];
  let zi = 0;
  const zw = fs * 0.62, zfs = fs * 0.52;
  const vertical = n.writingMode === 'vertical';
  const lines = (n.text || '').split('\n');
  if (n.emoji) lines[0] = n.emoji + (lines[0] ? ' ' + lines[0] : '');
  const rows = lines.map(line => {
    const cells = [];
    let run = '';
    const flush = () => { if (run) { cells.push({ t: run, w: measure(n, run, fs), zy: '' }); run = ''; } };
    Array.from(line).forEach(ch => {
      if (vertical || isWide(ch)) {
        flush();
        const zy = isHan(ch) && zyOn ? (zys[zi++] || '') : (isHan(ch) && n.zhuyin ? (zi++, '') : '');
        cells.push({ t: ch, w: isWide(ch) ? fs : measure(n, ch, fs), zy, han: isHan(ch) });
      } else run += ch;
    });
    flush();
    return cells;
  });
  // 如果文字是由漢字分開的情形，非漢字 run 不會吃掉注音序號（autoZhuyin 只算漢字）
  const items = [];
  let W = 0, H = 0;
  if (!vertical) {
    const lh = fs * (zyOn ? 1.7 : 1.36);
    const rowW = rows.map(cells => cells.reduce((s, c) => s + c.w + (zyOn && c.han ? zw : 0), 0));
    W = Math.max(fs, ...rowW); H = Math.max(1, rows.length) * lh;
    rows.forEach((cells, ri) => {
      let x = -rowW[ri] / 2;
      const y = -H / 2 + lh * ri + lh / 2;
      cells.forEach(cl => {
        items.push({ t: cl.t, x: x + cl.w / 2, y, w: cl.w, zy: cl.zy, han: cl.han });
        x += cl.w + (zyOn && cl.han ? zw : 0);
      });
      if (n.isUnderline && cells.length) items.push({ ul: true, x1: -rowW[ri] / 2, x2: rowW[ri] / 2, y: y + fs * 0.62 });
    });
  } else {
    const cw = fs * 1.36 + (zyOn ? zw : 0), ch = fs * 1.12;
    const colH = rows.map(cells => cells.length * ch);
    W = Math.max(1, rows.length) * cw; H = Math.max(fs, ...colH);
    rows.forEach((cells, ci) => {
      const x = W / 2 - cw * ci - cw / 2 - (zyOn ? zw / 2 : 0);
      let y = -H / 2 + ch / 2;
      cells.forEach(cl => { items.push({ t: cl.t, x, y, w: fs, zy: cl.zy, han: cl.han }); y += ch; });
    });
  }
  const res = { key, w: W, h: H, items, fs, zw, zfs };
  LAY.set(n.id, res);
  return res;
}

function nodeBox(n) { // 計算方塊大小與內容位置
  const L = layoutText(n);
  const fs = n.fontSize || 16;
  const padX = Math.max(14, fs * 0.8), padY = Math.max(10, fs * 0.55);
  let imgW = 0, imgH = 0;
  if (n.image) { const s = Math.min(1, 160 / n.image.w, 120 / n.image.h); imgW = n.image.w * s; imgH = n.image.h * s; }
  const hasText = !!(n.text || n.emoji);
  const gap = imgH && hasText ? 8 : 0;
  const cw = Math.max(hasText ? L.w : 0, imgW), chh = (hasText ? L.h : 0) + imgH + gap;
  let w = Math.max(n.writingMode === 'vertical' ? 56 : 80, cw + padX * 2), h = Math.max(fs + padY * 2, chh + padY * 2);
  if (n.shape === 'ellipse') { w *= 1.22; h *= 1.25; }
  if (n.shape === 'capsule') w += h * 0.3;
  if (!n.customResized) { n.width = Math.round(w); n.height = Math.round(h); }
  return { L, imgW, imgH, gap, contentH: chh, hasText };
}

/* ---------------- 自動排版 ---------------- */
function autoLayout(resetOffsets) {
  const r = root();
  if (!r) return;
  for (const id in P.nodes) {
    nodeBox(P.nodes[id]);
    if (resetOffsets && !isFree(P.nodes[id])) { P.nodes[id].offsetX = 0; P.nodes[id].offsetY = 0; }
  }
  r.x = 0; r.y = 0;
  const L = [], R = [];
  r.children.forEach(c => { const n = N(c); if (n) (n.side === 'left' ? L : R).push(c); });
  layoutHalf(L, -1); layoutHalf(R, 1);
}
function layoutHalf(ids, dir) {
  const vg = 22, hg = 64, r = root();
  const H = {};
  const sub = id => {
    const n = N(id);
    const kids = (n.children || []).filter(c => N(c));
    if (n.isCollapsed || !kids.length) return (H[id] = n.height);
    let s = 0; kids.forEach(c => s += sub(c)); s += (kids.length - 1) * vg;
    return (H[id] = Math.max(n.height, s));
  };
  ids.forEach(sub);
  let total = ids.reduce((s, id) => s + H[id], 0) + Math.max(0, ids.length - 1) * vg * 1.6;
  let y = -total / 2;
  const place = (id, edgeX, top) => {
    const n = N(id);
    n.side = dir < 0 ? 'left' : 'right';
    n.x = edgeX + dir * n.width / 2; n.y = top + H[id] / 2;
    if (n.isCollapsed) return;
    const kids = (n.children || []).filter(c => N(c));
    let cy = top + (H[id] - (kids.reduce((s, c) => s + H[c], 0) + Math.max(0, kids.length - 1) * vg)) / 2;
    kids.forEach(c => { place(c, n.x + dir * (n.width / 2 + hg), cy); cy += H[c] + vg; });
  };
  ids.forEach(id => { place(id, dir * (r.width / 2 + hg + 20), y); y += H[id] + vg * 1.6; });
}
const PX = n => n.x + (n.offsetX || 0);
const PY = n => n.y + (n.offsetY || 0);

/* ---------------- 顯示判斷 ---------------- */
function visibleSet() {
  const vis = new Set();
  const r = root();
  if (!r) return vis;
  if (presenting && pState) {
    for (const id in P.nodes) if (pState.shown.has(id) || (isFree(N(id)) && pState.showFree)) vis.add(id);
    return vis;
  }
  const walk = id => { const n = N(id); if (!n) return; vis.add(id); if (!n.isCollapsed) (n.children || []).forEach(walk); };
  walk(r.id);
  for (const id in P.nodes) if (isFree(N(id))) { vis.add(id); if (!N(id).isCollapsed) (N(id).children || []).forEach(walk); }
  return vis;
}

/* ---------------- SVG 產生 ---------------- */
function dashFor(style, w) { return style === 'dashed' ? `${w * 3 + 4},${w * 2 + 4}` : style === 'dotted' ? `${Math.max(1, w * 0.4)},${w * 1.6 + 3}` : ''; }
function markerId(color) { return 'mk' + normHex(color).slice(1); }
function markerDef(color) {
  return `<marker id="${markerId(color)}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M0,0 L10,5 L0,10 z" fill="${normHex(color)}"/></marker>`;
}
function nodeRect(n) { return { x: PX(n) - n.width / 2, y: PY(n) - n.height / 2, w: n.width, h: n.height }; }

function tlineStyle(p, c) { // 分支連線的樣式：線自己的設定優先，否則用上一層方塊的設定
  const il = c.inLine || {};
  return { color: il.color || p.lineColor, width: il.width || p.lineWidth || 2, dash: il.dash || p.lineStyle, type: il.type || p.lineType, arrowEnd: il.arrowEnd ?? p.arrowEnd, label: il.label || '' };
}
function treeEnds(p, c) {
  const px = PX(p), py = PY(p), cx = PX(c), cy = PY(c);
  const left = cx < px;
  return { sx: px + (left ? -1 : 1) * p.width / 2, ex: cx + (left ? 1 : -1) * c.width / 2, py, cy, left };
}
function treePath(p, c, type) {
  const { sx, ex, py, cy, left } = treeEnds(p, c);
  type = type || p.lineType;
  if (type === 'straight') return `M${sx},${py} L${ex},${cy}`;
  if (type === 'elbow') { const mx = (sx + ex) / 2; return `M${sx},${py} L${mx},${py} L${mx},${cy} L${ex},${cy}`; }
  const off = Math.abs(ex - sx) * 0.55, d = left ? -1 : 1;
  return `M${sx},${py} C${sx + d * off},${py} ${ex - d * off},${cy} ${ex},${cy}`;
}

// 由節點中心往 (tx,ty) 方向，求與外框的交點
function clipToBox(n, tx, ty, pad = 3) {
  const cx = PX(n), cy = PY(n), hw = n.width / 2 + pad, hh = n.height / 2 + pad;
  const dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  if (n.shape === 'ellipse') { const t = 1 / Math.sqrt((dx * dx) / (hw * hw) + (dy * dy) / (hh * hh)); return { x: cx + dx * t, y: cy + dy * t }; }
  const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return { x: cx + dx * t, y: cy + dy * t };
}
function endRef(e) { const n = e.node && N(e.node); return n ? { x: PX(n), y: PY(n) } : { x: e.x, y: e.y }; }
function linkGeom(l) {
  const ra = endRef(l.a), rb = endRef(l.b);
  const mid = { x: (ra.x + rb.x) / 2, y: (ra.y + rb.y) / 2 };
  const h = l.bend ? { x: mid.x + l.bend.x, y: mid.y + l.bend.y } : null;
  const ctrl = h ? { x: 2 * h.x - mid.x, y: 2 * h.y - mid.y } : null;
  const na = l.a.node && N(l.a.node), nb = l.b.node && N(l.b.node);
  const A = na ? clipToBox(na, ctrl ? ctrl.x : rb.x, ctrl ? ctrl.y : rb.y, l.arrowStart ? 4 : 2) : ra;
  const B = nb ? clipToBox(nb, ctrl ? ctrl.x : ra.x, ctrl ? ctrl.y : ra.y, l.arrowEnd ? 4 : 2) : rb;
  const C = ctrl ? { x: 2 * h.x - (A.x + B.x) / 2, y: 2 * h.y - (A.y + B.y) / 2 } : null;
  const d = C ? `M${A.x},${A.y} Q${C.x},${C.y} ${B.x},${B.y}` : `M${A.x},${A.y} L${B.x},${B.y}`;
  const M = C ? { x: 0.25 * A.x + 0.5 * C.x + 0.25 * B.x, y: 0.25 * A.y + 0.5 * C.y + 0.25 * B.y } : { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  return { A, B, M, d };
}

function zhuyinSVG(it, L, color) {
  let s = it.zy; if (!s) return '';
  let neutral = false, tone = '';
  if (s[0] === '˙') { neutral = true; s = s.slice(1); }
  if (/[ˊˇˋ]$/.test(s)) { tone = s.slice(-1); s = s.slice(0, -1); }
  const syms = Array.from(s), zfs = L.zfs, step = zfs * 0.86;
  const colX = it.x + it.w / 2 + L.zw * 0.4;
  const y0 = it.y - (syms.length - 1) * step / 2;
  let out = '';
  syms.forEach((c, i) => { out += `<text x="${colX}" y="${y0 + i * step}" font-size="${zfs}" text-anchor="middle" dominant-baseline="central" fill="${color}">${esc(c)}</text>`; });
  if (tone) out += `<text x="${colX + zfs * 0.62}" y="${y0 + (syms.length - 1) * step - zfs * 0.45}" font-size="${zfs}" text-anchor="middle" dominant-baseline="central" fill="${color}">${tone}</text>`;
  if (neutral) out += `<text x="${colX}" y="${y0 - step * 0.85}" font-size="${zfs}" text-anchor="middle" dominant-baseline="central" fill="${color}">˙</text>`;
  return out;
}

/* opts: { exportMode, worksheet:Set|null(要挖空的id), ink(省墨) } */
function buildSVG(opts = {}) {
  const vis = visibleSet();
  const markers = new Set();
  let lines = '', links = '', nodes = '', labels = '';
  const blankIds = opts.worksheet || null;
  // 樹狀連線
  for (const id of vis) {
    const c = N(id);
    if (!c.parentId || c.hideLine) continue;
    const p = N(c.parentId);
    if (!p || !vis.has(p.id)) continue;
    const st = tlineStyle(p, c);
    const col = opts.mono ? '#334155' : normHex(st.color);
    let attrs = `stroke="${col}" stroke-width="${st.width}" fill="none" stroke-linecap="round"`;
    const da = dashFor(st.dash, st.width); if (da) attrs += ` stroke-dasharray="${da}"`;
    if (st.arrowEnd) { markers.add(col); attrs += ` marker-end="url(#${markerId(col)})"`; }
    const d = treePath(p, c, st.type);
    if (!opts.exportMode && !presenting) lines += `<path class="hit" data-tline="${c.id}" d="${d}" stroke="transparent" stroke-width="${Math.max(16, 20 / view.z)}" fill="none"/>`;
    lines += `<path d="${d}" ${attrs} pointer-events="none"/>`;
    if (st.label) {
      const e = treeEnds(p, c), mx = (e.sx + e.ex) / 2, my = (e.py + e.cy) / 2;
      const fs = 15, tw = Math.max(20, measure({ isBold: true }, st.label, fs)) + 14;
      labels += `<g data-tline="${c.id}"><rect x="${mx - tw / 2}" y="${my - 13}" width="${tw}" height="26" rx="13" fill="#ffffff" stroke="${col}" stroke-width="1.5"/><text x="${mx}" y="${my}" font-size="${fs}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="${col}" font-family='${FONT_STACK.sans}' pointer-events="none">${esc(st.label)}</text></g>`;
    }
  }
  // 自由連結線
  P.links.forEach(l => {
    if ((l.a.node && !vis.has(l.a.node)) || (l.b.node && !vis.has(l.b.node))) return;
    if (presenting && pState && !pState.showLinks) return;
    const g = linkGeom(l);
    const col = normHex(l.color || '#475569'), w = l.width || 3;
    let attrs = `stroke="${col}" stroke-width="${w}" fill="none" stroke-linecap="round"`;
    const da = dashFor(l.dash, w); if (da) attrs += ` stroke-dasharray="${da}"`;
    if (l.arrowEnd) { markers.add(col); attrs += ` marker-end="url(#${markerId(col)})"`; }
    if (l.arrowStart) { markers.add(col); attrs += ` marker-start="url(#${markerId(col)})"`; }
    let s = `<g data-link="${l.id}">`;
    if (!opts.exportMode) s += `<path class="hit" d="${g.d}" stroke="transparent" stroke-width="${Math.max(18, 22 / view.z)}" fill="none"/>`;
    s += `<path d="${g.d}" ${attrs} pointer-events="none"/>`;
    if (l.label) {
      const fs = 15, tw = Math.max(20, measure({ isBold: true }, l.label, fs)) + 14;
      labels += `<g data-link="${l.id}"><rect x="${g.M.x - tw / 2}" y="${g.M.y - 13}" width="${tw}" height="26" rx="13" fill="#ffffff" stroke="${col}" stroke-width="1.5"/>`;
      labels += `<text x="${g.M.x}" y="${g.M.y}" font-size="${fs}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="${col}" font-family='${FONT_STACK.sans}' pointer-events="none">${esc(l.label)}</text></g>`;
    }
    links += s + '</g>';
  });
  // 方塊
  for (const id of vis) {
    const n = N(id);
    const b = nodeBox(n);
    const x = PX(n), y = PY(n), w = n.width, h = n.height;
    const fill = opts.ink ? '#ffffff' : n.fillColor, stroke = opts.mono ? '#334155' : n.borderColor;
    const fcol = opts.ink && !isDark(n.fontColor) ? '#1e293b' : n.fontColor;
    let shape = '';
    const bw = n.borderWidth ?? 2;
    let sa = n.shape === 'none' ? 'fill="transparent" stroke="none"' : `fill="${fill}" stroke="${stroke}" stroke-width="${bw}"`;
    const da = n.shape !== 'none' && dashFor(n.borderStyle, Math.max(1, bw)); if (da) sa += ` stroke-dasharray="${da}"`;
    if (n.shape === 'ellipse') shape = `<ellipse cx="${x}" cy="${y}" rx="${w / 2}" ry="${h / 2}" ${sa}/>`;
    else {
      const rx = n.shape === 'capsule' ? h / 2 : n.shape === 'rounded-rect' ? Math.min(14, h / 3) : n.shape === 'rect' ? 3 : 0;
      shape = `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${rx}" ${sa}/>`;
    }
    let inner = '';
    const top = y - b.contentH / 2;
    if (n.image) inner += `<image href="${n.image.src}" x="${x - b.imgW / 2}" y="${top}" width="${b.imgW}" height="${b.imgH}" preserveAspectRatio="xMidYMid meet"/>`;
    const ty = top + b.imgH + b.gap + b.L.h / 2;
    const isBlankWs = blankIds && blankIds.has(id);
    const pres = presenting && pState && n.blank && !pState.revealed.has(id);
    if (pres) {
      inner += `<text x="${x}" y="${ty}" font-size="${Math.max(24, (n.fontSize || 16) * 1.4)}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="${fcol}" font-family='${FONT_STACK.sans}'>？</text>`;
    } else if (!isBlankWs && b.hasText) {
      const ff = FONT_STACK[fontKey(n.fontFamily)];
      const fw = n.isBold ? 700 : 400, fst = n.isItalic ? 'italic' : 'normal';
      const op = (!opts.exportMode && n.blank) ? ' opacity="0.5"' : '';
      inner += `<g font-family='${ff}' font-weight="${fw}" font-style="${fst}" fill="${fcol}"${op}>`;
      b.L.items.forEach(it => {
        if (it.ul) { inner += `<line x1="${x + it.x1}" x2="${x + it.x2}" y1="${ty + it.y}" y2="${ty + it.y}" stroke="${fcol}" stroke-width="${Math.max(1, b.L.fs / 14)}"/>`; return; }
        const it2 = { ...it, x: x + it.x, y: ty + it.y };
        inner += `<text x="${it2.x}" y="${it2.y}" font-size="${b.L.fs}" text-anchor="middle" dominant-baseline="central">${esc(it.t)}</text>`;
        if (it.zy) inner += zhuyinSVG(it2, b.L, fcol);
      });
      inner += '</g>';
    }
    if (!opts.exportMode && n.blank && !presenting) {
      inner += `<g pointer-events="none"><rect x="${x + w / 2 - 40}" y="${y - h / 2 - 12}" width="44" height="22" rx="11" fill="#f59e0b"/><text x="${x + w / 2 - 18}" y="${y - h / 2 - 1}" font-size="12" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="central" font-family='${FONT_STACK.sans}'>挖空</text></g>`;
    }
    // 收合按鈕
    const kids = (n.children || []).filter(c => N(c));
    if (!opts.exportMode && kids.length && !presenting) {
      const dir = n.id === P.rootId ? 0 : (n.side === 'left' ? -1 : 1);
      if (dir) {
        const bx = x + dir * (w / 2 + 13), r = 11;
        inner += `<g data-toggle="${id}" class="hit"><circle cx="${bx}" cy="${y}" r="${r + 6}" fill="transparent"/><circle cx="${bx}" cy="${y}" r="${r}" fill="#fff" stroke="${n.lineColor}" stroke-width="2"/>` +
          `<text x="${bx}" y="${y}" font-size="${n.isCollapsed ? 12 : 16}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="${n.lineColor}" font-family='${FONT_STACK.sans}'>${n.isCollapsed ? kids.length + descendants(id).length - kids.length : '−'}</text></g>`;
      }
    }
    if (presenting && pState && kids.some(c => !pState.shown.has(c))) {
      const dir = n.side === 'left' ? -1 : 1;
      const bx = x + dir * (w / 2 + 14);
      inner += `<g pointer-events="none"><circle cx="${bx}" cy="${y}" r="11" fill="${n.lineColor}"/><text x="${bx}" y="${y}" font-size="14" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family='${FONT_STACK.sans}'>+</text></g>`;
    }
    nodes += `<g data-node="${id}" class="node">${shape}${inner}</g>`;
  }
  let defs = '';
  markers.forEach(c => defs += markerDef(c));
  return { defs, lines, links, nodes: nodes + labels, vis };
}

/* ---------------- 畫面更新 ---------------- */
const svg = $('#svg');
let rafPending = false;
function render() {
  if (!P) return;
  const out = buildSVG({ mono: false });
  const dot = mix(P.bg || '#f8fafc', 0.82, '#000000');
  $('#defs').innerHTML = `<pattern id="grid-pat" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.5" fill="${P.grid ? (isDark(P.bg) ? '#ffffff22' : '#0f172a1f') : 'transparent'}"/></pattern>` + out.defs;
  $('#g-lines').innerHTML = out.lines;
  $('#g-links').innerHTML = out.links;
  $('#g-nodes').innerHTML = out.nodes;
  $('#g-ui').innerHTML = uiLayer(out.vis);
  $('#stage').style.background = P.bg || '#f8fafc';
  applyView();
  updateChrome();
}
function isDark(hex) { const h = normHex(hex); const v = parseInt(h.slice(1, 3), 16) * .299 + parseInt(h.slice(3, 5), 16) * .587 + parseInt(h.slice(5, 7), 16) * .114; return v < 128; }
function requestRender() { if (rafPending) return; rafPending = true; requestAnimationFrame(() => { rafPending = false; render(); }); }
function layoutAndRender(reset) { autoLayout(!!reset); render(); }

function uiLayer(vis) {
  if (presenting) return '';
  let s = '';
  const z = view.z;
  selNodes.forEach(id => {
    const n = N(id); if (!n || !vis.has(id)) return;
    const r = nodeRect(n), pad = 7 / z;
    s += `<rect x="${r.x - pad}" y="${r.y - pad}" width="${r.w + pad * 2}" height="${r.h + pad * 2}" rx="${12 / z}" fill="none" stroke="#4f46e5" stroke-width="${2.5 / z}" stroke-dasharray="${6 / z},${4 / z}" pointer-events="none"/>`;
  });
  if (selNodes.size === 1) {
    const n = N([...selNodes][0]);
    if (n && vis.has(n.id)) {
      const r = nodeRect(n), hs = 16 / z;
      s += `<g data-resize="${n.id}" class="handle"><rect x="${r.x + r.w - hs / 2}" y="${r.y + r.h - hs / 2}" width="${hs}" height="${hs}" rx="${4 / z}" fill="#4f46e5" stroke="#fff" stroke-width="${2 / z}"/><rect x="${r.x + r.w - hs}" y="${r.y + r.h - hs}" width="${hs * 2}" height="${hs * 2}" fill="transparent"/></g>`;
    }
  }
  if (selLink && selLink.startsWith('T:')) {
    const c = N(selLink.slice(2)), p = c && N(c.parentId);
    if (c && p && vis.has(c.id) && vis.has(p.id)) {
      const st = tlineStyle(p, c), e = treeEnds(p, c), r = 9 / z;
      s += `<path d="${treePath(p, c, st.type)}" stroke="#4f46e5" stroke-width="${st.width + 8 / z}" stroke-opacity=".3" fill="none" pointer-events="none"/>`;
      s += `<circle cx="${e.sx}" cy="${e.py}" r="${r}" fill="#10b981" stroke="#fff" stroke-width="${2 / z}" pointer-events="none"/><circle cx="${e.ex}" cy="${e.cy}" r="${r}" fill="#10b981" stroke="#fff" stroke-width="${2 / z}" pointer-events="none"/>`;
    }
  }
  if (selLink) {
    const l = P.links.find(k => k.id === selLink);
    if (l) {
      const g = linkGeom(l), r = 10 / z;
      s += `<path d="${g.d}" stroke="#4f46e5" stroke-width="${(l.width || 3) + 6 / z}" stroke-opacity=".25" fill="none" pointer-events="none"/>`;
      const hd = (pt, k, attached) => `<g data-handle="${k}" class="handle"><circle cx="${pt.x}" cy="${pt.y}" r="${r * 2.2}" fill="transparent"/><circle cx="${pt.x}" cy="${pt.y}" r="${r}" fill="${attached ? '#10b981' : '#fff'}" stroke="#4f46e5" stroke-width="${3 / z}"/></g>`;
      s += hd(g.A, 'a', !!l.a.node) + hd(g.B, 'b', !!l.b.node);
      const m = g.M, q = 9 / z;
      s += `<g data-handle="m" class="handle"><circle cx="${m.x}" cy="${m.y}" r="${q * 2.4}" fill="transparent"/><path d="M${m.x},${m.y - q} L${m.x + q},${m.y} L${m.x},${m.y + q} L${m.x - q},${m.y} z" fill="#fbbf24" stroke="#4f46e5" stroke-width="${2 / z}"/></g>`;
    }
  }
  if (gesture && gesture.snapNode) {
    const n = N(gesture.snapNode);
    if (n) { const r = nodeRect(n), pad = 10 / z; s += `<rect x="${r.x - pad}" y="${r.y - pad}" width="${r.w + pad * 2}" height="${r.h + pad * 2}" rx="${14 / z}" fill="#10b98122" stroke="#10b981" stroke-width="${3 / z}" pointer-events="none"/>`; }
  }
  if (gesture && gesture.type === 'box' && gesture.preview) {
    const b = gesture.preview;
    s += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.h / 2}" fill="#4f46e522" stroke="#4f46e5" stroke-width="${3 / z}" stroke-dasharray="${8 / z},${6 / z}" pointer-events="none"/>`;
  }
  if (gesture && gesture.type === 'draw' && gesture.preview) {
    const { A, B } = gesture.preview;
    s += `<path d="M${A.x},${A.y} L${B.x},${B.y}" stroke="#4f46e5" stroke-width="${3 / z}" stroke-dasharray="${8 / z},${6 / z}" fill="none" pointer-events="none"/>`;
  }
  return s;
}

function applyView() {
  $('#vp').setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.z})`);
  $('#zoom-val').textContent = Math.round(view.z * 100) + '%';
}

function updateChrome() {
  const r = root();
  const name = r ? r.text.split('\n')[0] : P.name;
  if (name && P.name !== name) { P.name = name; renderTabs(); }
  document.title = APP_NAME;
  $('#btn-undo').disabled = hi <= 0;
  $('#btn-redo').disabled = hi >= hist.length - 1;
  const one = selNodes.size >= 1 && !presenting && !drawMode;
  $('#node-bar').classList.toggle('hidden', !one);
  if (one) {
    const n = N([...selNodes][0]);
    const has = n && (n.children || []).length;
    $('#nb-collapse').classList.toggle('hidden', !has);
    if (has) $('#nb-collapse').innerHTML = n.isCollapsed ? '<span>▸</span>展開' : '<span>▾</span>收合';
  }
  $('#draw-banner').classList.toggle('hidden', !(drawMode || boxMode) || presenting);
  $('#draw-text').textContent = boxMode ? '▢ 畫框模式：在畫布上點一下放一個框，或拖曳畫出想要的大小' : '✏️ 畫線模式：在畫布上拖曳就能畫線，起點或終點靠近方塊會自動接上';
  $('#btn-draw').classList.toggle('on', drawMode);
  $('#btn-box').classList.toggle('on', boxMode);
  $('#btn-multi').classList.toggle('on', multiMode);
  svg.classList.toggle('draw', drawMode || boxMode);
}

/* ---------------- 視角 ---------------- */
function stageRect() { return svg.getBoundingClientRect(); }
function toWorld(cx, cy) { const r = stageRect(); return { x: (cx - r.left - view.x) / view.z, y: (cy - r.top - view.y) / view.z }; }
function zoomAt(f, cx, cy) {
  const r = stageRect();
  if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
  const nz = clamp(view.z * f, 0.15, 4);
  const wx = (cx - r.left - view.x) / view.z, wy = (cy - r.top - view.y) / view.z;
  view.z = nz; view.x = cx - r.left - wx * nz; view.y = cy - r.top - wy * nz;
  render();
}
function contentBounds(ids) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  ids.forEach(id => { const n = N(id); if (!n) return; const r = nodeRect(n); x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y); x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h); });
  P.links.forEach(l => {
    if (presenting && pState && !pState.showLinks) return;
    if ((l.a.node && !ids.has(l.a.node)) || (l.b.node && !ids.has(l.b.node))) return;
    const g = linkGeom(l);
    [g.A, g.B, g.M].forEach(p => { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); });
  });
  if (x1 === Infinity) return { x: -100, y: -50, w: 200, h: 100 };
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
let animId = 0;
function fitView(animate, ids) {
  const b = contentBounds(ids || visibleSet());
  const r = stageRect();
  const bottom = presenting ? 110 : 90, top = presenting ? 50 : 30;
  const left = presenting ? 30 : 120, right = presenting ? 30 : 80;
  const z = clamp(Math.min((r.width - left - right) / b.w, (r.height - top - bottom) / b.h), 0.15, presenting ? 2.2 : 1.4);
  const target = { z, x: left + (r.width - left - right) / 2 - (b.x + b.w / 2) * z, y: top + (r.height - top - bottom) / 2 - (b.y + b.h / 2) * z };
  if (!animate) { view = target; render(); return; }
  const from = { ...view }, t0 = performance.now(), my = ++animId;
  const step = t => {
    if (my !== animId) return;
    const k = Math.min(1, (t - t0) / 380), e = 1 - Math.pow(1 - k, 3);
    view = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, z: from.z + (target.z - from.z) * e };
    applyView(); if (k < 1) requestAnimationFrame(step); else render();
  };
  requestAnimationFrame(step);
}

/* ---------------- 歷史紀錄與自動存檔 ---------------- */
function snapshot() { return JSON.stringify(projectData(P)); }
function resetHistory() { hist = [snapshot()]; hi = 0; }
function commit() {
  P.updated = Date.now();
  const s = snapshot();
  if (hist[hi] === s) { scheduleSave(); return; }
  hist = hist.slice(0, hi + 1); hist.push(s);
  if (hist.length > 80) hist.shift();
  hi = hist.length - 1;
  scheduleSave(); updateChrome();
}
function restore(s) {
  const d = JSON.parse(s);
  Object.assign(P, d);
  selNodes.clear(); selLink = null; LAY.clear();
  layoutAndRender(); syncPanel(); scheduleSave();
}
function undo() { if (hi > 0) { hi--; restore(hist[hi]); } }
function redo() { if (hi < hist.length - 1) { hi++; restore(hist[hi]); } }

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  $('#save-state').textContent = '…儲存中';
  $('#save-state').classList.remove('warn');
  saveTimer = setTimeout(saveNow, 500);
}
function saveNow() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ v: 2, activeId: state.activeId, projects: state.projects.map(projectData) }));
    const t = new Date();
    $('#save-state').textContent = `✓ 已自動儲存 ${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`;
    $('#save-state').classList.remove('warn');
  } catch (e) {
    $('#save-state').textContent = '⚠ 自動儲存失敗，請按「存成檔案」備份';
    $('#save-state').classList.add('warn');
  }
}
window.addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

/* ---------------- 畫布分頁 ---------------- */
function renderTabs() {
  $('#tab-list').innerHTML = state.projects.map(p =>
    `<div class="tab ${p.id === state.activeId ? 'active' : ''}" data-tab="${p.id}" title="點兩下可以改名"><span class="tname">${esc(p.name || '未命名')}</span><button data-close="${p.id}" title="關閉這張畫布">✕</button></div>`).join('');
}
function switchProject(id) {
  if (P && id === P.id) return;
  finishEdit();
  state.activeId = id;
  P = state.projects.find(p => p.id === id);
  selNodes.clear(); selLink = null; LAY.clear();
  autoLayout(false); resetHistory(); renderTabs(); syncPanel(); fitView(false); scheduleSave();
}
function addProject(p, keepOffsets) {
  if (Object.values(p.nodes).some(n => n.zhuyin)) loadZhuyin();
  state.projects.push(p);
  state.activeId = p.id; P = p;
  selNodes.clear(); selLink = null; LAY.clear();
  if (p.palette) applyPalette(p.palette, true);
  autoLayout(!keepOffsets); resetHistory(); renderTabs(); syncPanel(); fitView(false); scheduleSave();
}
function closeProject(id) {
  const p = state.projects.find(x => x.id === id);
  confirmBox(`要關閉「${esc(p.name)}」這張畫布嗎？`, '關閉後就不會再自動保留。如果之後還要用，請先按「存成檔案」備份。', '關閉畫布', () => {
    state.projects = state.projects.filter(x => x.id !== id);
    if (!state.projects.length) state.projects.push(buildFromTree(MM_TEMPLATES[0].tree));
    if (state.activeId === id) { P = null; switchProject(state.projects[0].id); }
    renderTabs(); scheduleSave();
  });
}

/* ---------------- 套色 ---------------- */
function applyPalette(pid, silent) {
  const pal = PALETTES.find(p => p.id === pid); if (!pal) return;
  P.palette = pid;
  const r = root();
  const dk = darkUI(), tc = textCol(), plain = dk ? '#1e293b' : (uiTheme === 'warm' ? '#fffaf3' : '#ffffff');
  const rootCol = dk ? mix(pal.root, 0.45) : pal.root;
  Object.assign(r, { fillColor: plain, borderColor: rootCol, lineColor: rootCol, fontColor: tc });
  r.children.forEach((cid, i) => {
    const col = pal.colors[i % pal.colors.length];
    const top = N(cid); if (!top) return;
    Object.assign(top, { borderColor: col, fillColor: pal.mono ? plain : tintFill(col, 1), lineColor: col, fontColor: tc });
    descendants(cid).forEach(d => Object.assign(N(d), { borderColor: pal.mono ? '#64748b' : mix(col, dk ? 0.15 : 0.35), fillColor: pal.mono ? plain : tintFill(col, 2), lineColor: pal.mono ? '#64748b' : mix(col, dk ? 0.1 : 0.25), fontColor: tc }));
  });
  for (const id in P.nodes) if (isFree(P.nodes[id])) Object.assign(P.nodes[id], { fontColor: tc, fillColor: tintFill(P.nodes[id].borderColor, 1) });
  if (!silent) { render(); commit(); renderPalettes(); toast(`已套用「${pal.name}」配色`); }
}
function renderThemes() {
  $('#theme-list').innerHTML = Object.entries(THEMES).map(([k, t]) => `<button class="t-${k} ${k === uiTheme ? 'on' : ''}" data-theme-pick="${k}"><span style="font-size:22px">${t.icon}</span>${t.name}</button>`).join('');
}
function setTheme(k) {
  uiTheme = k; document.body.dataset.theme = k;
  try { localStorage.setItem('mindmap-editor-theme', k); } catch (e) { }
  P.bg = THEMES[k].bg;
  if (k === 'warm') P.palette = 'warm';
  else if (P.palette === 'warm' || !P.palette) P.palette = k === 'dark' ? 'rainbow' : 'rainbow';
  applyPalette(P.palette, true);
  render(); commit(); syncPanel();
  toast(`已換成「${THEMES[k].name}」主題（目前這張畫布的顏色也一起換了）`);
}
function renderPalettes() {
  renderThemes();
  $('#palette-list').innerHTML = PALETTES.map(p => `<button class="pal ${P && P.palette === p.id ? 'on' : ''}" data-pal="${p.id}">${p.name}<div class="sw">${(p.mono ? ['#0f172a', '#334155', '#64748b', '#cbd5e1'] : p.colors.slice(0, 6)).map(c => `<i style="background:${c}"></i>`).join('')}</div></button>`).join('');
}

/* ---------------- 新增 / 刪除 ---------------- */
function styleForNew(parent) {
  const lvl = level(parent.id) + 1;
  const st = { ...BASE_STYLE, ...LEVEL_STYLE[Math.min(Math.max(lvl, 0), 2)] };
  const pal = PALETTES.find(p => p.id === P.palette);
  if (parent.id === P.rootId) {
    if (pal) { const col = pal.colors[parent.children.length % pal.colors.length]; Object.assign(st, { borderColor: col, fillColor: pal.mono ? '#fff' : tintFill(col, 1), lineColor: col, fontColor: textCol() }); }
  } else {
    const src = (parent.children.length && N(parent.children[parent.children.length - 1])) || null;
    if (src && level(src.id) === lvl) STYLE_KEYS.forEach(k => st[k] = src[k]);
    else if (lvl >= 2) {
      const col = parent.borderColor;
      Object.assign(st, { borderColor: lvl === 2 && pal ? mix(col, 0.35) : col, fillColor: pal && !pal.mono ? tintFill(parent.lineColor, 2) : parent.fillColor, lineColor: parent.lineColor, fontColor: parent.fontColor, fontFamily: parent.fontFamily, writingMode: parent.writingMode });
    }
  }
  return st;
}
function addChild(pid) {
  const p = N(pid); if (!p) return;
  let side = p.side;
  if (pid === P.rootId) { const L = p.children.filter(c => N(c) && N(c).side === 'left').length; side = L < p.children.length - L ? 'left' : 'right'; }
  const n = { ...makeNode('新想法', pid, side, 1), ...styleForNew(p) };
  if (isFree(p) || (p.side === 'free')) n.side = 'right';
  p.children.push(n.id); p.isCollapsed = false; P.nodes[n.id] = n;
  afterAdd(n);
}
function addSibling(id) {
  const n = N(id); if (!n) return;
  if (!n.parentId) { addFreeNode(PX(n), PY(n) + n.height + 30); return; }
  const p = N(n.parentId);
  const s = { ...makeNode('新想法', p.id, n.side, 1), ...styleForNew(p) };
  STYLE_KEYS.forEach(k => s[k] = n[k]);
  s.side = n.side;
  p.children.splice(p.children.indexOf(id) + 1, 0, s.id); P.nodes[s.id] = s;
  afterAdd(s);
}
function afterAdd(n) {
  const fp = n.parentId && N(n.parentId) && isFree(N(n.parentId));
  autoLayout(false);
  if (fp) layoutFreeSubtree(N(n.parentId));
  selNodes = new Set([n.id]); selLink = null;
  render(); commit(); syncPanel();
  ensureVisible(n);
  setTimeout(() => startEdit(n.id, true), 30);
}
// 獨立方塊底下的子方塊：排在它右邊
function layoutFreeSubtree(f) {
  const kids = (f.children || []).filter(c => N(c));
  let total = kids.reduce((s, c) => s + N(c).height, 0) + (kids.length - 1) * 18;
  let y = PY(f) - total / 2;
  kids.forEach(c => { const n = N(c); n.side = 'right'; n.x = PX(f) + f.width / 2 + 60 + n.width / 2 - (n.offsetX || 0); n.y = y + n.height / 2; n.offsetY = 0; y += n.height + 18; layoutFreeSubtree(n); });
}
function addFreeNode(x, y, size) {
  if (x == null) { const r = stageRect(); const c = toWorld(r.left + r.width / 2, r.top + r.height / 2); x = c.x; y = c.y - 120; }
  const n = makeNode('獨立方塊', null, 'free', 1);
  Object.assign(n, { x, y, shape: 'capsule', text: '新的框', borderColor: '#0ea5e9', fillColor: tintFill('#0ea5e9', 1), lineColor: '#0ea5e9', fontColor: textCol() });
  if (size) { n.customResized = true; n.width = Math.round(size.w); n.height = Math.round(size.h); }
  P.nodes[n.id] = n; nodeBox(n);
  selNodes = new Set([n.id]); selLink = null;
  render(); commit(); syncPanel();
  setTimeout(() => startEdit(n.id, true), 30);
}
function deleteSelected(force) {
  if (selLink && selLink.startsWith('T:')) { deleteTreeLine(); return; }
  if (selLink) { P.links = P.links.filter(l => l.id !== selLink); selLink = null; render(); commit(); syncPanel(); return; }
  const ids = [...selNodes].filter(id => id !== P.rootId);
  if (!ids.length) { if (selNodes.has(P.rootId)) toast('中心主題不能刪除'); return; }
  const all = new Set();
  ids.forEach(id => { all.add(id); descendants(id).forEach(d => all.add(d)); });
  const doIt = () => {
    all.forEach(id => {
      const n = N(id); if (!n) return;
      if (n.parentId && N(n.parentId)) N(n.parentId).children = N(n.parentId).children.filter(c => c !== id);
    });
    all.forEach(id => delete P.nodes[id]);
    // 連到被刪除方塊的線：端點變成自由端
    P.links.forEach(l => ['a', 'b'].forEach(k => { if (l[k].node && all.has(l[k].node)) { l[k].node = null; } }));
    selNodes.clear(); LAY.clear();
    layoutAndRender(); commit(); syncPanel();
  };
  if (all.size > 3 && !force) confirmBox(`要刪除 ${all.size} 個方塊嗎？`, '包含底下所有的分支。刪錯了可以按「復原」救回來。', '刪除', doIt);
  else doIt();
}
// 刪除方塊前，把連到它的線的端點留在原地
function freezeLinkEnds() {
  P.links.forEach(l => ['a', 'b'].forEach(k => { const e = l[k]; if (e.node && N(e.node)) { const g = linkGeom(l); const p = k === 'a' ? g.A : g.B; e.x = p.x; e.y = p.y; } }));
}

function deleteTreeLine() {
  const c = N(selLink.slice(2)); if (!c) return;
  c.hideLine = true; selLink = null; render(); commit(); syncPanel();
  toast('連線已刪除（方塊還是屬於這個分支）。要找回來：畫布設定裡按「找回刪掉的分支線」');
}
function toggleCollapse(id) {
  const n = N(id); if (!n || !(n.children || []).length) return;
  n.isCollapsed = !n.isCollapsed;
  if (n.isCollapsed) descendants(id).forEach(d => selNodes.delete(d));
  layoutAndRender(); commit();
}
function ensureVisible(n) {
  const r = stageRect();
  const sx = PX(n) * view.z + view.x, sy = PY(n) * view.z + view.y;
  if (sx < 80 || sx > r.width - 80 || sy < 80 || sy > r.height - 120) {
    view.x += r.width / 2 - sx; view.y += r.height / 2 - sy; render();
  }
}

/* ---------------- 直接在方塊上改字 ---------------- */
const ed = $('#inline-editor');
let editing = null;
function startEdit(id, selectAll) {
  const n = N(id); if (!n || presenting) return;
  finishEdit();
  editing = id;
  const r = nodeRect(n);
  const sr = svg.getBoundingClientRect(), stg = $('#stage').getBoundingClientRect();
  const w = Math.max(180, r.w * view.z + 20), h = Math.max(54, r.h * view.z + 16);
  ed.style.left = (sr.left - stg.left + view.x + PX(n) * view.z - w / 2) + 'px';
  ed.style.top = (sr.top - stg.top + view.y + PY(n) * view.z - h / 2) + 'px';
  ed.style.width = w + 'px'; ed.style.height = h + 'px';
  ed.style.fontSize = clamp((n.fontSize || 16) * view.z, 15, 40) + 'px';
  ed.style.fontFamily = FONT_STACK[fontKey(n.fontFamily)];
  ed.value = n.text;
  ed.classList.remove('hidden');
  ed.focus();
  if (selectAll) ed.select();
}
function finishEdit(cancel) {
  if (!editing) return;
  const n = N(editing);
  const id = editing; editing = null;
  ed.classList.add('hidden');
  if (n && !cancel && ed.value !== n.text) {
    n.text = ed.value;
    if (n.zyOverride) n.zyOverride = '';
    autoLayout(false); render(); commit();
  }
  if (selNodes.has(id)) syncPanel();
}
ed.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); finishEdit(); }
  else if (e.key === 'Escape') { finishEdit(true); }
  else if (e.key === 'Tab') { e.preventDefault(); const id = editing; finishEdit(); addChild(id); }
});
ed.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== ed) finishEdit(); }, 0));

/* ---------------- 指標事件（滑鼠＋觸控＋觸控筆） ---------------- */
const pointers = new Map();
let gesture = null;
let lastTap = { id: null, t: 0 };

function hitInfo(target) {
  const h = target.closest('[data-handle]'); if (h) return { kind: 'handle', key: h.dataset.handle };
  const rz = target.closest('[data-resize]'); if (rz) return { kind: 'resize', id: rz.dataset.resize };
  const tg = target.closest('[data-toggle]'); if (tg) return { kind: 'toggle', id: tg.dataset.toggle };
  const nd = target.closest('[data-node]'); if (nd) return { kind: 'node', id: nd.dataset.node };
  const lk = target.closest('[data-link]'); if (lk) return { kind: 'link', id: lk.dataset.link };
  const tl = target.closest('[data-tline]'); if (tl) return { kind: 'link', id: 'T:' + tl.dataset.tline };
  return { kind: 'bg' };
}
function nodeAt(wx, wy, margin = 0, exclude) {
  const vis = visibleSet();
  let best = null, bd = Infinity;
  for (const id of vis) {
    if (exclude && exclude === id) continue;
    const n = N(id), r = nodeRect(n);
    const dx = Math.max(r.x - wx, 0, wx - (r.x + r.w)), dy = Math.max(r.y - wy, 0, wy - (r.y + r.h));
    const d = Math.hypot(dx, dy);
    if (d <= margin && d < bd) { bd = d; best = id; }
  }
  return best;
}
const SNAP = () => 28 / view.z;

svg.addEventListener('pointerdown', e => {
  if (e.button > 0 && e.pointerType === 'mouse') return;
  closeMenus();
  if (editing) finishEdit();
  svg.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) { startPinch(); return; }
  if (pointers.size > 2) return;
  const w = toWorld(e.clientX, e.clientY);
  const hit = hitInfo(e.target);
  if (e.pointerType !== 'mouse' && !presenting) {
    clearTimeout(longTimer);
    const pid = e.pointerId, cx = e.clientX, cy = e.clientY;
    longTimer = setTimeout(() => {
      if (gesture && gesture.pid === pid && !gesture.moved && pointers.size === 1) { gesture = null; openCtx(hit, cx, cy); }
    }, 550);
  }
  const base = { sx: e.clientX, sy: e.clientY, moved: false, hit, w0: w, pid: e.pointerId, shift: e.shiftKey || e.ctrlKey || e.metaKey };

  if (presenting) { gesture = { ...base, type: 'pan', vx: view.x, vy: view.y }; return; }

  if (hit.kind === 'handle' && selLink) {
    const l = P.links.find(k => k.id === selLink);
    gesture = { ...base, type: 'handle', link: l, key: hit.key, orig: clone(l) };
    return;
  }
  if (boxMode) { gesture = { ...base, type: 'box' }; return; }
  if (drawMode) {
    const start = nodeAt(w.x, w.y, SNAP());
    gesture = { ...base, type: 'draw', startNode: start, startPt: w };
    return;
  }
  if (hit.kind === 'resize') {
    const n = N(hit.id);
    gesture = { ...base, type: 'resize', id: hit.id, w0n: n.width, h0n: n.height };
    return;
  }
  if (hit.kind === 'toggle') { gesture = { ...base, type: 'toggle' }; return; }
  if (hit.kind === 'node') {
    gesture = { ...base, type: 'node', id: hit.id };
    return;
  }
  if (hit.kind === 'link') { gesture = { ...base, type: 'link', id: hit.id }; return; }
  gesture = { ...base, type: 'pan', vx: view.x, vy: view.y };
});

let longTimer = null, lastPointerWorld = null;
svg.addEventListener('pointermove', e => {
  lastPointerWorld = toWorld(e.clientX, e.clientY);
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gesture && gesture.type === 'pinch') { doPinch(); return; }
  if (!gesture || e.pointerId !== gesture.pid) return;
  const dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy;
  if (!gesture.moved && Math.hypot(dx, dy) < (e.pointerType === 'mouse' ? 4 : 9)) return;
  gesture.moved = true; clearTimeout(longTimer);
  const w = toWorld(e.clientX, e.clientY);
  switch (gesture.type) {
    case 'pan': view.x = gesture.vx + dx; view.y = gesture.vy + dy; applyView(); break;
    case 'node': {
      if (!gesture.dragIds) {
        if (!selNodes.has(gesture.id)) { selNodes = new Set([gesture.id]); selLink = null; syncPanel(); }
        const set = new Set();
        selNodes.forEach(id => { set.add(id); descendants(id).forEach(d => set.add(d)); });
        gesture.dragIds = [...set];
        gesture.start = Object.fromEntries(gesture.dragIds.map(id => [id, { ox: N(id).offsetX || 0, oy: N(id).offsetY || 0 }]));
      }
      const ddx = dx / view.z, ddy = dy / view.z;
      gesture.dragIds.forEach(id => { const n = N(id); n.offsetX = gesture.start[id].ox + ddx; n.offsetY = gesture.start[id].oy + ddy; });
      requestRender(); break;
    }
    case 'resize': {
      const n = N(gesture.id);
      n.customResized = true;
      n.width = Math.max(50, gesture.w0n + dx / view.z * 2);
      n.height = Math.max(30, gesture.h0n + dy / view.z * 2);
      requestRender(); break;
    }
    case 'handle': {
      const l = gesture.link, k = gesture.key;
      if (k === 'm') {
        const ra = endRef(l.a), rb = endRef(l.b);
        l.bend = { x: w.x - (ra.x + rb.x) / 2, y: w.y - (ra.y + rb.y) / 2 };
      } else {
        const other = k === 'a' ? l.b.node : l.a.node;
        const snap = nodeAt(w.x, w.y, SNAP());
        gesture.snapNode = snap && snap !== other ? snap : null;
        l[k] = { node: null, x: w.x, y: w.y };
      }
      requestRender(); break;
    }
    case 'draw': {
      const A = gesture.startNode ? { x: PX(N(gesture.startNode)), y: PY(N(gesture.startNode)) } : gesture.startPt;
      const snap = nodeAt(w.x, w.y, SNAP());
      gesture.snapNode = snap && snap !== gesture.startNode ? snap : null;
      gesture.preview = { A: gesture.startNode ? clipToBox(N(gesture.startNode), w.x, w.y) : A, B: w };
      requestRender(); break;
    }
    case 'box':
      gesture.preview = { x: Math.min(gesture.w0.x, w.x), y: Math.min(gesture.w0.y, w.y), w: Math.abs(w.x - gesture.w0.x), h: Math.abs(w.y - gesture.w0.y) };
      requestRender(); break;
    case 'link': case 'toggle':
      gesture.type = 'pan'; gesture.vx = view.x - dx; gesture.vy = view.y - dy; break;
  }
});

function endPointer(e) {
  clearTimeout(longTimer);
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (gesture && gesture.type === 'pinch') { if (pointers.size === 0) { gesture = null; render(); } return; }
  if (!gesture || e.pointerId !== gesture.pid) return;
  const g = gesture; gesture = null;
  const w = toWorld(e.clientX, e.clientY);
  if (e.type === 'pointercancel') { render(); return; }
  if (presenting) { if (!g.moved) presentTap(g.hit); return; }
  switch (g.type) {
    case 'pan':
      if (!g.moved) { if (selNodes.size || selLink) { selNodes.clear(); selLink = null; render(); syncPanel(); } }
      break;
    case 'node':
      if (g.moved) {
        if (g.dragIds && g.dragIds.some(id => isFree(N(id)) )) {/* 獨立方塊直接保留位置 */}
        render(); commit();
      } else {
        const now = Date.now();
        if (lastTap.id === g.id && now - lastTap.t < 380) { lastTap = { id: null, t: 0 }; selNodes = new Set([g.id]); render(); syncPanel(); startEdit(g.id); return; }
        lastTap = { id: g.id, t: now };
        if (g.shift || multiMode) { selNodes.has(g.id) ? selNodes.delete(g.id) : selNodes.add(g.id); }
        else selNodes = new Set([g.id]);
        selLink = null; render(); syncPanel();
      }
      break;
    case 'resize': LAY.delete(g.id); render(); commit(); break;
    case 'toggle': if (!g.moved) toggleCollapse(g.hit.id); break;
    case 'link': if (!g.moved) { selLink = g.id; selNodes.clear(); render(); syncPanel(); } break;
    case 'handle': {
      const l = g.link;
      if (g.key !== 'm' && g.snapNode) { l[g.key] = { node: g.snapNode, x: 0, y: 0 }; }
      render(); commit(); syncPanel();
      if (g.key !== 'm' && g.moved) toast(g.snapNode ? '已接到方塊上' : '端點已和方塊分開');
      break;
    }
    case 'box': {
      const pv = g.moved && g.preview && g.preview.w > 40 && g.preview.h > 24 ? g.preview : null;
      boxMode = false;
      if (pv) addFreeNode(pv.x + pv.w / 2, pv.y + pv.h / 2, { w: pv.w, h: pv.h });
      else addFreeNode(w.x, w.y);
      break;
    }
    case 'draw': {
      const dist = Math.hypot(e.clientX - g.sx, e.clientY - g.sy);
      if (dist < 12) { render(); if (g.hit.kind === 'link') { selLink = g.hit.id; render(); syncPanel(); } break; }
      const end = nodeAt(w.x, w.y, SNAP());
      const endNode = end && end !== g.startNode ? end : null;
      const l = {
        id: uid('l'),
        a: g.startNode ? { node: g.startNode, x: 0, y: 0 } : { node: null, x: g.startPt.x, y: g.startPt.y },
        b: endNode ? { node: endNode, x: 0, y: 0 } : { node: null, x: w.x, y: w.y },
        color: '#475569', width: 3, dash: 'solid', arrowStart: false, arrowEnd: true, label: '', bend: null
      };
      P.links.push(l); selLink = l.id; selNodes.clear();
      render(); commit(); syncPanel();
      break;
    }
  }
}
svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);

function startPinch() {
  const [a, b] = [...pointers.values()];
  if (gesture && gesture.type === 'node' && gesture.dragIds) { gesture.dragIds.forEach(id => { N(id).offsetX = gesture.start[id].ox; N(id).offsetY = gesture.start[id].oy; }); }
  gesture = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), c0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, v0: { ...view } };
}
function doPinch() {
  const [a, b] = [...pointers.values()];
  if (!a || !b) return;
  const g = gesture, r = stageRect();
  const d = Math.hypot(a.x - b.x, a.y - b.y), c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const z = clamp(g.v0.z * d / g.d0, 0.15, 4);
  const wx = (g.c0.x - r.left - g.v0.x) / g.v0.z, wy = (g.c0.y - r.top - g.v0.y) / g.v0.z;
  view = { z, x: c.x - r.left - wx * z, y: c.y - r.top - wy * z };
  applyView();
}
svg.addEventListener('wheel', e => {
  e.preventDefault();
  if (editing) finishEdit();
  if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) >= 40 && e.deltaMode === 0 && !e.deltaX) zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX, e.clientY);
  else { view.x -= e.deltaX; view.y -= e.deltaY; render(); }
}, { passive: false });
// Safari 觸控板手勢
['gesturestart', 'gesturechange'].forEach(t => svg.addEventListener(t, e => e.preventDefault()));
svg.addEventListener('dblclick', e => e.preventDefault());

/* ---------------- 鍵盤 ---------------- */
document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if ($('.modal-back')) { if (e.key === 'Escape') closeModal(); return; }
  const mod = e.ctrlKey || e.metaKey;
  if (presenting) {
    if (['ArrowRight', ' ', 'PageDown', 'Enter'].includes(e.key)) { e.preventDefault(); presentStep(1); }
    else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); presentStep(-1); }
    else if (e.key === 'Escape') exitPresent();
    return;
  }
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(); exportJSON(); return; }
  if (e.key === 'Escape') { if (drawMode) toggleDraw(false); if (boxMode) toggleBox(false); selNodes.clear(); selLink = null; render(); syncPanel(); return; }
  const one = selNodes.size === 1 ? [...selNodes][0] : null;
  closeCtx();
  if (mod && e.key.toLowerCase() === 'c') { if (selNodes.size) { e.preventDefault(); copySel(); } return; }
  if (mod && e.key.toLowerCase() === 'x') { if (selNodes.size) { e.preventDefault(); cutSel(); } return; }
  if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClip(one, one ? null : lastPointerWorld); return; }
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSel(); return; }
  if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAll(); return; }
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && one) { e.preventDefault(); moveSibling(one, e.key === 'ArrowUp' ? -1 : 1); return; }
  if (e.key === 'Tab' && one) { e.preventDefault(); addChild(one); }
  else if (e.key === 'Enter' && one) { e.preventDefault(); addSibling(one); }
  else if ((e.key === 'F2' || e.key === ' ') && one) { e.preventDefault(); startEdit(one); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && (selNodes.size || selLink)) { e.preventDefault(); deleteSelected(); }
});

/* ---------------- 右側(左側)設定面板 ---------------- */
function primary() { return selNodes.size ? N([...selNodes][0]) : null; }
function syncPanel() {
  const n = primary();
  const l = selLink && P.links.find(k => k.id === selLink);
  const tc = selTreeChild();
  $('#sec-canvas').classList.toggle('hidden', !!(n || l || tc));
  $('#sec-node').classList.toggle('hidden', !n);
  $('#sec-link').classList.toggle('hidden', !l);
  $('#sec-tline').classList.toggle('hidden', !tc);
  if (tc && N(tc.parentId)) {
    const st = tlineStyle(N(tc.parentId), tc);
    $('#f-tline-label').value = st.label;
    $$('#sec-tline [data-tk]').forEach(el => {
      const k = el.dataset.tk, v = st[k];
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.type === 'color') el.value = normHex(v);
      else el.value = v ?? '';
    });
  }
  if (n) {
    $('#node-sec-title').textContent = selNodes.size > 1 ? `✏️ 一次設定 ${selNodes.size} 個方塊` : '✏️ 方塊設定';
    $('#f-text').value = n.text;
    $('#f-text').disabled = selNodes.size > 1;
    $$('#sec-node [data-k]').forEach(el => {
      const k = el.dataset.k;
      if (el.dataset.v) { el.classList.toggle('on', n[k] === el.dataset.v); return; }
      if (el.type === 'checkbox') el.checked = !!n[k];
      else if (el.type === 'color') el.value = normHex(n[k]);
      else if (k === 'fontFamily') el.value = fontKey(n[k]);
      else el.value = n[k] ?? '';
    });
    $$('#sec-node [data-flag]').forEach(el => el.classList.toggle('on', !!n[el.dataset.flag]));
    $$('#emoji-list button[data-emoji]').forEach(b => b.classList.toggle('on', b.dataset.emoji === (n.emoji || '')));
    $('#zy-box').classList.toggle('hidden', !n.zhuyin || selNodes.size > 1);
    if (n.zhuyin && ZY.ready) $('#f-zy').value = nodeZhuyin(n).join(' ');
    else if (n.zhuyin) $('#f-zy').value = '（注音字典下載中…）';
    $('[data-act="detach-node"]').classList.toggle('hidden', !n.parentId);
    $('[data-act="flip-side"]').classList.toggle('hidden', n.parentId !== P.rootId);
  }
  if (l) {
    $('#f-link-label').value = l.label || '';
    $$('#sec-link [data-lk]').forEach(el => {
      const k = el.dataset.lk;
      if (el.type === 'checkbox') el.checked = !!l[k];
      else if (el.type === 'color') el.value = normHex(l[k]);
      else el.value = l[k] ?? '';
    });
  }
  renderPalettes();
  $('#canvas-bg').value = normHex(P.bg || '#f8fafc');
  $('#canvas-grid').checked = !!P.grid;
  updateChrome();
}
function selTreeChild() { return selLink && selLink.startsWith('T:') ? N(selLink.slice(2)) : null; }
function eachSel(fn) { selNodes.forEach(id => { const n = N(id); if (n) fn(n); }); }
function setStyle(k, v) {
  eachSel(n => { n[k] = v; if (['fontSize', 'writingMode', 'shape'].includes(k)) n.customResized = false; });
  if (k === 'zhuyin' && v) loadZhuyin();
  autoLayout(false); render(); commit(); syncPanel();
}
$('#panel').addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'f-text') { eachSel(n => { n.text = el.value; n.zyOverride = ''; }); autoLayout(false); render(); commitLater(); return; }
  if (el.id === 'f-tline-label') { const c = selTreeChild(); if (c) { c.inLine = { ...(c.inLine || {}), label: el.value }; render(); commitLater(); } return; }
  if (el.dataset.tk && (el.type === 'range' || el.type === 'color')) { const c = selTreeChild(); if (c) { c.inLine = { ...(c.inLine || {}), [el.dataset.tk]: el.dataset.num ? +el.value : el.value }; render(); commitLater(); } return; }
  if (el.id === 'f-link-label') { const l = P.links.find(k => k.id === selLink); if (l) { l.label = el.value; render(); commitLater(); } return; }
  if (el.dataset.k && (el.type === 'range' || el.type === 'color')) { const v = el.dataset.num ? +el.value : el.value; eachSel(n => n[el.dataset.k] = v); if (el.dataset.k === 'fontSize') eachSel(n => n.customResized = false); autoLayout(false); render(); commitLater(); return; }
  if (el.dataset.lk && (el.type === 'range' || el.type === 'color')) { const l = P.links.find(k => k.id === selLink); if (l) { l[el.dataset.lk] = el.dataset.num ? +el.value : el.value; render(); commitLater(); } return; }
  if (el.id === 'canvas-bg') { P.bg = el.value; render(); commitLater(); }
});
$('#panel').addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'f-zy') { const n = primary(); if (n) { n.zyOverride = el.value.trim(); LAY.delete(n.id); autoLayout(false); render(); commit(); syncPanel(); } return; }
  if (el.id === 'canvas-grid') { P.grid = el.checked; render(); commit(); return; }
  if (el.dataset.k && el.type !== 'range' && el.type !== 'color') {
    const v = el.type === 'checkbox' ? el.checked : (el.dataset.num ? clamp(+el.value || 16, 8, 80) : el.value);
    setStyle(el.dataset.k, v); return;
  }
  if (el.dataset.tk && el.type !== 'range' && el.type !== 'color') {
    const c = selTreeChild(); if (!c) return;
    c.inLine = { ...(c.inLine || {}), [el.dataset.tk]: el.type === 'checkbox' ? el.checked : el.value }; render(); commit(); return;
  }
  if (el.dataset.lk && el.type !== 'range' && el.type !== 'color') {
    const l = P.links.find(k => k.id === selLink); if (!l) return;
    l[el.dataset.lk] = el.type === 'checkbox' ? el.checked : el.value; render(); commit(); return;
  }
});
let commitTimer = null;
function commitLater() { clearTimeout(commitTimer); commitTimer = setTimeout(commit, 400); }

$('#emoji-list').innerHTML = EMOJIS.map(em => `<button data-emoji="${em}">${em}</button>`).join('') + '<button class="clear" data-emoji="">不要符號</button>';

/* ---------------- 圖片 ---------------- */
function pickImage() { $('#file-img').value = ''; $('#file-img').click(); }
$('#file-img').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 480 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      const png = /png|gif|webp|svg/.test(f.type);
      const src = png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85);
      const useSrc = png && src.length > 400000 ? c.toDataURL('image/jpeg', 0.85) : src;
      eachSel(n => { n.image = { src: useSrc, w: c.width, h: c.height }; n.customResized = false; });
      autoLayout(false); render(); commit(); toast('圖片已加入');
    };
    img.src = rd.result;
  };
  rd.readAsDataURL(f);
});

/* ---------------- 按鈕動作 ---------------- */
const ACTIONS = {
  undo, redo,
  'new-canvas': openTemplatePicker,
  'open-file': () => { $('#file-json').value = ''; $('#file-json').click(); },
  'save-file': () => exportJSON(),
  'import-md': openImportMd,
  'export-md': exportMarkdownFile,
  'export-png': exportPNG,
  'export-svg': exportSVGFile,
  'export-mermaid': exportMermaid,
  print: openPrint,
  present: startPresent,
  help: openHelp,
  relayout: () => { P.links.forEach(l => l.bend = l.bend); layoutAndRender(true); commit(); fitView(true); toast('已重新排版'); },
  fit: () => fitView(true),
  'zoom-in': () => zoomAt(1.2),
  'zoom-out': () => zoomAt(1 / 1.2),
  'expand-all': () => { for (const id in P.nodes) P.nodes[id].isCollapsed = false; layoutAndRender(); commit(); fitView(true); },
  'collapse-all': () => { root().children.forEach(c => { if (N(c) && N(c).children.length) N(c).isCollapsed = true; }); selNodes.clear(); layoutAndRender(); commit(); syncPanel(); fitView(true); },
  'add-free-node': () => addFreeNode(),
  'draw-mode': () => toggleDraw(),
  'box-mode': () => toggleBox(),
  'exit-mode': () => { drawMode = false; boxMode = false; render(); },
  'multi-mode': () => { multiMode = !multiMode; updateChrome(); toast(multiMode ? '多選模式：點方塊就能一次選很多個' : '已關閉多選模式'); },
  'toggle-panel': () => { document.body.classList.toggle('panel-closed'); },
  deselect: () => { selNodes.clear(); selLink = null; render(); syncPanel(); },
  'add-child': () => { const n = primary(); if (n) addChild(n.id); },
  'add-sibling': () => { const n = primary(); if (n) addSibling(n.id); },
  'edit-text': () => { const n = primary(); if (n) startEdit(n.id); },
  'toggle-collapse': () => { const n = primary(); if (n) toggleCollapse(n.id); },
  delete: deleteSelected,
  'add-image': pickImage,
  'remove-image': () => { eachSel(n => { delete n.image; n.customResized = false; }); autoLayout(false); render(); commit(); },
  'style-to-branch': () => {
    const n = primary(); if (!n) return;
    descendants(n.id).forEach(d => STYLE_KEYS.forEach(k => { if (k !== 'fontSize' && k !== 'isBold') N(d)[k] = n[k]; }));
    LAY.clear(); layoutAndRender(); commit(); toast('已把樣式套用到整個分支');
  },
  'reset-size': () => { eachSel(n => n.customResized = false); layoutAndRender(); commit(); },
  'detach-node': () => {
    const n = primary(); if (!n || !n.parentId) return;
    const p = N(n.parentId); p.children = p.children.filter(c => c !== n.id);
    const x = PX(n), y = PY(n);
    n.parentId = null; n.side = 'free'; n.x = x; n.y = y; n.offsetX = 0; n.offsetY = 0;
    layoutAndRender(); commit(); syncPanel(); toast('已拆成獨立方塊，可以用連結線接到別的方塊');
  },
  'flip-side': () => { const n = primary(); if (!n) return; n.side = n.side === 'left' ? 'right' : 'left'; n.offsetX = 0; n.offsetY = 0; descendants(n.id).forEach(d => { N(d).offsetX = 0; N(d).offsetY = 0; }); layoutAndRender(); commit(); },
  'tline-delete': () => deleteTreeLine(),
  'tline-reset': () => { const c = selTreeChild(); if (c) { delete c.inLine; render(); commit(); syncPanel(); } },
  'tline-all-siblings': () => { const c = selTreeChild(); if (!c) return; const p = N(c.parentId); p.children.forEach(id => { if (N(id)) N(id).inLine = clone(c.inLine || {}); }); render(); commit(); toast('同一個方塊底下的連線都換成一樣了'); },
  'tline-detach': () => { const c = selTreeChild(); if (!c) return; selLink = null; selNodes = new Set([c.id]); ACTIONS['detach-node'](); },
  'show-hidden-lines': () => { let k = 0; for (const id in P.nodes) if (P.nodes[id].hideLine) { P.nodes[id].hideLine = false; k++; } render(); commit(); toast(k ? `找回了 ${k} 條連線` : '沒有被刪除的連線'); },
  'link-straight': () => { const l = P.links.find(k => k.id === selLink); if (l) { l.bend = null; render(); commit(); } },
  'delete-link': () => { P.links = P.links.filter(l => l.id !== selLink); selLink = null; render(); commit(); syncPanel(); },
  'p-next': () => presentStep(1), 'p-prev': () => presentStep(-1),
  'p-all': () => presentAll(), 'p-reset': () => presentGoto(0), 'present-exit': () => exitPresent()
};
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-menu],[data-tab],[data-close],[data-pal],[data-theme-pick],[data-emoji],[data-flag],#sec-node .seg [data-k]');
  if (!t) { if (!e.target.closest('.menu')) closeMenus(); return; }
  if (t.dataset.menu) { const m = $('#' + t.dataset.menu); const open = !m.classList.contains('open'); closeMenus(); m.classList.toggle('open', open); return; }
  closeMenus();
  if (t.dataset.close) { e.stopPropagation(); closeProject(t.dataset.close); return; }
  if (t.dataset.tab) { switchProject(t.dataset.tab); return; }
  if (t.dataset.pal) { applyPalette(t.dataset.pal); return; }
  if (t.dataset.themePick) { setTheme(t.dataset.themePick); return; }
  if (t.dataset.emoji !== undefined && t.closest('#emoji-list')) { eachSel(n => { n.emoji = t.dataset.emoji; n.customResized = false; }); autoLayout(false); render(); commit(); syncPanel(); return; }
  if (t.dataset.flag) { const n = primary(); if (n) setStyle(t.dataset.flag, !n[t.dataset.flag]); return; }
  if (t.dataset.k && t.dataset.v) { setStyle(t.dataset.k, t.dataset.v); return; }
  const fn = ACTIONS[t.dataset.act];
  if (fn) fn();
});
$('#tab-list').addEventListener('dblclick', e => {
  const t = e.target.closest('[data-tab]'); if (!t) return;
  const p = state.projects.find(x => x.id === t.dataset.tab);
  promptBox('畫布名稱（就是中心主題的第一行）', p.name, v => {
    if (!v) return;
    switchProject(p.id);
    const r = root(); const rest = r.text.split('\n').slice(1);
    r.text = [v, ...rest].join('\n'); layoutAndRender(); commit();
  });
});
function closeMenus() { $$('.menu.open').forEach(m => m.classList.remove('open')); }
function toggleBox(on) {
  boxMode = on === undefined ? !boxMode : on;
  if (boxMode) { drawMode = false; selNodes.clear(); selLink = null; syncPanel(); }
  render();
}
function toggleDraw(on) {
  drawMode = on === undefined ? !drawMode : on;
  if (drawMode) boxMode = false;
  if (drawMode) { selNodes.clear(); syncPanel(); }
  render();
}

/* ---------------- 彈出視窗 ---------------- */
function modal(html, onMount) {
  closeModal();
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal">${html}</div>`;
  back.addEventListener('pointerdown', e => { if (e.target === back) back.dataset.down = '1'; });
  back.addEventListener('click', e => { if (e.target === back && back.dataset.down) closeModal(); });
  $('#modal-root').appendChild(back);
  $$('[data-x]', back).forEach(b => b.addEventListener('click', closeModal));
  if (onMount) onMount(back);
  return back;
}
function closeModal() { $('#modal-root').innerHTML = ''; }
function confirmBox(title, msg, okText, ok) {
  modal(`<h2>${title}</h2><p>${msg}</p><div class="actions"><button class="btn" data-x>取消</button><button class="btn danger" id="m-ok">${okText}</button></div>`,
    m => $('#m-ok', m).onclick = () => { closeModal(); ok(); });
}
function promptBox(title, val, ok) {
  modal(`<h2>${title}</h2><input id="m-in" style="width:100%;padding:12px;font-size:18px;border:1px solid #cbd5e1;border-radius:10px;margin-top:10px"><div class="actions"><button class="btn" data-x>取消</button><button class="btn primary" id="m-ok">確定</button></div>`,
    m => { const i = $('#m-in', m); i.value = val; i.focus(); i.select(); const go = () => { closeModal(); ok(i.value.trim()); }; $('#m-ok', m).onclick = go; i.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) go(); }; });
}
function toast(msg, type) {
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'warn' ? ' warn' : '');
  t.textContent = msg;
  $('#toast-box').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 450); }, 2600);
}

function openTemplatePicker() {
  modal(`<h2>新增畫布：選一個範本</h2><p class="hint">選好後會開一張新的畫布分頁，原本的畫布不會被改到。</p>
    <div class="tpl-grid">${MM_TEMPLATES.map(t => `<button class="tpl" data-tpl="${t.id}"><div class="ti">${t.icon}</div><b>${t.name}</b><span>${t.desc}</span></button>`).join('')}</div>
    <div class="actions"><button class="btn" data-x>取消</button></div>`, m => {
    $$('[data-tpl]', m).forEach(b => b.onclick = () => {
      const t = MM_TEMPLATES.find(x => x.id === b.dataset.tpl);
      closeModal(); addProject(buildFromTree(t.tree)); toast(`已開啟「${t.name}」範本`);
    });
  });
}

/* ---------------- 檔案：JSON ---------------- */
function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const safeName = s => (s || '心智圖').replace(/[\\/:*?"<>|\n]/g, '').slice(0, 40) || '心智圖';
function exportJSON() {
  const data = { app: 'mindmap-editor', version: 2, project: projectData(P) };
  download(safeName(P.name) + '.json', new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  toast('已存成檔案（.json），之後可以用「開啟檔案」打開');
}
$('#file-json').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const d = JSON.parse(rd.result.replace(/^\uFEFF/, ''));
      importData(d, f.name.replace(/\.json$/i, ''));
      toast('已在新分頁打開檔案');
    } catch (err) { toast('這個檔案打不開，請確認是心智圖存下來的 .json 檔', 'warn'); }
  };
  rd.readAsText(f);
});

/* ---------------- Markdown ---------------- */
function parseMarkdown(md) {
  const lines = md.split(/\r?\n/);
  let rootText = null; const items = [];
  lines.forEach(line => {
    if (!line.trim()) return;
    const h = line.match(/^#+\s+(.*)/);
    if (h) { if (rootText === null) rootText = h[1].trim(); else items.push({ text: h[1].trim(), level: Math.max(1, (line.match(/^#+/)[0].length) - 1) }); return; }
    const m = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)/);
    if (m) { const sp = m[1].replace(/\t/g, '  ').length; items.push({ text: m[3].trim(), level: Math.floor(sp / 2) + 1 }); }
    else if (rootText === null && !items.length) rootText = line.trim();
  });
  if (!items.length && rootText === null) return null;
  const tree = { text: (rootText || '中心主題').replace(/\\n/g, '\n'), children: [] };
  const stack = [tree];
  items.forEach(it => {
    const node = { text: it.text.replace(/\\n/g, '\n').replace(/<br\s*\/?>/gi, '\n'), children: [] };
    let lvl = Math.min(it.level, stack.length);
    stack.length = lvl;
    stack[lvl - 1].children.push(node);
    stack.push(node);
  });
  return tree;
}
function toMarkdown() {
  const r = root();
  let out = '# ' + r.text.replace(/\n/g, ' ') + '\n';
  const walk = (id, d) => { const n = N(id); if (!n) return; out += '  '.repeat(d) + '- ' + n.text.replace(/\n/g, ' ') + '\n'; (n.children || []).forEach(c => walk(c, d + 1)); };
  const L = r.children.filter(c => N(c) && N(c).side === 'left'), R = r.children.filter(c => N(c) && N(c).side !== 'left');
  const order = []; for (let i = 0; i < Math.max(L.length, R.length); i++) { if (L[i]) order.push(L[i]); if (R[i]) order.push(R[i]); }
  order.forEach(c => walk(c, 0));
  return out;
}
function openImportMd() {
  const sample = '# 課文名稱\n- 起因\n  - 發生了什麼事\n- 經過\n  - 事件一\n  - 事件二\n- 結果\n  - 最後怎麼了';
  modal(`<h2>匯入 Markdown 大綱</h2>
    <p>第一行用 <b>#</b> 寫中心主題，下面每一行用 <b>-</b> 開頭；前面每多空兩格就是下一層。也可以直接把 ChatGPT／Claude 產生的大綱貼進來。</p>
    <textarea class="code" id="md-in" placeholder="${esc(sample)}"></textarea>
    <div class="actions"><button class="btn" id="md-sample">放入範例</button><button class="btn" data-x>取消</button><button class="btn" id="md-replace">取代目前畫布</button><button class="btn primary" id="md-new">開成新畫布</button></div>`, m => {
    $('#md-sample', m).onclick = () => $('#md-in', m).value = sample;
    const go = replace => {
      const t = parseMarkdown($('#md-in', m).value);
      if (!t) { toast('沒有讀到內容，請確認格式', 'warn'); return; }
      const p = buildFromTree(t);
      closeModal();
      if (replace) { const keep = P.id; Object.assign(P, { ...p, id: keep }); LAY.clear(); applyPalette(P.palette, true); layoutAndRender(true); commit(); fitView(true); syncPanel(); }
      else addProject(p);
      toast('大綱已轉成心智圖');
    };
    $('#md-new', m).onclick = () => go(false);
    $('#md-replace', m).onclick = () => confirmBox('要取代目前畫布嗎？', '目前畫布的內容會被新的大綱蓋掉（可以按「復原」救回來）。', '取代', () => go(true));
  });
}
function exportMarkdownFile() { download(safeName(P.name) + '.md', new Blob([toMarkdown()], { type: 'text/markdown' })); toast('已匯出 Markdown'); }
function exportMermaid() {
  const r = root();
  let out = 'mindmap\n  root((' + r.text.replace(/\n/g, ' ').replace(/[()]/g, '') + '))\n';
  const walk = (id, d) => { const n = N(id); if (!n) return; out += '  '.repeat(d) + n.text.replace(/\n/g, ' ').replace(/[()[\]{}]/g, ' ') + '\n'; (n.children || []).forEach(c => walk(c, d + 1)); };
  r.children.forEach(c => walk(c, 2));
  modal(`<h2>Mermaid 語法</h2><p>可以貼到支援 Mermaid 的筆記軟體（例如 Notion、HackMD）。</p><textarea class="code" id="mm-out" readonly></textarea>
    <div class="actions"><button class="btn" data-x>關閉</button><button class="btn primary" id="mm-copy">複製</button></div>`, m => {
    $('#mm-out', m).value = out;
    $('#mm-copy', m).onclick = () => { navigator.clipboard?.writeText(out).then(() => toast('已複製'), () => { $('#mm-out', m).select(); document.execCommand('copy'); toast('已複製'); }); };
  });
}

/* ---------------- 匯出圖片 / 列印 ---------------- */
function worksheetSet(rule) {
  if (!rule || rule === 'none') return null;
  const s = new Set();
  for (const id in P.nodes) {
    const n = N(id); if (id === P.rootId) continue;
    const lv = level(id);
    if (rule === 'marked' && n.blank) s.add(id);
    if (rule === 'l1' && lv === 1) s.add(id);
    if (rule === 'l2' && lv === 2) s.add(id);
    if (rule === 'leaf' && !(n.children || []).filter(c => N(c)).length) s.add(id);
  }
  return s;
}
function exportSVGString(opts = {}) {
  const out = buildSVG({ ...opts, exportMode: true });
  const b = contentBounds(out.vis);
  const pad = 30;
  const vb = [b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2].map(v => Math.round(v * 10) / 10);
  const bg = opts.ink ? '#ffffff' : (P.bg || '#ffffff');
  return {
    w: vb[2], h: vb[3],
    str: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" width="${vb[2]}" height="${vb[3]}"><defs>${out.defs}</defs><rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="${bg}"/>${out.lines}${out.links}${out.nodes}</svg>`
  };
}
function withAllVisible(fn) { // 匯出時暫時不管收合狀態？保持畫面上看到的樣子
  return fn();
}
function exportSVGFile() { const s = exportSVGString(); download(safeName(P.name) + '.svg', new Blob([s.str], { type: 'image/svg+xml' })); toast('已匯出 SVG'); }
function exportPNG() {
  const s = exportSVGString();
  const scale = Math.min(3, 9000 / Math.max(s.w, s.h));
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = Math.round(s.w * scale); c.height = Math.round(s.h * scale);
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
    c.toBlob(b => { download(safeName(P.name) + '.png', b); toast('已匯出圖片'); }, 'image/png');
  };
  img.onerror = () => toast('圖片匯出失敗，請改用「列印」或 SVG', 'warn');
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s.str);
}
const PAPER = { A4: [210, 297], A3: [297, 420] };
function openPrint() {
  const marked = Object.values(P.nodes).some(n => n.blank);
  modal(`<h2>🖨️ 列印／學習單</h2>
    <div class="opt-group"><b>紙張</b><div class="seg" id="o-paper"><button data-v="A4" class="on">A4</button><button data-v="A3">A3</button></div></div>
    <div class="opt-group"><b>方向</b><div class="seg" id="o-ori"><button data-v="landscape" class="on">橫向</button><button data-v="portrait">直向</button></div></div>
    <div class="opt-group"><b>內容</b><div class="seg" id="o-ws">
      <button data-v="none" class="on">完整版</button>
      <button data-v="marked">挖空：我勾的${marked ? '' : '（還沒勾）'}</button>
      <button data-v="l1">挖空第一層</button>
      <button data-v="l2">挖空第二層</button>
      <button data-v="leaf">挖空最末端</button>
    </div><p class="hint">挖空的方塊會保留框框，讓學生自己寫。要挖哪幾個可以在方塊設定勾「挖空」。</p></div>
    <label class="check"><input type="checkbox" id="o-name" checked> 上方加「班級、座號、姓名」欄</label>
    <label class="check"><input type="checkbox" id="o-ink"> 省墨水（方塊底色改成白色）</label>
    <p class="hint">深色主題印出來會自動改成白底，比較省墨水也看得清楚。</p>
    <div class="actions"><button class="btn" data-x>取消</button><button class="btn primary" id="o-go">列印</button></div>`, m => {
    $$('.seg', m).forEach(sg => sg.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; $$('button', sg).forEach(x => x.classList.toggle('on', x === b)); }));
    $('#o-go', m).onclick = () => {
      const val = id => $(`#${id} .on`, m).dataset.v;
      const ws = val('o-ws');
      if (ws === 'marked' && !marked) { toast('還沒有勾選要挖空的方塊，請先在方塊設定勾「挖空」，或選其他挖空方式', 'warn'); return; }
      const opts = { paper: val('o-paper'), ori: val('o-ori'), ws, name: $('#o-name', m).checked, ink: $('#o-ink', m).checked };
      closeModal(); doPrint(opts);
    };
  });
}
function doPrint(o) {
  const [pw, ph] = PAPER[o.paper];
  const W = (o.ori === 'landscape' ? ph : pw) - 20, H = (o.ori === 'landscape' ? pw : ph) - 20 - (o.name || true ? 14 : 0);
  const s = exportSVGString({ worksheet: worksheetSet(o.ws), ink: o.ink || isDark(P.bg || '#ffffff') });
  const svgStr = s.str.replace(/width="[^"]+" height="[^"]+"/, `width="${W}mm" height="${H}mm" preserveAspectRatio="xMidYMid meet"`);
  const title = esc(root().text.split('\n')[0]) + (o.ws !== 'none' ? '　學習單' : '');
  $('#print-area').innerHTML = `<div class="print-head"><div class="pt">${title}</div>${o.name ? '<div class="who">班級<span></span>　座號<span style="min-width:14mm"></span>　姓名<span style="min-width:36mm"></span></div>' : ''}</div>${svgStr}`;
  $('#print-page-style').textContent = `@page { size: ${o.paper} ${o.ori}; margin: 10mm; }`;
  setTimeout(() => window.print(), 150);
}

/* ---------------- 上課投影 ---------------- */
function presentGroups(order) {
  const r = root(); const groups = [[r.id]];
  const kids = id => (N(id).children || []).filter(c => N(c));
  if (order === 'level') {
    let cur = [r.id];
    while (true) { const nx = cur.flatMap(kids); if (!nx.length) break; groups.push(nx); cur = nx; }
  } else {
    const L = r.children.filter(c => N(c) && N(c).side === 'left'), R = r.children.filter(c => N(c) && N(c).side !== 'left');
    const order2 = []; for (let i = 0; i < Math.max(L.length, R.length); i++) { if (R[i]) order2.push(R[i]); if (L[i]) order2.push(L[i]); }
    order2.forEach(b => {
      groups.push([b]);
      let cur = [b];
      while (true) { const nx = cur.flatMap(kids); if (!nx.length) break; groups.push(nx); cur = nx; }
    });
  }
  return groups;
}
function startPresent() {
  finishEdit(); toggleDraw(false); boxMode = false;
  presenting = true;
  for (const id in P.nodes) P.nodes[id]._wasCollapsed = P.nodes[id].isCollapsed, P.nodes[id].isCollapsed = false;
  autoLayout(false);
  pState = { order: $('#p-order').value, groups: [], step: 0, shown: new Set(), revealed: new Set(), showFree: false, showLinks: false };
  pState.groups = presentGroups(pState.order);
  selNodes.clear(); selLink = null;
  document.body.classList.add('presenting');
  $('#present-bar').classList.remove('hidden');
  $('#present-tip').classList.remove('hidden');
  setTimeout(() => $('#present-tip').classList.add('hidden'), 5000);
  try { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => { }); } catch (e) { }
  presentGoto(0);
}
function presentGoto(k) {
  const G = pState.groups;
  pState.step = clamp(k, 0, G.length);
  pState.shown = new Set();
  for (let i = 0; i <= Math.min(pState.step, G.length - 1); i++) G[i].forEach(id => pState.shown.add(id));
  pState.showFree = pState.showLinks = pState.step >= G.length;
  if (pState.step >= G.length) for (const id in P.nodes) pState.shown.add(id);
  $('#p-step').textContent = `${Math.min(pState.step + 1, G.length + 1)} / ${G.length + 1}`;
  render(); fitView(true, pState.shown);
}
function presentStep(d) { if (!pState) return; presentGoto(pState.step + d); }
function presentAll() { presentGoto(pState.groups.length); }
function presentTap(hit) {
  if (hit.kind !== 'node') return;
  const n = N(hit.id);
  if (n.blank && !pState.revealed.has(n.id)) { pState.revealed.add(n.id); render(); return; }
  const kids = (n.children || []).filter(c => N(c) && !pState.shown.has(c));
  if (kids.length) { kids.forEach(c => pState.shown.add(c)); render(); fitView(true, pState.shown); }
}
function exitPresent() {
  presenting = false; pState = null;
  for (const id in P.nodes) { P.nodes[id].isCollapsed = P.nodes[id]._wasCollapsed; delete P.nodes[id]._wasCollapsed; }
  document.body.classList.remove('presenting');
  $('#present-bar').classList.add('hidden'); $('#present-tip').classList.add('hidden');
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { }
  layoutAndRender(); fitView(false);
}
$('#p-order').addEventListener('change', () => { if (pState) { pState.order = $('#p-order').value; pState.groups = presentGroups(pState.order); pState.revealed.clear(); presentGoto(0); } });

/* ---------------- 說明 ---------------- */
function openHelp() {
  modal(`<div class="help"><h2>❓ 使用說明</h2>
  <h3>基本操作</h3><ul>
    <li><b>點一下</b>方塊：選取，下方會出現「下一層、同一層、改文字、刪除」按鈕。</li>
    <li><b>點兩下</b>方塊：直接改文字（按 <kbd>Enter</kbd> 完成，<kbd>Shift</kbd>+<kbd>Enter</kbd> 換行）。</li>
    <li><b>拖曳</b>方塊：移動它和底下的分支。按「重新自動排版」可以回到整齊的樣子。</li>
    <li><b>拖曳空白處</b>：移動整張畫布；<b>兩指捏合</b>或滑鼠滾輪：放大縮小。</li>
    <li>方塊右下角的<b>藍色小方塊</b>：拖曳可以改大小。</li>
    <li>方塊旁的 <b>−</b> 圓圈：收合／展開下一層。</li>
  </ul>
  <h3>連結線</h3><ul>
    <li>按左上角「✏️ 畫線」，在畫布上拖曳就能畫線。從方塊上開始畫，或拖到方塊旁邊，就會自動接上。</li>
    <li>點一下線就能選取：拖曳兩端圓點移動端點（綠色表示已接在方塊上，拉離方塊就分開），拖曳中間黃色菱形可以把線拉彎。</li>
    <li>線上可以加文字，例如「因為」「所以」。</li>
    <li>按左上角「⬭ 畫框」，在畫布上點一下就放一個膠囊形的框，或拖曳畫出想要的大小；框可以放在任何地方，再用連結線接起來。</li>
  </ul>
  <h3>右鍵選單</h3><ul>
    <li>在方塊、連結線或空白處按<b>滑鼠右鍵</b>（iPad 用<b>手指長按</b>），會出現選單：剪下、複製、貼上、複製一份、新增上一層、往上／下移、複製樣式、聚焦分支、挖空、注音…</li>
    <li>分支的連線也可以點選：單獨改顏色、粗細、加文字，或只刪除這條線。</li>
    <li>快速鍵：<kbd>Ctrl</kbd>+<kbd>C</kbd> 複製、<kbd>Ctrl</kbd>+<kbd>X</kbd> 剪下、<kbd>Ctrl</kbd>+<kbd>V</kbd> 貼上、<kbd>Ctrl</kbd>+<kbd>D</kbd> 複製一份、<kbd>Ctrl</kbd>+<kbd>A</kbd> 全選、<kbd>Alt</kbd>+<kbd>↑</kbd><kbd>↓</kbd> 調整順序</li>
  </ul>
  <h3>上課好用</h3><ul>
    <li><b>📺 上課投影</b>：畫面放大，一支一支（或一層一層）出現；點方塊可以打開下一層，勾了「挖空」的方塊會顯示「？」，點一下才看到答案。鍵盤 → 下一步、← 上一步。</li>
    <li><b>🖨️ 列印／學習單</b>：A4、A3 都可以，選「挖空」就變成學生填寫用的學習單。</li>
    <li>方塊設定裡可以加<b>表情符號、圖片、注音</b>；注音的破音字可以自己改。</li>
  </ul>
  <h3>存檔</h3><ul>
    <li>畫的東西會<b>自動保存在這台裝置的瀏覽器</b>，關掉再打開還在。</li>
    <li>要換電腦、或怕清除瀏覽器資料，請按「💾 存成檔案」，之後用「📂 開啟檔案」打開。舊版做的 .json 檔也能打開。</li>
  </ul>
  <h3>鍵盤快速鍵（電腦）</h3><ul>
    <li><kbd>Tab</kbd> 新增下一層、<kbd>Enter</kbd> 新增同一層、<kbd>Delete</kbd> 刪除、<kbd>Ctrl</kbd>+<kbd>Z</kbd> 復原、<kbd>Ctrl</kbd>+<kbd>Y</kbd> 重做</li>
    <li>按住 <kbd>Ctrl</kbd> 或 <kbd>Shift</kbd> 點方塊可以多選；平板請用左上角「☑️ 多選」。</li>
  </ul></div>
  <div class="actions"><button class="btn primary" data-x>知道了</button></div>`);
}


/* ---------------- 剪下／複製／貼上 ---------------- */
const CLIP_KEY = 'mindmap-editor-clip';
let CLIP = null, STYLE_CLIP = null, LINE_CLIP = null;
try { CLIP = JSON.parse(localStorage.getItem(CLIP_KEY) || 'null'); } catch (e) { }
function selRoots() { // 選取的方塊中，沒有被其他選取方塊包含的
  const ids = [...selNodes].filter(id => N(id));
  return ids.filter(id => { let n = N(id); while (n && n.parentId) { if (selNodes.has(n.parentId)) return false; n = N(n.parentId); } return true; });
}
function copySel(silent) {
  const roots = selRoots(); if (!roots.length) return false;
  const all = new Set();
  roots.forEach(r => { all.add(r); descendants(r).forEach(d => all.add(d)); });
  const nodes = {}; all.forEach(id => { nodes[id] = clone(N(id)); });
  const links = P.links.filter(l => l.a.node && l.b.node && all.has(l.a.node) && all.has(l.b.node)).map(clone);
  CLIP = { roots, nodes, links };
  try { localStorage.setItem(CLIP_KEY, JSON.stringify(CLIP)); } catch (e) { }
  // 同時放一份純文字大綱到系統剪貼簿，可以貼到 Word
  let txt = '';
  const walk = (id, d) => { const n = nodes[id]; if (!n) return; txt += '  '.repeat(d) + (d ? '- ' : '') + n.text.replace(/\n/g, ' ') + '\n'; (n.children || []).forEach(c => walk(c, d + 1)); };
  roots.forEach(r => walk(r, 0));
  try { navigator.clipboard && navigator.clipboard.writeText(txt).catch(() => { }); } catch (e) { }
  if (!silent) toast(`已複製 ${all.size} 個方塊`);
  return true;
}
function pasteClip(targetId, pos) {
  if (!CLIP || !CLIP.roots || !CLIP.roots.length) { toast('還沒有複製任何方塊'); return; }
  const map = {};
  Object.keys(CLIP.nodes).forEach(id => map[id] = uid());
  const target = targetId && N(targetId);
  const newRoots = [];
  if (!pos) { const r = stageRect(); pos = toWorld(r.left + r.width / 2, r.top + r.height / 2); }
  CLIP.roots.forEach((rid, i) => {
    const walk = (id, parentId, side) => {
      const o = CLIP.nodes[id]; if (!o) return null;
      const n = { ...clone(o), id: map[id], parentId, side, offsetX: 0, offsetY: 0, isCollapsed: false };
      n.children = (o.children || []).filter(c => CLIP.nodes[c]).map(c => map[c]);
      P.nodes[n.id] = n;
      (o.children || []).forEach(c => walk(c, n.id, side === 'free' ? 'right' : side));
      return n;
    };
    let side = 'free';
    if (target) {
      side = target.id === P.rootId ? (target.children.filter(c => N(c) && N(c).side === 'left').length < target.children.length / 2 ? 'left' : 'right') : (isFree(target) ? 'right' : target.side);
    }
    const n = walk(rid, target ? target.id : null, side);
    if (!n) return;
    if (target) { target.children.push(n.id); target.isCollapsed = false; }
    else { n.x = pos.x + i * 30; n.y = pos.y + i * 30; n.side = 'free'; }
    newRoots.push(n.id);
  });
  (CLIP.links || []).forEach(l => {
    if (!map[l.a.node] || !map[l.b.node]) return;
    P.links.push({ ...clone(l), id: uid('l'), a: { ...l.a, node: map[l.a.node] }, b: { ...l.b, node: map[l.b.node] } });
  });
  LAY.clear();
  autoLayout(false);
  newRoots.forEach(id => { const n = N(id); if (isFree(n)) layoutFreeSubtree(n); });
  if (target && isFree(target)) layoutFreeSubtree(target);
  selNodes = new Set(newRoots); selLink = null;
  render(); commit(); syncPanel();
  toast('已貼上');
}
function cutSel() { if (!selRoots().length) return; if (selNodes.has(P.rootId)) { toast('中心主題不能剪下，可以用「複製」'); return; } copySel(true); deleteSelected(true); toast('已剪下，可以到別的方塊上「貼上」'); }
function duplicateSel() {
  const roots = selRoots().filter(id => id !== P.rootId); if (!roots.length) return;
  const keep = new Set(selNodes);
  const savedClip = CLIP;
  selNodes = new Set(roots); copySel(true);
  const first = N(roots[0]);
  if (first.parentId) pasteClip(first.parentId);
  else pasteClip(null, { x: PX(first) + 40, y: PY(first) + first.height + 30 });
  CLIP = savedClip;
  if (!selNodes.size) selNodes = keep;
}
function insertParent(id) {
  const n = N(id); if (!n || !n.parentId) return;
  const p = N(n.parentId);
  const m = { ...makeNode('新的上一層', p.id, n.side, 1) };
  STYLE_KEYS.forEach(k => m[k] = n[k]);
  m.side = isFree(p) ? 'right' : n.side;
  p.children[p.children.indexOf(id)] = m.id;
  m.children = [id]; n.parentId = m.id;
  P.nodes[m.id] = m;
  afterAdd(m);
}
function moveSibling(id, dir) {
  const n = N(id); if (!n || !n.parentId) return;
  const p = N(n.parentId), arr = p.children;
  const same = c => N(c) && (p.id !== P.rootId || N(c).side === n.side);
  let i = arr.indexOf(id), j = i + dir;
  while (j >= 0 && j < arr.length && !same(arr[j])) j += dir;
  if (j < 0 || j >= arr.length) { toast(dir < 0 ? '已經在最上面了' : '已經在最下面了'); return; }
  [arr[i], arr[j]] = [arr[j], arr[i]];
  n.offsetX = n.offsetY = 0;
  layoutAndRender(); commit();
}
function copyStyle() { const n = primary(); if (!n) return; STYLE_CLIP = {}; STYLE_KEYS.forEach(k => STYLE_CLIP[k] = n[k]); toast('已複製樣式，到別的方塊按「貼上樣式」'); }
function pasteStyle() { if (!STYLE_CLIP) { toast('還沒有複製樣式'); return; } eachSel(n => { Object.assign(n, clone(STYLE_CLIP)); n.customResized = false; }); LAY.clear(); layoutAndRender(); commit(); syncPanel(); }
function copyLineStyle() {
  const c = selTreeChild(), l = selLink && P.links.find(k => k.id === selLink);
  if (c) { const st = tlineStyle(N(c.parentId), c); LINE_CLIP = { color: st.color, width: st.width, dash: st.dash, arrowEnd: st.arrowEnd }; }
  else if (l) LINE_CLIP = { color: l.color, width: l.width, dash: l.dash, arrowEnd: l.arrowEnd, arrowStart: l.arrowStart };
  toast('已複製線的樣式');
}
function pasteLineStyle() {
  if (!LINE_CLIP) { toast('還沒有複製線的樣式'); return; }
  const c = selTreeChild(), l = selLink && P.links.find(k => k.id === selLink);
  if (c) c.inLine = { ...(c.inLine || {}), color: LINE_CLIP.color, width: LINE_CLIP.width, dash: LINE_CLIP.dash, arrowEnd: LINE_CLIP.arrowEnd };
  else if (l) Object.assign(l, clone(LINE_CLIP));
  render(); commit(); syncPanel();
}
function openPanelTo(sel) {
  document.body.classList.remove('panel-closed');
  syncPanel();
  setTimeout(() => { const el = $(sel); if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); } }, 50);
}
function selectBranch(id) { selNodes = new Set([id, ...descendants(id)]); selLink = null; render(); syncPanel(); }
function focusBranch(id) { fitView(true, new Set([id, ...descendants(id)].filter(x => visibleSet().has(x)))); }

/* ---------------- 右鍵選單（iPad 長按） ---------------- */
let ctxWorld = null;
function closeCtx() { const m = $('#ctx-menu'); if (m) m.remove(); }
function ctxItems(hit) {
  const I = (icon, label, fn, key, opt = {}) => ({ icon, label, fn, key, ...opt });
  const SEP = { sep: true };
  if (hit.kind === 'node') {
    const n = primary(), many = selNodes.size > 1, isRoot = n.id === P.rootId;
    const hasKids = (n.children || []).some(c => N(c));
    return [
      I('✂️', '剪下', cutSel, 'Ctrl+X', { off: isRoot }),
      I('📋', '複製', () => copySel(), 'Ctrl+C'),
      I('📥', '貼上（變成它的下一層）', () => pasteClip(n.id), 'Ctrl+V', { off: !CLIP || many }),
      I('⧉', '複製一份', duplicateSel, 'Ctrl+D', { off: isRoot }),
      SEP,
      I('＋', '新增下一層', () => addChild(n.id), 'Tab', { off: many }),
      I('⇊', '新增同一層', () => addSibling(n.id), 'Enter', { off: many || isRoot }),
      I('⤴', '新增上一層（插在中間）', () => insertParent(n.id), '', { off: many || !n.parentId }),
      I('✏️', '改文字', () => startEdit(n.id), 'F2', { off: many }),
      SEP,
      I('⬆', '往上移', () => moveSibling(n.id, -1), 'Alt+↑', { off: many || !n.parentId }),
      I('⬇', '往下移', () => moveSibling(n.id, 1), 'Alt+↓', { off: many || !n.parentId }),
      I('⇆', '換到另一邊', ACTIONS['flip-side'], '', { off: many || n.parentId !== P.rootId }),
      I(n.isCollapsed ? '▸' : '▾', n.isCollapsed ? '展開下一層' : '收合下一層', () => toggleCollapse(n.id), '', { off: many || !hasKids }),
      I('🌳', '選取整個分支', () => selectBranch(n.id), '', { off: many || !hasKids }),
      I('🔍', '聚焦這個分支（放大來看）', () => focusBranch(n.id), '', { off: many }),
      SEP,
      I('🎨', '複製樣式', copyStyle, '', { off: many }),
      I('🖌️', '貼上樣式', pasteStyle, '', { off: !STYLE_CLIP }),
      I('〰️', '畫連結線', () => toggleDraw(true)),
      I(n.blank ? '☑️' : '⬜', '挖空', () => setStyle('blank', !n.blank)),
      I(n.zhuyin ? '☑️' : '⬜', '加注音', () => setStyle('zhuyin', !n.zhuyin)),
      I('🖼️', '加入圖片', pickImage),
      I('✂️', '拆成獨立方塊', ACTIONS['detach-node'], '', { off: many || !n.parentId }),
      I('⚙️', '更多設定…', () => openPanelTo('#f-text')),
      SEP,
      I('🗑️', '刪除', () => deleteSelected(), 'Delete', { off: isRoot && !many, danger: true })
    ];
  }
  if (hit.kind === 'link') {
    const tree = hit.id.startsWith('T:');
    const l = !tree && P.links.find(k => k.id === hit.id);
    return [
      I('🔤', tree ? '在線上加文字' : '編輯線上的文字', () => openPanelTo(tree ? '#f-tline-label' : '#f-link-label')),
      I('⚙️', '顏色、粗細、箭頭…', () => openPanelTo(tree ? '#sec-tline' : '#sec-link')),
      SEP,
      ...(tree ? [
        I('↺', '恢復預設樣式', ACTIONS['tline-reset']),
        I('👯', '同層的線都套用這個樣式', ACTIONS['tline-all-siblings']),
        I('✂️', '斷開（下一層變獨立方塊）', ACTIONS['tline-detach'])
      ] : [
        I('⇄', '反轉方向', () => { const a = l.a; l.a = l.b; l.b = a; const s2 = l.arrowStart; l.arrowStart = l.arrowEnd; l.arrowEnd = s2; render(); commit(); }),
        I('↔', l.arrowStart && l.arrowEnd ? '改回單向箭頭' : '改成雙向箭頭', () => { if (l.arrowStart && l.arrowEnd) l.arrowStart = false; else { l.arrowStart = true; l.arrowEnd = true; } render(); commit(); syncPanel(); }),
        I('📏', '拉直', ACTIONS['link-straight'], '', { off: !l.bend }),
        I('⧉', '複製一條', () => { const k = clone(l); k.id = uid('l'); ['a', 'b'].forEach(e => { if (!k[e].node) { k[e].x += 30; k[e].y += 30; } }); if (k.a.node && k.b.node) k.bend = { x: (l.bend ? l.bend.x : 0) + 40, y: (l.bend ? l.bend.y : 0) + 40 }; P.links.push(k); selLink = k.id; render(); commit(); syncPanel(); })
      ]),
      SEP,
      I('🎨', '複製線的樣式', copyLineStyle),
      I('🖌️', '貼上線的樣式', pasteLineStyle, '', { off: !LINE_CLIP }),
      SEP,
      I('🗑️', tree ? '只刪除這條線' : '刪除這條線', () => deleteSelected(), 'Delete', { danger: true })
    ];
  }
  return [
    I('📥', '貼上（放在這裡）', () => pasteClip(null, ctxWorld), 'Ctrl+V', { off: !CLIP }),
    I('⬭', '在這裡加一個框', () => addFreeNode(ctxWorld.x, ctxWorld.y)),
    I('〰️', '畫連結線', () => toggleDraw(true)),
    SEP,
    I('☑️', '全部選取', selectAll, 'Ctrl+A'),
    I('↶', '復原', undo, 'Ctrl+Z', { off: hi <= 0 }),
    I('↷', '重做', redo, 'Ctrl+Y', { off: hi >= hist.length - 1 }),
    SEP,
    I('🔄', '重新自動排版', ACTIONS.relayout),
    I('🔍', '整張放進畫面', ACTIONS.fit),
    I('➕', '全部展開', ACTIONS['expand-all']),
    I('➖', '收合到第一層', ACTIONS['collapse-all']),
    I('〰️', '找回刪掉的分支線', ACTIONS['show-hidden-lines']),
    SEP,
    I('🖼️', '匯出圖片 (PNG)', exportPNG),
    I('🖨️', '列印／學習單', openPrint)
  ];
}
function selectAll() { selNodes = new Set(visibleSet()); selLink = null; render(); syncPanel(); }
function openCtx(hit, cx, cy) {
  closeCtx(); finishEdit();
  if (presenting) return;
  ctxWorld = toWorld(cx, cy);
  if (drawMode) toggleDraw(false);
  if (boxMode) toggleBox(false);
  if (hit.kind === 'node') { if (!selNodes.has(hit.id)) { selNodes = new Set([hit.id]); } selLink = null; }
  else if (hit.kind === 'link') { selLink = hit.id; selNodes.clear(); }
  else if (hit.kind === 'toggle' || hit.kind === 'handle' || hit.kind === 'resize') return;
  render(); syncPanel();
  const items = ctxItems(hit);
  const m = document.createElement('div');
  m.id = 'ctx-menu';
  m.innerHTML = items.map((it, i) => it.sep ? '<div class="cm-sep"></div>' :
    `<button data-cm="${i}" ${it.off ? 'disabled' : ''} class="${it.danger ? 'danger' : ''}"><span class="cm-ic">${it.icon}</span><span class="cm-lb">${it.label}</span><span class="cm-key">${it.key || ''}</span></button>`).join('');
  document.body.appendChild(m);
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = clamp(cx, 6, window.innerWidth - w - 6) + 'px';
  m.style.top = (cy + h > window.innerHeight - 6 ? Math.max(6, cy - h) : cy) + 'px';
  m.addEventListener('click', e => {
    const b = e.target.closest('[data-cm]'); if (!b || b.disabled) return;
    const it = items[+b.dataset.cm]; closeCtx(); it.fn();
  });
  m.addEventListener('contextmenu', e => e.preventDefault());
}
svg.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (gesture && gesture.longPressed) return;
  openCtx(hitInfo(e.target), e.clientX, e.clientY);
});
document.addEventListener('pointerdown', e => { if (!e.target.closest('#ctx-menu')) closeCtx(); }, true);
window.addEventListener('blur', closeCtx);

/* ---------------- 啟動 ---------------- */
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (d && Array.isArray(d.projects) && d.projects.length) {
      state.projects = d.projects.map(p => ({ links: [], ...p }));
      state.activeId = state.projects.some(p => p.id === d.activeId) ? d.activeId : state.projects[0].id;
      return true;
    }
  } catch (e) { }
  return false;
}
function init() {
  if (window.innerWidth < 900) document.body.classList.add('panel-closed');
  const had = load();
  if (!had) {
    const p = buildFromTree(MM_TEMPLATES.find(t => t.id === 'zhiqing').tree);
    p.palette = uiTheme === 'warm' ? 'warm' : 'indigo';
    state.projects = [p]; state.activeId = p.id;
  }
  P = state.projects.find(p => p.id === state.activeId);
  if (!had) applyPalette(P.palette, true);
  if (Object.values(P.nodes).some(n => n.zhuyin)) loadZhuyin();
  autoLayout(false);
  resetHistory(); renderTabs(); syncPanel(); fitView(false);
  if (!had) setTimeout(() => toast('第一次使用？右上角「❓ 說明」有操作教學'), 600);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { LAY.clear(); autoLayout(false); render(); });
}
window.addEventListener('resize', () => { if (presenting) fitView(false, pState.shown); else render(); });
init();
