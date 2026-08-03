/**
 * Un dato de la cadena: su nombre arriba, su valor abajo.
 *
 * El valor siempre va en monoespaciada, y eso no es una preferencia estética. La regla del
 * manual es literal —"si está en mono, está on-chain"— así que la tipografía es la que promete
 * que ese número se puede ir a comprobar. Por eso este componente no acepta apagar la mono:
 * si un dato no viene de la cadena, no es un Dato.
 */

export const Dato = ({
  termino,
  valor,
  destacado,
  alerta,
}: {
  termino: string;
  valor: string;
  /** Oro: la cifra que la pantalla vino a responder. Una por bloque, o deja de destacar. */
  destacado?: boolean;
  /** Rojo: algo que el usuario debe corregir. Manda sobre destacado. */
  alerta?: boolean;
}) => (
  <div>
    <p className="k-meta mb-1">{termino.toUpperCase()}</p>
    <p
      className={`k-prueba text-lg ${
        alerta ? "text-[--color-mal]" : destacado ? "text-[--color-oro]" : "text-[--color-marfil]"
      }`}
    >
      {valor}
    </p>
  </div>
);
