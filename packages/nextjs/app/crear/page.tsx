"use client";

/**
 * Crear una junta: la pantalla que convierte a Kallpa en producto.
 *
 * Crear ya no es cerrar. La junta nace en convocatoria —con quien la crea dentro y a quien
 * quiera sumar de entrada— y sigue abierta hasta que su creador la arranque. Lo que se
 * congela al arrancar es el grupo, y eso sí es para siempre: una junta se compromete a tantos
 * ciclos como personas tiene, y cada una cobra su turno exactamente una vez.
 *
 * De ahí la forma de esta pantalla: la lista de direcciones es una comodidad, no un requisito
 * —quien no las tenga a mano crea la junta y comparte el enlace—, pero el nombre, la cuota y
 * el período sí quedan escritos ahora. Por eso valida antes de firmar y muestra un resumen
 * con las cifras exactas. La transacción es la última puerta, no la primera.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type TransactionReceipt, decodeEventLog, isAddress, parseAbiItem, parseUnits } from "viem";
import { useAccount } from "wagmi";
import { Dato } from "~~/components/kallpa/Dato";
import { RuedaDeJunta } from "~~/components/kallpa/Isotipo";
import { Cargando, Marco, PideBilletera, Titulo, Vacio } from "~~/components/kallpa/Marco";
import { enPalabras, mUSDC } from "~~/components/kallpa/cifras";
import { Address } from "~~/components/scaffold-eth";
import { useDeployedContractInfo, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

/** El contrato guarda el período en segundos; la gente piensa en semanas. */
const CICLOS = [
  { etiqueta: "1 minuto", segundos: 60 },
  { etiqueta: "1 hora", segundos: 3_600 },
  { etiqueta: "1 día", segundos: 86_400 },
  { etiqueta: "1 semana", segundos: 604_800 },
  { etiqueta: "1 mes", segundos: 2_592_000 },
];

const CUOTA_VALIDA = /^\d+([.,]\d{1,6})?$/;

/**
 * mUSDC tiene seis decimales: quien escribe "50" está diciendo 50000000. La conversión se
 * hace sobre el texto y no sobre un número para que 0.1 no se convierta en 99999.
 */
const aCuotaBase = (texto: string): bigint | null => {
  const limpio = texto.trim().replace(",", ".");
  if (!CUOTA_VALIDA.test(limpio)) return null;
  return parseUnits(limpio, 6);
};

/**
 * El evento con el que la junta anuncia su propio número.
 *
 * Se declara aquí y no sale de `deployedContracts.ts` porque ese archivo lo escribe el
 * exportador de ABI de Stylus, que solo emite funciones y errores: ningún evento del contrato
 * aparece ahí. La firma es la del `sol!` de `packages/stylus/contracts/junta/src/lib.rs`.
 */
const JUNTA_CREADA = parseAbiItem(
  "event JuntaCreated(uint32 indexed juntaId, uint256 cuota, uint64 periodo, uint32 miembros)",
);

/**
 * El número de la junta que creó una transacción.
 *
 * Antes esto se resolvía leyendo `totalJuntas() - 1` después de firmar, y era una carrera de
 * verdad: si otra persona creaba la suya en el mismo bloque, el contador ya había avanzado y
 * mandábamos al creador a la junta de un desconocido. El recibo no tiene ese problema porque
 * solo contiene los registros de TU transacción.
 *
 * Se filtra por la dirección del contrato porque un recibo puede traer registros de varios
 * contratos, y basta que otro emita un evento con la misma firma para colar un número ajeno.
 * Devuelve `undefined` sin quejarse si no lo encuentra: la junta se creó igual, y quien llama
 * ya tiene una salida honesta para ese caso.
 */
const idDeLaJuntaCreada = (recibo: TransactionReceipt, contrato: string | undefined) => {
  for (const registro of recibo.logs) {
    if (contrato && registro.address.toLowerCase() !== contrato.toLowerCase()) continue;
    try {
      const evento = decodeEventLog({ abi: [JUNTA_CREADA], data: registro.data, topics: registro.topics });
      return Number(evento.args.juntaId);
    } catch {
      // Otro evento de la misma transacción. Que no decodifique es lo normal, no un fallo.
    }
  }
  return undefined;
};

const CAMPO =
  "w-full rounded-[4px] border border-[--color-linea] bg-[--color-noche] px-4 py-3 text-[--color-marfil] " +
  "placeholder:text-[--color-gris] outline-none transition-colors focus:border-[--color-oro]";

type Fase = "editando" | "creando" | "sinNumero";

