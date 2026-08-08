import { DANGER_LEVELS, ITEM_KINDS, STATUS_EFFECTS } from "@/lib/types";
import type {
  Choice,
  DangerLevel,
  GameState,
  Item,
  ObjectivePhase,
  StatusEffect,
  TurnOutput,
} from "@/lib/types";

export const MAX_HEALTH = 100;
export const MAX_INVENTORY = 3;
export const CLUES_TO_ADVANCE = 3;
export const STARTING_INSTINCT = 3;
export const IMPROVISE_MAX_CHARS = 70;

// La IA propone el daño narrativamente coherente; acá se decide cuánto puede
// doler de verdad. Sin este techo, un modelo generoso te mata en el turno dos.
const DAMAGE_CAP: Record<DangerLevel, number> = {
  SEGURO: 15,
  MEDIO: 25,
  ALTO: 35,
  EXTREMO: 55,
};

const HEAL_CAP = 35;

const BLEED_DAMAGE = 5;
const EXHAUSTION_DAMAGE = 2;
const INFECTION_BASE_DAMAGE = 3;
const INFECTION_RAMP_EVERY = 3;

const VICTORY_ITEM_KINDS = new Set(["arma", "clave"]);

export function createInitialState(): GameState {
  return {
    health: MAX_HEALTH,
    inventory: [],
    statuses: [],
    danger: "SEGURO",
    phase: "RASTRO",
    clues: 0,
    infectionAge: 0,
    instinct: STARTING_INSTINCT,
    turn: 0,
    outcome: "playing",
    deathCause: null,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeItemName(name: string): string {
  return name.trim().toLowerCase();
}

export function hasVictoryItem(inventory: Item[]): boolean {
  return inventory.some((item) => VICTORY_ITEM_KINDS.has(item.kind));
}

export function healingItem(inventory: Item[]): Item | undefined {
  return inventory.find((item) => item.kind === "cura");
}

/**
 * Corre antes de construir el prompt, para que el narrador vea la salud ya
 * castigada y pueda mencionarla.
 */
export function applyStatusTick(state: GameState): {
  state: GameState;
  notices: string[];
} {
  if (state.outcome !== "playing" || state.statuses.length === 0) {
    return { state, notices: [] };
  }

  const notices: string[] = [];
  let damage = 0;
  let infectionAge = state.infectionAge;

  if (state.statuses.includes("SANGRADO")) {
    damage += BLEED_DAMAGE;
    notices.push(`SANGRADO −${BLEED_DAMAGE} ♥`);
  }

  if (state.statuses.includes("INFECCION")) {
    const infectionDamage =
      INFECTION_BASE_DAMAGE + Math.floor(infectionAge / INFECTION_RAMP_EVERY);
    damage += infectionDamage;
    infectionAge += 1;
    notices.push(`INFECCIÓN −${infectionDamage} ♥`);
  } else {
    infectionAge = 0;
  }

  if (state.statuses.includes("AGOTAMIENTO")) {
    damage += EXHAUSTION_DAMAGE;
    notices.push(`AGOTAMIENTO −${EXHAUSTION_DAMAGE} ♥`);
  }

  // FRACTURA no drena vida: sólo cierra opciones en el prompt.

  const health = clamp(state.health - damage, 0, MAX_HEALTH);
  const next: GameState = { ...state, health, infectionAge };

  if (health <= 0) {
    next.outcome = "dead";
    next.deathCause = state.statuses.includes("INFECCION")
      ? "La infección terminó el trabajo."
      : "Te desangraste.";
  }

  return { state: next, notices };
}

// El JSON schema garantiza la forma, pero el modelo puede inventar un nombre
// de enum o truncarse. Lo que no reconocemos se descarta sin romper el turno.
function isDanger(value: unknown): value is DangerLevel {
  return DANGER_LEVELS.includes(value as DangerLevel);
}

function isStatus(value: unknown): value is StatusEffect {
  return STATUS_EFFECTS.includes(value as StatusEffect);
}

function toStatusList(value: unknown): StatusEffect[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isStatus);
}

function toItemList(value: unknown): Item[] {
  if (!Array.isArray(value)) return [];
  const items: Item[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const { name, kind } = raw as { name?: unknown; kind?: unknown };
    if (typeof name !== "string" || !name.trim()) continue;
    items.push({
      name: name.trim(),
      kind: ITEM_KINDS.includes(kind as Item["kind"])
        ? (kind as Item["kind"])
        : "herramienta",
    });
  }
  return items;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim() !== ""
  );
}

/** Devuelve null sólo si falta la narración: sin eso el turno está perdido. */
export function parseTurnOutput(raw: unknown): TurnOutput | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;

  const storyText =
    typeof data.storyText === "string" ? data.storyText.trim() : "";
  if (!storyText) return null;

  const rawChoices = Array.isArray(data.choices) ? data.choices : [];
  const choices = rawChoices
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => ({
      label: typeof c.label === "string" ? c.label.trim() : "",
      usesItem: typeof c.usesItem === "string" && c.usesItem.trim()
        ? c.usesItem.trim()
        : null,
    }))
    .filter((c) => c.label !== "")
    .slice(0, 4);

  return {
    storyText,
    imagePrompt:
      typeof data.imagePrompt === "string" ? data.imagePrompt.trim() : "",
    healthDelta:
      typeof data.healthDelta === "number" && Number.isFinite(data.healthDelta)
        ? Math.round(data.healthDelta)
        : 0,
    itemsGained: toItemList(data.itemsGained),
    itemsLost: toStringList(data.itemsLost),
    statusAdded: toStatusList(data.statusAdded),
    statusRemoved: toStatusList(data.statusRemoved),
    danger: isDanger(data.danger) ? data.danger : "MEDIO",
    clueFound: data.clueFound === true,
    phaseAdvance: data.phaseAdvance === true,
    fatal: data.fatal === true,
    victory: data.victory === true,
    deathCause:
      typeof data.deathCause === "string" && data.deathCause.trim()
        ? data.deathCause.trim()
        : null,
    choices,
  };
}

