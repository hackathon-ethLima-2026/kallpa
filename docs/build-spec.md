# KALLPA — GUÍA DE CONSTRUCCIÓN (Build Spec)

**Para:** equipo nullVoice (Ely, Diego, Mariana, Francis) + cada sesión de Claude Code
**Qué es esto:** el mapa técnico exacto de TODO lo que se construye para Kallpa. No es el plan de días (ese es `kallpa-plan-maestro.md`). Esto es el "qué se codea y cómo", pensado para que cualquiera abra Claude Code, pegue un ticket, y sepa exactamente qué hacer sin inventar nada.
**Hackathon:** Ethereum Lima 2026 · Track Arbitrum · Bounty Advanced (Scaffold-Stylus + IA) · Demo Day **sáb 8 ago** · Feature freeze **jue 6, 12:00** · Entregables **mar 11**.

> **Regla de uso de este documento:** cuando abras una sesión de Claude Code para trabajar en un componente, pega SIEMPRE dos cosas: (1) el **§6 Interfaces compartidas** completo, y (2) el **ticket** de la §8 que te toca. El §6 es la ley — si un componente cambia una interfaz, se cambia PRIMERO en el §6 y se avisa al equipo. Así los 4 trabajan en paralelo sin romperse entre ellos.

---

## 0. Cómo usar este documento

- **Los humanos** leen §1–§5 una vez (contexto + setup), luego viven en §6 (interfaces), §7 (specs) y §8 (tickets).
- **Claude Code** recibe, por sesión, el §6 + el ticket puntual. No le pegues el documento entero cada vez: pega el contexto mínimo (§6 + ticket + el archivo que se edita).
- **Prioridad absoluta:** el componente **C3 (ScoreEngine en Stylus)** es la joya. Si algo se cae del scope, se cae por ahí NO. Lo que se recorta primero: Pool avanzado, ERC-4337, EZKL, animaciones del front.
- **Todo lo LOCKED no se discute a mitad de semana.** Cambiar una decisión LOCKED cuesta re-trabajo de varios; se decide en el daily, no en solitario.

---

## 1. Contexto del proyecto (ground truth)

**Kallpa = "la caja que no puede mentir ni robar".** Tres capas, una historia:

1. **Custodia** — la junta (pandero) se vuelve un smart contract. Cada miembro deposita su cuota en USDC; el contrato guarda el pozo y paga los turnos. El organizador ya no toca la plata: no puede desviarla ni desaparecer.
2. **Score que se computa solo** — un modelo de ML (regresión logística en punto fijo) corre **DENTRO de un contrato Arbitrum Stylus (Rust)** y calcula el score de crédito de cada miembro leyendo su historial on-chain. Nadie confía en nuestro servidor: **el score lo calcula Arbitrum**.
3. **Reputación bidireccional** — el Pool decide **recomputando tu historial vivo** en el momento de prestar (ADR-0003): si cumples, tu microcrédito crece; si fallas (cuota vencida derivada del reloj, disputa perdida), el crédito **se suspende solo, sin que nadie mande una transacción** (ADR-0005). El score se emite además como **attestation EAS**: la copia portable que viaja a cualquier fintech/coop que no puede leer tu junta.

**Qué gana puntos (criterios del jurado):** Innovación 25% · Ejecución Técnica 25% · Impacto 20% · UX 15% · Presentación 15%.

**Reglas que condicionan el código:**

- Debe estar **desplegado en red Arbitrum** (usamos **Arbitrum Sepolia**).
- **≥1 smart contract funcional** (tenemos varios).
- El **uso de blockchain debe ser esencial** — no decorativo. En Kallpa lo es: la custodia ES el producto y el score se COMPUTA en cadena.
- **Repo público**, primer commit posterior al kickoff (31 jul 4pm), **los 4 commitean a diario** (el jurado audita el historial).
- Se pueden usar frameworks/SDKs/modelos open source **citándolos en el README**.

**El momento WOW (20s, en vivo):** María, con su junta completa pagando puntual → clic → `record_score` computa su score EN CADENA (tx en Arbiscan, gas medido) → pide crédito y el Pool **recomputa su historial vivo** y le presta 200 USDC solo, sin leer una foto de nadie. "Este score no lo calculó nuestro servidor. Lo calculó Arbitrum."

---

## 2. Decisiones de arquitectura (LOCKED)

| #   | Decisión                                                                                                                                                                                            | Por qué                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **Framework: Scaffold-Stylus** (`Arb-Stylus/scaffold-stylus`)                                                                                                                                       | Es el requisito del bounty Advanced y ya es un monorepo Stylus + Next.js listo.                                                                                                                                |
| A2  | **UN solo repo (monorepo).** No repos separados de front/back.                                                                                                                                      | Scaffold-Stylus ya trae front y contratos juntos; el ABI se comparte solo. Separar = perder días en CI y sincronizar ABIs.                                                                                     |
| A3  | **TODOS los contratos en Rust/Stylus** (Junta, ScoreEngine, Pool, MockUSDC).                                                                                                                        | Una sola toolchain, un solo `yarn deploy`, un solo paquete. Mezclar Solidity pelea contra el framework. Maximiza el relato "todo en Stylus". _(Fallback en §13 si el equipo va mucho más rápido en Solidity.)_ |
| A4  | **Red: Arbitrum Sepolia** (chainId 421614).                                                                                                                                                         | Testnet oficial del ecosistema, gratis, cumple la regla. Arbitrum One solo si sobra tiempo.                                                                                                                    |
| A5  | **Modelo: regresión logística** de 8 features, en punto fijo i128 (escala 1e6). Árbol de decisión como fallback.                                                                                    | LR da un score continuo 0–1000 ideal para tramos de LTV y es "el modelo de IA" reconocible. El árbol (fallback) da equivalencia exacta on/off-chain sin sigmoide.                                              |
| A6  | **Reputación bidireccional**: el crédito se decide **recomputando en vivo** (ADR-0003) y el default se **deriva del reloj** (ADR-0005). EAS es el **export portable**, no el mecanismo de decisión. | La mejora "Kallpa mejorado", endurecida en la revisión.                                                                                                                                                        |
| A7  | **No hay backend tradicional ni base de datos.** Los contratos SON el backend; la blockchain ES la base de datos.                                                                                   | Menos superficie, más "blockchain esencial", deploy del front gratis en Vercel.                                                                                                                                |

**Diagrama de arquitectura** — el entregable oficial vive en **`docs/architecture.png`** (fuente `docs/architecture.mmd`); ese es el único canónico. Este es el mismo flujo:

