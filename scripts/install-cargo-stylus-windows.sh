#!/usr/bin/env bash
# Instala cargo-stylus 0.10.8 en Windows.
#
# Por que existe este script: cargo-stylus 0.10.8 (y 0.10.7) NO compila en Windows.
# Su modulo src/commands/debug_hook.rs importa std::os::unix::net::UnixListener, que
# solo existe en Unix, y el modulo se declara sin ningun #[cfg]. El resultado es
# error[E0433] "could not find `unix` in `os`" durante `cargo install cargo-stylus`.
# No hay version mas nueva a la que actualizar: 0.10.8 es la ultima publicada.
#
# El parche marca ese modulo como unix-only. Es seguro porque su unico uso esta
# dentro de `if args.debugger == "stylusdb"` en replay.rs, un camino de depuracion
# que este proyecto no utiliza: check, deploy y export-abi no lo tocan.
#
# En Linux y macOS no hace falta correr esto; ahi basta:
#   cargo install --force --locked cargo-stylus@0.10.8
#
# Uso:  bash scripts/install-cargo-stylus-windows.sh

set -euo pipefail

VERSION="0.10.8"
TOOLCHAIN="1.91.0"
VENDOR_DIR="${CARGO_HOME:-$HOME/.cargo}/vendor-cargo-stylus-win"

echo "==> Instalando la toolchain de Rust ${TOOLCHAIN} y el target WASM"
rustup toolchain install "${TOOLCHAIN}" --profile minimal
rustup target add wasm32-unknown-unknown --toolchain "${TOOLCHAIN}"

echo "==> Descargando el codigo de cargo-stylus ${VERSION} a la cache local"
# `cargo install` falla al compilar, pero deja el codigo descomprimido en el registro,
# que es lo unico que necesitamos de este paso.
cargo "+${TOOLCHAIN}" install --force --locked "cargo-stylus@${VERSION}" >/dev/null 2>&1 || true

SRC="$(find "${CARGO_HOME:-$HOME/.cargo}/registry/src" -maxdepth 2 -type d -name "cargo-stylus-${VERSION}" | head -1)"
if [ -z "${SRC}" ]; then
  echo "ERROR: no se encontro el codigo de cargo-stylus ${VERSION} en el registro." >&2
  echo "Revisa tu conexion y volve a correr el script." >&2
  exit 1
fi
echo "    codigo encontrado en: ${SRC}"

echo "==> Copiando y parcheando en ${VENDOR_DIR}"
rm -rf "${VENDOR_DIR}"
mkdir -p "${VENDOR_DIR}"
cp -r "${SRC}/." "${VENDOR_DIR}/"

python - "${VENDOR_DIR}" <<'PYTHON'
import sys, pathlib

vendor = pathlib.Path(sys.argv[1])

mod = vendor / "src" / "commands" / "mod.rs"
text = mod.read_text(encoding="utf-8")
if "#[cfg(unix)]\nmod debug_hook;" not in text:
    assert "mod debug_hook;" in text, "no se encontro 'mod debug_hook;' en mod.rs"
    mod.write_text(
        text.replace("mod debug_hook;", "#[cfg(unix)]\nmod debug_hook;", 1),
        encoding="utf-8",
    )

replay = vendor / "src" / "commands" / "replay.rs"
text = replay.read_text(encoding="utf-8")
anchor = '    // Initialize debugger hook if using stylusdb\n    if args.debugger == "stylusdb"'
patched = (
    '    // Initialize debugger hook if using stylusdb (unix-only: usa UnixListener)\n'
    '    #[cfg(unix)]\n'
    '    if args.debugger == "stylusdb"'
)
if "#[cfg(unix)]" not in text:
    assert anchor in text, "no se encontro el bloque del debugger en replay.rs"
    replay.write_text(text.replace(anchor, patched, 1), encoding="utf-8")

print("    parche aplicado")
PYTHON

echo "==> Compilando e instalando (toma unos minutos)"
cd "${VENDOR_DIR}"
cargo "+${TOOLCHAIN}" install --force --locked --path .

echo
echo "==> Listo. Verificacion:"
cargo stylus --version
