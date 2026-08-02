// Este build script no genera nada. Existe para que Cargo tome en cuenta la
// seccion [build-dependencies] del Cargo.toml, que es lo que arregla la compilacion
// en Windows.
//
// El problema: stylus-proc declara alloy-primitives con el feature "native-keccak",
// que importa el simbolo `native_keccak256` del entorno anfitrion. En WASM lo provee
// la VM de Stylus, pero stylus-proc es un proc-macro y se compila para el host: en
// Windows, link.exe exige resolver todos los simbolos de una DLL y falla con LNK2019.
//
// alloy-primitives desactiva "native-keccak" cuando esta presente "tiny-keccak", asi
// que basta con activarlo en el grafo del host. Bajo resolver = "2" ese grafo es el de
// las build-dependencies, no el de las dependencias normales.
//
// Ver docs/build-spec.md §3 para el contexto completo.
fn main() {
    println!("cargo:rerun-if-changed=build.rs");
}
