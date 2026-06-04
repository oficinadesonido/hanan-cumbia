/* HANAN CUMBIA — Editor de secuencias (presets).
 * Edita los 4 bancos x 4 presets (32 pasos x 4 canales + pitch de los melodicos),
 * parchea el bloque de presets del firmware y lo graba por Web Serial.
 * Estilo TR-808, paleta HANAN. Sin backend.
 */
'use strict';

const STK = { OK:0x10, INSYNC:0x14, CRC_EOP:0x20, GET_SYNC:0x30, ENTER_PROGMODE:0x50,
  LEAVE_PROGMODE:0x51, LOAD_ADDRESS:0x55, PROG_PAGE:0x64, READ_PAGE:0x74, READ_SIGN:0x75 };
const PAGE_SIZE = 128;
const EXPECTED_SIG = [0x1e,0x95,0x0f];

const PM = window.FIRMWARE_PRESETS_META;
const STEPS = 32, NBANKS = 4, NPRESETS = 4, BANKSTEPS = 128;
const CHANNELS = [
  { key:'B1', name:'Conga',   pitch:'F1' },
  { key:'B2', name:'Campana', pitch:'F2' },
  { key:'B3', name:'Huiro',   pitch:null },
  { key:'B4', name:'Bombo',   pitch:null },
];
const COLORS = ['azul','amarillo','rojo','verde'];
const COLORHEX = { azul:'#2f7bff', amarillo:'#ffd400', rojo:'#ff2e63', verde:'#3ddc84' };

const $ = (id)=>document.getElementById(id);
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

let port=null,reader=null,writer=null,rxQueue=[],rxWaiters=[],readLoopRunning=false;
let banks=[];           // banks[b] = {B1:Uint8,B2,B3,B4,F1,F2} (128 c/u; F = nivel 0-31)
let curBank=0, curPreset=0;

function log(m,c){ const e=$('log'),d=document.createElement('div'); if(c)d.className=c; d.textContent=m; e.appendChild(d); e.scrollTop=e.scrollHeight; }
function setProgress(p){ $('bar').style.width=Math.round(p*100)+'%'; $('bar').textContent=Math.round(p*100)+'%'; }
function setBusy(b){ $('flashBtn').disabled=b; }

/* ---------- Web Serial + STK500 (igual que el sampler) ---------- */
async function startReadLoop(){ readLoopRunning=true;
  try{ while(port&&port.readable&&readLoopRunning){ reader=port.readable.getReader();
    try{ while(true){ const {value,done}=await reader.read(); if(done)break;
      if(value&&value.length){ for(const b of value)rxQueue.push(b);
        while(rxWaiters.length&&rxQueue.length>=rxWaiters[0].n){ const w=rxWaiters.shift(); w.resolve(rxQueue.splice(0,w.n)); } } }
    } finally{ reader.releaseLock(); reader=null; } } } catch(e){} }
function readBytes(n,t=1500){ if(rxQueue.length>=n)return Promise.resolve(rxQueue.splice(0,n));
  return new Promise((res,rej)=>{ const w={n,resolve:res,reject:rej}; rxWaiters.push(w);
    w.timer=setTimeout(()=>{ const i=rxWaiters.indexOf(w); if(i>=0)rxWaiters.splice(i,1); rej(new Error('timeout')); },t);
    const o=w.resolve; w.resolve=(v)=>{ clearTimeout(w.timer); o(v); }; }); }
function flushInput(){ rxQueue=[]; }
async function write(b){ await writer.write(b instanceof Uint8Array?b:new Uint8Array(b)); }
async function resetBoard(inv){ const A=!inv,D=!!inv;
  try{ await port.setSignals({dataTerminalReady:D,requestToSend:D}); await sleep(250);
    await port.setSignals({dataTerminalReady:A,requestToSend:A}); await sleep(50); }catch(e){ log('setSignals: '+e.message,'warn'); }
  flushInput(); }
