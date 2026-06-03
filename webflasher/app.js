/* HANAN CUMBIA — Web Flasher para Arduino Nano (optiboot / STK500v1)
 * Usa la Web Serial API (Chrome / Edge / Opera de escritorio, vía HTTPS o file://).
 * Flashea el firmware embebido en firmware.js sobre el bootloader del Nano.
 */
'use strict';

const STK = {
  OK: 0x10, INSYNC: 0x14, CRC_EOP: 0x20,
  GET_SYNC: 0x30, GET_PARAMETER: 0x41,
  ENTER_PROGMODE: 0x50, LEAVE_PROGMODE: 0x51,
  LOAD_ADDRESS: 0x55, PROG_PAGE: 0x64, READ_PAGE: 0x74, READ_SIGN: 0x75,
};
const PAGE_SIZE = 128;                 // pagina de flash del ATmega328
const EXPECTED_SIG = [0x1e, 0x95, 0x0f]; // ATmega328P

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let port = null;
let reader = null;
let writer = null;
let rxQueue = [];
let rxWaiters = [];
let readLoopRunning = false;

function log(msg, cls) {
  const el = $('log');
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = msg;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}
function setProgress(p) {
  $('bar').style.width = Math.round(p * 100) + '%';
  $('bar').textContent = Math.round(p * 100) + '%';
}
function setBusy(b) {
  $('flashBtn').disabled = b;
}

/* ---------- Web Serial I/O ---------- */
async function startReadLoop() {
  readLoopRunning = true;
  try {
    while (port && port.readable && readLoopRunning) {
      reader = port.readable.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value && value.length) {
            for (const b of value) rxQueue.push(b);
            // despierta a quien espere bytes
            while (rxWaiters.length && rxQueue.length >= rxWaiters[0].n) {
              const w = rxWaiters.shift();
              w.resolve(rxQueue.splice(0, w.n));
            }
          }
        }
      } finally {
        reader.releaseLock();
        reader = null;
      }
    }
  } catch (e) {
    // se cierra al desconectar; silencioso
  }
}

function readBytes(n, timeoutMs = 1500) {
  if (rxQueue.length >= n) return Promise.resolve(rxQueue.splice(0, n));
  return new Promise((resolve, reject) => {
    const waiter = { n, resolve, reject };
    rxWaiters.push(waiter);
    waiter.timer = setTimeout(() => {
      const i = rxWaiters.indexOf(waiter);
      if (i >= 0) rxWaiters.splice(i, 1);
      reject(new Error('timeout esperando ' + n + ' byte(s)'));
    }, timeoutMs);
    const origResolve = waiter.resolve;
    waiter.resolve = (v) => { clearTimeout(waiter.timer); origResolve(v); };
  });
}
function flushInput() { rxQueue = []; }

