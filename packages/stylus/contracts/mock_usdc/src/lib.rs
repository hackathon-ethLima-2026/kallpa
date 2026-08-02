//! MockUSDC — el dinero de la demo de Kallpa.
//!
//! ERC-20 de 6 decimales, igual que el USDC real, con una diferencia deliberada:
//! `mint` es abierto. Cualquiera puede acuñarse saldo. Eso es exactamente lo que
//! queremos en una testnet —el jurado prueba el flujo sin pedirnos fondos— y es
//! exactamente lo que jamás debe llegar a una red real.

#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
#![cfg_attr(not(any(test, feature = "export-abi")), no_std)]

#[macro_use]
extern crate alloc;

use alloc::string::{String, ToString};
use alloc::vec::Vec;

use stylus_sdk::{
    alloy_primitives::{Address, U256},
    alloy_sol_types::sol,
    prelude::*,
    stylus_core::log,
};

sol! {
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    #[derive(Debug)]
    error InsufficientBalance(address from, uint256 have, uint256 want);
    #[derive(Debug)]
    error InsufficientAllowance(address owner, address spender, uint256 have, uint256 want);
    #[derive(Debug)]
    error InvalidReceiver(address receiver);
}

#[derive(SolidityError, Debug)]
pub enum Erc20Error {
    InsufficientBalance(InsufficientBalance),
    InsufficientAllowance(InsufficientAllowance),
    InvalidReceiver(InvalidReceiver),
}

sol_storage! {
    #[entrypoint]
    pub struct MockUsdc {
        uint256 total_supply;
        mapping(address => uint256) balances;
        mapping(address => mapping(address => uint256)) allowances;
    }
}

impl MockUsdc {
    /// Mueve saldo entre dos cuentas. Es el único camino por el que un balance baja,
    /// así que aquí viven las dos guardas que importan: que haya fondos suficientes y
    /// que el destino no sea la dirección cero (quemar por accidente descuadra el
    /// suministro contra los balances).
    fn transfer_inner(
        &mut self,
        from: Address,
        to: Address,
        value: U256,
    ) -> Result<(), Erc20Error> {
        if to.is_zero() {
            return Err(Erc20Error::InvalidReceiver(InvalidReceiver {
                receiver: to,
            }));
        }

        let from_balance = self.balances.get(from);
        if from_balance < value {
            return Err(Erc20Error::InsufficientBalance(InsufficientBalance {
                from,
                have: from_balance,
                want: value,
            }));
        }

        self.balances.insert(from, from_balance - value);
        let to_balance = self.balances.get(to);
        self.balances.insert(to, to_balance + value);

        log(self.vm(), Transfer { from, to, value });
        Ok(())
    }
}

#[public]
impl MockUsdc {
    pub fn name(&self) -> String {
        "Kallpa Mock USDC".to_string()
    }

    pub fn symbol(&self) -> String {
        "mUSDC".to_string()
    }

    /// Seis decimales, como el USDC real: 1 mUSDC se escribe 1_000_000.
    pub fn decimals(&self) -> u8 {
        6
    }

    pub fn total_supply(&self) -> U256 {
        self.total_supply.get()
    }

    pub fn balance_of(&self, account: Address) -> U256 {
        self.balances.get(account)
    }

    pub fn allowance(&self, owner: Address, spender: Address) -> U256 {
        self.allowances.getter(owner).get(spender)
    }

    /// Acuña saldo sin pedir permisos. Solo para la demo — ver la nota del encabezado.
    pub fn mint(&mut self, to: Address, value: U256) -> Result<(), Erc20Error> {
        if to.is_zero() {
            return Err(Erc20Error::InvalidReceiver(InvalidReceiver {
                receiver: to,
            }));
        }

        self.total_supply.set(self.total_supply.get() + value);
        let balance = self.balances.get(to);
        self.balances.insert(to, balance + value);

        log(
            self.vm(),
            Transfer {
                from: Address::ZERO,
                to,
                value,
            },
        );
        Ok(())
    }

    pub fn transfer(&mut self, to: Address, value: U256) -> Result<bool, Erc20Error> {
        let from = self.vm().msg_sender();
        self.transfer_inner(from, to, value)?;
        Ok(true)
    }

    pub fn approve(&mut self, spender: Address, value: U256) -> bool {
        let owner = self.vm().msg_sender();
        self.allowances.setter(owner).insert(spender, value);
        log(
            self.vm(),
            Approval {
                owner,
                spender,
                value,
            },
        );
        true
    }

