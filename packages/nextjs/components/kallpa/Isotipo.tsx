/**
 * El isotipo de Kallpa y su uso como interfaz.
 *
 * La geometría no es aproximada: ocho puntos en incrementos de 45° partiendo de −90°, con
 * diámetro igual al 22% del radio, y un rombo que es un cuadrado girado con lado al 62% del
 * radio. El manual de marca es explícito en que nada está "a ojo", así que aquí se calcula
 * en vez de copiarse.
 *
 * El rombo va partido en dos oros —andino y profundo— para que parezca una moneda recibiendo
 * luz. Es la única licencia del sistema.
 *
 * Y la idea que convierte al logo en producto, tomada literal del manual: *los miembros son
 * puntos del isotipo, rellenos los que ya cobraron y en contorno los que esperan turno*. El
 * mismo dibujo que identifica a la marca muestra el estado de una junta de un vistazo.
 */

const RADIO = 100;
const RADIO_PUNTO = 11; // 22% del radio, como manda el manual
const MEDIA_DIAGONAL = 43.84; // lado del rombo = 62% del radio

/** Las ocho posiciones, en el orden de los turnos: arriba y en sentido horario. */
function posiciones() {
  return Array.from({ length: 8 }, (_, i) => {
    const angulo = ((-90 + i * 45) * Math.PI) / 180;
    return {
      cx: +(RADIO * Math.cos(angulo)).toFixed(2),
      cy: +(RADIO * Math.sin(angulo)).toFixed(2),
    };
  });
}

type IsotipoProps = {
  /** Tamaño en píxeles. Por debajo de 24 el manual pide la versión plana. */
  size?: number;
  /** Plano en un solo color, para monocromo o tamaños diminutos. */
  mono?: string;
  className?: string;
};

export const Isotipo = ({ size = 32, mono, className }: IsotipoProps) => {
  const puntos = posiciones();
  const plano = mono !== undefined || size < 24;
  const colorPunto = mono ?? "#F0B429";

  return (
    <svg viewBox="-130 -130 260 260" width={size} height={size} className={className} aria-hidden="true">
      {plano ? (
        <polygon
          points={`0,-${MEDIA_DIAGONAL} ${MEDIA_DIAGONAL},0 0,${MEDIA_DIAGONAL} -${MEDIA_DIAGONAL},0`}
          fill={colorPunto}
        />
      ) : (
        <>
          <polygon points={`0,-${MEDIA_DIAGONAL} -${MEDIA_DIAGONAL},0 0,${MEDIA_DIAGONAL}`} fill="#F0B429" />
          <polygon points={`0,-${MEDIA_DIAGONAL} ${MEDIA_DIAGONAL},0 0,${MEDIA_DIAGONAL}`} fill="#C98F1B" />
        </>
      )}
      <g fill={colorPunto}>
        {puntos.map((p, i) => (
          <circle key={i} cx={p.cx} cy={p.cy} r={size < 24 ? 14 : RADIO_PUNTO} />
        ))}
      </g>
    </svg>
  );
};

type RuedaProps = {
  /** Cuántos miembros tiene la junta. Con ocho, cada uno ocupa un punto del isotipo. */
  miembros: number;
  /** Cuántos turnos ya se repartieron: esos puntos van rellenos. */
  turnosCobrados: number;
  size?: number;
  className?: string;
};

/**
 * La junta dibujada como el propio isotipo.
 *
 * Los puntos rellenos son los miembros que ya cobraron su turno; los de contorno, los que
 * esperan. Cuando la rueda se completa, la junta terminó y su historial queda congelado.
 *
 * Si la junta no tiene ocho miembros, se dibujan los que haya repartidos por la
 * circunferencia: el sistema gráfico se adapta al grupo real y no al revés.
 */
export const RuedaDeJunta = ({ miembros, turnosCobrados, size = 200, className }: RuedaProps) => {
  const total = Math.max(1, miembros);
  const puntos = Array.from({ length: total }, (_, i) => {
    const angulo = ((-90 + (i * 360) / total) * Math.PI) / 180;
    return {
      cx: +(RADIO * Math.cos(angulo)).toFixed(2),
      cy: +(RADIO * Math.sin(angulo)).toFixed(2),
      cobrado: i < turnosCobrados,
    };
  });

  return (
    <svg
      viewBox="-130 -130 260 260"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`Junta de ${total} miembros, ${turnosCobrados} ya cobraron su turno`}
    >
      {/* La retícula de construcción, tenue: recuerda que la forma está calculada. */}
      <g stroke="#223046" strokeWidth="0.8" fill="none">
        <circle cx="0" cy="0" r={RADIO} strokeDasharray="4 4" />
      </g>
      <polygon points={`0,-${MEDIA_DIAGONAL} -${MEDIA_DIAGONAL},0 0,${MEDIA_DIAGONAL}`} fill="#F0B429" />
      <polygon points={`0,-${MEDIA_DIAGONAL} ${MEDIA_DIAGONAL},0 0,${MEDIA_DIAGONAL}`} fill="#C98F1B" />
      {puntos.map((p, i) => (
        <circle
          key={i}
          cx={p.cx}
          cy={p.cy}
          r={RADIO_PUNTO}
          fill={p.cobrado ? "#F0B429" : "none"}
          stroke="#F0B429"
          strokeWidth={p.cobrado ? 0 : 2.5}
        />
      ))}
    </svg>
  );
};

/** La marca completa: isotipo más nombre. */
export const Marca = ({ size = 24 }: { size?: number }) => (
  <div className="flex items-center gap-3">
    <Isotipo size={size} />
    <span className="k-voz font-bold tracking-[0.22em] text-[13px]">KALLPA</span>
  </div>
);
