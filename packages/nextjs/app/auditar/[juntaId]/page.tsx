"use client";

/**
 * La página que el jurado escanea.
 *
 * No pide wallet, no pide cuenta y no pide permiso: lee la cadena directamente. Esa es toda
 * la idea — cualquiera con un teléfono puede comprobar que la caja cuadra, sin depender de
 * que nosotros se lo digamos.
 *
 * Lo que muestra tampoco es un adorno. La afirmación central es que la contabilidad del
 * contrato coincide con el saldo que el token le reconoce, y esa afirmación **puede resultar
 * falsa**: se rompe si alguien envía tokens sueltos al contrato o si aparece un camino de
 * salida que no sea repartir el pozo. Un sello que no pudiera fallar no probaría nada.
 */

import { use } from "react";
import Link from "next/link";
import { Isotipo, Marca, RuedaDeJunta } from "~~/components/kallpa/Isotipo";
import { mUSDC } from "~~/components/kallpa/cifras";
import { useDeployedContractInfo, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { getBlockExplorerAddressLink } from "~~/utils/scaffold-stylus";

export default function Auditar({ params }: { params: Promise<{ juntaId: string }> }) {
  const { juntaId } = use(params);
  const id = Number(juntaId);
  const { targetNetwork } = useTargetNetwork();

  // La integridad es del contrato completo y no de una junta suelta: el token reporta un
  // único saldo para todas, así que restar por junta no cuadraría en cuanto exista más de
  // una. Los números de esta junta se leen aparte.
  const { data: integridad } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "verifyIntegrity",
  });

  const { data: estado } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "juntaState",
    args: [id],
  });

  // El nombre vive en la cadena, no en la interfaz: cualquier aplicación que lea este
  // contrato muestra el mismo, y quien audita ve el que usan sus miembros.
  const { data: nombreJunta } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "juntaNombre",
    args: [id],
  });

  const { data: cobertura } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "cycleCoverage",
    args: [id],
  });

  // La dirección del propio contrato, para el enlace al explorador.
  const { data: contratoJunta } = useDeployedContractInfo({ contractName: "junta" });

  const [aportado, distribuido, saldoReal, cuadra] = integridad ?? [];
  const [pozo, ciclo, turno, miembros] = estado ?? [];
  const [, pagadas, totalCuotas] = cobertura ?? [];
  const nombre = nombreJunta as string | undefined;

  const cargando = integridad === undefined || estado === undefined;
  const existe = miembros !== undefined && Number(miembros) > 0;

  return (
    <div className="kallpa">
      <header className="flex items-center justify-between border-b border-[--color-linea-sutil] px-6 py-5 sm:px-10">
        <Link href="/">
          <Marca />
        </Link>
        <span className="k-meta hidden sm:inline">AUDITORÍA PÚBLICA — NO REQUIERE WALLET</span>
        <span className="k-tag-tecnico">ARBITRUM · STYLUS</span>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12 sm:px-10">
        <p className="k-rotulo mb-3">{nombre ? `${nombre} · junta #${juntaId}` : `Junta #${juntaId}`}</p>
        <h1 className="k-voz mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
          ¿La caja cuadra?
        </h1>
        <p className="k-corazon mb-12 max-w-xl text-xl text-[--color-gris]">
          Solvencia <span className="text-[--color-oro]">probada</span>, no prometida.
        </p>

        {cargando ? (
          <div className="k-tarjeta flex items-center gap-4 p-10">
            <Isotipo size={28} className="animate-pulse" />
            <span className="k-meta">LEYENDO LA CADENA…</span>
          </div>
        ) : !existe ? (
          <div className="k-tarjeta p-10">
            <p className="k-voz text-lg">Esta junta no existe todavía.</p>
            <p className="mt-2 text-[--color-gris]">
              El contrato no tiene ninguna junta con el número {juntaId}.
            </p>
          </div>
        ) : (
          <>
            {/* ── El veredicto ─────────────────────────────────────────────────────── */}
            <div className="mb-4">
              {cuadra ? (
                <span className="k-sello">✓ CUADRA — verificado en Arbitrum</span>
              ) : (
                <span className="k-sello-roto">✕ NO CUADRA — hay saldo sin explicar</span>
              )}
            </div>
            <p className="mb-10 max-w-2xl text-[15px] leading-relaxed text-[--color-gris]">
              Todo lo que entró al contrato, menos todo lo que salió, tiene que ser igual al
              saldo que el token le reconoce. Si alguien enviara fondos por fuera de las
              reglas, esta resta dejaría de cerrar y este sello se pondría en rojo.
            </p>

            {/* ── La aritmética, a la vista ─────────────────────────────────────────── */}
            <div className="k-tarjeta mb-6 overflow-hidden">
              <div className="grid grid-cols-1 divide-y divide-[--color-linea] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <Cifra rotulo="Aportado" valor={mUSDC(aportado)} />
                <Cifra rotulo="Distribuido" valor={mUSDC(distribuido)} signo="−" />
                <Cifra rotulo="Saldo real del token" valor={mUSDC(saldoReal)} signo="=" destacado />
              </div>
            </div>

            {/* ── El estado de esta junta ──────────────────────────────────────────── */}
            <div className="k-tarjeta mb-6 flex flex-col gap-8 p-8 sm:flex-row sm:items-center">
              <RuedaDeJunta
                miembros={Number(miembros ?? 0)}
                turnosCobrados={Number(turno ?? 0)}
                size={160}
                className="mx-auto shrink-0 sm:mx-0"
              />
              <div className="flex-1">
                <p className="k-rotulo mb-4">Esta junta</p>
                <dl className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <Dato termino="Miembros" valor={String(miembros)} />
                  <Dato termino="Ciclo" valor={`${Number(ciclo)} de ${Number(miembros)}`} />
                  <Dato termino="En el pozo" valor={`${mUSDC(pozo)} mUSDC`} />
                  <Dato termino="Turnos cobrados" valor={`${Number(turno)} de ${Number(miembros)}`} />
                </dl>
                <p className="mt-6 text-sm leading-relaxed text-[--color-gris]">
                  Los puntos rellenos son quienes ya cobraron su turno; los de contorno,
                  quienes esperan. Cuando la rueda se completa, la junta terminó.
                </p>
              </div>
            </div>

            {/* ── Cobertura del ciclo ──────────────────────────────────────────────── */}
            <div className="k-tarjeta mb-10 p-8">
              <p className="k-rotulo mb-3">Cobertura del ciclo en curso</p>
              <p className="k-prueba text-2xl text-[--color-oro]">
                {Number(pagadas ?? 0)} de {Number(totalCuotas ?? 0)} cuotas
              </p>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-[--color-gris]">
                Esto informa avance, no salud financiera: a mitad de ciclo el pozo todavía no
                se le debe a nadie, así que no habría ninguna razón de cobertura que tuviera
                sentido mostrar.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <a
                className="k-boton-borde inline-block no-underline"
                href={getBlockExplorerAddressLink(targetNetwork, contratoJunta?.address ?? "")}
                target="_blank"
                rel="noreferrer"
              >
                Ver el contrato en Arbiscan
              </a>
            </div>
          </>
        )}
      </main>

      <footer className="mt-10 border-t border-[--color-linea] px-6 py-10 sm:px-10">
        <p className="k-meta">
          HACKATHON ETHEREUM LIMA 2026 · CONSTRUIDO EN ARBITRUM
        </p>
      </footer>
    </div>
  );
}

