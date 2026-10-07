# Revisión electrónica — hananMiniPcb (Hanan Cumbia Mini, Nano) — 2026-10-07

Fuente: netlist exportado con `kicad-cli` de `hananMiniPcb.kicad_sch` (38 nets, 23 componentes) + `hananMiniPcb.kicad_pcb`
(estado v2.0 en preparación: columna de pads para botones arcade ya hecha). Todo hallazgo nombra refs reales.
Contexto: placa THT que se suelda en taller; firmware `hanan26Taller`; se alimenta por el USB del Nano (+5V).

## 🔴 Alta (conviene resolver antes de fabricar)

1. **Cero capacitores de desacople en toda la placa.** El único cap es C1 (10 µF, acople de audio). El DAC
   MCP4901 (U1) tiene Vdd (pin 1) y **Vref (pin 6) colgados directo del +5V del USB** sin ningún cap. Vref es
   la referencia del audio: todo el ruido del USB/cargador sale por el parlante.
   **Fix:** 100 nF entre U1.1 y U1.7 (GND) pegado al chip, y 100 nF + 10 µF en Vref (U1.6). Opcional y
   mejor: RC en Vref (100 Ω serie desde +5C + 10 µF a GND) para filtrar el riel. Mínimo: 2× 100 nF disco.
   El Nano trae sus propios caps, el DAC no.

2. **Anillo anular de D1 (LED RGB) fuera de regla:** pads 1.07×1.80 mm con broca 0.9 → anillo 0.085 mm
   (regla 0.10, JLC pide ≥0.13 para PTH). Son los 4 errores de DRC que quedan. JLC fabricó P169 igual, pero
   es la pieza más propensa a fallar en producción. **Fix:** agrandar los pads del footprint
   `OdeS:LED_RGB_CATCOM_sep` a ≥1.3×2.0 mm (pitch 2.0 lo permite) o broca 0.8.

## 🟡 Media (anda, pero no es best-practice)

3. **Clock out sin resistencia serie:** `ClckOut1.1` (tip) va directo a `XA1.D12`. Un corto en el jack o un
   cable conectado a otra salida carga el pin del ATmega sin límite. **Fix:** 1 kΩ en serie (R6) entre D12 y
   el jack.
4. **Clock in sin protección:** `Clckin1.1` (tip) va directo a `XA1.A5` (comparte net con A2 y con el switch
   TAP). Un trigger Eurorack de 10 V o un pulso negativo entra crudo al pin. **Fix:** 10 kΩ en serie + el
   pull-up interno alcanza para 5 V; con clamp (dos diodos 1N4148 a +5V/GND) aguanta modular.
5. **Audio out sin filtro de reconstrucción:** `U1.8 → R3 1k → C1 10µ → Out1`. El DAC de 8 bits sale con
   escalones; un 10 nF de R3 a GND (fc ≈ 16 kHz) limpia sin cambiar el carácter lo-fi. Opcional: es
   decisión de sonido, no de seguridad.
6. **Botones arcade con pull-up interno (~35 kΩ) y cables largos:** funciona (el firmware debouncea), pero
   con 30 cm de cable es antena. Si aparecen disparos fantasma en taller: 10 kΩ externos a +5C en D3/D4/D7/D8.
   No es necesario de entrada.

## ⚪ Baja / cosmético

7. `XA1.GND2` sin conectar (el socket tiene 2 GND, solo GND1 está en la net). El módulo los une
   internamente; conectarlo cuesta una pista y mejora el retorno. Igual con el 3V3 (no se usa, OK).
8. `A2` y `A5` del Nano están en la **misma net** (clock in / tap). Hoy ambos son entradas con pull-up en el
   firmware (16 y 19) → inofensivo. Si algún día el firmware pone 16 como salida, se cortocircuitan.
   Sugerencia: quitar A2 de la net en el sch (herencia del Hanan clásico).
9. Dos vías de `Net-(J2-Pin_4)` en (74.9, 86.9) y (74.7, 78.4) con cobre en una sola capa (colgadas, vienen
   de P169). Limpiar antes del export.
10. Serigrafía de los jacks y la ref de XA1 recortadas por el borde superior (15 warnings): cosmético, el
    Nano y los jacks asoman por el borde a propósito.
11. `+9V` solo llega a `XA1.VIN`: no hay jack DC en la placa (se alimenta por USB). Dejarlo como está o
    quitar el símbolo para que no confunda.

