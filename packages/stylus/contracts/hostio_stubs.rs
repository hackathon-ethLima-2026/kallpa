//! Stubs de los hooks de la VM de Stylus, solo para compilar los tests en Windows.
//!
//! ## Por que existe este archivo
//!
//! `stylus-sdk` declara ~34 funciones `extern "C"` que en produccion provee la VM de
//! Stylus (`emit_log`, `msg_sender`, `storage_load_bytes32`, ...). Al compilar el
//! binario de tests para el host, esos simbolos no existen: en Linux y macOS el enlace
//! los tolera, pero `link.exe` de MSVC exige resolverlos todos y aborta con
//! `LNK1120: 34 externos sin resolver`. El contrato de ejemplo de Scaffold-Stylus falla
//! igual en Windows; no es un problema de este proyecto.
//!
//! Estas definiciones vacias solo satisfacen al enlazador. **Nunca se ejecutan**: los
//! tests usan `TestVM` de `stylus-sdk`, que intercepta las operaciones un nivel mas
//! arriba y jamas llega a estos simbolos. Si alguno llegara a ejecutarse, seria una
//! senal de que el test no esta usando `TestVM` como corresponde.
//!
//! ## Como se usa
//!
//! Dentro del modulo de tests de cada contrato:
//!
//! ```ignore
//! #[cfg(test)]
//! #[path = "../../hostio_stubs.rs"]
//! mod hostio_stubs;
//! ```
//!
//! El archivo vive fuera de los directorios de contratos a proposito: es un `.rs`
//! suelto, no un crate, asi que `members = ["*"]` del workspace no lo toma como
//! miembro ni los scripts de deploy lo confunden con un contrato.

#![allow(clippy::missing_safety_doc)]

macro_rules! stub {
    ($name:ident ( $($arg:ident : $ty:ty),* $(,)? )) => {
        #[no_mangle]
        pub unsafe extern "C" fn $name($(_: $ty),*) {}
    };
    ($name:ident ( $($arg:ident : $ty:ty),* $(,)? ) -> $ret:ty) => {
        #[no_mangle]
        pub unsafe extern "C" fn $name($(_: $ty),*) -> $ret {
            Default::default()
        }
    };
}

// Cuentas
stub!(account_balance(address: *const u8, dest: *mut u8));
stub!(account_code(address: *const u8, offset: usize, size: usize, dest: *mut u8) -> usize);
stub!(account_code_size(address: *const u8) -> usize);
stub!(account_codehash(address: *const u8, dest: *mut u8));

// Almacenamiento
stub!(storage_load_bytes32(key: *const u8, dest: *mut u8));
stub!(storage_cache_bytes32(key: *const u8, value: *const u8));
stub!(storage_flush_cache(clear: bool));

// Bloque
stub!(block_basefee(basefee: *mut u8));
stub!(block_coinbase(coinbase: *mut u8));
stub!(block_gas_limit() -> u64);
stub!(block_number() -> u64);
stub!(block_timestamp() -> u64);
stub!(chainid() -> u64);

// Llamadas entre contratos
stub!(contract_address(address: *mut u8));
stub!(call_contract(
    contract: *const u8,
    calldata: *const u8,
    calldata_len: usize,
    value: *const u8,
    gas: u64,
    return_data_len: *mut usize,
) -> u8);
stub!(delegate_call_contract(
    contract: *const u8,
    calldata: *const u8,
    calldata_len: usize,
    gas: u64,
    return_data_len: *mut usize,
) -> u8);
stub!(static_call_contract(
    contract: *const u8,
    calldata: *const u8,
    calldata_len: usize,
    gas: u64,
    return_data_len: *mut usize,
) -> u8);
stub!(create1(
    code: *const u8,
    code_len: usize,
    endowment: *const u8,
    contract: *mut u8,
    revert_data_len: *mut usize,
));
stub!(create2(
    code: *const u8,
    code_len: usize,
    endowment: *const u8,
    salt: *const u8,
    contract: *mut u8,
    revert_data_len: *mut usize,
));

// EVM
stub!(emit_log(data: *const u8, len: usize, topics: usize));
stub!(evm_gas_left() -> u64);
stub!(evm_ink_left() -> u64);
stub!(pay_for_memory_grow(pages: u16));

// Mensaje y transaccion
stub!(msg_reentrant() -> bool);
stub!(msg_sender(sender: *mut u8));
stub!(msg_value(value: *mut u8));
stub!(tx_gas_price(gas_price: *mut u8));
stub!(tx_ink_price() -> u32);
stub!(tx_origin(origin: *mut u8));

// Entrada, salida y criptografia
stub!(native_keccak256(bytes: *const u8, len: usize, output: *mut u8));
stub!(read_args(dest: *mut u8));
stub!(read_return_data(dest: *mut u8, offset: usize, size: usize) -> usize);
stub!(return_data_size() -> usize);
stub!(write_result(data: *const u8, len: usize));
