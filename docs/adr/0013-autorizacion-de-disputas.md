---
status: accepted
---

# Reportar una disputa exige compartir la junta, y cada miembro reporta una sola vez

`report_dispute` solo la puede llamar un miembro de esa misma junta, nadie puede reportarse a
sí mismo, y cada reportante cuenta una única vez por reportado y por junta. El contrato guarda
la huella de quién reportó a quién y expone `ya_reporto` para que la interfaz lo sepa antes de
ofrecer el botón.

## Qué se podía hacer antes

La función validaba que la junta existiera y que el reportado fuera miembro. No validaba quién
llamaba. Cualquier dirección del mundo podía llamarla, contra cualquier miembro, tantas veces
como quisiera.

El daño está medido y no es teórico. `disputas_perdidas` pesa +1.8159 en el modelo sobre un
dominio que topa en 5, y el score reparte los log-odds sobre un ancho de 12 (ADR-0012): cada
reporte cuesta unos **30 puntos** y cinco saturan la señal en **151**. Es suficiente para
llevar a un miembro de 550 a 399 y dejarlo por debajo del umbral con el que el Pool presta
(ADR-0010). El costo del ataque era el gas.

De las ocho señales del historial, esta es la única que alguien escribe a mano. Las otras
siete salen de un depósito o del reloj de la cadena, y ese es justamente el argumento del
ADR-0005: lo negativo no se escribe, se deriva, porque nadie firma la transacción que hunde su
propio score. La disputa no se puede derivar de un reloj —es un juicio, no un hecho
cronológico— y por eso quedó fuera de esa protección. Que sea la única escrita a mano la
convierte en la única fabricable.

## Por qué un reporte por miembro y no un quórum

La alternativa obvia era exigir que N miembros reportaran antes de que la señal contara. Se
descartó por cuatro motivos, en orden de peso.

**El cupo por miembro ya es un quórum, pero continuo.** Con la regla nueva, saturar la señal
exige convencer a cinco personas distintas. El conteo dejó de medir cuántas veces alguien
apretó un botón y pasó a medir a cuánta gente convenció. Un quórum es la versión discreta de
esa misma idea, con menos información: colapsa a un booleano una escala que el modelo entrenó
como conteo graduado, y tira a la basura la diferencia entre un miembro molesto y cuatro.

**Un quórum introduce un acantilado que nada en el modelo justifica.** El peso es lineal en el
conteo: el reporte número N−1 valdría cero puntos y el N valdría noventa de golpe. Esa forma
no está en los pesos ni en los datos con que se entrenaron, así que habría que defenderla sin
evidencia.

**El número del quórum depende del tamaño de la junta y no hay uno que sirva.** Un quórum de
tres en una junta de cuatro es prácticamente unanimidad del resto; en una de veinte es el 15%.
Y hacerlo proporcional agrega un parámetro más que ajustar a ojo, sobre un modelo que se
entrenó con un conteo y no con una fracción del grupo.

**Retrasa la señal justo cuando sirve.** Las primeras disputas reales no aparecerían en
ninguna parte hasta alcanzar el umbral, y el Pool decide con el historial vivo dentro de la
misma transacción del préstamo (ADR-0003). Prestar mientras la evidencia espera en una antesala
es exactamente lo que el diseño evita.

## Otras alternativas descartadas

**Un árbitro o un rol de administrador que sea el único que reporta.** Reintroduce el operador
central que el resto del sistema evita a propósito: `distribute` no le pide permiso a nadie, y
lo negativo se deriva del reloj precisamente para no tener que confiar en alguien. Poner una
sola dirección a cargo de la única señal escrita a mano la vuelve el eslabón débil de todo el
score, y convierte a Kallpa en un oráculo con pasos de más.

**Cobrar una fianza para poder reportar.** Le pone precio al ataque, pero también al reporte
honesto, que es el que se quiere que ocurra. Además choca de frente con dos decisiones ya
tomadas: las penalidades de este sistema son reputacionales y nunca monetarias (ADR-0004), y
cualquier dinero retenido rompería la identidad `aportado − distribuido == balanceOf`, que es
lo único que este contrato afirma hacia afuera.

**Una espera entre reportes del mismo llamante.** Solo alarga el ataque. Cinco transacciones
espaciadas siguen siendo cinco transacciones, y el score no distingue si tardaron un bloque o
una semana.

**Poder retirar un reporte.** Devolvería el cupo y con él el ataque: reportar, retirar,
reportar. La huella es permanente por la misma razón por la que un atraso lo es —pagar tarde
no deja de haber sido tarde—, y una disputa perdida no deja de haberse perdido.

## Consecuencias

- El tope real de la señal pasa a depender del tamaño de la junta: como el reportado no puede
  reportarse a sí mismo, en una junta de cuatro acumula a lo sumo tres disputas (unos 91
  puntos) y solo desde seis miembros se alcanza el tope de cinco. Es coherente con lo que la
  señal significa: un grupo chico produce menos juicio colectivo, y ahora el score lo refleja.
- La interfaz tiene que consultar `ya_reporto` y deshabilitar el botón. Sin eso el usuario paga
  gas para enterarse de una regla que el contrato ya conocía.
- La ABI crece con dos errores nuevos —`NoPuedeReportarseASiMismo` y `YaReporto`— y una vista.
  El error de "no eres miembro" se reutiliza para el llamante en vez de inventar otro, porque
  el hecho es el mismo; lo que cambia es a quién señala `quien`.
- El evento `DisputeReported` no cambia, así que lo que ya lo decodifica sigue funcionando.
  A cambio, sigue sin nombrar al reportante: quien quiera auditar desde afuera _quién_ reportó
  tiene que preguntarle a `ya_reporto` dirección por dirección. Queda pendiente.
- Los contadores que ya estén escritos no se recalculan. En la cadena local se siembra de cero
  en cada corrida, así que no hay nada que migrar; si alguna vez hubiera un despliegue con
  historia, esos conteos vienen del mundo sin la guarda y no se pueden auditar.
