"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation"

type Course = { id: number; name: string; short_code: string };

type Match = {
  id: number;
  stage: "GROUP" | "QF" | "SF" | "FINAL" | "THIRD";
  status: "SCHEDULED" | "LIVE" | "FT";
  scheduled_at?: string;
  entry1: Course;
  entry2: Course;
  entry1_id: number;
  entry2_id: number;
  winner_entry?: number | null;      // alguns backends usam isto…
  winner_entry_id?: number | null;   // …outros usam isto
};

type MatchVotesSummary = {
  match: number;
  total: number;
  entry1: { entry_id: number; course: Course; count: number; prob: number };
  entry2: { entry_id: number; course: Course; count: number; prob: number };
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const COMPETITION_ID = 1;

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

function useAuthFlag() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    const read = () => setAuthed(Boolean(localStorage.getItem("access_token")));
    read();
    const on = () => read();
    window.addEventListener("auth-changed", on);
    window.addEventListener("focus", on);
    return () => {
      window.removeEventListener("auth-changed", on);
      window.removeEventListener("focus", on);
    };
  }, []);
  return authed;
}
function makeHeaders(): Headers {
  const h = new Headers({ "Content-Type": "application/json" });
  const t = localStorage.getItem("access_token");
  if (t) h.set("Authorization", `Bearer ${t}`);
  return h;
}

const TARGET_PATH = "/confrontos";

