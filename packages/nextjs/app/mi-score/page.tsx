"use client";

/**
 * Mi score: donde el historial se vuelve cifra y la cifra se vuelve decisión.
 *
 * La tentación aquí es mostrar el número y nada más. El problema es que un número solo no
 * distingue los dos "no" que este producto puede dar, y son opuestos: "tu historial muestra
 * incumplimientos" y "todavía no te conozco". Quien recién entra puntúa altísimo justamente
 * porque no hay ninguna señal negativa que observar, y tratar ese silencio como excelencia
 * sería el error que hunde a cualquier sistema de crédito. Por eso la pantalla separa el
 * veredicto del modelo del veredicto de la política, y dice cuál de los dos habló.
 *
 * Los dos botones del final tampoco son adorno, y no hacen lo mismo: consultar el score es una
 * vista gratuita que no deja rastro, así que si nadie lo escribe, no queda nada que un tercero
 * pueda consultar después. Registrar lo escribe en NUESTRO contrato; la attestation lo publica
 * en un registro que no es nuestro. La segunda es la que hace que la reputación sea del
 * miembro y no de Kallpa, y por eso la pantalla gasta texto en separarlas.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { type TransactionReceipt, decodeEventLog, parseAbiItem } from "viem";
import { useAccount } from "wagmi";
import { Cargando, Marco, PideBilletera, Titulo, Vacio } from "~~/components/kallpa/Marco";
import { SelectorDeJunta, useNombreDeJunta } from "~~/components/kallpa/SelectorDeJunta";
import { mUSDC } from "~~/components/kallpa/cifras";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { getBlockExplorerTxLink } from "~~/utils/scaffold-stylus";

/** La tasa viene en escala 1e6, así que 1 000 000 es el 100%. */
const porcentaje = (v: bigint | undefined) => (v === undefined ? "—" : `${(Number(v) / 10000).toFixed(1)}%`);

/** El atraso se mide en fracciones de ciclo, no en días: la junta no sabe de calendarios. */
const enCiclos = (v: bigint | undefined) => (v === undefined ? "—" : (Number(v) / 1e6).toFixed(2));

const fechaLarga = (segundos: bigint) =>
  new Date(Number(segundos) * 1000).toLocaleString("es-PE", { dateStyle: "long", timeStyle: "short" });

/**
 * El evento que el Ethereum Attestation Service emite al crear una attestation.
 *
 * Se declara aquí y no se lee de ninguna ABI nuestra porque no es nuestro: lo emite el
 * contrato de EAS, que ni siquiera sabe que existimos. La firma está comprobada contra la
 * cadena en `docs/eas-arbitrum-sepolia.md`.
 */
const ATTESTED = parseAbiItem(
  "event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)",
);

/**
 * El identificador de la attestation que produjo una transacción.
 *
 * Hay que sacarlo del recibo y no del valor de retorno: de una transacción minada solo se
 * observan eventos y estado, así que el `bytes32` que devuelve `attest` no le llega a quien
 * la envió. Tampoco se puede calcular por adelantado — el identificador depende del instante
 * del bloque.
 *
 * Devuelve `undefined` sin quejarse si no encuentra el evento. Es una consecuencia de leer un
 * contrato ajeno: la transacción sigue siendo válida y su enlace también, y perder el
 * identificador no es motivo para esconder el comprobante.
 */
const uidDeLaAttestation = (recibo: TransactionReceipt) => {
  for (const registro of recibo.logs) {
    try {
      const evento = decodeEventLog({ abi: [ATTESTED], data: registro.data, topics: registro.topics });
      return evento.args.uid;
    } catch {
      // Otro evento de la misma transacción. Que no decodifique es lo normal, no un fallo.
    }
  }
  return undefined;
};

