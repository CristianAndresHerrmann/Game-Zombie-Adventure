/**
 * Comprobaciones de las reglas del motor. El motor es puro, así que se puede
 * verificar sin red ni servidor:
 *   npm run check:engine
 */
import {
  BOSS_ATTACK,
  BOSS_HEALTH,
  CLUE_COOLDOWN,
  MAX_INVENTORY,
  applyStatusTick,
  createInitialState,
  hasVictoryItem,
  parseTurnOutput,
  resolveTurn,
  spendInstinct,
} from "@/lib/game/engine";
import type { GameState, Item, TurnOutput } from "@/lib/types";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

function state(patch: Partial<GameState> = {}): GameState {
  return { ...createInitialState(), ...patch };
}

function output(patch: Partial<TurnOutput> = {}): TurnOutput {
  return {
    storyText: "Narración de prueba.",
    imagePrompt: "test scene",
    storySummary: "",
    healthDelta: 0,
    itemsGained: [],
    itemsLost: [],
    statusAdded: [],
    statusRemoved: [],
    danger: "MEDIO",
    clueFound: false,
    phaseAdvance: false,
    fatal: false,
    bossDamage: 0,
    deathCause: null,
    choices: [
      { label: "Avanzar", usesItem: null },
      { label: "Esperar", usesItem: null },
    ],
    ...patch,
  };
}

const KEY_ITEM: Item = { name: "hacha ritual", kind: "clave" };
const WEAPON: Item = { name: "cuchillo de cocina", kind: "arma" };
const CURE: Item = { name: "botiquín", kind: "cura" };

// ---------------------------------------------------------------- parseo

section("Parseo de la salida del modelo");

check(
  "sin storyText devuelve null",
  parseTurnOutput({ storyText: "   ", choices: [] }) === null
);

check(
  "descarta enums inventados y cae en MEDIO",
  parseTurnOutput({ storyText: "x", danger: "APOCALIPTICO" })?.danger === "MEDIO"
);

check(
  "descarta alteraciones desconocidas",
  parseTurnOutput({ storyText: "x", statusAdded: ["SANGRADO", "MAREO"] })
    ?.statusAdded.length === 1
);

check(
  "bossDamage negativo se normaliza a 0",
  parseTurnOutput({ storyText: "x", bossDamage: -50 })?.bossDamage === 0
);

check(
  "recorta a 4 opciones como máximo",
  parseTurnOutput({
    storyText: "x",
    choices: Array.from({ length: 7 }, (_, i) => ({
      label: `op ${i}`,
      usesItem: "",
    })),
  })?.choices.length === 4
);

// ------------------------------------------------------- daño y curación

section("Salud, daño y curación");

{
  const r = resolveTurn(state(), output({ healthDelta: -90 }), "choice");
  check(
    "el daño se acota por nivel de peligro (MEDIO = 25)",
    r.state.health === 75,
    `health=${r.state.health}`
  );
}

{
  const r = resolveTurn(
    state({ health: 50 }),
    output({ healthDelta: 30 }),
    "choice"
  );
  check(
    "curarse sin gastar objeto de cura no cura nada",
    r.state.health === 50,
    `health=${r.state.health}`
  );
}

{
  const r = resolveTurn(
    state({ health: 50, inventory: [CURE] }),
    output({ healthDelta: 30, itemsLost: ["botiquín"] }),
    "choice"
  );
  check(
    "curarse consumiendo el objeto sí cura",
    r.state.health === 80 && r.state.inventory.length === 0,
    `health=${r.state.health}`
  );
}

{
  const r = resolveTurn(
    state({ danger: "ALTO" }),
    output({ danger: "ALTO", fatal: true, deathCause: "Te alcanzaron." }),
    "choice"
  );
  check(
    "fatal con peligro ALTO mata",
    r.state.outcome === "dead" && r.state.health === 0
  );
}

{
  const r = resolveTurn(
    state(),
    output({ danger: "SEGURO", fatal: true }),
    "choice"
  );
  check(
    "fatal se ignora con peligro SEGURO",
    r.state.outcome === "playing" && r.state.health === 100
  );
}

// --------------------------------------------------------------- inventario

section("Inventario");

{
  const r = resolveTurn(
    state({ inventory: [WEAPON, CURE, { name: "palanca", kind: "herramienta" }] }),
    output({
      itemsLost: ["palanca"],
      itemsGained: [{ name: "rifle", kind: "arma" }],
    }),
    "choice"
  );
  check(
    "el canje entra sin desbordar la mochila",
    r.state.inventory.length === MAX_INVENTORY &&
      r.state.inventory.some((i) => i.name === "rifle") &&
      !r.state.inventory.some((i) => i.name === "palanca")
  );
}

