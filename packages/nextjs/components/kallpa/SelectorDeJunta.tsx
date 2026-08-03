"use client";

/**
 * Elegir de qué junta estamos hablando.
 *
 * Aparece en toda pantalla que mide algo por junta —el score y el crédito— porque el historial
 * no es una propiedad de la persona sino de su comportamiento dentro de un grupo concreto.
 * Alguien puede estar al día en una junta y deber tres cuotas en otra, y mezclarlas daría un
 * promedio que no describe a nadie.
 *
 * Cada botón lee su propio nombre en la cadena. Es una consulta de más por junta, y se paga a
 * propósito: el nombre vive en el contrato, así que cualquier aplicación que lo lea muestra el
 * mismo que ven sus miembros.
 */

import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

/** El nombre de una junta tal como está escrito en la cadena. */
export const useNombreDeJunta = (juntaId: number | undefined) => {
  const { data } = useScaffoldReadContract({
    contractName: "junta",
    functionName: "juntaNombre",
    args: [juntaId],
  });
  return (data as string | undefined) || undefined;
};

const BotonDeJunta = ({ juntaId, activa, alElegir }: { juntaId: number; activa: boolean; alElegir: () => void }) => {
  const nombre = useNombreDeJunta(juntaId);

  return (
    <button
      type="button"
      onClick={alElegir}
      aria-pressed={activa}
      className={`rounded-[4px] border px-4 py-2.5 text-sm transition-colors ${
        activa
          ? "border-[--color-oro] bg-[--color-carbon] text-[--color-oro]"
          : "border-[--color-linea] text-[--color-gris] hover:border-[--color-linea-viva] hover:text-[--color-marfil]"
      }`}
    >
      {nombre || `Junta #${juntaId}`}
    </button>
  );
};

/**
 * Con una sola junta no se muestra nada: un selector de una opción no es una elección, es
 * ruido que ocupa el lugar de la respuesta.
 */
export const SelectorDeJunta = ({
  ids,
  elegida,
  alElegir,
  rotulo,
  nota,
}: {
  ids: number[];
  elegida: number | undefined;
  alElegir: (id: number) => void;
  rotulo: string;
  nota?: string;
}) => {
  if (ids.length < 2) return null;

  return (
    <div>
      <p className="k-rotulo mb-3">{rotulo}</p>
      <div className="flex flex-wrap gap-2">
        {ids.map(id => (
          <BotonDeJunta key={id} juntaId={id} activa={id === elegida} alElegir={() => alElegir(id)} />
        ))}
      </div>
      {nota && <p className="mt-3 text-sm text-[--color-gris]">{nota}</p>}
    </div>
  );
};
