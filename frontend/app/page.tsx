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

/** Tipos (espelham os serializers do backend) */
type Course = { id: number; name: string; short_code: string };
type StandingEntry = { id: number; course: Course };
type Question = {
  id: number;
  title?: string;
  question?: string;
  text?: string;
};
type QuestionResults = {
  total: number;
  results: Array<{ entry_id: number; count: number; prob: number }>; // prob = percentagem [0..1]
};
type Match = {
  id: number;
  stage: string;
  status: "SCHEDULED" | "LIVE" | "FT";
  scheduled_at: string;
  // ATENÇÃO: entry1/entry2 já são o curso slim
  entry1: { id: number; name: string; short_code: string };
  entry2: { id: number; name: string; short_code: string };
  entry1_id: number; // CompetitionEntry id
  entry2_id: number; // CompetitionEntry id
};

type MatchVotesSummary = {
  match: number;
  total: number;
  entry1: { entry_id: number; course: Course; count: number; prob: number }; // prob AQUI é **odd** (1/p)
  entry2: { entry_id: number; course: Course; count: number; prob: number };
};
type MyBetsPayload = {
  match_votes: Array<{ match: Match; pick_entry: { id: number } }>;
  question_votes: Array<{ question: Question; pick_entry: { id: number } }>;
};

export const API =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (process.env.NODE_ENV === "production"
    ? "https://api.betpraxis.pt"
    : "http://localhost:8000");
    
const COMPETITION_ID = 1;

function fmtHour(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}
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

