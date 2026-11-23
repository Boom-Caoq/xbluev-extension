// 侧边栏：像手机 App 一样，首页 + 底部菜单（首页 / 回关 / 取关 / 曝光 / 设置）。全部功能免费，不登录、不连接任何服务器。
// 读取数据时，让当前 x.com 标签页里的内容脚本去做（见 content-x.js / hook.js），进度实时回传到这里；结果存在 chrome.storage.local。
// 名单支持搜索、筛选、排序、分页，可以导出 CSV、复制用户名；统计结果可以生成分享图、一键发推。
const VERSION = chrome.runtime.getManifest().version;
const SHARE_URL = () => `https://xbluev.com/${EN ? 'en' : 'zh'}/extension`; // 分享文案里的插件介绍页（公开网址，不涉及任何接口）
const DEFAULT_AVATAR = 'icons/avatar.svg';
const PAGE = 50; // 名单每页人数
let EN = false;
const L = (zh, en) => (EN ? en : zh);
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const int = (v) => (Number(v) || 0).toLocaleString(EN ? 'en' : 'zh-CN');
const cmp = (v) => { v = Number(v) || 0; return Math.abs(v) >= 1e4 ? Intl.NumberFormat(EN ? 'en' : 'zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(v) : int(Math.round(v)); };
const hm = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? L('刚刚', 'just now') : m < 60 ? L(`${m} 分钟前`, `${m} min ago`) : m < 1440 ? L(`${Math.round(m / 60)} 小时前`, `${Math.round(m / 60)} h ago`) : hm(t); };
const get = (keys) => new Promise((r) => chrome.storage.local.get(keys, r));
const set = (o) => new Promise((r) => chrome.storage.local.set(o, r));
const bg = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, (v) => { void chrome.runtime.lastError; r(v || {}); }));
const isX = (url) => /^https:\/\/(x|twitter)\.com\//.test(url || '');
// 名单数据：对象 {h,n,a,v,f,i,id,c}；很旧的版本是数组，统一转换
const norm = (p) => (Array.isArray(p) ? { h: p[0], n: p[1], v: p[2] || 0, i: p[3] || 0, a: '', id: '', c: 0 } : p);
// 推特头像默认是 48px 的小图，换成 200px 的清晰版本
const big = (u) => String(u || '').replace(/_normal(\.\w+)$/, '_200x200$1');

// ---------- 图标：线性图标（和底部菜单同一风格，颜色跟随文字），不用 emoji
const ICON = {
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.1.3 1.4 1.3 2.6 2.5 2.6z"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
  flask: '<path d="M10 2v7.3L4.5 19a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 9.3V2"/><path d="M8.5 2h7M7 16h10"/>',
  link: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  crown: '<path d="M3 7l4 4 5-6 5 6 4-4-2 11H5z"/><path d="M5 21h14"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  'user-minus': '<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><path d="M22 11h-6"/>',
  'user-x': '<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><path d="m17 8 5 5m0-5-5 5"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  'check-circle': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z"/><path d="M12 9v4M12 17h.01"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  flag: '<path d="M4 22V4c1-1 3-2 5-2 3 0 4 2 7 2 1.5 0 2.5-.3 4-1v11c-1.5.7-2.5 1-4 1-3 0-4-2-7-2-2 0-4 1-5 2"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  bar: '<path d="M3 3v18h18"/><path d="M8 17v-5M13 17V8M18 17v-9"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  calculator: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  x: '<path fill="currentColor" stroke="none" d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78zm-1.08 16.2h1.7L7.4 4.73H5.58z"/>',
};
const ico = (name, cls = '') => `<svg class="i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ''}</svg>`;
const avatar = (r) => `<img class="av" src="${esc(r.a ? big(r.a) : DEFAULT_AVATAR)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-fallback="1" />`;

const S = { tab: 'home', xtab: null, me: '', acct: {}, exp: null, tasks: {}, rate: 20, vrate: 95, lostView: 'lost', list: { q: '', filter: 'all', sort: 'default', page: 1 } };
const resetList = () => { S.list = { q: '', filter: 'all', sort: 'default', page: 1 }; };

// ---------- 当前标签页和内容脚本
async function activeTab() { const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); return t || null; }
const tabMsg = (tabId, msg) => new Promise((r) => chrome.tabs.sendMessage(tabId, msg, (v) => { if (chrome.runtime.lastError) r(null); else r(v); }));
const inject = (tabId) => new Promise((r) => chrome.runtime.sendMessage({ type: 'inject', tabId }, () => { void chrome.runtime.lastError; r(); }));
async function whoami() {
  const t = await activeTab();
  S.xtab = t;
  if (!t || !isX(t.url)) return null;
  let r = await tabMsg(t.id, { type: 'whoami' });
  if (!r) { await inject(t.id); await new Promise((x) => setTimeout(x, 900)); r = await tabMsg(t.id, { type: 'whoami' }); }
  return r;
}
async function load() {
  const s = await get(['me', 'lang', 'taskStatus', 'convRate2', 'convVer', 'token', 'name', 'account']);
  EN = s.lang === 'en'; // 默认中文
  S.token = s.token || ''; S.name = s.name || '';
  if (!S.token) S.account = null; else if (!S.account && s.account) S.account = s.account;
  S.rate = Number(s.convRate2) || DEFAULT_RATE;
  S.vrate = Number(s.convVer) || DEFAULT_VRATE; // 新的转化率口径（默认 20%），不沿用旧版的设置
  if (s.taskStatus && !S.tasks[s.taskStatus.kind]) S.tasks[s.taskStatus.kind] = s.taskStatus;
  const w = await whoami();
  S.me = w?.me || s.me || '';
  S.hook = w?.hook || null;
  if (S.me) {
    const a = await get([`acct:${S.me}`, `exp:${S.me}`]);
    S.acct = a[`acct:${S.me}`] || {};
    S.exp = a[`exp:${S.me}`] || null;
  }
  // 账号信息在后台刷新，先用上次存的显示
  if (S.token && (!S.account || Date.now() - (S.accountAt || 0) > 30e3)) { S.accountAt = Date.now(); refreshAccount().then(() => render()); }
}

// ---------- 任务
async function run(kind) {
  // 谁取关了我：走蓝朋友网站接口（不读 x.com 页面）；一键读取全部 = 关注名单（读 x.com）+ 粉丝名单（接口），同时进行
  if (kind === 'unfollow') return runUnfollow();
  if (kind === 'both') { if (S.token && unfollowWait() === 0) runUnfollow(); else if (S.token) setTask('unfollow', 'info', frozenTip()); kind = 'nofb'; }
  const t = await activeTab();
  if (!t || !isX(t.url)) { S.tab = 'home'; return render(); }
  const kinds = [kind];
  for (const k of kinds) S.tasks[k] = { kind: k, phase: 'progress', text: L('准备中…', 'Starting…'), at: Date.now() };
  render();
  let r = await tabMsg(t.id, { type: 'run', kind });
  if (!r) { await inject(t.id); await new Promise((x) => setTimeout(x, 900)); r = await tabMsg(t.id, { type: 'run', kind }); }
  if (!r?.ok) {
    const text = r?.error === 'too_soon' ? L(`刚刚读过，为了账号安全请 ${r.wait} 秒后再读。`, `Just read — for your account’s safety, wait ${r.wait}s before reading again.`) : r?.error === 'need_first' ? L('第一次请先分别读一次「回关」和「取关」，之后就能同时读取', 'Run each list once first, then read both at once') : r?.error === 'busy' ? L('正在读取中，请稍等', 'Already reading') : L('没能开始，请刷新 x.com 页面后再试', 'Couldn’t start. Reload x.com and try again');
    for (const k of kinds) S.tasks[k] = { kind: k, phase: 'error', text, at: Date.now() };
    render();
  }
}
const stop = async () => { const t = await activeTab(); if (t) await tabMsg(t.id, { type: 'stop' }); };
const running = (k) => { const t = S.tasks[k]; return t && t.phase === 'progress' && Date.now() - t.at < 120000; };
const TASK_NAME = () => ({ nofb: L('关注名单', 'Following'), unfollow: L('粉丝名单', 'Followers'), exposure: L('近 3 天帖子', 'Last 3 days'), verified: L('认证粉丝', 'Verified') });
/** 读取进度：知道总人数时显示百分比进度条，不知道时显示滚动的进度条 */
function taskBox(k, withName = false) {
  const t = S.tasks[k];
  if (!t || Date.now() - t.at > 10 * 60e3) return '';
  if (t.phase === 'progress') {
    const pct = t.pct ?? null;
    return `<div class="prog"><div class="pl"><span class="spin"></span><span>${withName ? `<b>${esc(TASK_NAME()[k] || '')}</b> · ` : ''}${esc(t.text)}</span></div><div class="pbar${pct == null ? ' ind' : ''}"><i${pct == null ? '' : ` style="width:${pct}%"`}></i></div></div>`;
  }
  if (t.phase === 'error' || t.phase === 'stopped') return `<div class="err">${esc(t.text)}</div>`;
  if (t.phase === 'info') return `<div class="infobox">${ico('info')}<span>${esc(t.text)}</span></div>`;
  if (t.phase === 'done') return `<div class="okbox">${ico('check')}${esc(t.text)}</div>`;
  return '';
}
const runBtn = (k, label, cls = 'main') => running(k) ? `<button class="btn" data-stop="1">${L('停止', 'Stop')}</button>` : `<button class="btn ${cls}" data-run="${k}">${label}</button>`;

