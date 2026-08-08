"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Loader2, PenLine, Send, Sparkles, X } from "lucide-react";
import { IMPROVISE_MAX_CHARS, STARTING_INSTINCT } from "@/lib/game/engine";
import type { Choice } from "@/lib/types";

type Props = {
  choices: Choice[];
  instinct: number;
  loading: boolean;
  onChoose: (label: string) => void;
  onImprovise: (text: string) => void;
};

export default function ChoiceButtons({
  choices,
  instinct,
  loading,
  onChoose,
  onImprovise,
}: Props) {
  const [improvising, setImprovising] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (improvising) inputRef.current?.focus();
  }, [improvising]);

  const noInstinct = instinct <= 0;

  // Cualquier acción cierra el panel: al volver, el jugador encuentra las
  // opciones nuevas y no el input a medio escribir del turno anterior.
  function choose(label: string) {
    setImprovising(false);
    setText("");
    onChoose(label);
  }

  function submitImprovisation() {
    const trimmed = text.trim();
    if (!trimmed || loading || noInstinct) return;
    setText("");
    setImprovising(false);
    onImprovise(trimmed);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-4 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="font-heading text-[10px] tracking-wide">
          TRANSMITIENDO…
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {choices.map((choice) => (
          <li key={choice.id}>
            <button
              type="button"
              onClick={() => choose(choice.label)}
              className="group flex w-full items-center gap-3 rounded-md border bg-slate-950/80 px-4 py-3 text-left text-sm text-slate-200 transition hover:bg-[var(--danger-soft)] hover:text-white"
              style={{ borderColor: "var(--danger-border)" }}
            >
              <ChevronRight
                className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                style={{ color: "var(--danger-accent)" }}
              />
              <span className="flex-1">{choice.label}</span>
              {choice.usesItem ? (
                <span className="shrink-0 rounded border border-emerald-500/40 bg-emerald-950/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-300">
                  {choice.usesItem}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      {improvising ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitImprovisation();
          }}
          className="flex items-center gap-2 rounded-md border border-cyan-600/40 bg-slate-950/80 px-3 py-2"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-cyan-500" />
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={IMPROVISE_MAX_CHARS}
            placeholder="Una acción corta y concreta…"
            className="min-w-0 flex-1 bg-transparent py-1 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none"
          />
          <span className="shrink-0 font-heading text-[9px] tabular-nums text-slate-600">
            {text.length}/{IMPROVISE_MAX_CHARS}
          </span>
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Enviar acción improvisada"
            className="shrink-0 rounded p-1.5 text-cyan-400 transition hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:text-slate-700"
          >
            <Send className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setImprovising(false)}
            aria-label="Cancelar improvisación"
            className="shrink-0 rounded p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setImprovising(true)}
          disabled={noInstinct}
          title={
            noInstinct
              ? "Te quedaste sin instinto: sólo podés elegir entre las opciones."
              : `Improvisar una acción propia (${instinct} de ${STARTING_INSTINCT} restantes)`
          }
          className="flex items-center gap-2 self-start rounded-md border border-dashed border-slate-700 px-3 py-2 text-xs text-slate-500 transition hover:border-cyan-600/50 hover:text-cyan-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-700 disabled:hover:text-slate-500"
        >
          <PenLine className="h-3.5 w-3.5" />
          Improvisar
          <span className="font-heading text-[9px] tracking-[0.15em] text-cyan-500/70">
            {Array.from({ length: STARTING_INSTINCT }, (_, i) =>
              i < instinct ? "◆" : "◇"
            ).join("")}
          </span>
        </button>
      )}
    </div>
  );
}
