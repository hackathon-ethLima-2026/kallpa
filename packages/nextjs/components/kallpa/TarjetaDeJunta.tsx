"use client";

/**
 * La tarjeta de una junta, tal como la define el manual de marca.
 *
 * Los miembros son los puntos del isotipo: rellenos los que ya cobraron su turno, en
 * contorno los que esperan. El sistema gráfico no acompaña a la interfaz, *es* la interfaz —
 * de un vistazo se ve cuánto le queda de vida a la junta sin leer un solo número.
 *
 * Todo lo que muestra sale de la cadena. El nombre también: si viviera únicamente en el
 * frontend, cada aplicación que leyera este contrato mostraría algo distinto.
 */

import Link from "next/link";
import { RuedaDeJunta } from "~~/components/kallpa/Isotipo";
import { mUSDC } from "~~/components/kallpa/cifras";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

/** Cuánto falta para que venza el ciclo en curso, en palabras. */
function cuandoVence(inicio: bigint, periodo: bigint, ciclo: number, total: number) {
  if (ciclo >= total) return "junta terminada";
  const vence = Number(inicio) + (ciclo + 1) * Number(periodo);
  const faltan = vence - Math.floor(Date.now() / 1000);
  if (faltan <= 0) return "vencido";
  if (faltan < 90) return `vence en ${faltan}s`;
  if (faltan < 5400) return `vence en ${Math.round(faltan / 60)} min`;
  if (faltan < 172800) return `vence en ${Math.round(faltan / 3600)} h`;
  return `vence en ${Math.round(faltan / 86400)} días`;
}

export const TarjetaDeJunta = ({ juntaId, miembro }: { juntaId: number; miembro?: string }) => {
  // El nombre va aparte de los parámetros: mezclar un texto con valores de tamaño fijo en
  // un mismo retorno produce una interfaz que no describe los bytes reales del contrato.
  const { data: nombre } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "juntaNombre",
    args: [juntaId],
  });

  const { data: info } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "juntaParams",
    args: [juntaId],
  });

  const { data: estado } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "juntaState",
    args: [juntaId],
  });

  const { data: miEstado } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "memberState",
    args: [juntaId, miembro],
  });

  const cuota = info?.[0] as bigint | undefined;
  const periodo = info?.[1] as bigint | undefined;
  const inicio = info?.[2] as bigint | undefined;
  const totalMiembros = info?.[3];
  const [pozo, ciclo, turno] = estado ?? [];
  const [, , miTurno, yaCobro, debe] = miEstado ?? [];

  if (!info || !estado) {
    return <div className="k-tarjeta h-56 animate-pulse" />;
  }

  const miembros = Number(totalMiembros ?? 0);
  const cicloActual = Number(ciclo ?? 0);
  const terminada = cicloActual >= miembros;
  const debeCuotas = Number(debe ?? 0);

  return (
    <Link href={`/junta/${juntaId}`} className="no-underline">
      <div className="k-tarjeta-honda flex h-full flex-col gap-5 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="k-voz text-xl font-bold text-[--color-marfil]">{nombre || `Junta #${juntaId}`}</h3>
            <p className="k-meta mt-1">{terminada ? "COMPLETA" : `CICLO ${cicloActual + 1} DE ${miembros}`}</p>
          </div>
          <RuedaDeJunta miembros={miembros} turnosCobrados={Number(turno ?? 0)} size={56} className="shrink-0" />
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <span className="k-prueba text-[15px] text-[--color-oro]">{mUSDC(cuota)} mUSDC / cuota</span>
          <span className="k-prueba text-xs text-[--color-gris]">
            {inicio !== undefined && periodo !== undefined ? cuandoVence(inicio, periodo, cicloActual, miembros) : ""}
          </span>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[--color-linea] pt-4">
          {debeCuotas > 0 ? (
            <span className="k-tag border-[--color-mal] text-[--color-mal]">
              debes {debeCuotas} {debeCuotas === 1 ? "cuota" : "cuotas"}
            </span>
          ) : (
            <span className="k-tag border-[--color-oro] text-[--color-oro]">al día</span>
          )}
          {yaCobro && <span className="k-tag">ya cobraste</span>}
          {!yaCobro && miTurno !== undefined && Number(miTurno) < miembros && (
            <span className="k-tag">tu turno: {Number(miTurno) + 1}º</span>
          )}
          <span className="k-prueba ml-auto text-xs text-[--color-gris]">pozo {mUSDC(pozo)}</span>
        </div>
      </div>
    </Link>
  );
};
