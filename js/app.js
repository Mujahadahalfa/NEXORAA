'use strict';
const $=(s,e=document)=>e.querySelector(s),$$=(s,e=document)=>[...e.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>n>1e9?(n/1e9).toFixed(2)+' GB':n>1e6?(n/1e6).toFixed(1)+' MB':Math.round(n/1e3)+' KB';
const LS={get:(k,d)=>{try{return JSON.parse(localStorage.getItem('nx_'+k))??d}catch{return d}},set:(k,v)=>localStorage.setItem('nx_'+k,JSON.stringify(v))};
const ENG={google:['Google','https://www.google.com/search?q='],bing:['Bing','https://www.bing.com/search?q='],ddg:['DuckDuckGo','https://duckduckgo.com/?q=']};
const BANG={yt:['https://www.youtube.com/results?search_query=','YouTube'],gh:['https://github.com/search?q=','GitHub'],w:['https://id.wikipedia.org/w/index.php?search=','Wikipedia'],maps:['https://www.google.com/maps/search/','Maps'],g:[ENG.google[1],'Google'],b:[ENG.bing[1],'Bing']};
const TT={home:'Nexora',search:'Pencarian',downloads:'Unduhan',vault:'Private Vault',settings:'Setelan',player:'Pemutar'};
let S={engine:'ddg',theme:'dark',hist:true,lock:2,ads:true,fab:true,...LS.get('settings',{})};
let H=LS.get('history',[]),BM=LS.get('bm',[{t:'Wikipedia',u:'https://wikipedia.org'},{t:'GitHub',u:'https://github.com'},{t:'YouTube',u:'https://youtube.com'}]);
let DL=[],VI=[],key=null,timer,tmpUrl,cur='home',last,pb='',pm=null,pnew='',dip,pendMv;
const save=()=>{LS.set('settings',S);LS.set('history',H);LS.set('bm',BM)};
const applyTheme=()=>document.documentElement.dataset.theme=S.theme;
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2600)}

/* ---------- IndexedDB ---------- */
const idb=new Promise((res,rej)=>{const r=indexedDB.open('nexora',1);r.onupgradeneeded=()=>['dl','vault','vmeta'].forEach(s=>r.result.createObjectStore(s,{keyPath:'id'}));r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
const tx=async(st,mode,fn)=>{const d=await idb;return new Promise((res,rej)=>{const t=d.transaction(st,mode),q=fn(t.objectStore(st));t.oncomplete=()=>res(q&&q.result);t.onerror=()=>rej(t.error)})};
const dbAll=s=>tx(s,'readonly',o=>o.getAll()),dbPut=(s,v)=>tx(s,'readwrite',o=>o.put(v)),dbDel=(s,k)=>tx(s,'readwrite',o=>o.delete(k));

/* ---------- Crypto (PBKDF2 -> AES-GCM) ---------- */
const enc=new TextEncoder(),dec=new TextDecoder();
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))),unb=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function derive(pin,salt){const k=await crypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},k,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
async function encB(buf,k=key){const iv=crypto.getRandomValues(new Uint8Array(12));return{iv,d:await crypto.subtle.encrypt({name:'AES-GCM',iv},k,buf)}}
const decB=(o,k=key)=>crypto.subtle.decrypt({name:'AES-GCM',iv:o.iv},k,o.d);
async function setPin(pin){const salt=crypto.getRandomValues(new Uint8Array(16));key=await derive(pin,salt);const c=await encB(enc.encode('nexora'));LS.set('vault',{salt:b64(salt),iv:b64(c.iv),d:b64(c.d)});VI=[]}
async function chk(pin){const m=LS.get('vault');try{const k=await derive(pin,unb(m.salt));const t=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb(m.iv)},k,unb(m.d));return dec.decode(t)==='nexora'?k:null}catch{return null}}
async function changePin(p){const salt=crypto.getRandomValues(new Uint8Array(16)),nk=await derive(p,salt);
  for(const m of await dbAll('vmeta')){const r=await tx('vault','readonly',o=>o.get(m.id));await dbPut('vault',{id:m.id,...await encB(await decB(r),nk)});await dbPut('vmeta',{...m,n:await encB(await decB(m.n),nk)})}
  const c=await encB(enc.encode('nexora'),nk);LS.set('vault',{salt:b64(salt),iv:b64(c.iv),d:b64(c.d)});key=nk}