async function cmd(p,rl=0,t=1500){ flushInput(); await write(new Uint8Array([...p,STK.CRC_EOP]));
  const h=await readBytes(1,t); if(h[0]!==STK.INSYNC)throw new Error('sin INSYNC (0x'+h[0].toString(16)+')');
  let d=[]; if(rl>0)d=await readBytes(rl,t); const tl=await readBytes(1,t);
  if(tl[0]!==STK.OK)throw new Error('sin OK'); return d; }
async function getSync(){ flushInput(); await write(new Uint8Array([STK.GET_SYNC,STK.CRC_EOP]));
  const h=await readBytes(1,400); if(h[0]!==STK.INSYNC)throw new Error('x'); const t=await readBytes(1,400); if(t[0]!==STK.OK)throw new Error('x'); }
async function syncWithRetries(inv,att=4){ for(let a=1;a<=att;a++){ log('Reset + sync (intento '+a+')...'); await resetBoard(inv);
  const dl=Date.now()+1200; while(Date.now()<dl){ try{ await getSync(); log('Sincronizado.','ok'); return true; }catch(e){ flushInput(); await sleep(50);} } } return false; }
async function loadAddress(w){ await cmd([STK.LOAD_ADDRESS,w&0xff,(w>>8)&0xff]); }
async function progPage(b){ await cmd([STK.PROG_PAGE,(b.length>>8)&0xff,b.length&0xff,0x46,...b]); }
async function readPage(l){ return await cmd([STK.READ_PAGE,(l>>8)&0xff,l&0xff,0x46],l); }
function parseIntelHex(text){ const data=new Map(); let base=0,max=0;
  for(const raw of text.split(/\r?\n/)){ const ln=raw.trim(); if(!ln||ln[0]!==':')continue;
    const len=parseInt(ln.substr(1,2),16),a=parseInt(ln.substr(3,4),16),ty=parseInt(ln.substr(7,2),16);
    if(ty===0){ for(let i=0;i<len;i++){ const ad=base+a+i; data.set(ad,parseInt(ln.substr(9+i*2,2),16)); if(ad>max)max=ad; } }
    else if(ty===2)base=parseInt(ln.substr(9,4),16)<<4; else if(ty===4)base=parseInt(ln.substr(9,4),16)<<16; else if(ty===1)break; }
  let size=max+1; if(size%PAGE_SIZE)size+=PAGE_SIZE-(size%PAGE_SIZE);
  const out=new Uint8Array(size).fill(0xff); for(const[k,v]of data)out[k]=v; return out; }

/* ---------- Bloque de presets: decodificar / codificar ---------- */
function findMagic(img,M){ for(let i=0;i<=img.length-M.length;i++){ let ok=1; for(let j=0;j<M.length;j++)if(img[i+j]!==M[j]){ok=0;break;} if(ok)return i; } return -1; }

function makeReader(buf){ let pos=0; return (n)=>{ let v=0; for(let i=0;i<n;i++){ if((buf[pos>>3]>>(pos&7))&1)v|=(1<<i); pos++; } return v; }; }
function makeWriter(buf){ let pos=0; return (val,n)=>{ for(let i=0;i<n;i++){ const p=pos; if((val>>i)&1)buf[p>>3]|=(1<<(p&7)); else buf[p>>3]&=~(1<<(p&7)); pos++; } }; }

function decodeBank(buf){ const r=makeReader(buf), bk={};
  for(const k of ['B1','B2','B3','B4']){ bk[k]=new Uint8Array(BANKSTEPS); for(let s=0;s<BANKSTEPS;s++)bk[k][s]=r(1); }
  for(const k of ['F1','F2']){ bk[k]=new Uint8Array(BANKSTEPS); for(let s=0;s<BANKSTEPS;s++)bk[k][s]=r(5); } // nivel 0-31
  return bk; }
function encodeBank(bk){ const buf=new Uint8Array(PM.bank_bytes), w=makeWriter(buf);
  for(const k of ['B1','B2','B3','B4']) for(let s=0;s<BANKSTEPS;s++) w(bk[k][s]&1,1);
  for(const k of ['F1','F2']) for(let s=0;s<BANKSTEPS;s++) w(bk[k][s]&31,5);
  return buf; }

