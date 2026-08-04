"use client";

/**
 * La convocatoria: la junta existe, pero todavía no arranca.
 *
 * Mientras no arranque no hay nada que medir —ni cuotas, ni turnos repartidos, ni pozo—, así
 * que esta pantalla no muestra ninguna de esas cosas. Un pozo en cero o un "ciclo 1 de 4" que
 * nadie ha empezado no serían datos incompletos: serían datos falsos, y en un producto cuya
 * promesa es que todo se puede verificar, eso cuesta más que una pantalla vacía.
 *
 * Lo único real en esta fase es quiénes se han sumado y en qué orden. Y el orden no es un
 * detalle de presentación: entrar primero es cobrar primero, así que la lista de llegada ES
 * la lista de turnos. De ahí que el enlace para invitar viva aquí y no escondido en un menú —
 * sin enlace, "unirse" no le sirve a nadie.
 */

import { useEffect, useState } from "react";
import { type Abi } from "viem";
import { useAccount, useConfig, useWriteContract } from "wagmi";
import { Dato } from "~~/components/kallpa/Dato";
import { RuedaDeJunta } from "~~/components/kallpa/Isotipo";
import { PideBilletera, Titulo } from "~~/components/kallpa/Marco";
import { enPalabras, mUSDC } from "~~/components/kallpa/cifras";
import { Address } from "~~/components/scaffold-eth";
import {
  useCopyToClipboard,
  useDeployedContractInfo,
  useScaffoldReadContract,
  useTransactor,
} from "~~/hooks/scaffold-eth";
import { applyGasFeeMultiplier } from "~~/hooks/scaffold-eth/useScaffoldWriteContract";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { AllowedChainIds } from "~~/utils/scaffold-stylus";
import { simulateContractWriteAndNotifyError } from "~~/utils/scaffold-eth/contract";

const CAMPO_ENLACE =
  "min-w-0 flex-1 rounded-[4px] border border-[--color-linea] bg-[--color-noche] px-4 py-3 text-sm " +
  "text-[--color-marfil] outline-none";

