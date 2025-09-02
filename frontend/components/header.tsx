"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";

// Rotas visíveis para todos
const navGuest = [
  { href: "/", label: "Início" },
  { href: "/fase-grupos", label: "Fase de Grupos" },
  { href: "/eliminatorias", label: "Eliminatórias" },
  { href: "/confrontos", label: "Todos os Confrontos" },
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
  const [mobileOpen, setMobileOpen] = useState(false);

  const panelRef = useRef<HTMLDivElement | null>(null);

  // Ler auth do storage e escutar alterações
  useEffect(() => {
    const read = () =>
      setIsAuthed(Boolean(localStorage.getItem("access_token")));
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

  // Fechar menu ao mudar de rota
  useEffect(() => {
    if (!mounted) return;
    setIsAuthed(Boolean(localStorage.getItem("access_token")));
    setMobileOpen(false);
  }, [pathname, mounted]);

  // Fechar ao clicar fora
  useEffect(() => {
    if (!mobileOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(e.target as Node)) setMobileOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [mobileOpen]);

  const navItems = isAuthed ? navAuthed : navGuest;

  const isActive = (href: string) => {
    if (!pathname) return false;
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const handleLogout = async () => {
    try {
      // opcional: POST para logout no backend
    } catch {}
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    window.dispatchEvent(new Event("auth-changed"));
    setIsAuthed(false);
    setMobileOpen(false);
    router.push("/");
  };

  if (!mounted) return null;

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-gray-50/70 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        {/* Esquerda: logo + navegação desktop */}
        <div className="flex items-center gap-6">
          {/* Mobile: o logo funciona como toggle do menu */}
          <button
            className="flex items-center gap-2 sm:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            style={{ minHeight: 48 }}
          >
            <Image
              src="/logo.png"
              alt="betpraxis"
              width={160}
              height={40}
              priority
              sizes="(max-width: 640px) 160px, 200px"
              className="w-auto"
              style={{ display: 'block', margin: '0 auto' }}
            />

            <svg
              className={cx("h-5 w-5 transition", mobileOpen && "rotate-180")}
              viewBox="0 0 20 20"
              fill="currentColor"
              style={{ marginLeft: 4 }}
            >
              <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.126l3.71-3.896a.75.75 0 111.08 1.04l-4.24 4.46a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" />
            </svg>
          </button>

          {/* Desktop: logo é link normal */}
          <Link href="/" className="hidden sm:flex items-center hover:opacity-80" style={{ minHeight: 48 }}>
            <Image
              src="/logo.png"
              alt="betpraxis"
              width={180}
              height={48}
              priority
              sizes="(max-width: 640px) 160px, 200px"
              className="w-auto"
              style={{ display: 'block', margin: '0 auto' }}
            />
          </Link>

          {/* Navegação desktop */}
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

        {/* Ações (desktop) */}
        <div className="hidden items-center gap-2 sm:flex">
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

      {/* Painel mobile */}
      {mobileOpen && (
        <>
          {/* overlay para facilitar fechar ao tocar fora */}
          <div className="fixed inset-0 z-40 sm:hidden" />

          <div
            id="mobile-menu"
            ref={panelRef}
            className="sm:hidden absolute left-0 right-0 top-16 z-50 border-b bg-white shadow-md"
          >
            <div className="mx-auto max-w-7xl px-4 py-3">
              <nav className="flex flex-col gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cx(
                      "rounded-md px-3 py-2 text-base transition-colors",
                      isActive(item.href)
                        ? "font-semibold text-gray-900"
                        : "text-gray-700 hover:bg-gray-50"
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              <div className="mt-3 border-t pt-3">
                {!isAuthed ? (
                  <div className="flex gap-2">
                    <Link
                      href="/login"
                      onClick={() => setMobileOpen(false)}
                      className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2 text-center text-sm font-semibold text-gray-900 hover:bg-gray-100"
                    >
                      Entrar
                    </Link>
                    <Link
                      href="/register"
                      onClick={() => setMobileOpen(false)}
                      className="flex-1 rounded-xl bg-black px-4 py-2 text-center text-sm font-semibold text-white hover:opacity-90"
                    >
                      Registar
                    </Link>
                  </div>
                ) : (
                  <button
                    onClick={handleLogout}
                    className="w-full rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                  >
                    Sair
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </header>
  );
}
