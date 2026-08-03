# Direcciones desplegadas

Entregable oficial del hackathon.

**Red:** Arbitrum Sepolia · chainId **421614** · explorador `https://sepolia.arbiscan.io`
**Desplegado:** 3 de agosto de 2026 (última versión) · desde `0x5951Af7ab044c21dFC862CbF85F947657610bdB9`

## Contratos

| Contrato | Dirección | Arbiscan |
|---|---|---|
| `mock_usdc` | `0x2412724a112cdde1319d54e378e660a68f490211` | [ver](https://sepolia.arbiscan.io/address/0x2412724a112cdde1319d54e378e660a68f490211) |
| `junta` | `0x16b5005e204f7e9143e5138462fa82e64acb4c3a` | [ver](https://sepolia.arbiscan.io/address/0x16b5005e204f7e9143e5138462fa82e64acb4c3a) |
| `score_engine` | `0x24ba77e0d24a93e049acd63cad74312476ac1413` | [ver](https://sepolia.arbiscan.io/address/0x24ba77e0d24a93e049acd63cad74312476ac1413) |
| `pool` | `0xfe2af4e49d4e99088e4225e42e288dac7f2cf963` | [ver](https://sepolia.arbiscan.io/address/0xfe2af4e49d4e99088e4225e42e288dac7f2cf963) |

### Transacciones de despliegue

| Contrato | Transacción |
|---|---|
| `mock_usdc` | [`0xaf4f4238…eed14`](https://sepolia.arbiscan.io/tx/0x0db221effea73f02f03116a236b605e7aaacef01fad666146e50a72fb334779c) |
| `junta` | [`0xc9c613e5…d5fcdc`](https://sepolia.arbiscan.io/tx/0xc9c613e5739c58e55f9870dc65a6af21f75213cebb7f42cbce864a51442a7158) |
| `score_engine` | [`0x60470e93…df85fd`](https://sepolia.arbiscan.io/tx/0x60470e931023d5ab3fdcd80c39269fabe6f3bc09aa459fcefeb330caaa04aacb) |
| `pool` | [`0xc565a619…3461bc`](https://sepolia.arbiscan.io/tx/0xc565a61956669160c1b7d99a1119ba2f8d7aea34cea5a73bd7c3a8774150ba90) |

## Cableado, verificado contra la cadena

No se copió del registro de despliegue: se le preguntó a cada contrato.

```
junta.token        → mock_usdc      ✓
scoreEngine.junta  → junta          ✓
pool.token         → mock_usdc      ✓
pool.scoreEngine   → score_engine   ✓
```

También comprobado en la cadena: `mock_usdc` reporta símbolo `mUSDC` con 6 decimales, y
`score_engine` reporta umbral de reputación positiva **400** con historial mínimo de **3
ciclos**.

## Modelo

| Qué | Valor |
|---|---|
| `modelHash` en cadena | `0x9664441e2342982ac11dab05b4ac95752f480eda32150983805e014fbc92b0c1` |
| AUC en el conjunto de prueba | 0.927 |
| Semilla del dataset | 20260802 |
| Equivalencia contrato ↔ Python | exacta, 0 puntos de diferencia sobre 20 vectores |
| Gas de `record_score` | **163 695** — medido, no estimado |

El `modelHash` de la cadena coincide con el que produce `packages/ai-model/quantize.py`, así
que las constantes desplegadas son exactamente las del modelo entrenado.

## Ethereum Attestation Service

| Qué | Valor |
|---|---|
| Contrato EAS | [`0x2521021f…01E1dE`](https://sepolia.arbiscan.io/address/0x2521021fc8BF070473E1e1801D3c7B4aB701E1dE) |
| Registro de schemas | [`0x45CB6Fa0…2cd475`](https://sepolia.arbiscan.io/address/0x45CB6Fa0870a8Af06796Ac15915619a0f22cd475) |
| UID de nuestro schema | `0xe1cd6720370dd3b885c72ea22f914a04f39d941bd951f151d97eb616dc17c78a` |
| Texto del schema | `uint16 score, bool positive, uint32 juntaId, bytes32 modelHash, bytes32 featuresCommitment` |
| Transacción de registro | [`0x565e7787…4aa4a3`](https://sepolia.arbiscan.io/tx/0x565e7787de2173af7a3e6e5f6700b6266f78522b1c12f101f6931865d54aa4a3) |
| Primera attestation emitida | [`0xbd4fd6a6…a20884`](https://sepolia.arbiscan.io/tx/0xbd4fd6a635237130c26c4dfc6ef593d946dc5d454781ecbe5f885e779aa20884) |
| Su UID | `0xfbe535bed277cc4a213f54cd9db1e0a5e0f05aa7ddf6c5011a6de0fd688f1324` |

Las dos direcciones están comprobadas contra el **bytecode de la cadena**, no copiadas de la
documentación: las de EAS en otras redes no existen aquí. El detalle, con la evidencia, está en
[`eas-arbitrum-sepolia.md`](./eas-arbitrum-sepolia.md).

La attestation la emite el ScoreEngine y su destinataria es la miembro, así que **viaja con
ella**: cualquiera puede leerla en el contrato de EAS sin conocer a Kallpa. Ahí está la
diferencia con `record_score`, que la guarda en un contrato nuestro.

Schema previsto:

```
uint16 score, bool positive, uint32 juntaId, bytes32 modelHash, bytes32 featuresCommitment
```

> Las direcciones de EAS se confirman contra la documentación oficial o el SDK antes de
> fijarlas en el contrato. Una dirección equivocada cuesta horas de depuración por un error
> que no se parece a su causa.

## La demostración sembrada en la cadena

Sembrada con `packages/stylus/scripts/seed_demo.mjs`. Las dos juntas están **completas**, así
que su historial ya no vuelve a moverse: se pueden mostrar cuando sea sin que nada se degrade.

Los ocho miembros son cuentas de verdad, derivadas de una semilla fija — volver a sembrar
produce siempre las mismas direcciones. Cada una firma sus propios depósitos, porque la cuota
se acredita a quien la envía.

### La misma persona, dos juntas, resultados opuestos

Es el argumento entero del proyecto en una comparación: el score no mira quién eres, mira lo
que hiciste. Ambas juntas tienen los mismos ocho miembros y la misma cuota.

| | Junta #0 · Las Emprendedoras | Junta #1 · Los del Mercado |
|---|---|---|
| Qué hizo María | pagó sus ocho cuotas | cobró el pozo y dejó de aportar |
| Cumplimiento | 100% | 12.5% |
| Incumplimientos | 0 | 7 |
| **Mora posterior al cobro** | 0 | **7** |
| **Score** | **1000** | **194** |
| **Crédito** | **200 mUSDC** | **SUSPENDIDO** |

Nadie declaró nada para que el segundo caso se cerrara. María cobró su turno y dejó de pagar;
el resto lo hizo el reloj de la cadena.

### Transacciones

| Qué | Transacción |
|---|---|
| **Score en cadena · junta #0** | [`0x6b41edff…d12d6b`](https://sepolia.arbiscan.io/tx/0x6b41edff9dc3d8b79e84503674c4b7f7897208190b0c118314a773cb4cd12d6b) |
| **Score en cadena · junta #1** | [`0x89389262…3568ff`](https://sepolia.arbiscan.io/tx/0x893892625ee1d490c1710948bab9bc15e791537655f568dc6eb328bdad3568ff) |

**Gas de `record_score` con historial completo: 163 695.** Cubre leer el historial de otro
contrato, correr el modelo en aritmética de punto fijo, escribir el resultado y emitir el
evento. Es un número medido, no estimado.

### El score se reproduce fuera de la cadena

Los vectores tal como los devuelve la Junta desplegada, pasados por
`packages/ai-model/fixed_point.py`:

| Vector leído de la cadena | Contrato | Python |
|---|---|---|
| `[1000000, 8, 0, 0, 0, 0, 8, 0]` | 1000 | **1000** |
| `[125000, 1, 0, 7, 0, 7, 8, 0]` | 194 | **194** |

Idénticos. Cualquiera puede repetir la comprobación sin pedirle permiso ni confianza a nadie.

### Integridad de la caja

```
aportado 3 600 000 000 − distribuido 3 600 000 000 = 0
saldo real del token en el contrato: 0        →  CUADRA ✓
```

Las dos juntas repartieron todo lo que recibieron, así que el contrato no retiene nada. La
identidad se sostiene igual cuando la caja está vacía que cuando está llena.