    pub fn transfer_from(
        &mut self,
        from: Address,
        to: Address,
        value: U256,
    ) -> Result<bool, Erc20Error> {
        let spender = self.vm().msg_sender();
        let allowed = self.allowances.getter(from).get(spender);
        if allowed < value {
            return Err(Erc20Error::InsufficientAllowance(InsufficientAllowance {
                owner: from,
                spender,
                have: allowed,
                want: value,
            }));
        }

        self.transfer_inner(from, to, value)?;
        self.allowances
            .setter(from)
            .insert(spender, allowed - value);
        Ok(true)
    }
}

// Satisface al enlazador de Windows; no se ejecuta nunca. Ver el archivo para el porqué.
#[cfg(test)]
#[path = "../../hostio_stubs.rs"]
mod hostio_stubs;

#[cfg(test)]
mod test {
    use super::*;
    use stylus_sdk::testing::*;

    const ONE_USDC: u64 = 1_000_000;

    fn addr(byte: u8) -> Address {
        Address::from([byte; 20])
    }

    #[test]
    fn mint_acuna_y_mueve_el_suministro() {
        let vm = TestVM::default();
        let mut token = MockUsdc::from(&vm);
        let maria = addr(1);

        token.mint(maria, U256::from(100 * ONE_USDC)).unwrap();

        assert_eq!(token.balance_of(maria), U256::from(100 * ONE_USDC));
        assert_eq!(token.total_supply(), U256::from(100 * ONE_USDC));
        assert_eq!(token.decimals(), 6);
        assert_eq!(token.symbol(), "mUSDC");
    }

    #[test]
    fn transfer_mueve_saldo_entre_cuentas() {
        let vm = TestVM::default();
        let mut token = MockUsdc::from(&vm);
        let maria = vm.msg_sender();
        let junta = addr(2);

        token.mint(maria, U256::from(100 * ONE_USDC)).unwrap();
        token.transfer(junta, U256::from(50 * ONE_USDC)).unwrap();

        assert_eq!(token.balance_of(maria), U256::from(50 * ONE_USDC));
        assert_eq!(token.balance_of(junta), U256::from(50 * ONE_USDC));
        // El suministro no cambia: transferir mueve, no crea.
        assert_eq!(token.total_supply(), U256::from(100 * ONE_USDC));
    }

    #[test]
    fn transferir_mas_de_lo_que_hay_falla() {
        let vm = TestVM::default();
        let mut token = MockUsdc::from(&vm);
        let junta = addr(2);

        token
            .mint(vm.msg_sender(), U256::from(10 * ONE_USDC))
            .unwrap();

        assert!(token.transfer(junta, U256::from(11 * ONE_USDC)).is_err());
    }

    #[test]
    fn approve_y_transfer_from_es_el_flujo_de_la_junta() {
        // Este es el camino real de la demo: María autoriza a la Junta, y la Junta
        // se cobra la cuota. Si esto se rompe, nadie puede depositar.
        let vm = TestVM::default();
        let mut token = MockUsdc::from(&vm);
        let maria = vm.msg_sender();
        let junta = addr(2);

        token.mint(maria, U256::from(100 * ONE_USDC)).unwrap();
        token.approve(junta, U256::from(50 * ONE_USDC));
        assert_eq!(token.allowance(maria, junta), U256::from(50 * ONE_USDC));

        vm.set_sender(junta);
        token
            .transfer_from(maria, junta, U256::from(30 * ONE_USDC))
            .unwrap();

        assert_eq!(token.balance_of(junta), U256::from(30 * ONE_USDC));
        // La autorización se consume por lo gastado, no se borra entera.
        assert_eq!(token.allowance(maria, junta), U256::from(20 * ONE_USDC));
    }

    #[test]
    fn transfer_from_sin_autorizacion_suficiente_falla() {
        let vm = TestVM::default();
        let mut token = MockUsdc::from(&vm);
        let maria = vm.msg_sender();
        let junta = addr(2);

        token.mint(maria, U256::from(100 * ONE_USDC)).unwrap();
        token.approve(junta, U256::from(10 * ONE_USDC));

        vm.set_sender(junta);
        assert!(token
            .transfer_from(maria, junta, U256::from(11 * ONE_USDC))
            .is_err());
    }

    #[test]
    fn no_se_puede_mandar_saldo_a_la_direccion_cero() {
        // Quemar por accidente descuadraría el suministro contra los balances, y la
        // Junta audita exactamente esa clase de identidad.
        let vm = TestVM::default();
        let mut token = MockUsdc::from(&vm);
        token
            .mint(vm.msg_sender(), U256::from(10 * ONE_USDC))
            .unwrap();

        assert!(token.transfer(Address::ZERO, U256::from(1)).is_err());
        assert!(token.mint(Address::ZERO, U256::from(1)).is_err());
    }
}