async function moveV(d){toast('Mengenkripsi…');try{await vImport(d.blob,d.name);await dbDel('dl',d.id);DL=DL.filter(x=>x!==d);toast('Dipindahkan ke Vault')}catch{toast('Gagal memindahkan, penyimpanan mungkin penuh')}render()}
async function afterUnlock(){if(!pendMv)return;const d=dl(pendMv);pendMv=null;if(d)await moveV(d)}
async function submitPin(){if(pb.length<4)return toast('PIN minimal 4 digit');const p=pb;pb='';
  if(pm==='unlock'){const k=await chk(p);if(k){key=k;await loadVault();pm=null;arm();await afterUnlock()}else{toast('PIN salah');navigator.vibrate?.(80)}}
  else if(pm==='old'){if(await chk(p))pm='new';else toast('PIN lama salah')}
  else if(pm==='setup'||pm==='new'){pnew=p;pm=pm==='setup'?'cs':'cn'}
  else if(p!==pnew){toast('PIN tidak sama');pm=pm==='cs'?'setup':'new'}
  else{toast('Memproses…');if(pm==='cs')await setPin(p);else await changePin(p);pm=null;arm();toast('PIN tersimpan');await afterUnlock()}
  render()}
async function loadVault(){VI=[];for(const m of await dbAll('vmeta'))VI.push({id:m.id,size:m.size,...JSON.parse(dec.decode(await decB(m.n)))})}
async function vImport(blob,name){const type=blob.type||'video/mp4',f=await encB(await blob.arrayBuffer()),n=await encB(enc.encode(JSON.stringify({name,type}))),id=Date.now()+Math.random().toString(36).slice(2,6);
  await dbPut('vault',{id,...f});await dbPut('vmeta',{id,size:blob.size,n});VI.push({id,name,size:blob.size,type})}
function lock(){if(!$('#ov').hidden){arm();return}key=null;VI=[];render()}
function arm(){clearTimeout(timer);if(key&&S.lock>0)timer=setTimeout(lock,S.lock*60000)}
['click','touchstart','keydown'].forEach(e=>addEventListener(e,arm,{passive:true}));
function closep(){$('#ov').hidden=true;$('#ov').innerHTML='';if(tmpUrl)URL.revokeObjectURL(tmpUrl);tmpUrl=null}

/* ---------- Search ---------- */
function go(q){q=q.trim();if(!q)return;if(!navigator.onLine)return toast('Tidak ada koneksi internet');
  if(S.hist){H=[q,...H.filter(x=>x!==q)].slice(0,50);save()}
  const m=q.match(/^!(\w+)\s+(.+)/),b=m&&BANG[m[1].toLowerCase()];
  const u=b?b[0]+encodeURIComponent(m[2]):/^(https?:\/\/)?[^\s]+\.[a-z]{2,}(\/\S*)?$/i.test(q)?(/^https?:/i.test(q)?q:'https://'+q):ENG[S.engine][1]+encodeURIComponent(q);
  open(u,'_blank','noopener')}
const sbox=()=>`<form class="sb" data-form="search"><input id="q" type="search" placeholder="Cari di ${ENG[S.engine][0]} atau ketik alamat" autocomplete="off" enterkeyhint="search"><button>Cari</button></form>`;
const hlist=n=>H.length?H.slice(0,n).map((q,i)=>`<div class="row"><span data-act="again" data-q="${esc(q)}">${esc(q)}</span><button class="x" data-act="delh" data-i="${i}">✕</button></div>`).join(''):'<p class="empty">Belum ada riwayat pencarian</p>';

