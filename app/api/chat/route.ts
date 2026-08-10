import { GoogleGenAI } from "@google/genai";
import { GAME_PROMPTS } from "@/lib/prompts";
import {
  BOSS_HEALTH,
  HISTORY_WINDOW,
  applyStatusTick,
  createInitialState,
  parseTurnOutput,
  resolveTurn,
  withChoiceIds,
} from "@/lib/game/engine";
import {
  DANGER_LEVELS,
  ITEM_KINDS,
  STATUS_EFFECTS,
} from "@/lib/types";
import type {
  ChatRequest,
  GameState,
  HistoryTurn,
  StreamEvent,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Texto: modelo gratuito en el free tier de Google AI.
const TEXT_MODEL = "gemini-3.6-flash";
// Imagen: ningún modelo de imagen tiene free tier. Este es el más barato
// (~$0.034 por imagen a 1K), suficiente para pixel art de paleta reducida.
const IMAGE_MODEL = "gemini-3.1-flash-lite-image";

// La imagen ya está lista para cuando arranca esto: el texto se revela
// carácter por carácter, como una transmisión narrada en vivo. Las pausas
// extra en el final de cada frase y entre párrafos son las que dan la
// sensación de acontecimiento en tiempo real.
const TYPE_DELAY_MS = 13;
const SENTENCE_PAUSE_MS = 180;
const PARAGRAPH_PAUSE_MS = 380;
const SENTENCE_ENDINGS = ".!?…";

// Red de seguridad barata: si la imagen se cuelga, el turno sigue sin ella
// (interferencia de TV) en vez de morir a los 60s con la imagen ya pagada.
const IMAGE_TIMEOUT_MS = 20_000;

// Captura el primer imagePrompt ya cerrado dentro del JSON a medio llegar,
// respetando los escapes: es lo que permite lanzar la imagen sin esperar el
// resto de la respuesta.
const IMAGE_PROMPT_RE = /"imagePrompt"\s*:\s*"((?:[^"\\]|\\.)*)"/;

// Narración y mecánicas viajan en un solo JSON. Los campos opcionales usan
// string vacío en vez de null: los tipos nullable son la parte más frágil del
// structured output y acá no aportan nada.
// El orden de las propiedades importa: el modelo las emite en este orden y la
// imagen se dispara en cuanto imagePrompt está cerrado, sin esperar el resto
// de la respuesta. Por eso imagePrompt va primero y choices (lo más largo) al
// final.
const TURN_SCHEMA = {
  type: "object",
  properties: {
    imagePrompt: {
      type: "string",
      description:
        "Descripción en inglés de la escena para la ilustración pixel art. Máximo 40 palabras.",
    },
    storyText: {
      type: "string",
      description: "La narración de la escena. Máximo 2 párrafos cortos.",
    },
    storySummary: {
      type: "string",
      description:
        "Resumen de ~60 palabras de la partida completa hasta este turno, incluido.",
    },
    healthDelta: {
      type: "integer",
      description:
        "Cambio de salud del turno. Negativo si hay daño, 0 si no pasó nada físico, positivo sólo si se usó un objeto de cura.",
    },
    itemsGained: {
      type: "array",
      description: "Objetos que el jugador consigue en este turno.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          kind: { type: "string", enum: [...ITEM_KINDS] },
        },
        required: ["name", "kind"],
      },
    },
    itemsLost: {
      type: "array",
      description:
        "Nombres exactos de los objetos que el jugador pierde, suelta o consume.",
      items: { type: "string" },
    },
    statusAdded: {
      type: "array",
      items: { type: "string", enum: [...STATUS_EFFECTS] },
    },
    statusRemoved: {
      type: "array",
      items: { type: "string", enum: [...STATUS_EFFECTS] },
    },
    danger: {
      type: "string",
      enum: [...DANGER_LEVELS],
      description: "Nivel de peligro de la escena que acabás de narrar.",
    },
    clueFound: {
      type: "boolean",
      description: "true si el jugador descubrió una pista sobre el Infectado 0.",
    },
    phaseAdvance: {
      type: "boolean",
      description: "true si el jugador alcanzó el foco y se topa con el Infectado 0.",
    },
    fatal: {
      type: "boolean",
      description: "true sólo si la acción mata al jugador de inmediato.",
    },
    bossDamage: {
      type: "integer",
      description:
        "Daño que el jugador le hace al Infectado 0 este turno. 0 fuera de CONFRONTACION o si el golpe falló.",
    },
    deathCause: {
      type: "string",
      description: "Frase corta con la causa de muerte. Cadena vacía si el jugador sigue vivo.",
    },
    choices: {
      type: "array",
      description: "Entre 2 y 4 opciones para el jugador.",
      minItems: 2,
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          usesItem: {
            type: "string",
            description:
              "Nombre exacto del objeto del inventario que usa la opción. Cadena vacía si no usa ninguno.",
          },
        },
        required: ["label", "usesItem"],
      },
    },
  },
  required: [
    "imagePrompt",
    "storyText",
    "storySummary",
    "healthDelta",
    "itemsGained",
    "itemsLost",
    "statusAdded",
    "statusRemoved",
    "danger",
    "clueFound",
    "phaseAdvance",
    "fatal",
    "bossDamage",
    "deathCause",
    "choices",
  ],
} as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Sólo los últimos turnos viajan textualmente; de lo anterior se encarga el
// storySummary que el modelo mantiene. Sin esto el prompt crece sin techo.
function buildHistoryText(history: HistoryTurn[]): string {
  return history
    .slice(-HISTORY_WINDOW * 2)
    .map(
      (turn) =>
        `${turn.role === "user" ? "Jugador" : "Narrador"}: ${turn.text}`
    )
    .join("\n\n");
}

