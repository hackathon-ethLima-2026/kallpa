# Validación de la aplicación

Este documento responde tres preguntas, y las responde **contra el código**, no contra la
memoria: qué problema resuelve Kallpa, para qué existe cada pantalla, y qué está terminado.

Todo lo que dice se comprobó ejecutando las pruebas y consultando la cadena. Lo que falta
está escrito como falta, no maquillado.

---

## 1. La problemática

**Dos de cada tres peruanos que ahorran lo hacen fuera del banco**, en juntas y panderos. Ese
sistema funciona desde hace generaciones y tiene dos fallas que nadie ha resuelto:

**El pozo depende de una persona.** Alguien junta el dinero de ocho familias y lo guarda hasta
repartirlo. Si desaparece, no hay a quién reclamar, no hay contrato, no hay registro. La
confianza es real pero la garantía no existe.

**El cumplimiento no deja rastro.** Alguien puede pagar puntual durante años, cerrar cinco
juntas sin fallar una sola cuota, y seguir siendo invisible para el sistema financiero. Ningún
banco lo ve. Esa persona sigue sin historial crediticio, y por lo tanto sin crédito — o con
crédito a tasas de usura.

Las dos fallas se refuerzan: **el ahorro informal no puede convertirse en crédito formal
porque no produce evidencia.**

---

## 2. La propuesta de solución

Kallpa ataca las dos mitades con la misma pieza: un contrato que custodia y a la vez registra.

### Lo que ya existe en el mercado, y por qué no alcanza

| Enfoque | Qué resuelve | Qué deja abierto |
|---|---|---|
| App de juntas centralizada | organiza los turnos | el dinero sigue en manos de alguien |
| Score crediticio tradicional | evalúa historial | no ve el ahorro informal |
| Préstamos con colateral en cripto | no exige confianza | exige tener capital, que es justo lo que falta |

### Lo que hace Kallpa distinto

**El pozo no lo custodia nadie.** Cada cuota entra al contrato y la única forma de sacarla es
`distribute`, que solo paga a quien le toca el turno. No hay función de retiro, ni
administrador, ni llave maestra. La afirmación es verificable: cualquiera compara lo aportado
menos lo distribuido contra el saldo real del token, **dos fuentes independientes**, desde un
código QR y sin billetera.

**El modelo de crédito corre dentro de la cadena.** No es un servidor nuestro que devuelve un
número: es un contrato en Arbitrum Stylus que ejecuta una regresión logística en aritmética de
punto fijo. Cualquiera puede reproducir el cálculo, y la huella del modelo viaja con cada
resultado. La equivalencia entre el contrato en Rust y el entrenamiento en Python es **exacta:
cero puntos de diferencia**.

**El incumplimiento se deriva del reloj, no de una denuncia.** Nadie tiene que reportar que
alguien dejó de pagar: la cuota vencida se calcula del tiempo transcurrido. Eso tiene una
consecuencia que ningún sistema tradicional logra — **quien deja de pagar nunca firma la
transacción que hunde su propio score**.

**La reputación es de la persona, no de Kallpa.** El score se publica como *attestation* en
Ethereum Attestation Service, un registro que no es nuestro, con la miembra como destinataria.
Cualquier cooperativa o fintech puede leerla sin conocernos y sin pedirnos permiso. Eso es lo
que convierte el ahorro informal en historial portable, que era el problema original.

---

## 3. Las vistas, una por una

### `/` — Mis juntas

**Para qué existe.** Es la primera pantalla de quien llega. Su trabajo no es listar: es
responder "¿esto es de fiar?" antes de pedir nada. Por eso el titular habla de custodia y no
de funcionalidades.

**Qué hace.** Lee las juntas de la billetera conectada (`juntasDe`) y las muestra con la rueda
del isotipo: cada punto es un miembro, relleno si ya cobró. De un vistazo se ve cuánta vida le
queda a la junta sin leer un número.

**Terminado cuando:** sin billetera explica el producto en vez de exigir conexión · con
billetera y sin juntas ofrece la salida (crear una) · cada tarjeta distingue las tres fases —
en convocatoria, en marcha, completa — y avisa si debes cuotas.

---

### `/crear` — Crear una junta

**Para qué existe.** Convierte a Kallpa en producto y no en demostración: cualquiera arma su
propia junta, no solo las sembradas.

**Qué hace.** `createJunta` con nombre, cuota y período. **Las direcciones de los demás son
opcionales**: la junta nace en convocatoria y la gente entra con el enlace.

**Decisiones que se ven en la pantalla:**
- El número de la junta sale del **evento del recibo**, no de `totalJuntas() - 1`. Ese contador
  es global: si otra persona creaba la suya en el mismo bloque, mandábamos al creador a la
  junta de un desconocido.
