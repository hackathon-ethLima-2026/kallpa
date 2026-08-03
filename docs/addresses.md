# Direcciones desplegadas

Entregable oficial del hackathon.

**Red:** Arbitrum Sepolia · chainId **421614** · explorador `https://sepolia.arbiscan.io`
**Desplegado:** 3 de agosto de 2026 · desde `0x5951Af7ab044c21dFC862CbF85F947657610bdB9`

## Contratos

| Contrato | Dirección | Arbiscan |
|---|---|---|
| `mock_usdc` | `0x59f60cbebb1c80aadba60e32f62db15793ef31d1` | [ver](https://sepolia.arbiscan.io/address/0x59f60cbebb1c80aadba60e32f62db15793ef31d1) |
| `junta` | `0xe9827da24e746a68df6f812799f9673e539e4fbb` | [ver](https://sepolia.arbiscan.io/address/0xe9827da24e746a68df6f812799f9673e539e4fbb) |
| `score_engine` | `0x7f7de18a87ee4e855dd35fe7733a6a2b8ceb5ba4` | [ver](https://sepolia.arbiscan.io/address/0x7f7de18a87ee4e855dd35fe7733a6a2b8ceb5ba4) |
| `pool` | `0x0e50bf501abafe781736a560215c706534a3a65d` | [ver](https://sepolia.arbiscan.io/address/0x0e50bf501abafe781736a560215c706534a3a65d) |

### Transacciones de despliegue

| Contrato | Transacción |
|---|---|
| `mock_usdc` | [`0xaf4f4238…eed14`](https://sepolia.arbiscan.io/tx/0xaf4f4238e29e01c48148bba4ea31d4af5fc7d52c645a3c6e37828bb542beed14) |
| `junta` | [`0x98d3b219…f4090a`](https://sepolia.arbiscan.io/tx/0x98d3b219a6d7376232ca3f8d6a5bcad81244f21afabb4f95625a0229acf4090a) |
| `score_engine` | [`0xd2c77a29…1ae707`](https://sepolia.arbiscan.io/tx/0xd2c77a299116af256e31f06949a60856a5d2f288bf77c1fa19bef3c6211ae707) |
| `pool` | [`0xf6d329e0…20ce76`](https://sepolia.arbiscan.io/tx/0xf6d329e0ec83be34b2377ef93c2b4fd9bc9ffe1f39bb0443d9ef7d8f7620ce76) |

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
produce siempre las mismas direcciones. Cada una firma sus propios depósitos, porque la
cuota se acredita a quien la envía.

### La misma persona, dos juntas, resultados opuestos

Es el argumento entero del proyecto en una sola comparación: el score no mira quién eres,
mira lo que hiciste.

| | Junta #1 · Las Emprendedoras | Junta #2 · Los del Mercado |
|---|---|---|
| Qué hizo María | pagó sus ocho cuotas | cobró el pozo y dejó de aportar |
| Cumplimiento | 100% | 12.5% |
| Pagos puntuales | 8 | 1 |
| Incumplimientos | 0 | 7 |
| **Mora posterior al cobro** | 0 | **7** |
| **Score** | **1000** | **194** |
| **Crédito** | **200 mUSDC** | **SUSPENDIDO** |

Nadie declaró nada para que el segundo caso se cerrara. María cobró su turno y dejó de
pagar; el resto lo hizo el reloj de la cadena.

### Transacciones

| Qué | Transacción |
|---|---|
| María cobra el pozo (junta #2) | [`0xdc9cbc4f…eb09e3`](https://sepolia.arbiscan.io/tx/0xdc9cbc4f7374f92b6f4cf815bbeef7f1408082eb505e056898b0d873b8eb09e3) |
| **Score en cadena · junta #1** | [`0xd5b3a918…032646`](https://sepolia.arbiscan.io/tx/0xd5b3a918573a6901524ce4a7a436e42e6a3ae04eed482275424bf643ab032646) |
| **Score en cadena · junta #2** | [`0x62059622…d9180e`](https://sepolia.arbiscan.io/tx/0x62059622c1b3b9918269d771cf94963a2dcd030483414043f12984ff58d9180e) |

**Gas de `record_score` con historial completo: 150 337.** Cubre leer el historial de otro
contrato, correr el modelo en aritmética de punto fijo, escribir el resultado y emitir el
evento. Es un número medido, no estimado.

### El score se reproduce fuera de la cadena

Los dos vectores, tal como los devolvió la Junta desplegada, pasados por
`packages/ai-model/fixed_point.py`:

| Vector leído de la cadena | Contrato | Python |
|---|---|---|
| `[1000000, 8, 0, 0, 0, 0, 8, 0]` | 1000 | **1000** |
| `[125000, 1, 0, 7, 0, 7, 8, 0]` | 194 | **194** |

Idénticos. Cualquiera puede repetir la comprobación sin pedirle permiso ni confianza a nadie,
que es precisamente lo que hace que la afirmación se sostenga.

### Integridad de la caja

```
aportado 3 650 000 000 − distribuido 3 600 000 000 = 50 000 000
saldo real del token en el contrato: 50 000 000        →  CUADRA ✓
```

Los 50 mUSDC que quedan son la cuota que María aportó a la junta #2 antes de cobrar: entró a
la caja y todavía no salió, porque los turnos restantes de esa junta no se repartieron.
