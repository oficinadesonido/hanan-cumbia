/* HANAN CUMBIA — Sampler: carga tus propios samples y graba el firmware.
 * Parchea el "banco de samples" del firmware (firmware_bank.js) en el navegador
 * y lo flashea por Web Serial (STK500v1, con auto-deteccion de baud).
 * Sin backend: todo ocurre del lado cliente (funciona en GitHub Pages).
 */
'use strict';

const STK = {
  OK: 0x10, INSYNC: 0x14, CRC_EOP: 0x20,
  GET_SYNC: 0x30, ENTER_PROGMODE: 0x50, LEAVE_PROGMODE: 0x51,
  LOAD_ADDRESS: 0x55, PROG_PAGE: 0x64, READ_PAGE: 0x74, READ_SIGN: 0x75,
};
const PAGE_SIZE = 128;
const EXPECTED_SIG = [0x1e, 0x95, 0x0f];
const MAGIC = [0x48,0x4E,0x53,0x42,0x31,0xA5,0x5A,0x3C];
const VOICES = ['kick','snare','hat','bass'];
const LABELS = { kick:'Kick', snare:'Snare/Clap', hat:'Hat/Tick', bass:'Bass' };

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let port=null, reader=null, writer=null;
let rxQueue=[], rxWaiters=[], readLoopRunning=false;

let defaultVoices = {};          // {voz: Uint8Array}  (samples de fabrica)
let voiceData = { kick:null, snare:null, hat:null, bass:null }; // null = usar default

function log(msg, cls){ const el=$('log'); const d=document.createElement('div');
  if(cls) d.className=cls; d.textContent=msg; el.appendChild(d); el.scrollTop=el.scrollHeight; }
function setProgress(p){ $('bar').style.width=Math.round(p*100)+'%'; $('bar').textContent=Math.round(p*100)+'%'; }
function setBusy(b){ $('flashBtn').disabled=b; }

/* ---------- Web Serial I/O ---------- */
async function startReadLoop(){
  readLoopRunning=true;
  try{
    while(port && port.readable && readLoopRunning){
      reader=port.readable.getReader();
      try{
        while(true){
          const {value,done}=await reader.read();
          if(done) break;
          if(value && value.length){
            for(const b of value) rxQueue.push(b);
            while(rxWaiters.length && rxQueue.length>=rxWaiters[0].n){
              const w=rxWaiters.shift(); w.resolve(rxQueue.splice(0,w.n));
            }
          }
        }
      } finally { reader.releaseLock(); reader=null; }
    }
  } catch(e){}
}
function readBytes(n, timeoutMs=1500){
  if(rxQueue.length>=n) return Promise.resolve(rxQueue.splice(0,n));
  return new Promise((resolve,reject)=>{
    const waiter={n,resolve,reject};
    rxWaiters.push(waiter);
    waiter.timer=setTimeout(()=>{ const i=rxWaiters.indexOf(waiter); if(i>=0) rxWaiters.splice(i,1);
      reject(new Error('timeout esperando '+n+' byte(s)')); }, timeoutMs);
    const orig=waiter.resolve; waiter.resolve=(v)=>{ clearTimeout(waiter.timer); orig(v); };
  });
}
function flushInput(){ rxQueue=[]; }
async function write(bytes){ await writer.write(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)); }

