// 蓝朋友插件 · x.com 内容脚本：所有实时数据都直接读 x.com 页面上显示的内容，不调用任何接口、不花额度。
//
//  · 你的关注页 /你/following：X 会给回关你的人标「关注了你」，没有这个标记的就是没回关你的人 —— 标红，可以淡化已回关的人，
//    也可以「扫描全部关注」自动往下滚动读完整个列表，得出未回关名单。取关请你自己点 X 的「正在关注」按钮，插件不替你操作。
//  · 你的粉丝页 /你/followers：「扫描全部粉丝」读完整个列表存在本地；和上一次完整扫描对比，得出这段时间谁取关了你、谁新关注了你。
//  · 认证粉丝页 /你/verified_followers：统计认证粉丝数（创作者收益要求 500 名认证粉丝）。
//  · 任何人的主页：页面上的实时粉丝 / 关注数、TA 是否关注了你、回关可能性，一键统计 TA 今天发了几条原创、几条回复。
// 读到的列表只存在你自己浏览器的 chrome.storage.local 里。插件不登录任何账号、不连接任何服务器，只和 x.com 打交道。
// 插件更新后会把脚本补注入到已经打开的页面：同一个页面只运行一份
if (!window.__xbvLoaded) {
  window.__xbvLoaded = true;
  // 界面语言：默认中文，在插件「设置」里可以切换成 English
  chrome.storage.local.get('lang', ({ lang }) => main(lang === 'en'));
}

