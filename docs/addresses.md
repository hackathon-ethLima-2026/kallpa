# Direcciones desplegadas

Entregable oficial del hackathon.

**Red:** Arbitrum Sepolia · chainId **421614** · explorador `https://sepolia.arbiscan.io`
**Desplegado:** 3 de agosto de 2026 (última versión) · desde `0x5951Af7ab044c21dFC862CbF85F947657610bdB9`

## Contratos

| Contrato | Dirección | Arbiscan |
|---|---|---|
| `mock_usdc` | `0x25e00931e86ba7eef56f1de25c3e82a1a94f1b2b` | [ver](https://sepolia.arbiscan.io/address/0x25e00931e86ba7eef56f1de25c3e82a1a94f1b2b) |
| `junta` | `0xd52d2b8b1d44de65667b47ab531293581c6d09a9` | [ver](https://sepolia.arbiscan.io/address/0xd52d2b8b1d44de65667b47ab531293581c6d09a9) |
| `score_engine` | `0x2de01abec172185cfb026d6d496d4207a983e5bf` | [ver](https://sepolia.arbiscan.io/address/0x2de01abec172185cfb026d6d496d4207a983e5bf) |
| `pool` | `0x2a3dd4bed7fdd6b4137c83421fadff9038a084f2` | [ver](https://sepolia.arbiscan.io/address/0x2a3dd4bed7fdd6b4137c83421fadff9038a084f2) |

### Transacciones de despliegue

| Contrato | Transacción |
|---|---|
| `mock_usdc` | [`0x56946d17…1320e0`](https://sepolia.arbiscan.io/tx/0x56946d170024baa2e567bdf03944172aec5b4fbd198c18b1e59adcddcb1320e0) |
| `junta` | [`0xaf51f53e…832fc9`](https://sepolia.arbiscan.io/tx/0xaf51f53eda5e1d0253f722fc1c96cc693083cc783e6faa7a83b4355a05832fc9) |
| `score_engine` | [`0x4c7b1a5b…00388f`](https://sepolia.arbiscan.io/tx/0x4c7b1a5bcd633478173fe96a6005183ed26c967a2b2643aa9c3cad9e9700388f) |
| `pool` | [`0xbdbe0f58…10d4d5`](https://sepolia.arbiscan.io/tx/0xbdbe0f581c058d694789708ea3cfc8dae8d274b24165602ebef7ddeb7f10d4d5) |

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
| Gas de `record_score` | **165 740** — medido, no estimado |

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
| Attestation **positiva** — junta #0, score 1000 | [`0x3dd015d5…22682f`](https://sepolia.arbiscan.io/tx/0x3dd015d51a59148837ad37e095612eda4103b968abe308426fbe7bdb8e22682f) |
| ↳ su UID | `0x2e82a51b83633e64698653056ff1131288e7b3bebf74493f87f8a66dcf1071af` |
| Attestation **negativa** — junta #1, score 194 | [`0x1c55e194…327faf`](https://sepolia.arbiscan.io/tx/0x1c55e194927cca69e6e44be5c261663e154e5ec0118637eef71ef3e39d327faf) |
| ↳ su UID | `0x7f2ba4d89468f43db05abae3e482e25c620db8e15076d92e20fa6dd010321a20` |

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

**Gas de `record_score` con historial completo: 165 740.** Cubre leer el historial de otro
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