export default function HomePage() {
  const router = useRouter();
  const isAuthed = useAuthFlag();

  const [entries, setEntries] = useState<StandingEntry[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionResults, setQuestionResults] = useState<
    Record<number, QuestionResults>
  >({});
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchSummaries, setMatchSummaries] = useState<
    Record<number, MatchVotesSummary>
  >({});
  const [myMatchVotes, setMyMatchVotes] = useState<Record<number, number>>({}); // matchId -> entryId

  // Dialogs
  const [openSimpleDialog, setOpenSimpleDialog] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [pickedEntry, setPickedEntry] = useState<number | null>(null);

  const [openConfirmMatch, setOpenConfirmMatch] = useState(false);
  const [currentMatch, setCurrentMatch] = useState<Match | null>(null);
  const [currentPick, setCurrentPick] = useState<{
    id: number;
    course: Course;
  } | null>(null);

  const [openLoginReq, setOpenLoginReq] = useState(false);

  // standings (para dropdowns)
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(
          `${API}/api/competitions/${COMPETITION_ID}/standings/`
        );
        const data = await r.json();
        const list: StandingEntry[] = Array.isArray(data)
          ? data
          : data?.entries ?? [];
        setEntries(list);
      } catch (e) {
        console.error("standings fetch error", e);
      }
    })();
  }, []);

  // perguntas + resultados
  useEffect(() => {
    (async () => {
      try {
        const rq = await fetch(
          `${API}/api/competitions/${COMPETITION_ID}/questions/`
        );
        const raw = await rq.json();
        const qs: Question[] = Array.isArray(raw) ? raw : raw?.questions ?? [];
        setQuestions(qs);

        const results = await Promise.all(
          qs.map(async (q) => {
            const r = await fetch(`${API}/api/questions/${q.id}/results/`);
            const res = await r.json();
            return [q.id, res] as const;
          })
        );
        const map: Record<number, QuestionResults> = {};
        results.forEach(([id, res]) => (map[id] = res as QuestionResults));
        setQuestionResults(map);
      } catch (e) {
        console.error("questions/results fetch error", e);
      }
    })();
  }, []);

  // próximos confrontos
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(
          `${API}/api/competitions/${COMPETITION_ID}/matches/?status=SCHEDULED&ordering=scheduled_at&limit=6`
        );
        const data = await r.json();
        const list: Match[] = Array.isArray(data) ? data : data?.matches ?? [];
        setMatches(list);

        const summaries = await Promise.all(
          list.map(async (m) => {
            const sr = await fetch(`${API}/api/matches/${m.id}/votes/summary/`);
            const s = await sr.json();
            return [m.id, s] as const;
          })
        );
        const obj: Record<number, MatchVotesSummary> = {};
        summaries.forEach(([id, s]) => (obj[id] = s as MatchVotesSummary));
        setMatchSummaries(obj);
      } catch (e) {
        console.error("matches fetch error", e);
      }
    })();
  }, []);

  // minhas apostas (para destaque)
  useEffect(() => {
    if (!isAuthed) return;
    (async () => {
      try {
        const r = await fetch(
          `${API}/api/me/bets/?competition=${COMPETITION_ID}`,
          {
            headers: makeHeaders(),
          }
        );
        if (!r.ok) return;
        const data: MyBetsPayload = await r.json();
        const map: Record<number, number> = {};
        data.match_votes?.forEach((mv) => {
          map[mv.match.id] = mv.pick_entry.id; // id do ENTRY
        });
        setMyMatchVotes(map);
      } catch (e) {
        console.error("my bets fetch error", e);
      }
    })();
  }, [isAuthed]);

  // top 3 perguntas por nº de votos
  const topQuestions = useMemo(() => {
    const tuples = questions.map((q) => {
      const res = questionResults[q.id];
      const total = res?.total ?? 0;
      return { q, total };
    });
    return tuples
      .sort((a, b) => b.total - a.total)
      .slice(0, 3)
      .map((t) => t.q);
  }, [questions, questionResults]);

  // mostra 1 pergunta de cada vez
  const [qIndex, setQIndex] = useState(0);

  // sempre que o conjunto de perguntas mudar, mantém o índice válido
  useEffect(() => {
    if (qIndex >= topQuestions.length) setQIndex(0);
  }, [topQuestions, qIndex]);

  // helpers
  const titleOf = (q: Question) =>
    q.title ?? q.text ?? q.question ?? "Pergunta";
  const getOptionsFromResults = (res?: QuestionResults) => {
    if (!res)
      return [] as Array<{ entry_id: number; prob: number; course?: Course }>;
    return res.results
      .map((r) => ({
        entry_id: r.entry_id,
        prob: r.prob,
        course: entries.find((e) => e.id === r.entry_id)?.course,
      }))
      .sort((a, b) => b.prob - a.prob);
  };
  const showOdd = (x?: number) => (x ? x.toFixed(2) : "-"); // já vem em odd do backend

  // submit votos
  const submitSimpleVote = async () => {
    if (!currentQuestion || !pickedEntry) return;
    try {
      const r = await fetch(
        `${API}/api/questions/${currentQuestion.id}/vote/`,
        {
          method: "POST",
          headers: makeHeaders(),
          body: JSON.stringify({ pick_entry_id: pickedEntry }),
        }
      );
      if (r.ok) {
        const rr = await fetch(
          `${API}/api/questions/${currentQuestion.id}/results/`
        );
        const res = await rr.json();
        setQuestionResults((prev) => ({ ...prev, [currentQuestion.id]: res }));
        setOpenSimpleDialog(false);
      } else if (r.status === 401) {
        setOpenSimpleDialog(false);
        setOpenLoginReq(true);
      }
    } catch (e) {
      console.error("simple vote error", e);
    }
  };

  const submitMatchVote = async () => {
    if (!currentMatch || !currentPick) return;
    try {
      const r = await fetch(`${API}/api/matches/${currentMatch.id}/vote/`, {
        method: "POST",
        headers: makeHeaders(),
        body: JSON.stringify({ pick_entry_id: currentPick.id }),
      });
      if (r.ok) {
        setMyMatchVotes((prev) => ({
          ...prev,
          [currentMatch.id]: currentPick.id,
        }));
        const sr = await fetch(
          `${API}/api/matches/${currentMatch.id}/votes/summary/`
        );
        const s = await sr.json();
        setMatchSummaries((prev) => ({ ...prev, [currentMatch.id]: s }));
        setOpenConfirmMatch(false);
      } else if (r.status === 401) {
        setOpenConfirmMatch(false);
        setOpenLoginReq(true);
      }
    } catch (e) {
      console.error("match vote error", e);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <section className="mb-10">
        {topQuestions.length === 0 ? (
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-center text-lg font-semibold">
                Apostas gerais
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 text-center">
                Sem perguntas ativas.
              </p>
            </CardContent>
          </Card>
        ) : (
          (() => {
            const q = topQuestions[qIndex];
            const res = questionResults[q.id];
            const top3 = getOptionsFromResults(res).slice(0, 3);
            const title = titleOf(q);

            return (
              <div className="mx-auto max-w-xl">
                {/* wrapper relativo p/ setas absolutas */}
                <div className="relative">
                  <Card className="rounded-2xl">
                    <CardHeader className="pt-6">
                      <CardTitle className="text-center text-lg font-semibold">
                        {title}
                      </CardTitle>
                    </CardHeader>

                    <CardContent>
                      {(!res || res.total === 0) && (
                        <p className="mb-4 text-sm text-gray-500 text-center">
                          Sem votos.
                        </p>
                      )}

                      {res && res.total > 0 && (
                        <div className="mb-4 flex flex-col items-center gap-2">
                          {top3.map((opt) => (
                            <div
                              key={opt.entry_id}
                              className="flex items-center justify-between w-64 max-w-full rounded-xl bg-gray-100 px-4 py-2"
                            >
                              <span className="text-sm">
                                {opt.course?.short_code ??
                                  opt.course?.name ??
                                  `#${opt.entry_id}`}
                              </span>
                              <span className="font-semibold">
                                {(opt.prob * 100).toFixed(0)}%
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex justify-center">
                        <Button
                          onClick={() => {
                            if (!isAuthed) return setOpenLoginReq(true);
                            setCurrentQuestion(q);
                            setPickedEntry(null);
                            setOpenSimpleDialog(true);
                          }}
                        >
                          Votar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* seta anterior (pretinha, pequena, sem moldura) */}
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-between px-3">
                    <button
                      aria-label="Anterior"
                      onClick={() =>
                        setQIndex(
                          (i) =>
                            (i - 1 + topQuestions.length) % topQuestions.length
                        )
                      }
                      className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full bg-black text-white leading-none shadow hover:opacity-90 focus:outline-none"
                    >
                      ‹
                    </button>

                    <button
                      aria-label="Seguinte"
                      onClick={() =>
                        setQIndex((i) => (i + 1) % topQuestions.length)
                      }
                      className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full bg-black text-white leading-none shadow hover:opacity-90 focus:outline-none"
                    >
                      ›
                    </button>
                  </div>
                </div>
              </div>
            );
          })()
        )}
      </section>

      {/* Próximos confrontos */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Próximos confrontos</h2>
          <Link
            href="/confrontos?tipo=confrontos&ordenar=inicio"
            className="text-sm font-medium text-gray-700 hover:underline"
          >
            Ver mais
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {matches.map((m) => {
            const s = matchSummaries[m.id];
            const isMine1 = myMatchVotes[m.id] === m.entry1_id;
            const isMine2 = myMatchVotes[m.id] === m.entry2_id;
            return (
              <Card key={m.id} className="rounded-2xl">
                <CardContent className="pt-6">
                  <p className="mb-3 text-xs text-gray-500 text-center">
                    {m.stage === "GROUP" ? "Fase de grupos" : m.stage}
                  </p>
                  <div className="mb-6 flex items-center justify-center gap-3 text-lg font-semibold">
                    <span>{m.entry1.short_code}</span>
                    <span className="text-gray-400">
                      — {fmtHour(m.scheduled_at)} —
                    </span>
                    <span>{m.entry2.short_code}</span>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        if (!isAuthed) return setOpenLoginReq(true);
                        setCurrentMatch(m);
                        setCurrentPick({ id: m.entry1_id, course: m.entry1 });
                        setOpenConfirmMatch(true);
                      }}
                      className={`flex-1 rounded-xl px-4 py-3 text-center transition ${
                        isMine1
                          ? "bg-black text-white"
                          : "bg-gray-100 hover:bg-gray-200"
                      }`}
                    >
                      <div className="text-sm">{m.entry1.name}</div>
                      <div className="text-lg font-semibold">
                        {showOdd(s?.entry1?.prob)}
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        if (!isAuthed) return setOpenLoginReq(true);
                        setCurrentMatch(m);
                        setCurrentPick({ id: m.entry2_id, course: m.entry2 });
                        setOpenConfirmMatch(true);
                      }}
                      className={`flex-1 rounded-xl px-4 py-3 text-center transition ${
                        isMine2
                          ? "bg-black text-white"
                          : "bg-gray-100 hover:bg-gray-200"
                      }`}
                    >
                      <div className="text-sm">{m.entry2.name}</div>
                      <div className="text-lg font-semibold">
                        {showOdd(s?.entry2?.prob)}
                      </div>
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Dialogs */}
      <Dialog open={openSimpleDialog} onOpenChange={setOpenSimpleDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {currentQuestion ? titleOf(currentQuestion) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-gray-600">Escolhe o curso</p>
            <Select onValueChange={(v) => setPickedEntry(Number(v))}>
              <SelectTrigger>
                <SelectValue placeholder="Seleciona uma opção" />
              </SelectTrigger>
              <SelectContent>
                {entries.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.course.short_code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpenSimpleDialog(false)}
            >
              Cancelar
            </Button>
            <Button onClick={submitSimpleVote} disabled={!pickedEntry}>
              Votar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpenConfirmMatch(false)}
            >
              Cancelar
            </Button>
            <Button onClick={submitMatchVote}>Sim, apostar</Button>
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
    </div>
  );
}
