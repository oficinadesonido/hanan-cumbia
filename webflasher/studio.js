/* HANAN CUMBIA Studio — app unificada: samples + secuencias + preview + grabar.
 * Una sola imagen de firmware; parchea ambas zonas y flashea una vez.
 * Preview fiel: emula 9.8 kHz + zero-order-hold + 8-bit + pitch por acumulador de fase.
 */
'use strict';

const M = window.FIRMWARE_STUDIO_META;
const STK = { OK:0x10, INSYNC:0x14, CRC_EOP:0x20, GET_SYNC:0x30, ENTER_PROGMODE:0x50,
  LEAVE_PROGMODE:0x51, LOAD_ADDRESS:0x55, PROG_PAGE:0x64, READ_PAGE:0x74, READ_SIGN:0x75 };
const PAGE=128, EXPECTED_SIG=[0x1e,0x95,0x0f];
const STEPS=32, NBANKS=4, NPRESETS=4, BANKSTEPS=128, SR=M.sr;
const SAMPLE_ORDER=['kick','snare','hat','bass'];
// canal de secuencia -> voz/sample y como suena en el firmware.
// color = boton fisico de la maquina (el boton blanco enciende LED azul; en la web se usa blanco)
const CH=[
  { key:'B1', name:'Conga',   pitch:'F1', sample:'hat',   inc:null, color:'#ff1f8e' },  // rojo (rosa ODS) · hat sample, pitch por paso
  { key:'B2', name:'Campana', pitch:'F2', sample:'bass',  inc:null, color:'#eaeaea' },  // blanco · bass sample, pitch por paso
  { key:'B3', name:'Huiro',   pitch:null, sample:'snare', inc:128,  color:'#3ddc84' },  // verde
  { key:'B4', name:'Bombo',   pitch:null, sample:'kick',  inc:157,  color:'#ffd400' },  // amarillo
];
// selectores de banco/preset en el orden fisico de los botones; idx = indice en el firmware
const SELBTNS=[
  { idx:2, color:'rojo',     hex:'#ff1f8e' },
  { idx:0, color:'blanco',   hex:'#eaeaea' },
  { idx:3, color:'verde',    hex:'#3ddc84' },
  { idx:1, color:'amarillo', hex:'#ffd400' },
];

const $=id=>document.getElementById(id);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

let port=null,reader=null,writer=null,rxQueue=[],rxWaiters=[],readLoopRunning=false;
let baseImage=null, sampleDesc={}, factorySamples={};
let voiceData={kick:null,snare:null,hat:null,bass:null};   // null = fabrica
let banks=[]; let curBank=0,curPreset=0;
let audioCtx=null, previewSrc=null, playingBank=-1, playingPreset=-1, previewT0=0, previewDur=0, previewNext=null;

function log(m,c){ const e=$('log'),d=document.createElement('div'); if(c)d.className=c; d.textContent=m; e.appendChild(d); e.scrollTop=e.scrollHeight; }
function setProgress(p){ $('bar').style.width=Math.round(p*100)+'%'; $('bar').textContent=Math.round(p*100)+'%'; }
function setBusy(b){ $('flashBtn').disabled=b; $('flashFactoryBtn').disabled=b; }

/* ---------- Web Serial + STK500 ---------- */
async function startReadLoop(){ readLoopRunning=true; try{ while(port&&port.readable&&readLoopRunning){ reader=port.readable.getReader();
  try{ while(true){ const{value,done}=await reader.read(); if(done)break; if(value&&value.length){ for(const b of value)rxQueue.push(b);
    while(rxWaiters.length&&rxQueue.length>=rxWaiters[0].n){ const w=rxWaiters.shift(); w.resolve(rxQueue.splice(0,w.n)); } } } }
  finally{ reader.releaseLock(); reader=null; } } }catch(e){} }
