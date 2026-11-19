/* 上岸莫卷 · popup 设置逻辑 */
const KEY = 'gkf.cfg';
const FONT_KEY = 'gkf.font';
const DEF = { enabled: true, theme: 'paper', size: 'm', focus: false, font: 'serif', fontName: '', lh: 1.95, weight: 400 };
const SIZES = ['s', 'm', 'l'];
const FONTS = ['serif', 'sans', 'kai', 'custom'];
const MAX_FONT_BYTES = 20 * 1024 * 1024;

let cfg = Object.assign({}, DEF);
let fontMeta = null;
let lhTimer = 0;
const $ = (s) => document.querySelector(s);

function normalize(value) {
  const o = value || {};
  return {
    enabled: o.enabled !== false,
    theme: (o.theme === 'ink' || o.theme === 'dark') ? 'ink' : 'paper',
    size: SIZES.indexOf(o.size) >= 0 ? o.size : 'm',
    focus: o.focus === true,
    font: FONTS.indexOf(o.font) >= 0 ? o.font : 'serif',
    fontName: typeof o.fontName === 'string' ? o.fontName.slice(0, 80) : '',
    lh: isFinite(Number(o.lh)) ? Math.max(1.7, Math.min(2.2, Number(o.lh))) : 1.95,
    weight: Number(o.weight) === 500 || Number(o.weight) === 600 ? Number(o.weight) : 400
  };
}

function fontLabel() {
  if (cfg.font === 'custom') return fontMeta && fontMeta.name ? `自定义：${fontMeta.name}` : '自定义字体未导入';
  return { serif: '系统宋体', sans: '系统黑体', kai: '系统楷体' }[cfg.font] || '系统宋体';
}

function paint() {
  $('#enabled').checked = !!cfg.enabled;
  $('#focus').checked = !!cfg.focus;
  document.documentElement.setAttribute('data-theme', cfg.theme);
  document.querySelectorAll('.theme-card').forEach((b) => {
    b.classList.toggle('is-on', b.dataset.theme === cfg.theme);
  });
  document.querySelectorAll('#sizeSeg button').forEach((b) => {
    b.classList.toggle('is-on', b.dataset.size === cfg.size);
  });
  document.querySelectorAll('#fontSeg button').forEach((b) => {
    b.classList.toggle('is-on', b.dataset.font === cfg.font);
  });
  document.querySelectorAll('#weightSeg button').forEach((b) => {
    b.classList.toggle('is-on', Number(b.dataset.weight) === cfg.weight);
  });
  const range = $('#lhRange');
  if (range) range.value = String(cfg.lh);
  const lhValue = $('#lhValue');
  if (lhValue) lhValue.textContent = Number(cfg.lh).toFixed(2);
  const name = $('#fontName');
  if (name) name.textContent = '当前：' + fontLabel();
}

function save() {
  try {
    chrome.storage.local.set({ [KEY]: cfg }, () => {
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'gkf.config', cfg }, () => void chrome.runtime.lastError);
          }
        });
      } catch (e) {}
    });
  } catch (e) {}
}

function flash(text) {
  const el = $('#status');
  if (!el) return;
  el.textContent = text;
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => { el.textContent = ''; }, 1800);
}

function load() {
  try {
    chrome.storage.local.get([KEY, FONT_KEY], (o) => {
      cfg = normalize(o && o[KEY]);
      fontMeta = (o && o[FONT_KEY]) || null;
      paint();
    });
  } catch (e) {
    paint();
  }
}

/* ---------- 交互 ---------- */
$('#enabled').addEventListener('change', () => {
  cfg.enabled = $('#enabled').checked;
  paint();
  save();
  flash(cfg.enabled ? '已启用' : '已关闭');
});

$('#focus').addEventListener('change', () => {
  cfg.focus = $('#focus').checked;
  paint();
  save();
  flash(cfg.focus ? '专注模式已开启' : '已退出专注模式');
});

document.querySelectorAll('.theme-card').forEach((b) => {
  b.addEventListener('click', () => {
    cfg.theme = b.dataset.theme;
    paint();
    save();
    flash(cfg.theme === 'ink' ? '已切换：墨' : '已切换：纸');
  });
});

document.querySelectorAll('#sizeSeg button').forEach((b) => {
  b.addEventListener('click', () => {
    cfg.size = b.dataset.size;
    paint();
    save();
    flash('字号：' + b.textContent);
  });
});

/* ---------- 字体 ---------- */
function fontFormat(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'ttf') return 'truetype';
  if (ext === 'otf') return 'opentype';
  if (ext === 'woff') return 'woff';
  if (ext === 'woff2') return 'woff2';
  const type = (file.type || '').toLowerCase();
  if (type.indexOf('woff2') >= 0) return 'woff2';
  if (type.indexOf('woff') >= 0) return 'woff';
  if (type.indexOf('opentype') >= 0) return 'opentype';
  return 'truetype';
}

function readableFontName(name) {
  return (name || '自定义字体').replace(/\.[^.]+$/, '').slice(0, 60);
}

document.querySelectorAll('#fontSeg button').forEach((b) => {
  b.addEventListener('click', () => {
    if (b.dataset.font === 'custom' && !fontMeta) {
      flash('请先导入一个本地字体文件');
      $('#fontFile').click();
      return;
    }
    cfg.font = b.dataset.font;
    cfg.fontName = cfg.font === 'custom' && fontMeta ? readableFontName(fontMeta.name) : '';
    paint();
    save();
    flash('字体：' + fontLabel());
  });
});

$('#fontPick').addEventListener('click', () => $('#fontFile').click());

$('#fontFile').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!/^(ttf|otf|woff2?)$/.test(ext) && !/^font\//.test(file.type || '')) {
    flash('请选择 TTF、OTF、WOFF 或 WOFF2 字体文件');
    return;
  }
  if (file.size > MAX_FONT_BYTES) {
    flash('字体文件不能超过 20 MB');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const meta = { name: readableFontName(file.name), data: String(reader.result || ''), format: fontFormat(file) };
    chrome.storage.local.set({ [FONT_KEY]: meta }, () => {
      if (chrome.runtime.lastError) {
        flash('字体保存失败，请换一个文件重试');
        return;
      }
      fontMeta = meta;
      cfg.font = 'custom';
      cfg.fontName = meta.name;
      paint();
      save();
      flash('字体已导入：' + meta.name);
    });
  };
  reader.onerror = () => flash('字体文件读取失败');
  reader.readAsDataURL(file);
});

$('#fontClear').addEventListener('click', () => {
  chrome.storage.local.remove(FONT_KEY, () => {
    fontMeta = null;
    cfg.font = 'serif';
    cfg.fontName = '';
    paint();
    save();
    flash('已恢复系统宋体');
  });
});

$('#lhRange').addEventListener('input', () => {
  const range = $('#lhRange');
  cfg.lh = Number(range.value);
  $('#lhValue').textContent = cfg.lh.toFixed(2);
  clearTimeout(lhTimer);
  lhTimer = setTimeout(save, 120);
});

document.querySelectorAll('#weightSeg button').forEach((b) => {
  b.addEventListener('click', () => {
    cfg.weight = Number(b.dataset.weight);
    paint();
    save();
    flash('字重：' + b.textContent);
  });
});

load();