- Avisa **antes de firmar** si son menos de tres personas, porque esa junta nunca dará crédito
  —dura tantos ciclos como miembros tiene y el mínimo son tres—. Enterarse después sería
  enterarse tarde.

**Terminado cuando:** valida cada dirección en su propia fila y no en el formulario · el
resumen muestra las cifras exactas que se van a escribir · el período se elige en palabras
("1 semana") y se guarda en segundos.

---

### `/junta/[id]` — La junta

Cambia de naturaleza según la fase. Son dos pantallas bajo una ruta.

#### En convocatoria

**Para qué existe.** Reclutar. Todavía no hay cuotas, ni turnos, ni pozo.

**Qué hace.** Muestra quiénes se han sumado **en orden de llegada, que es el orden de cobro** —
transparente y sin sorteo. Ofrece `unirse` a quien no es miembro y `arrancar` a quien la creó.
Y el enlace para invitar, con botón de copiar: sin eso, "unirse" no le sirve a nadie.

**Terminado cuando:** explica que al arrancar **la lista se congela**, y por qué — la junta dura
tantos ciclos como miembros tiene, así que sumar a alguien después le reescribiría el historial
ya vivido a todos los demás · exige dos personas como mínimo · quien ya está dentro y no creó
la junta sabe que le toca esperar.

#### En marcha

**Para qué existe.** Es donde se mueve el dinero, y por lo tanto donde más fácil se rompe la
experiencia.

**Qué hace.** Pagar la cuota (`approve` + `deposit`), cobrar el turno (`distribute`), y
reportar una disputa (`reportDispute`).

**Decisiones que se ven en la pantalla:**
- **Pagar son dos firmas y lo dice antes.** El token exige autorizar antes de que un contrato
  pueda cobrar. Esconderlo produce una segunda ventana que parece un error.
- **Cobrar es una sola firma**, y la pantalla lo distingue: no te piden permiso sobre tu
  dinero, te lo están entregando.
- **La junta termina cuando todos cobraron, no cuando se acaba el tiempo.** Si alguien paga
  tarde el reloj se adelanta a los turnos y la junta sigue viva.
- **Reparte lo que hay, no lo que debería haber.** Si alguien no aportó, quien cobra recibe
  menos. No es un error: es el riesgo que el score aprende a medir.
- **La disputa es la única señal que alguien escribe a mano.** Las otras siete salen de un
  depósito o del reloj; un juicio no se deriva de un calendario. Cada miembro cuenta **una sola
  vez** por reportado, porque la señal existe para expresar el juicio del grupo y no la
  insistencia de uno.

**Terminado cuando:** el botón de reportar se deshabilita si ya reportaste a esa persona
(`yaReporto`) · si no te alcanza el saldo, la salida para conseguir fondos está ahí mismo y no
en otra pantalla — quedarse corto a un paso de pagar es cuando más fácil se abandona.

---

### `/mi-score` — Mi score

**Para qué existe.** Es donde el historial se vuelve cifra. Y donde se juega la parte difícil:
un número solo **no distingue los dos "no" que este producto puede dar**, y son opuestos.

**Qué hace.** Muestra el score de la junta elegida y las ocho señales de las que sale. Permite
`recordScore` (escribirlo en nuestro contrato) y `attest` (publicarlo en EAS).

**Decisiones que se ven en la pantalla:**
- Separa **"tu historial muestra incumplimientos"** de **"todavía no te conozco"**. Quien recién
  entra puntúa altísimo justamente porque no hay nada malo que observar, y tratar ese silencio
  como excelencia es el error que hunde a cualquier sistema de crédito.
- Los dos botones **no hacen lo mismo**, y el texto gasta espacio en separarlos: registrar
  escribe en *nuestro* contrato; la attestation escribe en un registro que **no es nuestro**.
  La segunda es la que hace que la reputación sea de la miembra y no de Kallpa.
- El identificador de la attestation sale del **recibo**, no del valor de retorno: de una
  transacción minada solo se observan eventos y estado.

**Terminado cuando:** muestra la huella del modelo, que respalda la afirmación de que el
puntaje no lo calcula un servidor nuestro · cada señal viene con la explicación de qué mide ·
el comprobante viaja junto a la junta que lo produjo.

---

### `/pedir-credito` — Crédito

**Para qué existe.** Es el momento en que el ahorro se convierte en crédito, que es la promesa
del proyecto.

**Qué hace.** `scoreGlobal` para el veredicto, `requestLoan` para pedir, `repay` para devolver.

**Decisiones que se ven en la pantalla:**
- **El fondo juzga por tu peor junta, no por la que elijas.** Antes el solicitante mandaba el
  número de junta, y la propia demostración exhibía el hueco: María puntúa 1000 en una junta y
  194 en otra, y podía pedir contra la buena estando en mora en la otra.
