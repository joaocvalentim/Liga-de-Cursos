"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Rotas visíveis para todos
const navGuest = [
  { href: "/", label: "Início" },
  { href: "/fase-grupos", label: "Fase de Grupos" },
  { href: "/eliminatorias", label: "Eliminatórias" },
  { href: "/apostas", label: "Todas as Apostas" },
];

// Rotas extra quando autenticado
const navAuthed = [
  ...navGuest,
  { href: "/minhas-apostas", label: "Minhas Apostas" },
];

function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthed, setIsAuthed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // 1) Montagem + escuta de eventos custom e focus
  useEffect(() => {
    const read = () => setIsAuthed(Boolean(localStorage.getItem("access_token")));
    setMounted(true);
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

  // 2) Recalcular quando a rota muda (ex.: depois de login -> redirect)
  useEffect(() => {
    if (!mounted) return;
    setIsAuthed(Boolean(localStorage.getItem("access_token")));
  }, [pathname, mounted]);

  const navItems = isAuthed ? navAuthed : navGuest;

  const isActive = (href: string) => {
    if (!pathname) return false;
    if (href === "/") return pathname === "/"; // não marcar tudo como ativo
    return pathname.startsWith(href);
  };

  const handleLogout = async () => {
    try {
      // Opcional: chamar endpoint do backend para logout/blacklist
      // await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/logout/`, { method: "POST", credentials: "include" });
    } catch {}
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    // Notifica a app que o estado de auth mudou
    window.dispatchEvent(new Event("auth-changed"));
    setIsAuthed(false);
    router.push("/login");
  };

  if (!mounted) return null;

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-gray-50/70 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-lg font-semibold tracking-tight hover:opacity-80">
            Liga de Cursos
          </Link>

          <nav className="hidden gap-4 sm:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  "rounded-md px-3 py-2 text-sm transition-colors",
                  isActive(item.href)
                    ? "font-semibold text-gray-900"
                    : "text-gray-600 hover:text-gray-900"
                )}
                aria-current={isActive(item.href) ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {!isAuthed ? (
            <>
              <Link
                href="/login"
                className={cx(
                  "rounded-xl px-4 py-2 text-sm font-semibold transition",
                  isActive("/login")
                    ? "bg-gray-200 text-gray-900"
                    : "border border-gray-300 bg-white text-gray-900 hover:bg-gray-100"
                )}
              >
                Entrar
              </Link>
              <Link
                href="/register"
                className={cx(
                  "rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90",
                  isActive("/register") && "opacity-90"
                )}
              >
                Registar
              </Link>
            </>
          ) : (
            <button
              onClick={handleLogout}
              className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Sair
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