```mermaid
flowchart TB
    M[María y miembros] -->|cuotas mUSDC| J[Junta · Stylus<br/>custodia · contadores O(1)<br/>integridad aportado−distribuido==balanceOf<br/>defaults derivados del reloj]
    J -->|history en vivo| S[ScoreEngine · Stylus<br/>compute_score view · record_score tx · attest tx]
    P[Pool · Stylus<br/>request_loan recomputa en vivo] -->|recomputa: compute_score| S
    S -->|attest| E[EAS attestation<br/>score · positive · juntaId · portable]
    P -->|presta mUSDC| M
    J -.->|integridad + cobertura| Q[/auditar · QR sin wallet]
    E -.->|mismo estándar| F[Futuro: fintechs, coops, seguros]
```

---

## 3. Stack y toolchain exacto (versiones verificadas)

> Versiones tomadas del repo oficial de Scaffold-Stylus. Que **todos** instalen exactamente esto el día 1; una versión distinta de `cargo-stylus` es la causa #1 de "a mí no me compila".

| Herramienta      | Versión / requisito                             |
| ---------------- | ----------------------------------------------- |
| Node.js          | ≥ v20.18                                        |
| Yarn             | v2+ (el repo usa Yarn workspaces)               |
| Rust / Cargo     | vía `rustup`, toolchain **1.91.0** (pinned)     |
| `cargo-stylus`   | **0.10.8** (pinned)                             |
| target WASM      | `wasm32-unknown-unknown`                        |
| Foundry (`cast`) | última                                          |
| Solc             | última (para interfaces/ABIs)                   |
| Docker           | última (el nitro-devnode local corre en Docker) |

**Comandos de instalación de la toolchain de Stylus:**

```bash
# Rust + target WASM + cargo-stylus, en las versiones pinneadas
rustup toolchain install 1.91.0 --profile minimal
rustup target add wasm32-unknown-unknown --toolchain 1.91.0
cargo +1.91.0 install --force --locked cargo-stylus@0.10.8

# Foundry (para cast)
curl -L https://foundry.paradigm.xyz | bash && foundryup

# Yarn 3.2.3 (el repo lo fija en packageManager). Si `corepack enable` falla por
# permisos en Windows, instala los shims en un directorio propio que esté en el PATH:
corepack enable --install-directory ~/bin
```

> ### ⚠️ En Windows, `cargo-stylus` NO compila — y hay que parchearlo
>
> **Verificado el 2 de agosto en Windows 11.** `cargo install cargo-stylus@0.10.8` falla con
> `error[E0433]: could not find 'unix' in 'os'`. La causa: `src/commands/debug_hook.rs` importa
> `std::os::unix::net::UnixListener` y el módulo se declara **sin ningún `#[cfg]`**, así que
> también se compila en Windows. Pasa igual con `0.10.7`, y **`0.10.8` es la última versión
> publicada**: no hay a dónde actualizar.
>
> La solución está automatizada en **`scripts/install-cargo-stylus-windows.sh`** — descarga el
> código, marca ese módulo como unix-only y compila desde ahí. Es seguro: el único uso de
> `debug_hook` está dentro de `if args.debugger == "stylusdb"`, un camino de depuración que este
> proyecto no usa (`check`, `deploy` y `export-abi` no lo tocan).
>
> ```bash
> bash scripts/install-cargo-stylus-windows.sh     # solo en Windows
> ```
>
> En Linux y macOS el comando normal funciona y este script no hace falta. **Si alguien del
> equipo prefiere no parchear nada, la alternativa es trabajar dentro de WSL2 con una distro
> Linux** (`wsl --install -d Ubuntu`) e instalar ahí toda la toolchain.

> ### ⚠️ En Windows, los tests necesitan dos cosas más (ya resueltas en el repo)
>
> Compilar a WASM y desplegar funciona nativo en Windows sin tocar nada. Lo que no compilaba
> eran los **tests**, por dos fallos de enlazado distintos. Los dos ya están arreglados en el
> repo; esto queda documentado para que nadie los "limpie" pensando que sobran.
>
> **1. `native_keccak256` sin resolver.** `stylus-proc` pide `alloy-primitives` con el feature
> `native-keccak`, que importa ese símbolo del entorno. En WASM lo provee la VM, pero
> `stylus-proc` es un proc-macro y se compila para el host. En `alloy-primitives`,
> `native-keccak` **se desactiva** si está presente `tiny-keccak`, así que cada contrato lleva
> un `build.rs` vacío y esta sección, que activa ese feature en el grafo del host (bajo
> `resolver = "2"` ese grafo es el de las build-dependencies, no el de las normales):
>
> ```toml
> build = "build.rs"
>
> [build-dependencies]
> alloy-primitives = { version = "=0.8.20", features = ["tiny-keccak"] }
> ```
>
> **2. Los 34 hooks de la VM sin resolver** (`emit_log`, `msg_sender`, `storage_load_bytes32`…).
> Existen solo dentro de la cadena. `contracts/hostio_stubs.rs` los define vacíos para satisfacer
> al enlazador —nunca se ejecutan, porque los tests corren sobre `TestVM`— y cada contrato lo
> incluye en su módulo de tests:
>
> ```rust
> #[cfg(test)]
> #[path = "../../hostio_stubs.rs"]
> mod hostio_stubs;
> ```
>
> **3. `yarn stylus:test` corre `cargo test --lib`, no `cargo test`.** Sin `--lib`, Cargo también
> construye el `cdylib`, y una DLL de Windows no admite símbolos sin resolver. El binario de
> tests sí, y es el único que necesitamos.
>
> Verificado el 2 de agosto en Windows 11: `yarn stylus:test` pasa en verde.

Extras del proyecto que NO vienen en Scaffold-Stylus (se instalan aparte, en `packages/ai-model`): Python 3.11+, `scikit-learn`, `pandas`, `numpy`, `matplotlib`, `jupyter`.

---

## 4. Estructura del monorepo (árbol exacto)

Partimos de Scaffold-Stylus y le agregamos `packages/ai-model` y `docs/`. Estructura objetivo:

