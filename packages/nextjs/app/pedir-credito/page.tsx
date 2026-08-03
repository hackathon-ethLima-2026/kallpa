"use client";

/**
 * Pedir crédito: donde la puntualidad deja de ser una virtud y se vuelve dinero.
 *
 * La decisión no la toma esta pantalla ni nuestro servidor. El Pool vuelve a leer el
 * historial de tus juntas en el instante de firmar y calcula el score ahí mismo, así que lo
 * que se muestra aquí es una vista previa fiel de lo que va a pasar, no una promesa. Por eso
 * vale la pena separar los motivos de rechazo: "no te alcanza el historial" y "tu historial
 * tiene incumplimientos" se parecen en el resultado pero no son lo mismo para quien los
 * recibe, y confundirlos convertiría a alguien nuevo en alguien castigado.
 *
 * Aquí ya no se elige junta, y esa ausencia es el corazón de la pantalla. Antes el
 * solicitante entregaba la junta con la que quería ser medido, y elegir la junta es elegir el
 * veredicto: un dato que el evaluado controla no es evidencia. Ahora el fondo las mira todas
 * y se queda con la peor, así que la pantalla tiene una obligación nueva —explicar la regla y
 * señalar cuál junta arrastra el score— porque "tu crédito está suspendido" sin decir por
 * cuál de tus juntas es una pantalla que no se puede accionar.
 *
 * La tabla de tramos se queda a la vista incluso sin billetera. Es la regla del sistema, no un
 * dato personal: quien todavía no entró tiene derecho a saber a qué está jugando.
 */

import { useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { Dato } from "~~/components/kallpa/Dato";
import { Cargando, Marco, PideBilletera, Titulo, Vacio } from "~~/components/kallpa/Marco";
import { useNombreDeJunta } from "~~/components/kallpa/SelectorDeJunta";
import { mUSDC } from "~~/components/kallpa/cifras";
import { useDeployedContractInfo, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

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

/**
 * Un ciclo vencido es lo mínimo para que una junta entre en la cuenta del fondo.
 *
 * El contrato no lo expone, y duplicarlo aquí es preferible a callarlo: sin este número la
 * pantalla no puede explicar por qué una junta recién abierta no aparece en la suma, y quien
 * la abrió concluiría que se perdió.
 */
const CICLOS_PARA_CONTAR = 1;

export default function PedirCredito() {
  const { address } = useAccount();
  const [trabajando, setTrabajando] = useState<string | null>(null);

  const { data: misJuntas, isLoading: buscandoJuntas } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "juntasDe",
    args: [address],
  });

  const lista = (misJuntas ?? []).map(Number);

  /**
   * El veredicto entero en una sola lectura: el peor score de todas tus juntas, si eso
   * alcanza para prestarte, y cuántas juntas se llegaron a mirar.
   *
   * El tercer valor no es decorativo. Sin él, quien no tiene historial y quien lo tiene
   * pésimo se ven idénticos desde afuera: los dos con score cero.
   */
  const { data: veredicto } = useScaffoldReadContract({
    contractName: "score_engine",
    functionName: "scoreGlobal",
    args: [address],
  });
  const { data: minimoCiclos } = useScaffoldReadContract({
    contractName: "score_engine",
    functionName: "minimoCiclos",
  });
  const { data: umbralPositivo } = useScaffoldReadContract({
    contractName: "score_engine",
    functionName: "umbralPositivo",
  });

  const peorScore = veredicto?.[0] as number | undefined;
  const conCredito = veredicto?.[1] as boolean | undefined;
  const juntasEvaluadas = veredicto?.[2] as number | undefined;

  const { data: montoDelTramo } = useScaffoldReadContract({
    contractName: "pool",
    functionName: "tramo",
    args: [peorScore],
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
  // El segundo valor del préstamo ya no es la junta que lo respaldaba: ninguna junta lo
  // respalda por sí sola. Ahora es cuántas se miraron para decidirlo.
  const juntasDelPrestamo = prestamo?.[1] as number | undefined;
  const momentoPrestamo = prestamo?.[2] as bigint | undefined;
  const scoreAlPrestar = prestamo?.[3] as number | undefined;
  const prestamoActivo = prestamo?.[4] as boolean | undefined;

  const minimo = Number(minimoCiclos ?? 3);
  const umbral = Number(umbralPositivo ?? 400);
  const evaluadas = juntasEvaluadas === undefined ? undefined : Number(juntasEvaluadas);

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
  } else if (peorScore !== undefined && evaluadas !== undefined) {
    if (evaluadas === 0) {
      motivos.push({
        titulo: "Todavía no hay nada que mirar",
        detalle:
          "Ninguna de tus juntas ha cerrado un ciclo, así que no ha vencido ni una sola cuota tuya. No es un " +
          "rechazo ni una nota baja: no hay comportamiento que observar, ni a favor ni en contra.",
      });
    } else if (peorScore < umbral) {
      motivos.push({
        titulo: "Tu peor junta te deja fuera",
        detalle:
          `De ${evaluadas === 1 ? "la junta que se miró" : `las ${evaluadas} juntas que se miraron`}, la más baja ` +
          `puntúa ${peorScore} y el fondo presta desde ${umbral}. Manda esa, aunque en las otras vayas al día. No ` +
          "es un castigo permanente: el score se recalcula con cada cuota, así que ponerte al día ahí lo levanta.",
      });
    } else if (conCredito === false) {
      // Peor score por encima del corte y aun así sin crédito: lo único que puede faltar es
      // trayectoria, porque ninguna junta llegó a los ciclos que exige la política.
      motivos.push({
        titulo: "Todavía te falta trayectoria",
        detalle:
          `Ninguna de tus juntas llega a ${minimo} ciclos, y el fondo pide esa antigüedad en al menos una. No te ` +
          "rechazaron: quien recién empieza puntúa alto justamente porque no hay nada que observar, y tratar “no " +
          "sé” como “excelente” sería el error.",
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

  /**
   * Pedir el crédito ya no lleva parámetros.
   *
   * Antes se enviaba la junta con la que uno quería ser medido, y ese dato lo controlaba
   * quien pedía: la misma dirección puede puntuar 1000 en una junta y 194 en otra, y elegía
   * cuál mostrar. Ahora la única identidad que entra en la decisión es la de quien firma, y
   * esa no se puede elegir.
   */
  const pedirCredito = async () => {
    try {
      setTrabajando("Pidiendo el crédito…");
      await escribirPool({ functionName: "requestLoan" });
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
            Pagar a tiempo en tus juntas no solo llena el pozo:{" "}
            <span className="text-[--color-oro]">te abre una puerta</span> que antes pedía un aval.
          </>
        }
      />

      {!address ? (
        <PideBilletera que="Para saber cuánto te prestaría el fondo necesitamos leer tu historial." />
      ) : buscandoJuntas ? (
        <Cargando que="Buscando tus juntas" />
      ) : lista.length === 0 ? (
        <Vacio
          titulo="El crédito nace de una junta"
          detalle={
            "No hay atajo: el fondo presta mirando cómo te comportas en un grupo real. Entra a una " +
            "junta, paga tus cuotas y en tres ciclos vuelve por aquí."
          }
          accion={
            <div className="flex flex-wrap gap-3">
              <Link href="/crear" className="k-boton no-underline">
                Crear una junta
              </Link>
              <Link href="/" className="k-boton-borde no-underline">
                Ver mis juntas
              </Link>
            </div>
          }
        />
      ) : (
        <div className="mb-10 flex flex-col gap-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="flex flex-col gap-6">
              {/* ── Lo que el fondo ve de ti ─────────────────────────────────────── */}
              {veredicto === undefined ? (
                <Cargando que="Calculando tu score" />
              ) : (
                <div className="k-tarjeta p-8">
                  <p className="k-rotulo mb-6">Lo que el fondo ve de ti</p>
                  <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
                    <Dato termino="Tu peor score" valor={`${peorScore ?? 0} / 1000`} destacado />
                    <Dato termino="Juntas evaluadas" valor={`${evaluadas ?? 0} de ${lista.length}`} />
                    {/* El rojo se reserva para el único "no" que es un reproche. A quien solo le
                        falta trayectoria se le dice "todavía no", y teñirlo de rojo lo convertiría
                        en un castigo por ser nuevo — el error que esta pantalla existe para no
                        cometer. */}
                    <Dato
                      termino="Te prestaría"
                      valor={conCredito ? `${mUSDC(montoDelTramo)} mUSDC` : "todavía nada"}
                      alerta={(evaluadas ?? 0) > 0 && (peorScore ?? 0) < umbral}
                    />
                  </div>

                  <div className="mt-8 border-t border-[--color-linea] pt-6">
                    <p className="k-corazon mb-3 text-lg leading-relaxed text-[--color-marfil]">
                      El fondo no te deja elegir con cuál de tus juntas te mide.
                    </p>
                    <p className="max-w-2xl text-sm leading-relaxed text-[--color-gris]">
                      Las mira todas y se queda con la <span className="text-[--color-marfil]">peor</span>. Si vas
                      impecable en una y debiendo en otra, manda la segunda. Cualquier prestamista de verdad hace lo
                      mismo: no busca tu mejor referencia, busca la peor, porque la pregunta no es cuánto cumpliste sino
                      si vas a cumplir. Promediarlas dejaría que una junta limpia pague el silencio de un
                      incumplimiento, y es justo el incumplimiento lo que se está mirando.
                    </p>
                    <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[--color-gris]">
                      Una junta entra en la cuenta desde su primer ciclo vencido; antes no hay nada que observar. Para
                      aprobarte, en cambio, hace falta que alguna llegue a {minimo} ciclos. La asimetría es a propósito:
                      la evidencia que condena vale desde el primer ciclo; la que absuelve, desde el ciclo {minimo}.
                    </p>
                  </div>
                </div>
              )}

              {/* ── Pedir ────────────────────────────────────────────────────────── */}
              <div className="k-tarjeta p-8">
                <p className="k-rotulo mb-4">{prestamoActivo ? "Tu préstamo vigente" : "Pedir el crédito"}</p>

                {prestamoActivo && (
                  <div className="mb-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
                    <Dato termino="Debes" valor={`${mUSDC(montoPrestamo)} mUSDC`} destacado />
                    <Dato termino="Juntas evaluadas" valor={String(Number(juntasDelPrestamo ?? 0))} />
                    <Dato termino="Peor score al prestar" valor={String(scoreAlPrestar ?? 0)} />
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
                        transacción. No hay papeles ni aval, y tampoco le dices con qué junta mirarte: tu historial
                        completo ya respondió por ti.
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

          {/* ── Junta por junta ──────────────────────────────────────────────────── */}
          <div className="k-tarjeta p-8">
            <p className="k-rotulo mb-2">Tus juntas, una por una</p>
            <p className="mb-6 max-w-2xl text-sm leading-relaxed text-[--color-gris]">
              El detalle de la cuenta que acaba de hacer el fondo. Si una te está frenando, aquí se ve cuál y qué tiene
              anotado: decirte que no sin decirte dónde arreglarlo no le sirve a nadie.
            </p>
            <div className="flex flex-col gap-3">
              {lista.map(id => (
                <JuntaEnLaCuenta
                  key={id}
                  juntaId={id}
                  miembro={address}
                  peorScore={peorScore}
                  hayEvaluadas={(evaluadas ?? 0) > 0}
                  minimo={minimo}
                />
              ))}
            </div>
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
              <th className="k-meta px-7 py-3 text-left font-normal">PEOR SCORE</th>
              <th className="k-meta px-7 py-3 text-right font-normal">PRÉSTAMO</th>
            </tr>
          </thead>
          <tbody>
            {TRAMOS.map(t => {
              // Sin ninguna junta evaluada el peor score es cero por ausencia de datos, no por
              // conducta. Marcar el tramo de abajo diría "aquí estás" a quien no está en ninguno.
              const aqui =
                peorScore !== undefined && (evaluadas ?? 0) > 0 && peorScore >= t.desde && peorScore <= t.hasta;
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
          vivo en todas tus juntas. Por eso el crédito se cierra solo cuando alguien deja de pagar, sin que nadie tenga
          que declararlo ni firmar nada.
        </p>
      </section>
    </Marco>
  );
}

/**
 * Una junta dentro de la cuenta del fondo.
 *
 * Lee su propio score en vez de recibirlo del padre, igual que el selector lee su propio
 * nombre: el dato vive en la cadena y cada fila se lo pregunta a la fuente.
 *
 * Cuál es "la peor" no se decide aquí ni se deduce comparando filas entre sí. El contrato ya
 * devolvió ese número y la fila solo comprueba si el suyo coincide. Deducirlo en la interfaz
 * sería reimplementar la regla, y dos implementaciones de la misma regla terminan discrepando
 * el día que más importa.
 */
const JuntaEnLaCuenta = ({
  juntaId,
  miembro,
  peorScore,
  hayEvaluadas,
  minimo,
}: {
  juntaId: number;
  miembro: string | undefined;
  peorScore: number | undefined;
  hayEvaluadas: boolean;
  minimo: number;
}) => {
  const nombre = useNombreDeJunta(juntaId);

  const { data: score } = useScaffoldReadContract({
    contractName: "score_engine",
    functionName: "computeScore",
    args: [juntaId, miembro],
  });
  const { data: historial } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "history",
    args: [juntaId, miembro],
  });

  const ciclos = historial === undefined ? undefined : Number(historial[6]);
  const pagosAtrasados = Number(historial?.[2] ?? 0);
  const cuotasVencidas = Number(historial?.[3] ?? 0);
  const impagosTrasCobro = Number(historial?.[5] ?? 0);
  const reclamosPerdidos = Number(historial?.[7] ?? 0);

  // Sin un ciclo vencido no hay ninguna cuota que juzgar, así que el contrato salta esta
  // junta. Mostrar su score igual sería presentar como dato lo que todavía es un "no sé".
  const cuenta = ciclos !== undefined && ciclos >= CICLOS_PARA_CONTAR;
  const esLaPeor = cuenta && hayEvaluadas && score !== undefined && peorScore !== undefined && score === peorScore;

  const queArreglar =
    impagosTrasCobro > 0
      ? "Dejaste de aportar después de cobrar el pozo, y ninguna otra señal pesa tanto: es la que rompe a todo el grupo a la vez."
      : cuotasVencidas > 0
        ? `${cuotasVencidas === 1 ? "Hay una cuota vencida" : `Hay ${cuotasVencidas} cuotas vencidas`} sin pagar. Ponerte al día ahí es lo que más levanta el número.`
        : reclamosPerdidos > 0
          ? `El grupo reportó ${reclamosPerdidos === 1 ? "un incumplimiento tuyo" : `${reclamosPerdidos} incumplimientos tuyos`} y quedó anotado.`
          : pagosAtrasados > 0
            ? `${pagosAtrasados === 1 ? "Una cuota llegó" : `${pagosAtrasados} cuotas llegaron`} después del plazo. Pagar tarde no deja de haber sido tarde, pero las que vienen puntuales lo compensan.`
            : "Es la más baja de las tuyas, aunque no arrastra ninguna marca en contra.";

  return (
    <div className={`k-tarjeta-honda p-5 ${esLaPeor ? "border-l-2 border-l-[--color-oro]" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/junta/${juntaId}`} className="k-voz text-[15px] font-bold no-underline hover:text-[--color-oro]">
          {nombre || `Junta #${juntaId}`}
        </Link>
        <span className="flex items-center gap-3">
          {esLaPeor && <span className="k-meta text-[--color-oro]">ESTA MANDA</span>}
          <span className={`k-prueba text-lg ${esLaPeor ? "text-[--color-oro]" : "text-[--color-marfil]"}`}>
            {cuenta ? `${score ?? "—"} / 1000` : "—"}
          </span>
        </span>
      </div>

      {cuenta ? (
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[--color-gris]">
          {ciclos} {ciclos === 1 ? "ciclo transcurrido" : "ciclos transcurridos"}
          {(ciclos ?? 0) < minimo ? `, y hacen falta ${minimo} para que una junta pueda aprobarte` : ""}.{" "}
          {esLaPeor ? queArreglar : ""}
        </p>
      ) : (
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[--color-gris]">
          Todavía no ha vencido ningún ciclo, así que esta junta no entra en la cuenta. No suma ni resta: no ha pasado
          nada que se pueda juzgar.
        </p>
      )}
    </div>
  );
};