/* ---------- Reset + STK500v1 ---------- */
async function resetBoard(invert){
  const A=!invert, D=!!invert;
  try{
    await port.setSignals({dataTerminalReady:D, requestToSend:D}); await sleep(250);
    await port.setSignals({dataTerminalReady:A, requestToSend:A}); await sleep(50);
  } catch(e){ log('Aviso: setSignals fallo ('+e.message+').','warn'); }
  flushInput();
}
async function cmd(payload, respLen=0, timeout=1500){
  flushInput();
  await write(new Uint8Array([...payload, STK.CRC_EOP]));
  const head=await readBytes(1,timeout);
  if(head[0]!==STK.INSYNC) throw new Error('sin INSYNC (0x'+head[0].toString(16)+')');
  let data=[]; if(respLen>0) data=await readBytes(respLen,timeout);
  const tail=await readBytes(1,timeout);
  if(tail[0]!==STK.OK) throw new Error('sin OK (0x'+tail[0].toString(16)+')');
  return data;
}
async function getSync(){
  flushInput();
  await write(new Uint8Array([STK.GET_SYNC, STK.CRC_EOP]));
  const head=await readBytes(1,400); if(head[0]!==STK.INSYNC) throw new Error('resp 0x'+head[0].toString(16));
  const tail=await readBytes(1,400); if(tail[0]!==STK.OK) throw new Error('no OK');
}
async function syncWithRetries(invert, attempts=4){
  for(let a=1;a<=attempts;a++){
    log('Reseteando e intentando sincronizar (intento '+a+')...');
    await resetBoard(invert);
    const deadline=Date.now()+1200;
    while(Date.now()<deadline){
      try{ await getSync(); log('Sincronizado con el bootloader.','ok'); return true; }
      catch(e){ flushInput(); await sleep(50); }
    }
  }
  return false;
}
async function loadAddress(wordAddr){ await cmd([STK.LOAD_ADDRESS, wordAddr&0xff, (wordAddr>>8)&0xff]); }
async function progPage(bytes){ await cmd([STK.PROG_PAGE,(bytes.length>>8)&0xff,bytes.length&0xff,0x46,...bytes]); }
async function readPage(len){ return await cmd([STK.READ_PAGE,(len>>8)&0xff,len&0xff,0x46],len); }

/* ---------- Intel HEX ---------- */
function parseIntelHex(text){
  const data=new Map(); let base=0,max=0;
  for(const raw of text.split(/\r?\n/)){ const ln=raw.trim(); if(!ln||ln[0]!==':')continue;
    const len=parseInt(ln.substr(1,2),16), a=parseInt(ln.substr(3,4),16), ty=parseInt(ln.substr(7,2),16);
    if(ty===0){ for(let i=0;i<len;i++){ const ad=base+a+i; data.set(ad,parseInt(ln.substr(9+i*2,2),16)); if(ad>max)max=ad; } }
    else if(ty===2) base=parseInt(ln.substr(9,4),16)<<4;
    else if(ty===4) base=parseInt(ln.substr(9,4),16)<<16;
    else if(ty===1) break;
  }
  let size=max+1; if(size%PAGE_SIZE) size+=PAGE_SIZE-(size%PAGE_SIZE);
  const out=new Uint8Array(size).fill(0xff); for(const[k,v]of data) out[k]=v; return out;
}

/* ---------- Banco de samples ---------- */
function findMagic(img){
  for(let i=0;i<=img.length-8;i++){ let ok=true;
    for(let j=0;j<8;j++) if(img[i+j]!==MAGIC[j]){ ok=false; break; }
    if(ok) return i; }
  return -1;
}
function readDefaults(img, bankStart){
  const d=bankStart+8, r16=(o)=>img[o]|(img[o+1]<<8), res={};
  for(let i=0;i<4;i++){ const off=r16(d+i*4), len=r16(d+i*4+2);
    res[VOICES[i]]=img.slice(bankStart+off, bankStart+off+len); }
  return res;
}
function effective(v){ return voiceData[v] || defaultVoices[v]; }
function dataCap(){ return window.FIRMWARE_BANK_META.bank_total - window.FIRMWARE_BANK_META.bank_header; }
function usedBytes(){ return VOICES.reduce((s,v)=>s+effective(v).length,0); }

function patchBank(img, bankStart){
  const HEADER=window.FIRMWARE_BANK_META.bank_header, TOTAL=window.FIRMWARE_BANK_META.bank_total;
  if(usedBytes()>dataCap()) throw new Error('los samples exceden el banco ('+usedBytes()+' > '+dataCap()+' bytes)');
  let off=HEADER; const desc=[], chunks=[];
  for(const v of VOICES){ const bytes=effective(v); desc.push({off,len:bytes.length}); chunks.push(bytes); off+=bytes.length; }
  const d=bankStart+8;
  for(let i=0;i<4;i++){ img[d+i*4]=desc[i].off&0xff; img[d+i*4+1]=(desc[i].off>>8)&0xff;
    img[d+i*4+2]=desc[i].len&0xff; img[d+i*4+3]=(desc[i].len>>8)&0xff; }
  let p=bankStart+HEADER;
  for(const c of chunks){ img.set(c,p); p+=c.length; }
  for(let q=p;q<bankStart+TOTAL;q++) img[q]=0;
}

