# HANAN CUMBIA · Web Flasher (Studio) — notas para editar el diseño

Web en vivo: **https://oficinadesonido.github.io/hanan-cumbia/webflasher/**
Publica GitHub Pages directo desde la rama `main` → **todo push a `main` queda en producción al toque**.
Para experimentar tranquilo: trabajar en una rama y pedir merge.

## Dónde vive el diseño gráfico

| Archivo | Qué es |
|---|---|
| `index.html` | Studio principal. **Todo el CSS está inline en el `<style>` del `<head>`**. Paleta en `:root`: `--pink #ff1f8e`, `--yellow #ffd400`, `--orange #ff6a00`, fondo `--bg #0a0a0a`. Ahí están tabs, tarjeta, grilla, botones. |
| `studio.js` | Lógica de UI + flasheo. Genera la grilla de secuencias dinámicamente; los colores de los pads salen de las clases CSS `.g0`–`.g3` (grupos de 4, estilo 808). |
| `hanan_micro.png` | Logo del header. |
| `../hananFabrica/index.html` | Segundo flasher autónomo (solo firmware de fábrica), con su propio CSS inline. Si se cambia la estética, actualizar también acá para que queden parejos. |

## Reglas de oro

1. **Cache-busting:** los scripts se cargan como `studio.js?v=3` y `firmware_studio.js?v=3` al final de `index.html`. Si tocás `studio.js`, **subí el número `?v=`** en ambas etiquetas para que los navegadores no sirvan la versión vieja.
2. **No tocar:** `sampler.html`, `seq.html`, `studio.html` son solo redirects a `index.html`.
3. **No editar a mano:** `firmware_studio.js`, `firmware.js`, `firmware_bank.js`, `firmware_presets.js`, `firmware.hex` — se generan del build del firmware (`build/`, `build_bank/`).
4. **Legacy:** `app.js`, `sampler.js`, `seq.js` son restos de versiones anteriores del flasher; el Studio actual usa solo `studio.js` + `firmware_studio.js`.
5. La página necesita **Chrome/Edge/Opera de escritorio** (Web Serial) para flashear; el diseño se puede previsualizar en cualquier navegador abriendo `index.html` local con doble clic.
