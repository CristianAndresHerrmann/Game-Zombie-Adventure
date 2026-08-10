import { BOSS_HEALTH, CLUES_TO_ADVANCE } from "@/lib/game/engine";
import type { GameState, Scene } from "@/lib/types";

const PHASE_LABELS: Record<GameState["phase"], string> = {
  RASTRO: "Rastro",
  PERSECUCION: "Persecución",
  CONFRONTACION: "Confrontación",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Los bytes de la ilustración sólo existen en el blob del navegador, así que
 * hay que recuperarlos para poder embeberlos: el archivo tiene que abrirse
 * sin conexión y sin depender de esta pestaña.
 */
async function toDataUrl(objectUrl: string): Promise<string | null> {
  try {
    const blob = await (await fetch(objectUrl)).blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const STYLES = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 2.5rem 1.25rem 4rem;
    background: #0b0f19;
    color: #e2e8f0;
    font-family: ui-monospace, "Cascadia Mono", "Segoe UI Mono", "DejaVu Sans Mono", monospace;
    line-height: 1.7;
  }
  main { max-width: 46rem; margin: 0 auto; }
  h1 { font-size: 1.4rem; letter-spacing: 0.08em; color: #34d399; margin: 0 0 0.35rem; }
  h2 { font-size: 0.95rem; letter-spacing: 0.08em; color: #94a3b8; margin: 3rem 0 1rem; }
  .sub { color: #64748b; font-size: 0.85rem; margin: 0 0 2rem; }
  .verdict { border: 1px solid; border-radius: 0.5rem; padding: 1.25rem 1.5rem; margin-bottom: 2rem; }
  .verdict.win { border-color: rgba(16,185,129,0.5); background: rgba(6,78,59,0.2); }
  .verdict.loss { border-color: rgba(220,38,38,0.5); background: rgba(69,10,10,0.2); }
  .verdict h2 { margin: 0 0 0.5rem; font-size: 1rem; }
  .verdict.win h2 { color: #6ee7b7; }
  .verdict.loss h2 { color: #fca5a5; }
  .verdict p { margin: 0; color: #cbd5e1; }
  dl { display: grid; grid-template-columns: 1fr auto; gap: 0.4rem 1.5rem; margin: 0; font-size: 0.85rem; }
  dt { color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
  dd { margin: 0; text-align: right; color: #e2e8f0; }
  .summary { border-left: 2px solid #334155; padding-left: 1rem; color: #94a3b8; font-style: italic; }
  .scene { margin: 3rem 0; padding-top: 2rem; border-top: 1px solid #1e293b; }
  .scene:first-of-type { border-top: none; }
  .turn { font-size: 0.7rem; letter-spacing: 0.12em; color: #475569; text-transform: uppercase; }
  .action { color: #6ee7b7; font-style: italic; margin: 0.35rem 0 1rem; }
  img { width: 100%; height: auto; display: block; border: 1px solid #1e293b; border-radius: 0.5rem; image-rendering: pixelated; }
  .no-image { border: 1px dashed #334155; border-radius: 0.5rem; padding: 2.5rem; text-align: center; color: #475569; font-size: 0.8rem; }
  .story p { margin: 1rem 0; font-size: 1rem; }
  ul.notices { list-style: none; padding: 0; margin: 1rem 0 0; display: flex; flex-wrap: wrap; gap: 0.4rem; }
  ul.notices li { border: 1px solid #334155; border-radius: 0.25rem; padding: 0.2rem 0.5rem; font-size: 0.7rem; color: #94a3b8; }
  footer { margin-top: 4rem; padding-top: 1.5rem; border-top: 1px solid #1e293b; color: #475569; font-size: 0.75rem; text-align: center; }
`;

function buildStatsBlock(state: GameState): string {
  const rows: [string, string][] = [
    ["Turnos sobrevividos", String(state.turn)],
    ["Fase alcanzada", PHASE_LABELS[state.phase]],
    ["Pistas encontradas", `${state.clues}/${CLUES_TO_ADVANCE}`],
    ["Salud final", `${state.health}%`],
    [
      "Inventario final",
      state.inventory.length > 0
        ? state.inventory.map((i) => i.name).join(" · ")
        : "vacío",
    ],
    [
      "Alteraciones finales",
      state.statuses.length > 0 ? state.statuses.join(" · ") : "ninguna",
    ],
  ];

  if (state.phase === "CONFRONTACION" && state.outcome !== "victory") {
    rows.push([
      "Vida restante del Infectado 0",
      `${state.bossHealth}/${BOSS_HEALTH}`,
    ]);
  }

  return `<dl>${rows
    .map(
      ([label, value]) =>
        `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`
    )
    .join("")}</dl>`;
}

function buildVerdict(state: GameState): string {
  if (state.outcome === "victory") {
    return `<div class="verdict win"><h2>INFECTADO 0 ELIMINADO</h2><p>Cortaste el brote en su origen. Alguien, en algún lado, va a poder volver a empezar.</p></div>`;
  }
  if (state.outcome === "dead") {
    const cause = state.deathCause ?? "No lograste sobrevivir.";
    return `<div class="verdict loss"><h2>FIN DE LA TRANSMISIÓN</h2><p>${escapeHtml(cause)}</p></div>`;
  }
  return `<div class="verdict loss"><h2>TRANSMISIÓN EN CURSO</h2><p>La partida seguía abierta cuando se guardó este registro.</p></div>`;
}

function buildSceneBlock(
  scene: Scene,
  index: number,
  imageData: string | null
): string {
  const action = scene.userAction
    ? `<p class="action">&gt; ${escapeHtml(scene.userAction)}</p>`
    : "";

  const image = imageData
    ? `<img src="${imageData}" alt="Ilustración de la escena ${index + 1}">`
    : `<div class="no-image">— señal perdida, sin ilustración —</div>`;

  const story = scene.storyText
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("");

  const notices =
    scene.notices.length > 0
      ? `<ul class="notices">${scene.notices
          .map((n) => `<li>${escapeHtml(n)}</li>`)
          .join("")}</ul>`
      : "";

  return `<section class="scene">
    <p class="turn">Escena ${index + 1}</p>
    ${action}
    ${image}
    <div class="story">${story}</div>
    ${notices}
  </section>`;
}

/** Documento HTML autocontenido: sin fuentes, scripts ni requests externos. */
export async function buildStoryHtml(
  scenes: Scene[],
  state: GameState
): Promise<string> {
  const images = await Promise.all(
    scenes.map((scene) =>
      scene.imageUrl ? toDataUrl(scene.imageUrl) : Promise.resolve(null)
    )
  );

  const savedAt = new Date().toLocaleString("es-AR");

  const summary = state.storySummary
    ? `<h2>SINOPSIS</h2><p class="summary">${escapeHtml(state.storySummary)}</p>`
    : "";

  const body = `<main>
    <h1>ZOMBIE ADVENTURE — SURVIVAL GAME</h1>
    <p class="sub">Registro de partida · ${escapeHtml(savedAt)}</p>
    ${buildVerdict(state)}
    ${buildStatsBlock(state)}
    ${summary}
    <h2>LA HISTORIA</h2>
    ${scenes.map((scene, i) => buildSceneBlock(scene, i, images[i])).join("")}
    <footer>Generado por Zombie Adventure Survival Game.</footer>
  </main>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Zombie Adventure — registro de partida</title>
<style>${STYLES}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export async function downloadStory(
  scenes: Scene[],
  state: GameState
): Promise<void> {
  const html = await buildStoryHtml(scenes, state);
  const url = URL.createObjectURL(
    new Blob([html], { type: "text/html;charset=utf-8" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `zombie-adventure-${timestamp()}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
