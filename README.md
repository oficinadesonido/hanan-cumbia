# HANAN CUMBIA · Batería electrónica (Arduino Nano)

![HANAN CUMBIA](webflasher/hanan_micro.png)

Firmware de caja de ritmos / batería electrónica para **Arduino Nano (ATmega328P)**,
usado en los talleres de **oficinadesonido.org**. Síntesis por wavetable con salida a
un DAC externo **MCP4901** por SPI. Basado en el firmware original `HTRCMB_10`.

## 🔥 Web Flasher (grabar el firmware desde el navegador)

👉 **https://oficinadesonido.github.io/hanan-cumbia/webflasher/**

Conectá el Nano por USB y grabá el firmware directamente desde Chrome / Edge / Opera
de escritorio (Web Serial API, sobre HTTPS). No requiere instalar nada.

> Si el bootloader no responde, marcá **"Invertir reset (DTR/RTS)"** y reintentá.
> No funciona en Firefox/Safari ni en móvil (no soportan Web Serial).

## Estructura

```
hanan26Taller/     Firmware del taller 2026 (versión actual)
webflasher/        Web flasher (HTML/JS, Web Serial + STK500v1)
pot_serial_test/   Sketch de diagnóstico de potenciómetros (por serial)
```

## Cambios respecto al firmware original

- **Fix de tempo (pitch ⇒ BPM):** el secuenciador se clockeaba con `micros()`, que
  bajo la carga de la ISR de audio perdía tiempo y, con el pitch al mínimo,
  ralentizaba todo el patrón. Ahora el tempo se cuenta con un reloj estable dentro
  de la propia ISR de audio (`audioclock`), inmune a la carga de CPU.
- **BPM por defecto = 90** (`taptempo = 480e6 / BPM`, grid de 8 pasos por negra).
- **Potenciómetros invertidos** (A0/A1): `1023 - analogRead(x)`.
- **A14 neutralizado:** esta placa tiene solo 2 potes; A14 quedaba flotando y metía
  un tempo basura al tocar *tap*. Desactivado; el tempo se ajusta con *tap-tempo*
  (shift + tap).
- **Piso de pitch en A1:** el incremento de fase nunca baja de 21, para que el sample
  siempre se reproduzca completo y no quede "flotando".

## Compilar / cargar manualmente

```bash
arduino-cli compile --fqbn arduino:avr:nano hanan26Taller
arduino-cli upload  --fqbn arduino:avr:nano -p /dev/ttyUSB0 hanan26Taller
```

Requiere el core `arduino:avr` y las librerías `Bounce` y `DAC_MCP49xx`.

---
🤖 Mantenido con ayuda de [Claude Code](https://claude.com/claude-code) · oficinadesonido.org
