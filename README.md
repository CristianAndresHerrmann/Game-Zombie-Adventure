# Zombie Adventure — Survival Game

Juego de aventura conversacional de supervivencia zombie con estética pixel art, narrado por IA. Cada turno el modelo escribe la escena, genera su ilustración y resuelve las consecuencias de la decisión tomada.

El objetivo es encontrar y eliminar al **Infectado 0**. No hay guardado: si la salud llega a 0%, la partida termina.

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

La clave se genera en [Google AI Studio](https://aistudio.google.com/apikey), y necesita facturación activada para que funcionen las imágenes (ver [Costos](#costos)).

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
| `npx tsc --noEmit` | Chequeo de tipos |

## Cómo se juega

- **Salud:** arranca en 100%. Cada decisión puede costar vida; en 0% termina la partida.
- **Inventario:** hasta 3 objetos, que determinan qué opciones aparecen. Con la mochila llena, tomar algo nuevo obliga a soltar otra cosa.
- **Alteraciones:** sangrado, infección, fractura y agotamiento. Drenan vida cada turno y condicionan la narrativa.
- **Peligro:** cuatro niveles (SEGURO, MEDIO, ALTO, EXTREMO) que tiñen la interfaz y definen cuánto puede salir mal un turno.
- **Decisiones:** 2 a 4 botones por turno, más 3 improvisaciones de texto libre por partida.
- **Objetivo:** tres fases (rastro de pistas, persecución y confrontación). Ganar requiere llegar al final con un arma.

El juego incluye un panel **Cómo jugar** en el header con las reglas explicadas para el jugador.

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
  game/engine.ts      constantes de balance y reglas del juego
```

Para ajustar la dificultad —topes de daño, tamaño del inventario, cantidad de pistas, improvisaciones disponibles— alcanza con tocar las constantes al inicio de `lib/game/engine.ts`. Los modelos usados están al inicio de `app/api/chat/route.ts`.

## Costos

El modelo de texto entra en el free tier de Google AI. **Ningún modelo de imagen lo tiene**: se genera una imagen por turno a unos **USD 0,034** cada una, así que una partida de 20 turnos ronda los USD 0,70.

Si la generación de imagen falla, el turno no se rompe: la escena muestra interferencia de TV en lugar de la ilustración.

## A tener en cuenta

- Un turno tarda entre 20 y 30 segundos en completarse.
- No hay persistencia. Todo el estado vive en memoria del navegador y se pierde al recargar.
- Las imágenes se mantienen en memoria durante la partida, sin caché: una partida larga acumula varios MB.
