//! Pool de microcrédito — presta contra el comportamiento, no contra un aval.
//!
//! No conoce a nadie. Cuando alguien pide un préstamo, el Pool le pregunta al ScoreEngine
//! por su score **en ese mismo instante**, y el ScoreEngine lo computa leyendo el historial
//! vivo de la Junta. No hay comité, no hay expediente y no hay una fotografía guardada de
//! nadie.
//!
//! ## Por qué recomputa en vez de leer un score guardado
//!
//! Un score persistido solo se actualiza cuando alguien paga gas por actualizarlo, y quien
//! incumple jamás va a firmar la transacción que hunde su propia reputación. Un Pool que
//! leyera esa fotografía prestaría con datos que el moroso tiene todo el incentivo de dejar
//! congelados. Recomputando, el crédito se cierra **solo**: nadie ejecuta nada, pasa el
//! tiempo, el incumplimiento aparece en el historial y el préstamo se rechaza.
//!
//! Tampoco lee la attestation publicada. Esa es la copia portable, pensada para un
//! prestamista de afuera que no puede leer nuestra Junta; adentro no hace falta.
//!
//! ## Lo que cuesta
//!
//! Cada decisión de crédito hace dos saltos de lectura —Pool → ScoreEngine → Junta— dentro
//! de la misma transacción. Son lecturas, no escrituras, y en una red de segunda capa el
//! costo es marginal frente a lo que compran: que la decisión use los hechos del segundo en
//! que se toma.

#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
#![cfg_attr(not(any(test, feature = "export-abi")), no_std)]

#[macro_use]
extern crate alloc;

use alloc::vec::Vec;

use stylus_sdk::{
    alloy_primitives::{Address, U16, U256, U32, U64},
    alloy_sol_types::{sol, SolCall},
    prelude::*,
    stylus_core::log,
};

/// Tramos de crédito por score, en unidades del token de seis decimales.
///
/// El corte inferior coincide con el umbral de reputación positiva del ScoreEngine: un solo
/// número gobierna "¿le prestamos?" y "¿su reputación es positiva?", así que no puede haber
/// un miembro con reputación positiva al que este contrato le niegue el préstamo.
const TRAMOS: [(u16, u64); 3] = [
    (750, 200_000_000), // 750–1000 → 200 mUSDC
    (600, 120_000_000), // 600–749  → 120 mUSDC
    (400, 50_000_000),  // 400–599  →  50 mUSDC
];

sol! {
    // Se arma a mano en vez de usar `sol_interface!` porque ese macro enruta por una vía
    // deprecada que esquiva la abstracción de VM, y con ella la posibilidad de interceptar
    // las llamadas desde las pruebas.
    function scoreAndCredit(uint32 juntaId, address member) external view returns (uint16, bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);

    event LiquidityDeposited(address indexed quien, uint256 monto);
    event LoanGranted(uint32 indexed juntaId, address indexed member, uint256 monto, uint16 score);
    event LoanRepaid(address indexed member, uint256 monto);

    #[derive(Debug)]
    error CreditoSuspendido(address member, uint16 score);
    #[derive(Debug)]
    error YaTienePrestamoActivo(address member);
    #[derive(Debug)]
    error NoTienePrestamoActivo(address member);
    #[derive(Debug)]
    error LiquidezInsuficiente(uint256 pedido, uint256 disponible);
    #[derive(Debug)]
    error ScoreNoDisponible(uint32 juntaId, address member);
    #[derive(Debug)]
    error TransferenciaFallida();
    #[derive(Debug)]
    error MontoInvalido();
}

#[derive(SolidityError, Debug)]
pub enum PoolError {
    CreditoSuspendido(CreditoSuspendido),
    YaTienePrestamoActivo(YaTienePrestamoActivo),
    NoTienePrestamoActivo(NoTienePrestamoActivo),
    LiquidezInsuficiente(LiquidezInsuficiente),
    ScoreNoDisponible(ScoreNoDisponible),
    TransferenciaFallida(TransferenciaFallida),
    MontoInvalido(MontoInvalido),
}