const Cifra = ({
  rotulo,
  valor,
  signo,
  destacado,
}: {
  rotulo: string;
  valor: string;
  signo?: string;
  destacado?: boolean;
}) => (
  <div className="p-7">
    <p className="k-meta mb-3">{rotulo.toUpperCase()}</p>
    <p className="flex items-baseline gap-2">
      {signo && <span className="k-prueba text-lg text-[--color-gris]">{signo}</span>}
      <span
        className={`k-prueba text-2xl ${destacado ? "text-[--color-oro]" : "text-[--color-marfil]"}`}
      >
        {valor}
      </span>
      <span className="k-prueba text-xs text-[--color-gris]">mUSDC</span>
    </p>
  </div>
);

/**
 * Se ve igual que el `Dato` compartido pero no es el mismo, y la diferencia importa: aquí los
 * datos viven dentro de un `<dl>`, así que van en `<dt>`/`<dd>`. Un lector de pantalla
 * anuncia esta lista como pares término-valor; con dos `<p>` sueltos anunciaría prosa.
 */
const Dato = ({ termino, valor }: { termino: string; valor: string }) => (
  <div>
    <dt className="k-meta mb-1">{termino.toUpperCase()}</dt>
    <dd className="k-prueba text-lg text-[--color-marfil]">{valor}</dd>
  </div>
);