function readBytes(n,t=1500){ if(rxQueue.length>=n)return Promise.resolve(rxQueue.splice(0,n));
  return new Promise((res,rej)=>{ const w={n,resolve:res,reject:rej}; rxWaiters.push(w);
    w.timer=setTimeout(()=>{const i=rxWaiters.indexOf(w);if(i>=0)rxWaiters.splice(i,1);rej(new Error('timeout'));},t);
    const o=w.resolve; w.resolve=v=>{clearTimeout(w.timer);o(v);}; }); }
function flushInput(){ rxQueue=[]; }
async function wr(b){ await writer.write(b instanceof Uint8Array?b:new Uint8Array(b)); }
async function resetBoard(inv){ const A=!inv,D=!!inv; try{ await port.setSignals({dataTerminalReady:D,requestToSend:D}); await sleep(250);
  await port.setSignals({dataTerminalReady:A,requestToSend:A}); await sleep(50); }catch(e){log('setSignals: '+e.message,'warn');} flushInput(); }
async function cmd(p,rl=0,t=1500){ flushInput(); await wr(new Uint8Array([...p,STK.CRC_EOP]));
  const h=await readBytes(1,t); if(h[0]!==STK.INSYNC)throw new Error('sin INSYNC'); let d=[]; if(rl>0)d=await readBytes(rl,t);
  const tl=await readBytes(1,t); if(tl[0]!==STK.OK)throw new Error('sin OK'); return d; }
async function getSync(){ flushInput(); await wr(new Uint8Array([STK.GET_SYNC,STK.CRC_EOP]));
  const h=await readBytes(1,400); if(h[0]!==STK.INSYNC)throw 0; const t=await readBytes(1,400); if(t[0]!==STK.OK)throw 0; }
async function syncRetries(inv,att=4){ for(let a=1;a<=att;a++){ log('Reset + sync ('+a+')...'); await resetBoard(inv);
  const dl=Date.now()+1200; while(Date.now()<dl){ try{ await getSync(); log('Sincronizado.','ok'); return true; }catch(e){ flushInput(); await sleep(50);} } } return false; }
async function loadAddr(w){ await cmd([STK.LOAD_ADDRESS,w&0xff,(w>>8)&0xff]); }
async function progPage(b){ await cmd([STK.PROG_PAGE,(b.length>>8)&0xff,b.length&0xff,0x46,...b]); }
async function readPg(l){ return await cmd([STK.READ_PAGE,(l>>8)&0xff,l&0xff,0x46],l); }
function parseIntelHex(text){ const data=new Map(); let base=0,max=0;
  for(const raw of text.split(/\r?\n/)){ const ln=raw.trim(); if(!ln||ln[0]!==':')continue;
    const len=parseInt(ln.substr(1,2),16),a=parseInt(ln.substr(3,4),16),ty=parseInt(ln.substr(7,2),16);
    if(ty===0){for(let i=0;i<len;i++){const ad=base+a+i;data.set(ad,parseInt(ln.substr(9+i*2,2),16));if(ad>max)max=ad;}}
    else if(ty===2)base=parseInt(ln.substr(9,4),16)<<4; else if(ty===4)base=parseInt(ln.substr(9,4),16)<<16; else if(ty===1)break; }
  let size=max+1; if(size%PAGE)size+=PAGE-(size%PAGE); const out=new Uint8Array(size).fill(0xff); for(const[k,v]of data)out[k]=v; return out; }
function findMagic(img,MG){ for(let i=0;i<=img.length-MG.length;i++){ let ok=1; for(let j=0;j<MG.length;j++)if(img[i+j]!==MG[j]){ok=0;break;} if(ok)return i; } return -1; }

/* ---------- Samples ---------- */
function readSamples(img){ const m=findMagic(img,M.sample_magic), d=m+8, r16=o=>img[o]|(img[o+1]<<8), res={};
  SAMPLE_ORDER.forEach((v,i)=>{ const off=r16(d+i*4),len=r16(d+i*4+2); sampleDesc[v]={off,len}; res[v]=img.slice(m+off,m+off+len); }); return res; }
