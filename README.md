# Zombie Adventure — Survival Game

Juego de aventura conversacional de supervivencia zombie con estética pixel art, narrado por IA. Cada turno el modelo escribe la escena, genera su ilustración y resuelve las consecuencias de la decisión tomada.

El objetivo es encontrar y eliminar al **Infectado 0**. No hay guardado: si la salud llega a 0%, la partida termina — aunque la historia se puede descargar como un archivo HTML.

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript
- **Estilos:** Tailwind CSS v4
- **IA:** Google Gemini vía `@google/genai`

## Puesta en marcha

Requiere Node 20 o superior.

Instalá las dependencias:

```bash
npm install
```

Copiá el archivo de ejemplo de variables de entorno:

```bash
cp .env.example .env.local
```

Y completá la única variable que hace falta:

```
GEMINI_API_KEY=tu_clave
```

La clave se genera en [Google AI Studio](https://aistudio.google.com/apikey). Necesita facturación activada: el modelo de texto entra en el free tier, pero ningún modelo de imagen lo tiene. Si la generación de imagen falla, el turno igual llega completo y la escena muestra interferencia de TV en lugar de la ilustración.

Levantá el servidor de desarrollo:

```bash
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm start` | Sirve el build |
| `npm run lint` | ESLint |
| `npm run check:engine` | Comprobaciones de las reglas del motor (sin red) |
| `npx tsc --noEmit` | Chequeo de tipos |

## Cómo se juega

- **Salud:** arranca en 100%. Cada decisión puede costar vida; en 0% termina la partida.
- **Inventario:** hasta 3 objetos, que determinan qué opciones aparecen. Con la mochila llena, tomar algo nuevo obliga a soltar otra cosa.
- **Alteraciones:** sangrado, infección, fractura y agotamiento. Drenan vida cada turno y condicionan la narrativa.
- **Peligro:** cuatro niveles (SEGURO, MEDIO, ALTO, EXTREMO) que tiñen la interfaz y definen cuánto puede salir mal un turno.
- **Decisiones:** 2 a 4 botones por turno, más 3 improvisaciones de texto libre por partida.
- **Objetivo:** tres fases (rastro de pistas, persecución y confrontación).

El juego incluye un panel **Cómo jugar** en el header con las reglas explicadas para el jugador.

### La dificultad del Infectado 0

Las tres compuertas hacia el final tienen llave, para que la partida no se resuelva en cinco turnos:

- **Las pistas cuestan.** Sólo se acepta una cada 2 turnos como mínimo, y nunca en una escena de peligro `SEGURO`. La fase de rastro dura 7 turnos en el mejor de los casos.
- **Hace falta un objeto `clave`.** No un arma cualquiera: sin él no se cruza siquiera a la confrontación. Conseguirlo es el propósito de la persecución.
- **El jefe tiene vida propia** (120) y contraataca **12 de salud por turno**, siempre, se narre o no. El daño que recibe lo acota el motor según con qué se pelee: 18 con el objeto clave, 8 con un arma común, 3 sin nada, y **+12 si la acción fue improvisada**.
- **La victoria no la decide el modelo:** se dispara sola cuando la vida del jefe llega a 0. El combate nunca baja de 5 turnos, y sin gastar improvisaciones son 7. Llegar herido a la confrontación es morir.

Para ajustar cualquiera de estos números —topes de daño, vida del jefe, tamaño del inventario, cantidad de pistas, improvisaciones disponibles— alcanza con tocar las constantes al inicio de `lib/game/engine.ts`. Las reglas viven en `resolveTurn()` y `applyStatusTick()`, que son puras y están cubiertas por `npm run check:engine`.

## Descargar la historia

Desde el header (con la partida en curso) o desde la pantalla final se puede bajar la partida como un **HTML autocontenido**: portada con el resultado y las estadísticas, la sinopsis, y después escena por escena con su ilustración embebida, la narración y los avisos del turno. No pide nada a la red, así que se abre sin conexión.

## Estructura

```
app/
  page.tsx            interfaz y estado de la partida
  api/chat/route.ts   llamadas al modelo y stream de la escena
  globals.css         ambientación y efectos visuales
components/           HUD, opciones, escena, pantalla final, reglas
lib/
  types.ts            tipos del dominio
  prompts.ts          prompts de narración e imagen
  export.ts           armado y descarga del HTML de la partida
  game/engine.ts      constantes de balance y reglas del juego
scripts/
  check-engine.ts     comprobaciones de las reglas del motor
```

Los modelos usados están al inicio de `app/api/chat/route.ts`.

## A tener en cuenta

- Un turno tarda unos 15 segundos, de los cuales ~9 son el efecto de máquina de escribir.
- No hay persistencia. Todo el estado vive en memoria del navegador y se pierde al recargar; el navegador avisa antes de salir con una partida en curso. Para conservar una partida está la descarga.
