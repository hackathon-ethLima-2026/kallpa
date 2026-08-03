"use client";

/**
 * Fondear el Pool: la pantalla de quien pone el capital.
 *
 * Es el otro lado del producto y responde a un actor distinto del resto de la aplicación.
 * Aquí no entra una miembra a pagar su cuota: entra alguien —una cooperativa, una fintech,
 * una ONG— que quiere colocar dinero contra comportamiento verificable en lugar de contra un
 * aval o una garantía.
 *
 * Sin esta pantalla el recorrido no cierra: el crédito se aprueba y falla al transferir,
 * porque el fondo está vacío.
 */

import { useState } from "react";
import type { NextPage } from "next";
import Link from "next/link";
import { useAccount } from "wagmi";
import { mUSDC } from "~~/components/kallpa/cifras";
import { Dato } from "~~/components/kallpa/Dato";
import { BotonConseguirFondos, TuSaldo } from "~~/components/kallpa/Fondos";
import { Cargando, Marco, PideBilletera, Titulo } from "~~/components/kallpa/Marco";
import { useDeployedContractInfo, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

/** Acepta coma o punto y hasta seis decimales, que es la precisión del token. */
const MONTO_VALIDO = /^\d+([.,]\d{1,6})?$/;

/** Convierte lo escrito a unidades base sin pasar por coma flotante. */
function aUnidades(texto: string): bigint | null {
  const limpio = texto.trim().replace(",", ".");
  if (!MONTO_VALIDO.test(limpio)) return null;
  const [entera, decimal = ""] = limpio.split(".");
  return BigInt(entera + decimal.padEnd(6, "0"));
}

const Fondear: NextPage = () => {
  const { address } = useAccount();
  const [monto, setMonto] = useState("1000");
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: pool } = useDeployedContractInfo({ contractName: "pool" });
  const { data: estado, refetch: releerEstado } = useScaffoldReadContract({
    contractName: "pool",
    functionName: "liquidityStatus",
  });
  const { data: saldo, refetch: releerSaldo } = useScaffoldReadContract({
    contractName: "mock_usdc",
    functionName: "balanceOf",
    args: [address],
  });

  const { writeContractAsync: escribirToken } = useScaffoldWriteContract({
    contractName: "mock_usdc",
  });
  const { writeContractAsync: escribirPool } = useScaffoldWriteContract({ contractName: "pool" });

  const liquidez = estado?.[0] as bigint | undefined;
  const prestado = estado?.[1] as bigint | undefined;
  const disponible = estado?.[2] as bigint | undefined;

  const enUnidades = aUnidades(monto);
  const miSaldo = saldo as bigint | undefined;

  const aportar = async () => {
    setError(null);
    if (enUnidades === null || enUnidades === 0n) {
      setError("Escribe un monto válido, por ejemplo 1000 o 1000.50");
      return;
    }
    if (miSaldo !== undefined && enUnidades > miSaldo) {
      setError(`No te alcanza: tienes ${mUSDC(miSaldo)} mUSDC y quieres aportar ${mUSDC(enUnidades)}.`);
      return;
    }
    if (!pool?.address) return;

    try {
      // El token exige autorizar antes de que otro contrato pueda cobrarle. Son dos
      // transacciones y la pantalla lo dice en vez de esconderlo.
      setTrabajando("Paso 1 de 2 · Autorizando al fondo…");
      await escribirToken({ functionName: "approve", args: [pool.address, enUnidades] });
      setTrabajando("Paso 2 de 2 · Aportando al fondo…");
      await escribirPool({ functionName: "depositLiquidity", args: [enUnidades] });
      await Promise.all([releerEstado(), releerSaldo()]);
      setMonto("");
    } catch (e) {
      setError("La transacción no se completó. Revisa tu billetera e inténtalo otra vez.");
      console.error(e);
    } finally {
      setTrabajando(null);
    }
  };

  return (
    <Marco>
      <Titulo
        rotulo="Fondear el crédito"
        titulo="Presta contra comportamiento, no contra un aval"
        bajada={
          <>
            El fondo no conoce a nadie: cuando alguien pide un préstamo,{" "}
            <span className="text-[--color-oro]">recomputa su historial en ese instante</span> y decide solo.
          </>
        }
      />

      {!address ? (
        <PideBilletera que="Para aportar al fondo de crédito." />
      ) : !estado ? (
        <Cargando que="Leyendo el fondo" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-6">
            {/* ── Estado del fondo ──────────────────────────────────────────────── */}
            <div className="k-tarjeta p-8">
              <p className="k-rotulo mb-5">El fondo ahora mismo</p>
              <div className="grid grid-cols-3 gap-6">
                <Dato termino="Aportado" valor={`${mUSDC(liquidez)}`} />
                <Dato termino="Prestado" valor={`${mUSDC(prestado)}`} />
                <Dato termino="Disponible" valor={`${mUSDC(disponible)}`} destacado />
              </div>
              <p className="mt-6 max-w-xl text-sm leading-relaxed text-[--color-gris]">
                Aquí la palabra <em className="k-corazon not-italic">solvencia</em> sí significa algo, a diferencia de
                lo que ocurre con una junta: el fondo presta, así que puede quedarse corto. Lo disponible baja cuando se
                coloca un préstamo y no vuelve a subir hasta que alguien lo devuelve.
              </p>
              {disponible === 0n && (
                <p className="mt-4 text-sm text-[--color-mal]">
                  El fondo está vacío: mientras nadie aporte, ningún préstamo puede concederse.
                </p>
              )}
            </div>

            {/* ── Aportar ──────────────────────────────────────────────────────── */}
            <div className="k-tarjeta p-8">
              <p className="k-rotulo mb-5">Aportar al fondo</p>

              <label className="mb-2 block text-sm text-[--color-gris]" htmlFor="monto">
                Cuánto quieres aportar, en mUSDC
              </label>
              <div className="flex flex-wrap gap-3">
                <input
                  id="monto"
                  value={monto}
                  onChange={e => setMonto(e.target.value)}
                  inputMode="decimal"
                  placeholder="1000"
                  className="k-prueba w-40 rounded-[4px] border border-[--color-linea] bg-[--color-noche] px-4 py-3 text-[--color-marfil] outline-none focus:border-[--color-oro]"
                />
                <button className="k-boton" onClick={aportar} disabled={!!trabajando}>
                  Aportar al fondo
                </button>
              </div>

              {trabajando && <p className="k-meta mt-4">{trabajando.toUpperCase()}</p>}
              {error && <p className="mt-4 text-sm text-[--color-mal]">{error}</p>}

              <p className="mt-5 text-sm leading-relaxed text-[--color-gris]">
                Aportar son dos confirmaciones: primero autorizas al fondo a cobrarte, y después el fondo recibe. Es
                como funciona cualquier token, y preferimos decírtelo antes que sorprenderte con una segunda ventana.
              </p>
            </div>
          </div>

          {/* ── Contexto ──────────────────────────────────────────────────────────── */}
          <aside className="flex flex-col gap-6">
            <TuSaldo mostrarBoton={false} />

            <div className="k-tarjeta p-6">
              <p className="k-rotulo mb-3">¿No tienes fondos?</p>
              <p className="mb-5 text-sm leading-relaxed text-[--color-gris]">
                Estamos en una red de pruebas, así que el token es de juguete y cualquiera puede acuñarlo.
              </p>
              <BotonConseguirFondos />
            </div>

            <div className="k-tarjeta p-6">
              <p className="k-rotulo mb-3">Cómo decide el fondo</p>
              <ul className="flex flex-col gap-3 text-sm leading-relaxed text-[--color-gris]">
                <li>
                  <span className="text-[--color-marfil]">Menos de 400</span> — sin crédito
                </li>
                <li>
                  <span className="text-[--color-marfil]">400 a 599</span> — hasta 50 mUSDC
                </li>
                <li>
                  <span className="text-[--color-marfil]">600 a 749</span> — hasta 120 mUSDC
                </li>
                <li>
                  <span className="text-[--color-marfil]">750 o más</span> — hasta 200 mUSDC
                </li>
              </ul>
              <p className="mt-5 text-sm leading-relaxed text-[--color-gris]">
                Además exige al menos tres ciclos de historial. Alguien recién llegado puntúa altísimo porque no hay
                nada malo que observar, y tratar eso como excelencia sería el error.
              </p>
            </div>

            <Link href="/pedir-credito" className="k-boton-borde text-center no-underline">
              Ver el crédito desde el otro lado
            </Link>
          </aside>
        </div>
      )}
    </Marco>
  );
};

export default Fondear;
