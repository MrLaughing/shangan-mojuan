/* 上岸莫卷 · 后台 service worker：安装时写入默认配置，切页时补发一次配置 */
const KEY = 'gkf.cfg';
const DEF = {
  enabled: true, theme: 'paper', size: 'm', focus: false,
  font: 'serif', fontName: '', lh: 1.95, weight: 400
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(KEY, (o) => {
    if (!o[KEY]) chrome.storage.local.set({ [KEY]: DEF });
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;
  if (!/^https?:\/\/spa\.fenbi\.com\/ti\//.test(tab.url)) return;
  chrome.storage.local.get(KEY, (o) => {
    const cfg = Object.assign({}, DEF, o[KEY] || {});
    chrome.tabs.sendMessage(tabId, { type: 'gkf.config', cfg }, () => void chrome.runtime.lastError);
  });
});

/* 专注模式：进入时把窗口切到全屏（等同 F11），退出时还原原来的窗口状态 */
const FOCUS_WIN_KEY = 'gkf.focusWin';

async function readFocusWin() {
  try {
    const o = await chrome.storage.session.get(FOCUS_WIN_KEY);
    return (o && o[FOCUS_WIN_KEY]) || {};
  } catch (e) {
    return {};
  }
}

async function writeFocusWin(map) {
  try {
    await chrome.storage.session.set({ [FOCUS_WIN_KEY]: map });
  } catch (e) {}
}

async function handleFocusFullscreen(winId, on) {
  const map = await readFocusWin();
  if (on) {
    let win;
    try {
      win = await chrome.windows.get(winId);
    } catch (e) {
      return;
    }
    if (win.state === 'fullscreen') {
      map[winId] = 'keep';
      await writeFocusWin(map);
      return;
    }
    map[winId] = win.state === 'maximized' ? 'maximized' : 'normal';
    await writeFocusWin(map);
    try {
      await chrome.windows.update(winId, { state: 'fullscreen' });
    } catch (e) {}
    return;
  }

  const prev = map[winId];
  if (prev === undefined) return;
  delete map[winId];
  await writeFocusWin(map);
  if (prev === 'keep') return;
  try {
    await chrome.windows.update(winId, { state: prev });
  } catch (e) {}
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== 'gkf.focusFullscreen') return;
  const winId = sender.tab && sender.tab.windowId;
  if (winId === undefined) return;
  handleFocusFullscreen(winId, !!msg.on);
});
