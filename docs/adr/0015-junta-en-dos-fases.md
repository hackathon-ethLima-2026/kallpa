---
status: accepted
---

# Una junta se arma reclutando: nace en convocatoria y congela su lista al arrancar

`create_junta` ya no arranca el reloj. Deja la junta **en convocatoria**: existe, tiene
parámetros y tiene creador, pero `start_at` queda en cero. Quien llegue después se suma con
`unirse`, y el turno que recibe es la posición en que entró. `arrancar` —solo quien convocó,
y con al menos dos miembros— fija `start_at` en ese instante y **cierra la lista para
siempre**. Mientras `start_at` sea cero, `deposit`, `distribute` y `report_dispute` revierten
con `JuntaNoArrancada`.

`junta_params` no cambia de forma. `start_at == 0` **es** la señal de convocatoria.

## Qué se podía hacer antes

`create_junta` recibía la lista completa de miembros y arrancaba el reloj en el mismo
instante. Quien no aparecía en esa lista no podía entrar nunca: la única forma de sumarse era
que otra persona te hubiera escrito antes de que la junta existiera.

Ninguna junta de la vida real nace así. Nace cuando alguien convoca —"estoy armando una de
cincuenta soles, ¿te apuntas?"— y se completa reclutando, a veces en días. El contrato exigía
que el grupo ya estuviera formado antes de poder formarlo.

## Por qué no se puede simplemente agregar miembros después

Esta es la alternativa obvia, es la que se descartó, y el motivo es el corazón del diseño.

**`miembros.len()` no es un dato de la lista: es el total de ciclos de la junta.** De ahí
sale todo lo demás (ADR-0005):

```
ciclos_transcurridos = min((block.timestamp − start_at) / periodo, miembros.len())
defaults             = max(0, ciclos_transcurridos − cuotas_pagadas)
tasa_cumplimiento    = min(cuotas_pagadas / ciclos_transcurridos, 1)
```

Sumar un miembro con la junta en marcha sube ese tope, y el tope está dentro de la fórmula de
tres de las ocho señales del historial —`defaults`, `tasa_cumplimiento`, `antiguedad`— que
**no se guardan, se derivan al leer**. No hay un valor viejo que quede en su sitio: la próxima
lectura recalcula todo con el número nuevo.

El caso más claro es una junta terminada. Cuatro miembros, cuatro ciclos, todos pagaron sus
cuatro cuotas: `ciclos_transcurridos` topado en 4, cero defaults, cumplimiento del 100%, y un
historial que ya no puede cambiar nunca (ADR-0005). Entra un quinto miembro y, sin que nadie
más firme una sola transacción, los cuatro pasan a tener **un default abierto cada uno** y una
tasa de cumplimiento del 80%. La junta completa se descongela. Un score que ya se publicó como
attestation deja de corresponder al historial del que salió.

Y no es solo la reputación: el dinero también deja de cuadrar hacia atrás. El pozo es
`cuota × total_ciclos`. Quien cobró el turno 0 se llevó un pozo de cuatro cuotas y ahora tendría
que aportar cinco; el que entra último cobraría un pozo de cinco financiado por gente que
recibió cuatro. La reciprocidad de una junta —todos ponen lo mismo y todos reciben lo mismo—
se rompe en el instante en que el grupo cambia de tamaño.

En una frase: **agregar a alguien reescribe el historial ya vivido de personas que no hicieron
absolutamente nada.** Un sistema cuya única promesa es que la reputación se deriva de hechos
registrados no puede permitir que un hecho nuevo cambie los hechos viejos. Por eso la lista se
congela al arrancar, y por eso existe una fase anterior en la que sí se puede crecer: antes
del arranque no hay historial que reescribir.

## Otras alternativas descartadas

**Fijar el total de ciclos al crear y dejar que la lista se llene con la junta andando.**
Desacopla el tope del tamaño de la lista, así que el historial de los demás no se movería. Pero
el que entra en el ciclo 3 nunca aportó a los pozos de los turnos 0, 1 y 2, y cobrará uno
completo: la reciprocidad se rompe igual, solo que más callada. Arreglarlo exigiría una fecha de
entrada por miembro, y con ella un "ciclo" que significa cosas distintas para cada uno —cuando
el ciclo es, por definición, la ronda en la que **todos** aportan y **uno** cobra—. Es cambiar
el dominio para salvar una función.

