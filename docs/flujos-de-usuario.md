# Flujos de usuario

Kallpa no tiene un usuario, tiene tres. Y no quieren lo mismo: uno quiere que no le roben el
pozo, otro quiere que su puntualidad le sirva para algo, y el tercero quiere prestar dinero
sin conocer a nadie. Las pantallas se entienden cuando se sabe a cuál de los tres responden.

---

## El problema, en una frase

Dos de cada tres peruanos que ahorran lo hacen fuera del banco, en juntas donde **todo el pozo
depende de que el organizador no desaparezca**. Y cuando cumplen puntual durante años, esa
puntualidad **no vale nada**: ningún banco la ve.

Kallpa ataca las dos mitades. El contrato custodia el pozo, así que nadie puede desviarlo. Y
el comportamiento dentro de la junta se convierte en un score que se calcula **dentro de la
cadena** y se publica en un registro público, así que viaja con la persona.

---

## Los tres actores

| Quién | Qué quiere | Dónde vive en la aplicación |
|---|---|---|
| **La miembra** | Ahorrar en grupo sin que nadie se lleve el pozo, y que su cumplimiento cuente | `/`, `/crear`, `/junta/[id]`, `/mi-score` |
| **Quien presta** | Colocar capital contra comportamiento verificable, sin aval ni ventanilla | `/fondear` |
| **Quien audita** | Comprobar que la caja cuadra, sin cuenta, sin billetera y sin pedir permiso | `/auditar/[id]` |

El tercero es el más importante para entender el proyecto. **Auditar no exige billetera**: se
abre desde un código QR, en el celular de cualquiera, y responde una sola pregunta.

---

## Flujo 1 — Formar una junta

Una junta se arma reclutando, no listando direcciones de memoria.

1. **`/crear`** — le pones nombre, cuánto pone cada quien por ciclo, y cada cuánto vence un
   ciclo. Las direcciones de los demás son **opcionales**: puedes crearla sola y repartir el
   enlace.
2. La junta nace **en convocatoria**. Todavía no hay cuotas, ni turnos, ni pozo.
3. **`/junta/[id]`** muestra quiénes se han sumado y **en qué orden llegaron: ese es el orden
   de cobro**. Transparente y sin sorteo. Hay un botón para copiar el enlace e invitar.
4. Quien no es miembro ve **"Unirme a esta junta"**. Se suma con una firma.
5. Quien la creó ve **"Arrancar la junta"**. Necesita al menos dos personas.

### Por qué la lista se congela al arrancar

Esta es la decisión de diseño que más consecuencias tiene, y está en el
[ADR-0015](./adr/0015-junta-en-dos-fases.md).

**El número de miembros ES el número de ciclos** de la junta: cada quien cobra una vez. Si
entrara alguien con la junta ya en marcha, ese total cambiaría, y con él cambiarían
**retroactivamente** las cuotas que cada quien debía, sus incumplimientos y su tasa de
cumplimiento.

En números: una junta de cuatro, terminada, con todos al día. Entra un quinto y los cuatro
amanecen con **un incumplimiento abierto y 80% de cumplimiento**, sin haber firmado nada.

Por eso la junta tiene dos fases. Antes de arrancar no se mueve dinero ni se juzga a nadie.

---

## Flujo 2 — Vivir la junta

Ya arrancada, `/junta/[id]` es donde ocurre casi todo.

**Pagar la cuota** son **dos firmas**, y la pantalla lo dice antes en vez de sorprenderte con
una segunda ventana: el token exige autorizar a un contrato antes de que pueda cobrarte. Se
autoriza un margen amplio de una sola vez, así las cuotas siguientes son un solo paso.

**Cobrar el turno** es una sola firma, y no requiere autorizar nada: el pozo ya está en el
contrato, no te están pidiendo permiso sobre tu dinero, te lo están entregando.

**Reparte lo que hay, no lo que debería haber.** Si alguien no aportó, quien cobra recibe
menos. No es un error: es exactamente el riesgo que una junta real tiene, y lo que el score
aprende a medir. Ese ausente queda registrado.

**Reportar una disputa** es la única señal que alguien escribe a mano. Las otras siete salen
de un depósito o del reloj de la cadena; un juicio no se deriva de un calendario. Reglas:

- Solo reportan miembros de esa junta.
- Nadie se reporta a sí mismo.
- **Cada reportante cuenta una sola vez por reportado.** Sin esa regla un solo miembro
  malicioso satura la señal, y la señal existe para expresar el juicio del *grupo*
  ([ADR-0013](./adr/0013-autorizacion-de-disputas.md)).