/* ---------- WAV -> sample (resample 9804 Hz, 8-bit, centrado en 127) ---------- */
async function wavToVoice(arrayBuffer){
  const AC=window.AudioContext||window.webkitAudioContext;
  const ac=new AC();
  let dec;
  try{ dec=await ac.decodeAudioData(arrayBuffer.slice(0)); } finally{ if(ac.close) ac.close(); }
  const n0=dec.length, chs=dec.numberOfChannels, mono=new Float32Array(n0);
  for(let c=0;c<chs;c++){ const ch=dec.getChannelData(c); for(let i=0;i<n0;i++) mono[i]+=ch[i]/chs; }
  const SR=window.FIRMWARE_BANK_META.sr;
  const newLen=Math.max(1, Math.round(n0*SR/dec.sampleRate));
  const OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext;
  const oac=new OAC(1,newLen,SR);
  const buf=oac.createBuffer(1,n0,dec.sampleRate); buf.copyToChannel(mono,0);
  const src=oac.createBufferSource(); src.buffer=buf; src.connect(oac.destination); src.start();
  const rendered=await oac.startRendering(); const fl=rendered.getChannelData(0);
  let peak=0; for(let i=0;i<fl.length;i++){ const x=Math.abs(fl[i]); if(x>peak)peak=x; }
  const norm=($('normalize').checked && peak>0)?1/peak:1;
  const out=new Uint8Array(fl.length);
  for(let i=0;i<fl.length;i++){ let v=Math.round(fl[i]*norm*127)+127; out[i]=v<0?0:v>255?255:v; }
  return out;
}

/* ---------- UI ---------- */
function fmt(bytes){ return bytes+' B · '+(bytes/window.FIRMWARE_BANK_META.sr).toFixed(2)+' s'; }
function updateBudget(){
  for(const v of VOICES){
    const lbl=$('len_'+v); const custom=!!voiceData[v];
    lbl.textContent=(custom?'★ ':'(fábrica) ')+fmt(effective(v).length);
    lbl.className='vlen'+(custom?' custom':'');
  }
  const used=usedBytes(), cap=dataCap(), pct=Math.min(1,used/cap);
  $('budgetBar').style.width=Math.round(pct*100)+'%';
  $('budgetBar').style.background = used>cap ? 'var(--err)' : 'linear-gradient(90deg,var(--pink),var(--yellow))';
  $('budgetTxt').textContent=used+' / '+cap+' bytes  ('+(used/window.FIRMWARE_BANK_META.sr).toFixed(2)+' / '+(cap/window.FIRMWARE_BANK_META.sr).toFixed(2)+' s)';
  $('flashBtn').disabled = used>cap;
  $('budgetTxt').className = used>cap ? 'err' : '';
}
async function onPick(v, file){
  if(!file) return;
  try{
    log('Procesando '+LABELS[v]+': '+file.name+' ...');
    const ab=await file.arrayBuffer();
    let bytes=await wavToVoice(ab);
    // recortar a lo que quepa con las otras voces
    const otros=VOICES.filter(x=>x!==v).reduce((s,x)=>s+effective(x).length,0);
    const allow=dataCap()-otros;
    if(bytes.length>allow){ log('  recortado a '+allow+' bytes para entrar en el banco.','warn'); bytes=bytes.slice(0,Math.max(0,allow)); }
    voiceData[v]=bytes;
    log('  '+LABELS[v]+' listo: '+fmt(bytes.length),'ok');
    updateBudget();
  }catch(e){ log('Error con '+LABELS[v]+': '+e.message,'err'); }
}
function clearVoice(v){ voiceData[v]=null; $('file_'+v).value=''; updateBudget(); log(LABELS[v]+' vuelto a fábrica.'); }

