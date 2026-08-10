import { Download, RotateCcw, Skull, Trophy } from "lucide-react";
import { BOSS_HEALTH, CLUES_TO_ADVANCE } from "@/lib/game/engine";
import type { GameState } from "@/lib/types";

const PHASE_LABELS: Record<GameState["phase"], string> = {
  RASTRO: "Rastro",
  PERSECUCION: "Persecución",
  CONFRONTACION: "Confrontación",
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-800/80 py-2 last:border-b-0">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-right text-sm text-slate-200">{value}</dd>
    </div>
  );
}

export default function GameOverScreen({
  state,
  onRestart,
  onDownload,
  downloading,
}: {
  state: GameState;
  onRestart: () => void;
  onDownload: () => void;
  downloading: boolean;
}) {
  const won = state.outcome === "victory";
  const diedFighting = !won && state.phase === "CONFRONTACION";

  return (
    <section
      className={`mx-auto flex max-w-xl flex-col items-center gap-6 rounded-lg border px-6 py-10 text-center ${
        won
          ? "border-emerald-500/50 bg-emerald-950/20 shadow-[0_0_45px_-12px_rgba(16,185,129,0.55)]"
          : "border-red-700/50 bg-red-950/20 shadow-[0_0_45px_-12px_rgba(220,38,38,0.55)]"
      }`}
    >
      {won ? (
        <Trophy className="h-14 w-14 text-emerald-400" strokeWidth={1.25} />
      ) : (
        <Skull className="h-14 w-14 text-red-500" strokeWidth={1.25} />
      )}

      <div className="space-y-3">
        <h2
          className={`glitch-text font-heading text-base ${
            won ? "text-emerald-300" : "text-red-400"
          }`}
        >
          {won ? "INFECTADO 0 ELIMINADO" : "FIN DE LA TRANSMISIÓN"}
        </h2>
        <p className="text-sm text-slate-300">
          {won
            ? "Cortaste el brote en su origen. Alguien, en algún lado, va a poder volver a empezar."
            : (state.deathCause ?? "No lograste sobrevivir.")}
        </p>
      </div>

      <dl className="w-full text-left">
        <Stat label="Turnos sobrevividos" value={String(state.turn)} />
        <Stat label="Fase alcanzada" value={PHASE_LABELS[state.phase]} />
        <Stat
          label="Pistas encontradas"
          value={`${state.clues}/${CLUES_TO_ADVANCE}`}
        />
        <Stat
          label="Inventario final"
          value={
            state.inventory.length > 0
              ? state.inventory.map((item) => item.name).join(" · ")
              : "vacío"
          }
        />
        <Stat
          label="Alteraciones finales"
          value={
            state.statuses.length > 0 ? state.statuses.join(" · ") : "ninguna"
          }
        />
        <Stat label="Salud final" value={`${state.health}%`} />
        {diedFighting ? (
          <Stat
            label="Vida que le quedaba al Infectado 0"
            value={`${state.bossHealth}/${BOSS_HEALTH}`}
          />
        ) : null}
      </dl>

      <div className="flex w-full flex-col items-center gap-3">
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading}
          className="flex w-full max-w-xs items-center justify-center gap-3 rounded-lg border border-slate-500 bg-slate-100/5 px-6 py-3 font-heading text-xs text-slate-200 transition hover:bg-slate-100/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {downloading ? "Guardando…" : "Descargar la historia"}
        </button>
        <p className="text-xs text-slate-500">
          Un archivo HTML con las ilustraciones adentro. Se abre sin conexión.
        </p>

        <button
          type="button"
          onClick={onRestart}
          className={`mt-2 flex items-center gap-3 rounded-lg border px-6 py-3 font-heading text-xs transition ${
            won
              ? "border-emerald-500 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
              : "border-red-600 bg-red-600/10 text-red-300 hover:bg-red-600/20"
          }`}
        >
          <RotateCcw className="h-4 w-4" />
          Nueva Partida
        </button>
      </div>
    </section>
  );
}