function effSample(v){ return voiceData[v]||factorySamples[v]; }
function sampleUsed(){ return SAMPLE_ORDER.reduce((s,v)=>s+effSample(v).length,0); }
function sampleCap(){ return M.sample_total-M.sample_header; }
function patchSamples(img){ const m=findMagic(img,M.sample_magic), H=M.sample_header;
  if(sampleUsed()>sampleCap())throw new Error('los samples exceden el banco');
  let off=H; const desc=[],chunks=[]; for(const v of SAMPLE_ORDER){ const b=effSample(v); desc.push({off,len:b.length}); chunks.push(b); off+=b.length; }
  const d=m+8; for(let i=0;i<4;i++){ img[d+i*4]=desc[i].off&255; img[d+i*4+1]=desc[i].off>>8; img[d+i*4+2]=desc[i].len&255; img[d+i*4+3]=desc[i].len>>8; }
  let p=m+H; for(const c of chunks){ img.set(c,p); p+=c.length; } for(let q=p;q<m+M.sample_total;q++)img[q]=0; }
async function wavToVoice(ab){ const AC=window.AudioContext||window.webkitAudioContext, ac=new AC(); let dec;
  try{ dec=await ac.decodeAudioData(ab.slice(0)); }finally{ if(ac.close)ac.close(); }
  const n0=dec.length,chs=dec.numberOfChannels,mono=new Float32Array(n0);
  for(let c=0;c<chs;c++){ const ch=dec.getChannelData(c); for(let i=0;i<n0;i++)mono[i]+=ch[i]/chs; }
  const newLen=Math.max(1,Math.round(n0*SR/dec.sampleRate));
  const OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext, oac=new OAC(1,newLen,SR);
  const buf=oac.createBuffer(1,n0,dec.sampleRate); buf.copyToChannel(mono,0);
  const src=oac.createBufferSource(); src.buffer=buf; src.connect(oac.destination); src.start();
  const rd=await oac.startRendering(), fl=rd.getChannelData(0);
  let peak=0; for(let i=0;i<fl.length;i++){const a=Math.abs(fl[i]);if(a>peak)peak=a;}
  const norm=($('normalize').checked&&peak>0)?1/peak:1, out=new Uint8Array(fl.length);
  for(let i=0;i<fl.length;i++){ let v=Math.round(fl[i]*norm*127)+127; out[i]=v<0?0:v>255?255:v; } return out; }

/* ---------- Presets (bit pack/unpack, igual que el firmware) ---------- */
function rdr(buf){ let p=0; return n=>{ let v=0; for(let i=0;i<n;i++){ if((buf[p>>3]>>(p&7))&1)v|=1<<i; p++; } return v; }; }
function wtr(buf){ let p=0; return (val,n)=>{ for(let i=0;i<n;i++){ const q=p; if((val>>i)&1)buf[q>>3]|=1<<(q&7); else buf[q>>3]&=~(1<<(q&7)); p++; } }; }
function decodeBank(buf){ const r=rdr(buf),bk={};
  for(const k of['B1','B2','B3','B4']){bk[k]=new Uint8Array(BANKSTEPS);for(let s=0;s<BANKSTEPS;s++)bk[k][s]=r(1);}
  for(const k of['F1','F2']){bk[k]=new Uint8Array(BANKSTEPS);for(let s=0;s<BANKSTEPS;s++)bk[k][s]=r(5);} return bk; }
function encodeBank(bk){ const buf=new Uint8Array(M.bank_bytes),w=wtr(buf);
  for(const k of['B1','B2','B3','B4'])for(let s=0;s<BANKSTEPS;s++)w(bk[k][s]&1,1);
  for(const k of['F1','F2'])for(let s=0;s<BANKSTEPS;s++)w(bk[k][s]&31,5); return buf; }
