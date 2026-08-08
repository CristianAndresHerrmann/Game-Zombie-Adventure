import {
  Backpack,
  Biohazard,
  Bone,
  Crosshair,
  Heart,
  KeyRound,
  Pill,
  Search,
  Sparkles,
  Wrench,
  Zap,
} from "lucide-react";
import { CLUES_TO_ADVANCE, MAX_INVENTORY, STARTING_INSTINCT } from "@/lib/game/engine";
import { DANGER_LEVELS } from "@/lib/types";
import type { GameState, ItemKind, StatusEffect } from "@/lib/types";

const ITEM_ICONS: Record<ItemKind, typeof Wrench> = {
  arma: Crosshair,
  cura: Pill,
  herramienta: Wrench,
  clave: KeyRound,
};

const STATUS_ICONS: Record<StatusEffect, typeof Wrench> = {
  SANGRADO: Heart,
  INFECCION: Biohazard,
  FRACTURA: Bone,
  AGOTAMIENTO: Zap,
};

const STATUS_COLORS: Record<StatusEffect, string> = {
  SANGRADO: "border-red-600/50 bg-red-950/40 text-red-300",
  INFECCION: "border-lime-600/50 bg-lime-950/40 text-lime-300",
  FRACTURA: "border-slate-500/50 bg-slate-900 text-slate-300",
  AGOTAMIENTO: "border-amber-600/50 bg-amber-950/40 text-amber-300",
};

const PHASE_LABELS: Record<GameState["phase"], string> = {
  RASTRO: "RASTRO",
  PERSECUCION: "PERSECUCIÓN",
  CONFRONTACION: "CONFRONTACIÓN",
};

function Pips({ filled, total }: { filled: number; total: number }) {
  return (
    <span className="tracking-[0.15em]" aria-hidden>
      {Array.from({ length: total }, (_, i) => (i < filled ? "◆" : "◇")).join("")}
    </span>
  );
}

function HealthMeter({ health }: { health: number }) {
  const tone =
    health > 60
      ? "bg-emerald-500"
      : health > 30
        ? "bg-amber-500"
        : "bg-red-600";
  const critical = health <= 30;

  return (
    <div className="flex items-center gap-2">
      <Heart
        className={`h-4 w-4 shrink-0 ${
          critical ? "animate-pulse text-red-500" : "text-emerald-400"
        }`}
        fill="currentColor"
        strokeWidth={0}
      />
      <div className="h-2 w-20 overflow-hidden rounded-full border border-slate-700 bg-slate-950 sm:w-28">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${tone}`}
          style={{ width: `${health}%` }}
        />
      </div>
      <span
        className="font-heading text-[9px] tabular-nums text-slate-300"
        aria-label={`Salud ${health} por ciento`}
      >
        {health}%
      </span>
    </div>
  );
}

function InventorySlots({ inventory }: { inventory: GameState["inventory"] }) {
  return (
    <div className="flex items-center gap-1.5">
      <Backpack className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={1.5} />
      <ul className="flex items-center gap-1">
        {Array.from({ length: MAX_INVENTORY }, (_, i) => {
          const item = inventory[i];
          if (!item) {
            return (
              <li
                key={`empty-${i}`}
                className="h-6 w-6 rounded border border-dashed border-slate-700/80"
                aria-hidden
              />
            );
          }
          const Icon = ITEM_ICONS[item.kind];
          return (
            <li
              key={item.name}
              title={`${item.name} (${item.kind})`}
              className="flex h-6 w-6 items-center justify-center rounded border border-emerald-500/40 bg-emerald-950/40 text-emerald-300"
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="sr-only">{item.name}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DangerMeter({ danger }: { danger: GameState["danger"] }) {
  const level = DANGER_LEVELS.indexOf(danger);
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-end gap-0.5" aria-hidden>
        {DANGER_LEVELS.map((_, i) => (
          <span
            key={i}
            className="w-1.5 rounded-sm transition-colors duration-500"
            style={{
              height: `${6 + i * 3}px`,
              backgroundColor:
                i <= level ? "var(--danger-accent)" : "rgb(51 65 85)",
            }}
          />
        ))}
      </div>
      <span
        className="font-heading text-[9px] tracking-wide transition-colors duration-500"
        style={{ color: "var(--danger-accent)" }}
      >
        {danger}
      </span>
    </div>
  );
}

export default function StatusBar({ state }: { state: GameState }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-5 gap-y-3 px-4 pb-3">
      <HealthMeter health={state.health} />
      <InventorySlots inventory={state.inventory} />
      <DangerMeter danger={state.danger} />

      {state.statuses.length > 0 ? (
        <ul className="flex items-center gap-1.5">
          {state.statuses.map((status) => {
            const Icon = STATUS_ICONS[status];
            return (
              <li
                key={status}
                title={status}
                className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide ${STATUS_COLORS[status]}`}
              >
                <Icon className="h-3 w-3" strokeWidth={2} />
                {status}
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="flex w-full items-center gap-4 border-t border-slate-800/80 pt-2 text-[9px] text-slate-400">
        <span className="flex items-center gap-1.5 font-heading tracking-wide">
          <Search className="h-3 w-3 text-slate-500" strokeWidth={2} />
          {PHASE_LABELS[state.phase]}
          {state.phase === "RASTRO" ? (
            <span className="text-emerald-400/80">
              <Pips filled={state.clues} total={CLUES_TO_ADVANCE} />
            </span>
          ) : null}
        </span>
        <span className="text-slate-600">·</span>
        <span className="truncate text-slate-500">Objetivo: Infectado 0</span>
        <span
          className="ml-auto flex shrink-0 items-center gap-1.5 font-heading tracking-wide"
          title={`Improvisaciones libres restantes: ${state.instinct} de ${STARTING_INSTINCT}`}
        >
          <Sparkles className="h-3 w-3 text-cyan-500/80" strokeWidth={2} />
          <span className="text-cyan-400/80">
            <Pips filled={state.instinct} total={STARTING_INSTINCT} />
          </span>
        </span>
      </div>
    </div>
  );
}
