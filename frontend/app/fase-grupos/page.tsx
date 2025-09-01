"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Course = { id: number; name: string; short_code?: string };

type Standing = {
  id: number;                 // CompetitionEntry id
  curso: Course | { id: number; name: string; short_code?: string }; // compat
  course?: Course;            // (se o backend usar "course" em vez de "curso")
  points?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  pot?: number | string;
};

type Match = {
  id: number;
  stage: "GROUP" | "QF" | "SF" | "THIRD" | "FINAL";
  status: "SCHEDULED" | "LIVE" | "FT";
  scheduled_at: string | null;
  entry1?: Course;
  entry2?: Course;
  // nomes alternativos (compat):
  curso1?: Course;
  curso2?: Course;
  entry1_id?: number;
  entry2_id?: number;
};

const API = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";
const COMP_ID = process.env.NEXT_PUBLIC_COMPETITION_ID || "1";

export default function GroupStagePage() {
  const [loading, setLoading] = useState(true);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let alive = true;

    const toArray = (json: any) =>
      Array.isArray(json)
        ? json
        : Array.isArray(json?.results)
        ? json.results
        : Array.isArray(json?.entries)
        ? json.entries
        : Array.isArray(json?.standings)
        ? json.standings
        : [];

    const load = async () => {
      try {
        const [sRes, mRes] = await Promise.all([
          fetch(`${API}/api/competitions/${COMP_ID}/standings/`),
          fetch(
            `${API}/api/competitions/${COMP_ID}/matches/?stage=GROUP&status=SCHEDULED&ordering=scheduled_at&limit=8`
          ),
        ]);
        if (!sRes.ok) throw new Error("Falha ao obter classificação");
        if (!mRes.ok) throw new Error("Falha ao obter jogos");

        const sJson = await sRes.json();
        const mJson = await mRes.json();

        if (!alive) return;

        const sArr: Standing[] = toArray(sJson);
        const mArr: Match[] = toArray(mJson);

        // ordenar por pontos desc; em empate, pote asc (quem tem pote "pior" passa — ajusta se quiseres)
        sArr.sort((a, b) => {
          const pa = a.points ?? 0;
          const pb = b.points ?? 0;
          if (pb !== pa) return pb - pa;
          // pote: número mais alto = pior pote (ajusta conforme a tua regra)
          const potA = toNum(a.pot);
          const potB = toNum(b.pot);
          return potA - potB;
        });

        setStandings(sArr);
        setMatches(mArr);
      } catch (e: any) {
        setError(e?.message || "Erro a carregar dados");
      } finally {
        setLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
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
        <h1 className="text-3xl font-semibold text-gray-900">Fase de Grupos</h1>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Classificação */}
          <Card>
            <CardHeader>
              <CardTitle>Classificação</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-gray-600">
                    <tr className="border-b">
                      <th className="py-2 pr-3">Pos</th>
                      <th className="py-2 pr-3">Curso</th>
                      <th className="py-2 pr-3">Pts</th>
                      <th className="py-2 pr-3">J</th>
                      <th className="py-2 pr-3">V</th>
                      <th className="py-2 pr-3">E</th>
                      <th className="py-2 pr-3">D</th>
                      <th className="py-2">Pote</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((row, idx) => {
                      const c = (row.curso as Course) || row.course;
                      const v = row.wins ?? 0;
                      const e = row.draws ?? 0;
                      const d = row.losses ?? 0;
                      const jogos = v + e + d;
                      return (
                        <tr key={row.id} className="border-b last:border-0">
                          <td className="py-2 pr-3">{idx + 1}</td>
                          <td className="py-2 pr-3">
                            <span className="font-medium">
                              {c?.short_code ? `${c.short_code}` : c?.name}
                            </span>
                            {c?.short_code && (
                              <span className="text-gray-500"> • {c?.name}</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 font-semibold">{row.points ?? 0}</td>
                          <td className="py-2 pr-3">{jogos}</td>
                          <td className="py-2 pr-3">{v}</td>
                          <td className="py-2 pr-3">{e}</td>
                          <td className="py-2 pr-3">{d}</td>
                          <td className="py-2">{row.pot ?? "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Próximos jogos (fase de grupos) */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle>Próximos confrontos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {matches.length === 0 ? (
                <p className="text-gray-500 text-sm">Sem jogos agendados.</p>
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
                          {formatDateTime(m.scheduled_at)}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          variant="outline"
                          onClick={() => router.push(`/apostas?match=${m.id}`)}
                        >
                          Apostar
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => router.push(`/confronto/${m.id}`)}
                        >
                          Ver odds
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

/* helpers */
function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function labelTeam(c?: Course) {
  if (!c) return "TBD";
  return c.short_code ? `${c.short_code}` : c.name;
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
