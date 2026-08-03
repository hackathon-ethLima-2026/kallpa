# Ethereum Attestation Service en Arbitrum Sepolia

Reconocimiento previo a la integración de EAS. La attestation es el **export portable** del
score: la copia que viaja hacia un prestamista que no puede leer la junta. Dentro de Kallpa
nadie decide con ella (ADR-0003), así que si EAS falla el proyecto sigue en pie — pero si la
dirección está mal, el fallo aparece el día de la demostración y no se parece a su causa.

Todo lo que sigue está **comprobado contra la cadena**, no copiado de la memoria. Cada
afirmación indica cómo se comprobó.

**Red:** Arbitrum Sepolia · chainId **421614** · RPC `https://sepolia-rollup.arbitrum.io/rpc`

---

## 1. Direcciones verificadas

| Contrato         | Dirección                                    | Bytecode         | `version()` | Arbiscan                                                                              |
| ---------------- | -------------------------------------------- | ---------------- | ----------- | ------------------------------------------------------------------------------------- |
| `EAS`            | `0x2521021fc8BF070473E1e1801D3c7B4aB701E1dE` | **18 898 bytes** | `1.3.0`     | [ver](https://sepolia.arbiscan.io/address/0x2521021fc8BF070473E1e1801D3c7B4aB701E1dE) |
| `SchemaRegistry` | `0x45CB6Fa0870a8Af06796Ac15915619a0f22cd475` | **2 741 bytes**  | `1.3.0`     | [ver](https://sepolia.arbiscan.io/address/0x45CB6Fa0870a8Af06796Ac15915619a0f22cd475) |

Son exactamente las que ya estaban en el apéndice del `build-spec.md`. Estaban bien; lo que
faltaba era la prueba.

### La evidencia

Tener bytecode solo demuestra que **algo** vive en esa dirección. Estas tres comprobaciones
demuestran que ese algo es EAS:

1. **`getBytecode` devuelve código.** 18 898 y 2 741 bytes respectivamente, contra el RPC
   público de Arbitrum Sepolia.
2. **Los dos contratos se reconocen entre sí.** `EAS.getSchemaRegistry()` devuelve
   `0x45CB6Fa0870a8Af06796Ac15915619a0f22cd475` — la dirección del registro. No es un par que
   armamos nosotros: el contrato desplegado lo declara. Ninguna dirección equivocada podría
   producir esa coincidencia por casualidad.
3. **Responden la interfaz de EAS y no otra.** `version()` devuelve `1.3.0` en ambos;
   `getAttestTypeHash()` devuelve
   `0xfeb2925a02bae3dae48d424a0437a2b6ac939aa9230ddc55a1a76f065d988076`;
   `getSchema(bytes32)` y `getAttestation(bytes32)` decodifican sus structs sin error.
4. **El registro tiene uso real.** 76 eventos `Registered` desde el bloque 0. No es un
   despliegue muerto.
5. **Coinciden con el repositorio oficial.** `deployments/arbitrum-sepolia/EAS.json` y
   `SchemaRegistry.json` de `ethereum-attestation-service/eas-contracts` traen esas mismas
   dos direcciones.

La comprobación decisiva es la 2. Una dirección se puede copiar mal y seguir teniendo código;
lo que no se puede falsificar es que el otro contrato la nombre.

### Las direcciones que NO existen — resultado negativo confirmado

Las tres direcciones que se probaron de memoria **no tienen código en Arbitrum Sepolia**.
Confirmado con `getBytecode`: las tres devuelven `0x`, cero bytes.

| Dirección                                    | Resultado | Por qué se creyó                                                                                                                           |
| -------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `0x4200000000000000000000000000000000000021` | **vacía** | Es un rango de _predeploy_ del OP Stack (Optimism, Base). Arbitrum no usa ese esquema de direcciones, así que ahí no hay nada ni lo habrá. |
| `0xaEF4103A04090071165F78D45D83A0C0782c2B2a` | **vacía** | Dirección de EAS en **otras** redes. Los despliegues de EAS no comparten dirección entre cadenas.                                          |
| `0xA310da9c5B885E7fb3fbA9D66E9Ba6Df512b78eB` | **vacía** | Igual: es de otra red.                                                                                                                     |

Que una dirección aparezca en la documentación de EAS no implica que exista en esta cadena.
**EAS no despliega con CREATE2 ni con dirección determinista**, así que cada red tiene la suya
y no hay forma de deducirla. Copiar la de otra cadena produce una llamada que no revierte por
un motivo legible: llamar a una dirección sin código **devuelve éxito con datos vacíos**, así
que el contrato creería que atestiguó y no atestiguó nada.

### No hay EASScan para Arbitrum Sepolia

`arbitrum-sepolia.easscan.org` **no resuelve en DNS**. Comprobado: `arbitrum.easscan.org`,
`sepolia.easscan.org` y `base-sepolia.easscan.org` sí resuelven; el de Arbitrum Sepolia no
existe.

Esto afecta el criterio de aceptación de T8 del `build-spec.md`, que pide la attestation
"visible en EAS scan". En esta red hay que verificar de otra manera, y no es peor:

- **Arbiscan** — la transacción y el evento `Attested`
  (`topic0 = 0x8bf46bf4cfd674fa735a3d63ec1c9ad4153f033c290341f3a588b75685141b35`).
- **Lectura directa** — `EAS.getAttestation(uid)` devuelve la attestation completa, con el
  `data` del que se decodifican los cinco campos del schema. Es mejor prueba que una web:
  cualquiera la repite contra el RPC público sin pedirle confianza a nadie.

---

## 2. Firmas exactas

Copiadas de `ethereum-attestation-service/eas-contracts` (rama `master`), no de la memoria.

### `SchemaRegistry.register`

```solidity
struct SchemaRecord {
    bytes32 uid;               // UID del schema
    ISchemaResolver resolver;  // resolver opcional; address(0) si no hay
    bool revocable;            // si las attestations de este schema se pueden revocar
    string schema;             // el string del schema
}

function register(
    string calldata schema,
    ISchemaResolver resolver,
    bool revocable
) external returns (bytes32);
```

Selector verificado: **`0x60d7a278`** = `register(string,address,bool)`.
No es `payable`. Devuelve el UID del schema.

### `EAS.attest`

```solidity
struct AttestationRequestData {
    address recipient;       // el miembro: por eso la attestation viaja
    uint64 expirationTime;   // 0 = sin vencimiento; si no, tiene que ser futuro
    bool revocable;          // tiene que respetar lo que declaró el schema
    bytes32 refUID;          // attestation referenciada; 0x00..00 si ninguna
    bytes data;              // los campos del schema, ABI-codificados
    uint256 value;           // ETH que se le reenvía al resolver
}

struct AttestationRequest {
    bytes32 schema;               // UID del schema registrado
    AttestationRequestData data;  // los datos de la attestation
}

function attest(AttestationRequest calldata request) external payable returns (bytes32);
```

Selector verificado: **`0xf17325e7`** =
`attest((bytes32,(address,uint64,bool,bytes32,bytes,uint256)))`.
Es `payable`. Devuelve el UID de la attestation creada.

### Errores que devuelve, con su selector

Sirven para diagnosticar: un `eth_call` que revierte trae estos cuatro bytes y dicen
exactamente qué salió mal.

| Selector     | Error                     | Cuándo                                                    |
| ------------ | ------------------------- | --------------------------------------------------------- |
| `0xbf37b20e` | `InvalidSchema()`         | el `schema` UID no está registrado                        |
| `0x08e8b937` | `InvalidExpirationTime()` | `expirationTime != 0` y ya pasó                           |
| `0x157bd4c3` | `Irrevocable()`           | pides `revocable: true` sobre un schema que no lo permite |
| `0x1574f9f3` | `NotPayable()`            | mandas `value != 0` y el schema no tiene resolver         |
| `0x23369fa6` | `AlreadyExists()`         | registras un schema que ya existe (mismo UID)             |

### Lectura, para el frente y para verificar

```solidity
struct Attestation {
    bytes32 uid; bytes32 schema; uint64 time; uint64 expirationTime;
    uint64 revocationTime; bytes32 refUID; address recipient;
    address attester; bool revocable; bytes data;
}

function getAttestation(bytes32 uid) external view returns (Attestation);
function isAttestationValid(bytes32 uid) external view returns (bool);
```

Ambas comprobadas contra el contrato desplegado: decodifican sin error.

---

## 3. Codificar `attest` desde Rust

Este es el entregable central. Está pensado para implementarse sin volver a investigar.

Va a mano con `sol!` + `SolCall::abi_encode`, igual que `history` en
`score_engine/src/lib.rs` y `transfer` en `pool/src/lib.rs`. **No se usa `sol_interface!`**:
ese macro enruta por la vía deprecada que esquiva la abstracción de VM, y con ella toda
posibilidad de interceptar la llamada desde las pruebas.

### El bloque `sol!`

Los structs se declaran completos aunque solo se use `attest`: alloy necesita la forma exacta
para calcular el selector, y un campo de menos cambia el selector sin avisar.

```rust
sol! {
    // La forma exacta de IEAS.sol. Se declara a mano en vez de usar `sol_interface!` por la
    // misma razón que en `history`: ese macro pasa por la ruta deprecada del SDK y las
    // pruebas no pueden interceptar lo que no pasa por la VM.
    struct AttestationRequestData {
        address recipient;
        uint64 expirationTime;
        bool revocable;
        bytes32 refUID;
        bytes data;
        uint256 value;
    }

    struct AttestationRequest {
        bytes32 schema;
        AttestationRequestData data;
    }

    function attest(AttestationRequest request) external payable returns (bytes32);

    event ScoreAttested(
        uint32 indexed juntaId,
        address indexed member,
        uint16 score,
        bool positive,
        bytes32 uid
    );
}
```

### La función completa

```rust
use stylus_sdk::{
    alloy_primitives::{Address, B256, Bytes, U256, b256},
    alloy_sol_types::{SolCall, SolValue, sol},
    prelude::*,
};

/// Cuánto vale una attestation antes de que haya que rehacerla.
///
/// Noventa días es una decisión de producto, no técnica: el historial de una junta viva sigue
/// moviéndose, así que una attestation vieja describe a un miembro que ya no existe. Vencerla
/// obliga a recomputar en vez de dejar que una foto favorable sobreviva a los hechos.
const VIGENCIA_ATTESTATION: u64 = 90 * 24 * 60 * 60;

/// El hash del modelo desplegado, en los treinta y dos bytes que espera el schema.
///
/// `weights::MODEL_HASH` es un `&str` porque lo expone una función pública para que se lea
/// desde el frente. El schema quiere `bytes32`, así que la constante vive dos veces. Si
/// `quantize.py` emite un modelo nuevo hay que cambiar LAS DOS, o la attestation certificará
/// un modelo que no fue el que calculó.
const MODEL_HASH_BYTES: B256 =
    b256!("9664441e2342982ac11dab05b4ac95752f480eda32150983805e014fbc92b0c1");

impl ScoreEngine {
    /// Publica el score del miembro como attestation EAS.
    ///
    /// El score se recomputa antes de llamar aquí (ADR-0003): la attestation nunca certifica
    /// una foto vieja. Este método solo codifica y envía.
    fn emitir_attestation(
        &mut self,
        junta_id: u32,
        member: Address,
        score: u16,
        positivo: bool,
        compromiso: B256,
    ) -> Result<B256, ScoreError> {
        // Los cinco campos del schema (§6.5). Todos son de tamaño fijo, así que esto son 160
        // bytes planos: cinco palabras, sin tabla de desplazamientos. Es la razón por la que
        // el schema se puede codificar de un tirón y verificar a ojo.
        let payload = (score, positivo, junta_id, MODEL_HASH_BYTES, compromiso)
            .abi_encode_params();

        let datos = attestCall {
            request: AttestationRequest {
                schema: self.schema_uid.get(),
                data: AttestationRequestData {
                    recipient: member,
                    // Vencimiento futuro obligatorio: si ya pasó, EAS revierte con
                    // InvalidExpirationTime (0x08e8b937) y el error no menciona la fecha.
                    expirationTime: self.vm().block_timestamp() + VIGENCIA_ATTESTATION,
                    revocable: true,
                    refUID: B256::ZERO,
                    data: Bytes::from(payload),
                    // Sin resolver no se puede mandar valor: EAS revierte con NotPayable
                    // (0x1574f9f3) aunque `attest` sea payable.
                    value: U256::ZERO,
                },
            },
        }
        .abi_encode();

        // Muta estado ajeno, así que va por `call` y no por `static_call`. Es la misma vía que
        // usa `mover_token` en el Pool: en el SDK 0.9 `CallAccess::call` pediría `&self` y
        // `&mut self` a la vez, y no compila.
        let respuesta = stylus_sdk::call::call(&mut *self, self.eas.get(), &datos)
            .map_err(|_| ScoreError::AttestationFallida(AttestationFallida { juntaId: junta_id, member }))?;

        // Una dirección sin código devuelve éxito con cero bytes. Sin esta comprobación, un
        // EAS mal configurado se vería igual que uno que funciona, y emitiríamos el evento
        // con un UID inventado.
        if respuesta.len() < 32 {
            return Err(ScoreError::AttestationFallida(AttestationFallida { juntaId: junta_id, member }));
        }

        let uid = B256::from_slice(&respuesta[..32]);
        log(self.vm(), ScoreAttested { juntaId: junta_id, member, score, positive: positivo, uid });
        Ok(uid)
    }
}
```

### Los bytes que produce, verificados

Calldata real generada y **aceptada por el contrato desplegado**. Ejemplo con
`score = 1000`, `positive = true`, `juntaId = 0`, `modelHash = 0x11…11`,
`featuresCommitment = 0x22…22`, `expirationTime = 0`:

```
0xf17325e7                                                          selector de attest
[ 0] 0000…0020   desplazamiento a AttestationRequest (32) — el struct es DINÁMICO
[ 1] <schemaUid> request.schema
[ 2] 0000…0040   desplazamiento a request.data (64), relativo a la palabra [1]
[ 3] 0000…<addr> data.recipient
[ 4] 0000…0000   data.expirationTime
[ 5] 0000…0001   data.revocable
[ 6] 0000…0000   data.refUID
[ 7] 0000…00c0   desplazamiento a data.data (192), relativo a la palabra [3]
[ 8] 0000…0000   data.value
[ 9] 0000…00a0   longitud de data.data = 160 bytes
[10] 0000…03e8   uint16  score               = 1000
[11] 0000…0001   bool    positive            = true
[12] 0000…0000   uint32  juntaId             = 0
[13] 1111…1111   bytes32 modelHash
[14] 2222…2222   bytes32 featuresCommitment
```

Las palabras 10 a 14 son exactamente lo que produce `abi_encode_params` sobre la tupla de
cinco campos: 160 bytes, cero desplazamientos. Sirve como aserción en una prueba.

### Cómo se comprobó que esta codificación es correcta

No se dedujo: se ejecutó contra el EAS desplegado con `eth_call`.

| Prueba                                              | Resultado                                                                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `attest` con nuestro schema (aún sin registrar)     | revierte `0xbf37b20e` `InvalidSchema()` — **la codificación llegó entera**: el único reparo fue que el schema no existe |
| `attest` con un schema real ya registrado en la red | **devuelve un UID**: `0x916d7f8f69fd67cf44e8769e001c417e5718c4e5aa8f8b49bb23fa96ce094e56`                               |
| `attest` con `expirationTime` en el pasado          | revierte `0x08e8b937` `InvalidExpirationTime()`                                                                         |

La segunda fila es la que cierra el asunto: con un schema válido, esta calldata produce una
attestation. Lo único que falta es registrar el nuestro.

### Sobre las pruebas

`emitir_attestation` **no se puede probar con `cargo test --lib`**. Es una llamada mutante
entre contratos, y en el SDK 0.9 esas llamadas no pasan por la abstracción de VM, así que no
hay dónde interceptarlas. No hay que pelear con eso.

Lo que sí se prueba, y conviene que se pruebe:

- **La codificación del payload.** `(score, positivo, junta_id, model_hash, compromiso)
.abi_encode_params()` contra los 160 bytes de arriba. Es una función pura.
- **El selector.** `attestCall::SELECTOR == [0xf1, 0x73, 0x25, 0xe7]`. Una aserción de una
  línea que detecta cualquier cambio en la forma de los structs — que es justo el error que no
  se ve venir.

---

## 4. Registrar el schema, una sola vez

El schema del `build-spec.md` §6.5, tal cual:

```
uint16 score, bool positive, uint32 juntaId, bytes32 modelHash, bytes32 featuresCommitment
```

Con `resolver = address(0)` y `revocable = true` (§6.5), su UID es:

```
0xe1cd6720370dd3b885c72ea22f914a04f39d941bd951f151d97eb616dc17c78a
```

Comprobado contra la cadena: **todavía no está registrado**.

En el repositorio no hay `cast`, y el despliegue ya se hace con viem, así que el registro
sigue la misma convención: un script en `packages/stylus/scripts` que lee
`PRIVATE_KEY_SEPOLIA` de `packages/stylus/.env` — la misma clave con la que se desplegaron los
cuatro contratos, `0x5951Af7ab044c21dFC862CbF85F947657610bdB9`.

`packages/stylus/scripts/registrar_schema.mjs`:

```js
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  encodePacked,
  keccak256,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RPC = "https://sepolia-rollup.arbitrum.io/rpc";
const REGISTRY = "0x45CB6Fa0870a8Af06796Ac15915619a0f22cd475";

// El string va con los espacios exactamente como está en el build-spec §6.5. El UID es el
// keccak del string CRUDO: quitar un espacio produce otro schema, no el mismo con otro
// formato.
const SCHEMA =
  "uint16 score, bool positive, uint32 juntaId, bytes32 modelHash, bytes32 featuresCommitment";
const RESOLVER = zeroAddress;
const REVOCABLE = true;

const abi = parseAbi([
  "function register(string schema, address resolver, bool revocable) returns (bytes32)",
  "struct SchemaRecord { bytes32 uid; address resolver; bool revocable; string schema; }",
  "function getSchema(bytes32 uid) view returns (SchemaRecord)",
]);

const clave = readFileSync(resolve(AQUI, "..", ".env"), "utf8")
  .split("\n")
  .find((l) => l.trim().startsWith("PRIVATE_KEY_SEPOLIA="))
  .split("=")[1]
  .trim();

const cuenta = privateKeyToAccount(
  clave.startsWith("0x") ? clave : `0x${clave}`,
);
const publico = createPublicClient({ transport: http(RPC) });
const cartera = createWalletClient({
  account: cuenta,
  transport: http(RPC),
  chain: {
    id: 421614,
    name: "arbitrum-sepolia",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [RPC] } },
  },
});

// El UID se calcula antes de mandar nada: registrar dos veces revierte con AlreadyExists, y
// es mejor descubrirlo sin gastar gas.
const uid = keccak256(
  encodePacked(["string", "address", "bool"], [SCHEMA, RESOLVER, REVOCABLE]),
);
console.log("UID previsto:", uid);

const existente = await publico.readContract({
  address: REGISTRY,
  abi,
  functionName: "getSchema",
  args: [uid],
});
if (existente.uid !== `0x${"0".repeat(64)}`) {
  console.log("Ya estaba registrado. No hay nada que hacer.");
  process.exit(0);
}

const hash = await cartera.writeContract({
  address: REGISTRY,
  abi,
  functionName: "register",
  args: [SCHEMA, RESOLVER, REVOCABLE],
});
console.log("tx:", `https://sepolia.arbiscan.io/tx/${hash}`);
await publico.waitForTransactionReceipt({ hash });

// Se relee de la cadena en vez de confiar en el recibo: es la misma disciplina del cableado
// en docs/addresses.md — no se copia del registro de despliegue, se le pregunta al contrato.
const guardado = await publico.readContract({
  address: REGISTRY,
  abi,
  functionName: "getSchema",
  args: [uid],
});
console.log("UID en cadena:", guardado.uid);
console.log("string:", JSON.stringify(guardado.schema));
console.log(
  guardado.uid === uid ? "COINCIDE" : "NO COINCIDE — revisar el string",
);
```

Los comandos:

```bash
cd packages/stylus
node scripts/registrar_schema.mjs
```

Después, anotar el UID en tres lugares o quedará a medias:

```bash
# 1. packages/stylus/.env
EAS_ADDRESS=0x2521021fc8BF070473E1e1801D3c7B4aB701E1dE
EAS_SCHEMA_REGISTRY=0x45CB6Fa0870a8Af06796Ac15915619a0f22cd475
EAS_SCHEMA_UID=0xe1cd6720370dd3b885c72ea22f914a04f39d941bd951f151d97eb616dc17c78a

# 2. docs/addresses.md — la tabla "Ethereum Attestation Service"

# 3. el ScoreEngine — dirección de EAS y schemaUID como argumentos del constructor
```

Comprobación independiente, sin confiar en el script:

```bash
node -e "const{createPublicClient,http,parseAbi}=require('viem');createPublicClient({transport:http('https://sepolia-rollup.arbitrum.io/rpc')}).readContract({address:'0x45CB6Fa0870a8Af06796Ac15915619a0f22cd475',abi:parseAbi(['struct SchemaRecord { bytes32 uid; address resolver; bool revocable; string schema; }','function getSchema(bytes32 uid) view returns (SchemaRecord)']),functionName:'getSchema',args:['0xe1cd6720370dd3b885c72ea22f914a04f39d941bd951f151d97eb616dc17c78a']}).then(r=>console.log(r))"
```

> El `schemaUID` **se pasa por constructor, no se hardcodea**. El schema todavía no existe, y
> un contrato con un UID equivocado incrustado hay que volver a desplegarlo entero.

---

## 5. Trampas

Cinco cosas que cuestan horas si se descubren durante la integración.

### 1. El UID del schema es el keccak del string crudo — los espacios cuentan

```solidity
_getUID = keccak256(abi.encodePacked(schema, resolver, revocable))
```

`schema` es el string **literal**, byte por byte. No se normaliza, no se canoniza, no se
ordena. Dos strings que un humano lee igual dan schemas distintos:

| String                                                      | UID                                                                  |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| `uint16 score, bool positive, …` (con espacio tras la coma) | `0xe1cd6720370dd3b885c72ea22f914a04f39d941bd951f151d97eb616dc17c78a` |
| `uint16 score,bool positive, …` (sin espacio)               | `0x576c088a77562339fda519be24fadab31752eb8742132a556c7ae5ed29b41965` |

Las dos convenciones conviven en la red: de los 76 schemas registrados, **8 llevan espacio
tras la coma y el resto no**. Ninguna es "la correcta"; lo que importa es que el string que se
registra y el que se documenta sean **el mismo string**. El del §6.5 lleva espacios, así que
el UID de este documento es el de la primera fila.

La fórmula está verificada, no supuesta: se recalculó el UID de cinco schemas reales de la
cadena a partir de su `string` + `resolver` + `revocable`, y los cinco coinciden con el UID
que el registro tiene guardado.

### 2. El struct anidado hace la calldata dinámica — pero el payload del schema no

Dos cosas distintas que conviene no mezclar:

- **La calldata de `attest` es dinámica.** `AttestationRequest` contiene
  `AttestationRequestData`, que contiene `bytes data`. Un solo campo dinámico contagia a todo
  lo que lo envuelve, así que el struct entero se codifica por referencia y la calldata
  arranca con `0x20`, un desplazamiento, antes de cualquier dato. Es la palabra `[0]` de la
  tabla de arriba, y es donde se equivoca quien codifica a mano.
- **El payload del schema es plano.** `uint16, bool, uint32, bytes32, bytes32` son cinco
  tipos de tamaño fijo: 160 bytes seguidos, sin desplazamientos ni longitudes.

De lo primero se encarga `SolCall::abi_encode` sin ayuda — por eso se usa el macro y no se
arma la calldata a mano. Lo segundo es lo que hace que este schema sea cómodo, y **es una
propiedad del schema, no una casualidad**: si algún día se le agrega un `string` o un `bytes`,
el payload deja de ser plano y toda verificación a ojo deja de servir.

Es el mismo problema que ya nos costó un error: mezclar un tipo dinámico con tipos de tamaño
fijo produce bytes que no se parecen a la interfaz que uno cree estar leyendo.

### 3. `attest` es `payable`, pero nuestro schema no acepta valor

`attest` está marcada `payable` y `AttestationRequestData` tiene un campo `value`. Invita a
pensar que hay que mandar algo. No:

```solidity
if (address(resolver) == address(0)) {
    if (value != 0) { revert NotPayable(); }
    ...
}
```

Nuestro schema se registra sin resolver, así que `value` **tiene que ser 0** y la transacción
no lleva ETH. Mandar cualquier cosa revierte con `NotPayable()` (`0x1574f9f3`) — un error que
no menciona el dinero.

En Stylus esto sale gratis: `stylus_sdk::call::call(&mut *self, eas, &datos)` envía cero valor
por omisión. Solo hay que **no** cambiarlo a `Call::new_in(self).value(...)`.

### 4. El UID de la attestation no se puede predecir

A diferencia del schema, el UID de una attestation depende del estado de la cadena:

```solidity
_getUID = keccak256(abi.encodePacked(
    schema, recipient, attester, time, expirationTime,
    revocable, refUID, data, bump
))
```

Entran `time` (el timestamp del bloque) y `bump` (un contador que EAS incrementa si hubiera
colisión). No se conoce hasta que la transacción se mina.

Consecuencias prácticas:

- El UID hay que **leerlo del valor de retorno** de `attest` — los 32 bytes de la respuesta —
  y emitirlo en `ScoreAttested`. No se puede calcular por adelantado ni en el contrato ni en
  el frente.
- Volver a atestiguar al mismo miembro por la misma junta **crea una attestation nueva**, no
  actualiza la anterior. `AlreadyExists()` protege a los schemas, no a las attestations. El
  historial de attestations de `/mi-score` va a crecer, y eso está bien: es un registro, no un
  estado.

### 5. La constante `MODEL_HASH` va a existir dos veces

`weights.rs` la declara como `&str` porque `model_hash()` la expone al frente. El schema pide
`bytes32`. Son dos representaciones del mismo valor, y **nada las mantiene sincronizadas**.

Si `quantize.py` emite un modelo nuevo y solo se actualiza una, las attestations van a
certificar un modelo que no fue el que calculó el score — y el error no se nota: el `bytes32`
se ve perfectamente válido. Vale una prueba que compruebe que el `&str` y el `B256` son el
mismo valor.

---

## Resumen para quien implemente

| Qué                          | Valor                                                                |
| ---------------------------- | -------------------------------------------------------------------- |
| EAS                          | `0x2521021fc8BF070473E1e1801D3c7B4aB701E1dE`                         |
| SchemaRegistry               | `0x45CB6Fa0870a8Af06796Ac15915619a0f22cd475`                         |
| Selector de `attest`         | `0xf17325e7`                                                         |
| Selector de `register`       | `0x60d7a278`                                                         |
| UID de nuestro schema        | `0xe1cd6720370dd3b885c72ea22f914a04f39d941bd951f151d97eb616dc17c78a` |
| ¿Registrado?                 | **todavía no** — sección 4                                           |
| Payload del schema           | 160 bytes planos, cinco palabras                                     |
| Valor a enviar               | **cero**, siempre                                                    |
| ¿Se puede probar la llamada? | no; se prueban el payload y el selector                              |

---

## Fuentes

- `ethereum-attestation-service/eas-contracts` — `contracts/IEAS.sol`,
  `contracts/ISchemaRegistry.sol`, `contracts/SchemaRegistry.sol`, `contracts/EAS.sol`,
  `deployments/arbitrum-sepolia/{EAS,SchemaRegistry}.json`
- Documentación de EAS: https://docs.attest.org
- La cadena, vía `https://sepolia-rollup.arbitrum.io/rpc` — `getBytecode`, `version()`,
  `getSchemaRegistry()`, `getSchema()`, `getAttestation()`, logs de `Registered` y `eth_call`
  de `attest`. Es la única fuente que no se puede quedar desactualizada.