/* ---------- Downloads ---------- */
async function hlsGet(url,it,prog){const r0=await fetch(url);if(!r0.ok)throw Error('HTTP '+r0.status);const t=await r0.text();
  if(/#EXT-X-STREAM-INF/.test(t))throw Error('pilih salah satu resolusi dulu');if(/#EXT-X-KEY:METHOD=(?!NONE)/.test(t))throw Error('stream terenkripsi/DRM tidak didukung');
  const segs=t.split(/\r?\n/).filter(l=>l&&l[0]!=='#').map(l=>new URL(l,url).href),map=(t.match(/#EXT-X-MAP:URI="([^"]+)"/)||[])[1];if(map)segs.unshift(new URL(map,url).href);
  const ch=[];for(let i=0;i<segs.length;i++){const r=await fetch(segs[i]);if(!r.ok)throw Error('HTTP '+r.status);const b=await r.arrayBuffer();ch.push(b);it.size+=b.byteLength;it.p=(i+1)/segs.length;prog()}
  return new Blob(ch,{type:map?'video/mp4':'video/mp2t'})}
async function startDl(url,quiet,h){let u;try{u=new URL(url)}catch{return toast('URL tidak valid')}
  const hls=/\.m3u8/i.test(u.pathname),base=(decodeURIComponent(u.pathname.split('/').pop())||'video').replace(/\.m3u8$/i,'')+(h?`-${h}p`:'');
  const it={id:Date.now(),name:base,url,status:'berjalan',p:0,size:0};DL.unshift(it);
  const R=()=>{if(!quiet)render()},prog=()=>{const b=$('#p'+it.id)||$('#dlp');if(b)b.style.width=it.p*100+'%'};R();
  try{let blob;
    if(hls){blob=await hlsGet(url,it,prog);it.name=base+(blob.type==='video/mp4'?'.mp4':'.ts')}
    else{const r=await fetch(url);if(!r.ok)throw Error('HTTP '+r.status);const tot=+r.headers.get('content-length')||0,rd=r.body.getReader(),ch=[];let got=0;
      for(;;){const{done,value}=await rd.read();if(done)break;ch.push(value);got+=value.length;it.size=got;it.p=tot?got/tot:0;prog()}
      blob=new Blob(ch,{type:r.headers.get('content-type')||''})}
    it.blob=blob;it.type=blob.type;it.status='selesai';it.p=1;
    await dbPut('dl',{id:it.id,name:it.name,size:it.size,type:it.type,blob,status:'selesai',url});if(quiet)toast('Selesai: tersimpan di tab Unduhan')}
  catch(e){it.status='gagal';it.err=/fetch/i.test(e.message)?'diblokir CORS atau tidak bisa diakses langsung':e.message;if(quiet)toast('Gagal: '+it.err)}
  R()}
const isVid=d=>/^video\//.test(d.type||'')||/\.(mp4|webm|mkv|mov|m4v|ts|3gp)$/i.test(d.name);
const dlRow=d=>`<div class="card"><b>${esc(d.name)}</b><small>${d.status}${d.size?' · '+fmt(d.size):''}${d.err?' · '+esc(d.err):''}</small>${d.status==='berjalan'?`<div class="bar"><i id="p${d.id}" style="width:${d.p*100}%"></i></div>`:''}
<div class="acts">${d.status==='selesai'?`<button data-act="open" data-id="${d.id}">Buka</button><button data-act="save" data-id="${d.id}">Simpan</button>${/video\/(mp4|webm|ogg)/.test(d.type)?`<button data-act="playdl" data-id="${d.id}">Putar</button>`:''}${isVid(d)?`<button class="go" data-act="tov" data-id="${d.id}">🔒 Pindah ke Vault</button>`:''}`:''}${d.status==='gagal'?`<button data-act="retry" data-id="${d.id}">Ulangi</button>`:''}<button data-act="deld" data-id="${d.id}">Hapus</button></div></div>`;

/* ---------- Views ---------- */
const V={};
V.home=()=>`<div class="hero"><div class="orb"><div class="rw"><span class="ring"></span><span class="dot"></span></div><span class="core"></span></div><h1>Nexora</h1><p>Search Freely. Keep Privately.</p></div>${sbox()}<div class="tiles"><a href="#player"><i>▶</i>Pemutar</a><a href="#downloads"><i>⬇</i>Unduhan</a><a href="#vault"><i>🔒</i>Vault</a></div>
<h3>Situs favorit</h3><div class="grid">${BM.map((b,i)=>`<div class="sc"><a data-act="openbm" data-u="${esc(b.u)}"><span class="av">${esc(b.t[0]||'?').toUpperCase()}</span>${esc(b.t)}</a><button class="x" data-act="delbm" data-i="${i}">✕</button></div>`).join('')}<div class="sc"><button class="add" data-act="addbm">+</button>Tambah</div></div>
<h3>Pencarian terbaru</h3>${hlist(5)}`;
V.search=()=>`${sbox()}<div>${Object.entries(ENG).map(([k,v])=>`<button class="chip ${k===S.engine?'on':''}" data-act="eng" data-k="${k}">${v[0]}</button>`).join('')}</div>
<h3>Pintasan cepat</h3><div>${Object.entries(BANG).map(([k,v])=>`<button class="chip" data-act="bang" data-b="${k}">!${k} ${v[1]}</button>`).join('')}</div><h3>Riwayat</h3>${hlist(50)}${H.length?'<div class="acts"><button data-act="clearh">Hapus semua riwayat</button></div>':''}`;
V.downloads=()=>`<form class="sb" data-form="dl"><input id="u" type="url" placeholder="Tempel URL file atau video langsung" autocomplete="off"><button>Unduh</button></form>
<p class="note">Hanya URL langsung yang mengizinkan akses (CORS). Situs dengan DRM atau login tidak didukung.</p>${DL.length?DL.map(dlRow).join(''):'<p class="empty">Belum ada unduhan</p>'}`;
const PT={unlock:['Buka Vault','Masukkan PIN'],setup:['Buat PIN','4–8 digit. Jika hilang, video tidak bisa dipulihkan.'],cs:['Ulangi PIN','Masukkan PIN sekali lagi'],old:['PIN lama','Verifikasi dulu'],new:['PIN baru','4–8 digit'],cn:['Ulangi PIN baru','Jangan tutup aplikasi saat proses']};
const pinUI=(t,d)=>`<div class="pinpad"><h2>${t}</h2><p class="note">${d}</p><div class="dots">${Array.from({length:Math.max(4,pb.length)},(_,i)=>`<i class="${i<pb.length?'f':''}"></i>`).join('')}</div><div class="keys">${[1,2,3,4,5,6,7,8,9,'⌫',0,'✓'].map(k=>`<button class="${k==='✓'?'ok':''}" data-act="k" data-k="${k}">${k}</button>`).join('')}</div>${key&&pm?'<button data-act="cancel">Batal</button>':''}</div>`;
V.vault=()=>{const has=!!LS.get('vault');if(!has&&pm!=='cs')pm='setup';if(has&&!key)pm='unlock';if(pm)return pinUI(...PT[pm]);
  return`<div class="bar2"><button class="go" data-act="imp">+ Impor</button><button data-act="chpin">Ubah PIN</button><button data-act="lock">Kunci</button></div><input id="fi" type="file" accept="video/*" multiple hidden>
${VI.length?VI.map(v=>`<div class="card"><b>${esc(v.name)}</b><small>${fmt(v.size)}</small><div class="acts"><button data-act="play" data-id="${v.id}">▶ Putar</button><button data-act="delv" data-id="${v.id}">Hapus</button></div></div>`).join(''):'<p class="empty">Vault kosong. Impor video atau kirim dari Unduhan.</p>'}`};
const opt=(l,v)=>l.map(([k,t])=>`<option value="${k}" ${k==v?'selected':''}>${t}</option>`).join('');
const isApp=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone;
V.settings=()=>`<div class="card"><b>Pasang aplikasi</b><small>${isApp()?'Nexora sudah terpasang dan berjalan sebagai aplikasi.':dip?'Pasang Nexora di layar utama tanpa Play Store.':'Jika tombol tidak memunculkan jendela pasang, buka menu ⋮ di Chrome lalu pilih Instal aplikasi.'}</small>${isApp()?'':'<div class="acts"><button class="go" data-act="install">Pasang sekarang</button></div>'}</div>
<div class="card"><b>Nexora Companion</b><small>Skrip untuk browser Android (Kiwi atau Firefox + Tampermonkey). Menambah tombol unduh mengambang saat Anda memutar video di situs mana pun, dengan pilihan resolusi, plus anti iklan.</small>
<label>Anti iklan<input type="checkbox" data-set="ads" ${S.ads?'checked':''}></label><label>Tombol unduh mengambang<input type="checkbox" data-set="fab" ${S.fab?'checked':''}></label>
<div class="acts"><button class="go" data-act="csc">Salin skrip</button><button data-act="csd">Unduh .user.js</button><button data-act="csh">Cara pasang</button></div></div>
<div class="card"><label>Tema<select data-set="theme">${opt([['dark','Gelap'],['light','Terang'],['auto','Ikuti sistem']],S.theme)}</select></label>
<label>Mesin pencari<select data-set="engine">${opt(Object.entries(ENG).map(([k,v])=>[k,v[0]]),S.engine)}</select></label>
<label>Simpan riwayat<input type="checkbox" data-set="hist" ${S.hist?'checked':''}></label>
<label>Kunci otomatis Vault<select data-set="lock">${opt([[0,'Mati'],[1,'1 menit'],[2,'2 menit'],[5,'5 menit']],S.lock)}</select></label></div>
<div class="card"><b>Penyimpanan</b><small id="st">Menghitung…</small><div class="acts"><button data-act="clearh">Hapus riwayat</button><button data-act="wipe">Hapus semua data</button></div></div>
<div class="card"><b>Tentang Nexora</b><small>Versi 1.5.0 · Search Freely. Keep Privately.<br>Semua data tersimpan lokal di perangkat ini.</small></div>
<p class="copy">© 2026 Mujahadah Alfa<br>Semua hak dilindungi.</p>`;
/* ---------- Pemutar: unduh per resolusi + terjemahan Indonesia ---------- */
let P={url:'',name:'',variants:[],cues:[],on:true,orig:false,sl:'auto'},busy=0;
const isH=u=>/\.m3u8/i.test(u.split('?')[0]),ld=src=>new Promise((a,b)=>{const e=document.createElement('script');e.src=src;e.onload=a;e.onerror=b;document.head.append(e)});
function setSrc(url,name){P.url=url;P.name=name||'video';P.cues=[];P.variants=[{h:0,bw:0,url}];
  if(isH(url))fetch(url).then(r=>r.text()).then(t=>{const L=t.split(/\r?\n/),v=[];L.forEach((l,i)=>{const m=l.match(/^#EXT-X-STREAM-INF:(.*)/);if(m)v.push({h:+((m[1].match(/RESOLUTION=\d+x(\d+)/)||[])[1]||0),bw:+((m[1].match(/BANDWIDTH=(\d+)/)||[])[1]||0),url:new URL(L[i+1],url).href})});if(v.length)P.variants=v.sort((a,b)=>b.h-a.h||b.bw-a.bw)}).catch(()=>{})}
async function initPlayer(){const v=$('#pv video');if(!v)return;v.addEventListener('timeupdate',tick);
  if(isH(P.url)){try{if(!self.Hls)await ld('https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.17/hls.min.js');if(Hls.isSupported()){const h=new Hls();h.loadSource(P.url);h.attachMedia(v);return}}catch{}}
  v.src=P.url}
function parseSub(t){const ts=s=>{const m=s.trim().match(/(?:(\d+):)?(\d+):(\d+)[.,](\d+)/);return m?(+(m[1]||0))*3600+ +m[2]*60+ +m[3]+ +('0.'+m[4]):0},out=[];
  for(const b of t.replace(/\r/g,'').split(/\n\n+/)){const L=b.split('\n'),i=L.findIndex(l=>l.includes('-->'));if(i<0)continue;const[a,c]=L[i].split('-->');
    out.push({s:ts(a),e:ts(c.trim().split(/\s+/)[0]),t:L.slice(i+1).join(' ').replace(/<[^>]+>|\{[^}]*\}/g,'').trim()})}
  return out.filter(c=>c.t)}
async function trans(t){const q=encodeURIComponent(t),sl=P.sl;
  try{const j=await(await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=id&dt=t&q=${q}`)).json();return j[0].map(x=>x[0]).join('')}
  catch{try{const j=await(await fetch(`https://api.mymemory.translated.net/get?q=${q}&langpair=${sl==='auto'?'Autodetect':sl}|id`)).json();return j.responseData.translatedText}catch{return null}}}
function tick(){const v=$('#pv video'),el=$('#subs');if(!v||!el)return;const t=v.currentTime,c=P.cues;
  for(let i=0;i<c.length&&busy<4;i++){const k=c[i];if(k.s>t+45)break;if(k.e<t||k.q)continue;k.q=1;busy++;trans(k.t).then(r=>{k.tr=r||k.t}).finally(()=>busy--)}
  const k=c.find(x=>t>=x.s&&t<=x.e);el.innerHTML=k&&P.on?`<span>${esc(k.tr??k.t)}</span>${P.orig&&k.tr?`<small>${esc(k.t)}</small>`:''}`:''}
function loadSub(t){P.cues=parseSub(t);toast(P.cues.length?P.cues.length+' baris subtitle dimuat':'Format subtitle tidak dikenali');const s=$('#sheet');if(s&&!s.hidden)s.innerHTML=sheetH();tick()}
const sheetH=()=>`<div class="grab"></div><h3>Unduh berdasarkan resolusi</h3>${P.variants.map((v,i)=>`<button class="vr" data-act="dlv" data-i="${i}"><b>${v.h?v.h+'p':'Kualitas asli'}</b><small>${v.bw?(v.bw/1e6).toFixed(1)+' Mbps':'unduh'}</small></button>`).join('')}<div class="bar"><i id="dlp"></i></div>
<h3>Terjemahan Indonesia</h3><label>Bahasa subtitle<select id="sl">${opt([['auto','Deteksi otomatis'],['en','Inggris'],['ja','Jepang'],['ko','Korea'],['zh-CN','Mandarin'],['es','Spanyol'],['ar','Arab']],P.sl)}</select></label>
<div class="acts"><button data-act="pick">Pilih file subtitle</button></div><input id="sf" type="file" accept=".srt,.vtt,.txt" hidden>
<form class="sb" data-form="sub"><input id="su" type="url" placeholder="atau URL subtitle .srt/.vtt"><button>Muat</button></form>
<label>Tampilkan terjemahan<input type="checkbox" id="son" ${P.on?'checked':''}></label><label>Tampilkan teks asli<input type="checkbox" id="sor" ${P.orig?'checked':''}></label>
<p class="note">${P.cues.length?P.cues.length+' baris subtitle dimuat.':'Belum ada subtitle.'}</p><button class="go" data-act="closesh">Selesai</button>`;
V.player=()=>`<form class="sb" data-form="play"><input id="pu" type="url" placeholder="URL video langsung (.mp4, .webm, .m3u8)" value="${esc(P.url.startsWith('blob:')?'':P.url)}"><button>Putar</button></form>
${P.url?`<div id="pv"><video controls controlsList="nofullscreen" playsinline></video><div id="subs"></div><button class="fab l" data-act="fs" aria-label="Layar penuh">⛶</button><button class="fab" data-act="fab" aria-label="Unduh"><svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg></button><div class="sheet" id="sheet" hidden></div></div>`:'<p class="empty">Tempel URL video untuk memutar.</p>'}
<p class="note">Tombol ungu di pojok video membuka pilihan resolusi dan terjemahan. Hanya video tanpa DRM yang mengizinkan akses (CORS) yang bisa diunduh.</p>`;
function render(f){cur=location.hash.slice(1);if(!V[cur])cur='home';if(!f&&cur==='player'&&last==='player'&&$('#pv'))return;if(cur!=='vault')pb='';const v=$('#view');v.innerHTML=V[cur]();if(cur!==last){v.classList.remove('in');void v.offsetWidth;v.classList.add('in');last=cur}$('#title').textContent=TT[cur];if(cur==='player')initPlayer();gf.hidden=!(cur==='player'&&P.url);$$('nav a').forEach(a=>a.classList.toggle('on',a.dataset.v===cur));
  if(cur==='settings')navigator.storage?.estimate?.().then(e=>{const s=$('#st');if(s)s.textContent=`${fmt(e.usage)} terpakai dari ${fmt(e.quota)}`})}
addEventListener('hashchange',render);

/* ---------- Actions ---------- */
const dl=id=>DL.find(d=>d.id==id),sv=(b,n)=>{const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=n;a.click();setTimeout(()=>URL.revokeObjectURL(u),4e4)};
const cscript=async()=>(await(await fetch('companion.user.js')).text()).replace('{"ads":true,"fab":true}',JSON.stringify({ads:S.ads,fab:S.fab}));
const A={
 again:e=>go(e.dataset.q),delh:e=>{H.splice(+e.dataset.i,1);save();render()},clearh:()=>{H=[];save();render();toast('Riwayat dihapus')},
 eng:e=>{S.engine=e.dataset.k;save();render()},openbm:e=>open(e.dataset.u,'_blank','noopener'),delbm:e=>{BM.splice(+e.dataset.i,1);save();render()},
 addbm:()=>{let u=prompt('Alamat situs (contoh: github.com)');if(!u)return;if(!/^https?:/i.test(u))u='https://'+u;try{BM.push({t:new URL(u).hostname.replace(/^www\./,''),u});save();render()}catch{toast('URL tidak valid')}},
 open:e=>{const d=dl(e.dataset.id);open(URL.createObjectURL(d.blob),'_blank')},save:e=>{const d=dl(e.dataset.id);sv(d.blob,d.name)},
 retry:e=>{const d=dl(e.dataset.id);DL=DL.filter(x=>x!==d);startDl(d.url)},
 deld:async e=>{if(!confirm('Hapus unduhan ini?'))return;await dbDel('dl',+e.dataset.id);DL=DL.filter(d=>d.id!=e.dataset.id);render()},
 tov:async e=>{const d=dl(e.dataset.id);if(!key){pendMv=d.id;toast('Masukkan PIN untuk memindahkan');location.hash='vault';return}await moveV(d)},
 imp:()=>$('#fi').click(),lock,install:async()=>{if(!dip)return toast('Buka menu ⋮ Chrome lalu pilih Instal aplikasi');dip.prompt();const r=await dip.userChoice;dip=null;toast(r.outcome==='accepted'?'Memasang Nexora…':'Pemasangan dibatalkan');render()},k:e=>{const c=e.dataset.k;navigator.vibrate?.(8);if(c==='✓')return submitPin();pb=c==='⌫'?pb.slice(0,-1):pb.length<8?pb+c:pb;render()},csc:async()=>{try{await navigator.clipboard.writeText(await cscript());toast('Skrip disalin. Tempel di Tampermonkey')}catch{toast('Gagal menyalin skrip')}},csd:async()=>{try{sv(new Blob([await cscript()],{type:'text/javascript'}),'nexora-companion.user.js')}catch{toast('Gagal membuat skrip')}},csh:()=>alert('Cara pasang:\n1. Pakai Kiwi Browser atau Firefox untuk Android.\n2. Pasang ekstensi Tampermonkey.\n3. Tampermonkey > Skrip baru, hapus isinya, tempel skrip yang disalin, lalu simpan.\n4. Buka situs berisi video dan putar videonya; tombol unduh akan muncul.\nSetelah mengubah saklar di Nexora, salin dan tempel ulang skripnya.'),chpin:()=>{pm='old';pb='';render()},gop:()=>{location.hash='player'},qdp:()=>{Q.url=P.url;Q.variants=P.variants;$('#qd').innerHTML=qdH()},qdl:e=>{const v=Q.variants[+e.dataset.i];toast('Mengunduh '+(v.h?v.h+'p':'file')+'…');startDl(v.url,true,v.h)},qdc:()=>{$('#qd').hidden=true},playdl:e=>{const d=dl(e.dataset.id);setSrc(URL.createObjectURL(d.blob),d.name);location.hash='player'},fab:()=>{const s=$('#sheet');s.innerHTML=sheetH();s.hidden=false},closesh:()=>{$('#sheet').hidden=true},pick:()=>$('#sf').click(),fs:()=>document.fullscreenElement?document.exitFullscreen():$('#pv').requestFullscreen?.(),dlv:e=>{const v=P.variants[+e.dataset.i];if(v.url.startsWith('blob:'))return toast('Video ini sudah ada di Unduhan');toast('Mengunduh '+(v.h?v.h+'p':'video')+'…');startDl(v.url,true,v.h)},cancel:()=>{pm=null;pb='';render()},bang:e=>{const q=$('#q');q.value='!'+e.dataset.b+' ';q.focus()},
 play:async e=>{const v=VI.find(x=>x.id==e.dataset.id);try{const buf=await decB(await tx('vault','readonly',o=>o.get(v.id)));tmpUrl=URL.createObjectURL(new Blob([buf],{type:v.type}));
   $('#ov').innerHTML=`<video src="${tmpUrl}" controls autoplay playsinline></video><button class="go" data-act="closep">Tutup</button>`;$('#ov').hidden=false}catch{toast('Gagal mendekripsi video')}},
 closep,delv:async e=>{if(!confirm('Hapus video ini secara permanen?'))return;await dbDel('vault',e.dataset.id);await dbDel('vmeta',e.dataset.id);VI=VI.filter(v=>v.id!=e.dataset.id);render()},
 wipe:async()=>{if(!confirm('Hapus SEMUA data Nexora, termasuk video di Vault? Tidak bisa dibatalkan.'))return;localStorage.clear();(await idb).close();indexedDB.deleteDatabase('nexora');for(const k of await caches.keys())await caches.delete(k);location.reload()}
};
const F={
 search:()=>{go($('#q').value);render()},
 dl:()=>{const v=$('#u').value.trim();if(v)startDl(v)},
 qd:async()=>{const v=$('#qu').value.trim();try{new URL(v)}catch{return toast('URL tidak valid')}Q.url=v;Q.variants=await variantsOf(v);$('#qd').innerHTML=qdH()},
 play:()=>{const v=$('#pu').value.trim();if(!v)return;try{new URL(v)}catch{return toast('URL tidak valid')}setSrc(v);render(true)},
 sub:async()=>{const v=$('#su').value.trim();if(!v)return;try{loadSub(await(await fetch(v)).text())}catch{toast('Subtitle diblokir CORS atau tidak ditemukan')}},
};
document.addEventListener('click',e=>{const t=e.target.closest('[data-act]');if(t&&A[t.dataset.act])A[t.dataset.act](t)});
document.addEventListener('submit',e=>{const f=e.target.dataset.form;if(f&&F[f]){e.preventDefault();F[f]()}});
document.addEventListener('change',async e=>{const t=e.target,k=t.dataset.set;
 if(k){S[k]=t.type==='checkbox'?t.checked:k==='lock'?+t.value:t.value;save();applyTheme();arm();return}
 if(t.id==='fi'){toast('Mengenkripsi…');for(const f of t.files)await vImport(f,f.name);render();toast('Impor selesai')}
 if(t.id==='sf'&&t.files[0])loadSub(await t.files[0].text());if(t.id==='son')P.on=t.checked;if(t.id==='sor')P.orig=t.checked;if(t.id==='sl')P.sl=t.value;tick()});
addEventListener('beforeinstallprompt',e=>{e.preventDefault();dip=e;if(cur==='settings')render()});
addEventListener('appinstalled',()=>{dip=null;toast('Nexora terpasang');render()});
const net=()=>{$('#net').classList.toggle('off',!navigator.onLine)};addEventListener('online',()=>{net();toast('Kembali online')});addEventListener('offline',()=>{net();toast('Anda sedang offline')});

/* ---------- Tombol unduh mengambang (di semua layar Nexora) ---------- */
const gf=$('#gfab'),Q={url:'',variants:[]};
async function variantsOf(url){const one=[{h:0,bw:0,url}];if(!isH(url))return one;
  try{const t=await(await fetch(url)).text(),L=t.split(/\r?\n/),v=[];L.forEach((l,i)=>{const m=l.match(/^#EXT-X-STREAM-INF:(.*)/);if(m)v.push({h:+((m[1].match(/RESOLUTION=\d+x(\d+)/)||[])[1]||0),bw:+((m[1].match(/BANDWIDTH=(\d+)/)||[])[1]||0),url:new URL(L[i+1],url).href})});return v.length?v.sort((a,b)=>b.h-a.h||b.bw-a.bw):one}catch{return one}}
const qdH=()=>`<div class="grab"></div><h3>Unduh cepat</h3><form class="sb" data-form="qd"><input id="qu" type="url" placeholder="Tempel URL video atau file" value="${esc(Q.url)}"><button>Cek</button></form>
${P.url&&!P.url.startsWith('blob:')?'<button class="vr" data-act="qdp"><b>Video di pemutar</b><small>pakai URL ini</small></button>':''}
${Q.variants.map((v,i)=>`<button class="vr" data-act="qdl" data-i="${i}"><b>${v.h?v.h+'p':'Kualitas asli'}</b><small>${v.bw?(v.bw/1e6).toFixed(1)+' Mbps':'unduh'}</small></button>`).join('')}
<div class="bar"><i id="dlp"></i></div><p class="note">Hasil masuk ke tab Unduhan, lalu bisa dipindahkan ke Vault.</p><button class="go" data-act="qdc">Tutup</button>`;
async function openQD(){if(cur==='player'&&P.url&&!P.url.startsWith('blob:')){Q.url=P.url;Q.variants=P.variants}const q=$('#qd');q.innerHTML=qdH();q.hidden=false;
  try{const t=(await navigator.clipboard.readText()).trim();if(/^https?:\/\/\S+$/i.test(t)&&!Q.url){Q.url=t;Q.variants=await variantsOf(t);q.innerHTML=qdH()}}catch{}}
const gpos=()=>{const p=LS.get('fabpos',{x:innerWidth-72,y:innerHeight*.6});gf.style.left=Math.min(Math.max(8,p.x),innerWidth-64)+'px';gf.style.top=Math.min(Math.max(70,p.y),innerHeight-170)+'px'};
gpos();addEventListener('resize',gpos);let gd=null;
gf.addEventListener('pointerdown',e=>{gd={x:e.clientX,y:e.clientY,l:gf.offsetLeft,t:gf.offsetTop,m:false};gf.setPointerCapture(e.pointerId)});
gf.addEventListener('pointermove',e=>{if(!gd)return;const dx=e.clientX-gd.x,dy=e.clientY-gd.y;if(Math.abs(dx)+Math.abs(dy)>8)gd.m=true;if(gd.m){gf.style.left=gd.l+dx+'px';gf.style.top=gd.t+dy+'px'}});
gf.addEventListener('pointerup',()=>{if(!gd)return;if(!gd.m)openQD();else{LS.set('fabpos',{x:gf.offsetLeft<innerWidth/2?8:innerWidth-64,y:gf.offsetTop});gpos()}gd=null});
document.addEventListener('click',e=>{const q=$('#qd');if(!q.hidden&&!q.contains(e.target)&&!gf.contains(e.target))q.hidden=true});

/* /* ---------- Init ---------- */
(async()=>{applyTheme();net();DL=(await dbAll('dl')).map(r=>({...r,p:1}));render();setTimeout(()=>{$('#splash').classList.add('hide');setTimeout(()=>$('#splash').remove(),500)},700);navigator.storage?.persist?.();
 if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{})})();