```
kallpa/
├── packages/
│   ├── nextjs/                     # Frontend (viene con Scaffold-Stylus)
│   │   └── app/
│   │       ├── mi-junta/           # C7 — crear/unirse, depositar, ver pozo y turnos
│   │       ├── mi-score/           # C7 — score + attestations + link Arbiscan
│   │       ├── pedir-credito/      # C7 — pedir préstamo al Pool según score
│   │       └── auditar/[juntaId]/  # C8 — página pública del QR (sin wallet)
│   │
│   ├── stylus/
│   │   ├── contracts/              # Contratos Rust/Stylus (cargo workspace, glob)
│   │   │   ├── mock_usdc/          # C1 — ERC-20 de prueba
│   │   │   ├── junta/              # C2 — custodia, cuotas, turnos, historial
│   │   │   ├── score_engine/       # C3 — el motor ML on-chain (LA JOYA)
│   │   │   └── pool/               # C5 — presta/suspende recomputando el score en vivo
│   │   └── scripts/                # Scripts de deploy (vienen con Scaffold-Stylus)
│   │
│   └── ai-model/                   # C6 — Python, NO se despliega on-chain
│       ├── generate_dataset.py     # dataset sintético de juntas
│       ├── train.py                # entrena LR, reporta AUC, exporta pesos
│       ├── quantize.py             # cuantiza pesos a i128 (escala 1e6) -> snippet Rust
│       ├── test_equivalence.py     # compara Python vs math de punto fijo
│       ├── weights.json            # pesos crudos + params de escalado
│       ├── weights_fixed.rs.txt    # constantes listas para pegar en score_engine
│       └── notebook.ipynb          # narrativa del modelo (transparencia = pitch)
│
├── nitro-devnode/                  # chain local (viene con Scaffold-Stylus)
├── docs/
│   ├── architecture.png            # diagrama (entregable) exportado del mermaid
│   ├── addresses.md                # direcciones desplegadas + links Arbiscan
│   └── third-party.md              # citas de herramientas (regla del hackathon)
├── .env.example                    # plantilla de variables (ver §Apéndice)
└── README.md                       # pitch de 30s + cómo correr + direcciones + citas
```

**Nombres LOCKED de los 4 contratos:** `mock_usdc`, `junta`, `score_engine`, `pool`. No renombrar (rompe deploy scripts y el front).

---

## 5. Setup inicial (paso a paso — día 1)

> **Esta parte ya está hecha.** El repo público existe con la base de Scaffold-Stylus,
> la documentación y el contrato `mock_usdc`:
> **https://github.com/hackathon-ethLima-2026/kallpa**
>
> El primer commit es posterior al kickoff, como exige el reglamento. Lo que sigue pendiente
> es agregar a los otros tres como collaborators, y que cada uno haga su setup.

**Cada uno en su máquina:**

```bash
# 1. Clonar el repo del equipo
git clone https://github.com/hackathon-ethLima-2026/kallpa.git
cd kallpa

# 2. Instalar dependencias
yarn install
# (no hay submódulos que inicializar: nitro-devnode vive dentro del repo)

# 3. Instalar la toolchain de Stylus — ver §3.
#    En Windows es OBLIGATORIO este script, o cargo-stylus no compila:
bash scripts/install-cargo-stylus-windows.sh

# 4. Verificar que todo corre
yarn stylus:test    # los tests de los contratos deben pasar en verde
yarn chain          # terminal 1: devnode local (Docker)
yarn deploy         # terminal 2: despliega en la cadena local
yarn start          # terminal 3: front en http://localhost:3000 (Debug Contracts)
```

**Además, cada uno:** crear una wallet **de prueba** (nunca una con fondos reales) y pedir ETH de prueba de Arbitrum Sepolia en un faucet.

**Config de red — Arbitrum Sepolia (LOCKED):**

- Chain ID: **421614**
- RPC: `https://sepolia-rollup.arbitrum.io/rpc`
- Explorer: `https://sepolia.arbiscan.io`
- Moneda: ETH de prueba (de faucet)

**Definition of Done del día 1:** el repo público existe, los 4 son collaborators, `yarn start` corre en local en las 4 máquinas, y el primer commit está pusheado.

---

## 6. Interfaces compartidas (EL CORAZÓN — pegar esto en CADA sesión de Claude Code)

Esta sección es **la ley**. Es lo único que los 4 componentes comparten. Mientras nadie cambie el §6 sin avisar, los 4 pueden codear en paralelo sin romperse. Si necesitas cambiar una interfaz: **edítala aquí primero, avisa en el daily, y recién entonces cámbiala en el código.**

### 6.1 El feature vector (idéntico en Junta, ScoreEngine y el modelo Python)

Ocho features, **en este orden exacto**, cada una con su `(min, max)` de dominio para la normalización. La Junta las expone (O(1)), el ScoreEngine las lee y normaliza on-chain, el modelo Python entrena con las mismas. Si el orden, la escala o los rangos cambian en un lado y no en el otro, el score sale mal y nadie sabrá por qué.

| #   | Nombre                | Tipo         | Descripción                                                                                                                                                                                            | (min, max) dominio |
| --- | --------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| 0   | `tasa_cumplimiento`   | `i128` (1e6) | fracción de cuotas debidas efectivamente pagadas: `cuotas_pagadas / ciclos_transcurridos` (**guarda: `ciclos_transcurridos == 0` ⇒ `SCALE`**), clamp [0,1] — comportamiento, **NO derivada del reloj** | 0 – SCALE          |
| 1   | `pagos_puntuales`     | `u32`        | cuotas pagadas a tiempo (eager, al depositar)                                                                                                                                                          | 0 – 12             |
| 2   | `pagos_atrasados`     | `u32`        | cuotas pagadas tarde (eager, al depositar)                                                                                                                                                             | 0 – 12             |
| 3   | `defaults`            | `u32`        | cuotas vencidas e impagas AHORA (derivado del reloj — ADR-0005)                                                                                                                                        | 0 – 12             |
| 4   | `atraso_max_periodos` | `i128` (1e6) | peor atraso, en periodos fraccionarios (ADR-0006)                                                                                                                                                      | 0 – 3·SCALE        |
| 5   | `defaults_tras_cobro` | `u32`        | mora acumulada tras cobrar el pozo (ADR-0007)                                                                                                                                                          | 0 – 12             |
| 6   | `antiguedad_periodos` | `u32`        | periodos desde que se unió (derivado del reloj, topado)                                                                                                                                                | 0 – 12             |
| 7   | `disputas_perdidas`   | `u32`        | disputas/reclamos perdidos                                                                                                                                                                             | 0 – 5              |

Los `(min, max)` son **topes de dominio** (constantes), no el min/max del dataset; viajan con los pesos en `weights_fixed.rs.txt` (ADR-0006). Features 3, 5 y 6 se **derivan del reloj** al leer (ADR-0005); 1, 2 y 4 se escriben **eager** al depositar; la **0 es una razón de comportamiento** (`cuotas_pagadas / ciclos_transcurridos`) — no premia el paso del tiempo y, por ser una razón, no duplica a la 6.

**Struct compartido (Rust, va en un módulo común o duplicado idéntico):**

