import { ImageOff } from "lucide-react";
import type { GameState, Scene } from "@/lib/types";

function SignalPanel({ searching }: { searching: boolean }) {
  return (
    <div className="relative flex h-full w-full items-center justify-center bg-slate-950">
      <div
        aria-hidden
        className={`tv-static absolute inset-0 ${
          searching ? "tv-static-live opacity-70" : "opacity-25"
        }`}
      />
      {!searching ? (
        <ImageOff
          className="relative h-9 w-9 text-emerald-500/40"
          strokeWidth={1.25}
        />
      ) : null}
    </div>
  );
}

function frameEffects(state: GameState): string {
  const classes: string[] = [];
  if (state.danger === "EXTREMO") classes.push("fx-extreme");
  if (state.statuses.includes("INFECCION")) classes.push("fx-infection");
  if (state.statuses.includes("SANGRADO")) classes.push("fx-bleeding");
  if (state.health <= 30) classes.push("fx-lowhealth");
  return classes.join(" ");
}

function noticeTone(notice: string): string {
  if (notice.startsWith("−") || notice.startsWith("☣")) {
    return "border-red-700/40 bg-red-950/30 text-red-300";
  }
  if (notice.startsWith("+") || notice.startsWith("✓")) {
    return "border-emerald-600/40 bg-emerald-950/30 text-emerald-300";
  }
  return "border-amber-600/40 bg-amber-950/30 text-amber-300";
}

export default function SceneCard({
  scene,
  state,
}: {
  scene: Scene;
  state: GameState;
}) {
  const isStreaming = scene.status === "streaming";
  const paragraphs = scene.storyText.split(/\n{2,}/).filter(Boolean);

  return (
    <article className="flex flex-col gap-4">
      {scene.userAction ? (
        <p className="pl-1 text-sm italic text-emerald-400/80">
          &gt; {scene.userAction}
        </p>
      ) : null}

      <div
        // Redefine las variables de color acá adentro, así cada escena
        // conserva el clima que tenía cuando ocurrió.
        data-danger={state.danger}
        className={`scanlines relative aspect-video w-full overflow-hidden rounded-lg border bg-slate-950 ${frameEffects(state)}`}
        style={{
          borderColor: "var(--danger-border)",
          boxShadow: "0 0 25px -5px var(--danger-glow)",
        }}
      >
        {scene.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- fuente es un data URL base64, next/image no aporta nada aquí
          <img
            src={scene.imageUrl}
            alt={
              scene.userAction
                ? `Escena pixel art: ${scene.userAction}`
                : "Escena inicial del apocalipsis zombie"
            }
            className="pixelated h-full w-full object-cover"
          />
        ) : (
          <SignalPanel searching={scene.imageUrl === undefined} />
        )}
      </div>

      <div className="space-y-3 px-1 text-lg leading-relaxed text-slate-200">
        {paragraphs.length === 0 && isStreaming ? (
          <p className="stream-cursor min-h-[1.75rem] text-slate-400" />
        ) : (
          paragraphs.map((paragraph, i) => (
            <p
              key={i}
              className={
                isStreaming && i === paragraphs.length - 1
                  ? "stream-cursor"
                  : undefined
              }
            >
              {paragraph}
            </p>
          ))
        )}
      </div>

      {scene.notices.length > 0 ? (
        <ul className="notice-row flex flex-wrap gap-2 px-1">
          {scene.notices.map((notice, i) => (
            <li
              key={`${notice}-${i}`}
              className={`rounded border px-2 py-1 font-heading text-[9px] tracking-wide ${noticeTone(notice)}`}
            >
              {notice}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
