"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/* ========= Tipos (compatíveis com as tuas views) ========= */
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

type MatchVoteItem = { match: Match; pick_entry: { id: number } };

type Question = {
  id: number;
  title?: string;
  question?: string;
  text?: string;
  is_active?: boolean; // nas tuas views adicionámos isto; se não vier, tratamos como true por defeito
};

type QuestionVoteItem = { question: Question; pick_entry: { id: number } };

type QuestionResults = {
  total: number;
  results: Array<{ entry_id: number; count: number; prob: number }>; // prob em [0..1]
};

type MatchVotesSummary = {
  match: number;
  total: number;
  entry1: { entry_id: number; course: Course; count: number; prob: number }; // aqui prob já vem como ODD (1/p)
  entry2: { entry_id: number; course: Course; count: number; prob: number };
};

type MyBetsPayload = {
  match_votes: MatchVoteItem[];
  question_votes: QuestionVoteItem[];
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const COMPETITION_ID = 1;

/* ========= Helpers ========= */
const STAGE_LABEL: Record<Match["stage"], string> = {
  GROUP: "Fase de grupos",
  QF: "Quartos de final",
  SF: "Meias-finais",
  FINAL: "Final",
  THIRD: "3º/4º",
};

const fmtHour = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const showOdd = (x?: number) => (x ? x.toFixed(2) : "—");
const titleOf = (q: Question) => q.title ?? q.text ?? q.question ?? "Pergunta";

/* ========= Auth helpers (iguais às tuas páginas) ========= */
function makeHeaders(): Headers {
  const h = new Headers();
  h.set("Content-Type", "application/json");
  const t = localStorage.getItem("access_token");
  if (t) h.set("Authorization", `Bearer ${t}`);
  return h;
}

/* ========================================================= */

export default function MinhasApostasPage() {
  const router = useRouter();

  // redirect se não estiver loggado
  useEffect(() => {
    if (!localStorage.getItem("access_token")) {
      router.replace("/login");
    }
  }, [router]);

  const [entries, setEntries] = useState<StandingEntry[]>([]);
  const [bets, setBets] = useState<MyBetsPayload | null>(null);

  // summaries e resultados para atualizar odds e mostrar top/opções
  const [matchSummaries, setMatchSummaries] = useState<Record<number, MatchVotesSummary>>({});
  const [questionResults, setQuestionResults] = useState<Record<number, QuestionResults>>({});

  // para destacar o que o utilizador escolheu nos jogos
  const myMatchPickByMatchId = useMemo(() => {
    const map: Record<number, number> = {};
    bets?.match_votes.forEach((mv) => (map[mv.match.id] = mv.pick_entry.id));
    return map;
  }, [bets]);

  // dialogs — SimpleVote
  const [openSimpleDialog, setOpenSimpleDialog] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [currentQuestionPick, setCurrentQuestionPick] = useState<number | null>(null);

  // dialogs — MatchVote
  const [openMatchDialog, setOpenMatchDialog] = useState(false);
  const [currentMatch, setCurrentMatch] = useState<Match | null>(null);
  const [currentMatchPick, setCurrentMatchPick] = useState<{ id: number; course: Course } | null>(
    null
  );

  // standings (para nomes/siglas nas perguntas)
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/api/competitions/${COMPETITION_ID}/standings/`);
        const raw = await r.json();
        const list: StandingEntry[] = Array.isArray(raw) ? raw : raw?.entries ?? [];
        setEntries(list);
      } catch (e) {
        console.error("standings error", e);
      }
    })();
  }, []);

  // carregar as minhas apostas
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/api/me/bets/?competition=${COMPETITION_ID}`, {
          headers: makeHeaders(),
          cache: "no-store",
        });
        if (!r.ok) return;
        const data: MyBetsPayload = await r.json();
        setBets(data);

        // summaries dos jogos ainda não terminados
        const liveOrSched = data.match_votes
          .map((mv) => mv.match)
          .filter((m, idx, self) => m.status !== "FT" && self.findIndex((x) => x.id === m.id) === idx);

        const pairs = await Promise.all(
          liveOrSched.map(async (m) => {
            try {
              const sr = await fetch(`${API}/api/matches/${m.id}/votes/summary/`, { cache: "no-store" });
              if (!sr.ok) return [m.id, null] as const;
              return [m.id, (await sr.json()) as MatchVotesSummary] as const;
            } catch {
              return [m.id, null] as const;
            }
          })
        );
        const mapp: Record<number, MatchVotesSummary> = {};
        pairs.forEach(([id, s]) => {
          if (s) mapp[id] = s;
        });
        setMatchSummaries(mapp);

        // resultados das perguntas (para mostrar opções e estado)
        const qIds = Array.from(
          new Set(data.question_votes.map((qv) => qv.question.id))
        );
        const qPairs = await Promise.all(
          qIds.map(async (qid) => {
            try {
              const rr = await fetch(`${API}/api/questions/${qid}/results/`, { cache: "no-store" });
              if (!rr.ok) return [qid, null] as const;
              return [qid, (await rr.json()) as QuestionResults] as const;
            } catch {
              return [qid, null] as const;
            }
          })
        );
        const qmap: Record<number, QuestionResults> = {};
        qPairs.forEach(([id, res]) => {
          if (res) qmap[id] = res;
        });
        setQuestionResults(qmap);
      } catch (e) {
        console.error("bets error", e);
      }
    })();
  }, []);

  // separar em "a decorrer" e "terminadas"
  const runningMatches = useMemo(
    () => bets?.match_votes.filter((mv) => mv.match.status !== "FT") ?? [],
    [bets]
  );
  const finishedMatches = useMemo(
    () => bets?.match_votes.filter((mv) => mv.match.status === "FT") ?? [],
    [bets]
  );
  const runningQuestions = useMemo(
    () => bets?.question_votes.filter((qv) => qv.question.is_active !== false) ?? [],
    [bets]
  );
  const finishedQuestions = useMemo(
    () => bets?.question_votes.filter((qv) => qv.question.is_active === false) ?? [],
    [bets]
  );

  // helpers para perguntas
  const entryOf = (entryId: number) => entries.find((e) => e.id === entryId)?.course;
  const optionsFromResults = (qid: number) => {
    const res = questionResults[qid];
    if (!res) return [] as Array<{ entry_id: number; label: string; prob: number }>;
    return res.results
      .map((r) => {
        const c = entryOf(r.entry_id);
        return { entry_id: r.entry_id, label: c?.name ?? c?.short_code ?? `#${r.entry_id}`, prob: r.prob };
      })
      .sort((a, b) => b.prob - a.prob);
  };

  /* ====== Ações: votar/mudar voto ====== */
  const submitSimpleVote = async () => {
    if (!currentQuestion || !currentQuestionPick) return;
    try {
      const r = await fetch(`${API}/api/questions/${currentQuestion.id}/vote/`, {
        method: "POST",
        headers: makeHeaders(),
        body: JSON.stringify({ pick_entry_id: currentQuestionPick }),
      });
      if (r.ok) {
        // refrescar resultados dessa pergunta
        const rr = await fetch(`${API}/api/questions/${currentQuestion.id}/results/`);
        if (rr.ok) {
          const res = (await rr.json()) as QuestionResults;
          setQuestionResults((prev) => ({ ...prev, [currentQuestion.id]: res }));
        }
      }
    } catch (e) {
      console.error("simple vote error", e);
    } finally {
      setOpenSimpleDialog(false);
      setCurrentQuestion(null);
      setCurrentQuestionPick(null);
    }
  };

  const submitMatchVote = async () => {
    if (!currentMatch || !currentMatchPick) return;
    try {
      const r = await fetch(`${API}/api/matches/${currentMatch.id}/vote/`, {
        method: "POST",
        headers: makeHeaders(),
        body: JSON.stringify({ pick_entry_id: currentMatchPick.id }),
      });
      if (r.ok) {
        // atualizar highlight local
        setBets((prev) =>
          prev
            ? {
                ...prev,
                match_votes: prev.match_votes.map((mv) =>
                  mv.match.id === currentMatch.id ? { ...mv, pick_entry: { id: currentMatchPick.id } } : mv
                ),
              }
            : prev
        );
        // refrescar summary
        const sr = await fetch(`${API}/api/matches/${currentMatch.id}/votes/summary/`);
        if (sr.ok) {
          const s = (await sr.json()) as MatchVotesSummary;
          setMatchSummaries((prev) => ({ ...prev, [currentMatch.id]: s }));
        }
      }
    } catch (e) {
      console.error("match vote error", e);
    } finally {
      setOpenMatchDialog(false);
      setCurrentMatch(null);
      setCurrentMatchPick(null);
    }
  };

  /* ============================== UI ============================== */
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Minhas Apostas</h1>
      </div>

      {/* A DECORRER */}
      <section className="mb-10">
        <h2 className="mb-4 text-2xl font-bold">A decorrer</h2>

        {/* Perguntas (SimpleVote) */}
        {runningQuestions.length > 0 && (
          <>
            <h3 className="mb-3 text-lg font-semibold text-gray-700">Apostas gerais</h3>
            <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {runningQuestions.map((qv) => {
                const q = qv.question;
                const myPick = qv.pick_entry.id;
                const opts = optionsFromResults(q.id);
                return (
                  <Card key={`q-${q.id}`} className="rounded-2xl">
                    <CardHeader>
                      <CardTitle className="text-center text-lg font-semibold">{titleOf(q)}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {opts.length === 0 ? (
                        <p className="mb-4 text-sm text-gray-500">Sem votos ainda.</p>
                      ) : (
                        <div className="mb-4 space-y-2">
                          {opts.slice(0, 3).map((o) => (
                            <div
                              key={o.entry_id}
                              className={`flex items-center justify-between rounded-xl px-3 py-2 ${
                                o.entry_id === myPick
                                  ? "bg-black text-white"
                                  : "bg-gray-100 text-gray-900"
                              }`}
                            >
                              <span className="text-sm">{o.label}</span>
                              <span className="font-semibold">{(o.prob * 100).toFixed(0)}%</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex justify-center">
                        <Button
                          onClick={() => {
                            setCurrentQuestion(q);
                            setCurrentQuestionPick(myPick);
                            setOpenSimpleDialog(true);
                          }}
                        >
                          Mudar voto
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {/* Confrontos (MatchVote) */}
        {runningMatches.length > 0 && (
          <>
            <h3 className="mb-3 text-lg font-semibold text-gray-700">Confrontos</h3>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {runningMatches.map((mv) => {
                const m = mv.match;
                const s = matchSummaries[m.id];
                const mine1 = myMatchPickByMatchId[m.id] === m.entry1_id;
                const mine2 = myMatchPickByMatchId[m.id] === m.entry2_id;

                return (
                  <Card key={`m-${m.id}`} className="rounded-2xl">
                    <CardContent className="pt-6">
                      <p className="mb-3 text-center text-xs text-gray-500">
                        {STAGE_LABEL[m.stage]}
                      </p>
                      <div className="mb-6 flex items-center justify-center gap-3 text-lg font-semibold">
                        <span>{m.entry1.short_code}</span>
                        <span className="text-gray-400">— {fmtHour(m.scheduled_at)} —</span>
                        <span>{m.entry2.short_code}</span>
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            setCurrentMatch(m);
                            setCurrentMatchPick({ id: m.entry1_id, course: m.entry1 });
                            setOpenMatchDialog(true);
                          }}
                          className={`flex-1 rounded-xl px-4 py-3 text-center transition ${
                            mine1 ? "bg-black text-white" : "bg-gray-100 hover:bg-gray-200"
                          }`}
                        >
                          <div className="text-sm">{m.entry1.name}</div>
                          <div className="text-lg font-semibold">{showOdd(s?.entry1?.prob)}</div>
                        </button>

                        <button
                          onClick={() => {
                            setCurrentMatch(m);
                            setCurrentMatchPick({ id: m.entry2_id, course: m.entry2 });
                            setOpenMatchDialog(true);
                          }}
                          className={`flex-1 rounded-xl px-4 py-3 text-center transition ${
                            mine2 ? "bg-black text-white" : "bg-gray-100 hover:bg-gray-200"
                          }`}
                        >
                          <div className="text-sm">{m.entry2.name}</div>
                          <div className="text-lg font-semibold">{showOdd(s?.entry2?.prob)}</div>
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {runningQuestions.length === 0 && runningMatches.length === 0 && (
          <p className="text-sm text-gray-500">Não tens apostas a decorrer.</p>
        )}
      </section>

      {/* TERMINADAS */}
      <section className="mb-10">
        <h2 className="mb-4 text-2xl font-bold">Terminadas</h2>

        {/* Perguntas encerradas */}
        {finishedQuestions.length > 0 && (
          <>
            <h3 className="mb-3 text-lg font-semibold text-gray-700">Apostas gerais</h3>
            <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {finishedQuestions.map((qv) => {
                const q = qv.question;
                const myPick = qv.pick_entry.id;
                const opts = optionsFromResults(q.id);
                return (
                  <Card key={`qf-${q.id}`} className="rounded-2xl">
                    <CardHeader>
                      <CardTitle className="text-center text-lg font-semibold">
                        {titleOf(q)} <span className="ml-2 text-xs text-gray-500">(encerrada)</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {opts.length === 0 ? (
                        <p className="text-sm text-gray-500">Sem resultados.</p>
                      ) : (
                        <div className="space-y-2">
                          {opts.slice(0, 3).map((o) => (
                            <div
                              key={o.entry_id}
                              className={`flex items-center justify-between rounded-xl px-3 py-2 ${
                                o.entry_id === myPick
                                  ? "bg-gray-900 text-white"
                                  : "bg-gray-100 text-gray-900"
                              }`}
                            >
                              <span className="text-sm">{o.label}</span>
                              <span className="font-semibold">{(o.prob * 100).toFixed(0)}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {/* Confrontos terminados */}
        {finishedMatches.length > 0 && (
          <>
            <h3 className="mb-3 text-lg font-semibold text-gray-700">Confrontos</h3>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {finishedMatches.map((mv) => {
                const m = mv.match;
                const winId = (m.winner_entry ?? m.winner_entry_id) ?? null;
                const myPick = mv.pick_entry.id;
                const ganhou = winId && myPick === winId;
                  const vencedor = winId ? [m.entry1, m.entry2].find(e => e.id === winId)?.short_code : null;

                return (
                  <Card key={`mf-${m.id}`} className="rounded-2xl">
                    <CardContent className="pt-6">
                      <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
                        <span>{STAGE_LABEL[m.stage]}</span>
                          <span>
                            Vencedor - {vencedor ? `  ${vencedor}` : ""}
                          </span>
                      </div>

                      <div className="mb-4 flex items-center justify-center gap-3 text-lg font-semibold">
                        <span>{m.entry1.short_code}</span>
                        <span className="text-gray-400">—</span>
                        <span>{m.entry2.short_code}</span>
                      </div>

                      <div
                        className={`rounded-xl px-4 py-3 text-center ${
                          ganhou ? "bg-green-600 text-white" : "bg-red-600 text-white"
                        }`}
                      >
                        {ganhou ? "Ganhaste 🎉" : "Perdeste"}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {finishedQuestions.length === 0 && finishedMatches.length === 0 && (
          <p className="text-sm text-gray-500">Ainda não tens apostas terminadas.</p>
        )}
      </section>

      {/* Dialog: mudar voto (pergunta) */}
      <Dialog open={openSimpleDialog} onOpenChange={setOpenSimpleDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{currentQuestion ? titleOf(currentQuestion) : "Mudar voto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-gray-600">Escolhe o curso</p>
            <Select
              value={currentQuestionPick ? String(currentQuestionPick) : undefined}
              onValueChange={(v) => setCurrentQuestionPick(Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleciona uma opção" />
              </SelectTrigger>
              <SelectContent>
                {entries.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.course.short_code} • {e.course.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenSimpleDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={submitSimpleVote} disabled={!currentQuestionPick}>
              Guardar voto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: mudar voto (confronto) */}
      <Dialog open={openMatchDialog} onOpenChange={setOpenMatchDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar aposta</DialogTitle>
            <DialogDescription>
              {currentMatchPick?.course
                ? `Pretendes apostar no curso ${currentMatchPick.course.name}?`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenMatchDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={submitMatchVote}>Sim, apostar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