function loadBanksFromImage(img){ const m=findMagic(img,PM.preset_magic); if(m<0)throw new Error('no se encontró el bloque de presets');
  banks=[]; for(let b=0;b<NBANKS;b++){ const off=m+PM.preset_header+b*PM.bank_bytes; banks.push(decodeBank(img.subarray(off,off+PM.bank_bytes))); } return m; }
function patchBanksToImage(img){ const m=findMagic(img,PM.preset_magic); if(m<0)throw new Error('sin bloque de presets');
  for(let b=0;b<NBANKS;b++){ const buf=encodeBank(banks[b]); img.set(buf, m+PM.preset_header+b*PM.bank_bytes); }
  // version nueva para forzar que la placa recargue los presets desde el flash
  const ver=(Date.now()&0xffff); img[m+PM.version_off]=ver&0xff; img[m+PM.version_off+1]=(ver>>8)&0xff; return ver; }

/* ---------- UI: grilla TR-808 ---------- */
function idx(s){ return curPreset*STEPS + s; }   // indice global del paso visible s (0-31)

function buildGrid(){
  const g=$('grid'); g.innerHTML='';
  CHANNELS.forEach((ch)=>{
    const row=document.createElement('div'); row.className='row';
    const lab=document.createElement('div'); lab.className='clabel'; lab.textContent=ch.name; row.appendChild(lab);
    const pads=document.createElement('div'); pads.className='pads';
    for(let s=0;s<STEPS;s++){ const p=document.createElement('div'); p.className='pad'+(s%4===0?' beat':'')+(s%8===0?' bar':'');
      p.dataset.ch=ch.key; p.dataset.s=s;
      p.addEventListener('click',()=>{ const a=banks[curBank][ch.key]; a[idx(s)]=a[idx(s)]?0:1; refresh(); });
      pads.appendChild(p); }
    row.appendChild(pads); g.appendChild(row);
    if(ch.pitch){
      const prow=document.createElement('div'); prow.className='row pitchrow';
      const pl=document.createElement('div'); pl.className='clabel small'; pl.textContent='↳ pitch'; prow.appendChild(pl);
      const pp=document.createElement('div'); pp.className='pads';
      for(let s=0;s<STEPS;s++){ const cell=document.createElement('div'); cell.className='pcell'+(s%4===0?' beat':'')+(s%8===0?' bar':'');
        const fill=document.createElement('div'); fill.className='pfill'; cell.appendChild(fill);
        cell.dataset.s=s; cell.dataset.pitch=ch.pitch;
        const setLvl=(ev)=>{ const r=cell.getBoundingClientRect(); let f=1-((ev.clientY-r.top)/r.height); f=Math.max(0,Math.min(1,f));
          banks[curBank][ch.pitch][idx(s)]=Math.round(f*31); refresh(); };
        cell.addEventListener('pointerdown',(e)=>{ cell.setPointerCapture(e.pointerId); setLvl(e); });
        cell.addEventListener('pointermove',(e)=>{ if(e.buttons)setLvl(e); });
        pp.appendChild(cell); }
      prow.appendChild(pp); g.appendChild(prow);
    }
  });
}
function refresh(){
  // pads on/off
  document.querySelectorAll('.pad').forEach(p=>{ const on=banks[curBank][p.dataset.ch][idx(+p.dataset.s)];
    p.classList.toggle('on',!!on); });
  // pitch fills
  document.querySelectorAll('.pcell').forEach(c=>{ const lvl=banks[curBank][c.dataset.pitch][idx(+c.dataset.s)];
    c.firstChild.style.height=Math.round((lvl/31)*100)+'%'; });
  // selectores
  document.querySelectorAll('#banksel .sel').forEach((b,i)=>b.classList.toggle('active',i===curBank));
  document.querySelectorAll('#presetsel .sel').forEach((b,i)=>b.classList.toggle('active',i===curPreset));
}
function buildSelectors(){
  const mk=(host,onPick,getCur)=>{ host.innerHTML=''; COLORS.forEach((c,i)=>{ const b=document.createElement('button');
    b.className='sel'; b.style.setProperty('--c',COLORHEX[c]); b.textContent=(i+1); b.title=c;
    b.addEventListener('click',()=>{ onPick(i); refresh(); }); host.appendChild(b); }); };
  mk($('banksel'),(i)=>{curBank=i;},()=>curBank);
  mk($('presetsel'),(i)=>{curPreset=i;},()=>curPreset);
}