function loadBanks(img){ const m=findMagic(img,M.preset_magic); banks=[]; for(let b=0;b<NBANKS;b++){ const off=m+M.preset_header+b*M.bank_bytes; banks.push(decodeBank(img.subarray(off,off+M.bank_bytes))); } }
function patchPresets(img){ const m=findMagic(img,M.preset_magic);
  for(let b=0;b<NBANKS;b++) img.set(encodeBank(banks[b]), m+M.preset_header+b*M.bank_bytes);
  const ver=Date.now()&0xffff; img[m+M.version_off]=ver&0xff; img[m+M.version_off+1]=(ver>>8)&0xff; return ver; }

/* ---------- Preview fiel (motor de audio del firmware en JS) ---------- */
function pitchInc(level){ return 16+((level&31)<<4); }
function renderLoop(bank,preset){
  const stepN=Math.round((60/M.bpm/8)*SR), total=stepN*STEPS;   // 8 pasos por beat
  const voices=CH.map(c=>({ buf:effSample(c.sample), len:sampleDesc[c.sample].len,
    seq:bank[c.key], freq:c.pitch?bank[c.pitch]:null, fixedInc:c.inc, phase:0, on:false, inc:0 }));
  const eng=new Float32Array(total); let step=-1;
  for(let i=0;i<total;i++){
    const cs=Math.floor(i/stepN)%STEPS;
    if(cs!==step){ step=cs; const gi=preset*STEPS+cs;
      for(const v of voices){ if(v.seq[gi]){ v.phase=0; v.on=true; v.inc=v.fixedInc!=null?v.fixedInc:pitchInc(v.freq[gi]); } } }
    let sum=0;
    for(const v of voices){ if(v.on){ const idx=v.phase>>6; if(idx>v.len){v.on=false;} else { sum+=(v.buf[idx]||127)-127; v.phase+=v.inc; } } }
    let s=sum+127; if(s<0)s=0; if(s>255)s=255;
    eng[i]=(Math.round(s)-127.5)/127.5;   // 8-bit cuantizado, centrado
  }
  return {eng,total};
}
function makePreviewBuffer(){
  const {eng,total}=renderLoop(banks[curBank],curPreset);
  const ratio=audioCtx.sampleRate/SR, outLen=Math.floor(total*ratio);
  const buf=audioCtx.createBuffer(1,outLen,audioCtx.sampleRate), ch=buf.getChannelData(0);
  for(let i=0;i<outLen;i++) ch[i]=eng[Math.floor(i/ratio)];   // zero-order-hold = crunch fiel
  return buf;
}
function playPreview(keepPos=false){
  if(!audioCtx){ const AC=window.AudioContext||window.webkitAudioContext; audioCtx=new AC(); }
  const pos=(keepPos&&previewSrc)?audioCtx.currentTime-previewT0:0;   // sigue el loop donde iba
  stopPreview();
  const buf=makePreviewBuffer();
  const off=((pos%buf.duration)+buf.duration)%buf.duration;
  const src=audioCtx.createBufferSource(); src.buffer=buf; src.loop=true; src.connect(audioCtx.destination); src.start(0,off);
  previewT0=audioCtx.currentTime-off; previewDur=buf.duration;
  previewSrc=src; playingBank=curBank; playingPreset=curPreset;
  $('playBtn').textContent='■ Stop'; $('playBtn').classList.add('on');
}
// Cambio de banco/preset cuantizado como el firmware: entra recien al volver al paso 0
function queuePreviewSwitch(){
  if(!previewSrc){ playPreview(); return; }
  if(previewNext){ try{previewNext.stop(0);}catch(e){} try{previewNext.disconnect();}catch(e){} previewNext=null; }
  const buf=makePreviewBuffer(), now=audioCtx.currentTime;
  let wrap=previewT0+Math.ceil(Math.max(0,now-previewT0)/previewDur)*previewDur;
  if(wrap<=now+0.03) wrap+=previewDur;   // margen de scheduling
  const src=audioCtx.createBufferSource(); src.buffer=buf; src.loop=true; src.connect(audioCtx.destination); src.start(wrap,0);
  const old=previewSrc, nb=curBank, np=curPreset; previewNext=src;
  old.stop(wrap);
  old.onended=()=>{ if(previewNext===src){ previewSrc=src; previewT0=wrap; previewDur=buf.duration;
    playingBank=nb; playingPreset=np; previewNext=null; } };
}
function stopPreview(){
  if(previewNext){ try{previewNext.stop(0);}catch(e){} previewNext=null; }
  if(previewSrc){ previewSrc.onended=null; try{previewSrc.stop();}catch(e){} previewSrc=null; }
  playingBank=-1; playingPreset=-1;
  $('playBtn').textContent='▶ Play'; $('playBtn').classList.remove('on'); }