```rust
pub struct Features {
    pub tasa_cumplimiento: i128,     // razón cuotas_pagadas / ciclos_transcurridos en 1e6 (comportamiento, no reloj)
    pub pagos_puntuales: u32,        // eager (al depositar)
    pub pagos_atrasados: u32,        // eager (al depositar)
    pub defaults: u32,               // derivado del reloj (ADR-0005)
    pub atraso_max_periodos: i128,   // punto fijo 1e6, periodos fraccionarios (ADR-0006)
    pub defaults_tras_cobro: u32,    // mora post-cobro; snapshot en distribute (ADR-0007)
    pub antiguedad_periodos: u32,    // derivado del reloj, topado
    pub disputas_perdidas: u32,
}
```

### 6.2 Interfaz Junta → ScoreEngine

La Junta expone estas funciones `view` (O(1) — lee agregados guardados y deriva las features temporales del reloj; ADR-0003). El ScoreEngine y el front las llaman vía `sol_interface!`.

```
history(junta_id: u32, member: address) -> Features
    // las 8 features de §6.1, del PAR (junta, miembro) — ADR-0001
verify_integrity(junta_id: u32) -> (aportado: U256, distribuido: U256, balance_real: U256, cuadra: bool)
    // cuadra ⇔ aportado − distribuido == mUSDC.balanceOf(junta); ledger externo, NO espejo interno — ADR-0004
cycle_coverage(junta_id: u32) -> (ciclo: u32, pagadas: u32, total: u32)   // "Ciclo N: k de M" — ADR-0004
```

`history` es la más importante; `verify_integrity` y `cycle_coverage` alimentan el QR (§C8). **No hay `check_solvencia` acá** — la solvencia vive en el Pool (§6.7, ADR-0004).

**`ciclos_totales` = `members.length`** (una junta rotativa tiene exactamente un ciclo por miembro). Es el tope de `min(…, ciclos_totales)` que congela la junta completa (ADR-0005) — definido acá para que no quede ambiguo en ningún contrato.

### 6.3 Convención de punto fijo (LOCKED)

- Escala: `SCALE = 1_000_000` (1e6). Un valor real `v` se representa como `v * SCALE` en `i128`.
- Pesos, bias y resultados intermedios en `i128` con esta escala.
- **Normalización: min-max con clamp a [0,1] por feature** (ADR-0006), con `(min,max)` = los topes de dominio del §6.1. Corre **on-chain en el ScoreEngine, ANTES del producto punto** — es la barrera contra entradas fuera de rango (un valor absurdo satura en el borde, no explota el punto). **NO estandarización.**
- **Artefacto único:** `quantize.py` emite pesos + rangos en `weights_fixed.rs.txt`. Set casado; R2 pega un bloque.
- **Redondeo de la división `(x−min)/(max−min)` lockeado idéntico** en el mirror de Python y en Rust, o el T7 falla por 1–2 puntos sin causa adivinable.
- El score final es un `u16` en **0–1000**. Python y Rust coinciden en **±5 puntos** (test de equivalencia, §9).

### 6.4 Interfaz del ScoreEngine (lo que expone)

**Tres funciones** — cobertura mínima de tres requisitos distintos (ADR-0002/0003):

```
compute_score(junta_id: u32, member: address) -> u16
    // VIEW. Lee history() EN VIVO, normaliza+clampa, LR + sigmoide. NO persiste.
    // La fuente de verdad viva: la usan el Pool (decidir), el front y /auditar (mostrar). ADR-0003.
record_score(junta_id: u32, member: address) -> u16
    // TX. _compute_and_persist: computa + escribe LatestScore{score, positive, timestamp}
    // con clave (junta_id, member) + emite ScoreComputed. SIN EAS. Es el WOW (hash + gas en Arbiscan). ADR-0002.
attest(junta_id: u32, member: address) -> bytes32
    // TX. _compute_and_persist + escribe la attestation EAS (RECOMPUTA en vivo, no lee foto). ADR-0003.
    // La copia portable que viaja. Emite ScoreAttested.
```

- Factoreo: un privado `_compute_and_persist` (y un `_infer` puro para la view); las tres públicas son wrappers delgados — cero lógica duplicada (ADR-0002).
- `LatestScore` es evidencia + entrada de `attest` + trail visible — **NO es entrada de decisión** (el Pool recomputa, no lee la foto; ADR-0003).
- Jerarquía de verdad: **Junta (hechos) → `compute_score` (función pura viva) → `LatestScore` / EAS (evidencia y export)**.
- **No hay `check_solvencia`** — se fue a la Junta/Pool (ADR-0004).
- Eventos: `ScoreComputed(junta_id, member, score)`, `ScoreAttested(junta_id, member, score, positive, uid)`.

### 6.5 Schema EAS (LOCKED)

Se registra UNA vez en Arbitrum Sepolia con el `SchemaRegistry` (dirección en el Apéndice). String del schema:

```
uint16 score, bool positive, uint32 juntaId, bytes32 modelHash, bytes32 featuresCommitment
```

- `score`: 0–1000 computado on-chain.
- `positive`: `true` = buen comportamiento (crédito crece); `false` = incumplimiento (crédito suspendido).
- `juntaId`: la junta de la que salió el score — la attestation es del miembro pero **se autodescribe** de dónde vino (ADR-0001).
- `modelHash`: hash del modelo desplegado (constante en el contrato) — prueba de qué modelo calculó.
- `featuresCommitment`: `keccak256` del feature vector usado — permite auditar sin exponer datos crudos.
- Campos nativos de EAS: `recipient` = dirección del miembro (por eso **viaja**); `expirationTime` = ahora + 90 días; `revocable` = true.
- `attest` **recomputa en vivo** antes de emitir — nunca certifica una foto vieja (ADR-0003).

### 6.6 Reglas de reputación bidireccional (LOCKED)

- **Umbral de `positive` (LOCKED):** `positive = (score >= 400)` — el mismo corte que el primer tramo del Pool (§6.7); un solo número gobierna "¿prestamos?" y "¿la reputación es positiva?", así R2 no inventa uno el día 3.
- **Positiva** (`positive = true`, score ≥ 400): buen comportamiento. El Pool amplía la línea.
- **Negativa** (`positive = false`): default (derivado del reloj) o disputa perdida. Score bajo → el Pool no presta.
- **Se evalúa en el momento de decidir, no por un push.** El Pool recomputa el score en vivo en `request_loan` (ADR-0003) y el default se deriva del tiempo sin que nadie lo escriba (ADR-0005). Por eso "se suspende solo" es **literal**: cero transacciones y el crédito igual se cierra.
- La attestation EAS es el **export portable** para prestamistas de afuera — no la entrada de decisión de adentro.

### 6.7 Interfaz del Pool (lo que expone)

