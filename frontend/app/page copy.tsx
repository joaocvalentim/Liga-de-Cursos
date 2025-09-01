"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

/* ========= types ========= */

type Course = { id: number; name: string; short_code?: string };
type Match = {
  id: number;
  stage: "GROUP" | "QF" | "SF" | "THIRD" | "FINAL";
  status: "SCHEDULED" | "LIVE" | "FT";
  scheduled_at: string | null;
  entry1: Course; entry2: Course;
  entry1_id: number; entry2_id: number;
  winner_entry: number | null;
};

type Question = { id: number; competition: number; text: string };

type VoteOption = {
  id: number;
  entry_id: number;
  course: Course;
  votes_count?: number;
  prob?: number; // se o backend já enviar; caso não, calculamos
};

type SummarySide = { entry_id: number; course: Course; count: number; prob: number };
type MatchSummary = { match: number; total: number; entry1: SummarySide; entry2: SummarySide };

/* ========= config ========= */

const API = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";
const COMP_ID = process.env.NEXT_PUBLIC_COMPETITION_ID || "1";

/* ========= page ========= */

export default function HomePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);
  const [oddsByMatch, setOddsByMatch] = useState<Record<number, MatchSummary>>({});
  const [myMatchVote, setMyMatchVote] = useState<Record<number, number>>({}); // matchId -> entryId

  const [questions, setQuestions] = useState<Question[]>([]);
  const [optionsByQuestion, setOptionsByQuestion] = useState<Record<number, VoteOption[]>>({});
  const [myQuestionVote, setMyQuestionVote] = useState<Record<number, number>>({}); // questionId -> optionId

  const [error, setError] = useState<string | null>(null);
  const isLogged = useMemo(
    () => typeof window !== "undefined" && !!localStorage.getItem("access_token"),
    []
  );

  /* ---------- load data ---------- */

  useEffect(() => {
    let mounted = true;

    const toArray = (json: any) =>
      Array.isArray(json)
        ? json
        : Array.isArray(json?.results)
        ? json.results
        : Array.isArray(json?.matches)
        ? json.matches
        : [];

    const fetchAll = async () => {
      try {
        // matches próximos
        const mRes = await fetch(
          `${API}/api/competitions/${COMP_ID}/matches/?status=SCHEDULED&ordering=scheduled_at&limit=6`,
          { cache: "no-store" }
        );
        if (!mRes.ok) throw new Error("Falha ao obter confrontos");
        const mJson = await mRes.json();
        const mData: Match[] = toArray(mJson);

        // questions ativas
        const qRes = await fetch(`${API}/api/competitions/${COMP_ID}/questions/`, { cache: "no-store" });
        if (!qRes.ok) throw new Error("Falha ao obter perguntas");
        const qJson = await qRes.json();
        const qData: Question[] = Array.isArray(qJson?.questions) ? qJson.questions : [];

        if (!mounted) return;
        setMatches(mData);
        setQuestions(qData);

        // summaries de odds de cada match
        const summaries = await Promise.all(
          mData.map(async (m) => {
            try {
              const r = await fetch(`${API}/api/matches/${m.id}/votes/summary/`, { cache: "no-store" });
              if (!r.ok) return null;
              return (await r.json()) as MatchSummary;
            } catch {
              return null;
            }
          })
        );
        const map: Record<number, MatchSummary> = {};
        summaries.forEach((s) => {
          if (s?.match) map[s.match] = s;
        });
        if (mounted) setOddsByMatch(map);

        // opções de cada pergunta (para mostrar top-3)
        const optMap: Record<number, VoteOption[]> = {};
        await Promise.all(
          qData.map(async (q) => {
            try {
              const r = await fetch(`${API}/api/questions/${q.id}/options/`, { cache: "no-store" });
              if (!r.ok) return;
              const arr = await r.json();
              const options: VoteOption[] = Array.isArray(arr) ? arr : Array.isArray(arr?.options) ? arr.options : [];
              optMap[q.id] = options;
            } catch {}
          })
        );
        if (mounted) setOptionsByQuestion(optMap);

        // “meu voto” persistente — se autenticado
        const token = localStorage.getItem("access_token");
        if (token) {
          // matches
          const myMatch: Record<number, number> = {};
          await Promise.all(
            mData.map(async (m) => {
              try {
                const r = await fetch(`${API}/api/matches/${m.id}/vote/`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (r.ok) {
                  const j = await r.json();
                  if (j?.pick_entry_id) myMatch[m.id] = j.pick_entry_id;
                }
              } catch {}
            })
          );
          if (mounted) setMyMatchVote(myMatch);

          // questions
          const myQ: Record<number, number> = {};
          await Promise.all(
            qData.map(async (q) => {
              try {
                const r = await fetch(`${API}/api/questions/${q.id}/vote/`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (r.ok) {
                  const j = await r.json();
                  if (j?.option_id) myQ[q.id] = j.option_id;
                }
              } catch {}
            })
          );
          if (mounted) setMyQuestionVote(myQ);
        }
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || "Erro a carregar dados");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchAll();
    return () => {
      mounted = false;
    };
  }, []);

  /* ---------- dialogs: matches ---------- */

  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingMatchId, setPendingMatchId] = useState<number | null>(null);
  const [pendingEntryId, setPendingEntryId] = useState<number | null>(null);
  const [pendingCourseName, setPendingCourseName] = useState<string>("");
  const [posting, setPosting] = useState(false);

  async function submitMatchBet() {
    if (!pendingMatchId || !pendingEntryId) return;
    if (!isLogged) {
      return router.push("/login");
    }
    try {
      setPosting(true);
      const token = localStorage.getItem("access_token")!;
      const r = await fetch(`${API}/api/matches/${pendingMatchId}/vote/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pick_entry_id: pendingEntryId }),
      });
      if (!r.ok) throw new Error("Erro ao apostar");
      // refresh odds e registar o meu voto em memória
      const s = await fetch(`${API}/api/matches/${pendingMatchId}/votes/summary/`, { cache: "no-store" });
      if (s.ok) {
        const j: MatchSummary = await s.json();
        setOddsByMatch((old) => ({ ...old, [j.match]: j }));
      }
      setMyMatchVote((old) =>
        pendingMatchId && pendingEntryId ? { ...old, [pendingMatchId]: pendingEntryId } : old
      );
      setDialogOpen(false);
    } catch (e: any) {
      alert(e?.message || "Erro ao submeter aposta");
    } finally {
      setPosting(false);
    }
  }

  /* ---------- dialog: perguntas ---------- */

  const [qDialogOpen, setQDialogOpen] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string>("");

  function openQuestionDialog(q: Question) {
    setActiveQuestion(q);
    setSelectedOptionId("");
    setQDialogOpen(true);
  }

  async function submitQuestionVote() {
    if (!activeQuestion || !selectedOptionId) return;
    if (!isLogged) return router.push("/login");

    try {
      const token = localStorage.getItem("access_token")!;
      const r = await fetch(`${API}/api/questions/${activeQuestion.id}/vote/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ option_id: Number(selectedOptionId) }),
      });
      if (!r.ok) throw new Error("Erro ao votar");
      // marcar o meu voto e fechar
      setMyQuestionVote((old) => ({ ...old, [activeQuestion.id]: Number(selectedOptionId) }));
      setQDialogOpen(false);

      // refrescar opções para top-3
      const r2 = await fetch(`${API}/api/questions/${activeQuestion.id}/options/`, { cache: "no-store" });
      if (r2.ok) {
        const arr = await r2.json();
        const options: VoteOption[] = Array.isArray(arr) ? arr : Array.isArray(arr?.options) ? arr.options : [];
        setOptionsByQuestion((old) => ({ ...old, [activeQuestion.id]: options }));
      }
    } catch (e: any) {
      alert(e?.message || "Erro ao votar");
    }
  }

  /* ---------- render ---------- */

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-100">
        <span className="text-gray-700">A carregar…</span>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-100">
        <Card className="w-full max-w-md">
          <CardHeader><CardTitle>Erro</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-red-600">{error}</p></CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100">
      <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">

        {/* ---------- Apostas gerais ---------- */}
        <section>
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Apostas gerais</h2>

          {questions.length === 0 ? (
            <p className="text-gray-500">Não há perguntas ativas.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {questions.map((q) => {
                const opts = optionsByQuestion[q.id] || [];
                const withProb = computeProbabilities(opts);
                const top3 = withProb.slice(0, 3);
                const voted = !!myQuestionVote[q.id];

                return (
                  <Card key={q.id}>
                    <CardHeader className="pb-1">
                      <CardTitle className="text-center text-lg">{q.text}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {/* Top 3 */}
                      {top3.length > 0 ? (
                        <div className="space-y-2 mt-2">
                          {top3.map((o, idx) => (
                            <div
                              key={o.id}
                              className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 border border-gray-200"
                            >
                              <span className="text-sm text-gray-700">
                                {idx + 1}. {o.course?.short_code || o.course?.name || "Curso"}
                              </span>
                              <span className="text-sm font-semibold">{(o.prob! * 100).toFixed(1)}%</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 mt-2">Sem votos ainda.</p>
                      )}

                      {/* botão Votar centrado */}
                      <div className="flex justify-center mt-4">
                        <Button
                          className={voted ? "bg-neutral-900 text-white hover:bg-neutral-900" : undefined}
                          onClick={() => (isLogged ? openQuestionDialog(q) : router.push("/login"))}
                        >
                          Votar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* ---------- Próximos confrontos ---------- */}
        <section>
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Próximos confrontos</h2>
          {matches.length === 0 ? (
            <p className="text-gray-500">Ainda não existem jogos agendados.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {matches.map((m) => {
                const sum = oddsByMatch[m.id];
                const odd1 = toOdd(sum?.entry1?.prob);
                const odd2 = toOdd(sum?.entry2?.prob);
                const myPick = myMatchVote[m.id];
                const s1 = myPick === m.entry1_id;
                const s2 = myPick === m.entry2_id;

                return (
                  <Card key={m.id} className="overflow-hidden">
                    <div className="px-5 pt-4 text-sm text-gray-600">{labelStage(m.stage)}</div>
                    <CardHeader className="pb-0">
                      <CardTitle className="text-xl flex items-center justify-center gap-3">
                        <span>{m.entry1?.short_code ?? "??"}</span>
                        <span className="text-gray-400">— {formatTime(m.scheduled_at)} —</span>
                        <span>{m.entry2?.short_code ?? "??"}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 pb-5">
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          className={betBtnClass(s1)}
                          onClick={() => {
                            if (!isLogged) return router.push("/login");
                            setPendingMatchId(m.id);
                            setPendingEntryId(m.entry1_id);
                            setPendingCourseName(m.entry1?.name || "Curso A");
                            setDialogOpen(true);
                          }}
                        >
                          <div className={labelClass(s1)}>{m.entry1?.name}</div>
                          <div className="text-xl font-semibold">{odd1}</div>
                        </button>
                        <button
                          className={betBtnClass(s2)}
                          onClick={() => {
                            if (!isLogged) return router.push("/login");
                            setPendingMatchId(m.id);
                            setPendingEntryId(m.entry2_id);
                            setPendingCourseName(m.entry2?.name || "Curso B");
                            setDialogOpen(true);
                          }}
                        >
                          <div className={labelClass(s2)}>{m.entry2?.name}</div>
                          <div className="text-xl font-semibold">{odd2}</div>
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* popup apostar match */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar aposta</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-700">
            Pretendes apostar no curso <b>{pendingCourseName}</b>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={submitMatchBet} disabled={posting}>{posting ? "A apostar…" : "Sim, apostar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* popup votar pergunta */}
      <Dialog open={qDialogOpen} onOpenChange={setQDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{activeQuestion?.text || "Votar"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <label className="text-sm text-gray-700">Escolhe o curso</label>
            <Select value={selectedOptionId} onValueChange={setSelectedOptionId}>
              <SelectTrigger><SelectValue placeholder="Seleciona uma opção" /></SelectTrigger>
              <SelectContent>
                {(activeQuestion ? optionsByQuestion[activeQuestion.id] || [] : []).map((o) => (
                  <SelectItem key={o.id} value={String(o.id)}>
                    {o.course?.short_code || o.course?.name || "Curso"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setQDialogOpen(false)}>Cancelar</Button>
            <Button onClick={submitQuestionVote} disabled={!selectedOptionId}>Votar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

/* ========= helpers ========= */

function betBtnClass(selected: boolean) {
  return [
    "rounded-lg px-4 py-3 text-center transition border",
    selected
      ? "bg-neutral-900 text-white border-neutral-900 hover:bg-neutral-900"
      : "bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-900",
  ].join(" ");
}

function labelClass(selected: boolean) {
  return selected ? "text-xs mb-1 text-white/90" : "text-xs mb-1 text-gray-700";
}

function toOdd(prob?: number) {
  if (!prob || prob <= 0) return "—";
  const v = 1 / prob;
  return Number(v.toFixed(2)).toString();
}

function labelStage(s: Match["stage"]) {
  switch (s) {
    case "GROUP": return "Fase de grupos";
    case "QF": return "Quartos";
    case "SF": return "Meias";
    case "THIRD": return "3º/4º";
    case "FINAL": return "Final";
    default: return s;
  }
}
function formatTime(iso: string | null) {
  if (!iso) return "—:—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—:—";
  return d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

// calcula prob. por opção se o backend só enviar votes_count
function computeProbabilities(options: VoteOption[]) {
  if (!options?.length) return [];
  if (options.every((o) => typeof o.prob === "number")) {
    return [...options].sort((a, b) => (b.prob! - a.prob!));
  }
  const total = options.reduce((s, o) => s + (o.votes_count || 0), 0) || 0;
  return [...options]
    .map((o) => ({ ...o, prob: total ? (o.votes_count || 0) / total : 0 }))
    .sort((a, b) => (b.prob! - a.prob!));
}
