"use client";

/**
 * El detalle de una junta, que son dos pantallas y no una.
 *
 * Una junta nace en convocatoria —existe, tiene nombre y cuota, pero todavía reúne a su
 * gente— y solo después arranca. Son dos momentos con datos distintos: antes de arrancar no
 * existen cuotas pagadas, ni turnos, ni pozo, y el reloj de la junta ni siquiera ha empezado
 * a correr. Por eso esta página no mezcla ambos estados en una sola vista llena de "todavía
 * no": lee los parámetros, decide en cuál de las dos fases está la junta y entrega la
 * pantalla que corresponde, sin pedirle a la cadena datos que en esa fase no significan nada.
 *
 * `startAt` es la única bandera que distingue las dos fases: mientras valga cero, la junta no
 * ha arrancado. No hay un segundo indicador que pueda contradecirlo.
 */

import { use } from "react";
import Link from "next/link";
import { Convocatoria } from "./_components/Convocatoria";
import { JuntaEnMarcha } from "./_components/JuntaEnMarcha";
import { Cargando, Marco, Vacio } from "~~/components/kallpa/Marco";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

export default function DetalleDeJunta({ params }: { params: Promise<{ juntaId: string }> }) {
  const { juntaId } = use(params);
  const id = Number(juntaId);

  // El nombre va aparte de los parámetros: mezclar un texto con valores de tamaño fijo en un
  // mismo retorno produce una interfaz que no describe los bytes reales del contrato.
  const { data: nombre } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "juntaNombre",
    args: [id],
  });
  const { data: info, refetch: releerJunta } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "juntaParams",
    args: [id],
  });

  if (!info) {
    return (
      <Marco>
        <Cargando />
      </Marco>
    );
  }

  const cuota = info[0] as bigint;
  const periodo = info[1] as bigint;
  const arrancoEn = info[2] as bigint;
  const totalMiembros = Number(info[3] ?? 0);
  const existe = info[4] as boolean;

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

  return (
    <Marco>
      {arrancoEn === 0n ? (
        <Convocatoria
          id={id}
          nombre={nombre as string | undefined}
          cuota={cuota}
          periodo={periodo}
          releerJunta={() => void releerJunta()}
        />
      ) : (
        <JuntaEnMarcha id={id} nombre={nombre as string | undefined} cuota={cuota} miembros={totalMiembros} />
      )}
    </Marco>
  );
}
