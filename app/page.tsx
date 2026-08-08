"use client";

import { useEffect, useRef, useState } from "react";
import {
  Biohazard,
  HelpCircle,
  RadioOff,
  RotateCcw,
  Skull,
} from "lucide-react";
import ChoiceButtons from "@/components/ChoiceButtons";
import GameOverScreen from "@/components/GameOverScreen";
import HowToPlay from "@/components/HowToPlay";
import SceneCard from "@/components/SceneCard";
import StatusBar from "@/components/StatusBar";
import { createInitialState, spendInstinct } from "@/lib/game/engine";
import type { GameState, HistoryTurn, Scene, StreamEvent } from "@/lib/types";

function historyFromScenes(scenes: Scene[]): HistoryTurn[] {
  const turns: HistoryTurn[] = [];
  for (const scene of scenes) {
    if (scene.userAction) {
      turns.push({ role: "user", text: scene.userAction });
    }
    if (scene.storyText) {
      turns.push({ role: "narrator", text: scene.storyText });
    }
  }
  return turns;
}

function makeSceneId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `scene-${Date.now()}-${Math.random()}`;
}

function scrollToBottom() {
  // Salto instantáneo: cada carácter mueve el scroll unos pocos píxeles,
  // así que se ve fluido sin que un "smooth" pise al siguiente.
  window.scrollTo({
    top: document.documentElement.scrollHeight,
    behavior: "auto",
  });
}

