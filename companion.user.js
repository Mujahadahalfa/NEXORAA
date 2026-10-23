// ==UserScript==
// @name         Nexora Companion
// @namespace    https://github.com/nexora
// @version      1.0.0
// @description  Tombol unduh video mengambang (pilih resolusi) dan anti iklan
// @match        *://*/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @connect      *
// ==/UserScript==
(()=>{'use strict';
const C={"ads":true,"fab":true};
const AD=/(doubleclick|googlesyndication|googleadservices|adservice\.google|adsystem|taboola|outbrain|popads|popcash|propellerads|exoclick|adnxs|adsterra|mgid|revcontent|criteo|pubmatic|rubiconproject|openx|moatads|scorecardresearch|onclickads|juicyads|trafficjunky|clickadu|hilltopads)\./i;
const MED=/\.(m3u8|mp4|webm)(\?|#|$)/i,found=new Map();
const note=u=>{try{u=new URL(u,location.href).href}catch{return}if(/^(blob|data):/.test(u)||AD.test(u)||!MED.test(u))return;if(!found.has(u))found.set(u,Date.now())};

/* ---- Anti iklan + penangkap link video ---- */
const of=window.fetch;window.fetch=function(u){const s=String(u&&u.url||u);if(C.ads&&AD.test(s))return Promise.resolve(new Response('',{status:204}));note(s);return of.apply(this,arguments)};
const xo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){if(C.ads&&AD.test(String(u)))arguments[1]='data:,';else note(String(u));return xo.apply(this,arguments)};
try{new PerformanceObserver(l=>l.getEntries().forEach(e=>note(e.name))).observe({type:'resource',buffered:true})}catch{}
if(C.ads){
  const st=document.createElement('style');st.textContent='ins.adsbygoogle,.adsbygoogle,[id^="google_ads"],[id^="div-gpt-ad"],[class*="advertisement"],[class*="ad-banner"],[class*="ad-slot"],[aria-label="Advertisement"],[aria-label="Iklan"],iframe[src*="doubleclick"],iframe[src*="googlesyndication"],iframe[src*="adservice"],a[href*="doubleclick.net"],a[href*="popads"],a[href*="exoclick"]{display:none!important}';
  document.documentElement.append(st);
  const wo=window.open;window.open=function(u){return AD.test(String(u||''))?null:wo.apply(this,arguments)};
  new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1&&/^(SCRIPT|IFRAME|IMG|LINK)$/.test(n.tagName)&&AD.test(n.src||n.href||''))n.remove()}).observe(document,{childList:true,subtree:true});
}