function togglePreview(){ if(previewSrc) stopPreview(); else playPreview(); }

/* ---------- Proyecto (localStorage + export/import) ---------- */
const LS='hanan_studio_v1';
function saveLocal(){ try{ const o={ v:1, voices:{}, banks:banks.map(b=>({B1:[...b.B1],B2:[...b.B2],B3:[...b.B3],B4:[...b.B4],F1:[...b.F1],F2:[...b.F2]})) };
  for(const v of SAMPLE_ORDER) o.voices[v]=voiceData[v]?[...voiceData[v]]:null;
  localStorage.setItem(LS,JSON.stringify(o)); }catch(e){} }
function applyProject(o){
  if(o.voices) for(const v of SAMPLE_ORDER) voiceData[v]=o.voices[v]?Uint8Array.from(o.voices[v]):null;
  if(o.banks) banks=o.banks.map(b=>({B1:Uint8Array.from(b.B1),B2:Uint8Array.from(b.B2),B3:Uint8Array.from(b.B3),B4:Uint8Array.from(b.B4),F1:Uint8Array.from(b.F1),F2:Uint8Array.from(b.F2)})); }
function loadLocal(){ try{ const s=localStorage.getItem(LS); if(s){ applyProject(JSON.parse(s)); return true; } }catch(e){} return false; }
function exportProject(){ const o={ v:1, voices:{}, banks:banks.map(b=>({B1:[...b.B1],B2:[...b.B2],B3:[...b.B3],B4:[...b.B4],F1:[...b.F1],F2:[...b.F2]})) };
  for(const v of SAMPLE_ORDER) o.voices[v]=voiceData[v]?[...voiceData[v]]:null;
  const blob=new Blob([JSON.stringify(o)],{type:'application/json'}), a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download='hanan-proyecto.json'; a.click(); URL.revokeObjectURL(a.href); log('Proyecto exportado.','ok'); }
function importProject(file){ const fr=new FileReader(); fr.onload=()=>{ try{ applyProject(JSON.parse(fr.result)); saveLocal(); buildGrid(); refresh(); refreshSamples(); log('Proyecto importado.','ok'); }catch(e){ log('Proyecto inválido: '+e.message,'err'); } }; fr.readAsText(file); }

/* ---------- UI: tabs ---------- */
function showTab(t){ for(const s of ['samples','seq','grabar']){ $('tab-'+s).style.display=s===t?'block':'none'; $('tb-'+s).classList.toggle('active',s===t); } if(t!=='seq') stopPreview(); }

