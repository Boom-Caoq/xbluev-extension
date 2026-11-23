// 后台脚本：
//  1. 点插件图标 → 打开侧边栏；安装 / 更新后把脚本补注入到已经打开的 x.com 标签页；
//  2. 和蓝朋友网站通信（登录、账号和积分、「谁取关了我」接口）：所有网站请求都从这里发，带上插件令牌（Authorization: Bearer）。
//     令牌只存在浏览器本地（chrome.storage.local），网站里可以随时断开。
// 网站地址来自 config.js（由 scripts/build-extension.mjs 按 .env 的 SITE_URL 生成）。
importScripts('config.js');
const SITE = String(self.XBV_CONFIG?.site || '').replace(/\/+$/, '');

chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

const inject = async (tabId) => {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['hook.js'], world: 'MAIN' }).catch(() => {});
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content-x.js'] }).catch(() => {});
};
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] });
  for (const t of tabs) if (t.id != null && !t.discarded) inject(t.id);
});

const saveLogin = (token, name) => chrome.storage.local.set({ token, name: String(name || '').slice(0, 80) });
const logout = () => chrome.storage.local.remove(['token', 'name', 'account']);

/** 请求网站：带插件令牌；令牌失效（401）时清掉，插件回到未登录状态 */
async function site(method, path, body, { cookies = false } = {}) {
  const { token } = await chrome.storage.local.get('token');
  try {
    const r = await fetch(`${SITE}${path}`, {
      method,
      credentials: cookies ? 'include' : 'omit',
      headers: { ...(token && !cookies ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 && token && !cookies) await logout();
    return { status: r.status, ok: r.ok && data.ok !== false, ...data };
  } catch {
    return { status: 0, ok: false, error: 'offline' };
  }
}

/** 网站一键登录：用浏览器里已登录的网站账号换一个插件令牌；网站没登录时返回 site_not_logged_in */
async function siteLogin() {
  const r = await site('POST', '/api/ext/token', null, { cookies: true });
  if (r.status === 401) return { ok: false, error: 'site_not_logged_in' };
  if (!/^[a-f0-9]{64}$/i.test(r.token || '')) return { ok: false, error: r.error || 'failed' };
  await saveLogin(r.token, r.name);
  return { ok: true, name: r.name };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const fromSelf = !!sender?.url && sender.url.startsWith(chrome.runtime.getURL(''));
  const fromSite = !!sender?.url && !!SITE && sender.url.startsWith(SITE + '/');
  (async () => {
    switch (msg?.type) {
      // 侧边栏发现当前 x.com 标签页里还没有脚本（例如插件刚更新）时，补注入一次
      case 'inject': if (fromSelf && msg.tabId != null) { await inject(msg.tabId); return reply({ ok: true }); } break;
      // 侧边栏请求网站接口（只接受插件自己的页面，只能请求 /api/ext/ 下的接口）
      case 'site': if (fromSelf && /^\/api\/ext\/[a-z-]+(\?lang=(zh|en))?$/.test(msg.path || '')) return reply(await site(msg.method || 'GET', msg.path, msg.body)); break;
      case 'siteLogin': if (fromSelf) return reply(await siteLogin()); break;
      case 'sendCode': if (fromSelf) return reply(await site('POST', '/api/ext/code', { identifier: msg.identifier })); break;
      case 'login': if (fromSelf) {
        const r = await site('POST', '/api/ext/login', { identifier: msg.identifier, password: msg.password, code: msg.code });
        if (r.ok && /^[a-f0-9]{64}$/i.test(r.token || '')) { await saveLogin(r.token, r.name); return reply({ ok: true, name: r.name }); }
        return reply({ ok: false, error: r.error || 'failed' });
      } break;
      case 'logout': if (fromSelf) { await logout(); return reply({ ok: true }); } break;
      // 网站插件页「一键登录插件」交来的令牌：只接受配置的网站页面发来的
      case 'connect': if (fromSite && /^[a-f0-9]{64}$/i.test(msg.token || '')) { await saveLogin(msg.token, msg.name); return reply({ ok: true }); } break;
      case 'disconnect': if (fromSite || fromSelf) { await logout(); return reply({ ok: true }); } break;
    }
    reply({ ok: false, error: 'forbidden' });
  })();
  return true;
});
