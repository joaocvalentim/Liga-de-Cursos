"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Course = { id: number; name: string; short_code?: string };
type Match = {
  id: number;
  stage: "QF" | "SF" | "THIRD" | "FINAL" | "GROUP";
  status: "SCHEDULED" | "LIVE" | "FT";
  scheduled_at: string | null;
  entry1?: Course; entry2?: Course;       // nomes “novos” do backend
  curso1?: Course; curso2?: Course;       // fallback se existirem assim
  entry1_id?: number; entry2_id?: number;
  winner_entry?: number | null;
};

const API = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";
const COMP_ID = process.env.NEXT_PUBLIC_COMPETITION_ID || "1";

const STAGES: Array<Match["stage"]> = ["QF", "SF", "THIRD", "FINAL"];

export default function KnockoutPage() {
  const [loading, setLoading] = useState(true);
  const [bracket, setBracket] = useState<Record<string, Match[]>>({
    QF: [], SF: [], THIRD: [], FINAL: [],
  });
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const r = await fetch(`${API}/api/competitions/${COMP_ID}/bracket/`, { cache: "no-store" });
        if (!r.ok) throw new Error("Falha ao obter eliminatórias");
        const j = await r.json();
        if (!alive) return;
        const b = j?.bracket || {};
        setBracket({
          QF: Array.isArray(b.QF) ? b.QF : [],
          SF: Array.isArray(b.SF) ? b.SF : [],
          THIRD: Array.isArray(b.THIRD) ? b.THIRD : [],
          FINAL: Array.isArray(b.FINAL) ? b.FINAL : [],
        });
      } catch (e: any) {
        setError(e?.message || "Erro a carregar eliminatórias");
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => { alive = false; };
  }, []);

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
          <CardHeader>
            <CardTitle>Erro</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-red-600">{error}</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        <h1 className="text-3xl font-semibold text-gray-900">Eliminatórias</h1>

        {/* simples “bracket”: 2 colunas em desktop */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Quartos + Meias */}
          <div className="space-y-6">
            <StageCard
              title="Quartos de Final"
              matches={bracket.QF}
              onOdds={(id) => router.push(`/confronto/${id}`)}
              onBet={(id) => router.push(`/apostas?match=${id}`)}
            />
            <StageCard
              title="Meias-Finais"
              matches={bracket.SF}
              onOdds={(id) => router.push(`/confronto/${id}`)}
              onBet={(id) => router.push(`/apostas?match=${id}`)}
            />
          </div>

          {/* Final + 3º/4º */}
          <div className="space-y-6">
            <StageCard
              title="Final"
              matches={bracket.FINAL}
              highlight
              onOdds={(id) => router.push(`/confronto/${id}`)}
              onBet={(id) => router.push(`/apostas?match=${id}`)}
            />
            <StageCard
              title="3º e 4º Lugar"
              matches={bracket.THIRD}
              onOdds={(id) => router.push(`/confronto/${id}`)}
              onBet={(id) => router.push(`/apostas?match=${id}`)}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

/* ---------- Componentes ---------- */

function StageCard({
  title,
  matches,
  highlight = false,
  onBet,
  onOdds,
}: {
  title: string;
  matches: Match[];
  highlight?: boolean;
  onBet: (id: number) => void;
  onOdds: (id: number) => void;
}) {
  return (
    <Card className={highlight ? "border-2 border-zinc-900" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {matches.length === 0 ? (
          <p className="text-gray-500 text-sm">Sem jogos nesta fase.</p>
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
                    {formatDateTime(m.scheduled_at)} • {labelStatus(m.status)}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" onClick={() => onBet(m.id)}>
                    Apostar
                  </Button>
                  <Button variant="secondary" onClick={() => onOdds(m.id)}>
                    Ver odds
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Helpers ---------- */

function labelTeam(c?: Course) {
  if (!c) return "TBD";
  return c.short_code ? `${c.short_code}` : c.name;
}

function labelStatus(s: Match["status"]) {
  switch (s) {
    case "SCHEDULED":
      return "Agendado";
    case "LIVE":
      return "A decorrer";
    case "FT":
      return "Finalizado";
    default:
      return s;
  }
}

function formatDateTime(iso: string | null) {
  if (!iso) return "Data a definir";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Data a definir";
  return d.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