export default function CrearJunta() {
  const { address } = useAccount();
  const router = useRouter();

  const [nombre, setNombre] = useState("");
  const [cuota, setCuota] = useState("");
  const [periodo, setPeriodo] = useState(CICLOS[3].segundos);
  const [otros, setOtros] = useState<string[]>([""]);
  const [mostrarProblemas, setMostrarProblemas] = useState(false);
  const [fase, setFase] = useState<Fase>("editando");

  // La dirección se pide solo para reconocer los registros de la junta dentro del recibo.
  const { data: contratoJunta } = useDeployedContractInfo({ contractName: "junta" });

  const { writeContractAsync: escribirJunta } = useScaffoldWriteContract({ contractName: "junta" });

  const filas = otros.map(v => v.trim());

  /** Los errores de una dirección son de la fila, no del formulario: se corrigen donde están. */
  const errorDeFila = (i: number): string | null => {
    const valor = filas[i];
    if (valor === "") return null;
    // isAddress rechaza las mayúsculas que no cuadran con la propia dirección. Bloquear ahí
    // es incómodo, pero un miembro con la dirección mal escrita no puede pagar nunca y el
    // grupo no se puede corregir después: más vale la molestia ahora.
    if (!isAddress(valor)) {
      return "Esta dirección parece incompleta o copiada a medias. Pídela otra vez y pégala entera.";
    }
    const repetida =
      valor.toLowerCase() === address?.toLowerCase() ||
      filas.slice(0, i).some(anterior => anterior.toLowerCase() === valor.toLowerCase());
    return repetida ? "Esta dirección ya está en la lista. Cada persona ocupa un solo turno." : null;
  };

  const cuotaBase = aCuotaBase(cuota);
  const validas = filas.filter((f, i) => f !== "" && errorDeFila(i) === null);
  const miembros = 1 + filas.filter(f => f !== "").length;

  const problemas: string[] = [];
  if (!nombre.trim()) problemas.push("Ponle un nombre a la junta, para que sus miembros la reconozcan.");
  if (cuotaBase === null) problemas.push("Escribe en números cuánto pone cada persona por ciclo. Por ejemplo: 50");
  else if (cuotaBase === 0n) problemas.push("La cuota no puede ser cero: la junta no juntaría nada.");
  // Ya no se exige un segundo miembro. Una junta recién creada queda en convocatoria, así que
  // empezar solo y repartir el enlace es un camino legítimo: el grupo se completa antes de
  // arrancar, y arrancar es lo que de verdad exige que sean por lo menos dos.
  if (filas.some((_, i) => errorDeFila(i) !== null))
    problemas.push("Hay direcciones con problemas: revisa las marcadas en rojo.");

  const cambiarFila = (i: number, valor: string) => setOtros(previas => previas.map((v, j) => (j === i ? valor : v)));
  const quitarFila = (i: number) => setOtros(previas => previas.filter((_, j) => j !== i));

  /**
   * Firmar la junta y llevar a quien la creó a la suya.
   *
   * De una transacción minada solo se observan eventos y estado: el `uint32` que devuelve
   * `createJunta` no le llega a quien la envía. El número sale entonces del evento que la
   * junta emite en el recibo de esta misma transacción.
   *
   * El número se guarda en una variable local y no en el estado: `onBlockConfirmation` corre
   * ANTES de que esta espera termine, así que un `setState` no estaría disponible todavía en
   * la línea siguiente.
   */
  const crear = async () => {
    setMostrarProblemas(true);
    if (problemas.length > 0 || cuotaBase === null || !address) return;

    const lista = [address, ...validas];
    let nueva: number | undefined;

    try {
      setFase("creando");
      await escribirJunta(
        {
          functionName: "createJunta",
          args: [nombre.trim(), lista, cuotaBase, BigInt(periodo)],
        },
        {
          onBlockConfirmation: (recibo: TransactionReceipt) => {
            nueva = idDeLaJuntaCreada(recibo, contratoJunta?.address);
          },
        },
      );

      if (nueva !== undefined) {
        router.push(`/junta/${nueva}`);
        return;
      }
      setFase("sinNumero");
    } catch {
      // El error ya se avisó con su propia notificación. Aquí solo se devuelve el formulario
      // con todo lo escrito intacto: rehacerlo desde cero sería el castigo equivocado.
      setFase("editando");
    }
  };

  return (
    <Marco>
      <Titulo
        rotulo="Crear junta"
        titulo="Arma tu junta"
        bajada={
          <>
            Un grupo que se compromete a <span className="text-[--color-oro]">tantos ciclos como personas tiene</span>.
            La creas ahora y se queda abierta hasta que tú la arranques.
          </>
        }
      />

      {!address ? (
        <PideBilletera que="Para crear una junta tienes que firmarla: quien la crea participa en ella." />
      ) : fase === "sinNumero" ? (
        <Vacio
          titulo="Tu junta se creó"
          detalle="La transacción salió bien, pero su comprobante no traía el número de la junta nueva, así que no podemos llevarte directo. Aparece en tu lista de juntas apenas la cadena termine de responder."
          accion={
            <Link href="/" className="k-boton no-underline">
              Ver mis juntas
            </Link>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-6">
            {/* ── Nombre y cuota ───────────────────────────────────────────────────── */}
            <div className="k-tarjeta flex flex-col gap-6 p-8">
              <div>
                <label htmlFor="nombre" className="k-rotulo mb-3 block">
                  Nombre de la junta
                </label>
                <input
                  id="nombre"
                  className={CAMPO}
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  placeholder="Las Emprendedoras"
                  maxLength={40}
                />
                <p className="mt-2 text-sm text-[--color-gris]">
                  El nombre vive en la cadena, no en esta aplicación: todos los miembros ven el mismo.
                </p>
              </div>

              <div>
                <label htmlFor="cuota" className="k-rotulo mb-3 block">
                  Cuota por ciclo
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="cuota"
                    className={`${CAMPO} k-prueba`}
                    value={cuota}
                    onChange={e => setCuota(e.target.value)}
                    placeholder="50"
                    inputMode="decimal"
                  />
                  <span className="k-prueba shrink-0 text-sm text-[--color-gris]">mUSDC</span>
                </div>
                <p className="mt-2 text-sm text-[--color-gris]">Lo que pone cada persona, cada ciclo, sin excepción.</p>
              </div>
            </div>

            {/* ── Duración del ciclo ───────────────────────────────────────────────── */}
            <div className="k-tarjeta p-8">
              <p className="k-rotulo mb-4">Cada cuánto se paga</p>
              <div className="flex flex-wrap gap-2">
                {CICLOS.map(c => (
                  <button
                    key={c.segundos}
                    type="button"
                    onClick={() => setPeriodo(c.segundos)}
                    className={`rounded-[4px] border px-4 py-2.5 text-sm transition-colors ${
                      periodo === c.segundos
                        ? "border-[--color-oro] text-[--color-oro]"
                        : "border-[--color-linea] text-[--color-gris] hover:border-[--color-linea-viva]"
                    }`}
                  >
                    {c.etiqueta}
                  </button>
                ))}
              </div>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-[--color-gris]">
                Un ciclo de un minuto no sirve para ahorrar: sirve para probar la aplicación entera en lo que dura un
                café. Para una junta de verdad, elige semana o mes.
              </p>
            </div>

            {/* ── Quiénes son ──────────────────────────────────────────────────────── */}
            <div className="k-tarjeta p-8">
              <p className="k-rotulo mb-4">Miembros</p>
              <p className="mb-5 max-w-xl text-sm leading-relaxed text-[--color-gris]">
                Si ya tienes las direcciones de tu grupo, ponlas aquí y entran contigo. Si no las tienes a mano, no pasa
                nada: crea la junta igual y pásales el enlace para que entren solos. Se puede sumar gente hasta que la
                arranques.
              </p>

              {/* Quien crea la junta participa en ella, así que ocupa el primer turno y no se
                  puede quitar: una junta sin organizadora adentro no es una junta. */}
              <div className="mb-3 flex items-center justify-between gap-3 rounded-[4px] border border-[--color-linea] bg-[--color-noche] px-4 py-3">
                <span className="flex items-center gap-3">
                  <span className="k-prueba w-7 shrink-0 text-xs text-[--color-oro]">1º</span>
                  <Address address={address} size="sm" />
                </span>
                <span className="k-tag">tú</span>
              </div>

              <div className="flex flex-col gap-3">
                {otros.map((valor, i) => {
                  const error = mostrarProblemas ? errorDeFila(i) : null;
                  return (
                    <div key={i}>
                      <div className="flex items-center gap-3">
                        <span className="k-prueba w-7 shrink-0 text-xs text-[--color-gris]">{i + 2}º</span>
                        <input
                          className={`${CAMPO} k-prueba text-sm ${error ? "border-[--color-mal]" : ""}`}
                          value={valor}
                          onChange={e => cambiarFila(i, e.target.value)}
                          placeholder="0x…"
                          aria-label={`Dirección del miembro ${i + 2}`}
                          spellCheck={false}
                        />
                        <button
                          type="button"
                          onClick={() => quitarFila(i)}
                          className="k-meta shrink-0 px-2 py-2 hover:text-[--color-mal]"
                          aria-label={`Quitar al miembro ${i + 2}`}
                        >
                          QUITAR
                        </button>
                      </div>
                      {error && <p className="ml-10 mt-1.5 text-sm text-[--color-mal]">{error}</p>}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setOtros(previas => [...previas, ""])}
                className="k-boton-borde mt-4 px-5 py-2.5 text-sm"
              >
                Agregar a alguien
              </button>

              <p className="mt-6 max-w-xl border-t border-[--color-linea] pt-5 text-sm leading-relaxed text-[--color-gris]">
                El orden de esta lista es el orden de los turnos, y quien entre después con el enlace se pone al final
                de la fila. La lista se cierra el día que arranques la junta y ya no se abre: la junta se compromete a
                tantos ciclos como personas tiene y cada una cobra una sola vez, así que sumar a alguien más tarde
                cambiaría a quién le debe la junta. Igual que en una junta de verdad.
              </p>
            </div>
          </div>

          {/* ── El resumen antes de firmar ───────────────────────────────────────────── */}
          <aside className="flex flex-col gap-6">
            <div className="k-tarjeta flex flex-col items-center gap-5 p-8">
              <RuedaDeJunta miembros={miembros} turnosCobrados={0} size={150} />
              <p className="text-center text-sm leading-relaxed text-[--color-gris]">
                Cada punto es un miembro. Todos en contorno: nadie ha cobrado su turno todavía.
              </p>
            </div>

            <div className="k-tarjeta flex flex-col gap-5 p-6">
              <p className="k-rotulo">Así arrancaría hoy</p>
              {/* Las cifras van en monoespaciada porque son exactamente las que se van a
                  escribir en la cadena si firmas: el resumen no redondea nada. */}
              <Dato termino="Miembros" valor={String(miembros)} />
              <Dato termino="Pone cada uno" valor={cuotaBase ? `${mUSDC(cuotaBase)} mUSDC` : "—"} />
              <Dato
                termino="Recibe quien cobra"
                valor={cuotaBase ? `${mUSDC(cuotaBase * BigInt(miembros))} mUSDC` : "—"}
                destacado
              />
              <Dato termino="Dura en total" valor={enPalabras(miembros * periodo)} />
              {/* El único número de este panel que todavía puede moverse es el de miembros, y
                  mueve a los otros tres con él. Decirlo evita que quien comparta el enlace
                  crea que rompió algo cuando el pozo le cambie. */}
              <p className="text-sm leading-relaxed text-[--color-gris]">
                Cuentan a quienes ya están. Si alguien más entra con el enlace antes de que la arranques, la junta
                crece: un ciclo más y un pozo más grande.
              </p>
            </div>

            {/* Una junta de dos personas es una junta válida, pero nunca va a servir para
                pedir crédito, y quien la crea merece saberlo antes de firmar y no tres
                ciclos después. Una junta dura tantos ciclos como miembros tenga: con menos
                de tres nunca alcanza el mínimo de historial que el fondo exige. No bloquea
                nada —ahorrar entre dos es legítimo—, solo lo dice. */}
            {miembros < 3 && (
              <div className="k-tarjeta p-6">
                <p className="k-rotulo mb-3">Así no daría crédito</p>
                <p className="text-sm leading-relaxed text-[--color-gris]">
                  Una junta dura tantos ciclos como miembros tiene, y el fondo exige tres ciclos de historial antes de
                  prestarle a nadie. Con {miembros} nunca se llega. Todavía puedes sumar a alguien aquí, o crearla y
                  esperar a que entren con el enlace antes de arrancarla.
                </p>
              </div>
            )}

            {fase === "editando" ? (
              <>
                {mostrarProblemas && problemas.length > 0 && (
                  <div className="k-tarjeta border-[--color-mal] p-6">
                    <p className="k-rotulo mb-3 text-[--color-mal]">Falta corregir</p>
                    <ul className="flex flex-col gap-2">
                      {problemas.map(p => (
                        <li key={p} className="text-sm leading-relaxed text-[--color-mal]">
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <button type="button" className="k-boton" onClick={crear}>
                  Crear la junta
                </button>
                <p className="text-sm leading-relaxed text-[--color-gris]">
                  Crear la junta es una sola firma y no mueve dinero. Después te llevamos a su pantalla, donde tienes el
                  enlace para invitar y el botón para arrancarla cuando estén todas. Recién ahí empiezan las cuotas.
                </p>
              </>
            ) : (
              <Cargando que="Escribiendo tu junta en la cadena" />
            )}
          </aside>
        </div>
      )}
    </Marco>
  );
}
