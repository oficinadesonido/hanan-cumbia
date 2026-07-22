# HANAN CUMBIA · Web Flasher (Studio) — notas para editar el diseño

Web en vivo: **https://oficinadesonido.github.io/hanan-cumbia/webflasher/**
Publica GitHub Pages directo desde la rama `main` → **todo push a `main` queda en producción al toque**.
Para experimentar tranquilo: trabajar en una rama y pedir merge.

## Dónde vive el diseño gráfico

| Archivo | Qué es |
|---|---|
| `index.html` | **Hanan Estudio** (página principal): secuencias + firmware, **sin** la sección de subir samples (en revisión). |
| `lab.html` | **Hanan Lab**: la app completa, igual al Estudio **más** la pestaña Samples. Mismo `studio.js` (detecta la página por `window.HANAN_LAB` y por presencia de elementos). Comparten proyecto vía localStorage. |
| CSS común | **Todo el CSS está inline en el `<style>` del `<head>` de cada página** (index y lab son casi idénticos: si se toca la estética, actualizar ambos). Paleta en `:root`: `--pink #ff1f8e`, `--yellow #ffd400`, `--orange #ff6a00`, fondo `--bg #0a0a0a`, y los colores de los botones de la máquina `--rojo #ff1f8e`, `--blanco #eaeaea`, `--verde #3ddc84`, `--amarillo #ffd400`. Ahí están tabs, tarjeta, grilla, botones. |
| `studio.js` | Lógica de UI + flasheo. Genera la grilla de secuencias dinámicamente; cada pista lleva el color de su botón físico (definido en la tabla `CH`: rojo=Conga, blanco=Campana, verde=Huiro, amarillo=Bombo). Los selectores de banco/preset siguen el mismo orden físico (tabla `SELBTNS`; el índice de firmware es rojo=2, blanco=0, verde=3, amarillo=1). Sin glows ni degradados: colores planos. |
| `hanan_micro.png` | Logo del header. |
| `../hananFabrica/index.html` | Segundo flasher autónomo (solo firmware de fábrica), con su propio CSS inline. Si se cambia la estética, actualizar también acá para que queden parejos. |

## Reglas de oro

1. **Cache-busting:** los scripts se cargan como `studio.js?v=N` y `firmware_studio.js?v=N` al final de `index.html` **y** `lab.html`. Si tocás `studio.js`, **subí el número `?v=`** en las cuatro etiquetas (dos por página) para que los navegadores no sirvan la versión vieja.
2. **No tocar:** `sampler.html`, `seq.html`, `studio.html` son solo redirects a `index.html`.
3. **No editar a mano:** `firmware_studio.js`, `firmware.js`, `firmware_bank.js`, `firmware_presets.js`, `firmware.hex` — se generan del build del firmware (`build/`, `build_bank/`).
4. **Legacy:** `app.js`, `sampler.js`, `seq.js` son restos de versiones anteriores del flasher; el Studio actual usa solo `studio.js` + `firmware_studio.js`.
5. La página necesita **Chrome/Edge/Opera de escritorio** (Web Serial) para flashear; el diseño se puede previsualizar en cualquier navegador abriendo `index.html` local con doble clic.
