---
status: accepted
---

# El crédito lo decide el peor historial del miembro, no la junta que él elija

`score_global(member)` pregunta al contrato Junta en qué juntas participa la dirección, computa
el score de cada una y devuelve `(peor_score, con_credito, juntas_evaluadas)`. El score que
gobierna la decisión es el **mínimo**. La reputación es positiva cuando ese mínimo alcanza el
umbral **y** existe al menos una junta con el historial mínimo de ADR-0011.

Las funciones por junta —`compute_score`, `score_and_credit`, `record_score`— no cambian: la
fuente del score sigue siendo una junta concreta (ADR-0001). Lo que cambia es cuál de esas
respuestas puede sostener un préstamo.

## El agujero

`request_loan(junta_id)` recibe la junta de manos de quien pide el préstamo, y el motor mira
solamente esa. La persona sembrada para la demostración lo enseña sin necesidad de construir
ningún caso: **la misma dirección puntúa 1000 en la junta 0 y 194 en la junta 1**. Puede pedir
prestado contra la buena mientras está en mora en la otra, y el sistema no solo lo permite: lo
aprueba con un número impecable y verificable.

Mientras el solicitante elige la junta, elige también su veredicto. Un dato que el evaluado
controla no es evidencia.

## Por qué el mínimo y no el promedio

Promediar deja que un historial impecable pague el silencio de un incumplimiento: mil y ciento
noventa y cuatro promedian quinientos noventa y siete, que da crédito. Pero lo que se está
tratando de ver es justamente el incumplimiento, y promediar es la operación que lo esconde.

Es además lo que hace cualquier prestamista real: no busca cuál es tu mejor referencia, busca
la peor. Un solo default abierto pesa más que diez juntas cumplidas, porque la pregunta no es
"¿cuánto ha cumplido?" sino "¿va a cumplir?".

## Por qué se evalúan las juntas desde un ciclo y no desde tres

La asimetría es deliberada y es la parte de la regla que más fácil se rompe al tocarla.

ADR-0011 exige tres ciclos vencidos para **aprobar** crédito, porque sin comportamiento
observado el modelo no sabe decir "no sé" y puntúa altísimo a un desconocido. Esa exigencia
sigue viva: `con_credito` pide que exista al menos una junta con tres ciclos.

Pero entran al mínimo todas las juntas con **un** ciclo vencido. Una junta joven no alcanza
para aprobar; un incumplimiento dentro de ella sí es señal real de comportamiento. Si solo
contaran las juntas maduras, la evasión sería de una línea: abro una junta nueva, la incumplo,
y como es joven no cuenta. Cerraríamos la puerta de adelante y dejaríamos la de atrás abierta.

Debajo de un ciclo no se evalúa nada, y ahí la simetría vuelve: ninguna cuota ha vencido, así
que no hay evidencia ni a favor ni en contra. Contar esa junta sería tratar "no sé" como un
dato.

En una frase: **la evidencia que condena vale desde el primer ciclo; la que absuelve, desde el
tercero.**

## Qué cambió desde ADR-0001

ADR-0001 consideró el score global agregado y lo descartó por dos motivos, y los dos se
vencieron solos:

- _"Requeriría mantener la lista de juntas por miembro e iterarla en storage"_. El índice
  `juntas_de` ya existe, porque "¿en cuáles estoy?" es la primera pantalla de la aplicación.
  Y `score_global` es una vista: no escribe nada.
- _"Obligaría a defender ante el jurado que un default en la junta A baja el score en la junta
  B"_. Hoy la alternativa es defender que el solicitante elige qué junta se mira, que es mucho
  peor de sostener. Y ya no es un caso hipotético: los datos sembrados lo contienen.

ADR-0001 no queda revocado. La fuente del score sigue siendo una junta y la attestation sigue
declarando de cuál salió; lo que se agrega es una lectura por encima que las junta todas.

## Consecuencias

- El costo crece con el número de juntas del miembro: una lectura al contrato Junta por cada
  una, más una para pedir la lista. Es una vista, así que no cuesta gas para consultarla, pero
  quien la llame dentro de una transacción sí lo paga. En la práctica un miembro pertenece a
  pocas juntas y el índice ya está en storage.
- Si falla la lectura de **cualquiera** de las juntas de la lista, la función revierte en vez
  de saltársela. Saltarla dejaría fuera justo la junta que quizá lo condena, y devolvería un
  veredicto silenciosamente incompleto.
- Se agrega el error `ListaDeJuntasFallida(address)` para no reutilizar
  `LecturaDeJuntaFallida` con un `junta_id` inventado: al pedir la lista todavía no hay junta
  de la que hablar.
- El tercer valor de retorno, `juntas_evaluadas`, existe para distinguir "peor score cero" de
  "cero juntas miradas". Sin él, un miembro sin historial y uno pésimo se ven idénticos desde
  afuera. Los tres valores son de tamaño fijo a propósito: mezclar un tipo dinámico con tipos
  fijos en un retorno múltiple produce una interfaz que no describe los bytes reales.
- El Pool todavía decide con `score_and_credit` sobre la junta que recibe por parámetro.
  Migrarlo a `score_global` es lo que cierra el agujero de punta a punta; hasta entonces la
  regla existe y está probada, pero no gobierna el préstamo.
- La interfaz debería mostrar cuál junta arrastra el score hacia abajo. "Tu crédito está
  suspendido" sin decir por cuál de tus juntas es una pantalla que no se puede accionar.