// ---------- 蓝朋友账号：登录、会员和积分（所有网站请求都经后台脚本发出，带插件令牌）
const SITE = String(self.XBV_CONFIG?.site || 'https://xbluev.com').replace(/\/+$/, '');
const siteUrl = (path) => `${SITE}/${EN ? 'en' : 'zh'}${path}`;
const api = (method, path, body) => bg({ type: 'site', method, path, body });
let accountLoading = null;
/** 刷新账号信息（会员、有效期、积分、今天是否已领取）；第一次登录时网站会赠送积分 */
async function refreshAccount() {
  if (!S.token) { S.account = null; return; }
  accountLoading ||= api('GET', '/api/ext/me').catch(() => ({ ok: false })).then(async (r) => {
    if (r.ok) { S.account = r; await set({ account: { ...r, gift: 0, at: Date.now() } }); if (r.gift) S.gift = r.gift; }
    else if (r.error === 'not_connected') { S.token = ''; S.account = null; }
  }).finally(() => { accountLoading = null; });
  await accountLoading;
}
const PLAN_NAME = () => ({ free: L('免费版', 'Free'), monthly: L('月度会员', 'Monthly'), yearly: L('年度会员', 'Yearly') });
const dateOnly = (iso) => iso ? new Date(iso).toLocaleDateString(EN ? 'en' : 'zh-CN') : '';
/** 账号卡片：没登录时显示登录方式；登录后显示会员、积分、每日领取 */
function accountCard(compact = false) {
  if (!S.token) return loginCard();
  const a = S.account;
  if (!a) return `<div class="card acct"><p class="muted">${L('正在读取账号信息…', 'Loading your account…')}</p></div>`;
  const vip = a.active && a.plan !== 'free';
  return `<div class="card acct">
    ${S.gift ? `<div class="okbox" style="margin:0 0 10px">${ico('gift')}${L(`首次登录插件，已赠送 ${int(S.gift)} 积分！`, `Welcome gift: ${int(S.gift)} points added!`)}</div>` : ''}
    <div class="acct-hd"><div class="acct-name"><b>${esc(a.name || S.name || L('蓝朋友账号', 'XBlueV account'))}</b><span class="badge ${vip ? 'vip' : ''}">${esc(PLAN_NAME()[vip ? a.plan : 'free'])}</span><button class="lnk acct-out" id="logout">${ico('logout')}${L('退出登录', 'Sign out')}</button></div>
      <small class="muted">${vip ? L(`有效期至 ${dateOnly(a.expiresAt)}`, `Until ${dateOnly(a.expiresAt)}`) : L('订阅会员每月多送积分', 'Subscribers get more points every month')}</small></div>
    <div class="acct-pts"><div><small>${L('我的积分', 'Points')}</small><b>${int(a.points)}</b></div>
      <div class="btns" style="margin:0">${a.claimedToday ? `<button class="btn sm" disabled>${L('今日已领取', 'Claimed today')}</button>` : `<button class="btn sm main" id="claim">${ico('gift')}${L('领取今日积分', 'Claim today’s points')}</button>`}${compact ? '' : `<button class="btn sm" data-open="/pricing?from=extension">${vip ? L('查看订阅', 'Subscription') : L('去订阅', 'Subscribe')}</button>`}</div></div>
    <p class="msg" id="claimMsg"></p></div>`;
}
let loginMode = 'password', loginOpen = false;
function loginCard() {
  return `<div class="card acct">
    <h3>${ico('user')}${L('登录蓝朋友账号', 'Sign in to XBlueV')}</h3>
    <p class="muted">${L('首次登录插件赠送 300 积分。登录后可以用「谁取关了我」（通过网站接口读取，按量扣积分），查看会员和积分，每天领取积分。', 'Get 300 points the first time you sign in. Signing in unlocks “Who unfollowed me” (read through the XBlueV API, billed in points), your membership and points, and daily point claims.')}</p>
    <div class="btns"><button class="btn main" id="siteLogin">${L('网站一键登录', 'Sign in with the website')}</button><button class="btn" id="showLogin">${L('账号密码登录', 'Username & password')}</button><button class="btn" data-open="/login?next=${encodeURIComponent('/' + (EN ? 'en' : 'zh') + '/extension?connect=1')}#register">${L('注册', 'Sign up')}</button></div>
    <p class="msg" id="siteMsg"></p>
    <div id="loginForm" ${loginOpen ? '' : 'hidden'}>
      <div class="seg" style="margin-top:10px"><button data-m="password" class="${loginMode === 'password' ? 'on' : ''}">${L('密码登录', 'Password')}</button><button data-m="code" class="${loginMode === 'code' ? 'on' : ''}">${L('邮箱验证码', 'Email code')}</button></div>
      <label class="f" for="lid">${L('用户名或邮箱', 'Username or email')}</label><input class="in" id="lid" autocomplete="username" />
      <div id="pwBox" ${loginMode === 'password' ? '' : 'hidden'}><label class="f" for="lpw">${L('密码', 'Password')}</label><input class="in" id="lpw" type="password" autocomplete="current-password" /></div>
      <div id="codeBox" ${loginMode === 'code' ? '' : 'hidden'}><label class="f" for="lcode">${L('验证码', 'Code')}</label><div class="row"><input class="in" id="lcode" inputmode="numeric" maxlength="6" placeholder="${L('6 位数字', '6 digits')}" /><button class="btn" id="sendCode">${L('发送', 'Send')}</button></div></div>
      <div class="btns"><button class="btn main full" id="doLogin">${L('登录', 'Sign in')}</button></div><p class="msg" id="loginMsg"></p></div></div>`;
}
const LOGIN_ERR = () => ({ invalid_credentials: L('账号或密码不对', 'Wrong username or password'), use_code_login: L('这个账号没有设置密码，请用邮箱验证码登录', 'No password on this account — use an email code'), code_invalid: L('验证码不对或已过期', 'Invalid or expired code'), too_many_attempts: L('尝试次数太多，请稍后再试', 'Too many attempts, try later'), account_not_found: L('没有找到这个账号', 'Account not found'), ambiguous_username: L('有多个同名账号，请用邮箱登录', 'Several accounts share that name — use your email'), code_too_frequent: L('发送太频繁，请稍后再试', 'Too soon, try again shortly'), code_rate_limited: L('今天发送次数太多了', 'Too many codes today'), smtp_not_configured: L('网站邮件服务还没配置', 'Email isn’t configured on the site'), offline: L('连不上蓝朋友网站，请检查网络', 'Can’t reach XBlueV — check your connection'), identifier_required: L('请填写用户名或邮箱', 'Enter your username or email'), password_required: L('请填写密码', 'Enter your password') });
const openSite = (path) => chrome.tabs.create({ url: siteUrl(path) });
function bindAccount() {
  document.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => openSite(b.dataset.open));
  $('claim')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    const r = await api('POST', '/api/ext/claim');
    const m = $('claimMsg');
    if (r.ok) { S.account = { ...S.account, points: r.points, claimedToday: true }; render(); const m2 = $('claimMsg'); if (m2) { m2.className = 'msg ok'; m2.textContent = L(`领取成功 +${r.amount} 积分`, `+${r.amount} points`); } }
    else { e.target.disabled = false; if (m) { m.className = 'msg bad'; m.textContent = r.error === 'claim_already_today' ? L('今天已经领过了，明天再来', 'Already claimed today') : L('领取失败，请稍后再试', 'Couldn’t claim — try later'); } if (r.error === 'claim_already_today') { S.account.claimedToday = true; render(); } }
  });
  $('siteLogin')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    const r = await bg({ type: 'siteLogin' });
    e.target.disabled = false;
    if (r.ok) return refresh();
    const m = $('siteMsg');
    if (r.error === 'site_not_logged_in') {
      // 网站还没登录：打开网站登录页，登录后网站插件页会自动把登录交给插件
      openSite(`/login?next=${encodeURIComponent('/' + (EN ? 'en' : 'zh') + '/extension?connect=1')}`);
      m.className = 'msg'; m.textContent = L('已打开蓝朋友网站：登录后会自动连接插件，回到这里就能用了。', 'XBlueV opened in a new tab — sign in there and the extension connects automatically.');
    } else { m.className = 'msg bad'; m.textContent = LOGIN_ERR()[r.error] || L('登录失败，请稍后再试', 'Sign-in failed'); }
  });
  $('showLogin')?.addEventListener('click', () => { loginOpen = !loginOpen; $('loginForm').hidden = !loginOpen; });
  document.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { loginMode = b.dataset.m; document.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('on', x === b)); $('pwBox').hidden = loginMode !== 'password'; $('codeBox').hidden = loginMode !== 'code'; });
  $('sendCode')?.addEventListener('click', async (e) => {
    const id = $('lid').value.trim();
    const m = $('loginMsg');
    if (!id) { m.className = 'msg bad'; m.textContent = LOGIN_ERR().identifier_required; return; }
    e.target.disabled = true;
    const r = await bg({ type: 'sendCode', identifier: id });
    m.className = r.ok ? 'msg ok' : 'msg bad';
    m.textContent = r.ok ? L(`验证码已发到 ${r.sentTo || '你的邮箱'}`, `Code sent to ${r.sentTo || 'your email'}`) : LOGIN_ERR()[r.error] || L('发送失败', 'Couldn’t send');
    setTimeout(() => { e.target.disabled = false; }, r.ok ? 60000 : 1500);
  });
  $('doLogin')?.addEventListener('click', async (e) => {
    const identifier = $('lid').value.trim();
    const m = $('loginMsg');
    e.target.disabled = true;
    const r = await bg(loginMode === 'password' ? { type: 'login', identifier, password: $('lpw').value } : { type: 'login', identifier, code: $('lcode').value.trim() });
    e.target.disabled = false;
    if (r.ok) { loginOpen = false; return refresh(); }
    m.className = 'msg bad'; m.textContent = LOGIN_ERR()[r.error] || L('登录失败', 'Sign-in failed');
  });
  // 退出登录：只清掉插件里的登录令牌和账号信息；读到的名单、取关记录还留在本机（可以在「本地数据」里清除）
  $('logout')?.addEventListener('click', async () => {
    if (!confirm(L('退出蓝朋友账号？退出后不能使用「谁取关了我」，已经读到的名单和记录会保留。', 'Sign out of XBlueV? “Who unfollowed me” will need you to sign in again; your saved lists stay.'))) return;
    await bg({ type: 'logout' });
    await new Promise((r) => chrome.storage.local.remove(['token', 'name', 'account'], r)); // 后台没响应也要确保退出
    S.token = ''; S.account = null; S.gift = 0;
    refresh();
  });
}

// ---------- 积分不足提示：可以领取今日积分，或者去订阅
function pointsModal(need, have) {
  let el = $('modal');
  if (!el) { el = document.createElement('div'); el.id = 'modal'; el.className = 'sheet center'; document.body.appendChild(el); el.addEventListener('click', (e) => { if (e.target === el) el.hidden = true; }); }
  const canClaim = S.account && !S.account.claimedToday;
  el.innerHTML = `<div class="sheet-box modal"><div class="sheet-hd"><b class="ttl">${ico('wallet')}${L('积分不足', 'Not enough points')}</b><button class="x" id="mX" aria-label="close">${ico('close')}</button></div>
    <p>${L(`这次需要 <b>${int(need)}</b> 积分，你现在有 <b>${int(have)}</b> 积分。`, `This needs <b>${int(need)}</b> points; you have <b>${int(have)}</b>.`)}</p>
    <p class="muted">${L('订阅会员每月发放大量积分，每天还能领取更多；也可以先领取今天的积分。', 'Subscribers get lots of points every month and bigger daily claims. You can also claim today’s points first.')}</p>
    <div class="btns"><button class="btn main" id="mPricing">${ico('crown')}${L('去订阅', 'Subscribe')}</button>${canClaim ? `<button class="btn" id="mClaim">${ico('gift')}${L('领取今日积分', 'Claim today’s points')}</button>` : ''}</div><p class="msg" id="mMsg"></p></div>`;
  el.hidden = false;
  $('mX').onclick = () => { el.hidden = true; };
  $('mPricing').onclick = () => { openSite('/pricing?from=extension'); el.hidden = true; };
  $('mClaim')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    const r = await api('POST', '/api/ext/claim');
    const m = $('mMsg');
    if (r.ok) { S.account = { ...S.account, points: r.points, claimedToday: true }; m.className = 'msg ok'; m.textContent = L(`领取成功 +${r.amount} 积分，现在有 ${int(r.points)} 积分`, `+${r.amount} points — ${int(r.points)} now`); render(); }
    else { m.className = 'msg bad'; m.textContent = L('今天已经领过了', 'Already claimed today'); }
  });
}