export const Convocatoria = ({
  id,
  nombre,
  cuota,
  periodo,
  releerJunta,
}: {
  id: number;
  nombre: string | undefined;
  cuota: bigint | undefined;
  periodo: bigint | undefined;
  /** Vuelve a leer los parámetros de la junta: al arrancar, esta pantalla deja de aplicar. */
  releerJunta: () => void;
}) => {
  const { address } = useAccount();
  const [trabajando, setTrabajando] = useState<string | null>(null);

  const { data: contratoJunta } = useDeployedContractInfo({ contractName: "junta" });
  const { data: lista, refetch: releerLista } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "miembros",
    args: [id],
  });
  // El creador no cambia nunca, así que esta lectura no necesita repetirse en cada bloque.
  const { data: creador } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "creadorDe",
    args: [id],
    watch: false,
  });

  const wagmiConfig = useConfig();
  const { targetNetwork } = useTargetNetwork();
  const { writeContractAsync } = useWriteContract();
  const enviarTx = useTransactor();

  const miembros: readonly string[] = lista ?? [];
  const yo = address?.toLowerCase();
  const soyMiembro = yo !== undefined && miembros.some(m => m.toLowerCase() === yo);
  const soyCreador = yo !== undefined && creador !== undefined && creador.toLowerCase() === yo;
  const miTurno = miembros.findIndex(m => m.toLowerCase() === yo) + 1;
  const puedeArrancar = miembros.length >= 2;

  /**
   * Firmar `unirse` o `arrancar`.
   *
   * No pasa por `useScaffoldWriteContract` porque ese hook fija el nombre de la función en el
   * tipo, y aquí un mismo camino sirve a las dos. Lo demás sí se repite a propósito: simular
   * antes de abrir la billetera evita cobrarle a alguien un rechazo que ya se podía anticipar
   * —y con la ABI desplegada, el rechazo llega con el nombre del error del contrato y no en
   * hexadecimal—, y subir el techo del gas impide que un pico de base fee mate la transacción
   * a mitad de camino.
   */
  const escribir = async (funcion: "unirse" | "arrancar", aviso: string) => {
    if (!contratoJunta?.address) return;
    const parametros = {
      abi: contratoJunta.abi as Abi,
      address: contratoJunta.address,
      functionName: funcion,
      args: [id],
    };
    try {
      setTrabajando(aviso);
      const conGas = await applyGasFeeMultiplier(parametros as any, targetNetwork.id as AllowedChainIds);
      await simulateContractWriteAndNotifyError({
        wagmiConfig,
        writeContractParams: conGas,
        chainId: targetNetwork.id as AllowedChainIds,
      });
      await enviarTx(() => writeContractAsync(conGas as typeof parametros));
      await releerLista();
      releerJunta();
    } catch {
      // El error ya salió con su propia notificación. La pantalla se queda como estaba.
    } finally {
      setTrabajando(null);
    }
  };

  return (
    <>
      <Titulo
        rotulo={`Junta #${id}`}
        titulo={nombre || `Junta #${id}`}
        bajada={
          <>
            Esta junta <span className="text-[--color-oro]">todavía no arranca</span>. Está juntando a su gente, y quien
            llega antes cobra antes.
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          {/* ── Quiénes van entrando ─────────────────────────────────────────────── */}
          <div className="k-tarjeta p-8">
            <p className="k-rotulo mb-4">Quiénes se han sumado</p>
            <p className="mb-5 max-w-2xl text-sm leading-relaxed text-[--color-gris]">
              El orden de llegada es el orden de cobro. La primera persona de esta lista se lleva el primer pozo, la
              segunda el segundo, y así hasta que todas hayan cobrado una vez.
            </p>
            <ul className="flex flex-col gap-1">
              {miembros.map((m, i) => (
                <li key={m} className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] px-3 py-2.5">
                  <span className="flex items-center gap-3">
                    <span className="k-prueba w-7 shrink-0 text-xs text-[--color-oro]">{i + 1}º</span>
                    <Address address={m} size="sm" />
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {creador !== undefined && m.toLowerCase() === creador.toLowerCase() && (
                      <span className="k-tag">organiza</span>
                    )}
                    {yo !== undefined && m.toLowerCase() === yo && <span className="k-tag">tú</span>}
                  </span>
                </li>
              ))}
            </ul>
            {miembros.length === 0 && <p className="text-sm text-[--color-gris]">Todavía no hay nadie en la lista.</p>}
          </div>

          {/* ── Lo que te toca hacer ─────────────────────────────────────────────── */}
          {!address ? (
            <PideBilletera que="Para sumarte a esta junta o para arrancarla si la organizas tú." />
          ) : trabajando ? (
            <div className="k-tarjeta p-8">
              <p className="k-meta">{trabajando.toUpperCase()}</p>
            </div>
          ) : soyCreador ? (
            <div className="k-tarjeta p-8">
              <p className="k-rotulo mb-4">Tú organizas esta junta</p>
              <p className="mb-5 max-w-2xl leading-relaxed text-[--color-marfil]">
                Reparte el enlace y espera. Cuando estén todas las personas que quieres adentro, arranca la junta: ahí
                empieza el primer ciclo y las cuotas.
              </p>
              {/* El aviso va antes del botón y no después: una vez firmado ya no hay marcha
                  atrás, y explicar el porqué recién en la pantalla siguiente sería tarde. */}
              <p className="mb-6 max-w-2xl border-l-2 border-[--color-oro] pl-4 text-sm leading-relaxed text-[--color-gris]">
                Al arrancar, <span className="text-[--color-marfil]">la lista se congela</span> y ya no entra nadie más.
                No es una traba que quede por resolver: una junta dura tantos ciclos como miembros tiene, así que sumar
                a alguien después le cambiaría el trato a todos los demás —más ciclos por pagar y otro turno del que
                creían tener—, y el historial que ya vivieron dejaría de significar lo que decía.
              </p>
              <button
                className="k-boton"
                onClick={() => escribir("arrancar", "Arrancando la junta…")}
                disabled={!puedeArrancar}
              >
                Arrancar la junta
              </button>
              {!puedeArrancar && (
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-[--color-gris]">
                  Por ahora estás tú y nadie más. Una junta necesita al menos dos personas para que haya algo que rotar:
                  comparte el enlace y vuelve cuando alguien haya entrado.
                </p>
              )}
            </div>
          ) : soyMiembro ? (
            <div className="k-tarjeta p-8">
              <p className="k-voz mb-2 text-lg">Ya estás dentro</p>
              <p className="max-w-2xl leading-relaxed text-[--color-gris]">
                Entraste {miTurno}º, así que ese es el turno en el que cobrarás el pozo. Ahora falta que quien organiza
                la junta la arranque; hasta entonces no hay nada que pagar ni nada que hacer.
              </p>
            </div>
          ) : (
            <div className="k-tarjeta p-8">
              <p className="k-voz mb-2 text-lg">Todavía no estás en esta junta</p>
              <p className="mb-6 max-w-2xl leading-relaxed text-[--color-gris]">
                Si entras ahora te toca el {miembros.length + 1}º turno. Sumarte no mueve dinero y es una sola firma: la
                primera cuota se paga cuando la junta arranque, no antes.
              </p>
              <button className="k-boton" onClick={() => escribir("unirse", "Sumándote a la junta…")}>
                Unirme a esta junta
              </button>
            </div>
          )}

          {/* ── Invitar ──────────────────────────────────────────────────────────── */}
          <EnlaceParaInvitar juntaId={id} />
        </div>

        {/* ── La junta de un vistazo ─────────────────────────────────────────────── */}
        <aside className="flex flex-col gap-6">
          <div className="k-tarjeta flex flex-col items-center gap-5 p-8">
            <RuedaDeJunta miembros={miembros.length} turnosCobrados={0} size={150} />
            <p className="text-center text-sm leading-relaxed text-[--color-gris]">
              Cada punto es alguien que ya entró. Todos en contorno: la junta no ha empezado, así que nadie ha cobrado.
            </p>
          </div>

          <div className="k-tarjeta flex flex-col gap-5 p-6">
            <p className="k-rotulo">Cómo quedó pactada</p>
            <Dato termino="Personas dentro" valor={String(miembros.length)} />
            <Dato termino="Pondrá cada uno" valor={cuota !== undefined ? `${mUSDC(cuota)} mUSDC` : "—"} />
            <Dato termino="Cada cuánto" valor={periodo !== undefined ? enPalabras(Number(periodo)) : "—"} />
            <Dato
              termino="Recibirá quien cobre"
              valor={cuota !== undefined ? `${mUSDC(cuota * BigInt(miembros.length))} mUSDC` : "—"}
              destacado
            />
            {/* La cuota y el período ya están escritos en la cadena; el pozo todavía no,
                porque depende de cuánta gente termine entrando. */}
            <p className="text-sm leading-relaxed text-[--color-gris]">
              Si entra alguien más, el pozo crece y la junta dura un ciclo más. La cuota y el período ya no cambian.
            </p>
          </div>

          {/* El mismo aviso que se da al crearla, porque es el mismo hecho y este es el
              último momento en que todavía se puede arreglar: después de arrancar, el tamaño
              del grupo ya no se toca. */}
          {miembros.length < 3 && (
            <div className="k-tarjeta p-6">
              <p className="k-rotulo mb-3">Así no dará crédito</p>
              <p className="text-sm leading-relaxed text-[--color-gris]">
                Una junta dura tantos ciclos como miembros tiene, y el fondo exige tres ciclos de historial antes de
                prestarle a nadie. Con {miembros.length} nunca se llega. Todavía hay tiempo: si entra alguien más antes
                de arrancar, la junta sí construye reputación.
              </p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
};

/**
 * El enlace de la junta, listo para pegarlo en un chat.
 *
 * Se arma después de montar y no durante el render porque el servidor no sabe con qué dominio
 * te llegó la página: escribirlo directamente daría una diferencia entre lo que se renderiza
 * allá y lo que ve el navegador, y React reemplazaría el texto a la vista del usuario.
 */
const EnlaceParaInvitar = ({ juntaId }: { juntaId: number }) => {
  const [enlace, setEnlace] = useState("");
  const { copyToClipboard, isCopiedToClipboard } = useCopyToClipboard();

  useEffect(() => setEnlace(`${window.location.origin}/junta/${juntaId}`), [juntaId]);

  return (
    <div className="k-tarjeta p-8">
      <p className="k-rotulo mb-4">Invitar</p>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-[--color-gris]">
        Mándale este enlace a quien quieras que entre. Quien lo abra se suma solo, así que no necesitas pedirle su
        dirección ni escribirla sin equivocarte.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          className={`${CAMPO_ENLACE} k-prueba`}
          value={enlace}
          readOnly
          aria-label="Enlace de esta junta"
          onFocus={e => e.target.select()}
        />
        <button className="k-boton-borde shrink-0" onClick={() => copyToClipboard(enlace)} disabled={enlace === ""}>
          {isCopiedToClipboard ? "Copiado" : "Copiar enlace"}
        </button>
      </div>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[--color-gris]">
        Cada persona que entre ocupa el siguiente turno, en el orden en que llegue.
      </p>
    </div>
  );
};
