// frontend/app/confrontos/page.tsx
import { Suspense } from "react";
import ClientConfrontos from "./ClientConfrontos";

// evita pré-render estático para esta rota (opcional, mas costuma ajudar
// quando os dados são totalmente dinâmicos)
export const dynamic = "force-dynamic";
// ou, alternativa equivalente:
// export const revalidate = 0;

export default function ConfrontosPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-7xl px-4 py-8">
          <div className="text-sm text-gray-500">A carregar…</div>
        </main>
      }
    >
      <ClientConfrontos />
    </Suspense>
  );
}
