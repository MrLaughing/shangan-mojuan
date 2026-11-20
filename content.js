/* ============================================================
 * 上岸莫卷 · 粉笔答题界面  v2.5.6
 *
 * 这一版只做三件事：
 *   1. 在 <html> 上挂主题 / 字号属性，样式全部交给 content.css；
 *   2. 注入一枚可收起的左下角工具胶囊（主题、字号、专注模式、考前提示）；
 *   3. 同步扩展弹窗里的设置。
 *
 * 刻意不做：
 *   - 不扫描 A/B/C/D 徽章，不给题目节点增删 class；
 *   - 不监听点击、不读取答案、不改动粉笔的任何答题逻辑；
 *   - 不监听 class 属性变化，避免与 Angular 渲染互相触发。
 * ============================================================ */
(function () {
  'use strict';

  var KEY = 'gkf.cfg';
  var FONT_KEY = 'gkf.font';
  var DEF = { enabled: true, theme: 'paper', size: 'm', focus: false, font: 'serif', fontName: '', lh: 1.95, weight: 400 };
  var SIZES = ['s', 'm', 'l'];
  var FONTS = ['serif', 'sans', 'kai', 'custom'];
  var root = document.documentElement;

  var cfg = {
    enabled: DEF.enabled, theme: DEF.theme, size: DEF.size, focus: DEF.focus,
    font: DEF.font, fontName: DEF.fontName, lh: DEF.lh, weight: DEF.weight
  };
  var appliedSig = '';
  var dock = null;
  var panel = null;
  var fontStyle = null;
  var observer = null;
  var lastUrl = location.href;
  var scanTimer = 0;
  var dockCollapsed = false;
  var focusHint = null;
  var focusHintTimer = 0;

  /* ---------- 配置 ---------- */
  function normalize(value) {
    var o = value || {};
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
  function sig() { return [cfg.enabled, cfg.theme, cfg.size, cfg.focus, cfg.font, cfg.lh, cfg.weight].join('|'); }

  function installFont(meta) {
    if (fontStyle) {
      fontStyle.remove();
      fontStyle = null;
    }
    var existing = document.getElementById('gkf-font-face');
    if (existing) existing.remove();
    if (!meta || typeof meta.data !== 'string' || meta.data.indexOf('data:') !== 0) return;
    var formats = { truetype: 'truetype', opentype: 'opentype', woff: 'woff', woff2: 'woff2' };
    var format = formats[meta.format] || 'truetype';
    fontStyle = document.createElement('style');
    fontStyle.id = 'gkf-font-face';
    fontStyle.textContent =
      '@font-face{font-family:"GK Custom Font";src:url("' + meta.data + '") format("' + format + '");' +
      'font-display:swap;font-style:normal;font-weight:normal;}';
    (document.head || root).appendChild(fontStyle);
    try {
      if (document.fonts && document.fonts.load) document.fonts.load('16px "GK Custom Font"');
    } catch (e) {}
  }

  function load(cb) {
    try {
      chrome.storage.local.get([KEY, FONT_KEY], function (o) {
        cfg = normalize(o && o[KEY]);
        installFont(o && o[FONT_KEY]);
        cb && cb();
      });
    } catch (e) {
      cb && cb();
    }
  }

  function save() {
    try { chrome.storage.local.set({ [KEY]: cfg }); } catch (e) {}
  }

  function reconfigure(next) {
    cfg = normalize(next);
    if (sig() !== appliedSig) apply();
  }

  /* ---------- 专注模式联动浏览器全屏 ---------- */
  var focusFullscreenOn = false;
  var focusFullscreenReady = false;

  function syncFocusFullscreen() {
    var want = !!cfg.focus && !!cfg.enabled;
    if (!focusFullscreenReady) {
      // 首次应用只记录状态：刷新页面时不会突然把浏览器顶到全屏
      focusFullscreenReady = true;
      focusFullscreenOn = want;
      return;
    }
    if (want === focusFullscreenOn) return;
    focusFullscreenOn = want;
    try {
      chrome.runtime.sendMessage({ type: 'gkf.focusFullscreen', on: want }, function () {
        void chrome.runtime.lastError;
      });
    } catch (e) {}
  }

  /* ---------- 应用 ---------- */
  function apply() {
    appliedSig = sig();
    if (!cfg.enabled) {
      root.classList.remove('gkf-on');
      root.removeAttribute('data-gkf-theme');
      root.removeAttribute('data-gkf-size');
      root.removeAttribute('data-gkf-focus');
      root.removeAttribute('data-gkf-font');
      root.style.removeProperty('--gk-stem-lh');
      root.style.removeProperty('--gk-reading-weight');
      document.querySelectorAll('app-answer-card[data-gkf-card-init]').forEach(function (el) {
        el.classList.remove('gkf-card-collapsed', 'gkf-card-open');
        el.removeAttribute('data-gkf-card-init');
      });
      document.querySelectorAll('.gkf-split-parent, .gkf-split-left, .gkf-split-right').forEach(function (el) {
        el.classList.remove('gkf-split-parent', 'gkf-split-left', 'gkf-split-right');
      });
      removeDock();
      syncFocusFullscreen();
      return;
    }
    root.classList.add('gkf-on');
    root.setAttribute('data-gkf-theme', cfg.theme);
    root.setAttribute('data-gkf-size', cfg.size);
    root.setAttribute('data-gkf-font', cfg.font);
    root.style.setProperty('--gk-stem-lh', String(cfg.lh));
    root.style.setProperty('--gk-reading-weight', String(cfg.weight));
    if (cfg.focus) root.setAttribute('data-gkf-focus', 'on');
    else root.removeAttribute('data-gkf-focus');
    if (dock) setDockCollapsed(!!cfg.focus);
    syncDock();
    syncFocusFullscreen();
  }

  /* ---------- 只在真的有题目的页面出现 ---------- */
  function hasQuestion() {
    return !!document.querySelector('app-ti, app-question-choice');
  }

  function syncDock() {
    if (!cfg.enabled || !hasQuestion()) {
      removeDock();
      return;
    }
    if (!document.body) return;
    // 粉笔切换题目/主题时偶尔会重建 body 子树，轨道丢了就补回来。
    if ((dock && !dock.isConnected) || (panel && !panel.isConnected)) {
      dock = null;
      panel = null;
    }
    if (!dock) buildDock();
    updateDock();
    syncSplitLayout();
    syncAnswerCard();
  }

  /* ---------- 资料分析双栏 ---------- */
  function commonAncestor(a, b) {
    if (!a || !b) return null;
    var seen = [];
    var n = a;
    while (n) {
      seen.push(n);
      n = n.parentElement;
    }
    n = b;
    while (n) {
      if (seen.indexOf(n) >= 0) return n;
      n = n.parentElement;
    }
    return null;
  }

  function directChildUnder(node, ancestor) {
    var n = node;
    while (n && n.parentElement !== ancestor) n = n.parentElement;
    return n && n.parentElement === ancestor ? n : null;
  }

  function syncSplitLayout() {
    var materials = document.querySelectorAll('.materials-container');
    for (var i = 0; i < materials.length; i++) {
      var mat = materials[i];
      var scope = mat.closest('app-tis') || document;
      var question = scope.querySelector('.questions-single-container');
      if (!question || !document.documentElement.contains(question)) continue;
      var parent = commonAncestor(mat, question);
      if (!parent || parent === document.body || parent === document.documentElement) continue;
      var left = directChildUnder(mat, parent);
      var right = directChildUnder(question, parent);
      if (!left || !right || left === right) continue;
      parent.classList.add('gkf-split-parent');
      left.classList.add('gkf-split-left');
      right.classList.add('gkf-split-right');
    }
  }

  document.addEventListener('pointerdown', function (e) {
    var handle = e.target.closest && e.target.closest('app-resizable .nz-resizable-handle');
    if (!handle) return;
    var resizable = handle.closest('app-resizable');
    var box = resizable && resizable.querySelector('.resizable-container');
    var left = box && box.querySelector('.left');
    if (!box || !left) return;
    // 松开 50/50 默认宽度前先把当前宽度落到内联样式，拖拽不会跳回 60%。
    left.style.width = Math.round(box.getBoundingClientRect().width / 2) + 'px';
    resizable.classList.add('gkf-split-custom');
  }, true);

  /* ---------- 答题卡折叠态 ---------- */
  function setCardCollapsed(on) {
    var card = document.querySelector('app-answer-card');
    if (!card) return;
    card.classList.toggle('gkf-card-collapsed', !!on);
    card.classList.toggle('gkf-card-open', !on);
  }

  function syncAnswerCard() {
    var card = document.querySelector('app-answer-card');
    if (!card) return;
    if (!card.hasAttribute('data-gkf-card-init')) {
      card.setAttribute('data-gkf-card-init', '1');
      setCardCollapsed(true);
    }
  }

  document.addEventListener('click', function (e) {
    var tag = e.target.closest && e.target.closest('app-answer-card .answer-card-tag');
    if (!tag) return;
    var card = tag.closest('app-answer-card');
    if (!card) return;
    e.preventDefault();
    e.stopPropagation();
    setCardCollapsed(!card.classList.contains('gkf-card-collapsed'));
  }, true);

  /* ---------- 工具轨 ---------- */
  var ICON_SUN = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>';
  var ICON_MOON = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></svg>';
  var ICON_BOOK = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5"/><path d="M8 7.5h8M8 11h5"/></svg>';
  var ICON_FOCUS = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/><path d="M9 12h6"/></svg>';
  var ICON_PLUS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M12 5.5v13M5.5 12h13"/></svg>';
  var ICON_MINUS = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M6 12h12"/></svg>';

  function buildDock() {
    if (!document.body) return;
    dock = document.createElement('div');
    dock.id = 'gkf-dock';
    dock.setAttribute('role', 'toolbar');
    dock.setAttribute('aria-label', '上岸莫卷');
    dock.innerHTML =
      '<button type="button" class="gkf-expand" data-act="expand" title="展开工具" aria-label="展开工具">' + ICON_PLUS + '</button>' +
      '<button type="button" data-act="theme" title="切换主题" aria-label="切换主题"></button>' +
      '<button type="button" data-act="size" title="切换字号" aria-label="切换字号"><span class="gkf-a">A</span></button>' +
      '<button type="button" data-act="focus" title="专注模式" aria-label="专注模式" aria-pressed="false">' + ICON_FOCUS + '</button>' +
      '<button type="button" data-act="tips" title="考前提示" aria-label="考前提示" aria-expanded="false">' + ICON_BOOK + '</button>' +
      '<button type="button" class="gkf-collapse" data-act="collapse" title="收起工具" aria-label="收起工具">' + ICON_MINUS + '</button>';

    focusHint = document.createElement('div');
    focusHint.id = 'gkf-focus-hint';
    focusHint.textContent = '专注模式已开启 · 按 F11 返回';

    dock.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'theme') {
        cfg.theme = cfg.theme === 'ink' ? 'paper' : 'ink';
        root.setAttribute('data-gkf-theme', cfg.theme);
        updateDock();
        save();
      } else if (act === 'size') {
        var i = SIZES.indexOf(cfg.size);
        cfg.size = SIZES[(i + 1) % SIZES.length];
        root.setAttribute('data-gkf-size', cfg.size);
        updateDock();
        save();
      } else if (act === 'focus') {
        cfg.focus = !cfg.focus;
        if (cfg.focus) root.setAttribute('data-gkf-focus', 'on');
        else root.removeAttribute('data-gkf-focus');
        setDockCollapsed(cfg.focus);
        updateDock();
        save();
        syncFocusFullscreen();
        showFocusHint(cfg.focus);
      } else if (act === 'tips') {
        togglePanel();
      } else if (act === 'collapse') {
        setDockCollapsed(true);
      } else if (act === 'expand') {
        setDockCollapsed(false);
      }
    });

    panel = document.createElement('div');
    panel.id = 'gkf-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '考前提示');
    panel.innerHTML =
      '<div class="gkf-kicker"><span>SHANG AN MO JUAN / 考前</span><button type="button" data-act="close" aria-label="收起">×</button></div>' +
      '<h4>考场三件事</h4>' +
      '<p class="gkf-sub">开考前读一遍，答题时少犯错。</p>' +
      '<div class="gkf-tip"><b>01</b><div><strong>先看问法</strong><span>先圈出「不属于」「错误的是」，再读选项，别被题面牵着走。</span></div></div>' +
      '<div class="gkf-tip"><b>02</b><div><strong>卡住就跳</strong><span>90 秒没有思路就标记跳过，做完回头再看，反而更通透。</span></div></div>' +
      '<div class="gkf-tip"><b>03</b><div><strong>分段核对</strong><span>每 10 题核对一次答题卡，别把检查留到最后五分钟。</span></div></div>' +
      '<div class="gkf-foot">Alt + T 切换主题 · Alt + M 专注 · Esc 收起面板 · F11 退出全屏</div>';

    panel.addEventListener('click', function (e) {
      if (e.target.closest('button[data-act="close"]')) togglePanel(false);
    });

    (document.body || root).appendChild(dock);
    (document.body || root).appendChild(panel);
    (document.body || root).appendChild(focusHint);
    setDockCollapsed(!!cfg.focus);
    updateDock();
  }

  function setDockCollapsed(on) {
    dockCollapsed = !!on;
    if (!dock) return;
    dock.classList.toggle('is-collapsed', dockCollapsed);
    dock.setAttribute('data-collapsed', dockCollapsed ? 'true' : 'false');
    if (dockCollapsed) togglePanel(false);
  }

  function showFocusHint(on) {
    clearTimeout(focusHintTimer);
    if (!focusHint) return;
    if (!on) {
      focusHint.classList.remove('is-visible');
      return;
    }
    focusHint.classList.add('is-visible');
    focusHintTimer = setTimeout(function () {
      if (focusHint) focusHint.classList.remove('is-visible');
    }, 3200);
  }

  function updateDock() {
    if (!dock) return;
    var themeBtn = dock.querySelector('button[data-act="theme"]');
    var sizeBtn = dock.querySelector('button[data-act="size"]');
    var focusBtn = dock.querySelector('button[data-act="focus"]');
    var tipsBtn = dock.querySelector('button[data-act="tips"]');
    if (themeBtn && themeBtn.getAttribute('data-theme') !== cfg.theme) {
      themeBtn.setAttribute('data-theme', cfg.theme);
      themeBtn.innerHTML = cfg.theme === 'ink' ? ICON_SUN : ICON_MOON;
      themeBtn.title = cfg.theme === 'ink' ? '切换到纸主题' : '切换到墨主题';
    }
    if (sizeBtn && sizeBtn.getAttribute('data-size') !== cfg.size) {
      sizeBtn.setAttribute('data-size', cfg.size);
      var labels = { s: '小', m: '标准', l: '大' };
      sizeBtn.title = '字号：' + labels[cfg.size];
      var a = sizeBtn.querySelector('.gkf-a');
      if (a) a.style.fontSize = cfg.size === 's' ? '13px' : cfg.size === 'l' ? '17px' : '15px';
    }
    if (focusBtn) {
      var focusOn = cfg.focus ? 'true' : 'false';
      if (focusBtn.getAttribute('aria-pressed') !== focusOn) {
        focusBtn.setAttribute('aria-pressed', focusOn);
        focusBtn.title = cfg.focus ? '退出专注模式（或按 F11 退出全屏）' : '专注模式：全屏、隐藏答题卡';
      }
    }
    if (tipsBtn) {
      var pressed = panel && panel.classList.contains('is-open') ? 'true' : 'false';
      if (tipsBtn.getAttribute('aria-pressed') !== pressed) tipsBtn.setAttribute('aria-pressed', pressed);
    }
  }

  function togglePanel(force) {
    if (!panel) return;
    var open = typeof force === 'boolean' ? force : !panel.classList.contains('is-open');
    panel.classList.toggle('is-open', open);
    if (dock) {
      var tipsBtn = dock.querySelector('button[data-act="tips"]');
      if (tipsBtn) {
        tipsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        tipsBtn.setAttribute('aria-pressed', open ? 'true' : 'false');
      }
    }
  }

  function removeDock() {
    if (dock) { dock.remove(); dock = null; }
    if (panel) { panel.remove(); panel = null; }
  }

  /* ---------- 页面变化：只观察结构，不观察 class ---------- */
  function watch() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(function (muts) {
      // 工具轨自身的重绘不算页面变化，否则会自己触发自己
      var relevant = false;
      for (var i = 0; i < muts.length; i++) {
        var t = muts[i].target;
        if (dock && (t === dock || dock.contains(t))) continue;
        if (panel && (t === panel || panel.contains(t))) continue;
        relevant = true;
        break;
      }
      if (!relevant) return;
      clearTimeout(scanTimer);
      scanTimer = setTimeout(syncDock, 240);
    });
    // 观察整个 documentElement，避免 body 被 SPA 重建后观察器失效。
    observer.observe(document.documentElement || root, { childList: true, subtree: true });

    setInterval(function () {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      syncDock();
    }, 1200);
  }

  /* ---------- 快捷键 ---------- */
  document.addEventListener('keydown', function (e) {
    if (!cfg.enabled) return;
    if (e.key === 'Escape') togglePanel(false);
    if (e.altKey && (e.key === 'm' || e.key === 'M')) {
      var tagM = (e.target && e.target.tagName || '').toLowerCase();
      if (tagM === 'input' || tagM === 'textarea' || (e.target && e.target.isContentEditable)) return;
      e.preventDefault();
      cfg.focus = !cfg.focus;
      if (cfg.focus) root.setAttribute('data-gkf-focus', 'on');
      else root.removeAttribute('data-gkf-focus');
      setDockCollapsed(cfg.focus);
      updateDock();
      save();
      syncFocusFullscreen();
      showFocusHint(cfg.focus);
      return;
    }
    if (e.altKey && (e.key === 't' || e.key === 'T')) {
      var tag = (e.target && e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      e.preventDefault();
      cfg.theme = cfg.theme === 'ink' ? 'paper' : 'ink';
      root.setAttribute('data-gkf-theme', cfg.theme);
      updateDock();
      save();
    }
  });

  /* ---------- 外部同步 ---------- */
  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === 'local' && changes[KEY]) reconfigure(changes[KEY].newValue);
      if (area === 'local' && changes[FONT_KEY]) installFont(changes[FONT_KEY].newValue);
    });
  } catch (e) {}
  try {
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (!msg) return;
      if (msg.type === 'gkf.config') {
        reconfigure(msg.cfg);
        sendResponse && sendResponse({ ok: true });
      }
    });
  } catch (e) {}

  /* ---------- 启动 ---------- */
  function boot() {
    load(function () {
      apply();
      watch();
      // Angular 渲染可能晚于 document_idle，再补两次轻量检查
      setTimeout(syncDock, 800);
      setTimeout(syncDock, 2200);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
