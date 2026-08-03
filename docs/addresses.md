# Direcciones desplegadas

Entregable oficial del hackathon.

**Red:** Arbitrum Sepolia · chainId **421614** · explorador `https://sepolia.arbiscan.io`
**Desplegado:** 3 de agosto de 2026 (última versión) · desde `0x5951Af7ab044c21dFC862CbF85F947657610bdB9`

## Contratos

| Contrato | Dirección | Arbiscan |
|---|---|---|
| `mock_usdc` | `0x241f74fed26ad33fc5de7d3197d56f14824139da` | [ver](https://sepolia.arbiscan.io/address/0x241f74fed26ad33fc5de7d3197d56f14824139da) |
| `junta` | `0x66eb72055b8eba05fec5f221eb0c8b58814fb3a8` | [ver](https://sepolia.arbiscan.io/address/0x66eb72055b8eba05fec5f221eb0c8b58814fb3a8) |
| `score_engine` | `0x6b6f385246672c6eb8defb7c4debcb4f1bd45158` | [ver](https://sepolia.arbiscan.io/address/0x6b6f385246672c6eb8defb7c4debcb4f1bd45158) |
| `pool` | `0x9e1a4a0f4653457bf8c7032a78f6735489b67c75` | [ver](https://sepolia.arbiscan.io/address/0x9e1a4a0f4653457bf8c7032a78f6735489b67c75) |

### Transacciones de despliegue

| Contrato | Transacción |
|---|---|
| `mock_usdc` | [`0xaf4f4238…eed14`](https://sepolia.arbiscan.io/tx/0x237cf5cc4455b8475589cda070837d80fce3603e7194787f29ea10bac7978810) |
| `junta` | [`0xe3cc1b6e…d5fcdc`](https://sepolia.arbiscan.io/tx/0xe3cc1b6e025d1d471330f9f23d88d5428144fb2a5fe4d610cf9e7053ddd5fcdc) |
| `score_engine` | [`0x0a917202…df85fd`](https://sepolia.arbiscan.io/tx/0x0a9172021d6d174f993a1f4670fcb3590db287303d4bb5cee8de65f39edf85fd) |
| `pool` | [`0x336e9061…3461bc`](https://sepolia.arbiscan.io/tx/0x336e9061e327e4d46ed3386176282a9a7d0990b9921908f8c14049bd0f3461bc) |

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
| Gas de `record_score` | **130 313** — medido, no estimado |

El `modelHash` de la cadena coincide con el que produce `packages/ai-model/quantize.py`, así
que las constantes desplegadas son exactamente las del modelo entrenado.

## Ethereum Attestation Service

| Qué | Valor |
|---|---|
| Contrato EAS | _pendiente_ |
| Registro de schemas | _pendiente_ |
| UID de nuestro schema | _pendiente_ |

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

**Gas de `record_score` con historial completo: 157 169.** Cubre leer el historial de otro
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