/* ---------- Flujo de grabado ---------- */
async function run(){
  if(!('serial' in navigator)){ log('Tu navegador no soporta Web Serial. Usa Chrome/Edge/Opera de escritorio.','err'); return; }
  setBusy(true); setProgress(0); $('log').innerHTML='';
  const verify=$('verify').checked, invert=$('invert').checked;
  const baudSel=$('baud')?$('baud').value:'auto';
  const bauds=baudSel==='auto'?[115200,57600]:[parseInt(baudSel,10)];

  // 1) preparar imagen parcheada
  let image;
  try{
    image=parseIntelHex(window.FIRMWARE_BANK_HEX);
    const bs=findMagic(image);
    if(bs<0) throw new Error('no se encontró el banco (magic) en el firmware');
    patchBank(image,bs);
    const custom=VOICES.filter(v=>voiceData[v]).map(v=>LABELS[v]);
    log('Imagen lista. Samples propios: '+(custom.length?custom.join(', '):'ninguno (todo fábrica)')+'. Usado: '+usedBytes()+'/'+dataCap()+' B.');
  }catch(e){ log('Error preparando imagen: '+e.message,'err'); setBusy(false); return; }

  // 2) conectar + sync (con fallback de baud) + grabar
  try{
    port=await navigator.serial.requestPort();
    let synced=false;
    for(const baud of bauds){
      log('Abriendo puerto a '+baud+' baudios...');
      await port.open({baudRate:baud});
      writer=port.writable.getWriter(); startReadLoop();
      synced=await syncWithRetries(invert, bauds.length>1?3:4);
      if(synced){ log('Bootloader sincronizado a '+baud+' baudios.','ok'); break; }
      const last=baud===bauds[bauds.length-1];
      log('Sin respuesta a '+baud+'.'+(last?'':' Probando otra velocidad...'),'warn');
      readLoopRunning=false;
      try{ if(reader) await reader.cancel(); }catch(_){}
      try{ if(writer) writer.releaseLock(); }catch(_){}
      try{ await port.close(); }catch(_){}
      writer=null; await sleep(250);
    }
    if(!synced){ log('No respondió el bootloader. Probá "Invertir reset" y verificá que nada más use el puerto.','err'); return; }

    // firma
    try{ const sig=await cmd([STK.READ_SIGN],3);
      const ok=EXPECTED_SIG.every((x,i)=>x===sig[i]);
      log('Firma: '+sig.map(b=>'0x'+b.toString(16).padStart(2,'0')).join(' ')+(ok?'  (ATmega328P)':'  (NO coincide!)'), ok?'ok':'warn');
      if(!ok && !confirm('La firma no coincide con ATmega328P. ¿Continuar?')) throw new Error('cancelado por firma');
    }catch(e){ log('No se pudo leer firma: '+e.message+' (continuo).','warn'); }

    await cmd([STK.ENTER_PROGMODE]);
    log('Grabando flash...');
    const t0=Date.now();
    for(let addr=0;addr<image.length;addr+=PAGE_SIZE){
      const page=image.subarray(addr,addr+PAGE_SIZE);
      await loadAddress(addr>>1); await progPage(page);
      if(verify){ await loadAddress(addr>>1); const back=await readPage(PAGE_SIZE);
        for(let i=0;i<PAGE_SIZE;i++) if(back[i]!==page[i]) throw new Error('verificación falló en 0x'+(addr+i).toString(16)); }
      setProgress((addr+PAGE_SIZE)/image.length);
    }
    await cmd([STK.LEAVE_PROGMODE]); setProgress(1);
    log('¡Firmware con tus samples grabado en '+((Date.now()-t0)/1000).toFixed(1)+' s! 🎶','ok');
    log('La placa se reinicia y suena con tus samples.','ok');
  }catch(e){ log('Error: '+e.message,'err'); }
  finally{
    readLoopRunning=false;
    try{ if(reader) await reader.cancel(); }catch(_){}
    try{ if(writer) writer.releaseLock(); }catch(_){}
    try{ if(port) await port.close(); }catch(_){}
    port=null; writer=null; setBusy(false);
  }
}

/* ---------- init ---------- */
window.addEventListener('DOMContentLoaded', ()=>{
  // cargar samples de fabrica desde la imagen base
  try{
    const img=parseIntelHex(window.FIRMWARE_BANK_HEX);
    const bs=findMagic(img);
    if(bs<0){ log('Firmware base sin banco de samples.','err'); }
    else { defaultVoices=readDefaults(img,bs); }
  }catch(e){ log('Error leyendo firmware base: '+e.message,'err'); }
  // wire UI
  for(const v of VOICES){
    $('file_'+v).addEventListener('change', (e)=>onPick(v, e.target.files[0]));
    $('clear_'+v).addEventListener('click', ()=>clearVoice(v));
  }
  $('flashBtn').addEventListener('click', run);
  $('meta').textContent='banco '+window.FIRMWARE_BANK_META.bank_total+' B · '+window.FIRMWARE_BANK_META.sr+' Hz · 8-bit mono · build '+window.FIRMWARE_BANK_META.built;
  updateBudget();
});
