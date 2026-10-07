# HANAN CUMBIA · Batería electrónica (Arduino Nano)

![HANAN CUMBIA](webflasher/hanan_micro.png)

Caja de ritmos / batería electrónica tropical de **Oficina de Sonido** (desde 2020). Plataforma
**Arduino Nano (ATmega328P)** + DAC externo **MCP4901** por SPI, síntesis por wavetable.
Dos versiones de hardware con **el mismo circuito y el mismo firmware**:

| Versión | PCB | Qué es |
|---|---|---|
| **Clásica** | `hardware/hananClasicaPcb/` | 77×92 mm, 8 pulsadores en placa, jack DC 9 V, va en caja. |
| **Mini** | `hardware/hananMiniPcb/` | 150×75 mm (= panel), calado para 4 botones arcade, se alimenta por USB. Para talleres. |

El rediseño 2026 en ESP32 es otro producto: `../hanan-mk2/`.

## 🔥 Web Flasher / Hanan Estudio

👉 **https://oficinadesonido.github.io/hanan-cumbia/webflasher/** (GitHub Pages desde `main`;
todo push a `main` queda publicado al toque). Chrome/Edge/Opera de escritorio (Web Serial).
`hananFabrica/` es el flasher de fábrica (solo firmware). Notas de diseño en `webflasher/README.md`.

## Estructura

```
hardware/hananClasicaPcb/   PCB clásica v2.0 (KiCad 10)      ← ver su README
hardware/hananMiniPcb/      PCB Mini v2.0 (KiCad 10)
firmware/hanan26Taller/     Firmware actual (Taller 2026; de acá salen los builds del Estudio)
firmware/tests/             Sketches de diagnóstico (DAC, potes, pines, motor de audio)
firmware/legacy/HTRCMB_10/  Firmware original del que deriva todo (histórico)
webflasher/                 Hanan Estudio + Lab + flasher (HTML/JS, STK500v1)
hananFabrica/               Flasher de fábrica
docs/                       Revisión eléctrica, capas EasyEDA, SVG de calados del panel Mini
```

Perfil de fabricación: **tht** (JLC solo PCB, se suelda en taller). Regla: toda placa lleva en silk
`<proyecto> vX.Y AAAA-MM-DD` = nombre del zip de gerbers (title block del PCB).

## Cambios v2.0 de ambas PCB (2026-10-07)
- RC en Vref del DAC (R6 1k + C2 10 µF) y 100 nF en Vdd (C3): el ruido del USB/cargador ya no entra
  directo a la referencia del audio. Pads del LED RGB agrandados. Rótulo de versión en silk.
- Mini: los 8 pads de los cables de los botones arcade pasan a una columna de pads grandes en pares
  (blanco/rosa/amarillo/verde + GND), zona GND en toda la placa.
- Detalle y pendientes en `docs/revision-electronica-mini.md` y `hardware/hananClasicaPcb/README.md`.

## Firmware: cambios respecto al original
- **Fix de tempo (pitch ⇒ BPM):** el secuenciador se clockeaba con `micros()`, que bajo la carga de la
  ISR de audio perdía tiempo. Ahora el tempo se cuenta con un reloj estable dentro de la ISR (`audioclock`).
- **BPM por defecto = 90**; **potenciómetros invertidos** (A0/A1); **A14 neutralizado** (solo 2 potes);
  **piso de pitch en A1** para que el sample siempre suene completo.

```bash
arduino-cli compile --fqbn arduino:avr:nano firmware/hanan26Taller
arduino-cli upload  --fqbn arduino:avr:nano -p /dev/ttyUSB0 firmware/hanan26Taller
```
Requiere el core `arduino:avr` y las librerías `Bounce` y `DAC_MCP49xx`.

## Historial
El material viejo (Placa_2021, HTR_2023, hanan25, audios, códigos, backups) se movió el 2026-10-07 a
`3-archivo/hanan-cumbia-historico/` (y está en el respaldo TOSHIBA). Repo viejo `oficinadesonido/HananCumbia` (2023).

---
🤖 Mantenido con ayuda de [Claude Code](https://claude.com/claude-code) · oficinadesonido.org
