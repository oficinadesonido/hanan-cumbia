# hananClasicaPcb — Hanan Cumbia clásica, PCB principal v2.0 (2026-10-07)

Proyecto KiCad 10 armado el 2026-10-07 a partir de:
- **PCB:** `../hanan25.kicad_pcb` (77.1×92.1 mm; mismo diseño que `Hanan.kicad_pcb`/`Hanantaller.kicad_pcb`/`HTR_2023`;
  última fabricación JLC Y194, 10 u., 2025-11-14).
- **Esquemático:** copia de `hanan26/hananMiniPcb/hananMiniPcb.kicad_sch` (mismos refs y UUIDs que la PCB) +
  `J1` jack DC y `D2` diodo serie a `+9V`/VIN (net `VIN_JACK`). El `.sch` legacy `BD1.sch` queda como histórico.
  Los enlaces sch↔pcb coinciden (UUID de símbolo = path de huella), así que "Actualizar PCB desde esquemático" en el GUI
  no debería mover nada.

## Cambios v2.0 (iguales a hananMiniPcb v2.0)
- `R6` 1 kΩ + `C2` 10 µF: RC en Vref del MCP4901 (U1.6, net `VREF`); `C3` 100 nF en Vdd (U1.1). Cara B, borde izquierdo
  junto a R3 (R6 x=52.6, C2 x=51.8, C3 y=105.8). El +5C que entraba al pad 6 se cortó en (61.9,112.6) y se reruteó.
- Pads de `D1` (LED RGB) 1.25×1.8 mm (anillo 0.175 ≥ 0.13 JLC). Solo en la instancia del PCB.
- Title block (rev `v2.0`, fecha) + silk `hananClasicaPcb ${REVISION} ${ISSUE_DATE}` en F y B (y=160.6).
- DRC: 0 sin conectar, 0 errores. Warnings preexistentes: libs `OdeS`/`SWITCH`/`Arduino` no configuradas, silk al
  borde, textos XA1, vía colgada de `Net-(J2-Pad1)` en (113.3,149.7).

## Al fabricar
Fecha del title block = fecha de orden (sch y pcb) → zip `hananClasicaPcb-v2.0-<AAAA-MM-DD>.zip`.
Pendientes 🟡 (no incluidos): R serie en clock out, protección clock in, 10 nF de reconstrucción — ver
`hanan26/docs/revision-electronica-mini.md` (aplica igual a esta placa).