async function write(bytes) {
  await writer.write(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
}

/* ---------- Reset del Nano (auto-reset por DTR/RTS) ---------- */
async function resetBoard(invert) {
  // Replica la secuencia de avrdude (programmer "arduino"): descarga el cap del
  // auto-reset (DTR/RTS desactivados ~250 ms) y luego los activa, generando el
  // flanco que reinicia el MCU y abre la ventana del bootloader (~1 s).
  // La polaridad fisica varia segun el chip USB-serial; por eso se puede invertir.
  const A = !invert;   // estado "activado"
  const D = !!invert;  // estado "desactivado"
  try {
    await port.setSignals({ dataTerminalReady: D, requestToSend: D });
    await sleep(250);
    await port.setSignals({ dataTerminalReady: A, requestToSend: A });
    await sleep(50);
  } catch (e) {
    log('Aviso: setSignals fallo (' + e.message + '). Probare igual.', 'warn');
  }
  flushInput();
}

/* ---------- Protocolo STK500v1 ---------- */
async function cmd(payload, respLen = 0, timeout = 1500) {
  flushInput();
  await write(new Uint8Array([...payload, STK.CRC_EOP]));
  const head = await readBytes(1, timeout);
  if (head[0] !== STK.INSYNC) throw new Error('sin INSYNC (recibido 0x' + head[0].toString(16) + ')');
  let data = [];
  if (respLen > 0) data = await readBytes(respLen, timeout);
  const tail = await readBytes(1, timeout);
  if (tail[0] !== STK.OK) throw new Error('sin OK (recibido 0x' + tail[0].toString(16) + ')');
  return data;
}

async function getSync() {
  flushInput();
  await write(new Uint8Array([STK.GET_SYNC, STK.CRC_EOP]));
  const head = await readBytes(1, 400);
  if (head[0] !== STK.INSYNC) throw new Error('respuesta inesperada 0x' + head[0].toString(16));
  const tail = await readBytes(1, 400);
  if (tail[0] !== STK.OK) throw new Error('no OK tras sync');
}

async function syncWithRetries(invert, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    log('Reseteando placa e intentando sincronizar (intento ' + attempt + ')...');
    await resetBoard(invert);
    const deadline = Date.now() + 1200;
    while (Date.now() < deadline) {
      try {
        await getSync();
        log('Sincronizado con el bootloader.', 'ok');
        return true;
      } catch (e) {
        flushInput();
        await sleep(50);
      }
    }
  }
  return false;
}

async function readSignature() {
  const sig = await cmd([STK.READ_SIGN], 3);
  return sig;
}

async function loadAddress(wordAddr) {
  await cmd([STK.LOAD_ADDRESS, wordAddr & 0xff, (wordAddr >> 8) & 0xff]);
}
async function progPage(bytes) {
  const len = bytes.length;
  await cmd([STK.PROG_PAGE, (len >> 8) & 0xff, len & 0xff, 0x46, ...bytes]);
}
async function readPage(len) {
  return await cmd([STK.READ_PAGE, (len >> 8) & 0xff, len & 0xff, 0x46], len);
}

/* ---------- Intel HEX ---------- */
function parseIntelHex(text) {
  const data = new Map();
  let base = 0, maxAddr = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] !== ':') continue;
    const len = parseInt(line.substr(1, 2), 16);
    const addr = parseInt(line.substr(3, 4), 16);
    const type = parseInt(line.substr(7, 2), 16);
    if (type === 0x00) {
      for (let i = 0; i < len; i++) {
        const a = base + addr + i;
        data.set(a, parseInt(line.substr(9 + i * 2, 2), 16));
        if (a > maxAddr) maxAddr = a;
      }
    } else if (type === 0x02) {
      base = parseInt(line.substr(9, 4), 16) << 4;
    } else if (type === 0x04) {
      base = parseInt(line.substr(9, 4), 16) << 16;
    } else if (type === 0x01) {
      break;
    }
  }
  // rellena hasta limite de pagina con 0xFF
  let size = maxAddr + 1;
  if (size % PAGE_SIZE) size += PAGE_SIZE - (size % PAGE_SIZE);
  const out = new Uint8Array(size).fill(0xff);
  for (const [a, b] of data) out[a] = b;
  return out;
}