```
deposit_liquidity(amount: U256)              // fondear el pool con USDC-mock
request_loan(junta_id: u32) -> U256          // RECOMPUTA: llama compute_score(junta_id, member) EN VIVO,
                                             // aplica tramos, transfiere. NO lee foto. ADR-0003.
repay(loan_id: U256)                          // repaga; cierra el préstamo
loan_of(member: address) -> Loan             // estado del préstamo (para el front)
liquidity_status() -> (liquidez: U256, prestado: U256, disponible: U256)   // solvencia del Pool — ADR-0004
```

- El Pool guarda la **dirección del ScoreEngine** (seteable en deploy) y recomputa a través de él (staticcalls Pool→ScoreEngine→Junta).
- **Tramos de LTV por score (LOCKED, ajustables en el daily):** score < 400 → sin crédito; 400–599 → 50 USDC; 600–749 → 120 USDC; 750–1000 → 200 USDC. Aplicados al score **vivo**.

### 6.8 MockUSDC (lo que expone)

ERC-20 estándar de 6 decimales con un `mint(to, amount)` abierto (solo para la demo). Funciones: `mint`, `transfer`, `transferFrom`, `approve`, `balanceOf`, `allowance`. Símbolo `mUSDC`.

---

## 7. Especificación por componente (con criterios de aceptación)

Cada componente tiene: **dueño sugerido**, **qué construir**, **qué NO construir** (para no sobre-diseñar), y **criterios de aceptación** (Definition of Done testables). El "qué NO" es tan importante como el "qué".

### C1 — MockUSDC (Rust/Stylus) · dueño: R1

**Construir:** ERC-20 de 6 decimales con `mint` abierto. Es el dinero de toda la demo.
**No construir:** permit, fees, pausable, upgradeability.
**Aceptación:** se despliega en Sepolia; `mint` acuña a una wallet; `transfer`/`approve`/`transferFrom` funcionan; el front muestra el balance.

### C2 — Junta (Rust/Stylus) · dueño: R1 — **el contrato que carga los invariantes**

**Construir:**

- `create_junta(members: address[], cuota: U256, periodo: u64) -> u32`. Guarda `start_at = block.timestamp` y `periodo` por junta.
- `deposit(junta_id)` — paga la cuota impaga más antigua (FIFO; requiere `approve`). **Eager (ADR-0006):** clasifica puntual/atrasado y actualiza `atraso_max_periodos = max(0, (now − vencimiento)) / periodo`. O(1).
- `distribute(junta_id)` — **permissionless** (lo llama el dueño del turno, que cobra; ADR-0005). Entrega el pozo, avanza el turno, y **guarda el snapshot `defaults_al_cobrar`** del miembro (ADR-0007).
- `history(junta_id, member) -> Features` — §6.2, O(1). **Deriva del reloj** `defaults`, `defaults_tras_cobro`, `antiguedad_periodos`, topados con `min(…, ciclos_totales)` (ADR-0005); calcula `tasa_cumplimiento = ciclos_transcurridos == 0 ? SCALE : clamp(cuotas_pagadas·SCALE / ciclos_transcurridos, 0, SCALE)` (comportamiento, no reloj; **la guarda evita la división por cero en junta recién creada — en Rust panica**). `defaults = max(0, min(ciclos_transcurridos, N) − cuotas_pagadas)`; `defaults_tras_cobro = max(0, defaults − defaults_al_cobrar)`.
- `verify_integrity(junta_id)`, `cycle_coverage(junta_id)` — §6.2 (ADR-0004). **Único exit de plata: `distribute`** (penalidades reputacionales, no monetarias — mantiene la identidad de conservación).
- `report_dispute(member)` — incrementa `disputas_perdidas`.
- Eventos: `JuntaCreated`, `Deposited`, `Distributed`.
  **No construir:** multi-token, gobernanza, cancelación compleja, penalidades monetarias, estado "pausada" (ADR-0005 lo deja fuera de la semana).
  **Aceptación:** junta de 8 miembros; corrida completa con **tiempo real** (`periodo = 60s`) deja fijas sus features (**junta completa**; ADR-0005); `verify_integrity` cuadra contra `balanceOf` y salta a `cuadra=false` si se le mandan tokens sueltos; un miembro que cobra y deja de pagar muestra `defaults_tras_cobro > 0`.

### C3 — ScoreEngine (Rust/Stylus) · dueño: R2 (solo) — **LA JOYA, máxima prioridad**

**Construir:**

