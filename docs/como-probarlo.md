# Cómo probarlo

Guía para comprobar con las manos que la aplicación hace lo que dice. Todo ocurre en Arbitrum
Sepolia, la red de pruebas: **no se mueve dinero real en ningún momento**.

Aplicación publicada: **<https://kallpa-one.vercel.app>**
O en tu máquina con `yarn start` — lee la misma cadena, así que da lo mismo.

---

## Preparar la billetera

Necesitas **MetaMask** —la extensión del navegador, no la aplicación del teléfono— y algo de
ETH de prueba para pagar el gas.

1. Instala MetaMask y crea una cuenta.
2. Entra a la aplicación y conecta. Si el modal te ofrece un código QR, esa es la ruta de
   billetera de teléfono: busca la opción de MetaMask directamente.
3. Te va a decir **"Red incorrecta"**. Dale a **cambiar a Arbitrum Sepolia**; MetaMask la
   agrega sola.
4. Consigue ETH de prueba. Casi todos los grifos de Arbitrum Sepolia exigen tener saldo en la
   red principal de Ethereum, así que no sirven. El camino que sí funcionó:
   - Minar Sepolia L1 en **<https://sepolia-faucet.pk910.de/>** — es prueba de trabajo en el
     navegador, no pide cuenta ni saldo previo. Con dejarlo unos minutos alcanza.
   - Pasarlo a Arbitrum Sepolia con el guion del repositorio:
     ```bash
     cd packages/stylus
     PRIVATE_KEY_SEPOLIA=0x... node scripts/bridge_to_arbitrum_sepolia.mjs
     ```
     El puente tarda alrededor de diez minutos en acreditar del otro lado.
5. El dinero de la aplicación es un token de juguete que **cualquiera puede acuñar**: hay un
   botón **"Conseguir 500 mUSDC de prueba"** dentro de la aplicación. No necesitas pedirle
   fondos a nadie.

---

## Prueba 1 — Auditar, sin conectar nada

**Empieza por aquí.** Es la más rápida y la que mejor explica el proyecto.

Abre <https://kallpa-one.vercel.app/auditar/0> — **sin billetera, sin sesión**.

Debe decir **CUADRA**. Eso significa que lo que el contrato dice que recibió, menos lo que
dice que repartió, coincide **exactamente** con lo que el token dice que hay en su dirección.
Son dos fuentes independientes, y por eso la comparación vale algo.

Si en la demostración pones el QR en pantalla, cualquiera en la sala puede hacer esto desde su
celular sin instalar nada.

---

## Prueba 2 — La misma persona, dos veredictos opuestos

Este es el corazón de la demostración, y no hace falta que firmes nada.

En MetaMask: **Cuentas → Importar cuenta**, y pega esta clave:

```
0x2464bd0a1239efc1f81a71e7403f159058ea39cf3662728a2beb923eae5c4ae5
```

Es `0x4AE4…f21b`, la persona sembrada. **Es una clave de demostración, pública, y solo tiene
valor en la red de pruebas.** Nunca le pongas dinero real.

Ve a **Mi score** y cambia entre sus dos juntas:

| | Junta #0 · Las Emprendedoras | Junta #1 · Los del Mercado |
|---|---|---|
| Qué hizo | pagó sus ocho cuotas | cobró el pozo y dejó de aportar |
| Cumplimiento | 100% | 12.5% |
| Mora **después** de cobrar | 0 | **7** |
| **Score** | **1000** | **194** |

Misma dirección, mismo modelo, veredictos opuestos. **El score no es una etiqueta pegada a una
persona: es la lectura de su comportamiento en un grupo concreto.**

Fíjate en la señal *"impagos después de cobrar el pozo"*. Es el riesgo propio de una junta
—tomar el pozo y dejar de aportar a los demás— y ninguna otra pesa tanto, porque es la única
que rompe al grupo entero a la vez.

Ahora ve a **Crédito**. Aunque puntúe 1000 en una junta, **el fondo le niega el préstamo**:
decide con el **peor** historial. Antes podía elegir la junta que le convenía.

---

## Prueba 3 — Formar una junta reclutando

Con **tu propia** cuenta.

