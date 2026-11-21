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
  const button = $('#updateCheck');
  if (!button) return;
  const original = button.dataset.label || button.textContent;
  if (!button.dataset.label) button.dataset.label = original;
  button.textContent = text;
  button.disabled = true;
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => {
    button.textContent = original;
    button.disabled = false;
  }, 1800);
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


/* ---------- 检查更新 ---------- */
const UPDATE_KEY = 'gkf.update';
const UPDATE_URL = 'https://github.com/MrLaughing/shangan-mojuan/raw/refs/heads/main/update.json';
const CHECK_INTERVAL = 24 * 60 * 60 * 1000;

function compareVersion(a, b) {
  const pa = String(a || '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

function showUpdate(info) {
  const card = $('#updateCard');
  if (!card || !info || compareVersion(info.version, chrome.runtime.getManifest().version) <= 0) {
    if (card) card.hidden = true;
    return;
  }
  $('#updateVersion').textContent = 'v' + info.version;
  $('#updateHint').textContent = '下载后解压，再到扩展管理页点「重新加载」。';
  const list = $('#updateChangelog');
  list.innerHTML = '';
  (info.changelog || []).slice(0, 5).forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  });
  const download = $('#updateDownload');
  download.href = info.zip_url || info.release_url || 'https://github.com/MrLaughing/shangan-mojuan';
  download.textContent = info.zip_url ? '下载新版 ZIP' : '查看发布页';
  card.hidden = false;
}

function readUpdateState(callback) {
  try {
    chrome.storage.local.get([UPDATE_KEY], (o) => callback((o && o[UPDATE_KEY]) || {}));
  } catch (e) {
    callback({});
  }
}

function writeUpdateState(state) {
  try { chrome.storage.local.set({ [UPDATE_KEY]: state }); } catch (e) {}
}

function checkUpdate(force) {
  const button = $('#updateCheck');
  if (button) button.disabled = true;
  readUpdateState((state) => {
    const now = Date.now();
    if (!force && state.checkedAt && now - state.checkedAt < CHECK_INTERVAL) {
      showUpdate(state.info);
      if (button) button.disabled = false;
      return;
    }
    fetch(UPDATE_URL, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then((info) => {
        const latest = { checkedAt: now, info: info };
        writeUpdateState(latest);
        if (state.ignoredVersion && info && info.version === state.ignoredVersion) {
          if (button) button.disabled = false;
          return;
        }
        showUpdate(info);
        if (button) button.disabled = false;
        if (!force && info && compareVersion(info.version, chrome.runtime.getManifest().version) > 0) flash('发现新版');
      })
      .catch(() => {
        showUpdate(state.info);
        if (button) button.disabled = false;
        if (force) flash('检查失败，请稍后重试');
      });
  });
}

$('#updateCheck').addEventListener('click', () => checkUpdate(true));
$('#updateIgnore').addEventListener('click', () => {
  const card = $('#updateCard');
  const version = ($('#updateVersion').textContent || '').replace(/^v/, '');
  readUpdateState((state) => {
    state.ignoredVersion = version;
    writeUpdateState(state);
  });
  if (card) card.hidden = true;
  flash('已忽略此版本');
});
checkUpdate(false);

load();