/* ---------- Flujo principal ---------- */
async function flashFirmware() {
  const verify = $('verify').checked;
  const invert = $('invert').checked;
  const firmware = parseIntelHex(window.FIRMWARE_HEX);
  log('Firmware: ' + firmware.length + ' bytes (' +
      (firmware.length / PAGE_SIZE) + ' paginas).');

  if (!syncOk()) return;

  // firma
  try {
    const sig = await readSignature();
    const hex = sig.map((b) => '0x' + b.toString(16).padStart(2, '0')).join(' ');
    const match = EXPECTED_SIG.every((v, i) => v === sig[i]);
    log('Firma del chip: ' + hex + (match ? '  (ATmega328P OK)' : '  (NO coincide!)'),
        match ? 'ok' : 'warn');
    if (!match && !confirm('La firma no coincide con ATmega328P. ¿Continuar igual?')) {
      throw new Error('cancelado por firma');
    }
  } catch (e) {
    log('No se pudo leer la firma: ' + e.message + ' (continuo).', 'warn');
  }

  await cmd([STK.ENTER_PROGMODE]);
  log('Modo programacion activado. Escribiendo flash...');

  const t0 = Date.now();
  for (let addr = 0; addr < firmware.length; addr += PAGE_SIZE) {
    const page = firmware.subarray(addr, addr + PAGE_SIZE);
    await loadAddress(addr >> 1);            // direccion en PALABRAS
    await progPage(page);
    if (verify) {
      await loadAddress(addr >> 1);
      const back = await readPage(PAGE_SIZE);
      for (let i = 0; i < PAGE_SIZE; i++) {
        if (back[i] !== page[i]) {
          throw new Error('verificacion fallo en 0x' + (addr + i).toString(16));
        }
      }
    }
    setProgress((addr + PAGE_SIZE) / firmware.length);
  }

  await cmd([STK.LEAVE_PROGMODE]);
  setProgress(1);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  log('¡Firmware grabado' + (verify ? ' y verificado' : '') + ' en ' + secs + ' s! 🎶',
      'ok');
  log('La placa se reiniciara y empezara a sonar.', 'ok');
}

let _synced = false;
function syncOk() {
  if (!_synced) { log('Error interno: no sincronizado.', 'err'); return false; }
  return true;
}

async function run() {
  if (!('serial' in navigator)) {
    log('Tu navegador no soporta Web Serial. Usa Chrome, Edge u Opera de escritorio.', 'err');
    return;
  }
  setBusy(true);
  setProgress(0);
  $('log').innerHTML = '';
  _synced = false;
  const invert = $('invert').checked;
  const baudSel = $('baud') ? $('baud').value : 'auto';
  const bauds = baudSel === 'auto' ? [115200, 57600] : [parseInt(baudSel, 10)];
  try {
    port = await navigator.serial.requestPort();

    // Prueba cada velocidad: 115200 (bootloader nuevo) y 57600 (viejo/clon).
    for (const baud of bauds) {
      log('Abriendo puerto a ' + baud + ' baudios...');
      await port.open({ baudRate: baud });
      writer = port.writable.getWriter();
      startReadLoop();

      _synced = await syncWithRetries(invert, bauds.length > 1 ? 2 : 4);
      if (_synced) { log('Bootloader sincronizado a ' + baud + ' baudios.', 'ok'); break; }

      // sin respuesta: cerrar para reintentar a otra velocidad
      const last = baud === bauds[bauds.length - 1];
      log('Sin respuesta a ' + baud + '.' + (last ? '' : ' Probando otra velocidad...'), 'warn');
      readLoopRunning = false;
      try { if (reader) await reader.cancel(); } catch (_) {}
      try { if (writer) writer.releaseLock(); } catch (_) {}
      try { await port.close(); } catch (_) {}
      writer = null;
      await sleep(250);
    }

    if (!_synced) {
      log('No respondió el bootloader a ninguna velocidad. Marcá "Invertir reset (DTR/RTS)" ' +
          'y reintentá. Verificá que no haya otro programa usando el puerto (IDE, monitor serie).', 'err');
      return;
    }
    await flashFirmware();
  } catch (e) {
    log('Error: ' + e.message, 'err');
  } finally {
    readLoopRunning = false;
    try { if (reader) await reader.cancel(); } catch (_) {}
    try { if (writer) writer.releaseLock(); } catch (_) {}
    try { if (port) await port.close(); } catch (_) {}
    port = null; writer = null;
    setBusy(false);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  $('meta').textContent =
    window.FIRMWARE_META.name + ' · ' + window.FIRMWARE_META.flashBytes +
    ' bytes · build ' + window.FIRMWARE_META.built + ' · ' + window.FIRMWARE_META.fqbn;
  $('flashBtn').addEventListener('click', run);
});