export default function MiScore() {
  const { address } = useAccount();
  const { targetNetwork } = useTargetNetwork();

  // Null significa "todavía no elegiste", no "ninguna". Así la primera junta se muestra sola
  // sin necesidad de un efecto que sincronice estado con datos que aún no llegaron.
  const [elegida, setElegida] = useState<number | null>(null);
  const [registrando, setRegistrando] = useState(false);
  const [atestiguando, setAtestiguando] = useState(false);
  // El comprobante viaja junto a la junta que lo produjo: si cambias de pestaña, el enlace de
  // otra junta dejaría de significar lo que dice.
  const [comprobante, setComprobante] = useState<{ hash: string; junta: number } | null>(null);
  const [attestation, setAttestation] = useState<{ hash: string; uid?: string; junta: number } | null>(null);

  const { data: misJuntas, isLoading: cargandoJuntas } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "juntasDe",
    args: [address],
  });

  const ids = useMemo(() => (misJuntas ?? []).map(Number), [misJuntas]);
  // Si cambias de billetera, la junta elegida puede ya no ser tuya. Volver a la primera es
  // preferible a leer un historial que no te corresponde.
  const juntaId = elegida !== null && ids.includes(elegida) ? elegida : ids[0];

  const nombre = useNombreDeJunta(juntaId);

  const { data: veredicto } = useScaffoldReadContract({
    contractName: "score_engine",
    functionName: "scoreAndCredit",
    args: [juntaId, address],
  });

  const { data: historial } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "history",
    args: [juntaId, address],
  });

  const { data: ultimo, refetch: releerUltimo } = useScaffoldReadContract({
    contractName: "score_engine",
    functionName: "latestScore",
    args: [juntaId, address],
  });

  const { data: umbral } = useScaffoldReadContract({
    contractName: "score_engine",
    functionName: "umbralPositivo",
  });

  const { data: minimoCiclos } = useScaffoldReadContract({
    contractName: "score_engine",
    functionName: "minimoCiclos",
  });

  // La huella del modelo. Va en etiqueta técnica porque respalda una afirmación fuerte: el
  // puntaje no lo calcula un servidor nuestro, y esta cadena de caracteres lo identifica.
  const { data: huellaModelo } = useScaffoldReadContract({
    contractName: "score_engine",
    functionName: "modelHash",
  });

  const score = veredicto?.[0] as number | undefined;
  const conCredito = veredicto?.[1] as boolean | undefined;

  const { data: tramo } = useScaffoldReadContract({
    contractName: "pool",
    functionName: "tramo",
    args: [score],
  });

  const { writeContractAsync: escribirScore } = useScaffoldWriteContract({ contractName: "score_engine" });

  const tasaCumplimiento = historial?.[0] as bigint | undefined;
  const pagosPuntuales = historial?.[1] as number | undefined;
  const pagosAtrasados = historial?.[2] as number | undefined;
  const cuotasVencidas = historial?.[3] as number | undefined;
  const atrasoMaximo = historial?.[4] as bigint | undefined;
  const impagosTrasCobro = historial?.[5] as number | undefined;
  const ciclosVividos = historial?.[6] as number | undefined;
  const reclamosPerdidos = historial?.[7] as number | undefined;

  const ultimoScore = ultimo?.[0] as number | undefined;
  const ultimoPositivo = ultimo?.[1] as boolean | undefined;
  const ultimoMomento = ultimo?.[2] as bigint | undefined;
  const hayRegistro = ultimoMomento !== undefined && ultimoMomento > 0n;

  const minimo = Number(minimoCiclos ?? 3);
  const corte = Number(umbral ?? 400);
  const ciclos = Number(ciclosVividos ?? 0);
  const faltanCiclos = Math.max(0, minimo - ciclos);
  /**
   * Si el historial todavía no tiene ninguna marca en contra.
   *
   * Cambia el texto cuando el puntaje llega al corte pero falta historial: no es lo mismo
   * quien puntúa alto porque no hay nada que observar que quien ya arrastra un atraso. Dar
   * el mismo mensaje a los dos le diría al segundo que va impecable.
   */
  const sinTacha =
    Number(pagosAtrasados ?? 0) === 0 &&
    Number(cuotasVencidas ?? 0) === 0 &&
    Number(reclamosPerdidos ?? 0) === 0 &&
    Number(impagosTrasCobro ?? 0) === 0;

  const cargandoScore = veredicto === undefined || historial === undefined;
  const porcentajeBarra = Math.min(100, ((score ?? 0) / 1000) * 100);
  const porcentajeCorte = (corte / 1000) * 100;
  const enlaceDeTx = (hash: string) =>
    getBlockExplorerTxLink(targetNetwork.id, hash) || `https://sepolia.arbiscan.io/tx/${hash}`;

  const enlaceComprobante = comprobante && comprobante.junta === juntaId ? enlaceDeTx(comprobante.hash) : null;
  const laAttestation = attestation && attestation.junta === juntaId ? attestation : null;

  const registrar = async () => {
    if (juntaId === undefined || !address) return;
    try {
      setRegistrando(true);
      const hash = await escribirScore({ functionName: "recordScore", args: [juntaId, address] });
      if (hash) setComprobante({ hash, junta: juntaId });
      await releerUltimo();
    } finally {
      setRegistrando(false);
    }
  };

  /**
   * Publicar la attestation.
   *
   * El identificador se saca del recibo porque es la única forma de conocerlo: `attest`
   * devuelve un `bytes32`, pero el valor de retorno de una transacción no viaja de vuelta a
   * quien la firmó. Por eso se pide el recibo con `onBlockConfirmation` en vez de conformarse
   * con el hash.
   *
   * El identificador se guarda en una variable local y no en el estado: `onBlockConfirmation`
   * corre ANTES de que esta espera termine, así que escribirlo directamente lo perdería en
   * cuanto la línea de abajo montara el comprobante encima.
   */
  const atestiguar = async () => {
    if (juntaId === undefined || !address) return;
    let uid: string | undefined;
    try {
      setAtestiguando(true);
      const hash = await escribirScore(
        { functionName: "attest", args: [juntaId, address] },
        { onBlockConfirmation: (recibo: TransactionReceipt) => (uid = uidDeLaAttestation(recibo)) },
      );
      if (hash) setAttestation({ hash, uid, junta: juntaId });
    } finally {
      setAtestiguando(false);
    }
  };

  return (
    <Marco>
      <Titulo
        rotulo="Mi score"
        titulo="Tu historial, convertido en cifra"
        bajada={
          <>
            Tu palabra tiene <span className="text-[--color-oro]">peso medible</span>. Aquí se ve cuánto.
          </>
        }
      />

      {!address ? (
        <PideBilletera que="Tu score se calcula sobre lo que pagaste y cuándo lo pagaste." />
      ) : cargandoJuntas ? (
        <Cargando que="Buscando tus juntas" />
      ) : ids.length === 0 ? (
        <Vacio
          titulo="Todavía no tienes historial"
          detalle={
            "El score se construye pagando cuotas en una junta. Mientras no estés en ninguna, no hay " +
            "nada que medir: entra a una o crea la tuya y empieza a construirlo."
          }
          accion={
            <div className="flex flex-wrap gap-3">
              <Link href="/crear" className="k-boton no-underline">
                Crear una junta
              </Link>
              <Link href="/" className="k-boton-borde no-underline">
                Ir a mis juntas
              </Link>
            </div>
          }
        />
      ) : (
        <>
          {/* ── En qué junta ───────────────────────────────────────────────────────── */}
          <div className="mb-8">
            <SelectorDeJunta
              ids={ids}
              elegida={juntaId}
              alElegir={id => {
                setElegida(id);
                setComprobante(null);
                setAttestation(null);
              }}
              rotulo="Tu historial se mide por junta"
              nota="Cada junta lleva su propia cuenta. Estás viendo la que elijas."
            />
            {ids.length === 1 && <p className="k-meta">EN {(nombre || `JUNTA #${juntaId}`).toUpperCase()}</p>}
          </div>

          {cargandoScore ? (
            <Cargando que="Calculando tu score" />
          ) : (
            <>
              {/* ── La cifra ───────────────────────────────────────────────────────── */}
              <div className="k-tarjeta mb-6 p-8 sm:p-10">
                <div className="flex flex-wrap items-end justify-between gap-6">
                  <div>
                    <p className="k-rotulo mb-4">Tu score en {nombre || `la junta #${juntaId}`}</p>
                    <p className="flex items-baseline gap-3">
                      <span className="k-prueba text-7xl font-medium leading-none text-[--color-oro] sm:text-8xl">
                        {score ?? "—"}
                      </span>
                      <span className="k-prueba text-xl text-[--color-gris]">/ 1000</span>
                    </p>
                  </div>
                  {huellaModelo && (
                    <span className="k-tag-tecnico" title="Identificador del modelo que hizo el cálculo">
                      MODELO {String(huellaModelo).slice(0, 18)}
                    </span>
                  )}
                </div>

                <div className="relative mt-10">
                  <div className="h-2 w-full overflow-hidden rounded-[4px] bg-[--color-linea-sutil]">
                    <div className="h-full bg-[--color-oro]" style={{ width: `${porcentajeBarra}%` }} />
                  </div>
                  {/* La marca del umbral vive fuera de la barra: recortada dejaría de verse cuando
                      el puntaje la supera, que es justo cuando más importa ubicarla. */}
                  <div
                    className="absolute -top-1.5 h-5 w-px bg-[--color-marfil]"
                    style={{ left: `${porcentajeCorte}%` }}
                    aria-hidden="true"
                  />
                  <p className="k-meta mt-4">
                    0 &nbsp;·&nbsp; {corte} ES EL MÍNIMO PARA TENER CRÉDITO &nbsp;·&nbsp; 1000
                  </p>
                </div>

                <p className="mt-6 max-w-2xl text-sm leading-relaxed text-[--color-gris]">
                  Este número no lo escribe nadie a mano. Sale de tus pagos y del momento en que los hiciste, y se
                  vuelve a calcular cada vez que alguien lo consulta.
                </p>
              </div>

              {/* ── El veredicto y su razón ────────────────────────────────────────── */}
              <div className="k-tarjeta mb-6 p-8 sm:p-10">
                {conCredito ? (
                  <>
                    <span className="k-sello">✓ TU REPUTACIÓN ES POSITIVA</span>
                    <p className="mt-6 max-w-2xl leading-relaxed text-[--color-marfil]">
                      Cumples las dos condiciones: tu puntaje llegó a {corte} y llevas {ciclos}{" "}
                      {ciclos === 1 ? "ciclo" : "ciclos"} de junta, suficiente para que ese puntaje signifique algo.
                    </p>
                    {tramo !== undefined && tramo > 0n && (
                      <p className="mt-4 max-w-2xl leading-relaxed text-[--color-gris]">
                        Con este puntaje el fondo te prestaría hasta{" "}
                        <span className="k-prueba text-[--color-oro]">{mUSDC(tramo)} mUSDC</span>.
                      </p>
                    )}
                    <div className="mt-8">
                      <Link href="/pedir-credito" className="k-boton no-underline">
                        Pedir mi crédito
                      </Link>
                    </div>
                  </>
                ) : (score ?? 0) >= corte ? (
                  <>
                    {/* Ni sello ni sello roto: no hay veredicto todavía, y fingir uno sería mentir
                        en cualquiera de las dos direcciones. */}
                    <span className="k-tag">AÚN NO HAY HISTORIAL SUFICIENTE</span>
                    <p className="k-corazon mt-6 max-w-2xl text-xl leading-relaxed text-[--color-marfil]">
                      {sinTacha
                        ? "Tu puntaje ya está donde tiene que estar. Lo que falta es tiempo."
                        : "Tu puntaje alcanza el corte, pero todavía no hay junta detrás que lo sostenga."}
                    </p>
                    <p className="mt-5 max-w-2xl leading-relaxed text-[--color-gris]">
                      Esto no es un rechazo. Llevas {ciclos} {ciclos === 1 ? "ciclo" : "ciclos"} y hacen falta {minimo}:{" "}
                      {faltanCiclos === 1 ? "queda uno" : `quedan ${faltanCiclos}`}.{" "}
                      {sinTacha ? (
                        <>
                          Quien recién empieza puntúa alto porque todavía no hay nada malo que observar, y confundir{" "}
                          <span className="k-corazon text-[--color-marfil]">no sé</span> con{" "}
                          <span className="k-corazon text-[--color-marfil]">excelente</span> sería precisamente el error
                          que arruina a un sistema de crédito.
                        </>
                      ) : (
                        <>
                          Tu historial ya tiene marcas —están en las señales de abajo— y con tan poca junta detrás no
                          alcanzan para condenarte ni para absolverte. Un tropiezo temprano no define a nadie, del mismo
                          modo que dos ciclos limpios tampoco probarían nada.
                        </>
                      )}{" "}
                      Sigue pagando tus cuotas: cada ciclo que cierras convierte tu puntaje en algo que se sostiene.
                    </p>
                  </>
                ) : (
                  <>
                    <span className="k-sello-roto">✕ TU HISTORIAL MUESTRA INCUMPLIMIENTOS</span>
                    <p className="mt-6 max-w-2xl leading-relaxed text-[--color-marfil]">
                      Tu puntaje es {score} y el mínimo es {corte}. Lo que lo bajó está en las señales de abajo:{" "}
                      {Number(impagosTrasCobro ?? 0) > 0
                        ? "pesa sobre todo haber dejado de aportar después de cobrar el pozo."
                        : Number(cuotasVencidas ?? 0) > 0
                          ? "pesan sobre todo las cuotas que vencieron sin pagarse."
                          : "pesan sobre todo los pagos que llegaron tarde."}
                    </p>
                    <p className="mt-4 max-w-2xl leading-relaxed text-[--color-gris]">
                      Se recupera de la única forma en que se recupera la confianza: pagando puntual los ciclos que
                      vienen. Nadie tiene que perdonarte nada ni firmar nada para que el puntaje vuelva a subir.
                    </p>
                  </>
                )}
              </div>

              {/* ── Las ocho señales ───────────────────────────────────────────────── */}
              <p className="k-rotulo mb-4">Lo que el modelo mira</p>
              <div className="mb-6 grid gap-4 sm:grid-cols-2">
                <Senal
                  termino="Cumplimiento"
                  valor={porcentaje(tasaCumplimiento)}
                  // Es cuotas pagadas sobre ciclos vencidos, sin mirar la puntualidad: de eso
                  // hablan las dos señales siguientes. Decir "a tiempo" aquí contradecía la de
                  // al lado — 50% de cumplimiento junto a cero pagos puntuales.
                  explica="De todas las cuotas que te tocaba poner, qué parte llegaste a poner."
                />
                <Senal
                  termino="Pagos a tiempo"
                  valor={String(pagosPuntuales ?? 0)}
                  explica="Cuotas que entraron dentro del plazo del ciclo."
                />
                <Senal
                  termino="Pagos con retraso"
                  valor={String(pagosAtrasados ?? 0)}
                  explica="Cuotas que sí pagaste, pero después de que el ciclo venciera."
                  alerta={Number(pagosAtrasados ?? 0) > 0}
                />
                <Senal
                  termino="Cuotas vencidas sin pagar"
                  valor={String(cuotasVencidas ?? 0)}
                  explica="Ciclos que se cerraron sin tu aporte. Es lo que otro miembro terminó cubriendo."
                  alerta={Number(cuotasVencidas ?? 0) > 0}
                />
                <Senal
                  termino="Retraso más largo"
                  valor={`${enCiclos(atrasoMaximo)} ciclos`}
                  explica="Tu peor demora, medida en ciclos de la junta y no en días: la junta no sigue el calendario, sigue su turno."
                />
                <Senal
                  termino="Ciclos transcurridos"
                  valor={String(ciclos)}
                  explica={`Cuánta junta llevas vivida. Con menos de ${minimo}, todavía no hay historial que sostenga un veredicto.`}
                />
                <Senal
                  termino="Reclamos perdidos"
                  valor={String(reclamosPerdidos ?? 0)}
                  explica="Veces que el grupo reportó un incumplimiento tuyo y quedó anotado."
                  alerta={Number(reclamosPerdidos ?? 0) > 0}
                />
                {/* Esta señal ocupa el ancho completo a propósito: es el riesgo que define a una
                    junta y no a un préstamo cualquiera. */}
                <Senal
                  termino="Impagos después de cobrar el pozo"
                  valor={String(impagosTrasCobro ?? 0)}
                  explica="Es el riesgo propio de una junta: tomar el pozo cuando te toca y dejar de aportar a los demás. Ninguna otra señal pesa tanto, porque es la única que rompe a todo el grupo a la vez."
                  alerta={Number(impagosTrasCobro ?? 0) > 0}
                  destacada
                />
              </div>

              {/* ── Dejarlo escrito ────────────────────────────────────────────────── */}
              <div className="k-tarjeta p-8 sm:p-10">
                <p className="k-rotulo mb-4">Dejarlo por escrito</p>
                <p className="mb-8 max-w-2xl leading-relaxed text-[--color-gris]">
                  Consultar tu score es gratis y no deja rastro: el contrato lo calcula, te lo muestra y se olvida. Para
                  que le sirva a alguien más hay que escribirlo, y hay{" "}
                  <span className="text-[--color-marfil]">dos formas de hacerlo que no son la misma</span>.
                </p>

                <div className="grid gap-8 sm:grid-cols-2">
                  {/* ── En nuestro contrato ───────────────────────────────────────── */}
                  <div className="flex flex-col">
                    <p className="k-meta mb-3">1 · EN NUESTRO CONTRATO</p>
                    <p className="mb-6 flex-1 text-sm leading-relaxed text-[--color-gris]">
                      Registrar guarda el número en el contrato de Kallpa. Queda público y permanente, y cualquiera
                      puede ir a consultarlo — pero antes tiene que saber que existimos y dónde mirar.
                    </p>
                    <button className="k-boton" onClick={registrar} disabled={registrando}>
                      {registrando ? "Registrando…" : "Registrar mi score"}
                    </button>

                    {enlaceComprobante && (
                      <div className="mt-6">
                        <span className="k-sello">✓ QUEDÓ REGISTRADO</span>
                        <p className="mt-4 text-sm leading-relaxed text-[--color-gris]">
                          Ese registro es público y permanente: cualquiera puede verlo, y tú no puedes borrarlo.{" "}
                          <a
                            className="text-[--color-oro] underline underline-offset-4"
                            href={enlaceComprobante}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Ver el comprobante
                          </a>
                        </p>
                      </div>
                    )}
                  </div>

                  {/* ── En un registro que no es nuestro ──────────────────────────── */}
                  <div className="flex flex-col">
                    <p className="k-meta mb-3">2 · EN UN REGISTRO QUE NO ES NUESTRO</p>
                    <p className="mb-6 flex-1 text-sm leading-relaxed text-[--color-gris]">
                      La attestation publica el mismo número en un registro que no es nuestro y que ya leen otros, el
                      Ethereum Attestation Service. Una financiera que nunca oyó hablar de Kallpa puede verificarlo ahí,
                      sin pedirnos permiso y sin depender de que sigamos existiendo. Es lo que hace que tu reputación
                      sea <span className="k-corazon text-[--color-marfil]">tuya</span> y no nuestra.
                    </p>
                    <button className="k-boton-borde" onClick={atestiguar} disabled={atestiguando}>
                      {atestiguando ? "Publicando…" : "Publicar la attestation"}
                    </button>

                    {laAttestation && (
                      <div className="mt-6">
                        <span className="k-sello">✓ PUBLICADA</span>
                        {laAttestation.uid ? (
                          <>
                            <p className="k-meta mt-4 mb-1">IDENTIFICADOR DE LA ATTESTATION</p>
                            <p className="k-prueba break-all text-xs text-[--color-marfil]">{laAttestation.uid}</p>
                          </>
                        ) : null}
                        <p className="mt-4 text-sm leading-relaxed text-[--color-gris]">
                          {laAttestation.uid
                            ? "Con ese identificador cualquiera lee la attestation completa desde el registro, sin pasar por Kallpa."
                            : "La publicación quedó hecha, aunque el identificador no se pudo leer del comprobante. La transacción lo contiene."}{" "}
                          <a
                            className="text-[--color-oro] underline underline-offset-4"
                            href={enlaceDeTx(laAttestation.hash)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Ver la attestation
                          </a>
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-8 border-t border-[--color-linea] pt-6">
                  <p className="k-meta mb-2">ÚLTIMO SCORE REGISTRADO</p>
                  {hayRegistro ? (
                    <>
                      <p className="k-prueba text-2xl text-[--color-marfil]">
                        {ultimoScore} <span className="text-sm text-[--color-gris]">/ 1000</span>
                      </p>
                      <p className="mt-2 text-sm text-[--color-gris]">
                        Escrito el {fechaLarga(ultimoMomento)} · quedó marcado como{" "}
                        {ultimoPositivo ? "reputación positiva" : "sin crédito"}.
                      </p>
                      {ultimoScore !== undefined && score !== undefined && ultimoScore !== score && (
                        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[--color-gris]">
                          Hoy tu score es {score}. Un registro es una foto del día en que se tomó, no un valor que se
                          actualice solo: por eso conviene volver a escribirlo cuando cambie.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-[--color-gris]">Todavía no registraste ninguno en esta junta.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </Marco>
  );
}

/**
 * Una señal del modelo: la cifra grande, y debajo qué significa en palabras de todos los días.
 *
 * No usa el `Dato` compartido porque no es lo mismo: `Dato` es un número dentro de un panel de
 * varios, y esto es una tarjeta que además tiene que explicarse sola.
 */
const Senal = ({
  termino,
  valor,
  explica,
  alerta,
  destacada,
}: {
  termino: string;
  valor: string;
  explica: string;
  alerta?: boolean;
  destacada?: boolean;
}) => (
  <div className={`k-tarjeta-honda p-6 ${destacada ? "border-l-2 border-l-[--color-oro] sm:col-span-2" : ""}`}>
    <p className="k-meta mb-2">{termino.toUpperCase()}</p>
    {/* Monoespaciada porque el valor sale de la cadena: en este sistema la tipografía es la
        que promete que el dato se puede verificar. */}
    <p className={`k-prueba mb-3 text-2xl ${alerta ? "text-[--color-mal]" : "text-[--color-marfil]"}`}>{valor}</p>
    <p className="max-w-xl text-sm leading-relaxed text-[--color-gris]">{explica}</p>
  </div>
);