/* ---------- UI: samples ---------- */
function fmtS(b){ return b+' B · '+(b/SR).toFixed(2)+' s'; }
function refreshSamples(){ for(const v of SAMPLE_ORDER){ const lbl=$('len_'+v),cu=!!voiceData[v];
  lbl.textContent=(cu?'★ ':'(fábrica) ')+fmtS(effSample(v).length); lbl.className='vlen'+(cu?' custom':''); }
  const used=sampleUsed(),cap=sampleCap();
  $('sbudgetBar').style.width=Math.min(100,Math.round(used/cap*100))+'%';
  $('sbudgetBar').style.background=used>cap?'var(--err)':'var(--pink)';
  $('sbudgetTxt').textContent=used+' / '+cap+' bytes ('+(used/SR).toFixed(2)+' / '+(cap/SR).toFixed(2)+' s)';
  $('flashBtn').disabled=used>cap; }
async function onPickSample(v,file){ if(!file)return; try{ log('Procesando '+v+': '+file.name+'...');
  let bytes=await wavToVoice(await file.arrayBuffer());
  const otros=SAMPLE_ORDER.filter(x=>x!==v).reduce((s,x)=>s+effSample(x).length,0), allow=sampleCap()-otros;
  if(bytes.length>allow){ log('  recortado a '+allow+' B.','warn'); bytes=bytes.slice(0,Math.max(0,allow)); }
  voiceData[v]=bytes; saveLocal(); log('  '+v+' listo: '+fmtS(bytes.length),'ok'); refreshSamples(); }
  catch(e){ log('Error '+v+': '+e.message,'err'); } }
function clearSample(v){ voiceData[v]=null; $('file_'+v).value=''; saveLocal(); refreshSamples(); }

/* ---------- UI: grilla de secuencias (cada pista con el color de su boton) ---------- */
function idx(s){ return curPreset*STEPS+s; }
function buildGrid(){ const g=$('grid'); g.innerHTML='';
  CH.forEach(ch=>{ const row=document.createElement('div'); row.className='row'; row.style.setProperty('--pc',ch.color);
    const lab=document.createElement('div'); lab.className='clabel'; lab.innerHTML='<span>'+ch.name+'</span>';
    const xb=document.createElement('button'); xb.className='cclear'; xb.textContent='✕'; xb.title='limpiar canal';
    xb.addEventListener('click',()=>clearChannel(ch.key)); lab.appendChild(xb); row.appendChild(lab);
    const pads=document.createElement('div'); pads.className='pads';
    for(let s=0;s<STEPS;s++){ const p=document.createElement('div'); p.className='pad'+(s%4===0?' beat':'')+(s%8===0?' bar':'');
      p.dataset.ch=ch.key; p.dataset.s=s; p.addEventListener('click',()=>{ const a=banks[curBank][ch.key]; a[idx(s)]=a[idx(s)]?0:1; saveLocal(); refresh(); }); pads.appendChild(p); }
    row.appendChild(pads); g.appendChild(row);
    if(ch.pitch){ const prow=document.createElement('div'); prow.className='row pitchrow'; prow.style.setProperty('--pc',ch.color);
      const pl=document.createElement('div'); pl.className='clabel small'; pl.textContent='↳ pitch'; prow.appendChild(pl);
      const pp=document.createElement('div'); pp.className='pads';
      for(let s=0;s<STEPS;s++){ const cell=document.createElement('div'); cell.className='pcell'+(s%4===0?' beat':'')+(s%8===0?' bar':'');
        const fill=document.createElement('div'); fill.className='pfill'; cell.appendChild(fill); cell.dataset.s=s; cell.dataset.pitch=ch.pitch;
        const set=ev=>{ const r=cell.getBoundingClientRect(); let f=1-((ev.clientY-r.top)/r.height); f=Math.max(0,Math.min(1,f));
          const lvl=Math.round(f*31); banks[curBank][ch.pitch][idx(s)]=lvl; showPitchVal(ev,lvl); saveLocal(); refresh(); };
        cell.addEventListener('pointerdown',e=>{cell.setPointerCapture(e.pointerId);set(e);});
        cell.addEventListener('pointermove',e=>{if(e.buttons)set(e);});
        cell.addEventListener('pointerup',hidePitchVal); cell.addEventListener('pointercancel',hidePitchVal); pp.appendChild(cell); }
      prow.appendChild(pp); g.appendChild(prow); } }); }