{
  const r = resolveTurn(
    state({ inventory: [WEAPON, CURE, { name: "palanca", kind: "herramienta" }] }),
    output({ itemsGained: [{ name: "rifle", kind: "arma" }] }),
    "choice"
  );
  check(
    "pasarse del límite descarta lo más viejo con aviso",
    r.state.inventory.length === MAX_INVENTORY &&
      r.notices.some((n) => n.includes("mochila llena"))
  );
}

{
  const r = resolveTurn(
    state({ inventory: [WEAPON] }),
    output({ itemsGained: [{ name: "Cuchillo de Cocina", kind: "arma" }] }),
    "choice"
  );
  check(
    "no duplica un objeto que ya se tiene",
    r.state.inventory.length === 1
  );
}

// -------------------------------------------------------------- alteraciones

section("Alteraciones y tick de estado");

{
  const { state: after, notices } = applyStatusTick(
    state({ statuses: ["SANGRADO"], health: 100 })
  );
  check(
    "SANGRADO drena 5 por turno",
    after.health === 95 && notices.length === 1,
    `health=${after.health}`
  );
}

{
  const { state: after } = applyStatusTick(
    state({ statuses: ["INFECCION"], health: 100, infectionAge: 6 })
  );
  check(
    "la INFECCION escala con los turnos",
    after.health === 95 && after.infectionAge === 7,
    `health=${after.health}`
  );
}

{
  const { state: after } = applyStatusTick(
    state({ statuses: ["SANGRADO"], health: 3 })
  );
  check(
    "el tick puede matar y deja causa de muerte",
    after.outcome === "dead" && after.deathCause !== null
  );
}

{
  const r = resolveTurn(
    state({ statuses: ["INFECCION"], infectionAge: 5 }),
    output({ statusRemoved: ["INFECCION"] }),
    "choice"
  );
  check(
    "curar la INFECCION resetea su antigüedad",
    r.state.infectionAge === 0 && r.state.statuses.length === 0
  );
}

// --------------------------------------------------------------- A5: pistas

section("A5 — Las pistas cuestan");

{
  const r = resolveTurn(
    state({ turn: 5, lastClueTurn: 0, danger: "MEDIO" }),
    output({ clueFound: true, danger: "MEDIO" }),
    "choice"
  );
  check(
    "una pista legítima se acepta y registra el turno",
    r.state.clues === 1 && r.state.lastClueTurn === 5
  );
}

{
  const r = resolveTurn(
    state({ turn: 5, lastClueTurn: 4, clues: 1 }),
    output({ clueFound: true, danger: "ALTO" }),
    "choice"
  );
  check(
    `pista ignorada dentro del cooldown (${CLUE_COOLDOWN} turnos)`,
    r.state.clues === 1,
    `clues=${r.state.clues}`
  );
}

{
  const r = resolveTurn(
    state({ turn: 10, lastClueTurn: 0 }),
    output({ clueFound: true, danger: "SEGURO" }),
    "choice"
  );
  check(
    "pista ignorada si el peligro del turno es SEGURO",
    r.state.clues === 0,
    `clues=${r.state.clues}`
  );
}

{
  const r = resolveTurn(
    state({ phase: "PERSECUCION", turn: 9, lastClueTurn: 0 }),
    output({ clueFound: true, danger: "ALTO" }),
    "choice"
  );
  check(
    "las pistas sólo cuentan durante RASTRO",
    r.state.clues === 0
  );
}

{
  // Con el cooldown, RASTRO no puede terminar antes de ~8 turnos.
  let s = state();
  let turns = 0;
  while (s.phase === "RASTRO" && turns < 50) {
    s = resolveTurn(s, output({ clueFound: true, danger: "ALTO" }), "choice")
      .state;
    turns += 1;
  }
  check(
    "RASTRO dura al menos 7 turnos aun con el modelo regalando pistas",
    s.phase === "PERSECUCION" && turns >= 7,
    `terminó en ${turns} turnos`
  );
}

// ------------------------------------------------------ A4: objeto clave

section("A4 — Hace falta un objeto clave");

check(
  "un arma común ya no cuenta como objeto de victoria",
  !hasVictoryItem([WEAPON])
);