export default function Home() {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [gameState, setGameState] = useState<GameState>(createInitialState);
  const [loading, setLoading] = useState(false);
  const [signalLost, setSignalLost] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const started = scenes.length > 0;
  const gameOver = gameState.outcome !== "playing";
  const lastScene = scenes[scenes.length - 1];

  const actionBarRef = useRef<HTMLDivElement | null>(null);
  // Mientras el jugador esté al pie del feed, el scroll sigue a la
  // narración. Si scrollea hacia arriba para releer una escena anterior,
  // dejamos de perseguirlo hasta que vuelva abajo o mande otra acción.
  const followBottomRef = useRef(true);

  useEffect(() => {
    function isNearBottom() {
      const distanceFromBottom =
        document.documentElement.scrollHeight -
        window.innerHeight -
        window.scrollY;
      return distanceFromBottom < 140;
    }

    // El evento `scroll` no sirve para desenganchar: lo dispara también
    // nuestro propio scrollTo, y además llega un frame tarde, así que el
    // siguiente carácter volvería a arrastrar al jugador hacia abajo.
    // Por eso desenganchamos con gestos inequívocamente humanos.
    function handleWheel(event: WheelEvent) {
      if (event.deltaY < 0) followBottomRef.current = false;
    }
    function handleTouchMove() {
      followBottomRef.current = isNearBottom();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (["PageUp", "ArrowUp", "Home"].includes(event.key)) {
        followBottomRef.current = false;
      }
    }
    function handleScroll() {
      if (isNearBottom()) followBottomRef.current = true;
    }

    window.addEventListener("wheel", handleWheel, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    if (followBottomRef.current) scrollToBottom();
  }, [scenes, loading, gameOver]);

  // La barra inferior crece de golpe al terminar el turno: el spinner pasa a
  // ser tres o cuatro botones y taparía las últimas líneas del relato.
  useEffect(() => {
    const bar = actionBarRef.current;
    if (!bar || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      if (followBottomRef.current) scrollToBottom();
    });
    observer.observe(bar);
    return () => observer.disconnect();
  }, [started, gameOver]);

  async function runTurn(
    userMessage: string | null,
    actionKind: "choice" | "improvise"
  ) {
    const sceneId = makeSceneId();
    const historySnapshot = historyFromScenes(scenes);
    const stateBefore = gameState;
    const stateSnapshot =
      actionKind === "improvise" ? spendInstinct(gameState) : gameState;

    setLoading(true);
    setSignalLost(false);
    setGameState(stateSnapshot);
    followBottomRef.current = true;
    // Las opciones de las escenas anteriores se conservan aunque no se
    // muestren: si el turno falla, el rollback devuelve al jugador
    // exactamente los botones que tenía.
    setScenes((prev) => [
      ...prev,
      {
        id: sceneId,
        userAction: userMessage,
        storyText: "",
        imageUrl: undefined,
        status: "streaming",
        notices: [],
        choices: [],
        stateAfter: null,
      },
    ]);

    function patchScene(patch: Partial<Scene> | ((s: Scene) => Partial<Scene>)) {
      setScenes((prev) =>
        prev.map((s) =>
          s.id === sceneId
            ? { ...s, ...(typeof patch === "function" ? patch(s) : patch) }
            : s
        )
      );
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: historySnapshot,
          userMessage,
          state: stateSnapshot,
          actionKind,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error("request-failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as StreamEvent;
          switch (event.type) {
            case "text":
              patchScene((s) => ({ storyText: s.storyText + event.delta }));
              break;
            case "image":
              patchScene({ imageUrl: event.imageUrl });
              break;
            case "state":
              setGameState(event.state);
              patchScene({ notices: event.notices, stateAfter: event.state });
              break;
            case "choices":
              patchScene({ choices: event.choices });
              break;
            case "done":
              patchScene({ status: "complete" });
              break;
            case "error":
              throw new Error("stream-error");
          }
        }
      }
    } catch {
      // Rollback del turno completo, incluido el punto de INSTINTO.
      setScenes((prev) => prev.filter((s) => s.id !== sceneId));
      setGameState(stateBefore);
      setSignalLost(true);
    } finally {
      setLoading(false);
    }
  }

  function handleStart() {
    void runTurn(null, "choice");
  }

  function handleReset() {
    if (started && !gameOver) {
      const confirmed = window.confirm(
        "¿Empezar una nueva partida? Vas a perder el progreso actual."
      );
      if (!confirmed) return;
    }
    setScenes([]);
    setGameState(createInitialState());
    setSignalLost(false);
  }

  return (
    <div data-danger={gameState.danger} className="contents">
      <header
        className="sticky top-0 z-20 border-b bg-[#0b0f19]/95 backdrop-blur transition-colors duration-500"
        style={{ borderColor: "var(--danger-border)" }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <h1 className="title-flicker glitch-text font-heading text-[10px] leading-relaxed tracking-wide text-emerald-400 sm:text-sm">
            ZOMBIE ADVENTURE
            <br />
            SURVIVAL GAME
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              aria-label="Cómo jugar"
              className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-400 transition hover:border-emerald-500/50 hover:text-emerald-400"
            >
              <HelpCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Cómo jugar</span>
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={loading}
              className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-slate-950 px-3 py-2 text-xs font-semibold text-emerald-400 transition hover:border-red-500/60 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" />
              <span className="hidden sm:inline">Nueva Partida</span>
            </button>
          </div>
        </div>

        {started ? <StatusBar state={gameState} /> : null}

        <div className="hazard-stripes h-1 w-full opacity-70" aria-hidden />
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {!started && !loading ? (
          <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
            <div className="relative">
              <Biohazard
                className="absolute -right-3 -top-3 h-6 w-6 rotate-12 text-red-600/50"
                strokeWidth={1.5}
              />
              <Skull
                className="h-16 w-16 text-emerald-500/70"
                strokeWidth={1.25}
              />
            </div>
            <div className="space-y-2">
              <h2 className="font-heading text-sm text-slate-200">
                El mundo ya no es el mismo
              </h2>
              <p className="max-w-md text-sm text-slate-400">
                Encontrá y eliminá al Infectado 0 antes de que la infección, las
                heridas o la horda te encuentren a vos. No hay guardado, no hay
                vuelta atrás.
              </p>
            </div>
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={handleStart}
                className="flex items-center gap-3 rounded-lg border border-emerald-500 bg-emerald-500/10 px-6 py-3 font-heading text-xs text-emerald-300 shadow-[0_0_25px_-5px_rgba(16,185,129,0.6)] transition hover:bg-emerald-500/20"
              >
                <Skull className="h-5 w-5" />
                Comenzar Aventura
              </button>
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                className="flex items-center gap-2 text-xs text-slate-500 underline-offset-4 transition hover:text-emerald-400 hover:underline"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                Leé las reglas antes de salir
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-10 pb-6">
            {scenes.map((scene) => (
              <SceneCard
                key={scene.id}
                scene={scene}
                state={scene.stateAfter ?? gameState}
              />
            ))}
          </div>
        )}

        {gameOver ? (
          <GameOverScreen state={gameState} onRestart={handleReset} />
        ) : null}

        {signalLost ? (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-red-600/40 bg-red-950/30 px-4 py-3 text-sm text-red-300/90">
            <RadioOff className="h-5 w-5 shrink-0 text-red-500" />
            <p className="font-heading text-[10px] tracking-wide text-red-400/90">
              SEÑAL PERDIDA — reintentá tu decisión.
            </p>
          </div>
        ) : null}
      </main>

      {started && !gameOver ? (
        <div
          ref={actionBarRef}
          className="sticky bottom-0 z-20 border-t bg-[#0b0f19]/95 backdrop-blur transition-colors duration-500"
          style={{ borderColor: "var(--danger-border)" }}
        >
          <div className="hazard-stripes h-1 w-full opacity-70" aria-hidden />
          <div className="mx-auto max-w-3xl px-4 py-4">
            <ChoiceButtons
              choices={lastScene?.choices ?? []}
              instinct={gameState.instinct}
              loading={loading}
              onChoose={(label) => void runTurn(label, "choice")}
              onImprovise={(text) => void runTurn(text, "improvise")}
            />
          </div>
        </div>
      ) : null}

      {helpOpen ? <HowToPlay onClose={() => setHelpOpen(false)} /> : null}
    </div>
  );
}
