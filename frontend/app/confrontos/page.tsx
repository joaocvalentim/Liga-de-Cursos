"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";


/* ===== Tipos ===== */
type Course = { id: number; name: string; short_code: string };
type StandingEntry = { id: number; course: Course };

type Match = {
  id: number;
  stage: "GROUP" | "QF" | "SF" | "FINAL" | "THIRD";
  status: "SCHEDULED" | "LIVE" | "FT";
  scheduled_at: string;
  entry1: { id: number; name: string; short_code: string };
  entry2: { id: number; name: string; short_code: string };
  entry1_id: number;
  entry2_id: number;
  winner_entry?: number | null;
  winner_entry_id?: number | null;
};

type MatchVotesSummary = {
  match: number;
  total: number;
  entry1: { entry_id: number; course: Course; count: number; prob: number };
  entry2: { entry_id: number; course: Course; count: number; prob: number };
};

type MyBetsPayload = {
  match_votes: Array<{ match: Match; pick_entry: { id: number } }>;
  question_votes: any[];
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const COMPETITION_ID = 1;



/* ===== Helpers ===== */
const STAGE_LABEL: Record<Match["stage"], string> = {
  GROUP: "Fase de grupos",
  QF: "Quartos de final",
  SF: "Meias-finais",
  FINAL: "Final",
  THIRD: "3º/4º",
};
const STATUS_LABEL: Record<"SCHEDULED" | "FT", string> = {
  SCHEDULED: "Agendados",
  FT: "Terminados",
};
const showOdd = (x?: number) => (x ? x.toFixed(2) : "—");
function fmtHour(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
const winnerCode = (m: Match) => {
  const winId = (m.winner_entry ?? m.winner_entry_id) ?? null;
  if (!winId) return "—";
  if (winId === m.entry1_id) return m.entry1.short_code;
  if (winId === m.entry2_id) return m.entry2.short_code;
  return "—";
};

/* ===== auth helpers (iguais às outras páginas) ===== */
function useAuthFlag() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    const read = () => setAuthed(Boolean(localStorage.getItem("access_token")));
    read();
    const onAuthChanged = () => read();
    const onFocus = () => read();
    window.addEventListener("auth-changed", onAuthChanged);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("auth-changed", onAuthChanged);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  return authed;
}
function makeHeaders(): Headers {
  const h = new Headers();
  h.set("Content-Type", "application/json");
  const t = localStorage.getItem("access_token");
  if (t) h.set("Authorization", `Bearer ${t}`);
  return h;
}

/* ===== Dropdown helper (fecha ao clicar fora) ===== */
function useOutsideClose<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return ref;
}

/* ========================================================= */