**Que la junta arranque sola al llegar a N miembros.** Obliga a declarar N al convocar, que es
justamente lo que quien recluta todavía no sabe. Además pone el instante del arranque —y por
lo tanto el vencimiento de la primera cuota de todos— en manos de quien entra último, y deja a
la junta que nunca llega a N congelada para siempre sin que nadie pueda decidir empezar con los
que hay.

**Que cualquier miembro pueda arrancar.** Arrancar no es un trámite: congela la lista y prende
el reloj de las obligaciones de todos. Con esa puerta abierta, quien entra segundo puede cerrar
la convocatoria de inmediato y dejar una junta de dos donde se había convocado a ocho. La
decisión de "ya somos suficientes" es la única de este contrato que no se deriva de un hecho
—una junta de cuatro puede estar completa y una de ocho a medio llenar—, así que tiene dueño.
Es el mismo criterio de ADR-0013: la única señal que alguien escribe a mano es la única que
alguien puede fabricar, y se ata a quien tiene el derecho de escribirla.

**Una bandera de fase aparte de `start_at`.** Un `estado` explícito se lee más bonito y crea un
segundo lugar donde vive el mismo hecho. Todo lo que decide si hay que cobrar ya lee `start_at`;
una bandera paralela solo agrega la posibilidad de que las dos se contradigan. Cero no es una
fecha válida en ninguna cadena real, así que ya es un centinela sin ambigüedad. El costo de
elegirlo se anota abajo.

**Sortear el orden de los turnos.** Se descartó por innecesario: el orden de llegada es
verificable por cualquiera con solo mirar los eventos, no necesita fuente de aleatoriedad —que
en cadena no es gratis ni honesta— y premia a quien se compromete primero.

## Consecuencias

- La ABI crece con tres funciones —`unirse`, `arrancar`, `creador_de`—, cinco errores
  —`YaEsMiembro`, `NoEsElCreador`, `JuntaYaArrancada`, `JuntaNoArrancada`, `FaltanMiembros`— y
  dos eventos: `MemberJoined` y `JuntaStarted`. Nada de lo que ya existía cambió de forma, así
  que lo que hoy decodifica el contrato sigue funcionando.
- **Crear una junta ya no basta para usarla.** Todo lo que llame a `create_junta` —la siembra
  de la demo, el formulario de la aplicación— tiene que llamar a `arrancar` después, o la junta
  se queda reclutando y todo lo demás revierte. Los otros paquetes quedan pendientes de adaptar.
- La interfaz distingue las dos fases con `start_at == 0` y no debe inventar otra bandera. En
  convocatoria lo único accionable es `unirse`, y el botón de arrancar solo tiene sentido para
  la dirección que devuelve `creador_de`.
- `create_junta` ya no rechaza la lista vacía: quien convoca queda dentro por definición y una
  junta de una sola persona es un estado legítimo de la convocatoria. Lo que sí sigue exigiendo
  son cuota y periodo. Y una dirección repetida en la lista —incluido el creador listándose a sí
  mismo, que es lo que hace la aplicación— se ignora en vez de revertir: lo que hay que impedir
  no es el dedazo, sino que una persona ocupe dos turnos debiendo una sola cuota.
- `ciclos_transcurridos` devuelve cero mientras la junta recluta. Sin esa rama, `start_at == 0`
  se leería como enero de 1970 y todos los convocados nacerían con la mora topada al tamaño de
  la junta, sin que hubiera vencido una sola cuota.
- Una junta en convocatoria es invisible para el crédito, y eso ya estaba resuelto: `score_global`
  solo mira juntas con al menos un ciclo vencido (ADR-0014) y aprobar exige tres (ADR-0011). Una
  junta sin reloj declara cero ciclos, así que no puede aportar un historial impecable falso.
- **El contrato asume que el reloj de la cadena nunca vale cero.** En una cadena real no vale: el
  bloque génesis ya trae marca de tiempo. En una prueba con el reloj sin fijar, sí — y ahí una
  junta quedaría arrancada y en convocatoria a la vez. Es el precio de usar el cero como
  centinela y no una bandera aparte.
- `JuntaData` gana el campo `creador`, así que el layout de almacenamiento cambia. No hay nada
  que migrar —la cadena local se siembra de cero en cada corrida—, pero un despliegue con historia
  no se podría reutilizar.
- **Queda pendiente lo que cierra la puerta de atrás de la convocatoria**: no se puede cancelar
  una junta que nunca arrancó, no se puede salir de ella, y quien convoca no puede sacar a nadie.
  Una convocatoria abandonada ocupa un `junta_id` para siempre y sigue apareciendo en la lista de
  juntas de cada convocado. Es visible pero inerte: sin reloj no cobra, no reparte y no puntúa.
