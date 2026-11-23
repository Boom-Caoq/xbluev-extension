// 只在蓝朋友网站的 /{lang}/extension 页运行：告诉页面插件已安装，并接收页面生成的插件令牌。
// 只接受同一个窗口、同源、带 source:'xbluev-site' 标记的消息。
(() => {
  const say = (type) => window.postMessage({ source: 'xbluev-ext', type }, location.origin);
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const d = e.data || {};
    if (d.source !== 'xbluev-site') return;
    if (d.type === 'ping') say('ready');
    if (d.type === 'connect' && /^[a-f0-9]{64}$/i.test(d.token || '')) {
      // 插件界面语言跟随连接时所用的网站语言（/en/ 页连接就用英文）
      const lang = /^\/en(\/|$)/.test(location.pathname) ? 'en' : 'zh';
      chrome.runtime.sendMessage({ type: 'connect', token: d.token, name: String(d.name || '').slice(0, 80), lang }, (r) => {
        if (r?.ok) say('connected');
      });
    }
    if (d.type === 'disconnect') chrome.runtime.sendMessage({ type: 'disconnect' });
  });
  // 页面脚本可能比内容脚本先发 ping：加载完成后主动打个招呼
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => say('ready'));
  else say('ready');
})();
