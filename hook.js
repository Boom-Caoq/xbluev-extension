// 运行在 x.com 页面自己的环境里（manifest 里 world: MAIN）。只读取你在 X 上本来就能看到的数据，不会关注、取关或发任何内容。
// 和内容脚本（content-x.js）之间用 window.postMessage 通信。
//
// 原则：不调用 X 网页自己不用的接口。插件只做一件事——记下 X 页面自己发出的加载请求
// （关注 / 粉丝 / 认证粉丝名单、你的「回复」时间线），在你需要时用同样的请求一页页往下拉：
//  · 名单：每页 100 人，带头像、昵称、认证、粉丝数、是否关注了你；
//  · 时间线：拉到指定日期为止，读出每条帖子 / 回复的浏览量和互动数。
// 记下的请求和是谁的页面无关，只把里面的用户 ID 换成你自己的；X 发过一次就会记住（存在 x.com 的 localStorage）。
// 还没记下请求时，内容脚本会打开对应页面让 X 发出请求，或者直接读页面上显示的内容。
// 请求头（登录凭证）全部来自 X 页面自己的请求和 Cookie，插件不保存、不上传任何账号信息。
(() => {
  const V = 5;
  if ((window.__xbvHookV || 0) >= V) return;
  window.__xbvHookV = V;
  const CS = 'xbv-cs5', HK = 'xbv-hook5'; // 和内容脚本之间的消息名（带版本号，避免和旧版混在一起）
  const LIST_OPS = ['Following', 'Followers', 'BlueVerifiedFollowers'];
  const TL_OPS = ['UserTweetsAndReplies'];
  const OTHER_OPS = ['UserByScreenName'];
  const OPS = [...LIST_OPS, ...TL_OPS, ...OTHER_OPS];
  const TPL_KEY = 'xbvTpl5', ID_KEY = 'xbvIds5', CNT_KEY = 'xbvCnt5';
  const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { return {}; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  // 记下的请求：按请求类型存（Following / Followers / …），和是谁的页面无关
  let templates = load(TPL_KEY);
  // 旧版（v4）按「类型:页面主人」存的模板也能用
  try { const old = JSON.parse(localStorage.getItem('xbvTpl') || '{}') || {}; for (const [k, t] of Object.entries(old)) { const op = k.split(':')[0]; if (OPS.includes(op) && !templates[op]) templates[op] = t; } } catch {}
  // 用户名 → 用户 ID（从 X 返回的数据里顺手记下，用来把自己的名单请求换成自己的 ID）
  const idOf = load(ID_KEY);
  // 用户名 → 关注数 / 粉丝数（X 打开主页、名单页时自己加载的资料里有），用来显示读取进度的百分比
  const cntOf = load(CNT_KEY);
  const saveIds = () => { const keys = Object.keys(idOf); if (keys.length > 3000) for (const k of keys.slice(0, keys.length - 3000)) delete idOf[k]; save(ID_KEY, idOf); };

  const opOf = (url) => { const m = /\/i\/api\/graphql\/[^/]+\/([A-Za-z]+)\?/.exec(String(url || '')); return m && OPS.includes(m[1]) ? m[1] : ''; };
  const plainHeaders = (h) => {
    const o = {};
    if (!h) return o;
    if (h instanceof Headers) h.forEach((v, k) => { o[k] = v; });
    else if (Array.isArray(h)) for (const [k, v] of h) o[k] = v;
    else Object.assign(o, h);
    return o;
  };
  const remember = (op, url, headers) => {
    templates[op] = { url: new URL(url, location.origin).href, headers, at: Date.now() };
    save(TPL_KEY, templates);
  };
  const cookie = (name) => { const m = new RegExp('(?:^|; )' + name + '=([^;]*)').exec(document.cookie); return m ? decodeURIComponent(m[1]) : ''; };
  /** 当前登录账号的用户 ID：X 的 twid Cookie（u=123…） */
  const myId = () => { const m = /u=(\d+)/.exec(cookie('twid')); return m ? m[1] : ''; };
  const handleOf = (u) => u?.core?.screen_name || u?.legacy?.screen_name || '';
  /** X 新旧两种用户数据结构统一成一种 */
  const userOf = (o) => {
    const h = handleOf(o);
    if (!h || !o.rest_id) return null;
    const rel = o.relationship_perspectives || {};
    return {
      id: String(o.rest_id), h, name: o.core?.name || o.legacy?.name || h,
      v: !!(o.is_blue_verified || o.verification?.verified),
      fb: !!(rel.followed_by ?? o.legacy?.followed_by),   // TA 关注了你
      iFollow: !!(rel.following ?? o.legacy?.following),  // 你关注着 TA
      followers: Number(o.legacy?.followers_count ?? o.relationship_counts?.followers ?? 0) || 0,
      avatar: String(o.avatar?.image_url || o.legacy?.profile_image_url_https || ''),
    };
  };
  // ---- 解析一页名单：所有用户和「下一页」标记
  function parseUsers(json) {
    const users = [];
    let next = '';
    const walk = (o) => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) { for (const x of o) walk(x); return; }
      if (o.__typename === 'User' && o.rest_id) { const u = userOf(o); if (u) users.push(u); return; }
      if (o.cursorType === 'Bottom' && typeof o.value === 'string') next = o.value;
      for (const k in o) walk(o[k]);
    };
    walk(json);
    return { users, next };
  }
  // 帖子正文的「有效字数」（去掉链接和 @），以及是不是互关 / 互粉 / 求回关这类帖子：用来给内容质量打分
  const MUTUAL = /互关|互粉|回关|互fo|有关必回|必回关|求关注|关注我|涨粉|fo\s*back|follow\s*back|#?f4f|#?ifb|#?互关/i;
  const textOf = (t) => String(t.note_tweet?.note_tweet_results?.result?.text || t.legacy?.full_text || '');
  const lenOf = (s) => [...s.replace(/https?:\/\/\S+/g, '').replace(/@\w+/g, '').replace(/\s+/g, '')].length;
  // ---- 解析一页时间线：每条帖子的作者、时间、是不是回复 / 转发、浏览量和互动数；置顶帖单独标记
  function parseTweets(json) {
    const tweets = [];
    let next = '';
    const walk = (o, pinned) => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) { for (const x of o) walk(x, pinned); return; }
      if (o.type === 'TimelinePinEntry') pinned = true;
      const t = o.__typename === 'TweetWithVisibilityResults' ? o.tweet : o.__typename === 'Tweet' ? o : null;
      if (t?.legacy && t.rest_id) {
        const L0 = t.legacy;
        tweets.push({
          id: String(t.rest_id), author: handleOf(t.core?.user_results?.result).toLowerCase(), at: Date.parse(L0.created_at) || 0,
          reply: !!L0.in_reply_to_status_id_str, repost: !!L0.retweeted_status_result,
          views: Number(t.views?.count || 0) || 0, likes: Number(L0.favorite_count || 0), replies: Number(L0.reply_count || 0),
          reposts: Number(L0.retweet_count || 0), quotes: Number(L0.quote_count || 0), bookmarks: Number(L0.bookmark_count || 0),
          pinned: !!pinned, len: lenOf(textOf(t)), mutual: MUTUAL.test(textOf(t)),
        });
        return;
      }
      if (o.cursorType === 'Bottom' && typeof o.value === 'string') next = o.value;
      for (const k in o) walk(o[k], pinned);
    };
    walk(json, false);
    return { tweets, next };
  }
  /** 从 X 返回的数据里记下「用户名 → ID」 */
  const learnIds = (json) => {
    let n = 0;
    const walk = (o, d) => {
      if (!o || typeof o !== 'object' || d > 12) return;
      if (Array.isArray(o)) { for (const x of o) walk(x, d + 1); return; }
      if (o.__typename === 'User' && o.rest_id) {
        const h = handleOf(o).toLowerCase();
        if (h && idOf[h] !== o.rest_id) { idOf[h] = String(o.rest_id); n++; }
        const fo = o.legacy?.friends_count ?? o.relationship_counts?.following, fr = o.legacy?.followers_count ?? o.relationship_counts?.followers;
        if (h && fo != null) { cntOf[h] = { fo: Number(fo) || 0, fr: Number(fr) || 0, at: Date.now() }; save(CNT_KEY, cntOf); }
        return;
      }
      for (const k in o) walk(o[k], d + 1);
    };
    walk(json, 0);
    if (n) saveIds();
  };

  // ---- 记录模板：包装 fetch 和 XMLHttpRequest；用户资料请求的返回顺便记下 ID
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    let op = '';
    try {
      const url = typeof input === 'string' ? input : input?.url;
      op = opOf(url);
      if (op) remember(op, url, { ...plainHeaders(input?.headers), ...plainHeaders(init?.headers) });
    } catch {}
    const p = origFetch.apply(this, arguments);
    if (op) p.then((r) => { const left = r.headers.get('x-rate-limit-remaining'); if (left != null) { quota[op] = { limit: Number(r.headers.get('x-rate-limit-limit')) || 0, remaining: Number(left), reset: Number(r.headers.get('x-rate-limit-reset')) * 1000 || 0, at: Date.now() }; save(QUOTA_KEY, quota); } }).catch(() => {});
    if (op === 'UserByScreenName') p.then((r) => r.clone().json()).then(learnIds).catch(() => {});
    return p;
  };
  const XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.setRequestHeader, XSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, url) { this.__xbvUrl = url; this.__xbvH = {}; return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { try { if (this.__xbvH) this.__xbvH[k] = v; } catch {} return XS.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    try {
      const op = opOf(this.__xbvUrl);
      if (op) {
        remember(op, this.__xbvUrl, { ...this.__xbvH });
        if (op === 'UserByScreenName') this.addEventListener('load', () => { try { learnIds(JSON.parse(this.responseText)); } catch {} });
      }
    } catch {}
    return XSend.apply(this, arguments);
  };

  const post = (msg) => window.postMessage({ source: HK, ...msg }, location.origin);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let stop = false;

  /**
   * 请求一次。防封号的原则：绝不在被限流后继续请求。
   *  · X 返回 429（请求太频繁）：立即停止，不重试，保存已读到的部分，提示稍后再试；
   *  · X 在每次返回里告诉我们这 15 分钟还剩几次请求（x-rate-limit-remaining）：剩下不多时主动停下，不等到被拒绝。
   */
  // X 每 15 分钟给每种请求固定的额度，X 自己的页面和插件共用。记下 X 每次返回的剩余次数和恢复时间：
  //  · 读取中剩余次数不到总额度的 20%（至少 10 次）就停，给 X 自己的页面留足请求，避免页面出现「Something went wrong」；
  //  · 开始读取前，内容脚本会先看额度够不够读完，不够就不开始。
  const QUOTA_KEY = 'xbvQuota5';
  const quota = load(QUOTA_KEY); // op → { limit, remaining, reset（毫秒） }
  const reserveOf = (limit) => Math.max(10, Math.ceil((limit || 50) * 0.2));
  let low = false;   // 本轮读取中额度已经不多了
  async function get(url, headers) {
    if (stop) return { error: 'stopped' };
    if (low) return { error: 'rate_low' };
    const op = opOf(url);
    let res;
    try { res = await origFetch(url, { headers, credentials: 'include' }); } catch { return { error: 'network' }; }
    const limit = Number(res.headers.get('x-rate-limit-limit')) || 0;
    const left = res.headers.get('x-rate-limit-remaining');
    const reset = Number(res.headers.get('x-rate-limit-reset')) * 1000 || 0;
    if (op && (left != null || res.status === 429)) { quota[op] = { limit, remaining: res.status === 429 ? 0 : Number(left), reset, at: Date.now() }; save(QUOTA_KEY, quota); }
    if (res.status === 429) { low = true; return { error: 'rate_limited' }; }
    if (left != null && Number(left) <= reserveOf(limit)) low = true;
    return { res };
  }

  /** 用记下的请求一页页往下拉；userId 换成要读的账号；onPage 处理一页，返回下一页标记（空则停） */
  async function paginate(op, userId, pageSize, onPage, onWait) {
    const t = templates[op];
    if (!t) return { error: 'no_template' };
    const base = new URL(t.url);
    let vars;
    try { vars = JSON.parse(base.searchParams.get('variables') || '{}'); } catch { vars = {}; }
    if (userId) vars.userId = userId;
    if (!vars.userId) return { error: 'no_user' };
    const headers = { ...t.headers };
    const ct0 = cookie('ct0');
    for (const k of Object.keys(headers)) if (k.toLowerCase() === 'x-csrf-token' && ct0) headers[k] = ct0;
    let cursor = '', pages = 0, count = pageSize, error = '';
    while (!stop && pages < 600) {
      const v = { ...vars, count };
      if (cursor) v.cursor = cursor; else delete v.cursor;
      base.searchParams.set('variables', JSON.stringify(v));
      const { res, error: e } = await get(base.href, headers, onWait);
      if (e) { error = e; break; }
      if ((res.status === 401 || res.status === 403 || res.status === 404) && pages === 0) { delete templates[op]; save(TPL_KEY, templates); error = 'expired'; break; } // 记下的请求过期了：删掉，下次重新记
      if (!res.ok) {
        if (count !== 20 && pages === 0) { count = 20; continue; } // 每页条数太大不被接受：退回 X 默认的 20
        error = 'http_' + res.status; break;
      }
      const json = await res.json().catch(() => null);
      if (!json) { error = 'bad_json'; break; }
      pages++;
      const next = onPage(json);
      if (!next || next === cursor) break;
      cursor = next;
    }
    return { error, pages, owner: String(vars.userId || '') };
  }

  // ---- 对外的几个读取命令
  const resolveUser = (owner) => idOf[String(owner || '').toLowerCase()] || '';
  /** 名单：拉完整个名单，带完整资料 */
  async function fetchAll(op, owner, self, reqId) {
    stop = false; low = false;
    const userId = self ? myId() || resolveUser(owner) : resolveUser(owner);
    const map = new Map();
    let empty = 0;
    const r = await paginate(op, userId, 100, (json) => {
      const { users, next } = parseUsers(json);
      const before = map.size;
      for (const u of users) map.set(u.id, u);
      post({ type: 'progress', reqId, n: map.size });
      if (map.size === before && ++empty >= 2) return '';
      return next;
    }, (s) => post({ type: 'wait', reqId, s }));
    if (r.error === 'no_template' || r.error === 'no_user') return post({ type: 'result', reqId, ok: false, error: r.error });
    post({ type: 'result', reqId, ok: true, mode: 'list', owner: r.owner, users: [...map.values()], complete: !stop && !r.error, error: r.error, pages: r.pages });
  }
  /** 时间线：拉到 since（毫秒时间戳）为止，只保留页面主人自己发的 */
  async function fetchTimeline(op, owner, self, since, reqId) {
    stop = false; low = false;
    const userId = self ? myId() || resolveUser(owner) : resolveUser(owner);
    const me = String(owner).toLowerCase();
    const map = new Map();
    let oldest = Date.now(); // 已经读到的最早一条：用来算进度（从现在往前读到 since 为 100%）
    const r = await paginate(op, userId, 40, (json) => {
      const { tweets, next } = parseTweets(json);
      let older = false;
      for (const t of tweets) {
        if (t.author !== me) continue; // 对话里别人的帖子不算
        if (t.at >= since) map.set(t.id, t);
        else if (!t.pinned) older = true;
        if (!t.pinned && t.at && t.at < oldest) oldest = t.at;
      }
      post({ type: 'progress', reqId, n: map.size, oldest: older ? since : oldest });
      return older ? '' : next;
    }, (s) => post({ type: 'wait', reqId, s }));
    if (r.error === 'no_template' || r.error === 'no_user') return post({ type: 'result', reqId, ok: false, error: r.error });
    post({ type: 'result', reqId, ok: true, tweets: [...map.values()], complete: !stop && !r.error, error: r.error, pages: r.pages });
  }

  /**
   * 准确的关注数 / 粉丝数（显示进度百分比用）：重放 X 打开主页时自己发的 UserByScreenName 请求，只把用户名换成你的。
   * 只发 1 次请求；还没记下这个请求时，用 X 之前自己加载过的资料。
   */
  async function fetchCounts(owner, reqId) {
    const h = String(owner || '').toLowerCase();
    const t = templates.UserByScreenName;
    if (t) {
      try {
        const base = new URL(t.url);
        const vars = JSON.parse(base.searchParams.get('variables') || '{}');
        vars.screen_name = h;
        base.searchParams.set('variables', JSON.stringify(vars));
        const headers = { ...t.headers };
        const ct0 = cookie('ct0');
        for (const k of Object.keys(headers)) if (k.toLowerCase() === 'x-csrf-token' && ct0) headers[k] = ct0;
        const res = await origFetch(base.href, { headers, credentials: 'include' });
        if (res.ok) learnIds(await res.json());
      } catch {}
    }
    post({ type: 'counts', reqId, counts: cntOf[h] || null });
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const d = e.data || {};
    if (d.source !== CS) return;
    if (d.type === 'has') post({ type: 'has', reqId: d.reqId, ops: Object.keys(templates), me: myId(), v: V, quota, reserve: Object.fromEntries(Object.entries(quota).map(([k, q]) => [k, reserveOf(q.limit)])) });
    if (d.type === 'counts') fetchCounts(d.owner, d.reqId);
    if (d.type === 'fetchAll' && LIST_OPS.includes(d.op)) fetchAll(d.op, String(d.owner || ''), !!d.self, d.reqId);
    if (d.type === 'fetchTimeline' && TL_OPS.includes(d.op)) fetchTimeline(d.op, String(d.owner || ''), !!d.self, Number(d.since) || 0, d.reqId);
    if (d.type === 'stop') stop = true;
  });
})();