/* ---- Unduh ---- */
const gx=(url,type,onp)=>new Promise((res,rej)=>GM_xmlhttpRequest({url,responseType:type||'text',headers:{Referer:location.href},onprogress:onp,onload:r=>r.status<400?res(r.response):rej(Error('HTTP '+r.status)),onerror:()=>rej(Error('jaringan')),ontimeout:()=>rej(Error('timeout'))}));
const save=(b,n)=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=n;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},4e4)};
async function variants(u){try{const t=await gx(u),L=t.split(/\r?\n/);if(!/#EXT-X-STREAM-INF/.test(t))return[{u,h:0,l:'Stream HLS'}];
  const aud={};L.forEach(l=>{if(/^#EXT-X-MEDIA:.*TYPE=AUDIO/.test(l)){const g=(l.match(/GROUP-ID="([^"]+)"/)||[])[1],r=(l.match(/URI="([^"]+)"/)||[])[1];if(g&&r&&!aud[g])aud[g]=new URL(r,u).href}});
  const v=[];L.forEach((l,i)=>{const m=l.match(/^#EXT-X-STREAM-INF:(.*)/);if(!m)return;const h=+((m[1].match(/RESOLUTION=\d+x(\d+)/)||[])[1]||0),bw=+((m[1].match(/BANDWIDTH=(\d+)/)||[])[1]||0),g=(m[1].match(/AUDIO="([^"]+)"/)||[])[1];v.push({u:new URL(L[i+1],u).href,h,bw,a:aud[g],l:h?h+'p':'Stream'})});
  return v.sort((a,b)=>b.h-a.h||b.bw-a.bw)}catch{return[]}}
async function hls(u,base,set){const t=await gx(u);if(/#EXT-X-KEY:METHOD=(?!NONE)/.test(t))throw Error('stream terenkripsi/DRM tidak didukung');
  const segs=t.split(/\r?\n/).filter(l=>l&&l[0]!=='#').map(l=>new URL(l,u).href),mp=(t.match(/#EXT-X-MAP:URI="([^"]+)"/)||[])[1];if(mp)segs.unshift(new URL(mp,u).href);
  const ch=[];for(let i=0;i<segs.length;i++){ch.push(await gx(segs[i],'arraybuffer'));set('Mengunduh '+(i+1)+'/'+segs.length,(i+1)/segs.length)}
  save(new Blob(ch,{type:mp?'video/mp4':'video/mp2t'}),base+(mp?'.mp4':'.ts'))}
async function dlItem(it,set){const base=(document.title||'video').replace(/[\\/:*?"<>|]+/g,' ').trim().slice(0,60)+(it.h?'-'+it.h+'p':'');
  if(!/\.m3u8/i.test(it.u)){const b=await gx(it.u,'blob',e=>e.total&&set('Mengunduh…',e.loaded/e.total));save(b,base+(/\.webm/i.test(it.u)?'.webm':'.mp4'));return}
  await hls(it.u,base,set);if(it.a){set('Mengunduh audio…',0);await hls(it.a,base+'-audio',set)}}

/* ---- Tombol mengambang: hanya saat video diputar ---- */
let host,pn,cur,ht;
const ICON='<svg viewBox="0 0 24 24" width="26" height="26" fill="#fff"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2z"/></svg>';
function ui(){if(host)return;host=document.createElement('div');host.style.cssText='position:fixed;right:12px;top:38%;z-index:2147483647;touch-action:none';
  const sh=host.attachShadow({mode:'open'});
  sh.innerHTML='<style>button{all:unset;cursor:pointer}#b{width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,#a177ff,#6d3fe0);display:grid;place-items:center;box-shadow:0 8px 22px #6d3fe0aa;border:1px solid #fff3}#p{position:fixed;left:0;right:0;bottom:0;background:#16161c;color:#f2f2f7;font:15px system-ui,sans-serif;border-radius:26px 26px 0 0;padding:16px 18px 24px;max-height:70vh;overflow:auto;box-shadow:0 -10px 40px #000b}h3{margin:0 0 10px;font-size:17px}.i{display:flex;justify-content:space-between;width:100%;box-sizing:border-box;padding:14px 16px;margin:6px 0;border-radius:16px;background:#22222c}.i b{font-weight:600}.i small{color:#9b9bae}.n{color:#9b9bae;font-size:13px;margin:8px 0}.t{height:6px;border-radius:3px;background:#22222c;overflow:hidden}.t i{display:block;height:100%;width:0;background:#8b5cf6}.x{padding:10px 18px;border-radius:20px;background:#22222c;margin-top:8px;display:inline-block}</style><button id="b" aria-label="Unduh video">'+ICON+'</button><div id="p" hidden></div>';
  pn=sh.getElementById('p');const b=sh.getElementById('b');let d=null;
  b.addEventListener('pointerdown',e=>{d={x:e.clientX,y:e.clientY,l:host.offsetLeft,t:host.offsetTop,m:false};b.setPointerCapture(e.pointerId)});
  b.addEventListener('pointermove',e=>{if(!d)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.abs(dx)+Math.abs(dy)>8)d.m=true;if(d.m){host.style.left=d.l+dx+'px';host.style.top=d.t+dy+'px';host.style.right='auto'}});
  b.addEventListener('pointerup',()=>{if(d&&!d.m)panel();d=null});
  (document.body||document.documentElement).append(host)}
async function panel(){pn.hidden=false;pn.innerHTML='<h3>Unduh video</h3><div class="n">Mencari resolusi…</div>';
  const urls=new Set([...found.keys()].reverse().slice(0,8));
  if(cur)[cur.currentSrc,cur.src,...[...cur.querySelectorAll('source')].map(s=>s.src)].forEach(u=>u&&!/^blob:/.test(u)&&urls.add(u));
  const items=[];for(const u of urls)items.push(...(/\.m3u8/i.test(u)?await variants(u):[{u,h:0,l:'Video '+(/\.webm/i.test(u)?'WebM':'MP4')}]));
  const list=items.slice(0,10);
  pn.innerHTML='<h3>Unduh video</h3>'+(list.length?list.map((it,i)=>'<button class="i" data-i="'+i+'"><b>'+it.l+'</b><small>'+(it.bw?(it.bw/1e6).toFixed(1)+' Mbps':'')+(it.a?' · audio terpisah':'')+'</small></button>').join(''):'<div class="n">Link video belum terdeteksi. Putar video beberapa detik lalu coba lagi. Video DRM atau terproteksi tidak bisa diunduh.</div>')+'<div class="t"><i id="bar"></i></div><div class="n" id="st"></div><button class="x" id="cl">Tutup</button>';
  pn.querySelector('#cl').onclick=()=>pn.hidden=true;
  const set=(t,p)=>{pn.querySelector('#st').textContent=t;pn.querySelector('#bar').style.width=p*100+'%'};
  pn.querySelectorAll('.i').forEach(el=>el.onclick=async()=>{try{await dlItem(list[+el.dataset.i],set);set('Selesai',1)}catch(e){set('Gagal: '+e.message,0)}})}
document.addEventListener('play',e=>{const v=e.target;if(!C.fab||v.tagName!=='VIDEO'||v.clientWidth<160)return;cur=v;ui();host.style.display='block';clearTimeout(ht)},true);
['pause','ended','emptied'].forEach(ev=>document.addEventListener(ev,e=>{if(e.target!==cur)return;clearTimeout(ht);ht=setTimeout(()=>{if(host&&cur.paused&&pn.hidden)host.style.display='none'},6000)},true));
})();