- Constantes: pesos (`i128`, 1e6) + **rangos `(min,max)`** + bias + `modelHash`, todo de `packages/ai-model/weights_fixed.rs.txt` (un solo artefacto; ADR-0006).
- Punto fijo: **normaliza+clampa cada feature a [0,1]** (min-max, on-chain) y luego `Σ wᵢ·xᵢ + b` en `i128`. Redondeo de la división lockeado (ADR-0006).
- Sigmoide **piecewise-linear** sobre z∈[−6,6] (fuera satura a 0/1) → score 0–1000. `positive = (score >= 400)` (§6.6).
- **Tres funciones (§6.4):** `compute_score` (view), `record_score` (tx, persiste `LatestScore`, el WOW), `attest` (tx + EAS). Factoreo `_compute_and_persist` / `_infer`.
- `sol_interface!` a `IJunta` (`history`) y a `IEAS` (`attest`).
- Medir el gas de `record_score` — cross-contract read + inferencia + `SSTORE` + evento = "computar y registrar", sin EAS (ADR-0002). Va al deck.
  **No construir:** `check_solvencia` (se fue a la Junta/Pool, ADR-0004), reentrenamiento on-chain, redes neuronales, >12 features.
  **Aceptación:** `compute_score` = Python ±5 pts en 20 vectores; `record_score` deja un hash + gas en Arbiscan el **día 3**; `attest` emite una attestation real; un caso negativo da `positive=false`.
  **Pareja (defecto #8):** T6 se hace **R1+R2 en pareja** el día 3 — dos personas entienden la joya (redundancia sobre el único componente que ES el proyecto).

### C4 — Integración EAS · dueño: R3

**Construir:** registrar el schema del §6.5 (**con `juntaId`**) una vez; el `sol_interface!` de `IEAS` que usa el ScoreEngine; un script en `packages/stylus/scripts` que registra el schema y guarda el `schemaUID` en `docs/addresses.md`.
**No construir:** resolver contracts de EAS, schemas múltiples.
**Aceptación:** el schema existe en Sepolia; una attestation emitida por el ScoreEngine se lee con el EAS SDK desde el front; el `featuresCommitment` verifica.
**Fallback (§13):** si llamar EAS desde Stylus se traba, `KallpaAttestations` propio (contrato mínimo con el mismo evento/estructura).

### C5 — Pool de microcrédito (Rust/Stylus) · dueño: R4 (con R2)

**Construir:** `deposit_liquidity`; `request_loan(junta_id)` que **recomputa el score en vivo** llamando `compute_score(junta_id, member)` (NO lee foto; ADR-0003), aplica tramos (§6.7) y transfiere; `repay`; `loan_of`; `liquidity_status` (solvencia del Pool; ADR-0004). Guarda la **dirección del ScoreEngine** (seteable).
**No construir:** intereses compuestos, liquidaciones, colateral, tasas variables. **El círculo virtuoso `repay → score`** (recorte declarado): repagar un préstamo NO mejora el score — el score sale solo del historial de la junta; el crédito crece **completando ciclos de junta**, no repagando préstamos. Si el deck promete "cumples y tu crédito crece", que sea por los ciclos de junta; esa flecha del repago no existe esta semana.
**Aceptación:** con historial bueno recomputado, `request_loan` transfiere según tramo; con **default derivado del reloj** (nadie tocó el contrato), **revierte "crédito suspendido"**; `liquidity_status` baja cuando un préstamo queda impago.

### C6 — Modelo IA + dataset (Python) · dueño: R3

**Construir:**

- `generate_dataset.py`: 500–1000 miembros con las **8 features del §6.1 actualizado** (`atraso_max_periodos` en periodos, `defaults_tras_cobro`) y label `default` (0/1). Correlaciones creíbles: **mora post-cobro predice fuerte**, atraso pre-cobro débil, más disputas → más default; global ~10–15%.
- `train.py`: `LogisticRegression` de sklearn; reporta **AUC** (meta ≥0.80).
- `quantize.py`: pesos a `i128` (1e6) **+ rangos `(min,max)`** → `weights_fixed.rs.txt` (**artefacto único**, listo para pegar en C3) + `modelHash`.
- **Stub (defecto #8):** el **día 2**, R2+R3 fijan el formato de `weights_fixed.rs.txt` y R3 emite una versión con pesos falsos, para que T6 no espere al modelo entrenado.
- `test_equivalence.py`: mirror de punto fijo en Python vs `compute_score` de Rust, **mismo redondeo** (ADR-0006), ±5 pts sobre N vectores.
- `notebook.ipynb`: narrativa (features, AUC, matriz de confusión) — transparencia = pitch.
  **No construir:** datos reales de personas, features no derivables on-chain, `monto`/proxies de riqueza (ADR-0007), modelos no portables a punto fijo.
  **Aceptación:** AUC ≥0.80; stub listo el día 2; `weights_fixed.rs.txt` se pega en C3 sin edición manual; `test_equivalence.py` pasa.

### C7 — Frontend (Next.js / Scaffold-Stylus) · dueño: R4

**Construir 3 pantallas, español simple, cero jerga:**

- **Mi Junta** (`/mi-junta`): crear o unirse a una junta, depositar cuota (con `approve`), ver miembros, quién pagó, saldo del pozo, próximo turno. Botón "Ver en Arbiscan" en cada acción.
- **Mi Score** (`/mi-score`): score actual (grande, con el view `compute_score`), historial de attestations con link a EAS/Arbiscan, y botón **"Registrar mi score en cadena"** que dispara `record_score` (tx — el WOW, deja el hash; ADR-0002).
- **Pedir crédito** (`/pedir-credito`): tramo/LTV según el **score vivo**, botón `request_loan`, estado del préstamo, y el caso negativo ("crédito suspendido") legible.
  **No construir:** modo oscuro extra, i18n, dashboards analíticos, cuentas de usuario (la wallet ES la cuenta).
  **Aceptación:** el flujo completo de María corre desde el front en Sepolia; estados de carga y errores en español; usa el design system Kallpa (colores del deck).

### C8 — Página de auditoría + QR · dueño: R4

**Construir:** ruta pública `/auditar/[juntaId]` que **NO requiere wallet**. Muestra: **integridad** `aportado − distribuido == balanceOf` con "CUADRA ✓ / NO CUADRA" (llama `verify_integrity`; ADR-0004), **cobertura** "Ciclo N: k de M cuotas" (`cycle_coverage`), número de miembros, y link a Arbiscan. Generar el QR que apunta a esta URL (10 copias impresas para el jurado).
**No construir:** login, filtros, histórico gráfico, "SOLVENTE ✓" (un check que no puede fallar no prueba nada; ADR-0004).
**Aceptación:** se escanea sin wallet y muestra la integridad en vivo; **mandar tokens sueltos a la junta hace saltar el QR a "NO CUADRA"** (el artefacto se puede mostrar fallando — la prueba máxima).

---

## 8. Tickets listos para Claude Code (uno por sesión)

Cada ticket = una sesión de Claude Code. **Al abrir la sesión, pega: (1) el §6 completo, (2) el ticket, (3) el archivo que se edita.** Los tickets están ordenados por dependencia. El día es sugerido (ver `kallpa-plan-maestro.md` para el cronograma completo).

> Formato de arranque sugerido para pegar en Claude Code:
> _"Trabajo en el repo Kallpa (Scaffold-Stylus, monorepo, contratos en Rust/Stylus, red Arbitrum Sepolia). Acá están las interfaces compartidas [pega §6]. Este es mi ticket [pega el ticket]. Respeta los nombres y las interfaces al pie de la letra; si algo no cuadra con el §6, pregúntame antes de cambiarlo."_

**T1 · MockUSDC (C1) · R1 · día 2**
Crea el contrato `mock_usdc` con `yarn new-module mock_usdc`. Implementa ERC-20 de 6 decimales con `mint` abierto (§6.8). Añade un test que acuñe y transfiera. DoD: desplegado en Sepolia, balance visible en el front.

**T2 · Junta v1 (C2) · R1 · día 2–3**
Crea `junta`. Implementa `create_junta` (con `start_at`+`periodo`), `deposit` (FIFO, eager puntual/atraso + `atraso_max_periodos`), `distribute` (permissionless + snapshot `defaults_al_cobrar`), turno rotativo. DoD: junta de 8 miembros, ciclos corridos con **tiempo real** (`periodo=60s`), pozo distribuido correcto. _(Aún sin `history()` completo — va en T4.)_

**T3 · Dataset + modelo (C6) · R3 · día 2–3**
En `packages/ai-model`: `generate_dataset.py` (500–1000 filas, 8 features de §6.1, default ~10–15%), `train.py` (LR, AUC ≥0.80). DoD: `weights.json` generado, AUC reportado en el notebook.

**T4 · Junta.history() (C2) · R1 · día 3**
Añade a `junta` la función `history(junta_id, member) -> Features` **exactamente** como §6.2 (O(1); deriva del reloj `defaults`/`defaults_tras_cobro`/`antiguedad`, topados con `min(…,N)`; `tasa_cumplimiento` de las cuotas pagadas con guarda `ciclos_transcurridos==0 ⇒ SCALE`, no del reloj), más `report_dispute`. DoD: `history()` devuelve las 8 features en orden; un ScoreEngine dummy las lee vía `sol_interface!`.

**T5 · Cuantización (C6) · R3 · día 3**
`quantize.py` → `weights_fixed.rs.txt` (constantes i128 escala 1e6) + `modelHash`. DoD: el archivo se pega en C3 sin edición manual.

**T6 · ScoreEngine — inferencia (C3) · R1+R2 en pareja · día 3 — EL DÍA CLAVE**
Crea `score_engine`. Pega el artefacto de T5 (pesos+rangos). Implementa normalización min-max+clamp on-chain (§6.3), sigmoide piecewise-linear, `compute_score(junta_id, member)` (view) y **`record_score(junta_id, member)` (tx que persiste `LatestScore` + emite `ScoreComputed`)**, leyendo `history()` de la junta real. DoD: **el score se computa EN el contrato Stylus leyendo datos reales de la Junta**; `record_score` deja **hash + gas en Arbiscan**; coincide con Python ±5 pts. _Si esto funciona hoy, el proyecto está ganado._

**T7 · Test de equivalencia (C6) · R3 · día 3–4**
`test_equivalence.py`: mira 20 vectores, compara Rust vs Python con **el mismo redondeo de la normalización** (ADR-0006). DoD: pasa con tolerancia ±5.

**T8 · Schema EAS + attest (C4+C3) · R3+R2 · día 4**
Registra el schema del §6.5 (**con `juntaId`**) con un script; añade `sol_interface!` de IEAS al `score_engine` y `attest()` (**recomputa en vivo**, §6.6). DoD: attestation real emitida por el contrato, visible en EAS scan / Arbiscan; `schemaUID` en `docs/addresses.md`.

**T9 · Integridad + solvencia (C2 + C5) · R1 + R4 · día 4**
`verify_integrity` y `cycle_coverage` en la **Junta** (identidad contra `balanceOf`; ADR-0004), y `liquidity_status` en el **Pool**. DoD: `verify_integrity` salta a `cuadra=false` con tokens sueltos; `liquidity_status` refleja liquidez − prestado.

**T10 · Pool (C5) · R4+R2 · día 4**
Crea `pool` con `deposit_liquidity`, `request_loan` (**recomputa `compute_score` en vivo**, tramos §6.7; ADR-0003), `repay`, `loan_of`, `liquidity_status`. Guarda la dirección del ScoreEngine (seteable). DoD: préstamo con score recomputado end-to-end; **caso negativo (default derivado, nadie tocó nada) revierte legible**.

**T11 · Front: Mi Junta (C7) · R4 · día 3–4**
Pantalla `/mi-junta` conectada al contrato real. DoD: crear/unirse/depositar desde el front en Sepolia.

**T12 · Front: Mi Score + Pedir crédito (C7) · R4 · día 4–5**
Pantallas `/mi-score` (botón **"Registrar mi score en cadena"** que dispara `record_score` — el WOW, deja el hash) y `/pedir-credito`. DoD: el WOW corre desde el front; el caso negativo se ve legible.

**T13 · Front: Auditar + QR (C8) · R4 · día 4–5**
`/auditar/[juntaId]` público + generación del QR. DoD: se escanea sin wallet y muestra **integridad** (CUADRA / NO CUADRA) + cobertura del ciclo en vivo.

**T14 · Integración E2E + seed (todos) · día 5**
Recorrer el flujo María 5 veces; script de seed con **dos juntas** (ADR-0005): la **buena** ("Las Emprendedoras", 8 miembros, `periodo=60s`, corrida completa → **junta completa** (features fijas); María muestra 8 ciclos, **alinear el deck**) y la **mala** (`periodo` largo, un miembro que cobró y dejó de pagar → `defaults_tras_cobro>0`), pool fondeado. DoD: demo completa grabable sin trucos; el negativo decae solo.

---

## 9. Testing y verificación

- **Contratos (Rust):** `yarn stylus:test` por contrato. Mínimo: MockUSDC (mint/transfer), Junta (ciclo completo + default), ScoreEngine (score de un vector conocido), Pool (préstamo positivo + rechazo negativo).
- **Equivalencia modelo:** `test_equivalence.py` — Rust vs Python ±5 pts sobre 20 vectores. **Es el test que prueba que "el score es verificable".** No se salta.
- **E2E manual (día 5):** el flujo María de punta a punta, 5 veces, anotando cada bug; los bugs se arreglan HOY, no mañana.
- **Verificación de gas:** medir el gas de `record_score` (la tx del WOW) y anotarlo en `docs/` y en el deck.
- **Prueba de jurado:** abrir todos los links en incógnito (demo, Arbiscan, /auditar) — si no abren sin login, no cuentan.

---

## 10. Deploy a Arbitrum Sepolia

```bash
# .env con la private key de deploy y el RPC (ver Apéndice). NUNCA commitear .env.
yarn deploy --network arbitrumSepolia        # despliega los 4 contratos
```

Tras cada deploy, **documentar en `docs/addresses.md`** (entregable oficial): por cada contrato → nombre, dirección, red (Arbitrum Sepolia / 421614) y link a `https://sepolia.arbiscan.io/address/<dir>`. Igual para el schemaUID de EAS.

Orden de deploy por dependencias: **MockUSDC → Junta → ScoreEngine (necesita dirección de Junta y EAS) → Pool (necesita ScoreEngine y MockUSDC — NO EAS: el Pool recomputa, no lee attestation)**. Guardar las direcciones y pasarlas como constructor args / config del front.

**Freeze (jue 6, 12:00):** deploy final + seed de datos demo. Después del freeze, cero features nuevas; solo se graban videos y se documenta.

---

## 11. Convenciones de equipo

- **Los 4 commitean a diario.** Un repo donde commitea una sola persona resta puntos de "equipo" (el jurado audita el historial). Aunque sea un commit chico, todos los días.
- **Ramas:** `main` siempre deployable. Rama por persona/componente, alineada al reparto del ADR-0008 (`r1/junta`, `r2/score-engine`, `r3/model-eas`, `r4/pool-front`), PRs chicos, merge rápido. En un hackathon no hace falta más ceremonia.
- **Commits:** mensajes claros en presente (`feat: history() en Junta`, `fix: escala de punto fijo`).
- **Daily 15 min, 9pm:** qué hice / qué haré / qué me bloquea.
- **Tablero:** GitHub Projects con los tickets T1–T14.
- **El §6 es sagrado:** cambiar una interfaz se anuncia en el daily antes de tocar código.
- **Citar terceros desde el día 1** en `docs/third-party.md`: Scaffold-Stylus, EAS, stylus-sdk, sklearn, cualquier LLM usado para código. La regla del hackathon lo exige.

---

## 12. Definition of Done global + checklist de entregables

**El proyecto está "listo" cuando:**

- [ ] Los 4 contratos desplegados en Arbitrum Sepolia con direcciones documentadas.
- [ ] El score se computa on-chain leyendo la Junta real y coincide con Python (±5); `record_score` deja el hash en Arbiscan.
- [ ] Attestation EAS emitida (positiva y negativa, con `juntaId`) y legible con el EAS SDK.
- [ ] Pool presta **recomputando el score en vivo** y rechaza cuando el default derivado del reloj lo baja — sin que nadie mande una tx.
- [ ] Front: las 3 pantallas + `/auditar` corren en Sepolia.
- [ ] QR escaneable muestra la **integridad** (CUADRA / NO CUADRA) + cobertura del ciclo, sin wallet.
- [ ] Flujo María grabable sin trucos.

**Entregables oficiales (dueño · fecha):**

- [ ] 🎥 Video pitch 2–3 min (problema, solución, valor, cómo usa Arbitrum) — R4+PO · vie 7
- [ ] 📑 Pitch deck PDF _(ya existe: `kallpa-pitch-deck.pdf`)_ — R4+PO · vie 7
- [ ] 🚀 Link a demo desplegada (Vercel) — R4 · jue 6
- [ ] 🎬 Video demo del funcionamiento — R4 · jue 6 (regrabable lun 10)
- [ ] 💻 Repo público con README + `docs/third-party.md` — PO · mar 11
- [ ] 📜 Contratos: dirección + red + link Arbiscan (los 4) — R1/R2 · jue 6
- [x] 🏗️ Diagrama de arquitectura — `docs/architecture.png` (ya generado, refleja el diseño endurecido) — PO · dom 2
- [ ] **Subir TODO el mar 11** (buffer de 24h; jamás el 12 a las 11pm)

---

## 13. Riesgos técnicos → fallback → fecha de decisión

| Riesgo                                                                                                    | Fallback                                                                                                                                                                                                                                                                             | Decide | Cuándo      |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ----------- |
| ~~Escribir Junta/Pool en Rust va muy lento~~ **RESUELTO (ADR-0008): los 4 escriben Rust, todo en Stylus** | (era: Junta y Pool en Solidity con Foundry; ScoreEngine siempre en Stylus)                                                                                                                                                                                                           | R1+PO  | ✓ cerrado   |
| Sigmoide en punto fijo no coincide con Python                                                             | Cambiar el modelo a **árbol de decisión** (solo comparaciones, equivalencia exacta, cero sigmoide).                                                                                                                                                                                  | R2+R3  | lun 3, 8pm  |
| Llamar EAS desde Stylus se traba                                                                          | `KallpaAttestations` propio: contrato mínimo con el mismo evento/estructura (§C4 fallback).                                                                                                                                                                                          | R3     | mar 4, 8pm  |
| Stylus no soporta el modelo de 8 features                                                                 | Reducir a 6 features; último recurso: score firmado off-chain verificado en contrato.                                                                                                                                                                                                | R2+PO  | lun 3, 8pm  |
| Pool no llega a tiempo                                                                                    | El negativo se muestra con `compute_score` sobre la junta "mala" (el score cae solo, en pantalla) + slide "así lo consume cualquier pool". _(Con ADR-0003 el Pool ES quien demuestra la suspensión vía revert; sin Pool, el negativo se ve por el score que cae, no por el revert.)_ | PO     | mié 5, 8pm  |
| Front atrasado                                                                                            | Demo desde Arbiscan + solo la pantalla `/auditar` con el QR.                                                                                                                                                                                                                         | R4+PO  | jue 6, 12pm |
| Alguien se enferma/desaparece                                                                             | Cada componente tiene su ticket (§8) y sus criterios de aceptación desde el día 1: otro lo retoma.                                                                                                                                                                                   | PO     | siempre     |

**Lo que se recorta primero si falta tiempo (en orden):** ERC-4337/gas invisible → EZKL → animaciones del front → tramos finos del Pool → revocación de attestations. **Nunca se recorta:** `compute_score` on-chain (C3).

---

## 14. Apéndice — variables, direcciones y links

**`.env.example` (plantilla; el `.env` real NO se commitea):**

```
# Deploy
PRIVATE_KEY=0x...                                   # wallet de prueba, SOLO testnet
RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
CHAIN_ID=421614

# EAS (Arbitrum Sepolia) — VERIFICAR antes de hardcodear (ver nota abajo)
EAS_ADDRESS=0x2521021fc8BF070473E1e1801D3c7B4aB701E1dE
EAS_SCHEMA_REGISTRY=0x45CB6Fa0870a8Af06796Ac15915619a0f22cd475
EAS_SCHEMA_UID=                                     # se llena tras registrar el schema (T8)

# Direcciones desplegadas (se llenan tras el deploy, T1/T2/T6/T10)
MOCK_USDC_ADDRESS=
JUNTA_ADDRESS=
SCORE_ENGINE_ADDRESS=
POOL_ADDRESS=
```

> **Nota sobre las direcciones EAS:** provienen del repo oficial `ethereum-attestation-service/eas-contracts` (deployments/arbitrum-sepolia). Antes de hardcodearlas en el contrato, R3 las **confirma** con el EAS SDK o en `docs.attest.org/docs/quick--start/contracts`, porque una dirección equivocada hace perder horas. Si EAS diera problemas, aplica el fallback `KallpaAttestations` (§13).

**Links de referencia:**

- Scaffold-Stylus (repo): https://github.com/Arb-Stylus/scaffold-stylus
- Scaffold-Stylus (docs): https://arb-stylus.github.io/scaffold-stylus-docs/
- Arbitrum Stylus (quickstart): https://docs.arbitrum.io/stylus/quickstart
- EAS (docs): https://docs.attest.org
- EAS SDK (npm): `@ethereum-attestation-service/eas-sdk`
- Arbitrum Sepolia explorer: https://sepolia.arbiscan.io

**Documentos hermanos (en la carpeta de tesis):**

- `kallpa-plan-maestro.md` — cronograma día a día, mentores, runbook del Demo Day, preguntas asesinas.
- `kallpa-propuesta-final.md` — la propuesta y el pitch de 30s.
- `kallpa-pitch-deck.pdf` / `.pptx` — el deck oficial (14 slides).

---

_Este documento es la fuente de verdad técnica. Si el §6 (interfaces) y el código se contradicen, gana el §6 hasta que el equipo decida lo contrario en el daily. "Al pie de la letra" empieza por respetar los nombres y las interfaces._
