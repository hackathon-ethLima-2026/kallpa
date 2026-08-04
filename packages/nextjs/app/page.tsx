"use client";

/**
 * La portada: las juntas a las que perteneces.
 *
 * Es la primera pregunta que se hace cualquiera al abrir la aplicación, y hasta hace poco el
 * contrato no sabía responderla: había que recorrer todas las juntas existentes preguntando
 * una por una si estabas en ella. Ahora el contrato mantiene el índice y esta pantalla es una
 * sola lectura.
 */

import type { NextPage } from "next";
import Link from "next/link";
import { useAccount } from "wagmi";
import { Isotipo } from "~~/components/kallpa/Isotipo";
import { Cargando, Marco, PideBilletera, Titulo, Vacio } from "~~/components/kallpa/Marco";
import { TarjetaDeJunta } from "~~/components/kallpa/TarjetaDeJunta";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

const Portada: NextPage = () => {
  const { address } = useAccount();

  const { data: misJuntas, isLoading } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "juntasDe",
    args: [address],
  });

  const { data: totalJuntas } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "totalJuntas",
  });

  return (
    <Marco>
      <Titulo
        rotulo="Mis juntas"
        titulo="Tus juntas, custodiadas por el contrato"
        bajada={
          <>
            Nadie —ni siquiera nosotros— puede tocar el pozo.{" "}
            <span className="text-[--color-oro]">Solvencia probada, no prometida.</span>
          </>
        }
      />

      {!address ? (
        <PideBilletera que="Para ver tus juntas necesitamos saber quién eres." />
      ) : isLoading ? (
        <Cargando que="Buscando tus juntas" />
      ) : !misJuntas || misJuntas.length === 0 ? (
        <Vacio
          titulo="Todavía no estás en ninguna junta"
          detalle={
            "Puedes crear una y pasarle el enlace a tu grupo, o pedirle el suyo a quien organiza " +
            "la tuya. Se entra antes de que arranque: el día que arranca, la lista se cierra."
          }
          accion={
            <div className="flex flex-wrap gap-3">
              <Link href="/crear" className="k-boton no-underline">
                Crear una junta
              </Link>
              {Number(totalJuntas ?? 0) > 0 && (
                <Link href="/auditar/0" className="k-boton-borde no-underline">
                  Auditar una junta
                </Link>
              )}
            </div>
          }
        />
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2">
            {misJuntas.map(id => (
              <TarjetaDeJunta key={Number(id)} juntaId={Number(id)} miembro={address} />
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/crear" className="k-boton-borde no-underline">
              Crear otra junta
            </Link>
          </div>
        </>
      )}

      {/* Qué es esto, para quien llega sin contexto. */}
      <section className="mt-16 border-t border-[--color-linea] pt-12">
        <div className="grid gap-8 sm:grid-cols-3">
          <Explicacion
            titulo="El contrato custodia"
            texto="Cada cuota entra al contrato y solo sale por la regla del turno. No existe un retiro de administrador."
          />
          <Explicacion
            titulo="Tu puntualidad vale"
            texto="Un modelo de crédito corre dentro de Arbitrum y lee tu historial. El score no lo calcula nuestro servidor."
          />
          <Explicacion
            titulo="Cualquiera audita"
            texto="La contabilidad del contrato se compara con el saldo real del token. Si no cuadrara, se vería."
          />
        </div>
      </section>
    </Marco>
  );
};

const Explicacion = ({ titulo, texto }: { titulo: string; texto: string }) => (
  <div>
    <Isotipo size={22} className="mb-4" />
    <h3 className="k-voz mb-2 text-base font-bold">{titulo}</h3>
    <p className="text-sm leading-relaxed text-[--color-gris]">{texto}</p>
  </div>
);

export default Portada;