1. **Crear** → nombre, cuota (por ejemplo 50), y ciclo **de 1 minuto** para no esperar.
   Las direcciones de los demás son opcionales: déjalas vacías.
2. Vas a caer en la junta **en convocatoria**. Copia el enlace.
3. Con una segunda cuenta de MetaMask —o pásaselo a alguien— entra al enlace y dale
   **"Unirme a esta junta"**.
4. Vuelve a la primera cuenta y dale **"Arrancar la junta"**. Necesita dos personas como
   mínimo.

Al arrancar, **la lista se congela**. La pantalla explica por qué: la junta dura tantos ciclos
como miembros tiene, así que sumar a alguien después le reescribiría el historial ya vivido a
todos los demás.

**Comprueba esto:** intenta unirte después de arrancar. El contrato lo rechaza.

---

## Prueba 4 — Pagar y cobrar

En la junta ya arrancada:

1. **"Pagar mi cuota"** → **dos firmas**. La primera autoriza al contrato a cobrarte; la
   segunda paga. La pantalla lo advierte antes.
2. Espera a que venza el ciclo (por eso conviene ponerlo en 1 minuto).
3. **"Cobrar mi turno"** → **una sola firma**. No hay que autorizar nada: el pozo ya está en
   el contrato.

**Si el otro miembro no pagó, vas a recibir menos.** No es un error: la junta reparte lo que
hay, no lo que debería haber. Ese ausente queda registrado en su historial.

Después abre `/auditar/[tu-junta]`: debe seguir diciendo **CUADRA** aunque falte dinero por
aportar. Integridad y cobertura son preguntas distintas.

---

## Prueba 5 — La reputación sale de Kallpa

En **Mi score**, con cualquier cuenta que tenga historial:

- **"Registrar mi score"** lo escribe en *nuestro* contrato.
- **"Publicar la attestation"** lo escribe en **Ethereum Attestation Service**, que no es
  nuestro, con la miembra como destinataria.

La segunda es la que importa para la propuesta: cualquiera puede leer esa attestation **sin
conocer a Kallpa**. Hasta que existió, la puntualidad de quien ahorra en junta solo la veía
nuestro propio fondo — que es exactamente el problema que el proyecto dice resolver.

El identificador de la attestation sale del recibo de la transacción, no del valor de retorno:
de una transacción minada solo se observan eventos y estado.

---

## Prueba 6 — Que el crédito de verdad se mueva

1. **Fondear** → aporta al fondo (dos firmas: autorizar y aportar). Ya tiene 5000 mUSDC.
2. **Crédito** → con una cuenta que califique, pide el préstamo y comprueba que el saldo llega.
3. Devuélvelo y mira cómo se libera la línea.

---

## Estado sembrado ahora mismo

| Junta | Estado | Para qué sirve |
|---|---|---|
| **#0 Las Emprendedoras** | terminada, 8 de 8 turnos | el caso ejemplar: score 1000 |
| **#1 Los del Mercado** | 1 de 8 turnos | el caso roto: score 194, crédito suspendido |
| **#2 Mi primera convocatoria** | **en convocatoria** | ver la pantalla de reclutamiento |

El fondo tiene **5000 mUSDC** disponibles. Las direcciones vivas están en
[`addresses.md`](./addresses.md).

Las juntas #0 y #1 están completas, así que **su historial ya no cambia**: se pueden demostrar
cuando sea sin que nada se degrade.

---

## Si algo falla

**"Failed to fetch" a mitad de una lectura.** Es el punto de acceso a la cadena, no la
aplicación. Revisa `rpcOverrides` en `packages/nextjs/scaffold.config.ts`.

**Una transacción revierte sin explicación.** Mira el nombre del error en MetaMask: los
contratos devuelven errores con nombre —`JuntaNoArrancada`, `YaEsMiembro`, `CreditoSuspendido`,
`NoEsMiembro`— y casi siempre dicen exactamente qué pasó.

**La pantalla muestra datos que no cuadran con la cadena.** Lo más probable es que
`packages/nextjs/contracts/deployedContracts.ts` tenga la interfaz de una versión y la
dirección de otra. Ningún compilador detecta eso: `yarn check-types` solo valida lo que el
frontend usa. Se comprueba llamando por RPC a una función que solo exista en la versión nueva.