check("un objeto clave sí cuenta", hasVictoryItem([KEY_ITEM]));

{
  const r = resolveTurn(
    state({ phase: "PERSECUCION", inventory: [WEAPON] }),
    output({ phaseAdvance: true, danger: "ALTO" }),
    "choice"
  );
  check(
    "sin objeto clave no se avanza a CONFRONTACION",
    r.state.phase === "PERSECUCION",
    `phase=${r.state.phase}`
  );
}

{
  const r = resolveTurn(
    state({ phase: "PERSECUCION", inventory: [KEY_ITEM] }),
    output({ phaseAdvance: true, danger: "ALTO" }),
    "choice"
  );
  check(
    "con objeto clave sí se avanza a CONFRONTACION",
    r.state.phase === "CONFRONTACION" && r.state.danger === "EXTREMO"
  );
}

// -------------------------------------------- A1/A3: daño al jefe y victoria

section("A1/A3 — Vida del jefe, topes de daño y victoria");

function bossDamageDealt(
  inventory: Item[],
  actionKind: "choice" | "improvise",
  proposed: number
): number {
  const before = state({
    phase: "CONFRONTACION",
    inventory,
    bossHealth: BOSS_HEALTH,
  });
  const r = resolveTurn(
    before,
    output({ bossDamage: proposed, danger: "EXTREMO" }),
    actionKind
  );
  return BOSS_HEALTH - r.state.bossHealth;
}

check(
  "tope 18 con objeto clave",
  bossDamageDealt([KEY_ITEM], "choice", 999) === 18,
  `daño=${bossDamageDealt([KEY_ITEM], "choice", 999)}`
);

check(
  "tope 8 con arma común",
  bossDamageDealt([WEAPON], "choice", 999) === 8,
  `daño=${bossDamageDealt([WEAPON], "choice", 999)}`
);

check(
  "tope 3 sin objeto útil",
  bossDamageDealt([CURE], "choice", 999) === 3,
  `daño=${bossDamageDealt([CURE], "choice", 999)}`
);

check(
  "improvisar suma +12 sobre el tope (clave: 30)",
  bossDamageDealt([KEY_ITEM], "improvise", 999) === 30,
  `daño=${bossDamageDealt([KEY_ITEM], "improvise", 999)}`
);

check(
  "improvisar sin objeto útil llega a 15",
  bossDamageDealt([CURE], "improvise", 999) === 15
);

check(
  "un daño propuesto por debajo del tope se respeta tal cual",
  bossDamageDealt([KEY_ITEM], "choice", 5) === 5
);

{
  const r = resolveTurn(
    state({ phase: "RASTRO" }),
    output({ bossDamage: 50 }),
    "choice"
  );
  check(
    "fuera de CONFRONTACION el bossDamage se ignora",
    r.state.bossHealth === BOSS_HEALTH
  );
}

{
  const r = resolveTurn(
    state({ phase: "CONFRONTACION", inventory: [KEY_ITEM], bossHealth: 10 }),
    output({ bossDamage: 18, danger: "EXTREMO" }),
    "choice"
  );
  check(
    "la victoria se dispara sola con bossHealth <= 0",
    r.state.outcome === "victory" && r.state.bossHealth === 0
  );
}

{
  const r = resolveTurn(
    state({ phase: "CONFRONTACION", inventory: [KEY_ITEM], bossHealth: 40 }),
    output({ bossDamage: 18, danger: "EXTREMO" }),
    "choice"
  );
  check(
    "con el jefe todavía vivo no hay victoria por más que se lo golpee",
    r.state.outcome === "playing" && r.state.bossHealth === 22
  );
}

{
  const r = resolveTurn(
    state({ phase: "CONFRONTACION", inventory: [KEY_ITEM], bossHealth: 5, health: 4 }),
    output({ bossDamage: 18, healthDelta: -30, danger: "EXTREMO" }),
    "choice"
  );
  check(
    "morir en el mismo turno que el jefe cuenta como muerte, no victoria",
    r.state.outcome === "dead"
  );
}

// ---------------------------------------------------- A2: contraataque

section("A2 — Contraataque garantizado");

{
  const { state: after, notices } = applyStatusTick(
    state({ phase: "CONFRONTACION", health: 100 })
  );
  check(
    `el jefe pega ${BOSS_ATTACK} por turno aunque no haya alteraciones`,
    after.health === 100 - BOSS_ATTACK && notices.length === 1,
    `health=${after.health}`
  );
}

