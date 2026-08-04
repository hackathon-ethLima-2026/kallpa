# Empezar aquí

Este documento es para quien abre el repositorio por primera vez. En cinco minutos deberías
tener la aplicación corriendo contra los contratos reales, sin compilar nada de Rust.

Si vas a tocar los contratos, el camino largo está más abajo. **Léelo solo si te toca.**

---

## Lo primero: no hace falta cadena local

El `readme` decía que había que levantar un nodo con Docker. Eso ya no es cierto y conviene
saber por qué, porque seguirlo produce un fallo silencioso.

`packages/nextjs/scaffold.config.ts` fija `targetNetworks: [arbitrumSepolia]`. La aplicación
lee **siempre** la red de pruebas de Arbitrum, donde los contratos ya están desplegados y la
demostración ya está sembrada. Si además levantas una cadena local, el frontend la ignora: no
falla con un error, simplemente no muestra nada, y perderías la tarde buscando la causa.

Los contratos vivos están en [`addresses.md`](./addresses.md). No hay que desplegar nada para
trabajar.

---

## Camino corto — frontend, documentación, deck

Lo que necesitas: **Node ≥ 20.18** y **Yarn**. Nada más. Ni Rust, ni Docker, ni Foundry.

```bash
git clone https://github.com/hackathon-ethLima-2026/kallpa.git
cd kallpa
yarn install
yarn start          # http://localhost:3000
```

`yarn install` no compila contratos: el único gancho de instalación es husky, para los
`hooks` de git.

Con eso ya puedes ver la demostración sembrada. Para **interactuar** —pagar una cuota, pedir
crédito— necesitas una billetera con ETH de prueba; eso está en
[`como-probarlo.md`](./como-probarlo.md).

### Si algo no carga

Abre la consola del navegador. Si ves llamadas a `arb-sepolia.g.alchemy.com`, el
`rpcOverrides` de `scaffold.config.ts` no llegó al paquete: esa clave viene compartida con el
proyecto base, está saturada, y devuelve `Failed to fetch` a mitad de una lectura. Debe ir al
punto de acceso público de Arbitrum.

---

## Camino largo — contratos en Rust

Solo si vas a modificar `packages/stylus/contracts/`.

Además de Node y Yarn: **Rust 1.91.0** y **cargo-stylus 0.10.8**.

### En Windows, cargo-stylus no se instala solo

`cargo-stylus` 0.10.8 —y 0.10.7— **no compila en Windows**. Su módulo `debug_hook.rs` importa
`std::os::unix::net::UnixListener` sin ningún `#[cfg]`, así que `cargo install` muere con
`could not find 'unix' in 'os'`. No hay versión más nueva: 0.10.8 es la última publicada.

Por eso existe el script que lo parcha:

```bash
bash scripts/install-cargo-stylus-windows.sh
```

### Correr las pruebas

```bash
cd packages/stylus/contracts/junta
cargo test --lib
```

**`--lib` no es opcional.** En Windows una DLL de prueba no puede tener símbolos sin resolver,
y `cargo test` a secas intenta construir binarios de integración que no enlazan.

Por la misma razón, `cargo build --lib` revienta con `LNK1120`: los 34 hooks vacíos de VM que
permiten enlazar (`contracts/hostio_stubs.rs`) solo entran bajo `#[cfg(test)]`. Para revisar
tipos sin enlazar, usa `cargo check --lib`.

Hoy son 53 pruebas en `junta`, 37 en `score_engine`, 17 en `pool` y 6 en `mock_usdc`.

### Desplegar

**No lo hagas sin acordarlo con el equipo.** Un despliegue nuevo cambia las direcciones y deja
huérfana la demostración sembrada, que cuesta ocho cuentas y varios minutos de reloj de la
cadena. Si hay que hacerlo, hay que volver a sembrar y actualizar `addresses.md` en el mismo
movimiento.

```bash
PRIVATE_KEY_SEPOLIA=0x... yarn deploy --network arbitrumSepolia
cd packages/stylus && PRIVATE_KEY_SEPOLIA=0x... node scripts/seed_demo.mjs
```

La clave va en `packages/stylus/.env` o por variable de entorno. **Nunca se commitea** y
**solo se usa en la red de pruebas**.

---

## Cómo está organizado el repositorio

```
packages/stylus/contracts/    los cuatro contratos en Rust
packages/nextjs/              la aplicación
packages/ai-model/            entrenamiento del modelo en Python
docs/                         esto
deck/                         el mazo de la presentación
```

## Qué leer, y en qué orden

1. **[`CONTEXT.md`](../CONTEXT.md)** — el glosario del dominio. Qué es una junta, un ciclo, un
   turno, la mora post-cobro. **Léelo primero**: el código usa esos términos y no otros, y
   confundir "ciclo" con "turno" lleva a escribir bugs que compilan.
2. **[`flujos-de-usuario.md`](./flujos-de-usuario.md)** — quién usa esto y para qué. Sin esto,
   las pantallas parecen arbitrarias.
3. **[`adr/`](./adr/)** — quince decisiones de arquitectura, cada una con las alternativas
   descartadas y por qué. Antes de proponer un cambio grande, mira si ya está discutido ahí.
4. **[`build-spec.md`](./build-spec.md)** — la especificación técnica. Su §6 es la ley: si el
   código y el §6 se contradicen, gana el §6.

## Convenciones que no son negociables

- **Los comentarios explican POR QUÉ, no QUÉ.** El código ya dice qué hace. Lo que se pierde
  con el tiempo es la razón.
- **El texto va en español neutro latinoamericano**, tanto en comentarios como en la interfaz.
- **Una función pública que devuelve varios valores no puede mezclar un tipo dinámico —texto,
  lista— con tipos de tamaño fijo.** `cargo stylus export-abi` emite una interfaz que no
  describe los bytes reales, y el error aparece lejos, en el navegador. Ya nos costó un día.
- **Nada de `sol_interface!` para llamar entre contratos.** Las funciones que genera pasan por
  una ruta que esquiva la máquina virtual, así que ninguna prueba puede interceptarlas y el
  camino del dinero se queda sin cobertura. Se codifica a mano con `sol!` y `abi_encode`.
