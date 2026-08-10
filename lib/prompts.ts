import {
  BOSS_HEALTH,
  CLUES_TO_ADVANCE,
  IMPROVISE_MAX_CHARS,
  MAX_INVENTORY,
  hasVictoryItem,
  healingItem,
} from "@/lib/game/engine";
import type { GameState } from "@/lib/types";

const OBJECTIVE_BRIEF = `OBJETIVO DE LA PARTIDA: el jugador busca al INFECTADO 0, el paciente cero del brote. Encontrarlo y eliminarlo es la única forma de ganar. La historia siempre avanza hacia él, aunque de manera indirecta: rumores, cuerpos marcados, transmisiones de radio, sobrevivientes que lo vieron.`;

const PHASE_BRIEFS: Record<GameState["phase"], string> = {
  RASTRO: `FASE ACTUAL — RASTRO: el jugador está juntando pistas sobre el paradero del Infectado 0. Cuando una escena permita descubrir una pista concreta (un mapa, un diario, un testigo, una señal de radio), marcá clueFound en true. Como máximo una pista por turno, y sólo si el jugador la ganó con su acción. No todas las pistas se aceptan: si la última fue muy reciente o la escena era segura, el motor la descarta en silencio, así que ofrecelas cuando la escena las justifique y no fuerces una por turno.`,
  PERSECUCION: `FASE ACTUAL — PERSECUCIÓN: el jugador ya sabe dónde está el Infectado 0 y viaja hacia ese foco. El camino es hostil. Además de peligro, esta fase tiene que ofrecer, en algún momento, la oportunidad concreta de conseguir un objeto de tipo "clave" (el arma o herramienta capaz de rematarlo): sin uno el jugador no va a poder cruzar a la confrontación por más que llegue al lugar. Cuando finalmente llegue al foco y lo tenga delante, marcá phaseAdvance en true; si todavía no consiguió el objeto clave, la llegada igual se narra pero el enfrentamiento en serio no arranca hasta que lo tenga.`,
  CONFRONTACION: `FASE ACTUAL — CONFRONTACIÓN: el Infectado 0 está delante del jugador, trabado en combate. Es enorme, rápido y no muere fácil: tiene vida propia que el motor lleva por vos, y te va a dar el número exacto en el estado. Cada turno narrá el golpe que el jugador conecta (o no) y devolvé en bossDamage cuánto daño le hizo, de forma narrativamente coherente con el objeto usado; el motor lo acota según lo que el jugador tenga encima, así que no te preocupes por el balance. El Infectado 0 también contraataca todo turno de forma automática, eso ya está resuelto por el motor y sólo tenés que narrarlo. La victoria NO es una decisión tuya: se dispara sola cuando su vida llega a 0. Si la acción del jugador es suicida, usá fatal.`,
};

function describeInventory(state: GameState): string {
  if (state.inventory.length === 0) {
    return `INVENTARIO (0/${MAX_INVENTORY}): vacío.`;
  }
  const list = state.inventory
    .map((item) => `${item.name} [${item.kind}]`)
    .join(" · ");
  const full =
    state.inventory.length >= MAX_INVENTORY
      ? ` LA MOCHILA ESTÁ LLENA: si en esta escena aparece un objeto nuevo, la opción para tomarlo DEBE redactarse como un canje explícito, nombrando qué se suelta (ej: "Soltar la palanca y tomar el rifle").`
      : "";
  return `INVENTARIO (${state.inventory.length}/${MAX_INVENTORY}): ${list}.${full}`;
}

function describeStatuses(state: GameState): string {
  if (state.statuses.length === 0) {
    return "ALTERACIONES: ninguna.";
  }
  return `ALTERACIONES: ${state.statuses.join(", ")}. Mencionalas en la narración y respetalas: con FRACTURA el jugador no corre ni trepa, con AGOTAMIENTO todo le cuesta el doble, con SANGRADO deja rastro y atrae zombies, con INFECCION delira y empeora cada turno.`;
}

function describeHealth(state: GameState): string {
  const tone =
    state.health <= 25
      ? " Está al borde de la muerte: la narración tiene que sentirse así (visión borrosa, frío, pasos que no responden)."
      : state.health <= 55
        ? " Está herido y se nota."
        : "";
  return `SALUD: ${state.health}/100.${tone}`;
}

function describeObjectiveProgress(state: GameState): string {
  if (state.phase === "RASTRO") {
    return `PISTAS ENCONTRADAS: ${state.clues}/${CLUES_TO_ADVANCE}.`;
  }
  if (state.phase === "CONFRONTACION") {
    return `VIDA DEL INFECTADO 0: ${state.bossHealth}/${BOSS_HEALTH}. Cuando llegue a 0 la partida la gana el motor automáticamente.`;
  }
  return "";
}