// El estado llega del cliente porque el servidor es stateless. No es
// antitrampas (es un juego local): sólo evita romperse con un cuerpo raro.
function sanitizeState(raw: unknown): GameState {
  const base = createInitialState();
  if (!raw || typeof raw !== "object") return base;
  const data = raw as Partial<GameState>;

  return {
    ...base,
    ...data,
    health:
      typeof data.health === "number" && Number.isFinite(data.health)
        ? Math.min(100, Math.max(0, Math.round(data.health)))
        : base.health,
    inventory: Array.isArray(data.inventory) ? data.inventory.slice(0, 3) : [],
    statuses: Array.isArray(data.statuses) ? data.statuses : [],
    danger: DANGER_LEVELS.includes(data.danger as GameState["danger"])
      ? (data.danger as GameState["danger"])
      : base.danger,
    bossHealth:
      typeof data.bossHealth === "number" && Number.isFinite(data.bossHealth)
        ? Math.min(BOSS_HEALTH, Math.max(0, Math.round(data.bossHealth)))
        : base.bossHealth,
    storySummary:
      typeof data.storySummary === "string" ? data.storySummary : "",
  };
}

function jsonError(status: number): Response {
  // Sin detalle técnico en el cuerpo: el motivo real queda solo en los
  // logs del servidor. El cliente muestra un aviso genérico ambientado.
  return Response.json({ error: true }, { status });
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error(
      "[api/chat] Falta configurar GEMINI_API_KEY en .env.local."
    );
    return jsonError(500);
  }

  let payload: Partial<ChatRequest>;
  try {
    payload = await request.json();
  } catch {
    console.error("[api/chat] Cuerpo de la petición inválido.");
    return jsonError(400);
  }

  const history: HistoryTurn[] = Array.isArray(payload.history)
    ? payload.history
    : [];
  const userMessage =
    typeof payload.userMessage === "string" ? payload.userMessage.trim() : null;
  const actionKind = payload.actionKind === "improvise" ? "improvise" : "choice";
  const isStart = history.length === 0;

  if (!isStart && !userMessage) {
    console.error("[api/chat] Falta la acción del jugador.");
    return jsonError(400);
  }

  const incomingState = sanitizeState(payload.state);
  if (incomingState.outcome !== "playing") {
    console.error("[api/chat] La partida ya había terminado.");
    return jsonError(409);
  }

  // El sangrado y la infección cobran antes de narrar, para que el modelo vea
  // la salud ya castigada.
  const { state: tickedState, notices: tickNotices } =
    applyStatusTick(incomingState);

  const ai = new GoogleGenAI({ apiKey });

  const prompt = GAME_PROMPTS.TURN({
    state: tickedState,
    historyText: buildHistoryText(history),
    action: isStart ? null : (userMessage as string),
    actionKind,
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function send(event: StreamEvent) {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      }

      // La imagen se lanza apenas el modelo cierra imagePrompt, sin esperar
      // el resto de la respuesta: es lo que saca la generación de imagen del
      // camino crítico del turno.
      let imagePromise: Promise<string | null> | null = null;

      // El clima de la ilustración sale del estado con el que arranca el
      // turno, no del resuelto: cuando la imagen se dispara todavía no se
      // resolvió nada. Es el precio de sacarla del camino crítico.
      function startImage(imagePrompt: string) {
        const request = ai.interactions
          .create({
            model: IMAGE_MODEL,
            input: GAME_PROMPTS.GENERATE_IMAGE(imagePrompt, tickedState),
            response_format: {
              type: "image",
              aspect_ratio: "16:9",
              image_size: "512",
            },
          })
          .then((interaction) => {
            const image = interaction.output_image;
            if (!image?.data) {
              console.error("[api/chat] El modelo de imagen no devolvió datos.");
              return null;
            }
            return `data:${image.mime_type ?? "image/png"};base64,${image.data}`;
          })
          .catch((err) => {
            console.error("[api/chat] Fallo al generar la imagen:", err);
            return null;
          });

        const timeout = new Promise<string | null>((resolve) =>
          setTimeout(() => resolve(null), IMAGE_TIMEOUT_MS)
        );
        imagePromise = Promise.race([request, timeout]);
      }

      /** Consume el stream acumulando el JSON y disparando la imagen al vuelo. */
      async function streamTurnJson(): Promise<string> {
        const events = await ai.interactions.create({
          model: TEXT_MODEL,
          input: prompt,
          stream: true,
          // Con el nivel por defecto el modelo se toma 8-10s antes del primer
          // token y la paralelización con la imagen pierde casi todo su
          // sentido: imagePrompt recién aparecería cerca del final. Medido,
          // esto solo saca ~8s del turno.
          generation_config: { thinking_level: "minimal" },
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema: TURN_SCHEMA as unknown as Record<string, unknown>,
          },
        });

        let raw = "";
        for await (const event of events) {
          if (event.event_type !== "step.delta") continue;
          const delta = event.delta;
          if (delta.type !== "text") continue;
          raw += delta.text;

          if (!imagePromise) {
            const match = IMAGE_PROMPT_RE.exec(raw);
            if (match) {
              // El campo viene escapado como JSON: se desescapa parseándolo.
              try {
                const imagePrompt = JSON.parse(`"${match[1]}"`) as string;
                if (imagePrompt.trim()) startImage(imagePrompt.trim());
              } catch {
                console.error("[api/chat] imagePrompt ilegible en el stream.");
              }
            }
          }
        }
        return raw.trim();
      }

      let turn: ReturnType<typeof parseTurnOutput> = null;
      // Un reintento: un stream cortado o un JSON truncado es lo bastante
      // común como para no quemarle el turno al jugador por eso.
      for (let attempt = 0; attempt < 2 && !turn; attempt++) {
        try {
          const raw = await streamTurnJson();
          if (!raw) throw new Error("Respuesta de texto vacía.");
          turn = parseTurnOutput(JSON.parse(raw));
          if (!turn) throw new Error("La respuesta no tiene narración utilizable.");
        } catch (err) {
          console.error(
            `[api/chat] Fallo al generar la narrativa (intento ${attempt + 1}):`,
            err
          );
        }
      }

      if (!turn) {
        send({ type: "error" });
        controller.close();
        return;
      }

      // Menos de dos opciones con el jugador vivo deja la partida trabada:
      // mejor cortar acá y que el cliente ofrezca reintentar.
      const resolved = resolveTurn(tickedState, turn, actionKind);
      const nextState = resolved.state;
      const notices = [...tickNotices, ...resolved.notices];

      if (nextState.outcome === "playing" && turn.choices.length < 2) {
        console.error("[api/chat] El modelo devolvió menos de dos opciones.");
        send({ type: "error" });
        controller.close();
        return;
      }

      if (!imagePromise) {
        console.error("[api/chat] El modelo omitió el imagePrompt.");
      }

      // La imagen va primero: la escena aparece con la ilustración lista y
      // el texto se revela después con efecto de escritura, todo de un
      // tirón y sin esperas intermedias visibles. A esta altura suele estar
      // resuelta hace rato, porque arrancó antes de que terminara el texto.
      const imageUrl = imagePromise ? await imagePromise : null;
      send({ type: "image", imageUrl });

      for (let i = 0; i < turn.storyText.length; i++) {
        const char = turn.storyText[i];
        send({ type: "text", delta: char });

        const next = turn.storyText[i + 1];
        let delay = TYPE_DELAY_MS;
        if (char === "\n" && next === "\n") {
          delay = PARAGRAPH_PAUSE_MS;
        } else if (
          SENTENCE_ENDINGS.includes(char) &&
          (next === undefined || next === " " || next === "\n")
        ) {
          delay = SENTENCE_PAUSE_MS;
        }
        await sleep(delay);
      }

      // El estado va al final a propósito: la barra de vida baja cuando cae
      // el golpe narrativo, no mientras el jugador todavía lo está leyendo.
      send({
        type: "state",
        state: nextState,
        healthDelta: resolved.healthDelta,
        notices,
      });

      if (nextState.outcome === "playing") {
        send({
          type: "choices",
          choices: withChoiceIds(turn.choices, nextState.turn),
        });
      }

      send({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