// ---------- 谁取关了我：网站接口读粉丝 ID → 本地对比 → 只给取关 / 新关注的人补资料 → 存在本地
const ID_STEP = { ids: [5, 60], diff: 65, users: [70, 96] };
async function runUnfollow() {
  try { await runUnfollowInner(); }
  catch (e) { console.error('[xbluev] unfollow', e); setTask('unfollow', 'error', L('读取失败，请稍后再试', 'Couldn’t read — try again later')); }
}
// 两次读取之间至少隔 6 小时：粉丝变化要有一段时间才对比得出来，也避免浪费积分
const UNF_GAP = 6 * 3600e3;
/** 距离可以再次读取还要多久（毫秒）；0 表示现在就可以读 */
const unfollowWait = () => { const at = S.acct.followers?.at || 0; return at ? Math.max(0, at + UNF_GAP - Date.now()) : 0; };
const waitText = (ms) => { const m = Math.ceil(ms / 60000), h = Math.floor(m / 60), r = m % 60; return h ? L(`${h} 小时 ${r} 分`, `${h}h ${r}m`) : L(`${r} 分钟`, `${r} min`); };
const clock = (t) => { const d = new Date(t); const today = new Date().toDateString() === d.toDateString(); return `${today ? L('今天', 'today') : L('明天', 'tomorrow')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const frozenTip = () => L(`粉丝的变化需要一段时间才能对比出来：距离上次读取还不到 6 小时，现在读到的名单和上次几乎一样，对比不出谁取关了你。请在 ${clock(Date.now() + unfollowWait())} 之后再读取（还要等 ${waitText(unfollowWait())}）。`,
  `Follower changes need time to show up: it’s been less than 6 hours since your last read, so there would be almost nothing to compare. Read again after ${clock(Date.now() + unfollowWait())} (${waitText(unfollowWait())} from now).`);
async function runUnfollowInner() {
  if (!S.token) { S.tab = 'lost'; render(); return; }
  if (unfollowWait() > 0) { setTask('unfollow', 'info', frozenTip()); return; }
  if (!S.me) { setTask('unfollow', 'error', L('还没有识别到你的推特号：请先在当前标签页打开 x.com 并登录。', 'Your X account isn’t detected yet — open x.com in this tab and sign in.')); return; }
  if (running('unfollow')) return;
  const me = S.me;
  const t0 = Date.now();
  // 第一步：网站接口读全部粉丝 ID（服务器一页 5000 个往下读）。这一步在服务器上完成，进度按预计用时推进
  setTask('unfollow', 'progress', L('正在通过蓝朋友接口读取你的粉丝名单…', 'Reading your followers through the XBlueV API…'), ID_STEP.ids[0]);
  const expected = Math.max(4000, ((S.acct.followers?.count || 3000) / 5000) * 3500 + 2500);
  const tick = setInterval(() => { const t = S.tasks.unfollow; if (!t || t.phase !== 'progress' || t.pct >= ID_STEP.ids[1] - 1) return; const p = ID_STEP.ids[0] + (ID_STEP.ids[1] - ID_STEP.ids[0]) * Math.min(0.97, (Date.now() - t0) / expected); setTask('unfollow', 'progress', t.text, Math.round(p)); }, 300);
  const r = await api('POST', '/api/ext/follower-ids', { handle: me });
  clearInterval(tick);
  if (!r.ok) return unfollowFailed(r);
  if (S.account) S.account.points = r.points;
  // 第二步：本地对比
  setTask('unfollow', 'progress', L(`已读取 ${int(r.ids.length)} 位粉丝，正在对比…`, `Read ${int(r.ids.length)} followers, comparing…`), ID_STEP.diff);
  const key = `acct:${me}`;
  const a = (await get(key))[key] || {};
  const prev = a.followers?.ids?.length && a.followers.ids.every((x) => /^\d+$/.test(x)) ? a.followers : null;
  const cur = r.ids, curSet = new Set(cur);
  let diff = null, note = '', spentUsers = 0;
  const prof = { ...(a.prof || {}) };
  if (!r.complete) note = L(`这次只读到 ${int(cur.length)} / ${int(r.count)} 位粉丝，可能没读完整，这次不做对比。`, `Only ${int(cur.length)} / ${int(r.count)} followers were returned — not compared this time.`);
  else if (!prev) note = '';
  else {
    const prevSet = new Set(prev.ids);
    const lostIds = prev.ids.filter((id) => !curSet.has(id));
    const gainedIds = cur.filter((id) => !prevSet.has(id));
    // 第三步：取关和新关注的人要显示头像：本地缓存里有的直接用，其余请网站补（站内库免费，查不到的才调接口）
    const need = [...lostIds, ...gainedIds.slice(0, 500)].filter((id) => !prof[id]);
    if (need.length) {
      setTask('unfollow', 'progress', L(`${int(lostIds.length)} 人取关、${int(gainedIds.length)} 人新关注，正在加载头像…`, `${int(lostIds.length)} unfollowed, ${int(gainedIds.length)} new — loading avatars…`), ID_STEP.users[0]);
      const u = await api('POST', '/api/ext/users', { ids: need });
      if (u.ok) { for (const [id, p] of Object.entries(u.users || {})) prof[id] = [p.h, p.n, p.a, p.v, p.c]; spentUsers = u.charged || 0; if (u.points != null && S.account) S.account.points = u.points; }
      else if (u.error === 'insufficient_points') pointsModal(u.need, u.points);
    }
    const show = (id) => { const x = prof[id]; return x && x[0] && x[2] ? { id, h: x[0], n: x[1], a: x[2], v: x[3], c: x[4] || 0 } : null; };
    const following = new Set(a.followingKeys || []);
    const lost = lostIds.map((id) => { const p = show(id); return p ? { ...p, i: following.has(id) ? 1 : 0 } : null; }).filter(Boolean);
    const gained = gainedIds.map((id) => { const p = show(id); return p ? { ...p, f: 1 } : null; }).filter(Boolean);
    diff = { at: Date.now(), since: prev.at, source: 'api', lost, gained, lostTotal: lostIds.length, gainedTotal: gainedIds.length };
  }
  // 第四步：存在本地（下次打开插件直接显示，不用重新读）
  setTask('unfollow', 'progress', L('正在保存…', 'Saving…'), 98);
  const keepIds = new Set([...cur, ...(diff ? diff.lost.map((p) => p.id) : [])]);
  for (const e of a.events || []) for (const p of e.lost || []) keepIds.add(p.id);
  const fk = new Set(a.followingKeys || []);
  const slimProf = {};
  for (const id of Object.keys(prof)) if (keepIds.has(id) || fk.has(id)) slimProf[id] = prof[id];
  const latest = (await get(key))[key] || {};
  if (diff) latest.events = [diff, ...(latest.events || [])].slice(0, 30);
  if (r.complete) latest.followers = { at: Date.now(), ids: cur, count: cur.length };
  latest.prof = slimProf;
  await set({ [key]: latest });
  const secs = Math.max(1, Math.round((Date.now() - t0) / 1000));
  const spent = r.charged + spentUsers;
  const next = L('请 6 小时后再重新读取，就能看到这段时间谁取关了你、谁新关注了你。', 'Read again in 6 hours to see who unfollowed or followed you in between.');
  const text = (diff ? L(`粉丝 ${int(cur.length)} 人：${int(diff.lostTotal)} 人取关，${int(diff.gainedTotal)} 人新关注。`, `${int(cur.length)} followers: ${int(diff.lostTotal)} unfollowed, ${int(diff.gainedTotal)} new. `) + next : !prev && r.complete ? L('这是第一次读取，已保存为基准。', 'First read saved as a baseline. ') + next : note)
    + L(`（用时 ${secs} 秒）`, ` (${secs}s)`);
  setTask('unfollow', 'done', text, 100);
  refresh();
}
function unfollowFailed(r) {
  const E = {
    insufficient_points: L(`积分不足：这次需要 ${int(r.need)} 积分，你有 ${int(r.points)} 积分。`, `Not enough points: needs ${int(r.need)}, you have ${int(r.points)}.`),
    too_many: L(`你的粉丝超过 ${int(r.max)} 人，插件暂时读不了，可以用网站的「谁取关了我」每日统计。`, `More than ${int(r.max)} followers — use the website’s daily unfollow tracker instead.`),
    not_found: L('没有找到这个推特号', 'X account not found'), unavailable: L('这个推特号已被冻结或不可用', 'This X account is unavailable'),
    protected: L('受保护的账号读不了粉丝名单', 'Protected accounts can’t be read'), busy: L('正在读取中，请稍等', 'Already reading'),
    offline: L('连不上蓝朋友网站，请检查网络', 'Can’t reach XBlueV'), not_connected: L('登录已失效，请重新登录', 'Signed out — sign in again'),
    service_unavailable: L('网站接口暂时不可用，请稍后再试', 'The API is temporarily unavailable'),
  };
  setTask('unfollow', 'error', E[r.error] || L('读取失败，请稍后再试', 'Couldn’t read — try again later'));
  if (r.error === 'insufficient_points') pointsModal(r.need, r.points);
  if (r.error === 'not_connected') refresh();
}
function setTask(kind, phase, text, pct = null) { S.tasks[kind] = { kind, phase, text, pct, at: Date.now() }; set({ taskStatus: S.tasks[kind] }); render(); }

// ---------- 通用：不在 x.com / 没识别到账号
function gate() {
  if (!S.xtab || !isX(S.xtab.url)) return `<div class="card"><h3>${L('在 x.com 上使用', 'Use it on x.com')}</h3><p class="muted">${L('插件直接读取 x.com 页面。在当前标签页打开 x.com 并登录你的推特号就能开始。', 'The extension reads x.com pages directly. Open x.com in this tab and sign in.')}</p><div class="btns"><button class="btn main" id="openX">${L('在当前标签页打开 x.com', 'Open x.com here')}</button></div></div>`;
  if (!S.me) return `<div class="card"><h3>${L('没有识别到你的推特号', 'Couldn’t find your X account')}</h3><p class="muted">${L('请确认已经在 x.com 登录，等页面加载完再点「重新识别」。', 'Make sure you’re signed in on x.com, then retry.')}</p><div class="btns"><button class="btn main" id="retry">${L('重新识别', 'Retry')}</button></div></div>`;
  return '';
}

// ---------- 名单：搜索、筛选、排序、分页、导出
let CUR = { rows: [], name: '' }; // 当前显示的名单（导出用）
function people(rows, emptyText, name) {
  const { q, filter, sort } = S.list;
  const k = q.trim().toLowerCase();
  let shown = rows.filter((r) => (!k || String(r.h).toLowerCase().includes(k) || String(r.n).toLowerCase().includes(k)) && (filter === 'all' || (filter === 'v' ? r.v : !r.v)));
  if (sort === 'desc') shown = [...shown].sort((a, b) => (b.c || 0) - (a.c || 0));
  else if (sort === 'asc') shown = [...shown].sort((a, b) => (a.c || 0) - (b.c || 0));
  CUR = { rows: shown, name };
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  S.list.page = Math.min(S.list.page, pages);
  const from = (S.list.page - 1) * PAGE;
  const slice = shown.slice(from, from + PAGE);
  const vCount = rows.filter((r) => r.v).length;
  return `<div class="tools">
      <input class="search" id="q" placeholder="${L('搜索名字或 @用户名', 'Search name or @handle')}" value="${esc(q)}" />
      <div class="row">
        <div class="chips">${[['all', L('全部', 'All') + ' ' + int(rows.length)], ['v', L('认证', 'Verified') + ' ' + int(vCount)], ['nv', L('未认证', 'Not verified') + ' ' + int(rows.length - vCount)]].map(([v, t]) => `<button data-filter="${v}" class="${filter === v ? 'on' : ''}">${t}</button>`).join('')}</div>
        <select id="sort" title="${L('排序', 'Sort')}"><option value="default"${sort === 'default' ? ' selected' : ''}>${L('默认顺序', 'Default')}</option><option value="desc"${sort === 'desc' ? ' selected' : ''}>${L('粉丝多→少', 'Most followers')}</option><option value="asc"${sort === 'asc' ? ' selected' : ''}>${L('粉丝少→多', 'Fewest followers')}</option></select>
      </div>
      <div class="row exp"><button class="btn sm" data-export="csv">${ico('download')}${L('导出 CSV', 'Export CSV')}</button><button class="btn sm" data-export="copy">${ico('copy')}${L('复制用户名', 'Copy handles')}</button><span class="muted sm">${L(`共 ${int(shown.length)} 人`, `${int(shown.length)} people`)}</span></div>
    </div>
    <ul class="people">${slice.length ? slice.map((r) => `<li>${avatar(r)}<span class="who"><b>${esc(r.n)}${r.v ? '<i class="vb" title="verified"></i>' : ''}</b><small>${r.h ? '@' + esc(r.h) : esc(r.id ? 'ID ' + r.id : '')}${r.c ? ` · ${L('粉丝', 'followers')} ${cmp(r.c)}` : ''}${r.tag ? ` · <em>${esc(r.tag)}</em>` : ''}</small></span>${r.h ? `<button data-go="${esc(r.h)}" class="${r.unf ? 'unf' : ''}">${r.unf ? L('去取关', 'Unfollow') : L('主页', 'Profile')}</button>` : ''}</li>`).join('') : `<li class="empty">${k || filter !== 'all' ? L('没有匹配的人', 'No matches') : emptyText}</li>`}</ul>
    ${pages > 1 ? `<div class="pager"><button data-page="${S.list.page - 1}" ${S.list.page <= 1 ? 'disabled' : ''}>‹ ${L('上一页', 'Prev')}</button><span>${S.list.page} / ${pages}</span><button data-page="${S.list.page + 1}" ${S.list.page >= pages ? 'disabled' : ''}>${L('下一页', 'Next')} ›</button></div>` : ''}`;
}
function exportCSV() {
  const head = [L('用户名', 'Handle'), L('昵称', 'Name'), L('主页', 'Profile'), L('认证', 'Verified'), L('粉丝数', 'Followers'), L('备注', 'Note'), 'ID'];
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [head, ...CUR.rows.map((r) => [r.h ? '@' + r.h : '', r.n, r.h ? `https://x.com/${r.h}` : '', r.v ? L('是', 'yes') : '', r.c || '', r.tag || '', r.id || ''])].map((row) => row.map(cell).join(','));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  download(blob, `xbluev-${CUR.name}-${S.me}-${new Date().toISOString().slice(0, 10)}.csv`);
}
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
async function copyText(text, btn) {
  try { await navigator.clipboard.writeText(text); flash(btn, L('已复制', 'Copied')); } catch { flash(btn, L('复制失败', 'Copy failed')); }
}
function flash(btn, text) { if (!btn) return; const old = btn.innerHTML; btn.textContent = text; btn.disabled = true; setTimeout(() => { btn.innerHTML = old; btn.disabled = false; }, 1600); }