/* ---------- Flujo de grabado ---------- */
async function run(){
  if(!('serial' in navigator)){ log('Tu navegador no soporta Web Serial (usá Chrome/Edge/Opera de escritorio).','err'); return; }
  setBusy(true); setProgress(0); $('log').innerHTML='';
  const verify=$('verify').checked, invert=$('invert').checked;
  const baudSel=$('baud')?$('baud').value:'auto'; const bauds=baudSel==='auto'?[115200,57600]:[parseInt(baudSel,10)];
  let image;
  try{ image=parseIntelHex(window.FIRMWARE_PRESETS_HEX); const ver=patchBanksToImage(image);
    log('Imagen lista con tus 4 bancos (version '+ver+').'); }
  catch(e){ log('Error preparando imagen: '+e.message,'err'); setBusy(false); return; }
  try{
    port=await navigator.serial.requestPort();
    let synced=false;
    for(const baud of bauds){ log('Abriendo a '+baud+' baud...'); await port.open({baudRate:baud}); writer=port.writable.getWriter(); startReadLoop();
      synced=await syncWithRetries(invert,bauds.length>1?3:4); if(synced){ log('Bootloader OK a '+baud+'.','ok'); break; }
      const last=baud===bauds[bauds.length-1]; log('Sin respuesta a '+baud+'.'+(last?'':' Probando otra...'),'warn');
      readLoopRunning=false; try{if(reader)await reader.cancel();}catch(_){ } try{if(writer)writer.releaseLock();}catch(_){ } try{await port.close();}catch(_){ } writer=null; await sleep(250); }
    if(!synced){ log('No respondió el bootloader. Probá "Invertir reset".','err'); return; }
    try{ const sig=await cmd([STK.READ_SIGN],3); const ok=EXPECTED_SIG.every((x,i)=>x===sig[i]);
      log('Firma: '+sig.map(b=>'0x'+b.toString(16).padStart(2,'0')).join(' ')+(ok?' (OK)':' (NO coincide)'),ok?'ok':'warn');
      if(!ok&&!confirm('Firma no coincide. ¿Continuar?'))throw new Error('cancelado'); }catch(e){ log('Firma: '+e.message,'warn'); }
    await cmd([STK.ENTER_PROGMODE]); log('Grabando...'); const t0=Date.now();
    for(let addr=0;addr<image.length;addr+=PAGE_SIZE){ const page=image.subarray(addr,addr+PAGE_SIZE);
      await loadAddress(addr>>1); await progPage(page);
      if(verify){ await loadAddress(addr>>1); const bk=await readPage(PAGE_SIZE); for(let i=0;i<PAGE_SIZE;i++)if(bk[i]!==page[i])throw new Error('verif falló en 0x'+(addr+i).toString(16)); }
      setProgress((addr+PAGE_SIZE)/image.length); }
    await cmd([STK.LEAVE_PROGMODE]); setProgress(1);
    log('¡Presets grabados en '+((Date.now()-t0)/1000).toFixed(1)+' s! 🥁','ok');
    log('La placa reinicia y carga tus 4 bancos (tarda ~3 s la 1ra vez).','ok');
  }catch(e){ log('Error: '+e.message,'err'); }
  finally{ readLoopRunning=false; try{if(reader)await reader.cancel();}catch(_){ } try{if(writer)writer.releaseLock();}catch(_){ } try{if(port)await port.close();}catch(_){ } port=null; writer=null; setBusy(false); }
}

/* ---------- init ---------- */
window.addEventListener('DOMContentLoaded',()=>{
  try{ const img=parseIntelHex(window.FIRMWARE_PRESETS_HEX); loadBanksFromImage(img); }
  catch(e){ log('Error leyendo presets del firmware: '+e.message,'err'); }
  buildSelectors(); buildGrid(); refresh();
  $('flashBtn').addEventListener('click',run);
  $('meta').textContent='4 bancos x 4 presets · 32 pasos · build '+PM.built;
});
