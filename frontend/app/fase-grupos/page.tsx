// app/fase-de-grupos/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { API } from "@/lib/api";

/* ========================= Tipos ========================= */
type Course = { id: number; name: string; short_code?: string };
type Standing = {
  id: number; // CompetitionEntry id
  course: Course | number;
  course_name?: string;
  course_code?: string;
  pote?: number | null;
  pot?: number | null;
  wins?: number | null;
  draws?: number | null;
  losses?: number | null;
  points?: number | null;
};

type Match = {
  id: number;
  stage: "GROUP" | "QF" | "SF" | "FINAL" | "THIRD";
  status: "SCHEDULED" | "LIVE" | "FT";
  scheduled_at?: string;
  entry1: { id: number; name: string; short_code?: string };
  entry2: { id: number; name: string; short_code?: string };
  entry1_id: number;
  entry2_id: number;
  winner_entry?: number | null;        // se o backend enviar
  winner_entry_id?: number | null;     // fallback
};

type MatchVotesSummary = {
  match: number;
  total: number;
  entry1: { entry_id: number; course: Course; count: number; prob: number }; // prob já vem em ODD
  entry2: { entry_id: number; course: Course; count: number; prob: number };
};

type MyBetsPayload = {
  match_votes: Array<{ match: Match; pick_entry: { id: number } }>;
  question_votes: any[];
};

/* ========================= Constantes/Helpers ========================= */
const COMP_ID = 1;