function advancePhase(
  phase: ObjectivePhase,
  clues: number,
  phaseAdvance: boolean
): ObjectivePhase {
  if (phase === "RASTRO") {
    return clues >= CLUES_TO_ADVANCE ? "PERSECUCION" : "RASTRO";
  }
  if (phase === "PERSECUCION") {
    return phaseAdvance ? "CONFRONTACION" : "PERSECUCION";
  }
  return "CONFRONTACION";
}

/** Aplica la propuesta del modelo acotada por las reglas del juego. */
export function resolveTurn(
  state: GameState,
  output: TurnOutput
): { state: GameState; healthDelta: number; notices: string[] } {
  const notices: string[] = [];

  // El peligro se resuelve primero porque acota el daño del propio turno.
  let danger = output.danger;

  // Primero se suelta y después se recoge, para que el canje ("soltar la
  // palanca y tomar el rifle") entre sin desbordar la mochila.
  const lost = new Set(output.itemsLost.map(normalizeItemName));
  const droppedItems = state.inventory.filter((item) =>
    lost.has(normalizeItemName(item.name))
  );
  const inventory = state.inventory.filter(
    (item) => !lost.has(normalizeItemName(item.name))
  );

  for (const item of output.itemsGained) {
    if (
      inventory.some(
        (existing) => normalizeItemName(existing.name) === normalizeItemName(item.name)
      )
    ) {
      continue;
    }
    inventory.push(item);
    notices.push(`+ ${item.name}`);
  }

  for (const item of droppedItems) {
    notices.push(`− ${item.name}`);
  }

  // Si el modelo ignoró el límite se descarta lo más viejo, pero con aviso:
  // el jugador nunca pierde un objeto en silencio.
  while (inventory.length > MAX_INVENTORY) {
    const dropped = inventory.shift();
    if (dropped) notices.push(`− ${dropped.name} (mochila llena)`);
  }

  let healthDelta = output.healthDelta;
  if (healthDelta > 0) {
    // Curarse cuesta un objeto de cura: es lo que le da peso al inventario.
    const usedHealingItem = droppedItems.some((item) => item.kind === "cura");
    healthDelta = usedHealingItem ? Math.min(healthDelta, HEAL_CAP) : 0;
  } else {
    healthDelta = Math.max(healthDelta, -DAMAGE_CAP[danger]);
  }

  let health = clamp(state.health + healthDelta, 0, MAX_HEALTH);

  // La muerte narrativa directa sólo se acepta con el peligro ya alto, para
  // que el modelo no pueda matarte de la nada en una escena tranquila.
  const fatalAllowed =
    output.fatal && (danger === "ALTO" || danger === "EXTREMO");
  if (fatalAllowed) {
    healthDelta = -state.health;
    health = 0;
  }

  if (healthDelta !== 0) {
    notices.unshift(`${healthDelta > 0 ? "+" : "−"}${Math.abs(healthDelta)} ♥`);
  }

  const statusSet = new Set(state.statuses);
  for (const status of output.statusRemoved) {
    if (statusSet.delete(status)) notices.push(`✓ ${status} curado`);
  }
  for (const status of output.statusAdded) {
    if (!statusSet.has(status)) {
      statusSet.add(status);
      notices.push(`☣ ${status}`);
    }
  }
  const statuses = STATUS_EFFECTS.filter((status) => statusSet.has(status));
  const infectionAge = statuses.includes("INFECCION") ? state.infectionAge : 0;

  let clues = state.clues;
  if (state.phase === "RASTRO" && output.clueFound) {
    clues = Math.min(clues + 1, CLUES_TO_ADVANCE);
    notices.push(`🔍 Pista ${clues}/${CLUES_TO_ADVANCE}`);
  }

  const phase = advancePhase(state.phase, clues, output.phaseAdvance);
  if (phase !== state.phase) {
    notices.push(`▸ FASE: ${phase}`);
  }
  // Estar cara a cara con el Infectado 0 nunca es "MEDIO".
  if (phase === "CONFRONTACION") {
    danger = "EXTREMO";
  }

  let outcome = state.outcome;
  let deathCause = state.deathCause;

  if (health <= 0) {
    outcome = "dead";
    deathCause = output.deathCause ?? "Sucumbiste a tus heridas.";
  } else if (
    output.victory &&
    phase === "CONFRONTACION" &&
    hasVictoryItem(inventory)
  ) {
    // Sin arma la victoria se ignora y el enfrentamiento continúa.
    outcome = "victory";
  }

  return {
    state: {
      health,
      inventory,
      statuses,
      danger,
      phase,
      clues,
      infectionAge,
      instinct: state.instinct,
      turn: state.turn + 1,
      outcome,
      deathCause,
    },
    healthDelta,
    notices,
  };
}

/** Descuenta un punto de INSTINTO al improvisar (nunca baja de cero). */
export function spendInstinct(state: GameState): GameState {
  return { ...state, instinct: Math.max(0, state.instinct - 1) };
}

/** Añade los ids que necesita React a las opciones que devolvió el modelo. */
export function withChoiceIds(
  choices: TurnOutput["choices"],
  turn: number
): Choice[] {
  return choices.map((choice, index) => ({
    id: `t${turn}-c${index}`,
    label: choice.label,
    usesItem: choice.usesItem,
  }));
}