sol_storage! {
    pub struct Prestamo {
        uint256 monto;
        uint32 junta_id;
        uint64 momento;
        uint16 score_al_prestar;
        bool activo;
    }

    #[entrypoint]
    pub struct Pool {
        address token;
        address score_engine;
        uint256 liquidez;
        uint256 prestado_vigente;
        mapping(address => Prestamo) prestamos;
    }
}

/// Cuánto presta el Pool a alguien con este score.
///
/// Devuelve cero por debajo del primer tramo, que es la forma de decir "aquí no hay
/// crédito" sin una rama aparte.
fn tramo_de(score: u16) -> u64 {
    let mut i = 0;
    while i < TRAMOS.len() {
        if score >= TRAMOS[i].0 {
            return TRAMOS[i].1;
        }
        i += 1;
    }
    0
}

impl Pool {
    /// Pregunta al ScoreEngine por el score y la elegibilidad del miembro, ahora mismo.
    ///
    /// Es una lectura, así que va por `self.vm()` y se puede interceptar desde las pruebas.
    /// La elegibilidad la decide el ScoreEngine y no este contrato: además del umbral,
    /// exige un historial mínimo, porque un miembro recién llegado no tiene ninguna señal
    /// negativa que mostrar y el modelo lo puntuaría casi perfecto.
    fn consultar_score(&self, junta_id: u32, member: Address) -> Result<(u16, bool), PoolError> {
        let datos = scoreAndCreditCall {
            juntaId: junta_id,
            member,
        }
        .abi_encode();

        let contexto: &Self = self;
        let respuesta = self
            .vm()
            .static_call(&contexto, self.score_engine.get(), &datos)
            .map_err(|_| {
                PoolError::ScoreNoDisponible(ScoreNoDisponible {
                    juntaId: junta_id,
                    member,
                })
            })?;

        if respuesta.len() < 64 {
            return Err(PoolError::ScoreNoDisponible(ScoreNoDisponible {
                juntaId: junta_id,
                member,
            }));
        }

        // Dos palabras de treinta y dos bytes: el score en la primera, la elegibilidad en la
        // segunda.
        let score = ((respuesta[30] as u16) << 8) | (respuesta[31] as u16);
        let con_credito = respuesta[63] != 0;
        Ok((score, con_credito))
    }

    /// Envía una transferencia del token y exige respuesta afirmativa.
    ///
    /// Un ERC-20 que devuelve `false` falló aunque no haya revertido: tratar la respuesta
    /// vacía como éxito dejaría pasar transferencias que nunca ocurrieron.
    #[allow(deprecated)]
    fn mover_token(&mut self, datos: Vec<u8>) -> Result<(), PoolError> {
        let token = self.token.get();
        let respuesta = stylus_sdk::call::call(&mut *self, token, &datos)
            .map_err(|_| PoolError::TransferenciaFallida(TransferenciaFallida {}))?;
        if respuesta.len() < 32 || respuesta[31] == 0 {
            return Err(PoolError::TransferenciaFallida(TransferenciaFallida {}));
        }
        Ok(())
    }
}

#[public]
impl Pool {
    #[constructor]
    pub fn constructor(&mut self, token: Address, score_engine: Address) {
        self.token.set(token);
        self.score_engine.set(score_engine);
    }

    pub fn token(&self) -> Address {
        self.token.get()
    }

    pub fn score_engine(&self) -> Address {
        self.score_engine.get()
    }

    /// Cuánto prestaría el Pool a alguien con este score, sin consultar a nadie.
    ///
    /// Es una función pura: sirve para que la interfaz muestre el tramo antes de pedir nada.
    pub fn tramo(&self, score: u16) -> U256 {
        U256::from(tramo_de(score))
    }

    /// Aporta liquidez al fondo común.
    pub fn deposit_liquidity(&mut self, monto: U256) -> Result<(), PoolError> {
        if monto.is_zero() {
            return Err(PoolError::MontoInvalido(MontoInvalido {}));
        }
        let quien = self.vm().msg_sender();
        let contrato = self.vm().contract_address();

        self.mover_token(
            transferFromCall {
                from: quien,
                to: contrato,
                value: monto,
            }
            .abi_encode(),
        )?;

        let nueva = self.liquidez.get() + monto;
        self.liquidez.set(nueva);

        log(self.vm(), LiquidityDeposited { quien, monto });
        Ok(())
    }

