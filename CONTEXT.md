# Kallpa

Custodia de juntas de ahorro rotativas y reputación crediticia computada en cadena.
Este archivo es el glosario del dominio: define QUÉ es cada término, no cómo se implementa.

## Lenguaje

### La junta

**Junta**:
Grupo cerrado de personas que aportan una cuota fija por periodo y reciben el pozo completo por turnos rotativos hasta que todos hayan cobrado una vez.
_Evitar_: pandero, tanda, ROSCA, grupo, círculo.

**Miembro**:
Persona que pertenece a una junta y tiene la obligación de aportar la cuota de cada ciclo.
_Evitar_: usuario, cliente, cuenta, participante.

**Cuota**:
Monto fijo que cada miembro debe aportar en un ciclo.
_Evitar_: aporte, pago, contribución.

**Ciclo**:
Ronda en la que todos los miembros aportan su cuota y un único miembro recibe el pozo.
_Evitar_: ronda, periodo, iteración.

**Turno**:
Posición del miembro en el orden de cobro de la junta.
_Evitar_: puesto, número.

**Pozo**:
Suma de las cuotas de un ciclo, que se entrega íntegra al miembro del turno.
_Evitar_: fondo, bote, monto acumulado.

**Atraso**:
Cuota aportada después de su plazo, pero aportada. Se mide en fracciones de ciclo y no en días, porque la duración del ciclo es un parámetro de cada junta. Queda registrado para siempre: pagar tarde no deja de haber sido tarde.
_Evitar_: mora, retraso, tardanza.

**Default**:
Cuota cuyo plazo venció y que sigue sin pagarse **en este momento**. Es un estado abierto y curable, no un veredicto: si el miembro paga, deja de ser default y pasa a ser atraso.
_Evitar_: incumplimiento, impago, falta.

**Ciclos transcurridos**:
Cuántos ciclos han vencido desde que arrancó la junta, contados contra el reloj de la cadena y topados cuando la junta se completa. Es la única fuente de tiempo del dominio: nada se simula.
_Evitar_: ciclos pasados, edad, ronda actual.

**Junta completa**:
Junta que ya corrió todos sus ciclos: todos cobraron su turno y su historial deja de cambiar para siempre.
_Evitar_: congelada, cerrada, finalizada, terminada.

**Integridad**:
Propiedad de una junta de que todo el dinero que declara haber recibido, menos el que declara haber repartido, coincide con el saldo que el contrato del token le reconoce. Es lo que hace verificable —y no solamente prometido— que nadie puede sacar fondos fuera de las reglas.
_Evitar_: solvencia, salud, auditoría.

**Cobertura del ciclo**:
Cuántas de las cuotas esperadas en el ciclo en curso ya entraron. Reporta progreso, no salud financiera.
_Evitar_: avance, cumplimiento, estado.

**Tasa de cumplimiento**:
Fracción de las cuotas que le tocaba pagar a un miembro que efectivamente pagó. Es la señal más directa de conducta: no premia llevar tiempo en la junta, sino haber respondido.
_Evitar_: ciclos completados, porcentaje de pago, adherencia.

**Mora post-cobro**:
Incumplimiento que un miembro acumula después de haber cobrado su turno. Es la traición clásica de una junta —tomar el pozo y dejar de aportar— y se distingue del incumplimiento de quien todavía no ha cobrado nada.
_Evitar_: default post-cobro, deuda pendiente, saldo.

**Disputa perdida**:
Reclamo resuelto en contra del miembro; cuenta como señal negativa de comportamiento.
_Evitar_: conflicto, queja, reporte.

### La reputación

**Historial**:
Conjunto de ocho señales de comportamiento de un miembro dentro de una junta, derivadas exclusivamente de hechos registrados en cadena. Es lo único que alimenta el score.
_Evitar_: features (en prosa), datos, perfil, track record.

**Score**:
Número de 0 a 1000 que estima la probabilidad de que un miembro cumpla. Su **sujeto** es siempre el miembro; su **fuente** es siempre una junta concreta.
_Evitar_: puntaje crediticio, rating, calificación.

**Sujeto del score**:
El miembro. Es quien recibe la reputación y quien la porta hacia otros prestamistas.

**Fuente del score**:
La junta cuyo historial se leyó para computarlo. Un mismo miembro puede tener scores de fuentes distintas.

**Attestation**:
Certificación publicada en cadena que declara el score de un miembro en un momento dado, y si su comportamiento fue positivo o negativo. Es la copia portable que viaja fuera de Kallpa hacia quien no puede leer la junta; dentro de Kallpa nadie decide con ella.
_Evitar_: certificado, credencial, badge, firma.

**Reputación positiva**:
Estado del miembro cuyo score alcanza el mínimo con el que se presta. Es la misma frontera que decide el crédito: no existe un miembro con reputación positiva al que el Pool le niegue el préstamo.

**Reputación negativa**:
Estado del miembro cuyo score cae por debajo de esa frontera. Su línea de crédito queda suspendida sin que nadie tenga que declararlo.

### El crédito

**Pool**:
Reserva común de liquidez que presta a miembros con reputación positiva sin conocerlos: computa su score en el momento de decidir, a partir del historial vivo de la junta.
_Evitar_: banco, fondo, tesorería, vault.

**Tramo**:
Rango de score al que corresponde un monto máximo de préstamo.
_Evitar_: nivel, categoría, tier, LTV (LTV es otra cosa: aquí no hay colateral).

**Línea de crédito**:
Monto máximo que el Pool está dispuesto a prestarle a un miembro según su tramo vigente.
_Evitar_: cupo, límite, crédito disponible.

**Solvencia**:
Capacidad del Pool de responder por lo que debe, medida como la liquidez que le queda disponible después de descontar lo prestado y vigente. Es propiedad exclusiva del Pool: una junta no puede ser insolvente, porque nunca contiene menos de lo que debe.
_Evitar_: salud, respaldo, liquidez.