// ---------- 分享：分享面板（图片预览 + 可编辑文案 + 一键发推）
// 一键发推：把分享图复制到剪贴板，再打开 X 的发帖窗口并填好文案，用户在发帖框里粘贴图片后自己点发送（X 的发帖链接不支持直接带图片）。
// 分享图在本机用 canvas 画，不上传到任何地方；头像从 X 的图片服务器（pbs.twimg.com）读取后画进去。
function stats() {
  const f = S.acct.following, ev = (S.acct.events || [])[0], x = S.exp;
  return {
    following: f?.total ?? null, nofb: f ? f.nofb.length : null,
    followers: S.acct.followers?.count ?? S.acct.followers?.ids?.length ?? null,
    lost: ev ? ev.lostTotal ?? ev.lost.length : null, gained: ev ? ev.gainedTotal ?? (ev.gained || []).length : null,
    since: ev ? ev.since : null,
    views: x ? x.days.reduce((s, d) => s + d.views, 0) : null,
    posts: x ? x.days.reduce((s, d) => s + d.posts, 0) : null, replies: x ? x.days.reduce((s, d) => s + d.replies, 0) : null,
  };
}
const day = (t) => { const d = new Date(t); return EN ? d.toLocaleDateString('en', { month: 'short', day: 'numeric' }) : `${d.getMonth() + 1} 月 ${d.getDate()} 日`; };
/** 每种分享的标题、数字、头像和默认文案 */
function shareData(kind) {
  const s = stats(), url = SHARE_URL();
  const ev = (S.acct.events || [])[0];
  const withAv = (rows) => rows.map(norm).filter((p) => p.h && p.a);
  if (kind === 'nofb') {
    const rate = s.following ? Math.round((s.following - s.nofb) / s.following * 100) : 0;
    return {
      title: L('谁没回关我', 'Who doesn’t follow back'),
      tiles: [[L('我关注了', 'Following'), int(s.following), '#0f1419'], [L('没回关我', 'No follow-back'), int(s.nofb), '#f4212e'], [L('回关率', 'Follow-back rate'), rate + '%', '#0f1419']],
      label: L('没回关我的人', 'Not following me back'), people: withAv(S.acct.following?.nofb || []),
      text: L(`关注了 ${int(s.following)} 人，结果有 ${int(s.nofb)} 人没回关我 😅\n回关率 ${rate}%，是时候清理一下关注列表了。\n\n用免费的「蓝朋友推特插件」一键查出来的，还能导出名单 👉 ${url}\n#推特互关 #蓝朋友`,
        `I follow ${int(s.following)} accounts and ${int(s.nofb)} of them don’t follow me back 😅\nFollow-back rate: ${rate}%. Time to clean up.\n\nFound them in one click with the free XBlueV extension 👉 ${url}`),
    };
  }
  if (kind === 'lost') {
    const since = s.since ? day(s.since) : '';
    return {
      title: L('谁取关了我', 'Who unfollowed me'),
      tiles: [[L('取关了我', 'Unfollowed me'), int(s.lost), '#f4212e'], [L('新关注我', 'New followers'), int(s.gained), '#00ba7c'], [L('现在粉丝', 'Followers now'), int(s.followers), '#0f1419']],
      sub: since ? L(`${since} 到今天`, `${since} → today`) : '',
      label: L('取关了我的人', 'Unfollowed me'), people: withAv(ev?.lost || []),
      text: L(`${since ? since + '到今天' : '最近'}，有 ${int(s.lost)} 人取关了我，${int(s.gained)} 人新关注了我，现在粉丝 ${int(s.followers)}。\n\n用免费的「蓝朋友推特插件」查的，谁取关了你一眼就能看到 👉 ${url}\n#推特 #蓝朋友`,
        `${since ? 'Since ' + since : 'Recently'}, ${int(s.lost)} people unfollowed me and ${int(s.gained)} followed me. ${int(s.followers)} followers now.\n\nChecked with the free XBlueV extension 👉 ${url}`),
    };
  }
  if (kind === 'exp') {
    return {
      title: L('近 3 天曝光', 'Last 3 days on X'),
      tiles: [[L('总曝光', 'Views'), cmp(s.views), '#0f1419'], [L('原创', 'Posts'), int(s.posts), '#0f1419'], [L('回复', 'Replies'), int(s.replies), '#0f1419']],
      people: [],
      text: L(`我近 3 天在推特上的曝光：${cmp(s.views)}，发了 ${int(s.posts)} 条原创、${int(s.replies)} 条回复。\n\n用免费的「蓝朋友推特插件」算的，还会给出冲创作者收益的发帖方案 👉 ${url}\n#推特 #创作者收益`,
        `My last 3 days on X: ${cmp(s.views)} views from ${int(s.posts)} posts and ${int(s.replies)} replies.\n\nMeasured with the free XBlueV extension, which also builds a growth plan 👉 ${url}`),
    };
  }
  return {
    title: L('我的推特体检', 'My X check-up'),
    tiles: [[L('没回关我', 'No follow-back'), s.nofb == null ? '—' : int(s.nofb), '#f4212e'], [L('最近取关', 'Unfollowed'), s.lost == null ? '—' : int(s.lost), '#f4212e'], [L('新关注', 'New followers'), s.gained == null ? '—' : int(s.gained), '#00ba7c']],
    label: L('没回关我的人', 'Not following me back'), people: withAv(S.acct.following?.nofb || []),
    text: L(`我用免费的「蓝朋友推特插件」查了一下：${s.following != null ? `关注 ${int(s.following)} 人里有 ${int(s.nofb)} 人没回关我` : ''}${s.lost != null ? `，最近 ${int(s.lost)} 人取关、${int(s.gained)} 人新关注` : ''}。\n\n首次登录送 300 积分 👉 ${url}\n#推特互关 #蓝朋友`,
      `I checked my X account with the free XBlueV extension${s.following != null ? `: ${int(s.nofb)} of the ${int(s.following)} accounts I follow don’t follow back` : ''}${s.lost != null ? `, ${int(s.lost)} unfollowed me recently` : ''}.\n\n300 free points to start 👉 ${url}`),
  };
}
/** X 的字数算法（近似）：中文等全角字符算 2，链接一律算 23，上限 280 */
function tweetLength(text) {
  let n = 0;
  const parts = String(text).split(/(https?:\/\/\S+)/);
  parts.forEach((p, i) => { if (i % 2) n += 23; else for (const ch of p) n += ch.codePointAt(0) <= 0x10ff || (ch.codePointAt(0) >= 0x2000 && ch.codePointAt(0) <= 0x200d) ? 1 : 2; });
  return n;
}
function tweet(text) { chrome.tabs.create({ url: `https://x.com/intent/post?text=${encodeURIComponent(text)}` }); }

