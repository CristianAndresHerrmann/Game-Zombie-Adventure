"use client";

import { useEffect } from "react";
import {
  Backpack,
  Ban,
  Biohazard,
  Check,
  Crosshair,
  Heart,
  PenLine,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  CLUES_TO_ADVANCE,
  IMPROVISE_MAX_CHARS,
  MAX_INVENTORY,
  STARTING_INSTINCT,
} from "@/lib/game/engine";

type Rule = {
  icon: typeof Heart;
  title: string;
  body: string;
};

const RULES: Rule[] = [
  {
    icon: Crosshair,
    title: "El objetivo",
    body: `Encontrar y eliminar al Infectado 0. Se llega en tres fases: RASTRO (juntar ${CLUES_TO_ADVANCE} pistas sobre su paradero), PERSECUCIÓN (viajar hasta el foco) y CONFRONTACIÓN (enfrentarlo). Sin un arma u objeto clave en la mochila no vas a poder rematarlo, por más cerca que estés.`,
  },
  {
    icon: Heart,
    title: "La salud",
    body: "Arrancás en 100%. Cada decisión puede costarte vida y cuanto más alto el peligro, más podés perder de un solo golpe. Si llega a 0%, la partida termina ahí: no hay guardado ni segunda oportunidad.",
  },
  {
    icon: Biohazard,
    title: "Las alteraciones",
    body: "SANGRADO, INFECCIÓN, FRACTURA y AGOTAMIENTO te drenan vida cada turno, antes incluso de que decidas nada. La infección empeora con el tiempo. Curarlas requiere encontrar con qué.",
  },
  {
    icon: Backpack,
    title: "El inventario",
    body: `Sólo entran ${MAX_INVENTORY} objetos. Los de curación se gastan al usarlos. Si encontrás algo con la mochila llena, la opción va a plantearte el canje: para llevarte algo, tenés que soltar algo.`,
  },
  {
    icon: TriangleAlert,
    title: "El medidor de peligro",
    body: "SEGURO, MEDIO, ALTO y EXTREMO. Tiñe toda la pantalla y define cuánto puede salirte mal un turno. Cuando el mundo se pone rojo, es literal.",
  },
  {
    icon: PenLine,
    title: "El instinto",
    body: `Además de elegir entre las opciones, podés escribir tu propia acción, pero sólo ${STARTING_INSTINCT} veces por partida y en un máximo de ${IMPROVISE_MAX_CHARS} caracteres. Guardalos para cuando ninguna opción te sirva.`,
  },
];

const CAN_DO = [
  "Elegir entre las 2 a 4 opciones de cada turno.",
  "Usar los objetos que tengas en la mochila.",
  "Improvisar acciones cortas, concretas y humanamente posibles.",
  "Huir, esconderte, negociar o registrar un lugar en vez de pelear.",
];

const CANNOT_DO = [
  "Usar un objeto que no figure en tu inventario.",
  "Ganar peleas imposibles: escribir «los mato a todos» se narra como un fracaso costoso, no como una victoria.",
  "Contar con que algo salga bien: ninguna acción tiene éxito automático.",
  "Matar al Infectado 0 sin un arma u objeto clave encima.",
];

export default function HowToPlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cómo jugar"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="my-auto w-full max-w-2xl rounded-lg border border-emerald-500/30 bg-[#0b0f19] shadow-[0_0_45px_-10px_rgba(16,185,129,0.5)]"
      >
        <div className="flex items-center justify-between gap-4 border-b border-emerald-500/20 px-5 py-4">
          <h2 className="font-heading text-[11px] tracking-wide text-emerald-400">
            CÓMO JUGAR
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="hazard-stripes h-1 w-full opacity-70" aria-hidden />

        <div className="space-y-6 px-5 py-5">
          <p className="text-sm leading-relaxed text-slate-400">
            Sos una persona común en el primer día del brote. No tenés
            entrenamiento, ni puntería, ni suerte. Todo lo que hagas tiene un
            costo, y el narrador te lo va a cobrar.
          </p>

          <ul className="space-y-4">
            {RULES.map((rule) => (
              <li key={rule.title} className="flex gap-3">
                <rule.icon
                  className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"
                  strokeWidth={2}
                />
                <div className="space-y-1">
                  <h3 className="font-heading text-[10px] tracking-wide text-slate-200">
                    {rule.title.toUpperCase()}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-400">
                    {rule.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-emerald-600/30 bg-emerald-950/20 p-4">
              <h3 className="mb-3 flex items-center gap-2 font-heading text-[10px] tracking-wide text-emerald-300">
                <Check className="h-3.5 w-3.5" />
                PODÉS
              </h3>
              <ul className="space-y-2">
                {CAN_DO.map((line) => (
                  <li key={line} className="text-xs leading-relaxed text-slate-400">
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-md border border-red-700/40 bg-red-950/20 p-4">
              <h3 className="mb-3 flex items-center gap-2 font-heading text-[10px] tracking-wide text-red-300">
                <Ban className="h-3.5 w-3.5" />
                NO PODÉS
              </h3>
              <ul className="space-y-2">
                {CANNOT_DO.map((line) => (
                  <li key={line} className="text-xs leading-relaxed text-slate-400">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="flex items-start gap-2 border-t border-slate-800 pt-4 text-xs leading-relaxed text-slate-500">
            <Search className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Debajo de cada escena aparecen los cambios del turno: vida perdida o
            recuperada, objetos que entran o salen y alteraciones nuevas.
          </p>
        </div>

        <div className="border-t border-slate-800 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-md border border-emerald-500 bg-emerald-500/10 px-4 py-2.5 font-heading text-[10px] tracking-wide text-emerald-300 transition hover:bg-emerald-500/20"
          >
            ENTENDIDO
          </button>
        </div>
      </div>
    </div>
  );
}