function asArray<T = any>(raw: any, keys: string[] = []): T[] {
  if (Array.isArray(raw)) return raw as T[];
  for (const k of keys) if (raw?.[k] && Array.isArray(raw[k])) return raw[k] as T[];
  if (raw?.results && Array.isArray(raw.results)) return raw.results as T[];
  return [];
}
function courseFromEntry(c: Standing["course"]): { name: string; code: string } {
  if (typeof c === "object" && c) {
    const obj = c as Course;
    return { name: obj.name, code: obj.short_code ?? "" };
  }
  return { name: "", code: "" };
}
function fmtHour(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
const STAGE_LABEL: Record<Match["stage"], string> = {
  GROUP: "Fase de grupos",
  QF: "Quartos de final",
  SF: "Meias-finais",
  FINAL: "Final",
  THIRD: "3º/4º",
};
const showOdd = (x?: number) => (x ? x.toFixed(2) : "—");

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

/* ========================= Página ========================= */
export default function FaseDeGruposPage() {
  const router = useRouter();
  const isAuthed = useAuthFlag();

  const [standingsRaw, setStandingsRaw] = useState<any>(null);
  // matches agendados (para o bloco da direita)
  const [upcomingRaw, setUpcomingRaw] = useState<any>(null);
  // todos os matches (para o modal)
  const [allMatchesRaw, setAllMatchesRaw] = useState<any>(null);

  // summaries para os “próximos confrontos”
  const [summaries, setSummaries] = useState<Record<number, MatchVotesSummary>>({});
  // minhas apostas p/destacar a odd escolhida
  const [myMatchVotes, setMyMatchVotes] = useState<Record<number, number>>({}); // matchId -> entryId

  // modal (detalhes do curso)
  const [open, setOpen] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [selectedCourseLabel, setSelectedCourseLabel] = useState<string>("");

  // summaries específicos do modal
  const [detailSummaries, setDetailSummaries] = useState<Record<number, MatchVotesSummary>>({});

  // dialogs de aposta
  const [openConfirmMatch, setOpenConfirmMatch] = useState(false);
  const [currentMatch, setCurrentMatch] = useState<Match | null>(null);
  const [currentPick, setCurrentPick] = useState<{ id: number; course: Course } | null>(null);
  const [openLoginReq, setOpenLoginReq] = useState(false);
  const [openAlreadyBet, setOpenAlreadyBet] = useState(false);

  // stake + erros (como na Home)
  const [stake, setStake] = useState<number>(1);
  const [betError, setBetError] = useState<string | null>(null);
  const [placingBet, setPlacingBet] = useState(false);

  const [loading, setLoading] = useState(true);

  /* -------- initial loads -------- */
  useEffect(() => {
    (async () => {
      try {
        const [stRes, upRes, allRes] = await Promise.all([
          fetch(`${API}/competitions/${COMP_ID}/standings/`, { cache: "no-store" }),
          fetch(
            `${API}/competitions/${COMP_ID}/matches/?status=SCHEDULED&ordering=scheduled_at&limit=6`,
            { cache: "no-store" }
          ),
          fetch(`${API}/competitions/${COMP_ID}/matches/?ordering=scheduled_at`, {
            cache: "no-store",
          }),
        ]);

        const [stJson, upJson, allJson] = await Promise.all([
          stRes.json(),
          upRes.json(),
          allRes.json(),
        ]);
        setStandingsRaw(stJson);
        setUpcomingRaw(upJson);
        setAllMatchesRaw(allJson);

        // summaries para os próximos
        const list: Match[] = Array.isArray(upJson) ? upJson : upJson?.matches ?? [];
        const sumPairs = await Promise.all(
          list.map(async (m) => {
            try {
              const r = await fetch(`${API}/matches/${m.id}/votes/summary/`, {
                cache: "no-store",
              });
              if (!r.ok) return [m.id, null] as const;
              return [m.id, (await r.json()) as MatchVotesSummary] as const;
            } catch {
              return [m.id, null] as const;
            }
          })
        );
        const map: Record<number, MatchVotesSummary> = {};
        sumPairs.forEach(([id, s]) => {
          if (s) map[id] = s;
        });
        setSummaries(map);
      } catch (e) {
        console.error("Erro a carregar dados:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // minhas apostas (para destacar odds)
  useEffect(() => {
    if (!isAuthed) return;
    (async () => {
      try {
        const r = await fetch(`${API}/me/bets/?competition=${COMP_ID}`, {
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

  /* -------- derived data -------- */
  const standings: Standing[] = useMemo(
    () => asArray<Standing>(standingsRaw, ["entries"]),
    [standingsRaw]
  );

  const ordered: Standing[] = useMemo(() => {
    const arr = [...standings];
    return arr.sort((a, b) => {
      const pa = (a.points ?? 0) as number;
      const pb = (b.points ?? 0) as number;
      if (pb !== pa) return pb - pa; // pontos desc
      const poteA = (a.pote ?? a.pot ?? 0) as number;
      const poteB = (b.pote ?? b.pot ?? 0) as number;
      if (poteB !== poteA) return poteB - poteA; // desempate: pote maior primeiro
      return 0;
    });
  }, [standings]);

  const upcoming: Match[] = useMemo(
    () => asArray<Match>(upcomingRaw, ["matches"]).slice(0, 6),
    [upcomingRaw]
  );

  const allMatches: Match[] = useMemo(
    () => asArray<Match>(allMatchesRaw, ["matches"]),
    [allMatchesRaw]
  );

  /* -------- modal: open & load summaries for that course -------- */
  async function openCourseModal(entryId: number, label: string) {
    setSelectedEntryId(entryId);
    setSelectedCourseLabel(label);
    setOpen(true);

    const matchesForCourse = allMatches.filter(
      (m) => m.entry1_id === entryId || m.entry2_id === entryId
    );

    const missing = matchesForCourse
      .map((m) => m.id)
      .filter((id) => !detailSummaries[id]);

    if (missing.length) {
      const pairs = await Promise.all(
        missing.map(async (id) => {
          try {
            const r = await fetch(`${API}/matches/${id}/votes/summary/`, {
              cache: "no-store",
            });
            if (!r.ok) return [id, null] as const;
            return [id, (await r.json()) as MatchVotesSummary] as const;
          } catch {
            return [id, null] as const;
          }
        })
      );
      setDetailSummaries((prev) => {
        const next = { ...prev };
        pairs.forEach(([id, s]) => {
          if (s) next[id] = s;
        });
        return next;
      });
    }
  }

  /* -------- helpers UI -------- */
  function codeOf(entry: any) {
    return entry?.short_code || entry?.code || entry?.course?.short_code || entry?.course?.code || "—";
  }
  function winnerCode(m: Match) {
    const winId = (m.winner_entry ?? m.winner_entry_id) ?? null;
    if (!winId) return "—";
    if (winId === m.entry1_id) return codeOf(m.entry1);
    if (winId === m.entry2_id) return codeOf(m.entry2);
    return "—";
  }

  /* -------- aposta: abrir modal -------- */
  function askBet(m: Match, pick: { id: number; course: Course }) {
    if (!isAuthed) return setOpenLoginReq(true);
    if (myMatchVotes[m.id]) return setOpenAlreadyBet(true);
    setCurrentMatch(m);
    setCurrentPick(pick);
    setStake(1);
    setBetError(null);
    setOpenConfirmMatch(true);
  }

  /* -------- submit aposta (com valor, como na Home) -------- */
  const submitMatchBet = async () => {
    if (!currentMatch || !currentPick) return;
    if (!stake || stake < 1) { setBetError("Indica um valor válido."); return; }

    try {
      setPlacingBet(true);
      const r = await fetch(`${API}/matches/${currentMatch.id}/bet/`, {
        method: "POST",
        headers: makeHeaders(),
        body: JSON.stringify({ pick_entry_id: currentPick.id, stake }),
      });

      const data = await r.json().catch(() => ({}));

      if (r.status === 401) {
        setOpenConfirmMatch(false);
        setOpenLoginReq(true);
        return;
      }
      if (!r.ok) {
        setBetError(String(data?.detail || "Não foi possível realizar a aposta."));
        return;
      }

      // sucesso
      setMyMatchVotes((prev) => ({ ...prev, [currentMatch.id]: currentPick.id }));

      // refrescar summary do match na sidebar
      const sr = await fetch(`${API}/matches/${currentMatch.id}/votes/summary/`);
      if (sr.ok) {
        const s = (await sr.json()) as MatchVotesSummary;
        setSummaries((prev) => ({ ...prev, [currentMatch.id]: s }));
        setDetailSummaries((prev) => ({ ...prev, [currentMatch.id]: s })); // e no modal
      }

      // atualizar saldo no header
      if (typeof data?.new_balance === "number") {
        window.dispatchEvent(new CustomEvent("balance-changed", { detail: data.new_balance }));
      }
    } catch (e) {
      setBetError("Erro ao comunicar com o servidor.");
      console.error("match bet error", e);
    } finally {
      setPlacingBet(false);
      setOpenConfirmMatch(false);
      setCurrentMatch(null);
      setCurrentPick(null);
    }
  };

  if (loading) {
    return (
      <main className="p-6 max-w-7xl mx-auto">
        <h1 className="text-xl font-bold mb-8">Fase de Grupos</h1>
        <div className="text-sm text-gray-500">A carregar…</div>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Fase de Grupos</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Classificação */}
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Classificação</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 px-3">Pos</th>
                  <th className="py-2 px-3">Curso</th>
                  <th className="py-2 px-3">Pote</th>
                  <th className="py-2 px-3">V</th>
                  <th className="py-2 px-3">E</th>
                  <th className="py-2 px-3">D</th>
                  <th className="py-2 px-3">Pts</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((e, idx) => {
                  const { name, code } = courseFromEntry(e.course);
                  const divider = idx === 8;
                  const label = `${code || e.course_code} • ${name || e.course_name}`;
                  return (
                    <tr
                      key={e.id ?? `${code}-${idx}`}
                      className={`border-t ${
                        divider ? "border-t-2 border-dashed border-red-500" : "border-t"
                      } hover:bg-gray-50 cursor-pointer`}
                      onClick={() => openCourseModal(e.id, label)}
                    >
                      <td className="py-2 px-3">{idx + 1}</td>
                      <td className="py-2 px-3">
                        <span className="font-semibold">{code || e.course_code}</span>
                        <span className="text-gray-500"> • {name || e.course_name}</span>
                      </td>
                      <td className="py-2 px-3">{(e.pote ?? e.pot ?? "-") as any}</td>
                      <td className="py-2 px-3">{e.wins ?? 0}</td>
                      <td className="py-2 px-3">{e.draws ?? 0}</td>
                      <td className="py-2 px-3">{e.losses ?? 0}</td>
                      <td className="py-2 px-3 font-semibold">{e.points ?? 0}</td>
                    </tr>
                  );
                })}
                {ordered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-gray-500">
                      Sem dados de classificação.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Próximos confrontos (COM APOSTA) */}
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Próximos confrontos</h2>
            <Link
              href="/confrontos?tipo=gerais"
              className="text-sm font-medium text-gray-700 hover:underline"
            >
              Ver mais
            </Link>
          </div>

          {upcoming.length === 0 ? (
            <p className="text-sm text-gray-500">Sem confrontos agendados.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {upcoming.map((m) => {
                const s = summaries[m.id];
                const mine1 = myMatchVotes[m.id] === m.entry1_id;
                const mine2 = myMatchVotes[m.id] === m.entry2_id;

                return (
                  <div key={m.id} className="rounded-lg border p-3">
                    <div className="mb-2 text-xs text-gray-500 text-center">
                      {STAGE_LABEL[m.stage] ?? m.stage}
                    </div>
                    <div className="mb-3 flex items-center justify-center gap-3 text-lg font-semibold">
                      <span>{m.entry1.short_code}</span>
                      <span className="text-gray-400">— {fmtHour(m.scheduled_at)} —</span>
                      <span>{m.entry2.short_code}</span>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => askBet(m, { id: m.entry1_id, course: m.entry1 })}
                        className={`flex-1 rounded-xl px-4 py-3 text-center transition ${
                          mine1 ? "bg-black text-white" : "bg-gray-100 hover:bg-gray-200"
                        }`}
                      >
                        <div className="text-lg font-semibold">{showOdd(s?.entry1?.prob)}</div>
                      </button>

                      <button
                        onClick={() => askBet(m, { id: m.entry2_id, course: m.entry2 })}
                        className={`flex-1 rounded-xl px-4 py-3 text-center transition ${
                          mine2 ? "bg-black text-white" : "bg-gray-100 hover:bg-gray-200"
                        }`}
                      >
                        <div className="text-lg font-semibold">{showOdd(s?.entry2?.prob)}</div>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* ========================= MODAL DETALHES DO CURSO ========================= */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedCourseLabel}</DialogTitle>
          </DialogHeader>

          <div className="max-h-[70vh] overflow-y-auto space-y-6">
            {/* Terminados */}
            <section>
              <h3 className="mb-2 text-sm font-medium text-gray-600">Confrontos Terminados</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {asArray<Match>(allMatchesRaw, ["matches"])
                  .filter((m) => (m.entry1_id === selectedEntryId || m.entry2_id === selectedEntryId) && m.status === "FT")
                  .map((m) => (
                    <div key={m.id} className="rounded-lg border px-3 py-2 text-sm flex items-center justify-between">
                      <div className="text-xs text-gray-500">{STAGE_LABEL[m.stage] ?? m.stage}</div>
                      <div className="font-semibold">
                        {m.entry1.short_code} <span className="text-gray-400">—</span> {m.entry2.short_code}
                      </div>
                      <div>
                        Vencedor: <span className="font-semibold">{winnerCode(m)}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </section>

            {/* Agendados (AGORA COM APOSTA) */}
            <section>
              <h3 className="mb-2 text-sm font-medium text-gray-600">
                Confrontos Agendados
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {asArray<Match>(allMatchesRaw, ["matches"])
                  .filter((m) => (m.entry1_id === selectedEntryId || m.entry2_id === selectedEntryId) && m.status !== "FT")
                  .map((m) => {
                    const s = detailSummaries[m.id];
                    const mine1 = myMatchVotes[m.id] === m.entry1_id;
                    const mine2 = myMatchVotes[m.id] === m.entry2_id;
                    return (
                      <div key={m.id} className="rounded-lg border p-3">
                        <div className="mb-1 text-xs text-gray-500 text-center">
                          {STAGE_LABEL[m.stage] ?? m.stage}
                        </div>
                        <div className="mb-2 flex items-center justify-between text-sm">
                          <div className="font-semibold">{m.entry1.short_code}</div>
                          <div className="text-gray-500">{fmtHour(m.scheduled_at)}</div>
                          <div className="font-semibold">{m.entry2.short_code}</div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            onClick={() => askBet(m, { id: m.entry1_id, course: m.entry1 })}
                            className={`rounded-xl px-4 py-3 text-center transition ${
                              mine1 ? "bg-black text-white" : "bg-gray-100 hover:bg-gray-200"
                            }`}
                          >
                            <div className="text-lg font-semibold">{showOdd(s?.entry1?.prob)}</div>
                          </button>
                          <button
                            onClick={() => askBet(m, { id: m.entry2_id, course: m.entry2 })}
                            className={`rounded-xl px-4 py-3 text-center transition ${
                              mine2 ? "bg-black text-white" : "bg-gray-100 hover:bg-gray-200"
                            }`}
                          >
                            <div className="text-lg font-semibold">{showOdd(s?.entry2?.prob)}</div>
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>

      {/* ========================= Dialogs de aposta / login ========================= */}
      <Dialog open={openConfirmMatch} onOpenChange={setOpenConfirmMatch}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar aposta</DialogTitle>
            <DialogDescription>
              {currentPick?.course
                ? `Pretendes apostar no curso ${currentPick.course.name}?`
                : null}
            </DialogDescription>
          </DialogHeader>

          {/* Valor da aposta */}
          <div className="mt-2 space-y-2">
            <label className="text-sm text-gray-600">Valor a apostar</label>
            <Input
              type="number"
              min={1}
              step={1}
              value={stake}
              onChange={(e) => setStake(Math.max(1, Number(e.target.value)))}
              inputMode="numeric"
            />
            {betError && <p className="text-sm text-red-600">{betError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenConfirmMatch(false)}>
              Cancelar
            </Button>
            <Button onClick={submitMatchBet} disabled={placingBet || !stake}>
              {placingBet ? "A apostar..." : "Sim, apostar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openLoginReq} onOpenChange={setOpenLoginReq}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Para apostar é preciso ter uma conta</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenLoginReq(false)}>
              Voltar atrás
            </Button>
            <Button
              onClick={() => {
                setOpenLoginReq(false);
                router.push("/login");
              }}
            >
              Login
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openAlreadyBet} onOpenChange={setOpenAlreadyBet}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Já apostaste neste confronto</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setOpenAlreadyBet(false)}>Ok</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
