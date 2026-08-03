/**
 * Formato de las cifras que salen de la cadena.
 *
 * Vive aparte porque el error está a un dígito de distancia: mUSDC guarda seis decimales, no
 * dieciocho. Una copia desincronizada de esta función mostraría el mismo pozo con dos montos
 * distintos en dos pantallas contiguas, y en un producto cuya promesa es "puedes verificarlo"
 * eso no es un detalle de formato: es una contradicción a la vista.
 */

/** Un monto en mUSDC, que el contrato guarda en unidades de una millonésima. */
export const mUSDC = (v: bigint | undefined) =>
  v === undefined ? "—" : (Number(v) / 1e6).toLocaleString("es-PE", { maximumFractionDigits: 2 });