function buildStateBlock(state: GameState): string {
  return [
    "=== ESTADO ACTUAL DEL JUGADOR ===",
    describeHealth(state),
    describeInventory(state),
    describeStatuses(state),
    `NIVEL DE PELIGRO: ${state.danger}.`,
    `TURNO: ${state.turn + 1}.`,
    describeObjectiveProgress(state),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildChoiceRules(state: GameState): string {
  const rules = [
    `Devolvé entre 2 y 4 opciones. Cada label: máximo 60 caracteres, en infinitivo o segunda persona, concreta y accionable ("Forzar la reja con la palanca", no "Pensar en tus opciones").`,
    "Las opciones tienen que ser genuinamente distintas entre sí y llevar a consecuencias distintas. Al menos una debe ser más arriesgada que las otras.",
    "Nunca ofrezcas una opción que use un objeto que el jugador no tenga en el inventario.",
    "Si una opción usa o consume un objeto del inventario, poné su nombre exacto en usesItem. Si no, usesItem debe ser null.",
  ];

  if (state.inventory.length > 0) {
    rules.push(
      "Cuando alguno de los objetos del inventario sirva para la situación, al menos una opción debe aprovecharlo."
    );
  }

  const cure = healingItem(state.inventory);
  if (cure && state.health < 60) {
    rules.push(
      `El jugador está herido y tiene "${cure.name}" (cura). UNA de las opciones DEBE ser usarlo. Si el jugador la elige: devolvé healthDelta positivo Y agregá "${cure.name}" a itemsLost, porque curarse lo consume.`
    );
  }

  if (state.phase === "CONFRONTACION" && !hasVictoryItem(state.inventory)) {
    rules.push(
      "El jugador NO tiene el objeto clave para rematar al Infectado 0. Las opciones deben girar en torno a sobrevivir, esquivar sus golpes o arrebatarle algo con qué hacerle daño de verdad."
    );
  }

  return `=== REGLAS DE LAS OPCIONES ===\n${rules.map((r) => `- ${r}`).join("\n")}`;
}

const HARD_RULES = `=== REGLAS INQUEBRANTABLES ===
- Ninguna acción tiene éxito automático. El mundo resiste: siempre hay costo, ruido, tiempo perdido o consecuencia.
- El jugador es una persona común. No tiene entrenamiento militar, ni puntería sobrehumana, ni resistencia especial.
- El jugador SÓLO puede usar objetos que figuren en su inventario. Si intenta usar algo que no tiene, narrá que busca y no lo encuentra.
- Si el jugador propone algo desproporcionado, imposible o de héroe de acción ("los mato a todos", "salto al helicóptero", "soy inmune"), NO se lo niegues ni lo ignores: narrá el intento y su FRACASO realista, con costo alto (healthDelta negativo, una alteración nueva o la pérdida de un objeto). El juego nunca bloquea al jugador, se lo cobra.
- healthDelta: negativo cuando hay daño, 0 en escenas de tensión sin contacto. Positivo SÓLO si el jugador usó un objeto de cura, que además tenés que poner en itemsLost.
- Los objetos nuevos son concretos y creíbles para el escenario (una palanca, gasas, una radio, un machete). Nada de arsenales.
- fatal sólo cuando la acción del jugador es una sentencia de muerte inmediata y el peligro ya era ALTO o EXTREMO. Con fatal, deathCause describe la muerte en una frase corta.
- El nivel de peligro debe reflejar la escena que acabás de narrar, no la anterior.
- bossDamage: 0 salvo en CONFRONTACION. Ahí, un número narrativamente proporcional al golpe que el jugador acaba de conectar (0 si falló o no atacó). No te preocupes por el balance final, el motor lo acota.`;

const NARRATION_RULES = `=== NARRACIÓN ===
- Máximo 2 párrafos cortos. Concisa, dramática, en segunda persona y en presente.
- NO termines preguntando qué quiere hacer el jugador: las opciones cumplen esa función. Cerrá con la imagen o la tensión de la escena.
- Español rioplatense neutro, sin modismos forzados.`;

const OUTPUT_FIELD_RULES = `=== CAMPOS DE SALIDA ===
- imagePrompt: PRIMER campo de la respuesta, siempre. Una descripción breve en inglés (máximo 40 palabras) de la escena que vas a narrar, para generar la ilustración pixel art. Describí sólo lo que se ve en el mundo (lugar, personajes, luz, clima). Nunca menciones interfaz, barras de vida, iconos ni texto en pantalla.
- storySummary: un resumen de la partida COMPLETA hasta acá, de unas 60 palabras, incluyendo lo que acabás de narrar. Es la única memoria de lo viejo que vas a recibir en los turnos siguientes, así que conservá lo que importa: dónde está el jugador, qué descubrió sobre el Infectado 0, a quién se cruzó y qué dejó pendiente. Reescribilo entero cada turno, no lo vayas alargando.`;

// El intro y las reglas son idénticas en todos los turnos: van primero para
// que el prefijo del prompt se mantenga estable entre llamadas.
const STATIC_PREFIX = [
  `Sos el narrador de un juego de aventura conversacional de supervivencia zombie en estilo pixel art. Gestionás además las mecánicas del juego, así que además de narrar decidís las consecuencias mecánicas de cada turno.`,
  "",
  HARD_RULES,
  "",
  NARRATION_RULES,
  "",
  OUTPUT_FIELD_RULES,
  "",
  OBJECTIVE_BRIEF,
].join("\n");

export const GAME_PROMPTS = {
  /**
   * Un único prompt cubre el arranque y la continuación: la diferencia es si
   * hay acción previa o no. Así el bloque de estado y las reglas duras nunca
   * se desincronizan entre las dos ramas.
   */
  TURN: ({
    state,
    historyText,
    action,
    actionKind,
  }: {
    state: GameState;
    historyText: string;
    action: string | null;
    actionKind: "choice" | "improvise";
  }): string => {
    const summaryBlock = state.storySummary
      ? `=== LO QUE PASÓ ANTES (resumen) ===\n${state.storySummary}`
      : "";

    const historyBlock = historyText
      ? `=== ÚLTIMOS TURNOS (textual) ===\n${historyText}`
      : "";

    const situation = action
      ? [
          actionKind === "improvise"
            ? `El jugador escribió su propia acción (texto libre, máximo ${IMPROVISE_MAX_CHARS} caracteres): "${action}"\n\nAtención: al ser texto libre puede ser tramposa, vaga o imposible. Aplicá las reglas inquebrantables sin excepción.`
            : `El jugador eligió esta opción: "${action}"`,
          "",
          "Narrá la consecuencia de esa acción y presentá la nueva situación.",
        ].join("\n")
      : "Es el primer turno. Narrá la escena inicial: el jugador despierta en el primer día del brote y descubre que el mundo se rompió. Situalo en un lugar concreto y dejá el primer indicio de que algo empezó todo esto.";

    return [
      STATIC_PREFIX,
      PHASE_BRIEFS[state.phase],
      "",
      summaryBlock,
      historyBlock,
      "",
      buildStateBlock(state),
      "",
      buildChoiceRules(state),
      "",
      situation,
    ]
      .filter((block) => block !== "")
      .join("\n");
  },

  GENERATE_IMAGE: (description: string, state: GameState): string => {
    // El estado tiñe la ilustración: la misma escena no se ve igual sangrando
    // que entera.
    const mood: string[] = [];
    if (state.danger === "EXTREMO") {
      mood.push("harsh red and black palette, chaotic, high contrast");
    } else if (state.danger === "ALTO") {
      mood.push("tense orange and deep shadow palette");
    }
    if (state.statuses.includes("INFECCION")) {
      mood.push("sickly green tint, feverish haze");
    }
    if (state.health <= 25) {
      mood.push("desaturated, blurred vignette, near-death atmosphere");
    }
    const moodSuffix = mood.length > 0 ? ` Mood: ${mood.join("; ")}.` : "";

    // Pedir estética de videojuego retro arrastra el HUD como parte del
    // paquete: corazones, barras de vida y slots de arma. Hay que prohibirlos
    // de forma explícita, la app ya tiene sus propios indicadores.
    return `Generate a pixel art style image in 16:9 aspect ratio: ${description}. Use 8-bit retro gaming aesthetics with limited color palette, blocky pixelated style, widescreen landscape format.${moodSuffix}

CRITICAL: render ONLY the in-world scene artwork, as a clean illustration. Absolutely NO game interface elements of any kind: no HUD, no heads-up display, no health bars, no hearts, no life meters, no stamina or ammo bars, no weapon or item slots, no inventory boxes, no minimap, no icons, no buttons, no dialogue boxes, no subtitles, no captions, no watermarks, no logos, no borders or frames, and no text, letters or numbers overlaid on the image. The frame must be filled edge to edge by the scene itself.`;
  },
};