{
  const { state: after } = applyStatusTick(
    state({ phase: "CONFRONTACION", health: 100, statuses: ["SANGRADO"] })
  );
  check(
    "el contraataque se suma al sangrado",
    after.health === 100 - BOSS_ATTACK - 5,
    `health=${after.health}`
  );
}

{
  const { state: after } = applyStatusTick(
    state({ phase: "CONFRONTACION", health: 8 })
  );
  check(
    "llegar herido a la confrontación es morir",
    after.outcome === "dead" && after.deathCause === "El Infectado 0 te alcanzó."
  );
}

{
  const { state: after } = applyStatusTick(state({ phase: "PERSECUCION" }));
  check(
    "fuera de CONFRONTACION no hay contraataque",
    after.health === 100
  );
}

// ------------------------------------- duración real de la confrontación

section("Duración de la confrontación (el piso son 5 turnos)");

/** Simula el mejor caso posible del jugador: siempre daño máximo. */
function simulateFight(instinctsSaved: number): {
  turns: number;
  outcome: GameState["outcome"];
} {
  let s = state({
    phase: "CONFRONTACION",
    inventory: [KEY_ITEM],
    health: 100,
    instinct: instinctsSaved,
    bossHealth: BOSS_HEALTH,
  });
  let turns = 0;

  while (s.outcome === "playing" && turns < 40) {
    const useInstinct = s.instinct > 0;
    if (useInstinct) s = spendInstinct(s);

    const ticked = applyStatusTick(s);
    s = ticked.state;
    if (s.outcome !== "playing") {
      turns += 1;
      break;
    }

    s = resolveTurn(
      s,
      output({ bossDamage: 999, danger: "EXTREMO" }),
      useInstinct ? "improvise" : "choice"
    ).state;
    turns += 1;
  }

  return { turns, outcome: s.outcome };
}

{
  const best = simulateFight(3);
  check(
    "con los 3 instintos guardados y daño máximo la pelea nunca baja de 5 turnos",
    best.turns >= 5,
    `duró ${best.turns} turnos (outcome=${best.outcome})`
  );
  check(
    "…y ese mejor caso sí se puede ganar",
    best.outcome === "victory",
    `outcome=${best.outcome}`
  );
}

{
  const noInstinct = simulateFight(0);
  check(
    "sin instintos la pelea se estira a 7 turnos o más",
    noInstinct.turns >= 7,
    `duró ${noInstinct.turns} turnos (outcome=${noInstinct.outcome})`
  );
}

{
  // 7 turnos de contraataque son 84 de daño: llegar a la mitad de vida mata.
  let s = state({
    phase: "CONFRONTACION",
    inventory: [WEAPON],
    health: 60,
    instinct: 0,
    bossHealth: BOSS_HEALTH,
  });
  let turns = 0;
  while (s.outcome === "playing" && turns < 40) {
    s = applyStatusTick(s).state;
    if (s.outcome !== "playing") break;
    s = resolveTurn(s, output({ bossDamage: 999, danger: "EXTREMO" }), "choice")
      .state;
    turns += 1;
  }
  check(
    "llegar a la confrontación herido y sin objeto clave es morir",
    s.outcome === "dead",
    `outcome=${s.outcome} en ${turns} turnos`
  );
}

// -------------------------------------------------- storySummary y misc

section("Resumen de la historia e instinto");

{
  const r = resolveTurn(
    state({ storySummary: "viejo" }),
    output({ storySummary: "nuevo resumen" }),
    "choice"
  );
  check(
    "el resumen del modelo reemplaza al anterior",
    r.state.storySummary === "nuevo resumen"
  );
}

{
  const r = resolveTurn(
    state({ storySummary: "viejo" }),
    output({ storySummary: "" }),
    "choice"
  );
  check(
    "si el modelo omite el resumen se conserva el anterior",
    r.state.storySummary === "viejo"
  );
}

check(
  "el instinto nunca baja de cero",
  spendInstinct(state({ instinct: 0 })).instinct === 0
);

check(
  "improvisar descuenta un punto de instinto",
  spendInstinct(state({ instinct: 3 })).instinct === 2
);

// ------------------------------------------------------------------ total

console.log(
  `\n${failures.length === 0 ? "TODO OK" : "HAY FALLOS"} — ${passed} comprobaciones pasadas, ${failures.length} fallidas.`
);
if (failures.length > 0) {
  for (const f of failures) console.log(`  · ${f}`);
  process.exit(1);
}
