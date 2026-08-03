"use client";

/**
 * El marco común de la aplicación: cabecera con navegación y billetera, y pie.
 *
 * Vive aparte de cada pantalla porque una aplicación de verdad necesita que uno pueda
 * moverse entre secciones sin volver a la barra de direcciones. La página de auditoría es la
 * única que no lo usa: está pensada para abrirse desde un código QR, sin sesión y sin nada
 * que distraiga de la única pregunta que responde.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { Marca } from "~~/components/kallpa/Isotipo";

const SECCIONES = [
  { href: "/", texto: "Mis juntas" },
  { href: "/mi-score", texto: "Mi score" },
  { href: "/pedir-credito", texto: "Crédito" },
  // El otro lado del producto: quien pone el capital no es quien pide el préstamo.
  { href: "/fondear", texto: "Fondear" },
];

export const Marco = ({ children }: { children: React.ReactNode }) => {
  const ruta = usePathname();

  return (
    <div className="kallpa flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-[--color-linea-sutil] bg-[--color-noche]/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-6 py-4 sm:px-8">
          <Link href="/" className="no-underline">
            <Marca />
          </Link>
          <nav className="flex flex-1 gap-1">
            {SECCIONES.map(s => {
              const activa = s.href === "/" ? ruta === "/" : ruta.startsWith(s.href);
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  className={`rounded-[4px] px-3 py-2 text-sm no-underline transition-colors ${
                    activa
                      ? "bg-[--color-carbon] text-[--color-oro]"
                      : "text-[--color-gris] hover:text-[--color-marfil]"
                  }`}
                >
                  {s.texto}
                </Link>
              );
            })}
          </nav>
          <RainbowKitCustomConnectButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10 sm:px-8">{children}</main>

      <footer className="border-t border-[--color-linea] px-6 py-8 sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <p className="k-meta">HACKATHON ETHEREUM LIMA 2026 · CONSTRUIDO EN ARBITRUM</p>
          <Link href="/debug" className="k-meta no-underline hover:text-[--color-oro]">
            INSPECCIONAR LOS CONTRATOS →
          </Link>
        </div>
      </footer>
    </div>
  );
};

/** Encabezado de sección: rótulo, titular y una frase con voz humana. */
export const Titulo = ({ rotulo, titulo, bajada }: { rotulo: string; titulo: string; bajada?: React.ReactNode }) => (
  <div className="mb-10">
    <p className="k-rotulo mb-3">{rotulo}</p>
    <h1 className="k-voz mb-3 text-3xl font-bold tracking-tight sm:text-4xl">{titulo}</h1>
    {bajada && <p className="k-corazon max-w-2xl text-lg text-[--color-gris]">{bajada}</p>}
  </div>
);

/** Lo que se muestra cuando hace falta una billetera para continuar. */
export const PideBilletera = ({ que }: { que: string }) => (
  <div className="k-tarjeta p-10 text-center">
    <p className="k-voz mb-2 text-lg">Conecta tu billetera</p>
    <p className="mx-auto mb-8 max-w-md text-[--color-gris]">
      {que} La billetera es tu cuenta: no hay usuario ni contraseña que recordar.
    </p>
    <div className="flex justify-center">
      <RainbowKitCustomConnectButton />
    </div>
  </div>
);

/** Estado de carga uniforme, para que la espera no parezca un error. */
export const Cargando = ({ que = "Leyendo la cadena" }: { que?: string }) => (
  <div className="k-tarjeta flex items-center gap-4 p-10">
    <span className="k-meta">{que.toUpperCase()}…</span>
  </div>
);

/** Un mensaje cuando no hay nada que mostrar, con la salida a mano. */
export const Vacio = ({ titulo, detalle, accion }: { titulo: string; detalle: string; accion?: React.ReactNode }) => (
  <div className="k-tarjeta p-10">
    <p className="k-voz mb-2 text-lg">{titulo}</p>
    <p className="mb-6 max-w-lg text-[--color-gris]">{detalle}</p>
    {accion}
  </div>
);