**Una junta termina cuando todos cobraron, no cuando se acaba el tiempo.** Si alguien paga
tarde el reloj se adelanta a los turnos, y la junta sigue viva.

---

## Flujo 3 — Que el historial se vuelva cifra

**`/mi-score`** muestra el score de la junta que elijas y las ocho señales de las que sale.

Lo que hay que entender es que la pantalla distingue **dos "no" opuestos**:

- *"tu historial muestra incumplimientos"* — el modelo habló.
- *"todavía no te conozco"* — la política habló.

Quien recién entra puntúa altísimo **justamente porque no hay ninguna señal negativa que
observar**. Tratar ese silencio como excelencia sería el error que hunde a cualquier sistema
de crédito, así que hacen falta al menos **tres ciclos** de historial
([ADR-0011](./adr/0011-historial-minimo-para-el-credito.md)).

**Consecuencia que sorprende:** una junta de dos personas **nunca dará crédito**, porque dura
dos ciclos y nunca llega a tres. La aplicación lo avisa al crearla, no tres ciclos después.

Al final hay dos botones que **no hacen lo mismo**:

- **Registrar el score** lo escribe en *nuestro* contrato.
- **Publicar la attestation** lo escribe en **Ethereum Attestation Service**, un registro que
  no es nuestro, con la miembra como destinataria. Es lo que hace que la reputación sea de
  ella y no de Kallpa: cualquier fintech puede leerla sin conocernos.

Consultar el score es gratis y no deja rastro. Si nadie lo escribe, no queda nada que un
tercero pueda consultar después.

---

## Flujo 4 — Pedir crédito

**`/pedir-credito`** decide con el **peor** historial del solicitante entre todas sus juntas,
no con la que él elija ([ADR-0014](./adr/0014-credito-por-el-peor-historial.md)).

Antes el solicitante mandaba el número de junta, y eso abría un hueco que la propia
demostración exhibe: María puntúa **1000** en «Las Emprendedoras» y **194** en «Los del
Mercado». Podía pedir contra la buena estando en mora en la otra.

El fondo **recomputa el score en el instante de decidir**, no lee una foto guardada
([ADR-0003](./adr/0003-pool-recomputa-en-vivo.md)). Eso importa porque el incumplimiento se
deriva del reloj: **el crédito se suspende solo, sin que nadie mande una transacción**. Quien
deja de pagar nunca firma la transacción que hunde su propio score.

Los tramos: menos de 400 sin crédito · 400–599 hasta 50 · 600–749 hasta 120 · 750 o más hasta
200 mUSDC.

---

## Flujo 5 — Poner el capital

**`/fondear`** es el otro lado del producto, y responde a alguien distinto: una cooperativa,
una fintech, una ONG que quiere colocar dinero contra comportamiento en vez de contra un aval.

Sin esta pantalla el recorrido no cierra: el crédito se aprueba y falla al transferir, porque
el fondo está vacío.

Aquí la palabra **solvencia** sí significa algo, a diferencia de lo que ocurre con una junta:
el fondo presta, así que puede quedarse corto. Una junta nunca es insolvente — solo reparte lo
que entró.

---

## Flujo 6 — Auditar sin permiso

**`/auditar/[id]`** es la pantalla que más dice sobre el proyecto, y es la única sin billetera
ni sesión. Se abre desde un QR y responde: **¿la caja cuadra?**

Compara **dos fuentes independientes**:

1. Lo que el contrato dice que recibió menos lo que dice que repartió.
2. Lo que el token dice que hay en la dirección del contrato.

Si no coinciden, dice **NO CUADRA**. No hay forma de que un organizador desvíe el pozo sin que
esa resta deje de dar cero, porque la única salida de dinero es `distribute`, y `distribute`
solo paga a quien le toca el turno ([ADR-0004](./adr/0004-qr-audita-integridad-no-solvencia.md)).

Muestra además la **cobertura del ciclo**: cuántos de los que debían aportar aportaron. La
integridad dice que nadie robó; la cobertura dice si el grupo está cumpliendo. Son preguntas
distintas y se responden por separado.

---

## El recorrido completo, de una

```
crear una junta  →  invitar con el enlace  →  arrancar
      ↓
pagar cuotas  ·  cobrar el turno  ·  reportar disputas
      ↓
el historial se vuelve score, calculado dentro de la cadena
      ↓
publicarlo en EAS  →  la reputación viaja con la persona
      ↓
pedir crédito  →  el fondo recomputa en vivo y decide solo
```

Y en paralelo, sin billetera y desde cualquier celular: **auditar**.
