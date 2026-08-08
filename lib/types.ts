export type SceneStatus = "streaming" | "complete";

export const DANGER_LEVELS = ["SEGURO", "MEDIO", "ALTO", "EXTREMO"] as const;
export type DangerLevel = (typeof DANGER_LEVELS)[number];

export const STATUS_EFFECTS = [
  "SANGRADO",
  "INFECCION",
  "FRACTURA",
  "AGOTAMIENTO",
] as const;
export type StatusEffect = (typeof STATUS_EFFECTS)[number];

export const OBJECTIVE_PHASES = [
  "RASTRO",
  "PERSECUCION",
  "CONFRONTACION",
] as const;
export type ObjectivePhase = (typeof OBJECTIVE_PHASES)[number];

export const ITEM_KINDS = ["arma", "cura", "herramienta", "clave"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export type RunOutcome = "playing" | "dead" | "victory";

export type Item = {
  name: string;
  kind: ItemKind;
};

export type GameState = {
  health: number; // 0..100
  inventory: Item[]; // máximo MAX_INVENTORY objetos
  statuses: StatusEffect[];
  danger: DangerLevel;
  phase: ObjectivePhase;
  clues: number; // 0..CLUES_TO_ADVANCE, sólo cuenta durante RASTRO
  // Turnos que lleva activa la INFECCION: el daño por turno escala con esto.
  infectionAge: number;
  instinct: number; // improvisaciones libres restantes
  turn: number;
  outcome: RunOutcome;
  deathCause: string | null;
};

export type Choice = {
  id: string;
  label: string;
  usesItem: string | null; // objeto del inventario que la opción usa
};

export type Scene = {
  id: string;
  userAction: string | null; // null en la escena inicial
  storyText: string; // se completa progresivamente mientras streamea
  // undefined = todavía no llegó la respuesta de imagen (se está "buscando
  // señal"); null = se generó pero falló (interferencia permanente);
  // string = data URL lista para mostrar.
  imageUrl: string | null | undefined;
  status: SceneStatus;
  notices: string[]; // cambios del turno ya formateados ("−18 ♥", "+ venda")
  choices: Choice[];
  // Estado al cerrar el turno. Se guarda por escena para que los efectos
  // visuales de cada ilustración correspondan al momento en que ocurrió.
  stateAfter: GameState | null;
};

export type HistoryTurn = {
  role: "user" | "narrator";
  text: string;
};

export type ChatRequest = {
  history: HistoryTurn[];
  userMessage: string | null;
  state: GameState;
  // "improvise" cuesta un punto de INSTINTO y avisa al narrador de que la
  // acción es texto libre, no una opción que él mismo redactó.
  actionKind: "choice" | "improvise";
};

// Forma que devuelve el modelo, garantizada por el JSON schema de la petición.
export type TurnOutput = {
  storyText: string;
  imagePrompt: string;
  healthDelta: number;
  itemsGained: Item[];
  itemsLost: string[];
  statusAdded: StatusEffect[];
  statusRemoved: StatusEffect[];
  danger: DangerLevel;
  clueFound: boolean;
  phaseAdvance: boolean;
  fatal: boolean;
  victory: boolean;
  deathCause: string | null;
  choices: { label: string; usesItem: string | null }[];
};

// StreamEvent es el tipo de evento que se envía al cliente mientras se genera la escena.
export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "image"; imageUrl: string | null }
  | { type: "state"; state: GameState; healthDelta: number; notices: string[] }
  | { type: "choices"; choices: Choice[] }
  | { type: "done" }
  | { type: "error" };