// 头像：从 X 的图片服务器读出来再画（直接画跨域图片会导致图片无法导出），读不到用默认头像
const avatarCache = new Map();
async function loadImage(src) {
  try {
    const r = await fetch(src, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error();
    const blob = await r.blob();
    try { return await createImageBitmap(blob); } catch {}
    // SVG 等格式 createImageBitmap 不支持：用 <img> 解码（图片数据是插件自己读来的，不会让画布无法导出）
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image(); img.src = url; await img.decode();
      const c = document.createElement('canvas'); c.width = c.height = 200;
      c.getContext('2d').drawImage(img, 0, 0, 200, 200);
      return c;
    } finally { URL.revokeObjectURL(url); }
  } catch { return null; }
}
async function avatarBitmap(url) {
  if (!avatarCache.has(url)) avatarCache.set(url, loadImage(big(url)).then((b) => b || loadImage(url)));
  return avatarCache.get(url); // 读不到返回 null，画默认头像
}
/** 默认头像（灰底人像），直接画，不用图片文件 */
function drawDefaultAvatar(g, x, y, size) {
  g.fillStyle = '#cfd9de'; g.fillRect(x, y, size, size);
  g.fillStyle = '#8899a6';
  g.beginPath(); g.arc(x + size / 2, y + size * 0.39, size * 0.18, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(x + size / 2, y + size * 0.92, size * 0.33, size * 0.27, 0, Math.PI, 0); g.fill();
}

/** 画分享图（1200×675，推特大图比例） */
async function shareImage(kind, showAvatars) {
  const d = shareData(kind);
  const W = 1200, H = 675, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const font = (w, px) => `${w} ${px}px -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif`;
  const grad = g.createLinearGradient(0, 0, W, H); grad.addColorStop(0, '#1d9bf0'); grad.addColorStop(1, '#6a55e6');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.arc(W - 110, 70, 250, 0, Math.PI * 2); g.fill();
  // 标题区
  g.fillStyle = 'rgba(255,255,255,.9)'; g.font = font(700, 26); g.fillText(L('蓝朋友推特插件', 'XBlueV extension'), 70, 78);
  g.fillStyle = '#fff'; g.font = font(800, 58); g.fillText(d.title, 70, 150);
  g.textAlign = 'right';
  g.font = font(800, 34); g.fillText('@' + (S.me || 'me'), W - 70, 108);
  g.font = font(500, 24); g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText(d.sub || new Date().toLocaleDateString(EN ? 'en' : 'zh-CN'), W - 70, 146);
  g.textAlign = 'left';
  // 数字
  const people = showAvatars ? (d.people || []) : [];
  const tileY = 190, tileH = people.length ? 150 : 210;
  d.tiles.forEach(([k, v, color], i) => {
    const x = 70 + i * 360;
    g.fillStyle = 'rgba(255,255,255,.96)'; roundRect(g, x, tileY, 340, tileH, 26); g.fill();
    g.fillStyle = '#536471'; g.font = font(600, 24); g.fillText(k, x + 28, tileY + 48);
    g.fillStyle = color; g.font = font(800, people.length ? 58 : 72); g.fillText(String(v), x + 28, tileY + (people.length ? 118 : 150));
  });
  // 头像
  if (people.length) {
    const max = 12, size = 64, gap = 12, y = 410;
    g.fillStyle = 'rgba(255,255,255,.92)'; g.font = font(700, 22); g.fillText(d.label, 70, y - 12);
    const shown = people.slice(0, people.length > max ? max - 1 : max);
    const bms = await Promise.all(shown.map((p) => avatarBitmap(p.a)));
    bms.forEach((bm, i) => {
      const x = 70 + i * (size + gap);
      g.save(); g.beginPath(); g.arc(x + size / 2, y + size / 2 + 6, size / 2, 0, Math.PI * 2); g.closePath();
      g.fillStyle = '#cfd9de'; g.fill(); g.clip();
      if (bm) g.drawImage(bm, x, y + 6, size, size); else drawDefaultAvatar(g, x, y + 6, size);
      g.restore();
      g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 3; g.beginPath(); g.arc(x + size / 2, y + size / 2 + 6, size / 2, 0, Math.PI * 2); g.stroke();
    });
    if (people.length > shown.length) {
      const x = 70 + shown.length * (size + gap);
      g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.arc(x + size / 2, y + size / 2 + 6, size / 2, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#0f1419'; g.font = font(800, 20); g.textAlign = 'center'; g.fillText('+' + cmp(people.length - shown.length), x + size / 2, y + size / 2 + 13); g.textAlign = 'left';
    }
  }
  // 底部
  g.fillStyle = '#fff'; g.font = font(700, 28); g.fillText(L('首次登录送 300 积分 · 一键查出谁没回关、谁取关了我', '300 free points · who doesn’t follow back & who unfollowed you'), 70, 580);
  g.font = font(500, 26); g.fillStyle = 'rgba(255,255,255,.9)'; g.fillText(SHARE_URL().replace(/^https:\/\//, ''), 70, 624);
  return new Promise((r) => c.toBlob(r, 'image/png'));
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/** 分享面板：图片预览、显示头像开关、可编辑文案、一键发推 / 下载图片 / 复制文案 */
const SH = { kind: '', blob: null, url: '' };
function sheetEl() {
  let el = $('sheet');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'sheet'; el.className = 'sheet'; el.hidden = true;
  el.innerHTML = `<div class="sheet-box" role="dialog" aria-modal="true">
    <div class="sheet-hd"><b id="sheetTitle"></b><button class="x" id="sheetX" aria-label="close">${ico('close')}</button></div>
    <div class="sheet-img"><img id="sheetImg" alt="" /><span id="sheetLoading"></span></div>
    <label class="chk" id="sheetAvWrap"><input type="checkbox" id="sheetAv" checked /> <span id="sheetAvTxt"></span></label>
    <textarea id="sheetText" rows="7"></textarea>
    <div class="sheet-cnt"><span id="sheetCnt"></span><button class="lnk" id="sheetReset"></button></div>
    <div class="btns"><button class="btn main" id="sheetTweet"></button><button class="btn" id="sheetSave"></button><button class="btn" id="sheetCopy"></button></div>
    <p class="msg" id="sheetMsg"></p></div>`;
  document.body.appendChild(el);
  el.addEventListener('click', (e) => { if (e.target === el) closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  $('sheetX').onclick = closeSheet;
  $('sheetAv').onchange = () => drawSheet();
  $('sheetText').oninput = countSheet;
  $('sheetReset').onclick = () => { $('sheetText').value = shareData(SH.kind).text; countSheet(); };
  $('sheetSave').onclick = () => { if (SH.blob) download(SH.blob, `xbluev-${SH.kind}-${S.me}-${new Date().toISOString().slice(0, 10)}.png`); };
  $('sheetCopy').onclick = (e) => copyText($('sheetText').value, e.currentTarget);
  $('sheetTweet').onclick = async () => {
    const m = $('sheetMsg');
    let copied = false;
    try { if (SH.blob) { await navigator.clipboard.write([new ClipboardItem({ 'image/png': SH.blob })]); copied = true; } } catch {}
    if (!copied && SH.blob) download(SH.blob, `xbluev-${SH.kind}-${S.me}.png`);
    tweet($('sheetText').value);
    m.className = 'msg ok';
    m.textContent = copied ? L('图片已复制，文案已填好：在 X 的发帖窗口按 Ctrl+V（Mac 按 ⌘+V）粘贴图片，再点发送。', 'Image copied and text filled in: press Ctrl+V (⌘+V on Mac) in X’s compose window to add the image, then post.')
      : L('图片已下载，文案已填好：在 X 的发帖窗口点图片按钮，把刚下载的图片加上，再点发送。', 'Image downloaded and text filled in: add the downloaded image in X’s compose window, then post.');
  };
  return el;
}
function countSheet() {
  const n = tweetLength($('sheetText').value);
  const el = $('sheetCnt');
  el.textContent = L(`${n} / 280（中文算 2 个字符，链接算 23 个）`, `${n} / 280`);
  el.className = n > 280 ? 'bad' : 'muted';
}
async function drawSheet() {
  $('sheetLoading').textContent = L('正在生成图片…', 'Making the image…');
  const blob = await shareImage(SH.kind, $('sheetAv').checked);
  SH.blob = blob;
  if (SH.url) URL.revokeObjectURL(SH.url);
  SH.url = URL.createObjectURL(blob);
  $('sheetImg').src = SH.url;
  $('sheetLoading').textContent = '';
}
function openSheet(kind) {
  const el = sheetEl();
  SH.kind = kind;
  const d = shareData(kind);
  $('sheetTitle').textContent = L(`分享：${d.title}`, `Share: ${d.title}`);
  $('sheetAvWrap').hidden = !(d.people || []).length;
  $('sheetAvTxt').textContent = L('图片里显示这些人的头像', 'Show their avatars in the image');
  $('sheetText').value = d.text;
  $('sheetReset').textContent = L('恢复默认文案', 'Reset text');
  $('sheetTweet').innerHTML = ico('x') + L('复制图片并去发推', 'Copy image & tweet');
  $('sheetSave').textContent = L('下载图片', 'Save image');
  $('sheetCopy').textContent = L('复制文案', 'Copy text');
  $('sheetMsg').textContent = '';
  countSheet();
  el.hidden = false;
  drawSheet();
}
function closeSheet() { const el = $('sheet'); if (el) el.hidden = true; }
const shareBtn = (kind, label) => `<button class="btn" data-share="${kind}">${ico('share')}${label || L('分享 / 发推', 'Share / tweet')}</button>`;
const shareCard = (kind) => `<div class="card share"><h3>${ico('share')}${L('分享结果', 'Share')}</h3><p class="muted">${L('生成一张带数据的分享图，文案已经写好可以改，一键发到推特。', 'Make a share image with your numbers, edit the ready-made text, and tweet it in one click.')}</p>
  <div class="btns"><button class="btn main" data-share="${kind}">${ico('share')}${L('生成分享图并发推', 'Make image & tweet')}</button></div></div>`;

// ---------- 首页
// 网站上的其他工具（按用途分组）。点了在网站上打开；需要用户名的工具（acc: true）在已识别推特号时自动填好（?account=），不自动开始
// 插件里已经有的功能（谁没回关我、谁取关了我、流量密码）不重复放
const SITE_TOOLS = () => [
  [L('账号检测', 'Account checks'), [
    ['/limit-check', 'shield', L('检测影子限流', 'Shadowban check'), L('搜索降权、回复隐藏等限流', 'Search and reply visibility'), true],
    ['/eligibility-check', 'target', L('创作者收益资格检测', 'Monetization check'), L('你的内容能不能过审核', 'Would your posts pass review'), true],
    ['/fans/circle', 'users', L('生成互动圈', 'Interaction circle'), L('谁和你互动最多，生成分享图', 'Who you interact with most'), true],
  ]],
  [L('涨粉互关', 'Grow & mutuals'), [
    ['/connect', 'check-circle', L('蓝 V 互关', 'Find mutuals'), L('回关率 75%–300% 的账号', '75%–300% follow-back rate')],
    ['/boards', 'bar', L('蓝朋友榜单', 'Leaderboards'), L('涨粉、发帖、爆帖排行', 'Growth, posts and hot posts')],
    ['/community', 'message', L('圈子互助', 'Boost Circle'), L('发助推任务，互相互动', 'Post tasks, boost each other')],
  ]],
  [L('内容创作', 'Content'), [
    ['/trend-to-original', 'pen', L('热点转原创', 'Trend Rewriter'), L('AI 二创改写、蒸馏 X 号风格', 'AI rewrites and style match')],
    ['/trends', 'trend', L('热门趋势', 'Trends'), L('中文热门话题与 X 实时趋势', 'Chinese topics and live X trends')],
    ['/articles/x-algorithm', 'book', L('X 流量算法解读', 'X algorithm explained'), L('什么会被推荐、什么会被限流', 'What gets promoted or limited')],
  ]],
  [L('收益与开发', 'Earnings & API'), [
    ['/earnings-calculator', 'calculator', L('收益计算器', 'Earnings calculator'), L('按曝光估算每月收益', 'Estimate earnings from views')],
    ['/developers', 'zap', L('开发者中心', 'Developer Center'), L('推特数据 API，按量用积分', 'X data API, pay with points')],
    ['/articles', 'grid', L('创作学院', 'Guides'), L('增长、流量与收益指南', 'Growth, reach and earnings')],
  ]],
];
function siteTools() {
  const acc = S.me ? `?account=${encodeURIComponent(S.me)}&from=extension` : '?from=extension';
  return `<div class="card"><h3>${ico('grid')}${L('更多推特工具', 'More X tools')}</h3><p class="muted">${L('都在蓝朋友网站上打开；检测类工具会自动填好你的推特用户名。', 'Opens on XBlueV; checks fill in your X username for you.')}</p>
    ${SITE_TOOLS().map(([group, items]) => `<div class="tgroup"><small>${group}</small><div class="tgrid">${items.map(([path, icon, name, desc, needAcc]) => `<button class="tool-link" data-open="${path}${needAcc ? acc : '?from=extension'}"><b>${ico(icon)}${name}</b><small>${desc}</small></button>`).join('')}</div></div>`).join('')}</div>`;
}
function viewHome() {
  const g = gate();
  if (g) return g + siteTools();
  const f = S.acct.following, ev = (S.acct.events || [])[0], x = S.exp;
  const v3 = x ? x.days.reduce((s, d) => s + d.views, 0) : null;
  const today = x ? x.days[x.days.length - 1] : null;
  return `
    <div class="card hero"><small>${L('你好', 'Hello')}</small><b class="big">@${esc(S.me)}</b><p>${L('首次登录插件赠送 300 积分，插件和网站功能都能用。', 'Get 300 points the first time you sign in — use them in the extension and on the website.')}</p></div>
    ${accountCard(true)}
    <div class="grid">
      <div class="tile" data-tab="nofb"><small>${L('没回关我', 'No follow-back')}</small><b class="bad">${f ? int(f.nofb.length) : '—'}</b><i>${f ? L(`关注 ${int(f.total)} · ${ago(f.at)}`, `of ${int(f.total)} · ${ago(f.at)}`) : L('点开读取', 'Tap to read')}</i></div>
      <div class="tile" data-tab="lost"><small>${L('最近取关我', 'Unfollowed me')}</small><b class="bad">${ev ? int(ev.lostTotal ?? ev.lost.length) : '—'}</b><i>${ev ? ago(ev.at) : L('点开读取', 'Tap to read')}</i></div>
      <div class="tile" data-tab="exp"><small>${L('近 3 天曝光', '3-day views')}</small><b>${v3 != null ? cmp(v3) : '—'}</b><i>${x ? ago(x.at) : L('点开读取', 'Tap to read')}</i></div>
      <div class="tile" data-tab="exp"><small>${L('今天原创 / 回复', 'Today posts / replies')}</small><b>${today ? `${today.posts} / ${today.replies}` : '—'}</b><i>${x ? (x.mixed ? L('原创和回复合计', 'combined') : today.day) : L('点开读取', 'Tap to read')}</i></div>
    </div>
    <div class="card" style="margin-top:12px"><h3>${ico('zap')}${L('一键读取全部', 'Read everything')}</h3><p class="muted">${L('同时查「谁没回关我」（读 x.com 关注名单，不扣积分）和「谁取关了我」（通过蓝朋友接口读粉丝名单，按量扣积分，需要登录）。', 'Checks “Who doesn’t follow back” (reads your x.com Following list, free) and “Who unfollowed me” (reads your followers through the XBlueV API, billed in points, sign-in required) at the same time.')}</p>${taskBox('nofb', true)}${taskBox('unfollow', true)}<div class="btns">${running('nofb') || running('unfollow') ? `<button class="btn" data-stop="1">${L('停止', 'Stop')}</button>` : `<button class="btn main" data-run="both">${L('开始读取', 'Start')}</button>`}</div></div>
    ${f || ev ? shareCard('all') : ''}
    ${siteTools()}`;
}

// ---------- 回关
function viewNofb() {
  const g = gate();
  if (g) return g;
  const f = S.acct.following;
  const rows = f ? f.nofb.map(norm).filter((p) => p.h && p.a).map((p) => ({ ...p, tag: '', unf: true })) : [];
  return `<div class="card"><h3>${ico('user-minus', 'red')}${L('谁没回关我', 'Who doesn’t follow back')}<span class="n bad">${f ? int(f.nofb.length) : ''}</span></h3>
      <p class="muted">${f ? L(`关注 ${int(f.total)} 人 · ${ago(f.at)}读取${f.complete ? '' : '（未读完）'}`, `Following ${int(f.total)} · read ${ago(f.at)}${f.complete ? '' : ' (partial)'}`) : L('读取你的关注名单，找出没回关你的人。', 'Reads your Following list to find who doesn’t follow back.')}</p>
      ${taskBox('nofb')}<div class="btns">${runBtn('nofb', f ? L('重新读取', 'Read again') : L('开始读取', 'Start'))}${f && f.nofb.length ? shareBtn('nofb') : ''}</div></div>
    ${f?.hidden ? `<p class="note">${L(`另有 ${int(f.hidden)} 位账号 X 没有返回资料（多半已注销或被冻结），未显示。`, `${int(f.hidden)} more accounts weren’t returned by X (likely deactivated or suspended) and aren’t shown.`)}</p>` : ''}
    ${f ? people(rows, L('所有人都回关了你', 'Everyone follows you back'), 'no-follow-back') : ''}
    <p class="note">${L('点「去取关」会在当前标签页打开 TA 的主页，由你自己点「正在关注 → 取消关注」，插件不会替你操作。', '“Unfollow” opens their profile in this tab; you unfollow yourself — the extension never does it.')}</p>`;
}

// ---------- 取关
/** 谁取关了我每次大约消耗的积分（和网站接口的计价一致：每次请求 0.175、每个粉丝 ID 0.018、资料查询 0.35） */
const unfollowCost = (n) => Math.max(1, Math.ceil(0.175 * (Math.ceil(n / 5000) + 1) + 0.35 + 0.018 * n));
function viewLost() {
  if (!S.me) { const g = gate(); if (g) return g; }
  const ev = (S.acct.events || [])[0];
  const lost = ev ? ev.lost.map(norm).filter((p) => p.h && p.a).map((p) => ({ ...p, tag: p.gone ? L('已注销或被冻结', 'gone') : p.i ? L('你还关注着 TA', 'you follow them') : '', unf: !!p.i && !p.gone })) : [];
  const gained = ev ? (ev.gained || []).map(norm).filter((p) => p.h && p.a).map((p) => ({ ...p, tag: L('新关注', 'new'), unf: false })) : [];
  const base = S.acct.followers;
  return `<div class="card"><h3>${ico('user-x', 'orange')}${L('谁取关了我', 'Who unfollowed me')}<span class="n bad">${ev ? int(ev.lostTotal ?? ev.lost.length) : ''}</span></h3>
      <p class="muted">${ev ? L(`和 ${hm(ev.since)} 读到的粉丝名单对比 · ${ago(ev.at)}`, `Compared with your followers at ${hm(ev.since)} · ${ago(ev.at)}`) : base ? L(`已保存 ${hm(base.at)} 的粉丝名单（${int(base.count ?? base.ids?.length ?? 0)} 人），再读一次就能看到变化。`, `Baseline saved at ${hm(base.at)} (${int(base.count ?? base.ids?.length ?? 0)} followers). Read again to see changes.`) : L('读取你的粉丝名单并保存；之后每次再读，就能看到这段时间谁取关了你、谁新关注了你。', 'Reads and saves your followers. Each later read shows who unfollowed or followed you since.')}</p>
      ${S.token ? `<p class="note" style="margin:6px 0 0">${L(`通过蓝朋友接口读取，不占用你推特账号的额度。每次大约消耗 ${int(unfollowCost(base?.count || S.acct.following?.total || 3000))} 积分${base?.count ? '' : '（按粉丝数计算，5,000 粉丝约 95 积分）'}，你现在有 ${S.account ? int(S.account.points) : '…'} 积分。`, `Read through the XBlueV API, so it doesn’t use your X account’s quota. About ${int(unfollowCost(base?.count || 3000))} points per check; you have ${S.account ? int(S.account.points) : '…'}.`)}</p>` : ''}
      ${taskBox('unfollow')}<div class="btns">${S.token ? (unfollowWait() > 0 && !running('unfollow') ? `<button class="btn frozen" id="frozenBtn">${ico('lock')}${L(`${waitText(unfollowWait())}后可重新读取`, `Read again in ${waitText(unfollowWait())}`)}</button>` : runBtn('unfollow', ev || base ? L('重新读取', 'Read again') : L('开始读取', 'Start'))) : ''}${ev ? shareBtn('lost') : ''}</div></div>
    ${S.token ? '' : loginCard()}
    ${ev ? `<div class="seg"><button data-lv="lost" class="${S.lostView === 'lost' ? 'on' : ''}">${L('取关了我', 'Unfollowed')} ${int(lost.length)}</button><button data-lv="gained" class="${S.lostView === 'gained' ? 'on' : ''}">${L('新关注我', 'New followers')} ${int(gained.length)}</button></div>
      ${(() => { const h = S.lostView === 'lost' ? (ev.lostTotal ?? lost.length) - lost.length : (ev.gainedTotal ?? gained.length) - gained.length; return h > 0 ? `<p class="note">${L(`另有 ${int(h)} 位账号 X 没有返回资料（多半已注销或被冻结），未显示。`, `${int(h)} more accounts weren’t returned by X (likely deactivated or suspended) and aren’t shown.`)}</p>` : ''; })()}
      ${people(S.lostView === 'lost' ? lost : gained, S.lostView === 'lost' ? L('这段时间没有人取关你', 'Nobody unfollowed you') : L('这段时间没有新关注', 'No new followers'), S.lostView === 'lost' ? 'unfollowed' : 'new-followers')}
      ${(S.acct.events || []).length > 1 ? `<details class="card hist"><summary>${L('历史记录', 'History')}</summary><ul>${S.acct.events.slice(0, 15).map((e) => `<li><span>${hm(e.since)} → ${hm(e.at)}</span><b class="bad">−${int(e.lostTotal ?? e.lost.length)}</b><b class="ok">+${int(e.gainedTotal ?? (e.gained || []).length)}</b></li>`).join('')}</ul></details>` : ''}` : ''}`;
}

// ---------- 曝光与增长方案
/**
 * 计算方式（大概估算，不是 X 的真实算法）：
 *  预估有效转化 = 近 3 天日均曝光 × 认证曝光率（默认 95%）× 转化率（默认 20%），两个比例都可以拖动调整；
 *  90 天的有效转化攒够 50 万才能通过创作者收益审核。
 *  建议按实际的发帖强度给：日均原创目标 100 条、日均互动回复目标 1000 条（大多数快速涨粉的账号都在这个量级），
 *  不足时提示多发原创、多去互动；再按内容质量（字数、互关互粉类帖子占比）给出置信度评分。
 */
const GOAL = 500000, GOAL_DAYS = 90, RPM = 8.5; // RPM：每百万曝光收益的常见估算（美元）
const POST_TARGET = 100, REPLY_TARGET = 1000;   // 日均原创、日均互动回复的建议目标
const DEFAULT_RATE = 20;                         // 默认转化率（%）
const DEFAULT_VRATE = 95;                        // 默认认证曝光率（%）：总曝光里来自认证用户的比例
const ALGO_PATH = '/articles/x-algorithm';       // 网站上的推特推荐算法解析
function plan(x, rate, vrate = S.vrate) {
  const n = x.days.length;
  const sum = (k) => x.days.reduce((s, d) => s + (d[k] || 0), 0);
  const views = sum('views'), posts = sum('posts'), replies = sum('replies');
  const perDay = views / n, postsDay = posts / n, repliesDay = replies / n;
  const perPost = posts ? sum('postViews') / posts : 0, perReply = replies ? sum('replyViews') / replies : 0;
  const eng = views ? (sum('likes') + sum('comments') + sum('reposts')) / views : 0;
  const effDay = perDay * (vrate / 100) * (rate / 100), eff90 = effDay * GOAL_DAYS;
  const daysToGoal = effDay > 0 ? Math.ceil(GOAL / effDay) : null;
  return { perDay, postsDay, repliesDay, perPost, perReply, eng, effDay, eff90, daysToGoal, posts, replies, views, monthUsd: effDay * 30 / 1e6 * RPM };
}
/** 内容质量置信度（0–100）：原创太短、互关互粉类帖子多、互动率太低都会扣分 */
function quality(x, p) {
  const q = x.quality;
  if (!q || !q.posts) return null;
  const avgLen = q.chars / q.posts, shortR = q.short / q.posts, mutualR = q.mutual / q.posts;
  let score = 100;
  score -= Math.round(mutualR * 50);                 // 互关互粉类帖子：最多扣 50
  score -= Math.round(shortR * 30);                  // 少于 30 字的短帖：最多扣 30
  if (avgLen < 20) score -= 10; else if (avgLen < 40) score -= 5;
  if (p.views && p.eng < 0.005) score -= 10; else if (p.views && p.eng < 0.01) score -= 5;
  score = Math.max(0, Math.min(100, score));
  const level = score >= 75 ? ['ok', L('高', 'High')] : score >= 50 ? ['mid', L('中', 'Medium')] : ['bad', L('低', 'Low')];
  return { score, level, avgLen, shortR, mutualR };
}
function advice(p, x, qa) {
  const out = [];
  // 1. 发帖强度：原创
  if (p.postsDay < POST_TARGET) out.push(['pen', L(`日均原创 ${p.postsDay.toFixed(1)} 条，偏少。建议提升到每天 ${POST_TARGET} 条以上，分早、中、晚多个时段发，保持账号持续活跃。`, `${p.postsDay.toFixed(1)} posts a day is low. Aim for ${POST_TARGET}+ a day, spread across the morning, afternoon and evening.`)]);
  else out.push(['check-circle', L(`日均原创 ${p.postsDay.toFixed(0)} 条，发帖量够了，重点放在提升内容质量上。`, `${p.postsDay.toFixed(0)} posts a day is plenty — focus on quality.`)]);
  // 2. 互动强度：回复评论
  if (p.repliesDay < REPLY_TARGET) out.push(['message', L(`日均互动回复 ${p.repliesDay.toFixed(0)} 条，互动不够。建议每天 ${REPLY_TARGET} 条以上：多去同领域账号和大号的热门帖下认真评论，抢前几条位置。`, `${p.repliesDay.toFixed(0)} replies a day isn’t enough engagement. Aim for ${REPLY_TARGET}+: leave thoughtful comments early on popular posts in your niche.`)]);
  else out.push(['check-circle', L(`日均互动回复 ${p.repliesDay.toFixed(0)} 条，互动很积极，继续保持。`, `${p.repliesDay.toFixed(0)} replies a day — great engagement, keep it up.`)]);
  // 3. 内容质量
  if (qa) {
    if (qa.mutualR > 0.3) out.push(['alert', L(`互关、互粉、求回关这类帖子占原创的 ${Math.round(qa.mutualR * 100)}%，这类内容推荐权重低、带不来有效曝光。建议多发有观点、有信息量、能引发讨论的原创。`, `${Math.round(qa.mutualR * 100)}% of your posts are follow-for-follow style. These get little reach — post more opinions, insights and conversation starters.`)]);
    if (qa.avgLen < 30 || qa.shortR > 0.5) out.push(['pen', L(`原创平均只有 ${Math.round(qa.avgLen)} 个字，${Math.round(qa.shortR * 100)}% 的帖子少于 30 字。内容太短质量偏低，建议把观点、经验、数据写完整（50 字以上）。`, `Posts average ${Math.round(qa.avgLen)} characters and ${Math.round(qa.shortR * 100)}% are under 30. Write fuller posts (50+ characters) with a clear point.`)]);
  }
  // 4. 互动率
  if (p.views && p.eng < 0.01) out.push(['target', L(`互动率只有 ${(p.eng * 100).toFixed(2)}%：开头第一句要能让人停下来，多用提问和观点句引导别人评论。`, `Engagement is only ${(p.eng * 100).toFixed(2)}%: make the first line stop the scroll, and ask questions to invite replies.`)]);
  // 5. 原创和回复哪个更容易拿曝光
  if (p.perPost && p.perReply) {
    if (p.perReply > p.perPost * 1.5) out.push(['trend', L('你的回复比原创更容易拿曝光：继续多去热门帖下回复，同时把回复里反响好的观点整理成原创。', 'Your replies out-perform your posts: keep replying on popular posts, and turn your best replies into posts.')]);
    else if (p.perPost > p.perReply * 2) out.push(['trend', L('你的原创曝光明显高于回复：原创是你的强项，回复可以挑能带来曝光的大号去写。', 'Your posts out-perform your replies: posting is your strength; reply selectively on big accounts.')]);
  }
  // 6. 友情提示
  out.push(['users', L('友情提示：发完帖子后的 30 分钟里多互动——回复自己帖子下的评论，再去别人的帖子下评论，能明显提升这条帖子的推荐。', 'Tip: in the 30 minutes after posting, reply to comments on your post and comment on others’ posts — it noticeably boosts reach.')]);
  // 7. 进度
  out.push(['flag', p.eff90 >= GOAL ? L(`按现在的节奏，90 天预估约 ${cmp(p.eff90)} 有效转化，已经超过 50 万的审核门槛。`, `At this pace you’d get about ${cmp(p.eff90)} effective views in 90 days — above the 500K bar.`)
    : L(`按现在的节奏，90 天预估约 ${cmp(p.eff90)} 有效转化，${p.daysToGoal ? `大约 ${int(p.daysToGoal)} 天能攒够 50 万` : '离 50 万还很远'}。把上面的原创和互动做起来，这个时间会明显缩短。`, `At this pace: about ${cmp(p.eff90)} effective views in 90 days${p.daysToGoal ? `; 500K in about ${int(p.daysToGoal)} days` : ''}. Hitting the post and reply targets above will shorten this a lot.`)]);
  return out;
}
function viewExp() {
  const g = gate();
  if (g) return g;
  const x = S.exp;
  let body = '';
  if (x) {
    const p = plan(x, S.rate);
    const qa = quality(x, p);
    const pct = Math.min(100, Math.round(p.eff90 / GOAL * 100));
    body = `<div class="card"><h3>${ico('trend')}${L('近 3 天', 'Last 3 days')}<span class="n">${cmp(p.views)}</span></h3><p class="muted">${L(`总曝光 · ${ago(x.at)}读取`, `total views · read ${ago(x.at)}`)}</p>
      <div class="kpis"><div class="kpi"><small>${L('日均曝光', 'Views/day')}</small><b>${cmp(p.perDay)}</b></div><div class="kpi"><small>${L('日均原创', 'Posts/day')}</small><b class="${p.postsDay < POST_TARGET ? 'bad' : 'ok'}">${p.postsDay.toFixed(1)}</b></div><div class="kpi"><small>${L('日均回复', 'Replies/day')}</small><b class="${p.repliesDay < REPLY_TARGET ? 'bad' : 'ok'}">${p.repliesDay.toFixed(0)}</b></div>
      <div class="kpi"><small>${L('每条原创曝光', 'Views/post')}</small><b>${p.perPost ? cmp(p.perPost) : '—'}</b></div><div class="kpi"><small>${L('每条回复曝光', 'Views/reply')}</small><b>${p.perReply ? cmp(p.perReply) : '—'}</b></div><div class="kpi"><small>${L('互动率', 'Engagement')}</small><b>${(p.eng * 100).toFixed(1)}%</b></div></div>
      <table class="days"><tr><th>${L('日期', 'Day')}</th><th>${L('原创', 'Posts')}</th><th>${L('回复', 'Replies')}</th><th>${L('曝光', 'Views')}</th><th>${L('点赞', 'Likes')}</th><th>${L('评论', 'Comments')}</th></tr>
      ${x.days.slice().reverse().map((d) => `<tr><td>${esc(d.day.slice(5))}</td><td>${d.posts}</td><td>${d.replies}</td><td>${cmp(d.views)}</td><td>${cmp(d.likes)}</td><td>${cmp(d.comments)}</td></tr>`).join('')}</table>
      ${x.mixed ? `<p class="note">${L('这份数据是旧版插件读的，原创和回复没有分开统计，请重新读取一次。', 'This data was read by an older version and doesn’t separate posts from replies — read again.')}</p>` : ''}</div>
    ${qa ? `<div class="card"><h3>${ico('gauge')}${L('内容质量置信度', 'Content quality score')}<span class="n ${qa.level[0]}">${qa.score}</span></h3><p class="muted">${L(`质量${qa.level[1]}。按原创的字数、短帖占比、互关互粉类帖子占比和互动率打分，满分 100。`, `${qa.level[1]} quality. Based on post length, share of short posts, follow-for-follow posts and engagement, out of 100.`)}</p>
      <div class="kpis"><div class="kpi"><small>${L('原创平均字数', 'Avg characters')}</small><b>${Math.round(qa.avgLen)}</b></div><div class="kpi"><small>${L('短帖（<30 字）', 'Short (<30)')}</small><b class="${qa.shortR > 0.5 ? 'bad' : ''}">${Math.round(qa.shortR * 100)}%</b></div><div class="kpi"><small>${L('互关互粉类', 'Follow-for-follow')}</small><b class="${qa.mutualR > 0.3 ? 'bad' : ''}">${Math.round(qa.mutualR * 100)}%</b></div></div></div>` : ''}
    <div class="card"><h3>${ico('target')}${L('增长方案', 'Growth plan')}</h3>
      <div class="slider"><label><span>${L('认证曝光率', 'Verified view rate')}</span><span id="vrateTxt">${S.vrate}%</span></label>
        <div class="row"><input type="range" id="vrate" min="1" max="100" step="1" value="${S.vrate}" /><input type="number" id="vrateNum" min="1" max="100" value="${S.vrate}" /></div>
        <p class="muted" style="font-size:11.5px">${L(`总曝光里来自认证用户的比例，默认 ${DEFAULT_VRATE}%。`, `Share of views from verified users. Default ${DEFAULT_VRATE}%.`)}</p></div>
      <div class="slider"><label><span>${L('转化率', 'Conversion rate')}</span><span id="rateTxt">${S.rate}%</span></label>
        <div class="row"><input type="range" id="rate" min="1" max="100" step="1" value="${S.rate}" /><input type="number" id="rateNum" min="1" max="100" value="${S.rate}" /></div>
        <p class="muted" style="font-size:11.5px">${L(`默认 ${DEFAULT_RATE}%。预估有效转化 = 总曝光 × 认证曝光率 × 转化率，90 天攒够 50 万才能过审核。这是大概估算，仅供参考。`, `Default ${DEFAULT_RATE}%. Estimated effective views = views × verified rate × conversion; 500K in 90 days passes review. A rough estimate only.`)}</p></div>
      <p style="margin-top:10px">${L(`每天预估 <b>${cmp(p.effDay)}</b> 有效转化，90 天约 <b>${cmp(p.eff90)}</b> / 50 万`, `About <b>${cmp(p.effDay)}</b> effective views/day, <b>${cmp(p.eff90)}</b> / 500K in 90 days`)}</p>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <ul class="advice">${advice(p, x, qa).map(([ic, t]) => `<li class="${ic === 'check-circle' ? 'good' : ic === 'alert' ? 'warn' : ''}">${ico(ic)}<span>${esc(t)}</span></li>`).join('')}</ul>
      <p class="note">${L(`开通创作者收益后，按每百万曝光约 $${RPM} 粗估，你现在每月约 $${p.monthUsd.toFixed(2)}。X 没有公布单价，仅供参考。`, `Once monetized, at roughly $${RPM} per million views that’s about $${p.monthUsd.toFixed(2)}/month. X doesn’t publish rates — estimate only.`)}</p></div>
    <div class="card algo"><h3>${ico('book')}${L('推特推荐算法是怎么推帖子的？', 'How does X’s algorithm pick posts?')}</h3><p class="muted">${L('基于 X 官方开源代码的解读：哪些行为会被推荐、哪些会被降权或限流，互动、回复、停留时间各占多大权重。', 'Based on X’s open-source code: what gets recommended, what gets down-ranked or limited, and how much replies, engagement and dwell time count.')}</p><div class="btns"><button class="btn main" data-open="${ALGO_PATH}">${L('看推特算法解析 →', 'Read the algorithm guide →')}</button></div></div>
    ${shareCard('exp')}`;
  }
  const tools = `<div class="card tools-site"><h3>${ico('grid')}${L('蓝朋友网站工具', 'XBlueV tools')}</h3><p class="muted">${L('想知道能赚多少、能不能过审？用网站上的这两个工具：', 'Want to know what you could earn, or whether you’d pass review?')}</p>
    <div class="tool-links"><button class="tool-link" data-open="/earnings-calculator"><b>${ico('calculator')}${L('创作者收益计算器', 'Earnings calculator')}</b><small>${L('按你的曝光估算每月大概能赚多少', 'Estimate monthly earnings from your views')}</small></button>
    <button class="tool-link" data-open="/eligibility-check"><b>${ico('shield')}${L('创作者收益资格审核检测', 'Monetization eligibility check')}</b><small>${L('检测你的账号和内容能不能通过审核', 'Check whether your account and posts would pass')}</small></button></div></div>`;
  return `<div class="card"><h3>${ico('bar')}${L('曝光与增长方案', 'Views & growth plan')}</h3><p class="muted">${L('读取你近 3 天（含今天）的原创和回复，统计每天的曝光和互动，给出发帖、互动和内容质量建议。直接读 x.com，不扣积分。', 'Reads your posts and replies from the last 3 days and gives advice on posting, engagement and content quality. Reads x.com directly; no points used.')}</p>
    ${taskBox('exposure')}<div class="btns">${runBtn('exposure', x ? L('重新读取', 'Read again') : L('开始读取', 'Start'))}</div></div>${tools}${body}`;
}

// ---------- 设置
function viewSet() {
  return `<div class="card"><h3>${ico('globe')}${L('界面语言', 'Language')}</h3><div class="seg" style="margin-top:8px"><button data-lang="zh" class="${EN ? '' : 'on'}">中文</button><button data-lang="en" class="${EN ? 'on' : ''}">English</button></div></div>
    ${accountCard()}
    <div class="card"><h3>${ico('lock')}${L('隐私和积分', 'Privacy and points')}</h3><ul class="facts">
      <li>${L('首次登录插件赠送 300 积分，插件和网站的功能都可以正常使用', 'You get 300 points the first time you sign in, usable in the extension and on the website')}</li>
      <li>${L('「谁没回关我」「曝光与增长方案」直接读 x.com，不扣积分', '“Who doesn’t follow back” and “Views & plan” read x.com directly and are free')}</li>
      <li>${L('「谁取关了我」通过蓝朋友网站接口读取，按量扣积分，不占用你推特账号的额度', '“Who unfollowed me” uses the XBlueV API, billed in points, without using your X account’s quota')}</li>
      <li>${L('读到的名单和取关记录存在你自己的浏览器里，下次打开直接显示', 'Lists and unfollow history are saved in your browser and shown next time')}</li>
      <li>${L('不会读取你的推特密码，不会替你关注、取关、点赞或发帖', 'Never reads your X password; never follows, unfollows, likes or posts for you')}</li></ul></div>
    <div class="card"><h3>${ico('database')}${L('本地数据', 'Local data')}</h3><p class="muted">${L('清除插件在本机保存的名单、取关记录和曝光数据。', 'Clears the lists, unfollow history and view data saved on this computer.')}</p><div class="btns"><button class="btn" id="clear">${L('清除本机数据', 'Clear local data')}</button></div></div>
    <div class="card"><h3>${ico('activity')}${L('诊断信息', 'Diagnostics')}</h3><p class="muted">${L('插件出问题时，把这一块截图发给我们。', 'If something goes wrong, send us a screenshot of this card.')}</p><pre class="diag" id="diag">…</pre></div>
    <div class="card"><h3>${ico('info')}${L('关于', 'About')}</h3><p class="muted">${L('蓝朋友 XBlueV 推特助手', 'XBlueV X assistant')} · v${esc(VERSION)}</p><div class="btns"><button class="btn" id="home">${L('插件介绍和教程', 'Guide and tutorial')}</button><button class="btn" data-tweet="all">${ico('x')}${L('推荐给朋友', 'Tell a friend')}</button></div></div>`;
}

// ---------- 流量密码：网站的热点数据（热议词云、X 实时趋势、爆款推文），每条都能去网站「改写这条帖」或「蒸馏X」
// 数据来自公开接口 /api/ext/hot（不需要登录、不扣积分），在本机缓存 10 分钟
const HOT_TTL = 10 * 60e3;
async function loadHot(force) {
  const key = `hot:${EN ? 'en' : 'zh'}`;
  if (!S.hot || S.hot.lang !== EN) { const c = (await chrome.storage.local.get(key))[key]; S.hot = { lang: EN, sec: S.hot?.sec || 'cloud', region: S.hot?.region || 'zh', pick: -1, data: c?.data || null, at: c?.at || 0 }; }
  if (!force && S.hot.data && Date.now() - S.hot.at < HOT_TTL) { if (S.tab === 'hot') render(); return; }
  if (S.hot.loading) return;
  S.hot.loading = true; S.hot.err = ''; if (S.tab === 'hot') render();
  const r = await bg({ type: 'site', method: 'GET', path: `/api/ext/hot?lang=${EN ? 'en' : 'zh'}` });
  S.hot.loading = false;
  if (r.ok && Array.isArray(r.words)) { S.hot.data = { updatedAt: r.updatedAt, trendsAt: r.trendsAt, words: r.words, trends: r.trends || [], posts: r.posts || [] }; S.hot.at = Date.now(); await chrome.storage.local.set({ [key]: { data: S.hot.data, at: S.hot.at } }); }
  else S.hot.err = L('热点数据暂时读取不到，请稍后再试。', 'Couldn’t load trend data. Try again later.');
  if (S.tab === 'hot') render();
}
const studio = (mode, v) => `/trend-to-original?${mode === 'rw' ? 'src' : 'distill'}=${encodeURIComponent(v)}`;
const hotActs = (src, h) => `<span class="hacts"><button class="btn xs main" data-rw="${esc(src)}">${ico('pen')}${L('改写这条帖', 'Rewrite')}</button>${h ? `<button class="btn xs" data-ds="${esc(h)}" title="@${esc(h)}">${ico('flask')}${L('蒸馏X', 'Distill')}</button>` : ''}</span>`;
function viewHot() {
  if (!S.hot || S.hot.lang !== EN) { loadHot(); return `<div class="empty">${L('正在读取热点数据…', 'Loading trends…')}</div>`; }
  const H = S.hot, d = H.data;
  if (!d) return H.loading ? `<div class="empty">${L('正在读取热点数据…', 'Loading trends…')}</div>` : `<div class="card"><div class="err">${esc(H.err || L('还没有热点数据。', 'No trend data yet.'))}</div><div class="btns"><button class="btn sm" id="hotRe">${ico('refresh')}${L('重试', 'Retry')}</button></div></div>`;
  const head = `<div class="card hot-intro"><h3>${ico('flame')}${L('流量密码', 'Viral playbook')}</h3><p class="muted">${L('蓝朋友每天采集的热点，热度越高越靠前。看到合适的，点「改写这条帖」用你自己的观点写原创，或「蒸馏X」学习作者的写法。', 'XBlueV’s daily trend data, hottest first. Click “Rewrite” to write your own take, or “Distill” to learn how the author writes.')}</p>
    <div class="hot-meta"><small class="muted">${d.updatedAt ? L(`更新于 ${esc(d.updatedAt)} UTC`, `Updated ${esc(d.updatedAt)} UTC`) : ''}</small><button class="btn xs" id="hotRe" ${H.loading ? 'disabled' : ''}>${ico('refresh')}${H.loading ? L('刷新中…', 'Refreshing…') : L('刷新', 'Refresh')}</button></div></div>
    <div class="seg">${[['cloud', L('热议词云', 'Word cloud')], ['trends', L('X 热点', 'X trends')], ['posts', L('爆款推文', 'Viral posts')]].map(([k, t]) => `<button data-hsec="${k}" class="${H.sec === k ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  let body = '';
  if (H.sec === 'cloud') {
    const sz = (i, w) => Math.round(Math.max(12, Math.min(30, 30 - i * 0.7 + w * 4)));
    const tone = (i) => i < 3 ? 'hot' : i < 10 ? 'warm' : i < 25 ? 'mid' : '';
    const w = d.words[H.pick];
    body = `<div class="card"><div class="cloud">${d.words.map((x, i) => `<button class="word ${tone(i)}${x.kind === 'trend' ? ' tr' : ''}${i === H.pick ? ' on' : ''}" data-word="${i}" style="font-size:${sz(i, x.w)}px">${esc(x.t)}</button>`).join('') || `<div class="empty">${L('暂无数据', 'No data yet')}</div>`}</div>
      ${w ? `<div class="pick"><div><b>${esc(w.t)}</b> <small class="muted">${w.views ? `${cmp(w.views)} ${L('浏览', 'views')}` : ''}</small></div><div class="hacts"><button class="btn xs" data-href="${esc(w.href)}">${ico('link')}${L('查看', 'Open')}</button>${hotActs(w.src, w.h)}</div></div>` : `<p class="muted tip">${L('点一个词，可以改写它最热的那条帖，或蒸馏作者风格。', 'Tap a word to rewrite its top post or distill the author’s style.')}</p>`}</div>`;
  } else if (H.sec === 'trends') {
    const zh = d.words.filter((x) => x.kind === 'topic').slice(0, 15).map((x, i) => ({ rank: i + 1, name: x.t, views: x.views, href: x.href, src: x.src, h: x.h, move: '' }));
    const regions = [...new Set(d.trends.map((t) => t.region))];
    const rl = (r) => ({ zh: L('中文', 'Chinese'), worldwide: L('全球', 'Worldwide'), us: L('美国', 'US'), jp: L('日本', 'Japan') })[r] || r;
    const all = [...(zh.length ? ['zh'] : []), ...regions];
    const reg = all.includes(H.region) ? H.region : all[0];
    const items = reg === 'zh' ? zh : d.trends.filter((t) => t.region === reg);
    body = `<div class="chips" style="margin-bottom:10px">${all.map((r) => `<button data-hreg="${r}" class="${r === reg ? 'on' : ''}">${rl(r)}</button>`).join('')}</div>
      <div class="card hlist">${items.map((t) => `<div class="hrow"><span class="hrank${t.rank <= 3 ? ' top' : ''}">${t.rank}</span><div class="hname"><a data-href="${esc(t.href)}">${esc(t.name)}</a>${t.move === 'new' ? `<em class="mv up">${L('新', 'NEW')}</em>` : t.move === 'up' ? '<em class="mv up">↑</em>' : t.move === 'down' ? '<em class="mv">↓</em>' : ''}<small class="muted">${t.views ? `${cmp(t.views)} ${L('浏览', 'views')}` : L('X 实时趋势', 'Live trend')}</small></div></div>`).join('') || `<div class="empty">${L('暂无数据', 'No data yet')}</div>`}</div>`;
  } else {
    body = `<div class="card hlist">${d.posts.slice(0, 20).map((p) => `<div class="hpost"><div class="hau"><img class="av" src="${esc(p.a || DEFAULT_AVATAR)}" data-fallback alt=""><div><b>${esc(p.n)}</b><small class="muted">@${esc(p.h)}${p.topic ? ' · ' + esc(p.topic) : ''}</small></div></div>
      <p>${esc(p.text.length > 180 ? p.text.slice(0, 180) + '…' : p.text)}</p>
      <div class="hfoot"><span class="hmet">${ico('eye')}${cmp(p.imp)} ${ico('heart')}${cmp(p.likes)}</span><span class="hacts"><button class="btn xs" data-href="${esc(p.url)}">${ico('link')}${L('原帖', 'Post')}</button>${hotActs(p.text, p.h)}</span></div></div>`).join('') || `<div class="empty">${L('暂无数据', 'No data yet')}</div>`}</div>`;
  }
  return head + body + `<div class="card"><div class="btns" style="margin:0"><button class="btn sm" data-open="/viral">${L('在网站上看完整版 →', 'Open the full page →')}</button><button class="btn sm" data-open="/trend-to-original">${L('打开热点转原创', 'Open Trend Rewriter')}</button></div></div>`;
}
function bindHot() {
  $('hotRe')?.addEventListener('click', () => loadHot(true));
  document.querySelectorAll('[data-hsec]').forEach((b) => b.onclick = () => { S.hot.sec = b.dataset.hsec; render(); });
  document.querySelectorAll('[data-hreg]').forEach((b) => b.onclick = () => { S.hot.region = b.dataset.hreg; render(); });
  document.querySelectorAll('[data-word]').forEach((b) => b.onclick = () => { S.hot.pick = S.hot.pick === +b.dataset.word ? -1 : +b.dataset.word; render(); });
  document.querySelectorAll('[data-rw]').forEach((b) => b.onclick = () => openSite(studio('rw', b.dataset.rw)));
  document.querySelectorAll('[data-ds]').forEach((b) => b.onclick = () => openSite(studio('ds', b.dataset.ds)));
  // 话题详情是站内地址（/zh/trends/123），趋势和原帖是 x.com 地址
  document.querySelectorAll('[data-href]').forEach((b) => b.onclick = () => { const u = b.dataset.href; chrome.tabs.create({ url: /^https?:/.test(u) ? u : SITE + u }); });
}

// ---------- 渲染与事件
const TABS = () => [
  ['home', L('首页', 'Home'), '<path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'],
  ['nofb', L('回关', 'Follow-back'), '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M17 8h5"/>'],
  ['lost', L('取关', 'Unfollows'), '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="m17 6 4 4m0-4-4 4"/>'],
  ['exp', L('曝光', 'Views'), '<path d="M3 20h18"/><path d="M6 16v-5M11 16V7M16 16v-8M21 16V4"/>'],
  ['hot', L('流量密码', 'Viral'), ICON.flame],
  ['set', L('设置', 'Settings'), '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'],
];
function render() {
  document.documentElement.lang = EN ? 'en' : 'zh-CN';
  const titles = { home: L('蓝朋友', 'XBlueV'), nofb: L('谁没回关我', 'Who doesn’t follow back'), lost: L('谁取关了我', 'Who unfollowed me'), exp: L('曝光与方案', 'Views & plan'), hot: L('流量密码', 'Viral playbook'), set: L('设置', 'Settings') };
  $('pageTitle').textContent = titles[S.tab];
  $('who').textContent = S.me ? `@${S.me}${S.account ? ' · ' + L(`${int(S.account.points)} 积分`, `${int(S.account.points)} pts`) : ''}` : L('推特助手', 'X assistant');
  $('tabbar').innerHTML = TABS().map(([k, label, icon]) => `<button data-tab="${k}" class="${S.tab === k ? 'on' : ''}"><span class="${(k === 'nofb' && running('nofb')) || (k === 'lost' && running('unfollow')) || (k === 'exp' && running('exposure')) ? 'dot' : ''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></span>${label}</button>`).join('');
  const v = $('view');
  const keepScroll = v.dataset.tab === S.tab ? v.scrollTop : 0;
  v.innerHTML = S.tab === 'home' ? viewHome() : S.tab === 'nofb' ? viewNofb() : S.tab === 'lost' ? viewLost() : S.tab === 'exp' ? viewExp() : S.tab === 'hot' ? viewHot() : viewSet();
  v.dataset.tab = S.tab;
  v.scrollTop = keepScroll;
  bind();
}
function bind() {
  bindAccount();
  bindHot();
  $('frozenBtn')?.addEventListener('click', () => setTask('unfollow', 'info', frozenTip()));
  // 头像加载失败（账号换了头像、被冻结等）：换成默认头像
  document.querySelectorAll('img[data-fallback]').forEach((img) => { img.onerror = () => { img.onerror = null; img.src = DEFAULT_AVATAR; }; });
  document.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { if (S.tab !== b.dataset.tab) resetList(); S.tab = b.dataset.tab; render(); });
  document.querySelectorAll('[data-run]').forEach((b) => b.onclick = () => run(b.dataset.run));
  document.querySelectorAll('[data-stop]').forEach((b) => b.onclick = stop);
  $('openX')?.addEventListener('click', async () => { const t = await activeTab(); if (t) chrome.tabs.update(t.id, { url: 'https://x.com/home' }); else chrome.tabs.create({ url: 'https://x.com/home' }); });
  $('retry')?.addEventListener('click', refresh);
  // 搜索：输入时只重绘当前页，保留光标
  const qi = $('q');
  if (qi) qi.oninput = () => { S.list.q = qi.value; S.list.page = 1; const pos = qi.selectionStart; render(); const n = $('q'); n?.focus(); n?.setSelectionRange(pos, pos); };
  document.querySelectorAll('[data-filter]').forEach((b) => b.onclick = () => { S.list.filter = b.dataset.filter; S.list.page = 1; render(); });
  const so = $('sort');
  if (so) so.onchange = () => { S.list.sort = so.value; S.list.page = 1; render(); };
  document.querySelectorAll('[data-page]').forEach((b) => b.onclick = () => { S.list.page = Number(b.dataset.page) || 1; render(); $('view').scrollTop = 0; });
  document.querySelectorAll('[data-export]').forEach((b) => b.onclick = () => { if (b.dataset.export === 'csv') exportCSV(); else copyText(CUR.rows.filter((r) => r.h).map((r) => '@' + r.h).join('\n'), b); });
  // 去 TA 的主页：在当前标签页打开
  document.querySelectorAll('[data-go]').forEach((b) => b.onclick = async () => { const t = await activeTab(); const url = `https://x.com/${encodeURIComponent(b.dataset.go)}`; if (t) chrome.tabs.update(t.id, { url }); else chrome.tabs.create({ url }); });
  document.querySelectorAll('[data-lv]').forEach((b) => b.onclick = () => { S.lostView = b.dataset.lv; resetList(); render(); });
  // 分享：打开分享面板；设置里的「推荐给朋友」直接发推
  document.querySelectorAll('[data-share]').forEach((b) => b.onclick = () => openSheet(b.dataset.share));
  document.querySelectorAll('[data-tweet]').forEach((b) => b.onclick = () => tweet(shareData('all').text));
  // 转化率：拖动和输入框同步，保存下来
  const rate = $('rate'), rateNum = $('rateNum');
  const setRate = (v) => { S.rate = Math.max(1, Math.min(100, Math.round(Number(v) || DEFAULT_RATE))); set({ convRate2: S.rate }); render(); };
  if (rate) { rate.oninput = () => { $('rateTxt').textContent = rate.value + '%'; rateNum.value = rate.value; }; rate.onchange = () => setRate(rate.value); }
  if (rateNum) rateNum.onchange = () => setRate(rateNum.value);
  const vrate = $('vrate'), vrateNum = $('vrateNum');
  const setVrate = (v) => { S.vrate = Math.max(1, Math.min(100, Math.round(Number(v) || DEFAULT_VRATE))); set({ convVer: S.vrate }); render(); };
  if (vrate) { vrate.oninput = () => { $('vrateTxt').textContent = vrate.value + '%'; vrateNum.value = vrate.value; }; vrate.onchange = () => setVrate(vrate.value); }
  if (vrateNum) vrateNum.onchange = () => setVrate(vrateNum.value);
  // 设置
  document.querySelectorAll('[data-lang]').forEach((b) => b.onclick = async () => { await set({ lang: b.dataset.lang }); EN = b.dataset.lang === 'en'; render(); });
  if ($('diag')) diagText().then((t) => { if ($('diag')) $('diag').textContent = t; });
  $('home')?.addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getManifest().homepage_url }));
  $('clear')?.addEventListener('click', async () => {
    if (!confirm(L('清除本机保存的名单、取关记录和曝光数据？', 'Clear the lists, unfollow history and view data on this computer?'))) return;
    const all = await get(null);
    await new Promise((r) => chrome.storage.local.remove(Object.keys(all).filter((k) => /^(acct|exp|act):|^taskStatus$|^pendingTask$/.test(k)), r));
    refresh();
  });
}

async function diagText() {
  const all = await get(null);
  const bytes = await new Promise((r) => { try { chrome.storage.local.getBytesInUse(null, r); } catch { r(0); } });
  const a = S.acct || {};
  const d = all.diag;
  return [
    `v${VERSION} · ${navigator.userAgent.match(/(Edg|Chrome)\/[\d.]+/)?.[0] || ''}`,
    `${L('账号', 'account')}: ${S.me ? '@' + S.me : '—'} · ${L('当前页', 'tab')}: ${S.xtab && isX(S.xtab.url) ? 'x.com' : L('不是 x.com', 'not x.com')}`,
    `${L('已记下的 X 请求', 'captured X requests')}: hook v${S.hook?.v || 0} · ${(S.hook?.ops || []).join(', ') || L('还没有（第一次读取时会自动记下）', 'none yet (captured on first read)')}`,
    `${L('本机数据', 'local data')}: ${Math.round(bytes / 1024)} KB · ${L('关注', 'following')} ${a.following ? a.following.total + ' / ' + a.following.nofb.length : '—'} · ${L('粉丝', 'followers')} ${a.followers?.count ?? a.followers?.ids?.length ?? '—'} · ${L('取关记录', 'events')} ${(a.events || []).length}`,
    d ? `${L('上次错误', 'last error')}: ${new Date(d.at).toLocaleString()} ${d.kind} ${d.error}` : `${L('上次错误', 'last error')}: —`,
  ].join('\n');
}

async function refresh() { await load(); render(); }
// 倒计时：在「取关」页时每分钟刷新一次冷却时间
setInterval(() => { if (S.tab === 'lost' && unfollowWait() > 0 && !$('sheet')?.offsetParent) render(); }, 60000);

// 内容脚本发来的进度和结果：实时刷新（不重新识别标签页，避免闪动）
chrome.runtime.onMessage.addListener((msg) => { if (msg?.type === 'task') { S.tasks[msg.kind] = msg; if (msg.phase !== 'progress') refresh(); else render(); } });
chrome.storage.onChanged.addListener((changes) => {
  if (changes.token) { S.account = null; S.accountAt = 0; }
  if (Object.keys(changes).some((k) => /^(acct|exp):|^lang$|^token$/.test(k))) refresh();
});
chrome.tabs.onActivated.addListener(() => refresh());
chrome.tabs.onUpdated.addListener((id, info) => { if (info.status === 'complete' && S.xtab && id === S.xtab.id) refresh(); });
refresh();