function main(EN) {
  const L = (zh, en) => (EN ? en : zh);
  // 在插件设置里切换语言后立即生效（不用刷新 x.com）
  chrome.storage.onChanged.addListener((c) => { if (c.lang) EN = c.lang.newValue === 'en'; });
  const RESERVED = new Set(['home', 'explore', 'notifications', 'messages', 'i', 'settings', 'search', 'compose', 'login', 'logout', 'signup', 'tos', 'privacy', 'jobs', 'bookmarks', 'lists', 'communities', 'premium', 'verified-choose', 'account', 'intent', 'share', 'hashtag', 'download', 'grok', 'about']);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const int = (v) => (Number(v) || 0).toLocaleString(EN ? 'en' : 'zh-CN');
  const sgn = (v) => (v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + int(Math.abs(v)));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get: (k) => new Promise((r) => chrome.storage.local.get(k, (v) => r(v[k]))),
    // 保存失败（例如浏览器存储空间不够）要报出来，不能悄悄吞掉
    set: (k, v) => new Promise((r, j) => chrome.storage.local.set({ [k]: v }, () => { const e = chrome.runtime.lastError; if (e) j(new Error('save:' + e.message)); else r(); })),
  };
  // x.com 的深色 / 浅色主题看 body 背景色；透明背景（alpha 为 0）按浅色处理
  const dark = () => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(getComputedStyle(document.body).backgroundColor || ''); if (!m || (m[4] != null && Number(m[4]) === 0)) return false; return (+m[1] + +m[2] + +m[3]) / 3 < 100; };
  const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const dayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const hm = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  // ---------- 页面识别
  // 当前登录的推特号：左侧导航的「个人资料」链接；找不到时看左下角账号切换按钮里的 @用户名；都没有就用上次记住的
  let lastMe = '';
  store.get('me').then((v) => { if (v && !lastMe) lastMe = v; });
  const me = () => {
    const a = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    let m = /^\/([A-Za-z0-9_]{1,15})$/.exec(a?.getAttribute('href') || '');
    if (!m) m = /@([A-Za-z0-9_]{1,15})/.exec(document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]')?.innerText || '');
    if (m) lastMe = m[1].toLowerCase();
    return lastMe;
  };
  const route = () => {
    const m = /^\/([A-Za-z0-9_]{1,15})(?:\/(with_replies|media|likes|highlights|articles|superfollows|affiliates|verified_followers|followers|following|followers_you_follow))?\/?$/.exec(location.pathname);
    if (!m || RESERVED.has(m[1].toLowerCase())) return null;
    const sub = m[2] || '';
    const list = ['following', 'followers', 'verified_followers'].includes(sub) ? sub : '';
    return { handle: m[1], h: m[1].toLowerCase(), sub, list };
  };

  // ---------- 读取列表里的一个用户（关注 / 粉丝页的 UserCell）
  function parseCell(cell) {
    let h = '';
    for (const a of cell.querySelectorAll('a[href^="/"]')) { const m = /^\/([A-Za-z0-9_]{1,15})$/.exec(a.getAttribute('href') || ''); if (m) { h = m[1]; break; } }
    if (!h) return null;
    const nameLink = cell.querySelector(`a[href="/${h}"]`);
    const name = (nameLink?.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean)[0] || h;
    const img = cell.querySelector('img[src*="profile_images"]');
    return {
      h, name, avatar: img ? img.getAttribute('src') : '',
      fb: !!cell.querySelector('[data-testid="userFollowIndicator"]'), // TA 关注了你
      v: !!cell.querySelector('[data-testid="icon-verified"]'),        // 认证账号
      iFollow: !!cell.querySelector('[data-testid$="-unfollow"]'),      // 你关注着 TA
    };
  }
  const cells = () => [...document.querySelectorAll('[data-testid="primaryColumn"] [data-testid="UserCell"]')];

  // ---------- 关注页：没回关你的人标红；淡化已回关的人
  const STYLE_ID = 'xbv-style';
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      [data-testid="UserCell"][data-xbv="nofb"]{box-shadow:inset 4px 0 0 #f4212e;background:rgba(244,33,46,.06);position:relative}
      [data-testid="UserCell"][data-xbv="nofb"]::after{content:"${L('未回关', 'No follow-back')}";position:absolute;top:8px;right:132px;padding:1px 8px;border-radius:999px;background:#f4212e;color:#fff;font:700 11px/18px system-ui,sans-serif;pointer-events:none}
      body.xbv-dim [data-testid="UserCell"][data-xbv="fb"]{opacity:.28}
      [data-testid="UserCell"][data-xbv="lost"]{box-shadow:inset 4px 0 0 #ffad1f}`;
    document.head.appendChild(s);
  }
  function markFollowing() {
    ensureStyle();
    let nofb = 0;
    for (const c of cells()) { const p = parseCell(c); if (!p) continue; const v = p.fb ? 'fb' : 'nofb'; if (c.dataset.xbv !== v) c.dataset.xbv = v; if (!p.fb) nofb++; }
    return nofb;
  }

  // ---------- 自动往下滚动读完整个列表（关注 / 粉丝 / 认证粉丝）
  let stopFlag = false;
  async function scanList(onProgress) {
    stopFlag = false;
    const map = new Map();
    const grab = () => { for (const c of cells()) { const p = parseCell(c); if (p && !map.has(p.h.toLowerCase())) map.set(p.h.toLowerCase(), p); } };
    window.scrollTo(0, 0);
    await sleep(900);
    let still = 0;
    for (let round = 0; round < 3000 && !stopFlag; round++) {
      grab();
      onProgress(map.size);
      const before = map.size, y = window.scrollY;
      window.scrollBy(0, Math.round(window.innerHeight * 0.85));
      await sleep(650 + Math.random() * 600); // 别滚太快：给 X 加载下一页的时间，也不像机器人
      grab();
      if (map.size === before) { still++; if (window.scrollY === y) await sleep(900); } else still = 0;
      if (still >= 7) break; // 连续几轮没有新的人、也滚不动了：到底了
    }
    return { list: [...map.values()], complete: !stopFlag, at: Date.now() };
  }

  // ---------- 账号数据存储（按你的推特号分开存，换号不会串）
  const acctKey = (h) => `acct:${h}`;
  const getAcct = async (h) => (await store.get(acctKey(h))) || {};
  // 写入排队：两份名单同时读完时，各自只改自己那部分，并且在最新数据上改，不会互相覆盖
  let acctLock = Promise.resolve();
  const patchAcct = (h, fn) => { const p = acctLock.then(async () => { const a = await getAcct(h); fn(a); await store.set(acctKey(h), a); }); acctLock = p.catch(() => {}); return p; };

  // 名单里每个人存成 {h 用户名, n 昵称, a 头像, v 认证, f TA关注了你, i 你关注着TA, id 推特用户ID}
  const slim = (p) => ({ h: p.h, n: p.name || p.n || p.h, a: p.avatar || p.a || '', v: p.v ? 1 : 0, f: p.fb ? 1 : 0, i: p.iFollow ? 1 : 0, id: p.id || '', c: Number(p.followers ?? p.c ?? 0) || 0 });
  // 资料缓存（ID → [用户名, 昵称, 头像, 认证, 粉丝数]）：取关的人如果已经注销，用它显示头像和昵称
  const packProf = (p) => [p.h, p.name || p.n || p.h, p.avatar || p.a || '', p.v ? 1 : 0, Number(p.followers ?? p.c ?? 0) || 0];
  const unpackProf = (id, a) => ({ id, h: a[0], n: a[1], a: a[2], v: a[3], c: a[4] || 0 });
  // 旧版本存的是数组 [h, name, v, iFollow]，读出来时统一转成对象
  const norm = (p) => (Array.isArray(p) ? { h: p[0], n: p[1], v: p[2] || 0, i: p[3] || 0, a: '', id: '' } : p);

  /** 关注名单读完：存没回关的人（带头像）和你关注的所有人的 ID */
  async function saveFollowing(h, r) {
    const all = r.nofb || r.list.filter((p) => !p.fb);
    // 没有头像资料的账号（X 没返回资料：多半已注销或被冻结）不显示，只记个数
    const nofb = all.filter((p) => p.h && (p.avatar || p.a));
    const following = { at: r.at, complete: r.complete, total: r.total ?? r.list.length, mode: r.mode || 'list', nofb: nofb.map((p) => ({ ...slim(p), i: 1 })), hidden: (r.hidden || 0) + all.length - nofb.length };
    const followingIds = r.followingIds || r.list.map((p) => p.id || p.h.toLowerCase());
    await patchAcct(h, (a) => {
      a.following = following; a.followingKeys = followingIds;
      // 你关注的人的资料存进缓存：以后取关你的人如果是你关注着的，就能显示头像
      const prof = a.prof || {};
      for (const p of [...(r.list || []), ...nofb]) if (p.id && p.h && (p.avatar || p.a)) prof[p.id] = packProf(p);
      a.prof = prof;
    });
    return following;
  }

  /**
   * 粉丝名单读完后，和插件上一次读到的完整名单对比，得出取关和新关注。
   * r.ids：这次的全部粉丝 ID；r.prof：这次拿到资料的人（ID → 资料）；第一次读取只保存基准。
   */
  async function saveFollowers(h, r) {
    const a = await getAcct(h);
    const following = new Set(a.followingKeys || []);
    const cur = r.ids;
    const curSet = new Set(cur);
    // 上一次的基准：新版存 ID 列表，旧版存用户列表
    const prev = a.followers ? (a.followers.ids ? { at: a.followers.at, ids: a.followers.ids } : { at: a.followers.at, ids: (a.followers.list || []).map(norm).map((p) => p.id || String(p.h).toLowerCase()) }) : null;
    const cache = { ...(a.prof || {}) };
    for (const p of (a.followers?.list || []).map(norm)) if (p.id && !cache[p.id]) cache[p.id] = packProf(p);
    for (const [id, p] of r.prof) cache[id] = packProf(p);
    let diff = null, note = '';
    if (!r.complete) note = L('读取被停止，这次不做对比。', 'Stopped — no comparison this time.');
    else if (!prev || !prev.ids.length) note = L('这是第一次读取，已保存为基准；下次读取就能看到这段时间谁取关了你、谁新关注了你。', 'First read saved as a baseline. Next time you’ll see who unfollowed you and who followed you.');
    else if (prev.ids.some((x) => !/^\d+$/.test(x))) note = L('插件升级后名单格式变了，这次已保存为新的基准，下次读取就能对比。', 'The extension was updated; this read is saved as the new baseline.');
    else if (cur.length < prev.ids.length * 0.9) note = L('这次读到的粉丝比上次少了 10% 以上，可能没读完整，这次不做对比，建议稍后再读。', 'Read 10%+ fewer followers than last time — may be incomplete, so not compared.');
    else {
      const prevSet = new Set(prev.ids);
      const lostIds = prev.ids.filter((id) => !curSet.has(id));
      const gainedIds = cur.filter((id) => !prevSet.has(id));
      // 只显示拿到头像资料的人；X 没返回资料的（多半已注销或被冻结）只记个数
      const show = (id) => { const p = r.prof.get(id); return p ? slim(p) : cache[id] ? unpackProf(id, cache[id]) : null; };
      const lostAll = lostIds.map((id) => { const p = show(id); return p && p.h && p.a ? { ...p, gone: !r.prof.has(id), i: following.has(id) ? 1 : 0 } : null; });
      const gainedAll = gainedIds.map((id) => { const p = show(id); return p && p.h && p.a ? { ...p, f: 1 } : null; });
      const lost = lostAll.filter(Boolean), gained = gainedAll.filter(Boolean);
      diff = { at: r.at, since: prev.at, source: 'local', lost, gained, lostTotal: lostIds.length, gainedTotal: gainedIds.length };
    }
    // 资料缓存只留现在的粉丝和最近取关的人，避免越存越大
    const keepIds = new Set(cur);
    for (const e of [diff, ...(a.events || [])].filter(Boolean).slice(0, 30)) for (const p of e.lost) keepIds.add(p.id);
    const prof = {};
    for (const id of keepIds) if (cache[id]) prof[id] = cache[id];
    const keep = r.complete && !(note && !note.startsWith(L('这是第一次', 'First')) && !note.startsWith(L('插件升级', 'The extension')));
    await patchAcct(h, (latest) => {
      if (diff) latest.events = [diff, ...(latest.events || [])].slice(0, 30);
      if (keep) latest.followers = { at: r.at, ids: cur, count: cur.length };
      latest.prof = prof;
    });
    return { diff, note, total: cur.length };
  }
  async function saveVerified(h, r) {
    const verified = { at: r.at, complete: r.complete, count: r.list.length };
    await patchAcct(h, (a) => { a.verified = verified; });
    return verified;
  }

  // ---------- 浮动工具条（Shadow DOM，不影响 x.com 样式）
  let bar = null, barKind = '';
  function shadowBox(css) {
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    const dk = dark();
    root.innerHTML = `<style>
      :host{all:initial}
      .box{font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:${dk ? '#e7e9ea' : '#0f1419'};background:${dk ? '#0b0d10' : '#fff'};border:1px solid ${dk ? '#2f3336' : '#e6ecf0'};border-radius:16px;box-shadow:0 12px 32px rgba(0,0,0,.18)}
      a{color:#1d9bf0;text-decoration:none}a:hover{text-decoration:underline}
      .muted{color:${dk ? '#71767b' : '#536471'}} .ok{color:#00ba7c} .bad{color:#f4212e} .mid{color:#ffad1f}
      button{font:inherit;font-weight:700;cursor:pointer;border-radius:999px;padding:6px 12px;border:1px solid ${dk ? '#536471' : '#cfd9de'};background:transparent;color:inherit}
      button.main{background:${dk ? '#eff3f4' : '#0f1419'};color:${dk ? '#0f1419' : '#fff'};border-color:transparent}
      button:disabled{opacity:.5;cursor:default}
      ul{list-style:none;margin:8px 0 0;padding:0;max-height:240px;overflow:auto}
      li{display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-top:1px solid ${dk ? '#2f3336' : '#eff3f4'}}
      li span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      ${css}</style>`;
    return { host, root };
  }

  function mountBar(kind, mine) {
    if (bar && barKind === kind && bar.isConnected) return;
    bar?.remove();
    barKind = kind;
    const { host, root } = shadowBox(`.box{position:fixed;right:20px;bottom:20px;z-index:2147483000;width:320px;padding:12px 14px}
      .hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}.hd b{display:flex;gap:6px;align-items:center}
      .dot{width:8px;height:8px;border-radius:50%;background:linear-gradient(135deg,#2864df,#7642dc)}
      .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px} .x{border:0;padding:0 4px;font-size:16px;line-height:1}`);
    bar = host;
    const title = { following: L('关注列表 · 谁没回关我', 'Following · who doesn’t follow back'), followers: L('粉丝列表 · 谁取关了我', 'Followers · who unfollowed me'), verified_followers: L('认证粉丝统计', 'Verified followers') }[kind];
    root.innerHTML += `<div class="box"><div class="hd"><b><span class="dot"></span>${esc(title)}</b><button class="x" id="close" title="${L('收起', 'Close')}">×</button></div><div id="body"></div></div>`;
    document.body.appendChild(host);
    root.getElementById('close').onclick = () => { host.remove(); };
    renderBar(root, kind, mine);
  }

  async function renderBar(root, kind, mine) {
    const body = root.getElementById('body');
    const a = await getAcct(mine);
    if (kind === 'following') {
      const f = a.following;
      body.innerHTML = `<p class="muted" style="margin:0">${L('没回关你的人已经标红。你可以直接点 X 的「正在关注」按钮取关，插件不会替你操作。', 'People who don’t follow you back are marked red. Unfollow with X’s own “Following” button — the extension never does it for you.')}</p>
        ${f ? `<p style="margin:8px 0 0">${L(`上次扫描 ${hm(f.at)}：关注 ${int(f.total)} 人，<b class="bad">${int(f.nofb.length)} 人没回关</b>`, `Last scan ${hm(f.at)}: following ${int(f.total)}, <b class="bad">${int(f.nofb.length)} don’t follow back</b>`)}${f.complete ? '' : L('（未扫完）', ' (partial)')}</p>` : ''}
        <div class="row"><button class="main" id="scan">${L('读取全部关注', 'Read all following')}</button><button id="dim">${document.body.classList.contains('xbv-dim') ? L('显示全部', 'Show all') : L('淡化已回关', 'Dim mutuals')}</button></div>
        <div id="out"></div>`;
      root.getElementById('dim').onclick = (e) => { document.body.classList.toggle('xbv-dim'); e.target.textContent = document.body.classList.contains('xbv-dim') ? L('显示全部', 'Show all') : L('淡化已回关', 'Dim mutuals'); };
      if (f?.nofb?.length) showList(root.getElementById('out'), f.nofb.map(norm).map((p) => [p.h, p.n]), L('未回关名单', 'Not following back'));
    } else if (kind === 'followers') {
      // 谁取关了我改为通过蓝朋友网站接口读取（不占用你推特账号的额度），在插件侧边栏里查看
      body.innerHTML = `<p class="muted" style="margin:0">${L('「谁取关了我」现在通过蓝朋友网站接口读取，不占用你推特账号的额度。点浏览器工具栏上的蓝朋友图标，在侧边栏的「取关」里查看。', '“Who unfollowed me” now reads through the XBlueV API, without using your X account’s quota. Open the XBlueV side panel and go to Unfollows.')}</p>`;
      return;
    } else {
      const v = a.verified;
      body.innerHTML = `${v ? `<p style="margin:0">${L(`上次统计 ${hm(v.at)}：<b>${int(v.count)}</b> 名认证粉丝`, `Last count ${hm(v.at)}: <b>${int(v.count)}</b> verified followers`)} · ${v.count >= 500 ? `<b class="ok">${L('已达到 500', '500 reached')}</b>` : L(`离 500 还差 <b class="bad">${int(500 - v.count)}</b>`, `<b class="bad">${int(500 - v.count)}</b> to go`)}</p>` : `<p class="muted" style="margin:0">${L('创作者收益要求至少 500 名认证粉丝。滚动读完这个列表就能知道你有多少名。', 'Creator revenue needs 500 verified followers. Scan this list to count yours.')}</p>`}
        <div class="row"><button class="main" id="scan">${L('统计认证粉丝', 'Count verified followers')}</button></div><div id="out"></div>`;
    }
    root.getElementById('scan').onclick = () => runScan(root, kind, mine);
  }

  function showList(el, rows, title) {
    el.innerHTML = `<p style="margin:10px 0 0"><b>${esc(title)}</b> <span class="muted">${int(rows.length)}</span></p><ul>${rows.slice(0, 500).map(([h, n, tag]) => `<li><span>${esc(n)} <span class="muted">@${esc(h)}</span>${tag ? ` <span class="mid">· ${esc(tag)}</span>` : ''}</span><a href="/${encodeURIComponent(h)}">${L('主页', 'Profile')}</a></li>`).join('')}</ul>`;
  }

  /** 工具条上的「读取全部」：和侧边栏用同一套快速读取（X 名单页的请求 → 滚动页面） */
  async function runScan(root, kind, mine) {
    const btn = root.getElementById('scan');
    btn.disabled = true;
    stopFlag = false;
    await runTaskHere({ following: 'nofb', followers: 'unfollow', verified_followers: 'verified' }[kind]);
    if (kind === 'following') markFollowing();
    await renderBar(root, kind, mine);
  }

  // ---------- 主页：时间线里读帖子（统计今天发了几条原创、几条回复）
  function parseTweet(art) {
    const t = art.querySelector('a[href*="/status/"] time');
    const link = t?.closest('a');
    const m = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/.exec(link?.getAttribute('href') || '');
    if (!m) return null;
    return { author: m[1].toLowerCase(), id: m[2], at: Date.parse(t.getAttribute('datetime') || '') || 0, social: !!art.querySelector('[data-testid="socialContext"]') };
  }
  async function scanTimeline(h, onProgress) {
    const since = today0();
    const ids = new Set();
    let older = 0, still = 0;
    window.scrollTo(0, 0);
    await sleep(1200);
    for (let round = 0; round < 80 && !stopFlag; round++) {
      const before = ids.size;
      for (const art of document.querySelectorAll('[data-testid="primaryColumn"] article[data-testid="tweet"]')) {
        const p = parseTweet(art);
        if (!p || p.author !== h) continue; // 别人的帖子（对话上下文、转发的原帖）不算
        if (p.at >= since) ids.add(p.id);
        else if (!p.social) older++; // 置顶帖带 socialContext，可能很旧，不算作「已经翻到昨天」
      }
      onProgress(ids.size);
      if (older >= 3) break; // 已经连续看到昨天以前的帖子：今天的都读完了
      if (ids.size === before) { if (++still >= 5) break; } else still = 0;
      window.scrollBy(0, Math.round(window.innerHeight * 0.9));
      await sleep(700 + Math.random() * 500);
    }
    return ids;
  }
  async function openTab(h, sub) {
    const href = sub ? `/${h}/${sub}` : `/${h}`;
    if (location.pathname.toLowerCase() === href.toLowerCase()) return true;
    const tab = [...document.querySelectorAll('[data-testid="primaryColumn"] a[role="tab"]')].find((a) => (a.getAttribute('href') || '').toLowerCase() === href.toLowerCase());
    if (!tab) return false;
    tab.click();
    for (let i = 0; i < 30 && location.pathname.toLowerCase() !== href.toLowerCase(); i++) await sleep(200);
    await sleep(1500); // 等新标签页的帖子加载出来
    return true;
  }
  /** 今天：原创 = 「帖子」页今天的帖；回复 = 「回复」页里今天由 TA 发的、但不在「帖子」页里的 */
  async function scanToday(handle, onProgress) {
    stopFlag = false;
    const h = handle.toLowerCase();
    if (!(await openTab(handle, ''))) throw new Error('tab');
    const posts = await scanTimeline(h, (n) => onProgress(L(`正在读「帖子」：今天 ${n} 条…`, `Reading Posts: ${n} today…`)));
    if (stopFlag) return null;
    if (!(await openTab(handle, 'with_replies'))) throw new Error('tab');
    const all = await scanTimeline(h, (n) => onProgress(L(`正在读「回复」：今天 ${n} 条…`, `Reading Replies: ${n} today…`)));
    await openTab(handle, '');
    window.scrollTo(0, 0);
    const replies = [...all].filter((id) => !posts.has(id)).length;
    const res = { day: dayKey(), at: Date.now(), posts: posts.size, replies };
    await store.set(`act:${h}`, res);
    return res;
  }

  // ---------- 主页面板
  let panel = null, panelFor = '';
  const parseCount = (s) => {
    const t = String(s || '').replace(/,/g, '').trim();
    const m = /^([\d.]+)\s*([KkMm万亿]?)/.exec(t);
    if (!m) return null;
    const n = parseFloat(m[1]);
    return Math.round(n * ({ K: 1e3, k: 1e3, M: 1e6, m: 1e6, 万: 1e4, 亿: 1e8 }[m[2]] || 1));
  };
  /** 主页头部的实时数字（X 页面上显示的粉丝 / 关注数） */
  function liveCounts(h) {
    const pick = (sub) => { const a = document.querySelector(`[data-testid="primaryColumn"] a[href="/${h}/${sub}" i]`); return a ? parseCount(a.innerText.split(/\s/)[0]) : null; };
    return { followers: pick('verified_followers') ?? pick('followers'), following: pick('following'), followsYou: !!document.querySelector('[data-testid="primaryColumn"] [data-testid="UserName"] ~ * [data-testid="userFollowIndicator"], [data-testid="primaryColumn"] [data-testid="userFollowIndicator"]') };
  }
  const FB = { high: [L('高', 'High'), 'ok'], medium: [L('中', 'Medium'), 'mid'], low: [L('低', 'Low'), 'bad'], unstable: [L('不稳定', 'Unstable'), 'mid'] };
  const fbLevel = (followers, following) => {
    if (!followers || following == null) return null;
    const r = Math.round(following / followers * 1000) / 10;
    return { r, level: r >= 75 && r <= 300 ? 'high' : r > 300 ? 'unstable' : r >= 40 ? 'medium' : 'low' };
  };

  function mountPanel(anchor, route) {
    panel?.remove();
    const { host, root } = shadowBox(`.box{margin:12px 0 4px;padding:12px 14px;box-shadow:none}
      .hd{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.hd b{display:flex;align-items:center;gap:6px}
      .dot{width:8px;height:8px;border-radius:50%;background:linear-gradient(135deg,#2864df,#7642dc)}
      .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.stats small{display:block;font-size:11.5px}.stats b{font-size:17px}
      .spark{display:block;width:100%;height:54px;margin:6px 0 4px}.spark .l{fill:none;stroke:#1d9bf0;stroke-width:2;stroke-linejoin:round}.spark .a{fill:#1d9bf0;opacity:.12}
      .row{display:flex;gap:10px;margin-top:6px;align-items:baseline}.k{flex-shrink:0;width:72px;font-size:12px}
      .act{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px}`);
    panel = host;
    panelFor = route.h;
    host.style.display = 'block';
    root.innerHTML += `<div class="box"><div class="hd"><b><span class="dot"></span>${L('蓝朋友数据', 'XBlueV data')}</b></div><div id="live"></div><div class="row"><span class="k muted">${L('今天发帖', 'Today')}</span><span id="today"></span></div></div>`;
    anchor.insertAdjacentElement('afterend', host);
    renderLive(root, route);
    renderToday(root, route);
  }

  function renderLive(root, route) {
    const c = liveCounts(route.handle);
    const fb = fbLevel(c.followers, c.following);
    const [t, cls] = fb ? FB[fb.level] : [L('未知', 'Unknown'), ''];
    const isMe = route.h === me();
    root.getElementById('live').innerHTML = `
      <div class="stats"><div><small class="muted">${L('粉丝（实时）', 'Followers (live)')}</small><b>${c.followers != null ? int(c.followers) : '—'}</b></div><div><small class="muted">${L('关注（实时）', 'Following (live)')}</small><b>${c.following != null ? int(c.following) : '—'}</b></div><div><small class="muted">${L('关注 ÷ 粉丝', 'Following ÷ followers')}</small><b>${fb ? fb.r + '%' : '—'}</b></div></div>
      ${isMe ? '' : `<div class="row"><span class="k muted">${L('是否关注你', 'Follows you')}</span><span>${c.followsYou ? `<b class="ok">${L('TA 已关注你', 'Yes')}</b>` : `<b class="muted">${L('还没有关注你', 'Not yet')}</b>`}</span></div>
      <div class="row"><span class="k muted">${L('回关可能性', 'Follow-back')}</span><span><b class="${cls}">${t}</b> <span class="muted">${fb ? L(`关注 ÷ 粉丝 ${fb.r}%`, `following ÷ followers ${fb.r}%`) : ''}</span></span></div>`}`;
  }

  async function renderToday(root, route) {
    const el = root.getElementById('today');
    const saved = await store.get(`act:${route.h}`);
    const fresh = saved && saved.day === dayKey();
    el.innerHTML = `${fresh ? L(`原创 <b>${int(saved.posts)}</b> 条 · 回复 <b>${int(saved.replies)}</b> 条 <span class="muted">（${hm(saved.at)} 统计）</span> `, `<b>${int(saved.posts)}</b> posts · <b>${int(saved.replies)}</b> replies <span class="muted">(${hm(saved.at)})</span> `) : ''}<button id="count">${fresh ? L('重新统计', 'Recount') : L('统计今天发了多少', 'Count today’s posts')}</button>`;
    root.getElementById('count').onclick = async (e) => {
      const btn = e.target;
      btn.disabled = true;
      const toast = showToast(L('正在读取 TA 的帖子…（请停留在这个页面）', 'Reading posts… (stay on this page)'));
      try {
        const res = await scanToday(route.handle, (msg) => toast.set(msg));
        toast.done(res ? L(`今天：原创 ${res.posts} 条、回复 ${res.replies} 条`, `Today: ${res.posts} posts, ${res.replies} replies`) : L('已停止', 'Stopped'));
      } catch {
        toast.done(L('读不到时间线，请回到 TA 的主页再试', 'Couldn’t read the timeline. Open their profile and try again'));
      }
      if (panel?.isConnected) renderToday(root, route);
    };
  }

  // 浮动提示（统计今天发帖时页面会滚动，面板会滚出视野）
  function showToast(text) {
    const { host, root } = shadowBox(`.box{position:fixed;left:50%;bottom:var(--xbv-b,24px);transform:translateX(-50%);z-index:2147483000;padding:10px 14px;display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;width:min(420px,90vw)}
      #t{flex:1;min-width:0}
      .pb{flex-basis:100%;height:6px;border-radius:99px;background:rgba(29,155,240,.18);overflow:hidden}
      .pb i{display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,#1d9bf0,#6a55e6);transition:width .3s}
      .pb.ind i{width:35%;animation:ind 1.2s ease-in-out infinite}
      @keyframes ind{0%{transform:translateX(-110%)}100%{transform:translateX(310%)}}`);
    root.innerHTML += `<div class="box"><span id="t">${esc(text)}</span><button id="s">${L('停止', 'Stop')}</button><div class="pb ind" id="pb"><i></i></div></div>`;
    // 同时有两个读取任务时，提示条往上叠，不互相挡住
    host.dataset.xbvToast = '1';
    host.style.setProperty('--xbv-b', 24 + (document.querySelectorAll('[data-xbv-toast]').length * 56) + 'px');
    document.body.appendChild(host);
    root.getElementById('s').onclick = () => { stopFlag = true; window.postMessage({ source: 'xbv-cs5', type: 'stop' }, location.origin); };
    return {
      set: (t, pct) => { root.getElementById('t').textContent = t; const pb = root.getElementById('pb'); if (!pb) return; pb.classList.toggle('ind', pct == null); pb.firstChild.style.width = pct == null ? '' : pct + '%'; },
      done: (t) => { root.getElementById('t').textContent = t; root.getElementById('pb')?.remove(); const s = root.getElementById('s'); s.textContent = L('关闭', 'Close'); s.onclick = () => host.remove(); setTimeout(() => host.remove(), 8000); },
    };
  }

  // ---------- 侧边栏下发的任务：插件自己切到对应页面、自动读取，进度和结果回传给侧边栏
  // 任务：nofb 谁没回关我（关注页）· unfollow 谁取关了我（粉丝页）· verified 认证粉丝（认证粉丝页）· today 今天发帖（自己的主页）
  const TASKS = { nofb: 'following', unfollow: 'followers', verified: 'verified_followers', today: '', exposure: 'with_replies' };

  // ---------- 曝光：读你近 3 天（含今天）的帖子和回复，每条的浏览量和互动
  const EXP_DAYS = 3;
  const dayOf = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  // 帖子正文的有效字数（去掉链接和 @）、是不是互关 / 互粉 / 求回关这类帖子：和 hook.js 里的规则一致
  const MUTUAL = /互关|互粉|回关|互fo|有关必回|必回关|求关注|关注我|涨粉|fo\s*back|follow\s*back|#?f4f|#?ifb|#?互关/i;
  const lenOf = (t) => [...String(t || '').replace(/https?:\/\/\S+/g, '').replace(/@\w+/g, '').replace(/\s+/g, '')].length;
  const numIn = (el) => parseCount(((el?.getAttribute('aria-label') || el?.innerText || '').match(/[\d.,]+\s*[KkMm万亿]?/) || [''])[0]) || 0;
  /** 页面读取一个标签页的帖子（快速读取不可用时）：往下滚动，读到 since 之前为止 */
  async function domTab(h, sub, since, onItem) {
    if (!(await openTab(h, sub))) throw new Error('tab');
    const seen = new Map();
    let older = 0, still = 0;
    window.scrollTo(0, 0);
    await sleep(1000);
    for (let round = 0; round < 400 && !stopFlag; round++) {
      const before = seen.size;
      for (const art of document.querySelectorAll('[data-testid="primaryColumn"] article[data-testid="tweet"]')) {
        const p = parseTweet(art);
        if (!p || p.author !== h || seen.has(p.id)) continue;
        if (p.at < since) { if (!p.social) older++; continue; }
        const text = art.querySelector('[data-testid="tweetText"]')?.innerText || '';
        const t = { id: p.id, at: p.at, views: numIn(art.querySelector('a[href$="/analytics"]')), likes: numIn(art.querySelector('[data-testid="like"],[data-testid="unlike"]')), replies: numIn(art.querySelector('[data-testid="reply"]')), reposts: numIn(art.querySelector('[data-testid="retweet"],[data-testid="unretweet"]')), len: lenOf(text), mutual: MUTUAL.test(text), repost: !!p.social && /转帖|reposted/i.test(art.querySelector('[data-testid="socialContext"]')?.innerText || '') };
        seen.set(p.id, t);
        onItem(t);
      }
      if (older >= 3) break;
      if (seen.size === before) { if (++still >= 6) break; } else still = 0;
      window.scrollBy(0, Math.round(window.innerHeight * 1.6));
      await sleep(450 + Math.random() * 250);
    }
    return seen;
  }
  /** 页面读取（快速读取不可用时）：先读「帖子」页得到原创，再读「回复」页，出现在「回复」页但不在「帖子」页的就是回复 */
  async function domExposure(h, since, onProgress) {
    let oldest = Date.now();
    const track = (t) => { if (t.at < oldest) oldest = t.at; };
    const posts = await domTab(h, '', since, (t) => { track(t); onProgress(null, { oldest, phase: 'posts' }); });
    if (stopFlag) return { tweets: [...posts.values()].map((t) => ({ ...t, reply: false })), complete: false, dom: true };
    oldest = Date.now();
    const all = await domTab(h, 'with_replies', since, (t) => { track(t); onProgress(null, { oldest, phase: 'replies' }); });
    await openTab(h, '');
    window.scrollTo(0, 0);
    const out = new Map();
    for (const [id, t] of posts) out.set(id, { ...t, reply: false });
    for (const [id, t] of all) if (!out.has(id)) out.set(id, { ...t, reply: true });
    return { tweets: [...out.values()], complete: !stopFlag, dom: true };
  }
  async function readExposure(mine, onProgress) {
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    const since = d0.getTime() - (EXP_DAYS - 1) * 864e5;
    const op = 'UserTweetsAndReplies';
    // 进度：从现在往前读到 since 为 100%（页面读取分两段：帖子页 0–50%，回复页 50–100%）
    const pctOf = (oldest, half) => { const p = Math.max(0, Math.min(1, (Date.now() - oldest) / (Date.now() - since))); return Math.round(half === 'posts' ? p * 50 : half === 'replies' ? 50 + p * 49 : p * 99); };
    const prog = (n, d) => onProgress(n, d?.oldest ? pctOf(d.oldest, d.phase) : null);
    const fast = async () => {
      if (!(await hookHas(op))) return null;
      const d = await hookAsk('fetchTimeline', { op, owner: mine, self: true, since }, prog, 5 * 60e3);
      if (RATE.includes(d?.error) && !d.tweets?.length) throw new Error('rate');
      return d && d.ok && !(d.error && !d.tweets?.length) ? { tweets: d.tweets, complete: !!d.complete, error: d.error || '' } : null;
    };
    let r = await fast();
    if (!r && location.pathname.toLowerCase() === `/${mine}/with_replies`) {
      await waitFor(() => document.querySelector('[data-testid="primaryColumn"] article[data-testid="tweet"]'), 20000);
      for (let i = 0; i < 6 && !(await hookHas(op)); i++) await sleep(500);
      r = await fast();
      if (!r) r = await domExposure(mine, since, prog);
    }
    if (!r) return null;
    // 按天汇总：原创（不含转发）、回复、浏览、收到的点赞 / 评论 / 转发
    const days = [];
    for (let i = EXP_DAYS - 1; i >= 0; i--) days.push({ day: dayOf(Date.now() - i * 864e5), posts: 0, replies: 0, views: 0, postViews: 0, replyViews: 0, likes: 0, comments: 0, reposts: 0 });
    const byDay = new Map(days.map((d) => [d.day, d]));
    // 内容质量：原创的平均字数、短帖（少于 30 字）和互关互粉类帖子的数量
    const q = { posts: 0, chars: 0, short: 0, mutual: 0, replyChars: 0, replies: 0 };
    for (const t of r.tweets) {
      if (t.repost) continue; // 转发别人的帖子：浏览量属于原作者
      const d = byDay.get(dayOf(t.at));
      if (!d) continue;
      if (t.reply) { d.replies++; d.replyViews += t.views; q.replies++; q.replyChars += t.len || 0; }
      else { d.posts++; d.postViews += t.views; q.posts++; q.chars += t.len || 0; if ((t.len || 0) < 30) q.short++; if (t.mutual) q.mutual++; }
      d.views += t.views; d.likes += t.likes || 0; d.comments += t.replies || 0; d.reposts += (t.reposts || 0) + (t.quotes || 0);
    }
    const res = { at: Date.now(), days, quality: q, complete: r.complete, error: r.error || '', mixed: false, dom: !!r.dom };
    await store.set(`exp:${mine}`, res);
    return res;
  }
  const running = new Set(); // 正在进行的任务（关注和粉丝两份名单可以同时读）
  const emit = (kind, phase, text, result, extra) => {
    const st = { kind, phase, text, result: result || null, at: Date.now(), ...(extra || {}) };
    store.set('taskStatus', st);
    try { chrome.runtime.sendMessage({ type: 'task', ...st }); } catch {}
  };
  const waitFor = async (test, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (test()) return true; await sleep(300); } return false; };

  // ---------- 快速读取：让页面里的 hook.js 直接向 X 要数据（见 hook.js 开头的说明），不用滚动页面
  const OP = { nofb: 'Following', unfollow: 'Followers', verified: 'BlueVerifiedFollowers' };
  let reqSeq = 0;
  function hookAsk(type, extra, onProgress, timeoutMs, onWait) {
    const reqId = `${Date.now()}-${++reqSeq}`;
    return new Promise((resolve) => {
      const done = (v) => { window.removeEventListener('message', on); clearTimeout(timer); resolve(v); };
      const on = (e) => {
        if (e.source !== window || e.origin !== location.origin) return;
        const d = e.data || {};
        if (d.source !== 'xbv-hook5' || d.reqId !== reqId) return;
        if (d.type === 'progress') onProgress?.(d.n, d);
        else if (d.type === 'wait') onWait?.(d.s);
        else done(d);
      };
      const timer = setTimeout(() => done(null), timeoutMs);
      window.addEventListener('message', on);
      window.postMessage({ source: 'xbv-cs5', type, reqId, ...extra }, location.origin);
    });
  }
  /** hook 的状态：记下了哪些请求、当前账号 ID、能不能直接调 X 接口 */
  const hookInfo = async () => (await hookAsk('has', {}, null, 1500)) || { ops: [], me: '', headers: false };
  const hookHas = async (op) => (await hookInfo()).ops.includes(op);
  const RATE = ['rate_limited', 'rate_low'];
  /** 重放 X 的名单请求，每页 100 人，带头像等完整资料 */
  async function fastList(op, mine, onProgress) {
    if (!(await hookHas(op))) return null;
    const d = await hookAsk('fetchAll', { op, owner: mine, self: true }, onProgress, 15 * 60e3);
    // 被 X 限流：立即停，不跳页、不换别的方式继续请求（读到的部分照常保存）
    if (RATE.includes(d?.error)) { if (d.users?.length) return { list: d.users, complete: false, error: d.error, at: Date.now(), mode: 'list' }; throw new Error('rate'); }
    if (!d || !d.ok || (d.error && !d.users?.length)) return null;
    return { list: d.users, complete: !!d.complete, error: d.error || '', at: Date.now(), mode: 'list' };
  }
  const LIST_PAGE = { nofb: 'following', unfollow: 'followers', verified: 'verified_followers' };
  /**
   * 读名单（关注 / 粉丝 / 认证粉丝），只用 X 网页自己的数据：
   *  1. 已经记下 X 名单页的请求：直接重放，每页 100 人，带头像和资料；
   *  2. 还没记下：打开对应名单页（X 会自己发出这个请求），记下后再读（跳页后脚本重新加载，从 pendingTask 接着做）；
   *  3. 在名单页上也没等到请求：往下滚动，读页面上显示的内容。
   */
  async function readList(kind, mine, onProgress) {
    const op = OP[kind];
    // 先看 X 这 15 分钟的额度够不够：用完了、或者等恢复后就能一次读完时，先不读（不让 X 自己的页面因为没额度而报错）
    const info = await hookInfo();
    const q = info.quota?.[op];
    if (q && q.reset > Date.now()) {
      const avail = q.remaining - (info.reserve?.[op] || 10);
      const total = await expectedTotal(kind, mine);
      const need = total ? Math.ceil(total / 100) : 0;
      const mins = Math.max(1, Math.ceil((q.reset - Date.now()) / 60e3));
      if (avail <= 0 || (need && need > avail && need <= q.limit - (info.reserve?.[op] || 10))) throw new Error(`quota:${mins}:${Math.max(0, avail)}:${need}`);
    }
    let r = await fastList(op, mine, onProgress);
    if (r) return r;
    const page = `/${mine}/${LIST_PAGE[kind]}`;
    if (location.pathname.toLowerCase().replace(/\/$/, '') !== page) {
      await store.set('pendingTask', { kind, at: Date.now() });
      location.assign(page);
      return { navigating: true };
    }
    if (!(await waitFor(() => cells().length > 0, 20000))) throw new Error('empty');
    // X 首屏加载名单的请求有时晚一点才发出：等一下再试
    for (let i = 0; i < 6 && !(await hookHas(op)); i++) await sleep(500);
    r = await fastList(op, mine, onProgress);
    if (r) return r;
    window.scrollBy(0, window.innerHeight * 2);
    await sleep(2500);
    window.scrollTo(0, 0);
    r = await fastList(op, mine, onProgress);
    if (r) return r;
    return { ...(await scanList(onProgress)), mode: 'dom' };
  }
  /** 读粉丝名单：同 readList，结果整理成「全部 ID + 资料」用于对比取关 */
  async function readFollowers(mine, onProgress) {
    const r = await readList('unfollow', mine, onProgress);
    if (!r || r.navigating) return r;
    return { ...r, ids: r.list.map((p) => p.id || p.h.toLowerCase()), prof: new Map(r.list.filter((p) => p.id).map((p) => [p.id, p])) };
  }

  /** 总人数（显示进度百分比用）：重放 X 的用户资料请求拿到的关注数 / 粉丝数 → 主页上显示的数字 → 上一次读到的人数 */
  let countsCache = null; // { at, p }：同时读两份名单时只请求一次
  const myCounts = (mine) => {
    if (!countsCache || Date.now() - countsCache.at > 60e3 || countsCache.mine !== mine) countsCache = { at: Date.now(), mine, p: hookAsk('counts', { owner: mine }, null, 5000).then((d) => d?.counts || null) };
    return countsCache.p;
  };
  async function expectedTotal(kind, mine) {
    const c = await myCounts(mine);
    if (c) { const v = kind === 'nofb' ? c.fo : kind === 'unfollow' ? c.fr : 0; if (v) return v; }
    const live = route()?.h === mine ? liveCounts(mine) : null;
    if (live) { const v = kind === 'nofb' ? live.following : kind === 'unfollow' ? live.followers : null; if (v) return v; }
    const a = await getAcct(mine);
    return kind === 'nofb' ? a.following?.total || 0 : kind === 'unfollow' ? a.followers?.count || a.followers?.ids?.length || 0 : kind === 'verified' ? a.verified?.count || 0 : 0;
  }

  async function runTaskHere(kind) {
    if (running.has(kind)) return;
    running.add(kind);
    markRun(kind === 'nofb' ? ['nofb', 'unfollow'] : [kind]);
    const mine = me();
    const toast = showToast(L('蓝朋友正在读取这个页面…请停留在这个标签页', 'XBlueV is reading this page… please stay on this tab'));
    try {
      if (kind === 'exposure') {
        const t0 = Date.now();
        const res = await readExposure(mine, (n, pct) => {
          const t = n != null ? L(`已读取近 3 天 ${int(n)} 条帖子和回复${pct != null ? ` · ${pct}%` : '…'}`, `Read ${int(n)} posts and replies${pct != null ? ` · ${pct}%` : '…'}`) : L(`正在读取你的帖子和回复${pct != null ? ` · ${pct}%` : '…'}`, `Reading your posts and replies${pct != null ? ` · ${pct}%` : '…'}`);
          toast.set(t, pct); emit(kind, 'progress', t, null, { pct });
        });
        if (!res) throw new Error('need_nav');
        const v = res.days.reduce((s, d) => s + d.views, 0), p = res.days.reduce((s, d) => s + d.posts, 0), rp = res.days.reduce((s, d) => s + d.replies, 0);
        const text = L(`近 3 天曝光 ${int(v)}，原创 ${p} 条、回复 ${rp} 条（用时 ${Math.max(1, Math.round((Date.now() - t0) / 1000))} 秒）`, `Last 3 days: ${int(v)} views, ${p} posts, ${rp} replies (${Math.max(1, Math.round((Date.now() - t0) / 1000))}s)`);
        if (res.complete) emit(kind, 'done', text); else emit(kind, 'stopped', RATE.includes(res.error) ? L('X 暂时限制了读取速度，已保存读到的部分，请过几分钟再试', 'X is rate-limiting; partial results saved') : L('已停止，读到的部分已保存', 'Stopped; partial results saved'));
        toast.done(text);
        return;
      }
      if (kind === 'today') {
        if (!(await waitFor(() => document.querySelector('[data-testid="primaryColumn"] [data-testid="UserName"]')))) throw new Error('page');
        const res = await scanToday(mine, (t) => { toast.set(t); emit(kind, 'progress', t); });
        if (!res) { emit(kind, 'stopped', L('已停止', 'Stopped')); toast.done(L('已停止', 'Stopped')); return; }
        const text = L(`今天：原创 ${res.posts} 条、回复 ${res.replies} 条`, `Today: ${res.posts} posts, ${res.replies} replies`);
        emit(kind, 'done', text, res); toast.done(text);
        return;
      }
      // 名单：重放 X 名单页的请求（每页 100 人）→ 还没记下就先打开名单页 → 滚动页面
      const t0 = Date.now();
      const total = await expectedTotal(kind, mine);
      const onProgress = (n, msg) => {
        if (typeof msg !== 'string') msg = ''; // 快速读取的进度回调第二个参数是 hook 的消息对象，不是提示文字
        const pct = n != null && total ? (n >= total ? 100 : Math.min(99, Math.round(n / total * 100))) : null;
        const t = msg || (total ? L(`已读取 ${int(n)} / ${int(total)} 人 · ${pct}%`, `Read ${int(n)} / ${int(total)} · ${pct}%`) : L(`已读取 ${int(n)} 人…`, `Read ${int(n)}…`));
        toast.set(t + L('（请停留在这个标签页）', ' (stay on this tab)'), pct);
        emit(kind, 'progress', t, null, { n: n ?? null, total: total || null, pct });
        if (kind === 'nofb' && !msg) markFollowing();
      };
      onProgress(0);
      const r = kind === 'unfollow' ? await readFollowers(mine, onProgress) : await readList(kind, mine, onProgress);
      if (r?.navigating) { const t = L('第一次读取：正在打开你的名单页，让 X 加载名单…', 'First read: opening your list page so X loads it…'); emit(kind, 'progress', t); toast.set(t); return; }
      if (!r) throw new Error('need_nav');
      if (r.mode === 'dom') window.scrollTo(0, 0);
      const got = r.total ?? r.ids?.length ?? r.list.length;
      if (!r.complete) emit(kind, 'stopped', RATE.includes(r.error) ? L(`X 暂时限制了读取速度，已读到 ${int(got)} 人，请过几分钟再试`, `X is rate-limiting reads; got ${int(got)} so far. Try again in a few minutes`) : L('已停止，读到的部分已保存', 'Stopped; partial results saved'));
      let text = '';
      if (kind === 'nofb') {
        const f = await saveFollowing(mine, r); markFollowing();
        text = L(`关注 ${int(f.total)} 人，${int(f.nofb.length)} 人没回关你`, `Following ${int(f.total)}; ${int(f.nofb.length)} don’t follow back`);
      }
      else if (kind === 'unfollow') { const s = await saveFollowers(mine, r); text = s.diff ? L(`粉丝 ${int(s.total)} 人：${s.diff.lostTotal ?? s.diff.lost.length} 人取关，${s.diff.gainedTotal ?? s.diff.gained.length} 人新关注`, `${int(s.total)} followers: ${s.diff.lostTotal ?? s.diff.lost.length} unfollowed, ${s.diff.gainedTotal ?? s.diff.gained.length} new`) : (s.note || L(`粉丝 ${int(s.total)} 人`, `${int(s.total)} followers`)); }
      else { const v = await saveVerified(mine, r); text = L(`认证粉丝 ${int(v.count)} 名`, `${int(v.count)} verified followers`) + (v.count >= 500 ? L('，已达到 500', ' — 500 reached') : L(`，离 500 还差 ${int(500 - v.count)}`, `, ${int(500 - v.count)} to 500`)); }
      text += L(`（用时 ${Math.max(1, Math.round((Date.now() - t0) / 1000))} 秒）`, ` (${Math.max(1, Math.round((Date.now() - t0) / 1000))}s)`);
      if (r.complete) emit(kind, 'done', text);
      toast.done(text);
      // 「一键读取全部」的第二份名单：接着读（这是同一次操作，不受 1 分钟间隔限制）
      const after = await store.get('afterTask');
      if (after && Date.now() - after.at < 10 * 60e3 && after.next && after.next !== kind && r.complete) {
        await chrome.storage.local.remove('afterTask');
        running.delete(kind);
        runTaskHere(after.next);
      }
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg === 'rate' || msg.startsWith('save:') || msg.startsWith('quota:')) {
        const [, mins, avail, need] = msg.split(':');
        const t = msg === 'rate' ? L('X 限制了读取频率，为了账号安全已经停止读取，请 15 分钟后再试。', 'X is limiting reads. Stopped to keep your account safe — try again in 15 minutes.')
          : msg.startsWith('quota:') ? L(`X 这 15 分钟给的读取额度快用完了（还能用 ${avail} 次，读完这份名单要 ${need || '若干'} 次）。为了账号安全、也不影响 X 自己的页面，请 ${mins} 分钟后再读。`, `X’s read quota for this 15-minute window is nearly used up (${avail} left, this list needs ${need || 'more'}). To keep your account safe, try again in ${mins} min.`)
          : L(`读取完成，但保存到浏览器失败：${msg.slice(5)}。可以在「设置」里清除本机数据后再试。`, `Read finished but saving failed: ${msg.slice(5)}. Clear local data in Settings and try again.`);
        store.set('diag', { at: Date.now(), kind, error: msg }).catch(() => {});
        emit(kind, 'error', t); toast.done(t);
        return;
      }
      const t = e.message === 'empty' ? L('这个页面没有读到任何用户，可能还没加载出来或者 X 暂时限制了访问，请稍后再试', 'No users found on this page — it may not have loaded, or X is limiting access. Try again later')
        : L('页面没有加载出来，请稍后再试', 'The page didn’t load. Try again later');
      emit(kind, 'error', t); toast.done(t);
    } finally { running.delete(kind); }
  }

  // 同一份名单 1 分钟内不重复读：避免连续点击造成密集请求（防封号）
  const COOLDOWN = 60e3;
  const cooldown = async (kind) => { const t = ((await store.get('lastRun')) || {})[kind] || 0; const left = COOLDOWN - (Date.now() - t); return left > 0 ? Math.ceil(left / 1000) : 0; };
  const markRun = async (kinds) => { const m = (await store.get('lastRun')) || {}; for (const k of kinds) m[k] = Date.now(); await store.set('lastRun', m).catch(() => {}); };
  /** 开始任务：不在对应页面就先跳过去（跳页后脚本重新加载，再从 pendingTask 接着做） */
  async function startTask(kind) {
    const mine = me();
    if (!mine) return { ok: false, error: 'no_me' };
    // 一键读取全部（关注 + 粉丝）：两份名单的请求都记下了就同时读；否则先读一份，读完再接着读另一份（需要时会自动打开名单页）
    if (kind === 'both') {
      const wait = Math.max(await cooldown('nofb'), await cooldown('unfollow'));
      if (wait) return { ok: false, error: 'too_soon', wait };
      const info = await hookInfo();
      stopFlag = false;
      if (info.ops.includes(OP.nofb) && info.ops.includes(OP.unfollow)) { runTaskHere('nofb'); runTaskHere('unfollow'); return { ok: true, fast: true }; }
      const first = info.ops.includes(OP.nofb) ? 'unfollow' : 'nofb';
      await store.set('afterTask', { next: first === 'nofb' ? 'unfollow' : 'nofb', at: Date.now() });
      runTaskHere(first);
      return { ok: true };
    }
    if (!(kind in TASKS)) return { ok: false, error: 'bad_task' };
    if (running.has(kind)) return { ok: false, error: 'busy' };
    const wait = await cooldown(kind);
    if (wait) return { ok: false, error: 'too_soon', wait };
    const target = `/${mine}${TASKS[kind] ? '/' + TASKS[kind] : ''}`;
    stopFlag = false;
    // 名单：readList 会自己处理（已记下请求就直接读，没有就打开名单页）
    const info = await hookInfo();
    if (OP[kind]) { runTaskHere(kind); return { ok: true, fast: info.ops.includes(OP[kind]) }; }
    if (kind === 'exposure' && info.ops.includes('UserTweetsAndReplies')) { runTaskHere(kind); return { ok: true, fast: true }; }
    if (location.pathname.toLowerCase().replace(/\/$/, '') !== target.toLowerCase()) {
      await store.set('pendingTask', { kind, at: Date.now() });
      emit(kind, 'progress', L('正在打开页面…', 'Opening the page…'));
      location.assign(target);
      return { ok: true, navigating: true };
    }
    runTaskHere(kind);
    return { ok: true };
  }

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg?.type === 'whoami') { hookInfo().then((h) => reply({ me: me(), path: location.pathname, running: [...running], hook: { v: h.v || 0, ops: h.ops || [], ids: !!(h.me && h.headers) } })); return true; }
    if (msg?.type === 'run') { startTask(msg.kind).then(reply); return true; }
    if (msg?.type === 'stop') { stopFlag = true; window.postMessage({ source: 'xbv-cs5', type: 'stop' }, location.origin); reply({ ok: true }); return; }
  });

  // 页面刚加载：如果是侧边栏让我们跳过来做任务的，接着做
  store.get('pendingTask').then(async (p) => {
    if (!p || Date.now() - p.at > 60000) return;
    await chrome.storage.local.remove('pendingTask');
    await waitFor(() => !!me(), 15000);
    const target = `/${me()}${TASKS[p.kind] ? '/' + TASKS[p.kind] : ''}`;
    if (location.pathname.toLowerCase().replace(/\/$/, '') === target.toLowerCase()) runTaskHere(p.kind);
  });

  // ---------- 主循环：x.com 是单页应用，页面变化时重新判断
  async function tick() {
    const mine = me();
    if (mine) store.set('me', mine);
    const r = route();
    // 自己的关注 / 粉丝 / 认证粉丝页：工具条
    if (r?.list && mine && r.h === mine) {
      mountBar(r.list, mine);
      if (r.list === 'following') markFollowing();
    } else if (bar) { bar.remove(); bar = null; barKind = ''; }
    // 主页（帖子 / 回复等标签页）：数据面板
    if (r && !r.list) {
      const name = document.querySelector('[data-testid="primaryColumn"] [data-testid="UserName"]');
      const col = name?.parentElement;
      if (!col) return;
      if (panelFor === r.h && panel?.isConnected) return;
      mountPanel(col.lastElementChild || name, r);
    } else if (panel && (!r || r.list)) { panel.remove(); panel = null; panelFor = ''; }
  }

  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; tick(); }, 400);
  }).observe(document.documentElement, { childList: true, subtree: true });
  tick();
}