export default function TodosConfrontosPage() {

    // Query params para filtro
  const searchParams = useSearchParams();
  const cursoId = searchParams.get("curso");

  // Aplica filtro de curso se vier na query string
  useEffect(() => {
    if (cursoId) {
      setCourseFilter(new Set([Number(cursoId)]));
    }
  }, [cursoId]);
  const isAuthed = useAuthFlag();

// Query params para filtros
const fasesParam = searchParams.get("fases");   // ex: "QF,SF,FINAL,THIRD"
const estadoParam = searchParams.get("estado"); // ex: "SCHEDULED" ou "FT" ou "SCHEDULED,FT"

// Aplicar fases/estado vindos da URL (só no load)
useEffect(() => {
  if (fasesParam) {
    const allowed = new Set(["GROUP", "QF", "SF", "FINAL", "THIRD"] as const);
    const set = new Set<Match["stage"]>();
    fasesParam.split(",").forEach((s) => {
      const k = s.trim().toUpperCase();
      if (allowed.has(k as any)) set.add(k as Match["stage"]);
    });
    setStageFilter(set);
  }
  if (estadoParam) {
    const allowed = new Set(["SCHEDULED", "FT"] as const);
    const set = new Set<"SCHEDULED" | "FT">();
    estadoParam.split(",").forEach((s) => {
      const k = s.trim().toUpperCase();
      if (allowed.has(k as any)) set.add(k as "SCHEDULED" | "FT");
    });
    setStatusSet(set);
  }
}, [fasesParam, estadoParam]);


  // dados
  const [entries, setEntries] = useState<StandingEntry[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [summaries, setSummaries] = useState<Record<number, MatchVotesSummary>>({});
  const [myMatchVotes, setMyMatchVotes] = useState<Record<number, number>>({}); // matchId -> entryId

  // filtros (agora multi-select com Set)
  const [stageFilter, setStageFilter] = useState<Set<Match["stage"]>>(new Set()); // vazio = todas
  const [statusSet, setStatusSet] = useState<Set<"SCHEDULED" | "FT">>(new Set()); // vazio = todos
  const [courseFilter, setCourseFilter] = useState<Set<number>>(new Set()); // ids de CompetitionEntry

  // dropdowns abertos?
  const [openStage, setOpenStage] = useState(false);
  const [openStatus, setOpenStatus] = useState(false);
  const [openCourses, setOpenCourses] = useState(false);

  const stageMenuRef = useOutsideClose<HTMLDivElement>(() => setOpenStage(false));
  const statusMenuRef = useOutsideClose<HTMLDivElement>(() => setOpenStatus(false));
  const courseMenuRef = useOutsideClose<HTMLDivElement>(() => setOpenCourses(false));

  // dialogs para apostar
  const [openConfirm, setOpenConfirm] = useState(false);
  const [openLogin, setOpenLogin] = useState(false);
  const [currentMatch, setCurrentMatch] = useState<Match | null>(null);
  const [currentPick, setCurrentPick] = useState<{ id: number; course: Course } | null>(null);

  /* ---------- standings (cursos) ---------- */
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/api/competitions/${COMPETITION_ID}/standings/`, { cache: "no-store" });
        const data = await r.json();
        const list: StandingEntry[] = Array.isArray(data) ? data : (data?.entries ?? []);
        setEntries(list);
      } catch (e) {
        console.error("standings fetch error", e);
      }
    })();
  }, []);

  /* ---------- matches ---------- */
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(
          `${API}/api/competitions/${COMPETITION_ID}/matches/?ordering=scheduled_at`,
          { cache: "no-store" }
        );
        const raw = await r.json();
        const list: Match[] = Array.isArray(raw) ? raw : (raw?.matches ?? []);
        setMatches(list);

        // summaries só para SCHEDULED
        const todo = list.filter((m) => m.status !== "FT");
        const pairs = await Promise.all(
          todo.map(async (m) => {
            try {
              const sr = await fetch(`${API}/api/matches/${m.id}/votes/summary/`, { cache: "no-store" });
              if (!sr.ok) return [m.id, null] as const;
              return [m.id, (await sr.json()) as MatchVotesSummary] as const;
            } catch {
              return [m.id, null] as const;
            }
          })
        );
        const map: Record<number, MatchVotesSummary> = {};
        pairs.forEach(([id, s]) => { if (s) map[id] = s; });
        setSummaries(map);
      } catch (e) {
        console.error("matches fetch error", e);
      }
    })();
  }, []);

  /* ---------- minhas apostas ---------- */
  useEffect(() => {
    if (!isAuthed) return;
    (async () => {
      try {
        const r = await fetch(`${API}/api/me/bets/?competition=${COMPETITION_ID}`, {
          headers: makeHeaders(),
        });
        if (!r.ok) return;
        const data: MyBetsPayload = await r.json();
        const map: Record<number, number> = {};
        data.match_votes?.forEach((mv) => {
          map[mv.match.id] = mv.pick_entry.id;
        });
        setMyMatchVotes(map);
      } catch (e) {
        console.error("my bets fetch error", e);
      }
    })();
  }, [isAuthed]);

  /* ---------- aplicar filtros ---------- */
  const filtered = useMemo(() => {
    const hasStages = stageFilter.size > 0;
    const hasStatuses = statusSet.size > 0;
    const hasCourses = courseFilter.size > 0;

    let list = matches.filter((m) => {
      if (hasStatuses && !statusSet.has(m.status as "SCHEDULED" | "FT")) return false; // LIVE não aparece
      if (hasStages && !stageFilter.has(m.stage)) return false;
      if (hasCourses) {
        const has1 = courseFilter.has(m.entry1_id);
        const has2 = courseFilter.has(m.entry2_id);
        if (!has1 && !has2) return false;
      }
      return true;
    });

    // ordenar: agendados por data asc; terminados por data desc
    const up = list
      .filter((m) => m.status !== "FT")
      .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at));
    const done = list
      .filter((m) => m.status === "FT")
      .sort((a, b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at));

    return [...up, ...done];
  }, [matches, stageFilter, statusSet, courseFilter]);

  /* ---------- handlers ---------- */
  const toggleStage = (s: Match["stage"]) =>
    setStageFilter((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });

  const toggleStatus = (s: "SCHEDULED" | "FT") =>
    setStatusSet((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });

  const toggleCourse = (entryId: number) =>
    setCourseFilter((prev) => {
      const next = new Set(prev);
      next.has(entryId) ? next.delete(entryId) : next.add(entryId);
      return next;
    });

  const askBet = (m: Match, pick: { id: number; course: Course }) => {
    if (!isAuthed) return setOpenLogin(true);
    setCurrentMatch(m);
    setCurrentPick(pick);
    setOpenConfirm(true);
  };

  const submitBet = async () => {
    if (!currentMatch || !currentPick) return;
    try {
      const r = await fetch(`${API}/api/matches/${currentMatch.id}/vote/`, {
        method: "POST",
        headers: makeHeaders(),
        body: JSON.stringify({ pick_entry_id: currentPick.id }),
      });
      if (r.ok) {
        setMyMatchVotes((prev) => ({ ...prev, [currentMatch.id]: currentPick.id }));
        const sr = await fetch(`${API}/api/matches/${currentMatch.id}/votes/summary/`);
        if (sr.ok) {
          const s = (await sr.json()) as MatchVotesSummary;
          setSummaries((prev) => ({ ...prev, [currentMatch.id]: s }));
        }
      } else if (r.status === 401) {
        setOpenLogin(true);
      }
    } catch (e) {
      console.error("submit bet error", e);
    } finally {
      setOpenConfirm(false);
      setCurrentMatch(null);
      setCurrentPick(null);
    }
  };

  /* =============== UI =============== */
  const stageBtnLabel =
    stageFilter.size === 0 ? "Todas as fases" : `${stageFilter.size} fase(s)`;
  const statusBtnLabel =
    statusSet.size === 0
      ? "Todos os estados"
      : Array.from(statusSet).map((s) => STATUS_LABEL[s]).join(", ");
  const courseBtnLabel =
    courseFilter.size === 0 ? "Todos os cursos" : `${courseFilter.size} curso(s)`;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Todos os Confrontos</h1>

      </div>

      {/* Filtros */}
      <section className="mb-6 rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Fase (multi) */}
          <div className="relative" ref={stageMenuRef}>
            <p className="mb-1 text-sm font-medium">Fase</p>
            <button
              className="w-full rounded-lg border px-3 py-2 text-left text-sm hover:bg-gray-50"
              onClick={() => setOpenStage((o) => !o)}
            >
              {stageBtnLabel}
            </button>
            {openStage && (
              <div className="absolute z-20 mt-1 w-[260px] rounded-lg border bg-white p-2 shadow-lg">
                {(["GROUP", "QF", "SF", "FINAL", "THIRD"] as const).map((s) => (
                  <label key={s} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={stageFilter.has(s)}
                      onChange={() => toggleStage(s)}
                    />
                    {STAGE_LABEL[s]}
                  </label>
                ))}
                <div className="mt-2 flex justify-end">
                  <button
                    className="text-xs text-gray-600 underline"
                    onClick={() => setStageFilter(new Set())}
                  >
                    Limpar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Estado (multi) */}
          <div className="relative" ref={statusMenuRef}>
            <p className="mb-1 text-sm font-medium">Estado</p>
            <button
              className="w-full rounded-lg border px-3 py-2 text-left text-sm hover:bg-gray-50"
              onClick={() => setOpenStatus((o) => !o)}
            >
              {statusBtnLabel}
            </button>
            {openStatus && (
              <div className="absolute z-20 mt-1 w-[260px] rounded-lg border bg-white p-2 shadow-lg">
                {(["SCHEDULED", "FT"] as const).map((s) => (
                  <label key={s} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={statusSet.has(s)}
                      onChange={() => toggleStatus(s)}
                    />
                    {STATUS_LABEL[s]}
                  </label>
                ))}
                <div className="mt-2 flex justify-between text-xs">
                  <button
                    className="text-gray-600 underline"
                    onClick={() => setStatusSet(new Set(["SCHEDULED", "FT"]))}
                  >
                    Selecionar todos
                  </button>
                  <button
                    className="text-gray-600 underline"
                    onClick={() => setStatusSet(new Set())}
                  >
                    Limpar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Cursos (multi) */}
          <div className="relative" ref={courseMenuRef}>
            <p className="mb-1 text-sm font-medium">Cursos</p>
            <button
              className="w-full rounded-lg border px-3 py-2 text-left text-sm hover:bg-gray-50"
              onClick={() => setOpenCourses((o) => !o)}
            >
              {courseBtnLabel}
            </button>
            {openCourses && (
              <div className="absolute z-20 mt-1 max-h-72 w-[320px] overflow-auto rounded-lg border bg-white p-2 shadow-lg">
                {entries.map((e) => (
                  <label
                    key={e.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={courseFilter.has(e.id)}
                      onChange={() => toggleCourse(e.id)}
                    />
                    <span className="font-medium">{e.course.short_code}</span>
                    <span className="text-gray-500">{e.course.name}</span>
                  </label>
                ))}
                <div className="mt-2 flex justify-between text-xs">
                  <button
                    className="text-gray-600 underline"
                    onClick={() => setCourseFilter(new Set(entries.map((e) => e.id)))}
                  >
                    Selecionar todos
                  </button>
                  <button
                    className="text-gray-600 underline"
                    onClick={() => setCourseFilter(new Set())}
                  >
                    Limpar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Lista de confrontos */}
      <section className="rounded-xl border bg-white p-4 shadow-sm">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-500">Sem confrontos para os filtros escolhidos.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filtered.map((m) => {
              const sum = summaries[m.id];
              const mine1 = myMatchVotes[m.id] === m.entry1_id;
              const mine2 = myMatchVotes[m.id] === m.entry2_id;
              const isFT = m.status === "FT";

              return (
                <div key={m.id} className="rounded-lg border p-4">
                  {/* header */}
                  <p className="mb-3 text-center text-xs text-gray-500">
                    {STAGE_LABEL[m.stage]}
                  </p>

                  {/* vs */}
                  <div className="mb-3 flex items-center justify-center gap-3 text-lg font-semibold">
                    <span>{m.entry1.short_code}</span>
                    <div className="text-xs text-gray-500">
                      {isFT ? "- Terminado -" : `- ${fmtHour(m.scheduled_at)} -`}
                    </div>
                    <span>{m.entry2.short_code}</span>
                  </div>

                  {/* conteúdo */}
                  {isFT ? (
                    <div className="rounded-xl bg-gray-50 px-4 py-3 text-center">
                      Vencedor: <span className="font-semibold">{winnerCode(m)}</span>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <button
                        onClick={() => askBet(m, { id: m.entry1_id, course: m.entry1 })}
                        className={`flex-1 rounded-xl px-4 py-3 text-center transition ${
                          mine1 ? "bg-black text-white" : "bg-gray-100 hover:bg-gray-200"
                        }`}
                      >
                        <div className="text-sm">{m.entry1.name}</div>
                        <div className="text-lg font-semibold">{showOdd(sum?.entry1?.prob)}</div>
                      </button>

                      <button
                        onClick={() => askBet(m, { id: m.entry2_id, course: m.entry2 })}
                        className={`flex-1 rounded-xl px-4 py-3 text-center transition ${
                          mine2 ? "bg-black text-white" : "bg-gray-100 hover:bg-gray-200"
                        }`}
                      >
                        <div className="text-sm">{m.entry2.name}</div>
                        <div className="text-lg font-semibold">{showOdd(sum?.entry2?.prob)}</div>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Dialog: confirmar aposta */}
      <Dialog open={openConfirm} onOpenChange={setOpenConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar aposta</DialogTitle>
            <DialogDescription>
              {currentPick?.course ? `Pretendes apostar no curso ${currentPick.course.name}?` : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenConfirm(false)}>
              Cancelar
            </Button>
            <Button onClick={submitBet}>Sim, apostar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: precisa de login */}
      <Dialog open={openLogin} onOpenChange={setOpenLogin}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Para apostar é preciso ter uma conta</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenLogin(false)}>
              Voltar atrás
            </Button>
            <Link href="/login">
              <Button onClick={() => setOpenLogin(false)}>Login</Button>
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