## ✅ Revisado y OK

- SPI al DAC: `~CS` D10, SCK D13, SDI D11, `~LDAC` a GND (actualización inmediata). Correcto.
- Acople de salida: C1 polarizado con el + del lado del DAC (Vout ≈ 2.5 V DC). Polaridad bien. R2 1k a GND
  como carga del DAC, HPF con carga de 10 k ≈ 1.4 Hz.
- LED RGB cátodo común: R1/R4/R5 = 220 Ω por color en D6/D5/D9 (PWM). OK.
- Potes RV1/RV2 10 k lineales, wiper a A0/A1, extremos a +5C/GND. 10 k es lo que recomienda el AVR para el
  ADC; sin cap de filtro está bien (opcional 10 nF).
- Switches de 12 mm (shift D2, play A3, rec A4, tap A5) a GND con pull-up interno: OK, estándar.
- Jacks: ring (pin 2) sin net en los tres: correcto para mono con jack TRS. Sleeve a GND.
- Botones arcade: J2 pines 1/4/5/8 → D3/D8/D4/D7 con GND alternado; coincide con el firmware
  (bouncer1=3 cencerro, bouncer4=4 kick, bouncer2=8 conga, bouncer3=7 güiro) y con los colores del panel.
- Mecánica: 4× M3 a 4.6 mm de las esquinas, calado octogonal para los 4 arcade de 24 mm, Nano y jacks al
  borde superior.

## Falsos positivos descartados

- "Dead net" en `Net-(XA1-A5_SCL)` con el switch TAP y el jack: sí la lee el MCU (A5). No es control muerto.
- `unconnected-(XA1-RESET-*)`, `AREF`, `A6/A7`, `D0/D1`: intencionales (sin botón de reset, UART libre para
  flashear).

## Hecho en v2.0 (2026-10-07, decisión de Daniel: "las altas, versión simple con una R y 2 caps")

- **Item 1** → `R6` 1 kΩ en serie +5C→Vref (U1.6, net nueva `VREF`), `C2` 10 µF electrolítico Vref→GND
  (misma huella que C1, `CP_Radial_D4.0mm_P2.00mm`), `C3` 100 nF disco (`C_Disc_D5.0mm_W2.5mm_P5.00mm`)
  Vdd→GND. fc del RC ≈ 16 Hz. En el PCB van en cara B debajo de U1 (R6 en y 141.6, C2/C3 en y 144.6–146.6).
  El +5C que seguía hacia RV1 a través del pad 6 se reruteó (2 vías); CS del DAC quedó donde estaba.
- **Item 2** → pads de D1 ahora 1.25×1.8 mm (broca 0.9 → anillo 0.175 mm ≥ 0.13 JLC). Se movió la pista
  BA de D1 que pasaba a 0.14 mm del pad 2 (ahora corre en y 90.6). Cambio solo en la instancia del PCB,
  la huella `OdeS:LED_RGB_CATCOM_sep` de la lib sigue igual.
- **Item 9** → borradas las 2 vías colgadas de `Net-(J2-Pin_4)` y sus stubs.
- Rótulo de versión: title block del PCB y del sch (`hananMiniPcb` · rev `v2.0` · fecha 2026-10-07) y texto
  `hananMiniPcb ${REVISION} ${ISSUE_DATE}` en F.SilkS y B.SilkS (espejado) en (78, 149.9), 1.2 mm.
  🔴 Al exportar: si la fecha de orden no es 2026-10-07, cambiar la fecha del title block (sch + pcb) y
  nombrar el zip `hananMiniPcb-v2.0-<fecha>.zip`.
- DRC final: 0 sin conectar, 0 errores. Warnings restantes preexistentes (lib_footprint ×18, silk_edge ×15,
  silk_overlap ×7, texto XA1 ×4, vía colgada de R5 en (75.76,135.14)).
- Netlist ↔ PCB cruzado: coincide en todos los pads con número (PLAY1/REC1/SHIFT1/TAP1 existen solo en
  el sch, sin huella, como venía).

## Pendiente / no incluido (Daniel decide en otra rev)

- 🟡 items 3–6 (R serie clock out, protección clock in, filtro 10 nF, pull-ups externos).
- ⚪ 7 (XA1.GND2), 8 (A2+A5 misma net), 10 (silk recortada), 11 (+9V/VIN sin jack).
- Vía colgada de `Net-(R5-Pad1)` en (75.76,135.14): preexistente, sin efecto.
