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

/**
 * Una duración en palabras, eligiendo la unidad más grande que dé exacta.
 *
 * El contrato guarda el período en segundos porque es lo único que el reloj de la cadena sabe
 * contar; nadie piensa en 604800. La conversión vive aquí, junto al resto de los formatos,
 * porque la usan la pantalla de crear una junta y la de su convocatoria: dos copias podrían
 * llamar "1 semana" y "7 días" al mismo número en pantallas contiguas.
 */
export const enPalabras = (segundos: number) => {
  const unidades: [number, string, string][] = [
    [2_592_000, "mes", "meses"],
    [604_800, "semana", "semanas"],
    [86_400, "día", "días"],
    [3_600, "hora", "horas"],
    [60, "minuto", "minutos"],
  ];
  for (const [tamano, singular, plural] of unidades) {
    if (segundos >= tamano && segundos % tamano === 0) {
      const cuantos = segundos / tamano;
      return `${cuantos} ${cuantos === 1 ? singular : plural}`;
    }
  }
  return `${segundos} segundos`;
};
