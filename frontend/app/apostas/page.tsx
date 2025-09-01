"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

type Course = { id: number; name: string; short_code?: string };
type Match = {
  id: number;
  stage: "GROUP" | "QF" | "SF" | "THIRD" | "FINAL";
  status: "SCHEDULEED" | "SCHEDULED" | "LIVE" | "FT";
  scheduled_at: string | null;
  entry1?: Course; entry2?: Course;  // nomes “novos”
  curso1?: Course; curso2?: Course;  // fallback
  entry1_id?: number; entry2_id?: number;
};

type SummarySide = {
  entry_id: number;
  course: Course;
  count: number;
  prob: number; // 0..1
};

type MatchSummary = {
  match: number;
  total: number;
  entry1: SummarySide;
  entry2: SummarySide;
};

const API = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";
const COMP_ID = process.env.NEXT_PUBLIC_COMPETITION_ID || "1";

export default function ApostasPage() {
  const search = useSearchParams();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [stage, setStage] = useState<string>("GROUP");     // filtro
  const [status, setStatus] = useState<string>("SCHEDULED");
  const [limit, setLimit] = useState<number>(20);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeMatchId, setActiveMatchId] = useState<number | null>(null);
  const [summary, setSummary] = useState<MatchSummary | null>(null);
  const [posting, setPosting] = useState(false);

  const [isLogged, setIsLogged] = useState(false);

  // login state via localStorage (sem quebrar render no server)
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsLogged(!!localStorage.getItem("access_token"));
    const onStorage = () => setIsLogged(!!localStorage.getItem("access_token"));
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // carregar lista de confrontos conforme filtros
  useEffect(() => {
    let alive = true;

    const toArray = (json: any) =>
      Array.isArray(json)
        ? json
        : Array.isArray(json?.matches)
        ? json.matches
        : Array.isArray(json?.results)
        ? json.results
        : [];

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (stage && stage !== "ALL") params.set("stage", stage);
        if (status) params.set("status", status);
        params.set("ordering", "scheduled_at");
        if (limit) params.set("limit", String(limit));

        const r = await fetch(`${API}/api/competitions/${COMP_ID}/matches/?${params.toString()}`, {
          cache: "no-store",
        });
        if (!r.ok) throw new Error("Falha ao obter confrontos");
        const j = await r.json();
        if (!alive) return;

        setMatches(toArray(j));
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Erro a carregar confrontos");
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, [stage, status, limit]);

  // se vier ?match=123 na query, abre logo o popup desse confronto
  useEffect(() => {
    const m = search.get("match");
    if (m) {
      const id = Number(m);
      if (Number.isFinite(id)) openDialogForMatch(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function openDialogForMatch(matchId: number) {
    setActiveMatchId(matchId);
    setDialogOpen(true);
    setSummary(null);
    try {
      const r = await fetch(`${API}/api/matches/${matchId}/votes/summary/`, { cache: "no-store" });
      if (!r.ok) throw new Error("Falha ao obter odds");
      const j: MatchSummary = await r.json();
      setSummary(j);
    } catch (e: any) {
      setError(e?.message || "Erro a carregar odds");
    }
  }

  async function apostar(entryId: number) {
    if (!activeMatchId) return;
    if (!isLogged) {
      router.push("/login");
      return;
    }
    try {
      setPosting(true);
      const token = localStorage.getItem("access_token");
      const r = await fetch(`${API}/api/matches/${activeMatchId}/vote/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ pick_entry_id: entryId }),
      });
      if (!r.ok) {
        let msg = `Erro a apostar (${r.status})`;
        try {
          const j = await r.json();
          msg = (j?.detail as string) || JSON.stringify(j) || msg;
        } catch {}
        throw new Error(msg);
      }
      // refrescar resumo
      const s = await fetch(`${API}/api/matches/${activeMatchId}/votes/summary/`);
      if (s.ok) setSummary(await s.json());
    } catch (e: any) {
      alert(e?.message || "Erro ao submeter aposta");
    } finally {
      setPosting(false);
    }
  }

  const stageOptions = useMemo(
    () => [
      { v: "ALL", label: "Todas as fases" },
      { v: "GROUP", label: "Fase de Grupos" },
      { v: "QF", label: "Quartos" },
      { v: "SF", label: "Meias" },
      { v: "THIRD", label: "3º/4º" },
      { v: "FINAL", label: "Final" },
    ],
    []
  );

  const statusOptions = useMemo(
    () => [
      { v: "SCHEDULED", label: "Agendados" },
      { v: "LIVE", label: "A decorrer" },
      { v: "FT", label: "Terminados" },
    ],
    []
  );

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
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <h1 className="text-3xl font-semibold text-gray-900">Apostas</h1>

        {/* Filtros */}
        <Card>
          <CardContent className="py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-3">
              <div className="w-48">
                <Select value={stage} onValueChange={setStage}>
                  <SelectTrigger><SelectValue placeholder="Fase" /></SelectTrigger>
                  <SelectContent>
                    {stageOptions.map(o => (
                      <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-40">
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
                  <SelectContent>
                    {statusOptions.map(o => (
                      <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Select
                value={String(limit)}
                onValueChange={(v) => setLimit(Number(v))}
              >
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="Limite" />
                </SelectTrigger>
                <SelectContent>
                  {["10","20","50","100"].map(n => (
                    <SelectItem key={n} value={n}>{n} jogos</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                Topo
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Lista de confrontos */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle>Confrontos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {matches.length === 0 ? (
              <p className="text-gray-500 text-sm">Sem confrontos para os filtros escolhidos.</p>
            ) : (
              matches.map((m) => {
                const a = m.entry1 || m.curso1;
                const b = m.entry2 || m.curso2;
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-md border p-3 bg-white"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {labelTeam(a)} <span className="text-gray-400">vs</span> {labelTeam(b)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {labelStage(m.stage)} • {formatDateTime(m.scheduled_at)}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="outline" onClick={() => openDialogForMatch(m.id)}>
                        Ver odds
                      </Button>
                      <Button onClick={() => openDialogForMatch(m.id)}>
                        Apostar
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog de aposta */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aposta no confronto</DialogTitle>
          </DialogHeader>

          {!summary ? (
            <div className="py-8 text-center text-sm text-gray-600">A carregar odds…</div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <ApostaCard
                  side={summary.entry1}
                  disabled={posting}
                  onBet={() => apostar(summary.entry1.entry_id)}
                />
                <ApostaCard
                  side={summary.entry2}
                  disabled={posting}
                  onBet={() => apostar(summary.entry2.entry_id)}
                />
              </div>
              <p className="text-xs text-gray-500">
                Total de apostas registadas: <b>{summary.total}</b>
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Fechar
            </Button>
            {!isLogged && (
              <Button onClick={() => router.push("/login")}>
                Iniciar sessão
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

/* ---------- Sub-componentes ---------- */

function ApostaCard({
  side, onBet, disabled,
}: {
  side: SummarySide;
  onBet: () => void;
  disabled?: boolean;
}) {
  const probPct = Math.round((side.prob ?? 0) * 100);
  const odd = side.prob > 0 ? (1 / side.prob).toFixed(2) : "—";

  return (
    <div className="rounded-lg border p-4 bg-white">
      <div className="text-sm text-gray-500 mb-1">{side.course.short_code || side.course.name}</div>
      <div className="text-lg font-semibold">{side.course.name}</div>
      <div className="mt-2 text-sm text-gray-600">
        Prob.: <b>{probPct}%</b> &nbsp;•&nbsp; Odd (aprox.): <b>{odd}</b>
      </div>
      <div className="mt-1 text-xs text-gray-500">Apostas: {side.count}</div>
      <Button className="mt-3 w-full" onClick={onBet} disabled={disabled}>
        Apostar neste curso
      </Button>
    </div>
  );
}

/* ---------- Helpers ---------- */

function labelTeam(c?: Course) {
  if (!c) return "TBD";
  return c.short_code ? `${c.short_code}` : c.name;
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

function formatDateTime(iso: string | null) {
  if (!iso) return "Data a definir";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Data a definir";
  return d.toLocaleString("pt-PT", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}
