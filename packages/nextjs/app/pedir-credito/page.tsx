"use client";

/**
 * Pedir crédito: donde la puntualidad deja de ser una virtud y se vuelve dinero.
 *
 * La decisión no la toma esta pantalla ni nuestro servidor. El Pool vuelve a leer el
 * historial de la junta en el instante de firmar y calcula el score ahí mismo, así que lo que
 * se muestra aquí es una vista previa fiel de lo que va a pasar, no una promesa. Por eso vale
 * la pena separar los motivos de rechazo: "no te alcanza el historial" y "tu historial tiene
 * incumplimientos" se parecen en el resultado pero no son lo mismo para quien los recibe, y
 * confundirlos convertiría a alguien nuevo en alguien castigado.
 *
 * La tabla de tramos se queda a la vista incluso sin billetera. Es la regla del sistema, no un
 * dato personal: quien todavía no entró tiene derecho a saber a qué está jugando.
 */

import { useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { Cargando, Marco, PideBilletera, Titulo, Vacio } from "~~/components/kallpa/Marco";
import { useDeployedContractInfo, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

const mUSDC = (v: bigint | undefined) =>
  v === undefined ? "—" : (Number(v) / 1e6).toLocaleString("es-PE", { maximumFractionDigits: 2 });

/**
 * Los tramos, copiados de la política del Pool.
 *
 * Es una duplicación consciente: la tabla tiene que poder mostrarse sin billetera y sin score,
 * y `tramo()` necesita un score para responder. La cifra que se le promete al usuario sobre
 * su propio caso NO sale de aquí, sale de la lectura viva de `tramo(score)`. Si algún día la
 * política cambiara en la cadena, este cuadro quedaría desfasado y el monto real no.
 */
const TRAMOS = [
  { desde: 0, hasta: 399, rango: "menos de 400", presta: "sin crédito" },
  { desde: 400, hasta: 599, rango: "400 a 599", presta: "50 mUSDC" },
  { desde: 600, hasta: 749, rango: "600 a 749", presta: "120 mUSDC" },
  { desde: 750, hasta: 1000, rango: "750 a 1000", presta: "200 mUSDC" },
];

export default function PedirCredito() {
  const { address } = useAccount();
  const [elegida, setElegida] = useState<number | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);

  const { data: misJuntas, isLoading: buscandoJuntas } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "juntasDe",
    args: [address],
  });

  // Si la elección guardada ya no pertenece a esta billetera —porque el usuario cambió de
  // cuenta sin recargar— se cae de vuelta a la primera junta en lugar de consultar una junta
  // ajena.
  const lista = (misJuntas ?? []).map(Number);
  const juntaId = elegida !== null && lista.includes(elegida) ? elegida : lista[0];

  const { data: scoreYCredito } = useScaffoldReadContract({
    contractName: "score_engine",
    functionName: "scoreAndCredit",
    args: [juntaId, address],
  });
  const { data: historial } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "history",
    args: [juntaId, address],
  });
  const { data: minimoCiclos } = useScaffoldReadContract({
    contractName: "score_engine",
    functionName: "minimoCiclos",
  });
  const { data: umbralPositivo } = useScaffoldReadContract({
    contractName: "score_engine",
    functionName: "umbralPositivo",
  });

  const score = scoreYCredito?.[0] as number | undefined;
  const conCredito = scoreYCredito?.[1] as boolean | undefined;

  const { data: montoDelTramo } = useScaffoldReadContract({
    contractName: "pool",
    functionName: "tramo",
    args: [score],
  });
  const { data: liquidez, refetch: releerLiquidez } = useScaffoldReadContract({
    contractName: "pool",
    functionName: "liquidityStatus",
  });
  const { data: prestamo, refetch: releerPrestamo } = useScaffoldReadContract({
    contractName: "pool",
    functionName: "loanOf",
    args: [address],
  });
  const { data: saldo, refetch: releerSaldo } = useScaffoldReadContract({
    contractName: "mock_usdc",
    functionName: "balanceOf",
    args: [address],
  });

  const { data: infoPool } = useDeployedContractInfo({ contractName: "pool" });
  const { writeContractAsync: escribirPool } = useScaffoldWriteContract({ contractName: "pool" });
  const { writeContractAsync: escribirToken } = useScaffoldWriteContract({ contractName: "mock_usdc" });

  const fondoTotal = liquidez?.[0] as bigint | undefined;
  const prestadoVigente = liquidez?.[1] as bigint | undefined;
  const disponible = liquidez?.[2] as bigint | undefined;

  const montoPrestamo = prestamo?.[0] as bigint | undefined;
  const juntaDelPrestamo = prestamo?.[1] as number | undefined;
  const momentoPrestamo = prestamo?.[2] as bigint | undefined;
  const scoreAlPrestar = prestamo?.[3] as number | undefined;
  const prestamoActivo = prestamo?.[4] as boolean | undefined;

  // La antigüedad es la séptima señal del historial: cuántos ciclos vencieron para este
  // miembro. Es la que decide si el score significa algo o solo refleja la ausencia de datos.
  const ciclos = historial === undefined ? undefined : Number(historial[6]);
  const minimo = Number(minimoCiclos ?? 3);
  const umbral = Number(umbralPositivo ?? 400);

  const puedePedir =
    conCredito === true &&
    prestamoActivo === false &&
    montoDelTramo !== undefined &&
    montoDelTramo > 0n &&
    disponible !== undefined &&
    disponible >= montoDelTramo;

  const motivos: { titulo: string; detalle: string }[] = [];
  if (prestamoActivo) {
    motivos.push({
      titulo: "Ya tienes un préstamo abierto",
      detalle: "Solo puede haber uno a la vez. Devuelve el que tienes y podrás pedir otro.",
    });
  } else if (score !== undefined && ciclos !== undefined) {
    if (score < umbral) {
      motivos.push({
        titulo: "Tu historial muestra incumplimientos",
        detalle:
          `Tu score es ${score} y el fondo presta desde ${umbral}. No es un castigo permanente: ` +
          "el score se recalcula con cada cuota, así que ponerte al día lo levanta.",
      });
    }
    if (ciclos < minimo) {
      motivos.push({
        titulo: "Todavía te falta trayectoria",
        detalle:
          `Llevas ${ciclos} ${ciclos === 1 ? "ciclo" : "ciclos"} y el fondo pide ${minimo}. ` +
          "No te rechazaron: quien recién empieza puntúa alto justamente porque no hay nada " +
          "que observar, y tratar “no sé” como “excelente” sería el error.",
      });
    }
    if (conCredito && montoDelTramo !== undefined && disponible !== undefined && montoDelTramo > disponible) {
      motivos.push({
        titulo: "El fondo se quedó corto",
        detalle:
          `Te corresponden ${mUSDC(montoDelTramo)} mUSDC y ahora mismo quedan ${mUSDC(disponible)} ` +
          "disponibles. Es cuestión de esperar a que alguien devuelva o aporte liquidez.",
      });
    }
  }

  const pedirCredito = async () => {
    if (juntaId === undefined) return;
    try {
      setTrabajando("Pidiendo el crédito…");
      await escribirPool({ functionName: "requestLoan", args: [juntaId] });
      await Promise.all([releerPrestamo(), releerLiquidez(), releerSaldo()]);
    } finally {
      setTrabajando(null);
    }
  };

  /**
   * Devolver son dos transacciones y no una: `repay` cobra con `transferFrom`, y el token no
   * deja que nadie te saque nada sin una autorización previa tuya. Aquí se autoriza el monto
   * exacto —ni un céntimo más— porque un préstamo se devuelve una sola vez y no hay ninguna
   * comodidad futura que justifique dejar un permiso abierto.
   */
  const devolverPrestamo = async () => {
    if (!montoPrestamo || !infoPool?.address) return;
    try {
      setTrabajando("Paso 1 de 2 · Autorizando al fondo a cobrarte…");
      await escribirToken({ functionName: "approve", args: [infoPool.address, montoPrestamo] });
      setTrabajando("Paso 2 de 2 · Devolviendo el préstamo…");
      await escribirPool({ functionName: "repay" });
      await Promise.all([releerPrestamo(), releerLiquidez(), releerSaldo()]);
    } finally {
      setTrabajando(null);
    }
  };

  const noAlcanzaParaDevolver = saldo !== undefined && montoPrestamo !== undefined && saldo < montoPrestamo;

  return (
    <Marco>
      <Titulo
        rotulo="Crédito"
        titulo="Tu palabra, convertida en crédito"
        bajada={
          <>
            Pagar a tiempo en tu junta no solo llena el pozo:{" "}
            <span className="text-[--color-oro]">te abre una puerta</span> que antes pedía un aval.
          </>
        }
      />

      {!address ? (
        <PideBilletera que="Para saber cuánto te prestaría el fondo necesitamos leer tu historial." />
      ) : buscandoJuntas ? (
        <Cargando que="Buscando tus juntas" />
      ) : juntaId === undefined ? (
        <Vacio
          titulo="El crédito nace de una junta"
          detalle={
            "No hay atajo: el fondo presta mirando cómo te comportas en un grupo real. Entra a una " +
            "junta, paga tus cuotas y en tres ciclos vuelve por aquí."
          }
          accion={
            <Link href="/" className="k-boton no-underline">
              Ver mis juntas
            </Link>
          }
        />
      ) : (
        <div className="mb-10 flex flex-col gap-6">
          {/* ── De qué junta hablamos ──────────────────────────────────────────────── */}
          {lista.length > 1 && (
            <div>
              <p className="k-rotulo mb-3">Tu historial en</p>
              <div className="flex flex-wrap gap-2">
                {lista.map(id => (
                  <BotonDeJunta key={id} juntaId={id} activa={id === juntaId} alElegir={() => setElegida(id)} />
                ))}
              </div>
              <p className="mt-3 text-sm text-[--color-gris]">
                Cada junta tiene su propio historial. El fondo mira la que elijas.
              </p>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="flex flex-col gap-6">
              {/* ── Lo que el fondo ve de ti ─────────────────────────────────────── */}
              {scoreYCredito === undefined ? (
                <Cargando que="Calculando tu score" />
              ) : (
                <div className="k-tarjeta p-8">
                  <p className="k-rotulo mb-6">Lo que el fondo ve de ti</p>
                  <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
                    <Dato termino="Tu score" valor={`${score ?? 0} / 1000`} destacado />
                    <Dato termino="Ciclos cumplidos" valor={`${ciclos ?? 0} de ${minimo}`} />
                    <Dato
                      termino="Te prestaría"
                      valor={conCredito ? `${mUSDC(montoDelTramo)} mUSDC` : "nada aún"}
                      alerta={!conCredito}
                    />
                  </div>
                </div>
              )}

              {/* ── Pedir ────────────────────────────────────────────────────────── */}
              <div className="k-tarjeta p-8">
                <p className="k-rotulo mb-4">{prestamoActivo ? "Tu préstamo vigente" : "Pedir el crédito"}</p>

                {prestamoActivo && (
                  <div className="mb-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
                    <Dato termino="Debes" valor={`${mUSDC(montoPrestamo)} mUSDC`} destacado />
                    <Dato termino="Por la junta" valor={`#${Number(juntaDelPrestamo ?? 0)}`} />
                    <Dato termino="Score al prestar" valor={String(scoreAlPrestar ?? 0)} />
                    <Dato
                      termino="Desde"
                      valor={
                        momentoPrestamo
                          ? new Date(Number(momentoPrestamo) * 1000).toLocaleDateString("es-PE", {
                              day: "2-digit",
                              month: "short",
                            })
                          : "—"
                      }
                    />
                  </div>
                )}

                {trabajando ? (
                  <p className="k-meta">{trabajando.toUpperCase()}</p>
                ) : prestamoActivo ? (
                  <>
                    <button className="k-boton" onClick={devolverPrestamo} disabled={noAlcanzaParaDevolver}>
                      Devolver el préstamo
                    </button>
                    <p className="mt-4 max-w-xl text-sm leading-relaxed text-[--color-gris]">
                      Tu billetera te va a pedir firmar <span className="text-[--color-marfil]">dos veces</span>:
                      primero autorizas al fondo a cobrarte {mUSDC(montoPrestamo)} mUSDC, y recién después se hace la
                      devolución. Así funciona este token, y preferimos decírtelo a que te sorprenda.
                    </p>
                    {noAlcanzaParaDevolver && (
                      <p className="mt-3 text-sm text-[--color-mal]">
                        No te alcanza el saldo: tienes {mUSDC(saldo)} mUSDC y debes {mUSDC(montoPrestamo)}.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <button className="k-boton" onClick={pedirCredito} disabled={!puedePedir}>
                      Pedir crédito
                    </button>
                    {puedePedir ? (
                      <p className="mt-4 max-w-xl text-sm leading-relaxed text-[--color-gris]">
                        El fondo te va a depositar{" "}
                        <span className="text-[--color-oro]">{mUSDC(montoDelTramo)} mUSDC</span> en una sola
                        transacción. No hay papeles ni aval: tu historial ya respondió por ti.
                      </p>
                    ) : (
                      <div className="mt-5 flex flex-col gap-4">
                        {motivos.map(m => (
                          <div key={m.titulo} className="border-l-2 border-[--color-linea-viva] pl-4">
                            <p className="k-voz mb-1 text-[15px] font-bold">{m.titulo}</p>
                            <p className="max-w-xl text-sm leading-relaxed text-[--color-gris]">{m.detalle}</p>
                          </div>
                        ))}
                        {motivos.length === 0 && <p className="k-meta">COMPROBANDO TU ELEGIBILIDAD…</p>}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* ── El fondo común ─────────────────────────────────────────────────── */}
            <aside className="k-tarjeta h-fit p-6">
              <p className="k-rotulo mb-5">El fondo común</p>
              <div className="flex flex-col gap-5">
                <Dato termino="Liquidez aportada" valor={`${mUSDC(fondoTotal)} mUSDC`} />
                <Dato termino="Prestado ahora" valor={`${mUSDC(prestadoVigente)} mUSDC`} />
                <Dato termino="Disponible" valor={`${mUSDC(disponible)} mUSDC`} destacado />
              </div>
              <p className="mt-6 text-sm leading-relaxed text-[--color-gris]">
                Aquí la solvencia sí es una pregunta de verdad. Una junta nunca se queda corta porque reparte lo que ya
                recibió; el fondo <span className="k-corazon text-[--color-marfil]">presta</span>, y prestar es lo único
                que puede salir mal.
              </p>
            </aside>
          </div>
        </div>
      )}

      {/* ── La regla, a la vista de todos ────────────────────────────────────────── */}
      <div className="k-tarjeta overflow-hidden">
        <div className="border-b border-[--color-linea] px-7 py-5">
          <p className="k-rotulo">Cuánto presta el fondo</p>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-[--color-linea-sutil]">
              <th className="k-meta px-7 py-3 text-left font-normal">SCORE</th>
              <th className="k-meta px-7 py-3 text-right font-normal">PRÉSTAMO</th>
            </tr>
          </thead>
          <tbody>
            {TRAMOS.map(t => {
              const aqui = score !== undefined && score >= t.desde && score <= t.hasta;
              return (
                <tr
                  key={t.rango}
                  className={`border-b border-[--color-linea-sutil] last:border-0 ${aqui ? "bg-[--color-noche]" : ""}`}
                >
                  <td className="px-7 py-4">
                    <span className={`k-prueba text-sm ${aqui ? "text-[--color-oro]" : "text-[--color-marfil]"}`}>
                      {t.rango}
                    </span>
                    {aqui && <span className="k-meta ml-3 text-[--color-oro]">← AQUÍ ESTÁS</span>}
                  </td>
                  <td className="px-7 py-4 text-right">
                    <span className={`k-prueba text-sm ${aqui ? "text-[--color-oro]" : "text-[--color-gris]"}`}>
                      {t.presta}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Por qué esto no es un scoring más ──────────────────────────────────────── */}
      <section className="mt-12 border-t border-[--color-linea] pt-10">
        <p className="k-corazon max-w-3xl text-lg leading-relaxed text-[--color-gris]">
          El fondo no consulta un score guardado: lo{" "}
          <span className="text-[--color-oro]">vuelve a calcular en el instante de decidir</span>, leyendo tu historial
          vivo. Por eso el crédito se cierra solo cuando alguien deja de pagar, sin que nadie tenga que declararlo ni
          firmar nada.
        </p>
      </section>
    </Marco>
  );
}

/** Un botón del selector. Lee su propio nombre porque el nombre vive en la cadena. */
const BotonDeJunta = ({ juntaId, activa, alElegir }: { juntaId: number; activa: boolean; alElegir: () => void }) => {
  const { data: nombre } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "juntaNombre",
    args: [juntaId],
  });

  return (
    <button
      onClick={alElegir}
      className={`rounded-[4px] border px-4 py-2.5 text-sm transition-colors ${
        activa
          ? "border-[--color-oro] bg-[--color-carbon] text-[--color-oro]"
          : "border-[--color-linea] text-[--color-gris] hover:border-[--color-linea-viva] hover:text-[--color-marfil]"
      }`}
    >
      {(nombre as string) || `Junta #${juntaId}`}
    </button>
  );
};

const Dato = ({
  termino,
  valor,
  destacado,
  alerta,
}: {
  termino: string;
  valor: string;
  destacado?: boolean;
  alerta?: boolean;
}) => (
  <div>
    <p className="k-meta mb-1">{termino.toUpperCase()}</p>
    <p
      className={`k-prueba text-lg ${
        alerta ? "text-[--color-mal]" : destacado ? "text-[--color-oro]" : "text-[--color-marfil]"
      }`}
    >
      {valor}
    </p>
  </div>
);