- **Recomputa en el instante de decidir**, no lee una foto guardada. Por eso el crédito se
  suspende solo, sin que nadie mande una transacción.

**Terminado cuando:** muestra cuántas juntas se evaluaron · si falta historial lo dice como
política y no como rechazo · los tramos están a la vista.

---

### `/fondear` — Fondear

**Para qué existe.** Es el otro lado del producto y responde a **un actor distinto**: no entra
una miembra a pagar su cuota, entra quien quiere colocar capital contra comportamiento
verificable en vez de contra un aval.

Sin esta pantalla el recorrido no cierra: el crédito se aprueba y falla al transferir, porque
el fondo está vacío.

**Qué hace.** `approve` + `depositLiquidity`, y muestra el estado del fondo.

**Terminado cuando:** aquí la palabra **solvencia** sí significa algo —el fondo presta, así que
puede quedarse corto— a diferencia de una junta, que solo reparte lo que entró · avisa cuando
el fondo está vacío · explica la política de tramos.

---

### `/auditar/[id]` — Auditar

**Para qué existe.** Es la pantalla que más dice sobre el proyecto y **la única sin billetera
ni sesión**. Se abre desde un QR, en el celular de cualquiera, y responde una sola pregunta.

**Qué hace.** `verifyIntegrity` y `cycleCoverage`.

**Decisiones que se ven en la pantalla:**
- Compara **dos fuentes independientes**: lo que el contrato dice que recibió menos lo que dice
  que repartió, contra lo que el token dice que hay. Comparar contra un espejo interno no
  probaría nada.
- **Integridad y cobertura son preguntas distintas** y se responden por separado: la primera
  dice que nadie robó, la segunda si el grupo está cumpliendo. Una junta puede cuadrar
  perfectamente y estar yéndose a pique.

**Terminado cuando:** funciona sin conectar nada · dice CUADRA o NO CUADRA sin ambigüedad ·
no tiene la navegación del resto, para no distraer de la única pregunta que responde.

---

## 4. Estado verificado

### Pruebas — ejecutadas para este documento

| Contrato | Resultado |
|---|---|
| `junta` | **55 pasan** |
| `score_engine` | **37 pasan** |
| `pool` | **21 pasan** |
| `mock_usdc` | **6 pasan** |
| **Total** | **119** |

### Cobertura de la interfaz

Todas las funciones del contrato que un usuario necesita tienen pantalla. Las que no aparecen
en la interfaz son, a propósito, de otro tipo:

| Función | Por qué no tiene pantalla |
|---|---|
| `junta.token`, `pool.token`, `pool.scoreEngine`, `score_engine.junta`, `score_engine.eas`, `score_engine.schemaUid` | son el cableado entre contratos; sirven para auditar el despliegue desde fuera, y se consultan en `/debug` |
| `score_engine.isPositive` | redundante con `scoreAndCredit`, que devuelve lo mismo y más |

### Definition of Done del hackathon

| Criterio | Estado |
|---|---|
| Los 4 contratos desplegados con direcciones documentadas | ✅ |
| El score se computa en cadena leyendo la junta real y coincide con Python | ✅ **exacto, 0 puntos de diferencia** |
| Attestation EAS emitida **positiva y negativa**, con `juntaId` | ✅ ambas emitidas y leídas desde EAS |
| El Pool presta recomputando en vivo y rechaza sin que nadie mande una transacción | ✅ |
| Las pantallas corren en Arbitrum Sepolia | ✅ <https://kallpa-one.vercel.app> |
| El QR muestra integridad y cobertura sin billetera | ✅ |
| El flujo de María es grabable sin trucos | ✅ |

---

## 5. Lo que falta

Todo lo que este documento listaba como pendiente en su primera versión está cerrado. Queda
una cosa, y es deliberada.

### El incumplimiento del crédito no baja el score — a propósito

El préstamo ya tiene plazo, la mora se deriva del reloj y quien no devuelve no vuelve a
recibir crédito. Lo que **no** se hizo es meter ese incumplimiento dentro del modelo, y el
[ADR-0016](./adr/0016-la-mora-del-credito-vive-en-el-pool.md) explica por qué: el score mide
comportamiento **dentro de una junta**, y esa es exactamente la razón por la que significa
algo — describe el historial que ningún banco ve. El incumplimiento de un préstamo sí tiene
registro, y lo tiene en el propio fondo, que es público y consultable.

Quien preste mirando a Kallpa lee las dos fuentes. Las dos están en la cadena.

Meterlo en el score exigiría una novena señal, reentrenar el modelo, y con ello cambiar el
`modelHash` que viaja dentro de cada attestation ya emitida — invalidando la verificación de
equivalencia exacta que es en sí misma un entregable comprometido.

### Fuera de código

La lámina 14 del mazo espera los nombres del equipo y el reparto del trabajo. **Es una decisión
del equipo, no técnica.**