function showPitchVal(ev,l){ const b=$('pitchval'); b.textContent='pitch '+l; b.style.left=(ev.clientX+14)+'px'; b.style.top=(ev.clientY-30)+'px'; b.style.display='block'; }
function hidePitchVal(){ $('pitchval').style.display='none'; }
function clearChannel(k){ const a=banks[curBank][k]; for(let s=0;s<STEPS;s++)a[idx(s)]=0; saveLocal(); refresh(); }
function clearPreset(){ for(const ch of CH){ const a=banks[curBank][ch.key]; for(let s=0;s<STEPS;s++)a[idx(s)]=0; } saveLocal(); refresh(); }
function refresh(){
  document.querySelectorAll('.pad').forEach(p=>p.classList.toggle('on',!!banks[curBank][p.dataset.ch][idx(+p.dataset.s)]));
  document.querySelectorAll('.pcell').forEach(c=>{ const f=banks[curBank][c.dataset.pitch][idx(+c.dataset.s)]/31;
    c.firstChild.style.bottom=(2+Math.round(f*40))+'px'; });   // thumb del fader (celda 51px: recorrido 40px)
  document.querySelectorAll('#banksel .sel').forEach(b=>b.classList.toggle('active',+b.dataset.idx===curBank));
  document.querySelectorAll('#presetsel .sel').forEach(b=>b.classList.toggle('active',+b.dataset.idx===curPreset));
  if(previewSrc) schedulePreviewUpdate();   // en vivo: edicion re-renderiza al toque; banco/preset entra al paso 0
}
let previewUpd=0;
function schedulePreviewUpdate(){ clearTimeout(previewUpd); previewUpd=setTimeout(()=>{ if(!previewSrc) return;
  if(playingBank!==curBank||playingPreset!==curPreset) queuePreviewSwitch(); else playPreview(true); },120); }
function buildSelectors(){ const mk=(host,onPick)=>{ host.innerHTML=''; SELBTNS.forEach((s,pos)=>{ const b=document.createElement('button');
    b.className='sel'; b.style.setProperty('--c',s.hex); b.textContent=pos+1; b.title=s.color; b.dataset.idx=s.idx;
    b.addEventListener('click',()=>{onPick(s.idx);refresh();}); host.appendChild(b); }); };
  mk($('banksel'),i=>{curBank=i;}); mk($('presetsel'),i=>{curPreset=i;}); }