    /// Concede un préstamo recomputando el score del solicitante en este mismo instante.
    ///
    /// El monto sale del tramo que le corresponde a ese score. Si el miembro no es
    /// elegible —porque incumplió, o porque todavía no tiene historial suficiente— la
    /// transacción revierte con un motivo legible, y nadie tuvo que declarar nada para que
    /// eso pasara: basta con que el tiempo haya corrido.
    pub fn request_loan(&mut self, junta_id: u32) -> Result<U256, PoolError> {
        let member = self.vm().msg_sender();

        if self.prestamos.get(member).activo.get() {
            return Err(PoolError::YaTienePrestamoActivo(YaTienePrestamoActivo {
                member,
            }));
        }

        let (score, con_credito) = self.consultar_score(junta_id, member)?;
        let monto = U256::from(tramo_de(score));
        if !con_credito || monto.is_zero() {
            return Err(PoolError::CreditoSuspendido(CreditoSuspendido {
                member,
                score,
            }));
        }

        let disponible = self.liquidez.get() - self.prestado_vigente.get();
        if monto > disponible {
            return Err(PoolError::LiquidezInsuficiente(LiquidezInsuficiente {
                pedido: monto,
                disponible,
            }));
        }

        // Se registra el préstamo antes de mover el dinero. Es el orden que impide que una
        // llamada reentrante encuentre al Pool creyendo que todavía no prestó nada.
        let ahora = self.vm().block_timestamp();
        {
            let mut p = self.prestamos.setter(member);
            p.monto.set(monto);
            p.junta_id.set(U32::from(junta_id));
            p.momento.set(U64::from(ahora));
            p.score_al_prestar.set(U16::from(score));
            p.activo.set(true);
        }
        let vigente = self.prestado_vigente.get() + monto;
        self.prestado_vigente.set(vigente);

        self.mover_token(
            transferCall {
                to: member,
                value: monto,
            }
            .abi_encode(),
        )?;

        log(
            self.vm(),
            LoanGranted {
                juntaId: junta_id,
                member,
                monto,
                score,
            },
        );
        Ok(monto)
    }

    /// Devuelve el préstamo y libera la línea de crédito.
    pub fn repay(&mut self) -> Result<(), PoolError> {
        let member = self.vm().msg_sender();
        let prestamo = self.prestamos.get(member);
        if !prestamo.activo.get() {
            return Err(PoolError::NoTienePrestamoActivo(NoTienePrestamoActivo {
                member,
            }));
        }
        let monto = prestamo.monto.get();
        let contrato = self.vm().contract_address();

        {
            let mut p = self.prestamos.setter(member);
            p.activo.set(false);
        }
        let vigente = self.prestado_vigente.get() - monto;
        self.prestado_vigente.set(vigente);

        self.mover_token(
            transferFromCall {
                from: member,
                to: contrato,
                value: monto,
            }
            .abi_encode(),
        )?;

        log(self.vm(), LoanRepaid { member, monto });
        Ok(())
    }

    /// El préstamo de un miembro: `(monto, junta_id, momento, score_al_prestar, activo)`.
    pub fn loan_of(&self, member: Address) -> (U256, u32, u64, u16, bool) {
        let p = self.prestamos.get(member);
        (
            p.monto.get(),
            p.junta_id.get().to::<u32>(),
            p.momento.get().to::<u64>(),
            p.score_al_prestar.get().to::<u16>(),
            p.activo.get(),
        )
    }

    /// La solvencia del Pool: `(liquidez, prestado, disponible)`.
    ///
    /// Aquí la palabra sí significa algo, a diferencia de lo que ocurre con una junta. El
    /// Pool presta, así que puede quedarse corto: lo disponible llega a cero cuando todo
    /// está colocado, y se mantiene bajo mientras un préstamo siga sin devolverse.
    pub fn liquidity_status(&self) -> (U256, U256, U256) {
        let liquidez = self.liquidez.get();
        let prestado = self.prestado_vigente.get();
        (liquidez, prestado, liquidez - prestado)
    }
}

// Satisface al enlazador de Windows; no se ejecuta nunca. Ver el archivo para el porqué.
#[cfg(test)]
#[path = "../../hostio_stubs.rs"]
mod hostio_stubs;

#[cfg(test)]
mod test;