export default function EliminatoriasPage() {
  const isAuthed = useAuthFlag();
  const router = useRouter();
  const [checkedDevice, setCheckedDevice] = useState(false);

  // Redireciona para todos-os-confrontos se for mobile
  useEffect(() => {
    const isMobile = () => {
      if (typeof window === "undefined") return false;
      return /Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(window.navigator.userAgent);
    };
    if (isMobile()) {
      // Usar string literal para evitar encoding das vírgulas
      const qs = "fases=QF,SF,FINAL,THIRD&estado=SCHEDULED";
      router.replace(`${TARGET_PATH}?${qs}`);
      return;
    }
    setCheckedDevice(true);
  }, [router]);

  const [matches, setMatches] = useState<Match[]>([]);
  const [summaries, setSummaries] = useState<Record<number, MatchVotesSummary>>({});
  const [myVotes, setMyVotes] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);

  // dialogs
  const [openConfirm, setOpenConfirm] = useState(false);
  const [openLogin, setOpenLogin] = useState(false);
  const [currentMatch, setCurrentMatch] = useState<Match | null>(null);
  const [currentPick, setCurrentPick] = useState<{ id: number; course: Course } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(
          `${API}/api/competitions/${COMPETITION_ID}/matches/?ordering=scheduled_at`,
          { cache: "no-store" }
        );
        const raw = await r.json();
        const list: Match[] = Array.isArray(raw) ? raw : raw.matches ?? [];
        const onlyKO = list.filter((m) => m.stage !== "GROUP");
        setMatches(onlyKO);

        // summaries só para agendados
        const todo = onlyKO.filter((m) => m.status !== "FT");
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
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!isAuthed) return;
    (async () => {
      try {
        const r = await fetch(`${API}/api/me/bets/?competition=${COMPETITION_ID}`, { headers: makeHeaders() });
        if (!r.ok) return;
        const data = await r.json();
        const map: Record<number, number> = {};
        data.match_votes?.forEach((mv: any) => { map[mv.match.id] = mv.pick_entry.id; });
        setMyVotes(map);
      } catch {}
    })();
  }, [isAuthed]);

  const qf = useMemo(() => matches.filter((m) => m.stage === "QF"), [matches]);
  const sf = useMemo(() => matches.filter((m) => m.stage === "SF"), [matches]);
  const fin = useMemo(() => matches.filter((m) => m.stage === "FINAL"), [matches]);
  const third = useMemo(() => matches.filter((m) => m.stage === "THIRD"), [matches]);

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
        setMyVotes((prev) => ({ ...prev, [currentMatch.id]: currentPick.id }));
        const sr = await fetch(`${API}/api/matches/${currentMatch.id}/votes/summary/`);
        if (sr.ok) {
          const s = (await sr.json()) as MatchVotesSummary;
          setSummaries((prev) => ({ ...prev, [currentMatch.id]: s }));
        }
      } else if (r.status === 401) setOpenLogin(true);
    } finally {
      setOpenConfirm(false);
      setCurrentMatch(null);
      setCurrentPick(null);
    }
  };

  // Só renderiza se já verificou o dispositivo
  if (!checkedDevice || loading) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Eliminatórias</h1>
        <div className="text-sm text-gray-500">A carregar…</div>
      </main>
    );
  }

  /* ---------- UI helpers ---------- */
  function MatchChip({ m, side }: { m?: Match; side: "left" | "right" }) {
    if (!m) {
      return (
        <div className="rounded-xl border bg-gray-50 px-4 py-3 text-center text-sm text-gray-400">
          Por definir
        </div>
      );
    }

    const sum = summaries[m.id];
    const pick = side === "left"
      ? { id: m.entry1_id, course: m.entry1 }
      : { id: m.entry2_id, course: m.entry2 };

    const mine = myVotes[m.id] === pick.id;
    const odd = side === "left" ? sum?.entry1?.prob : sum?.entry2?.prob;

    const winId = (m.winner_entry ?? m.winner_entry_id) ?? null;
    const isFinished = m.status === "FT";
    const isWinner = isFinished && winId && winId === pick.id;

    if (isFinished) {
      return (
        <div
          className={
            `rounded-xl px-4 py-3 text-center border ` +
            (isWinner
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-red-50 text-red-700 border-red-200")
          }
        >
          <div className="text-base font-semibold">{pick.course.short_code}</div>
        </div>
      );
    }

    return (
      <button
        onClick={() => askBet(m, pick)}
        className={`w-full rounded-xl px-4 py-3 text-center transition ${
          mine ? "bg-black text-white" : "bg-gray-100 hover:bg-gray-200"
        }`}
      >
        <div className="text-base font-semibold">{pick.course.short_code}</div>
        <div className="text-lg font-semibold">{showOdd(odd)}</div>
      </button>
    );
  }

  function Bracket() {
  // ordenar para ficar previsível
  const oqf = [...qf].sort((a, b) => +new Date(a.scheduled_at ?? 0) - +new Date(b.scheduled_at ?? 0));
  const osf = [...sf].sort((a, b) => +new Date(a.scheduled_at ?? 0) - +new Date(b.scheduled_at ?? 0));
  const ofi = [...fin].sort((a, b) => +new Date(a.scheduled_at ?? 0) - +new Date(b.scheduled_at ?? 0));
  const oth = [...third].sort((a, b) => +new Date(a.scheduled_at ?? 0) - +new Date(b.scheduled_at ?? 0));

  // colunas: [QF-esq] [SF-esq] [FINAL] [SF-dir] [QF-dir]
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
      {/* QF esquerda (2 jogos) */}
      <div className="space-y-6">
        {[0, 1].map((i) => {
          const m = oqf[i];
          return (
            <div key={`qfl-${i}`} className="rounded-xl border p-3">
              <div className="mb-2 text-xs text-gray-500">{m ? fmtHour(m.scheduled_at) : "—"}</div>
              <div className="grid grid-cols-2 gap-3">
                <MatchChip m={m} side="left" />
                <MatchChip m={m} side="right" />
              </div>
            </div>
          );
        })}
      </div>

      {/* SF esquerda — centrada verticalmente */}
      <div className="flex h-full flex-col">
        <div className="flex-1 flex items-center">
          {(() => {
            const m = osf[0];
            return (
              <div className="w-full rounded-xl border p-3">
                <div className="mb-2 text-xs text-gray-500">{m ? fmtHour(m.scheduled_at) : "—"}</div>
                <div className="grid grid-cols-2 gap-3">
                  <MatchChip m={m} side="left" />
                  <MatchChip m={m} side="right" />
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Final — centrada verticalmente */}
      <div className="flex h-full flex-col">
        <div className="flex-1 flex items-center">
          <div className="w-full rounded-xl border p-3">
            <div className="mb-2 text-xs text-gray-500">
              {ofi[0] ? "Final • " + fmtHour(ofi[0].scheduled_at) : "Final"}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MatchChip m={ofi[0]} side="left" />
              <MatchChip m={ofi[0]} side="right" />
            </div>
          </div>
        </div>
      </div>

      {/* SF direita — centrada verticalmente */}
      <div className="flex h-full flex-col">
        <div className="flex-1 flex items-center">
          {(() => {
            const m = osf[1];
            return (
              <div className="w-full rounded-xl border p-3">
                <div className="mb-2 text-xs text-gray-500">{m ? fmtHour(m.scheduled_at) : "—"}</div>
                <div className="grid grid-cols-2 gap-3">
                  <MatchChip m={m} side="left" />
                  <MatchChip m={m} side="right" />
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* QF direita (2 jogos) */}
      <div className="space-y-6">
        {[2, 3].map((i) => {
          const m = oqf[i];
          return (
            <div key={`qfr-${i}`} className="rounded-xl border p-3">
              <div className="mb-2 text-xs text-gray-500">{m ? fmtHour(m.scheduled_at) : "—"}</div>
              <div className="grid grid-cols-2 gap-3">
                <MatchChip m={m} side="left" />
                <MatchChip m={m} side="right" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Eliminatórias</h1>

      </div>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        {qf.length + sf.length + fin.length + third.length === 0 ? (
          <div className="rounded-xl border bg-gray-50 p-6 text-center text-sm text-gray-500">
            <div className="my-2"></div>
            Ainda estamos na Fase de Grupos.
            <div className="my-6"></div>
            <Link href="/fase-grupos" className="font-medium text-gray-700 hover:underline">
              Ir para a Fase de Grupos
            </Link>
          </div>
        ) : (
          <Bracket />
        )}
      </section>

      {/* Dialogs */}
      <Dialog open={openConfirm} onOpenChange={setOpenConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar aposta</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenConfirm(false)}>
              Cancelar
            </Button>
            <Button onClick={submitBet}>Sim, apostar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