/* ---------- Grabar (samples + presets juntos) ---------- */
async function run(factory=false){
  if(!('serial' in navigator)){ log('Tu navegador no soporta Web Serial (Chrome/Edge/Opera desktop).','err'); return; }
  if(factory && !confirm('Esto graba en la placa los sonidos y presets ORIGINALES de fábrica, descartando lo que tengas editado en Samples/Secuencias. ¿Continuar?')) return;
  stopPreview(); setBusy(true); setProgress(0); $('log').innerHTML='';
  const verify=$('verify').checked, invert=$('invert').checked;
  const baudSel=$('baud').value, bauds=baudSel==='auto'?[115200,57600]:[parseInt(baudSel,10)];
  let image;
  try{ image=parseIntelHex(window.FIRMWARE_STUDIO_HEX);
    if(factory){ log('Imagen de fábrica: sonidos y presets originales tal cual (sin tus ediciones).'); }
    else { patchSamples(image); const ver=patchPresets(image);
      const cs=SAMPLE_ORDER.filter(v=>voiceData[v]); log('Imagen lista: samples propios ['+(cs.length?cs.join(','):'ninguno')+'], 4 bancos, version '+ver+'.'); } }
  catch(e){ log('Error preparando imagen: '+e.message,'err'); setBusy(false); return; }
  try{
    port=await navigator.serial.requestPort(); let synced=false;
    for(const baud of bauds){ log('Abriendo a '+baud+'...'); await port.open({baudRate:baud}); writer=port.writable.getWriter(); startReadLoop();
      synced=await syncRetries(invert,bauds.length>1?3:4); if(synced){ log('Bootloader OK a '+baud+'.','ok'); break; }
      log('Sin respuesta a '+baud+'.','warn'); readLoopRunning=false; try{if(reader)await reader.cancel();}catch(_){ } try{if(writer)writer.releaseLock();}catch(_){ } try{await port.close();}catch(_){ } writer=null; await sleep(250); }
    if(!synced){ log('No respondió el bootloader. Prueba marcar "Invertir reset".','err'); return; }
    try{ const sig=await cmd([STK.READ_SIGN],3); const ok=EXPECTED_SIG.every((x,i)=>x===sig[i]);
      log('Firma: '+sig.map(b=>'0x'+b.toString(16).padStart(2,'0')).join(' ')+(ok?' (OK)':' (NO)'),ok?'ok':'warn');
      if(!ok&&!confirm('Firma no coincide. ¿Continuar?'))throw new Error('cancelado'); }catch(e){ log('Firma: '+e.message,'warn'); }
    await cmd([STK.ENTER_PROGMODE]); log(factory?'Grabando firmware de fábrica...':'Grabando samples + secuencias...'); const t0=Date.now();
    for(let addr=0;addr<image.length;addr+=PAGE){ const pg=image.subarray(addr,addr+PAGE); await loadAddr(addr>>1); await progPage(pg);
      if(verify){ await loadAddr(addr>>1); const bk=await readPg(PAGE); for(let i=0;i<PAGE;i++)if(bk[i]!==pg[i])throw new Error('verif falló en 0x'+(addr+i).toString(16)); }
      setProgress((addr+PAGE)/image.length); }
    await cmd([STK.LEAVE_PROGMODE]); setProgress(1);
    log('¡Grabado en '+((Date.now()-t0)/1000).toFixed(1)+' s! 🎶 La placa reinicia (~3 s) '+(factory?'con los sonidos y presets de fábrica.':'con tus samples y secuencias.'),'ok');
  }catch(e){ log('Error: '+e.message,'err'); }
  finally{ readLoopRunning=false; try{if(reader)await reader.cancel();}catch(_){ } try{if(writer)writer.releaseLock();}catch(_){ } try{if(port)await port.close();}catch(_){ } port=null; writer=null; setBusy(false); }
}

/* ---------- init ---------- */
window.addEventListener('DOMContentLoaded',()=>{
  try{ baseImage=parseIntelHex(window.FIRMWARE_STUDIO_HEX); factorySamples=readSamples(baseImage); loadBanks(baseImage); }
  catch(e){ log('Error leyendo firmware base: '+e.message,'err'); }
  loadLocal();   // restaura proyecto si hay
  buildSelectors(); buildGrid(); refresh(); refreshSamples();
  for(const v of SAMPLE_ORDER){ $('file_'+v).addEventListener('change',e=>onPickSample(v,e.target.files[0])); $('clear_'+v).addEventListener('click',()=>clearSample(v)); }
  $('clearPreset').addEventListener('click',clearPreset);
  $('playBtn').addEventListener('click',togglePreview);
  $('flashBtn').addEventListener('click',()=>run(false));
  $('flashFactoryBtn').addEventListener('click',()=>run(true));
  $('exportBtn').addEventListener('click',exportProject);
  $('importFile').addEventListener('change',e=>{ if(e.target.files[0]) importProject(e.target.files[0]); });
  document.querySelectorAll('.tb').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.tab)));
  showTab('seq');
  $('meta').textContent='studio · banco '+M.sample_total+' B · 4×4 presets · '+SR+' Hz · build '+M.built;
});
