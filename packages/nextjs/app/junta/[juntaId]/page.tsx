"use client";

/**
 * El detalle de una junta: lo que un miembro hace de verdad, no lo que se le muestra.
 *
 * Aquí ocurre la única acción que mueve dinero desde el lado del usuario —pagar la cuota— y
 * por eso es donde más fácil se rompe la experiencia. Un token exige autorizar antes de que
 * un contrato pueda cobrar, así que pagar son dos transacciones y no una. En vez de esconder
 * ese detalle o mostrar dos botones sin explicación, la pantalla lo dice: primero autorizas
 * una vez, después pagas las veces que haga falta.
 */

import { use, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { Dato } from "~~/components/kallpa/Dato";
import { RuedaDeJunta } from "~~/components/kallpa/Isotipo";
import { BotonConseguirFondos } from "~~/components/kallpa/Fondos";
import { Cargando, Marco, PideBilletera, Titulo, Vacio } from "~~/components/kallpa/Marco";
import { mUSDC } from "~~/components/kallpa/cifras";
import { Address } from "~~/components/scaffold-eth";
import { useDeployedContractInfo, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

export default function DetalleDeJunta({ params }: { params: Promise<{ juntaId: string }> }) {
  const { juntaId } = use(params);
  const id = Number(juntaId);
  const { address } = useAccount();
  const [trabajando, setTrabajando] = useState<string | null>(null);

  const { data: nombre } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "juntaNombre",
    args: [id],
  });
  const { data: info } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "juntaParams",
    args: [id],
  });
  const { data: estado, refetch: releerEstado } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "juntaState",
    args: [id],
  });
  const { data: miEstado, refetch: releerMiEstado } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "memberState",
    args: [id, address],
  });
  const { data: listaMiembros } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "miembros",
    args: [id],
  });
  // Quien va a cobrarte es el contrato de la junta, así que es a él a quien hay que autorizar.
  // Antes esto leía `junta.token()`, que devuelve la dirección del mUSDC: el permiso quedaba a
  // nombre del propio token y pagar la cuota reventaba por autorización insuficiente.
  const { data: contratoJunta } = useDeployedContractInfo({ contractName: "junta" });
  const { data: saldo } = useScaffoldReadContract({
    contractName: "mock_usdc",
    functionName: "balanceOf",
    args: [address],
  });

  const { writeContractAsync: escribirJunta } = useScaffoldWriteContract({ contractName: "junta" });
  const { writeContractAsync: escribirToken } = useScaffoldWriteContract({
    contractName: "mock_usdc",
  });

  const cuota = info?.[0] as bigint | undefined;
  const totalMiembros = info?.[3];
  const existe = info?.[4];
  const [pozo, ciclo, turno] = estado ?? [];
  const [esMiembro, cuotasPagadas, miTurno, yaCobro, debe] = miEstado ?? [];

  if (!info) return <Marco><Cargando /></Marco>;
  if (!existe) {
    return (
      <Marco>
        <Vacio
          titulo="Esta junta no existe"
          detalle={`El contrato no tiene ninguna junta con el número ${juntaId}.`}
          accion={
            <Link href="/" className="k-boton no-underline">
              Volver a mis juntas
            </Link>
          }
        />
      </Marco>
    );
  }

  const miembros = Number(totalMiembros ?? 0);
  const cicloActual = Number(ciclo ?? 0);
  const turnoActual = Number(turno ?? 0);
  /**
   * Una junta termina cuando **todos cobraron su turno**, no cuando se acaba el tiempo.
   *
   * Es la misma regla del contrato: `distribute` solo rechaza con `JuntaCompleta` cuando
   * `turno >= miembros`, y `deposit` solo rechaza cuando ya pagaste todas tus cuotas. El
   * reloj puede adelantarse a los turnos —es exactamente lo que ocurre cuando alguien paga
   * tarde— y confundir esas dos cosas dejaba la junta muerta en la pantalla: se anunciaba
   * terminada, se escondía el botón de pagar y el de cobrar, mientras el contrato aceptaba
   * ambas operaciones sin problema.
   */
  const terminada = turnoActual >= miembros;
  /** Vencieron todos los ciclos y aún quedan turnos por cobrar: la junta sigue viva. */
  const plazoVencido = cicloActual >= miembros && !terminada;
  const meTocaCobrar = Number(miTurno ?? -1) === turnoActual && !terminada;
  const puedeRepartir = cicloActual > turnoActual && turnoActual < miembros;
  const saldoInsuficiente = saldo !== undefined && cuota !== undefined && saldo < cuota;

  /**
   * Autorizar y pagar. El token exige lo primero antes de permitir lo segundo, así que se
   * autoriza un margen amplio de una sola vez para que las cuotas siguientes sean un solo
   * paso en lugar de dos.
   */
  const pagarCuota = async () => {
    if (!cuota || !contratoJunta?.address) return;
    try {
      setTrabajando("Paso 1 de 2 · Autorizando al contrato…");
      await escribirToken({
        functionName: "approve",
        args: [contratoJunta.address, cuota * 24n],
      });
      setTrabajando("Paso 2 de 2 · Pagando la cuota…");
      await escribirJunta({ functionName: "deposit", args: [id] });
      await Promise.all([releerEstado(), releerMiEstado()]);
    } finally {
      setTrabajando(null);
    }
  };

  const cobrarTurno = async () => {
    try {
      setTrabajando("Cobrando el pozo…");
      await escribirJunta({ functionName: "distribute", args: [id] });
      await Promise.all([releerEstado(), releerMiEstado()]);
    } finally {
      setTrabajando(null);
    }
  };

  return (
    <Marco>
      <Titulo
        rotulo={`Junta #${juntaId}`}
        titulo={(nombre as string) || `Junta #${juntaId}`}
        bajada={
          terminada ? (
            <>
              Esta junta ya <span className="text-[--color-oro]">terminó</span>: todos cobraron
              su turno y su historial quedó fijo para siempre.
            </>
          ) : plazoVencido ? (
            <>
              Ya vencieron los {miembros} ciclos y todavía falta{miembros - turnoActual === 1 ? "" : "n"}{" "}
              <span className="text-[--color-oro]">
                {miembros - turnoActual} turno{miembros - turnoActual === 1 ? "" : "s"}
              </span>{" "}
              por cobrar. Lo que se deba a estas alturas ya cuenta como atraso.
            </>
          ) : (
            <>
              Ciclo {cicloActual + 1} de {miembros}.{" "}
              <span className="text-[--color-oro]">{mUSDC(cuota)} mUSDC</span> por cuota.
            </>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          {/* ── Lo que te toca hacer ─────────────────────────────────────────────── */}
          {!address ? (
            <PideBilletera que="Para pagar tu cuota o cobrar tu turno." />
          ) : !esMiembro ? (
            <div className="k-tarjeta p-8">
              <p className="k-voz mb-2 text-lg">No perteneces a esta junta</p>
              <p className="text-[--color-gris]">
                Puedes mirar su estado y auditarla, pero solo sus miembros pueden aportar. Los
                miembros se definen al crear la junta, igual que en una de verdad.
              </p>
            </div>
          ) : (
            <div className="k-tarjeta p-8">
              <p className="k-rotulo mb-4">Tu situación</p>
              <div className="mb-6 grid grid-cols-2 gap-6 sm:grid-cols-3">
                <Dato termino="Cuotas pagadas" valor={`${Number(cuotasPagadas ?? 0)} de ${miembros}`} />
                <Dato
                  termino="Tu turno"
                  valor={yaCobro ? "ya cobraste" : `${Number(miTurno ?? 0) + 1}º`}
                />
                <Dato
                  termino="Debes"
                  valor={Number(debe ?? 0) === 0 ? "nada" : `${Number(debe)} cuotas`}
                  alerta={Number(debe ?? 0) > 0}
                />
              </div>

              {trabajando ? (
                <p className="k-meta">{trabajando.toUpperCase()}</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {!terminada && (
                    <button
                      className="k-boton"
                      onClick={pagarCuota}
                      disabled={saldoInsuficiente || Number(cuotasPagadas ?? 0) >= miembros}
                    >
                      Pagar mi cuota
                    </button>
                  )}
                  {meTocaCobrar && puedeRepartir && (
                    <button className="k-boton-borde" onClick={cobrarTurno}>
                      Cobrar mi turno
                    </button>
                  )}
                </div>
              )}

              {!terminada && !trabajando && Number(cuotasPagadas ?? 0) < miembros && (
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-[--color-gris]">
                  Tu billetera te va a pedir firmar <span className="text-[--color-marfil]">dos veces</span>: primero
                  autorizas al contrato a cobrarte, y recién después se paga la cuota. Así funciona este token, y
                  preferimos decírtelo a que te sorprenda.
                </p>
              )}

              {saldoInsuficiente && !trabajando && (
                <div className="mt-5 border-t border-[--color-linea] pt-5">
                  <p className="mb-4 text-sm text-[--color-mal]">
                    No te alcanza el saldo: tienes {mUSDC(saldo)} mUSDC y la cuota es{" "}
                    {mUSDC(cuota)}.
                  </p>
                  {/* La salida va aquí mismo y no en otra pantalla: quedarse sin fondos a un
                      paso de pagar es el momento en que más fácil se abandona. */}
                  <BotonConseguirFondos />
                </div>
              )}
              {Number(cuotasPagadas ?? 0) >= miembros && (
                <p className="mt-4 text-sm text-[--color-gris]">
                  Ya pagaste todas tus cuotas de esta junta. No hay nada pendiente.
                </p>
              )}
            </div>
          )}

          {/* ── Quiénes son ──────────────────────────────────────────────────────── */}
          <div className="k-tarjeta p-8">
            <p className="k-rotulo mb-4">Miembros y turnos</p>
            <ul className="flex flex-col gap-1">
              {(listaMiembros ?? []).map((m, i) => {
                const cobro = i < turnoActual;
                const leToca = i === turnoActual && !terminada;
                return (
                  <li
                    key={m}
                    className={`flex items-center justify-between gap-3 rounded-[4px] px-3 py-2.5 ${
                      leToca ? "bg-[--color-noche]" : ""
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className="inline-block h-3 w-3 shrink-0 rounded-full"
                        style={{
                          background: cobro ? "#F0B429" : "transparent",
                          border: cobro ? "none" : "1.5px solid #F0B429",
                        }}
                      />
                      <Address address={m} size="sm" />
                    </span>
                    <span className="k-prueba text-xs text-[--color-gris]">
                      {cobro ? "cobró" : leToca ? "le toca" : `turno ${i + 1}º`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* ── La junta de un vistazo ─────────────────────────────────────────────── */}
        <aside className="flex flex-col gap-6">
          <div className="k-tarjeta flex flex-col items-center gap-5 p-8">
            <RuedaDeJunta miembros={miembros} turnosCobrados={turnoActual} size={150} />
            <p className="text-center text-sm leading-relaxed text-[--color-gris]">
              Cada punto es un miembro. Relleno, ya cobró; en contorno, espera su turno.
            </p>
          </div>

          <div className="k-tarjeta p-6">
            <Dato termino="En el pozo" valor={`${mUSDC(pozo)} mUSDC`} />
            <div className="mt-5">
              <Dato termino="Turnos repartidos" valor={`${turnoActual} de ${miembros}`} />
            </div>
          </div>

          <Link href={`/auditar/${juntaId}`} className="k-boton-borde text-center no-underline">
            Auditar esta junta
          </Link>
        </aside>
      </div>
    </Marco>
  );
}
