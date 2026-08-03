//! Junta — la custodia y la fuente de verdad de Kallpa.
//!
//! Un solo contrato alberga muchas juntas, identificadas por `junta_id` (ADR-0001).
//! Guarda el pozo, cobra las cuotas, reparte los turnos y expone el historial de cada
//! miembro, que es lo único que alimenta el score.
//!
//! Tres reglas gobiernan este contrato y explican casi todo lo que hay aquí adentro:
//!
//! 1. **`distribute` es el único camino por el que sale dinero** (ADR-0004). Las
//!    penalidades por incumplir son reputacionales, nunca monetarias. Gracias a eso, la
//!    identidad `aportado − distribuido == saldo real del token` se sostiene sola y
//!    cualquiera puede verificarla desde afuera.
//!
//! 2. **Lo bueno se escribe, lo malo se lee** (ADR-0005). La puntualidad y el atraso se
//!    registran al depositar, porque quien paga ya está mandando una transacción y tiene
//!    incentivo de hacerlo. El incumplimiento **no se escribe nunca**: se deriva del reloj
//!    de la cadena al momento de leerlo. Quien incumple jamás firmaría la transacción que
//!    hunde su propio score, así que el reloj firma por él.
//!
//! 3. **Todo lo que se lee es O(1)** (ADR-0003). El Pool recomputa el score dentro de la
//!    misma transacción en que decide un préstamo, así que `history` no puede recorrer un
//!    registro de pagos: mantiene agregados y deriva el resto con aritmética.

#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
#![cfg_attr(not(any(test, feature = "export-abi")), no_std)]

#[macro_use]
extern crate alloc;

use alloc::string::String;
use alloc::vec::Vec;

use stylus_sdk::{
    alloy_primitives::{Address, I128, U128, U256, U32, U64},
    alloy_sol_types::{sol, SolCall},
    prelude::*,
    stylus_core::log,
};

/// Escala del punto fijo (§6.3). Un valor real `v` se representa como `v * SCALE`.
const SCALE: i128 = 1_000_000;

/// Cuánto se atrasó un pago, medido en fracciones de ciclo y en punto fijo.
///
/// Se mide en periodos y no en días porque la duración del ciclo es un parámetro de cada
/// junta: con ciclos de un minuto, "días de atraso" sería siempre cero y la señal
/// desaparecería. Y es fraccionario y no entero porque redondeando, quien paga a mitad de
/// ciclo se vería idéntico a un puntual (ADR-0006).
///
/// Pagar antes del vencimiento no es un atraso negativo: es simplemente cero.
fn atraso_en_periodos(ahora: u64, vencimiento: u64, periodo: u64) -> u128 {
    if periodo == 0 || ahora <= vencimiento {
        return 0;
    }
    ((ahora - vencimiento) as u128 * SCALE as u128) / periodo as u128
}

/// Qué fracción de lo que le tocaba pagar pagó realmente el miembro.
///
/// Es una razón y no un conteo a propósito: normaliza por antigüedad, así que un miembro
/// nuevo impecable puntúa igual que uno viejo impecable, y al no ser combinación lineal de
/// las otras señales aporta información propia (ADR-0009).
///
/// Sin ciclos vencidos nadie debía nada todavía, así que el cumplimiento es total. Esa
/// rama además evita una división por cero, que en Rust aborta la ejecución — y es el
/// estado exacto en que la siembra de la demo toca el contrato.
fn tasa_de_cumplimiento(pagadas: u32, ciclos: u32) -> i128 {
    if ciclos == 0 {
        return SCALE;
    }
    ((pagadas as i128 * SCALE) / ciclos as i128).min(SCALE)
}

// Las llamadas al token se arman y se envian a mano, a traves de `self.vm()`, en vez de
// usar `sol_interface!`. El motivo es concreto: las funciones que genera `sol_interface!`
// pasan por la ruta deprecada `stylus_sdk::call::call`, que va directo al hostio crudo y
// esquiva la abstraccion de VM. Como consecuencia, ninguna de esas llamadas se puede
// interceptar desde las pruebas, y el camino del dinero quedaria sin cobertura.
sol! {
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
}

sol! {
    event JuntaCreated(uint32 indexed juntaId, uint256 cuota, uint64 periodo, uint32 miembros);
    event Deposited(uint32 indexed juntaId, address indexed member, uint32 ciclo, bool puntual);
    event Distributed(uint32 indexed juntaId, address indexed member, uint32 turno, uint256 monto);
    event DisputeReported(uint32 indexed juntaId, address indexed member, uint32 total);

    #[derive(Debug)]
    error JuntaNoExiste(uint32 juntaId);
    #[derive(Debug)]
    error NoEsMiembro(uint32 juntaId, address quien);
    #[derive(Debug)]
    error JuntaCompleta(uint32 juntaId);
    #[derive(Debug)]
    error CuotasAlDia(uint32 juntaId, address member);
    #[derive(Debug)]
    error TurnoNoVencido(uint32 juntaId, uint32 turno);
    #[derive(Debug)]
    error ParametrosInvalidos();
    #[derive(Debug)]
    error TransferenciaFallida();
    #[derive(Debug)]
    error NoPuedeReportarseASiMismo(uint32 juntaId, address quien);
    #[derive(Debug)]
    error YaReporto(uint32 juntaId, address reportante, address member);
}

#[derive(SolidityError, Debug)]
pub enum JuntaError {
    JuntaNoExiste(JuntaNoExiste),
    NoEsMiembro(NoEsMiembro),
    JuntaCompleta(JuntaCompleta),
    CuotasAlDia(CuotasAlDia),
    TurnoNoVencido(TurnoNoVencido),
    ParametrosInvalidos(ParametrosInvalidos),
    TransferenciaFallida(TransferenciaFallida),
    NoPuedeReportarseASiMismo(NoPuedeReportarseASiMismo),
    YaReporto(YaReporto),
}

sol_storage! {
    /// Lo que el contrato guarda de cada miembro. Todo es O(1) y todo es agregado:
    /// no existe un registro de pagos que haya que recorrer.
    pub struct MemberState {
        bool es_miembro;
        uint32 cuotas_pagadas;
        uint32 pagos_puntuales;
        uint32 pagos_atrasados;
        uint128 atraso_max_periodos;
        uint32 disputas_perdidas;
        bool ya_cobro;
        uint32 defaults_al_cobrar;
    }

    pub struct JuntaData {
        bool existe;
        // El nombre vive en la cadena y no en la interfaz. Una junta es un grupo de
        // personas que se conocen: si el nombre solo existiera en el frontend, cada
        // aplicación que leyera este contrato mostraría algo distinto, o nada.
        string nombre;
        uint256 cuota;
        uint64 periodo;
        uint64 start_at;
        uint32 turno;
        uint256 aportado;
        uint256 distribuido;
        address[] miembros;
        mapping(address => MemberState) estado;
        // Quién ya reportó a quién. Sin esta huella un solo miembro satura la señal él
        // solo —cinco reportes son el tope del dominio del modelo— y la señal existe para
        // expresar el juicio del grupo, no el de una dirección (ADR-0013). Vive dentro de
        // la junta porque el historial es del par (junta, miembro): quien reportó aquí
        // conserva intacto su reporte en cualquier otra junta que compartan.
        mapping(address => mapping(address => bool)) reportes;
    }

    #[entrypoint]
    pub struct Junta {
        address token;
        uint32 total_juntas;
        // Contadores de TODO el contrato. La identidad de integridad se verifica aquí y
        // no por junta, porque `balanceOf` devuelve el saldo del contrato entero: con
        // varias juntas conviviendo, una resta por junta jamas cuadraria contra el token.
        uint256 aportado_global;
        uint256 distribuido_global;
        mapping(uint32 => JuntaData) juntas;
        // A qué juntas pertenece cada dirección. Se escribe una vez por miembro al crear
        // la junta, y evita que la aplicación tenga que recorrer todas las juntas
        // existentes para responder la pregunta más básica de todas: "¿en cuáles estoy?".
        mapping(address => uint32[]) juntas_por_miembro;
    }
}

impl Junta {
    /// Envia una transferencia al token y exige una respuesta afirmativa.
    ///
    /// Un ERC-20 que devuelve `false` fallo aunque no haya revertido, asi que tratar la
    /// respuesta vacia como exito dejaria pasar transferencias que nunca ocurrieron.
    ///
    /// Usa la funcion libre `call` porque el contexto mutante exige `&mut self` y el
    /// handle de la VM exige `&self`: en el SDK 0.9 esas dos cosas no conviven. La
    /// consecuencia practica esta documentada en `consultar_token`.
    #[allow(deprecated)]
    fn llamar_token(&mut self, data: Vec<u8>) -> Result<(), JuntaError> {
        let token = self.token.get();
        let ret = stylus_sdk::call::call(&mut *self, token, &data)
            .map_err(|_| JuntaError::TransferenciaFallida(TransferenciaFallida {}))?;
        if ret.len() < 32 || ret[31] == 0 {
            return Err(JuntaError::TransferenciaFallida(TransferenciaFallida {}));
        }
        Ok(())
    }

    /// Consulta de solo lectura al token, enviada **a traves de `self.vm()`**.
    ///
    /// La diferencia con `llamar_token` no es estilistica. Una lectura solo necesita
    /// prestamos inmutables, y dos de esos conviven sin problema, asi que esta ruta pasa
    /// por la abstraccion de VM y se puede interceptar desde las pruebas. Gracias a eso la
    /// verificacion de integridad —lo unico que este contrato publica hacia afuera— tiene
    /// cobertura real, incluido el caso en que deja de cuadrar.
    fn consultar_token(&self, data: Vec<u8>) -> Result<U256, JuntaError> {
        let token = self.token.get();
        let contexto: &Self = self;
        let ret = self
            .vm()
            .static_call(&contexto, token, &data)
            .map_err(|_| JuntaError::TransferenciaFallida(TransferenciaFallida {}))?;
        if ret.len() < 32 {
            return Err(JuntaError::TransferenciaFallida(TransferenciaFallida {}));
        }
        Ok(U256::from_be_slice(&ret[..32]))
    }

    /// Cuántos ciclos han vencido, topado al tamaño de la junta.
    ///
    /// El tope es lo que congela una junta terminada: cuando todos cobraron, el historial
    /// deja de moverse para siempre. Sin él, una junta sembrada para la demo acumularía
    /// incumplimientos hasta volverse basura (ADR-0005).
    fn ciclos_transcurridos(&self, junta_id: u32) -> u32 {
        let j = self.juntas.get(U32::from(junta_id));
        let periodo = j.periodo.get().to::<u64>();
        if periodo == 0 {
            return 0;
        }
        let ahora = self.vm().block_timestamp();
        let start = j.start_at.get().to::<u64>();
        let corridos = ahora.saturating_sub(start) / periodo;
        let total = j.miembros.len() as u64;
        corridos.min(total) as u32
    }

    /// Cuotas vencidas que siguen sin pagarse **en este momento**.
    ///
    /// El `saturating_sub` no es decorativo: quien paga la cuota del periodo en curso
    /// —que todavía no vence— tiene más cuotas pagadas que ciclos vencidos, y sin la
    /// resta saturada el mejor pagador de la junta terminaría con un número gigante.
    fn defaults_de(&self, junta_id: u32, member: Address) -> u32 {
        let pagadas = self
            .juntas
            .get(U32::from(junta_id))
            .estado
            .get(member)
            .cuotas_pagadas
            .get()
            .to::<u32>();
        self.ciclos_transcurridos(junta_id).saturating_sub(pagadas)
    }
}

#[public]
impl Junta {
    #[constructor]
    pub fn constructor(&mut self, token: Address) {
        self.token.set(token);
    }

    pub fn token(&self) -> Address {
        self.token.get()
    }

    pub fn total_juntas(&self) -> u32 {
        self.total_juntas.get().to::<u32>()
    }

    /// Crea una junta y arranca su reloj. Todos los miembros entran al mismo tiempo, así
    /// que comparten antigüedad; el número de ciclos es el número de miembros, porque la
    /// junta termina cuando todos cobraron una vez.
    pub fn create_junta(
        &mut self,
        nombre: String,
        miembros: Vec<Address>,
        cuota: U256,
        periodo: u64,
    ) -> Result<u32, JuntaError> {
        if miembros.is_empty() || cuota.is_zero() || periodo == 0 {
            return Err(JuntaError::ParametrosInvalidos(ParametrosInvalidos {}));
        }

        let junta_id = self.total_juntas.get().to::<u32>();
        let ahora = self.vm().block_timestamp();
        let cantidad = miembros.len() as u32;

        let mut j = self.juntas.setter(U32::from(junta_id));
        j.existe.set(true);
        j.nombre.set_str(&nombre);
        j.cuota.set(cuota);
        j.periodo.set(U64::from(periodo));
        j.start_at.set(U64::from(ahora));
        j.turno.set(U32::ZERO);
        for m in miembros.iter() {
            j.miembros.push(*m);
            j.estado.setter(*m).es_miembro.set(true);
        }
        for m in miembros.iter() {
            self.juntas_por_miembro.setter(*m).push(U32::from(junta_id));
        }

        self.total_juntas.set(U32::from(junta_id + 1));
        log(
            self.vm(),
            JuntaCreated {
                juntaId: junta_id,
                cuota,
                periodo,
                miembros: cantidad,
            },
        );
        Ok(junta_id)
    }

    /// Paga la cuota vencida más antigua que el miembro deba (FIFO).
    ///
    /// Aquí se escribe todo lo bueno: si llegó dentro del plazo cuenta como puntual, y si
    /// llegó tarde se registra el atraso en fracciones de ciclo y se guarda el peor. El
    /// atraso se mide en periodos y no en días porque la duración del ciclo es un
    /// parámetro de cada junta (ADR-0006).
    ///
    /// Requiere que el miembro haya autorizado antes al contrato sobre el token.
    pub fn deposit(&mut self, junta_id: u32) -> Result<(), JuntaError> {
        let member = self.vm().msg_sender();
        let j = self.juntas.get(U32::from(junta_id));
        if !j.existe.get() {
            return Err(JuntaError::JuntaNoExiste(JuntaNoExiste {
                juntaId: junta_id,
            }));
        }
        if !j.estado.get(member).es_miembro.get() {
            return Err(JuntaError::NoEsMiembro(NoEsMiembro {
                juntaId: junta_id,
                quien: member,
            }));
        }

        let total_ciclos = j.miembros.len() as u32;
        let pagadas = j.estado.get(member).cuotas_pagadas.get().to::<u32>();
        if pagadas >= total_ciclos {
            return Err(JuntaError::CuotasAlDia(CuotasAlDia {
                juntaId: junta_id,
                member,
            }));
        }

        let cuota = j.cuota.get();
        let periodo = j.periodo.get().to::<u64>();
        let start_at = j.start_at.get().to::<u64>();

        // La cuota del ciclo `pagadas` vence al terminar ese ciclo.
        let vencimiento = start_at + (pagadas as u64 + 1) * periodo;
        let ahora = self.vm().block_timestamp();
        let puntual = ahora <= vencimiento;

        let contrato = self.vm().contract_address();
        self.llamar_token(
            transferFromCall {
                from: member,
                to: contrato,
                value: cuota,
            }
            .abi_encode(),
        )?;

        let mut j = self.juntas.setter(U32::from(junta_id));
        let nuevo_aportado = j.aportado.get() + cuota;
        j.aportado.set(nuevo_aportado);
        {
            let mut e = j.estado.setter(member);
            e.cuotas_pagadas.set(U32::from(pagadas + 1));
            if puntual {
                let n = e.pagos_puntuales.get() + U32::from(1);
                e.pagos_puntuales.set(n);
            } else {
                let n = e.pagos_atrasados.get() + U32::from(1);
                e.pagos_atrasados.set(n);
                let atraso = atraso_en_periodos(ahora, vencimiento, periodo);
                if atraso > e.atraso_max_periodos.get().to::<u128>() {
                    e.atraso_max_periodos.set(U128::from(atraso));
                }
            }
        }

        self.aportado_global.set(self.aportado_global.get() + cuota);

        log(
            self.vm(),
            Deposited {
                juntaId: junta_id,
                member,
                ciclo: pagadas,
                puntual,
            },
        );
        Ok(())
    }

    /// Entrega el pozo al miembro cuyo turno corresponde y avanza la rueda.
    ///
    /// No pide permisos a nadie porque no hace falta: quien tiene incentivo de llamarla es
    /// justamente quien cobra. Ese es el mismo criterio que evita depender de un operador
    /// central en el resto del sistema.
    ///
    /// El monto es lo que la junta efectivamente tiene, con tope en el pozo completo. Si
    /// alguien no pagó, quien cobra recibe menos — igual que en una junta de la vida real.
    pub fn distribute(&mut self, junta_id: u32) -> Result<U256, JuntaError> {
        let j = self.juntas.get(U32::from(junta_id));
        if !j.existe.get() {
            return Err(JuntaError::JuntaNoExiste(JuntaNoExiste {
                juntaId: junta_id,
            }));
        }

        let turno = j.turno.get().to::<u32>();
        let total_ciclos = j.miembros.len() as u32;
        if turno >= total_ciclos {
            return Err(JuntaError::JuntaCompleta(JuntaCompleta {
                juntaId: junta_id,
            }));
        }

        // No se puede vaciar la caja antes de que el ciclo termine.
        if self.ciclos_transcurridos(junta_id) <= turno {
            return Err(JuntaError::TurnoNoVencido(TurnoNoVencido {
                juntaId: junta_id,
                turno,
            }));
        }

        let j = self.juntas.get(U32::from(junta_id));
        let beneficiario = j.miembros.get(turno).unwrap_or(Address::ZERO);
        let pozo_completo = j.cuota.get() * U256::from(total_ciclos);
        let disponible = j.aportado.get() - j.distribuido.get();
        let monto = if disponible < pozo_completo {
            disponible
        } else {
            pozo_completo
        };

        // El instante en que alguien toma el pozo es el único momento en que tiene sentido
        // fotografiar su mora: a partir de aquí, lo que acumule es mora POST-cobro, que es
        // el riesgo propio de una junta —tomar el pozo y dejar de aportar— y lo que
        // distingue a un pagador lento de alguien que ya se llevó lo suyo (ADR-0007).
        let defaults_ahora = self.defaults_de(junta_id, beneficiario);

        {
            let mut j = self.juntas.setter(U32::from(junta_id));
            j.turno.set(U32::from(turno + 1));
            let nuevo_distribuido = j.distribuido.get() + monto;
            j.distribuido.set(nuevo_distribuido);
            let mut e = j.estado.setter(beneficiario);
            e.ya_cobro.set(true);
            e.defaults_al_cobrar.set(U32::from(defaults_ahora));
        }
        self.distribuido_global
            .set(self.distribuido_global.get() + monto);

        if !monto.is_zero() {
            self.llamar_token(
                transferCall {
                    to: beneficiario,
                    value: monto,
                }
                .abi_encode(),
            )?;
        }

        log(
            self.vm(),
            Distributed {
                juntaId: junta_id,
                member: beneficiario,
                turno,
                monto,
            },
        );
        Ok(monto)
    }

    /// Registra una disputa resuelta en contra del miembro. Es la única señal negativa que
    /// necesita que alguien la reporte, porque no se puede derivar de un reloj.
    ///
    /// Y por ser la única que alguien escribe a mano, es la única que alguien puede
    /// fabricar. Tres guardas la atan al juicio del grupo (ADR-0013): reporta solo quien
    /// comparte la junta con el reportado, nadie se reporta a sí mismo, y cada reportante
    /// cuenta una sola vez por reportado. La tercera es la que cierra el ataque: cinco
    /// reportes saturan el dominio de la señal y le cuestan a la víctima unos 151 puntos
    /// de score —de sobra para dejarla sin crédito—, así que sin ella una sola dirección
    /// decide sola, y el precio del ataque es el gas.
    pub fn report_dispute(&mut self, junta_id: u32, member: Address) -> Result<(), JuntaError> {
        let reportante = self.vm().msg_sender();
        let j = self.juntas.get(U32::from(junta_id));
        if !j.existe.get() {
            return Err(JuntaError::JuntaNoExiste(JuntaNoExiste {
                juntaId: junta_id,
            }));
        }
        // El error señala al llamante y no al reportado: quien no pertenece a la junta no
        // presenció nada, así que lo que está mal es quién habla, no de quién habla.
        if !j.estado.get(reportante).es_miembro.get() {
            return Err(JuntaError::NoEsMiembro(NoEsMiembro {
                juntaId: junta_id,
                quien: reportante,
            }));
        }
        // Reportarse a uno mismo no es un ataque, es un sinsentido: una disputa la pierde
        // alguien contra alguien. Se rechaza antes de tocar el registro para que el
        // atacante no pueda gastar su propio cupo y quedar "limpio".
        if reportante == member {
            return Err(JuntaError::NoPuedeReportarseASiMismo(
                NoPuedeReportarseASiMismo {
                    juntaId: junta_id,
                    quien: reportante,
                },
            ));
        }
        if !j.estado.get(member).es_miembro.get() {
            return Err(JuntaError::NoEsMiembro(NoEsMiembro {
                juntaId: junta_id,
                quien: member,
            }));
        }
        if j.reportes.get(reportante).get(member) {
            return Err(JuntaError::YaReporto(YaReporto {
                juntaId: junta_id,
                reportante,
                member,
            }));
        }

        let total = {
            let mut j = self.juntas.setter(U32::from(junta_id));
            j.reportes.setter(reportante).setter(member).set(true);
            let mut e = j.estado.setter(member);
            let n = e.disputas_perdidas.get().to::<u32>() + 1;
            e.disputas_perdidas.set(U32::from(n));
            n
        };

        log(
            self.vm(),
            DisputeReported {
                juntaId: junta_id,
                member,
                total,
            },
        );
        Ok(())
    }

    /// Las ocho señales de comportamiento de un miembro, en el orden exacto del §6.1.
    ///
    /// Cuatro se leen de agregados que se escribieron al depositar; las otras cuatro se
    /// derivan aquí mismo del reloj de la cadena. Nada recorre una lista: el Pool llama a
    /// esta función dentro de la transacción en que decide un préstamo.
    ///
    /// Devuelve, en orden:
    /// `(tasa_cumplimiento, pagos_puntuales, pagos_atrasados, defaults,`
    /// ` atraso_max_periodos, defaults_tras_cobro, antiguedad_periodos, disputas_perdidas)`
    pub fn history(
        &self,
        junta_id: u32,
        member: Address,
    ) -> (I128, u32, u32, u32, I128, u32, u32, u32) {
        let ciclos = self.ciclos_transcurridos(junta_id);
        let j = self.juntas.get(U32::from(junta_id));
        let e = j.estado.get(member);

        let pagadas = e.cuotas_pagadas.get().to::<u32>();
        let defaults = ciclos.saturating_sub(pagadas);

        // Qué fracción de lo que le tocaba pagar pagó realmente. Es una razón y no un
        // conteo a propósito: normaliza por antigüedad, así que un miembro nuevo impecable
        // puntúa igual que uno viejo impecable, y no repite información que ya está en las
        // otras señales (ADR-0009).
        //
        // Sin ciclos vencidos nadie debía nada todavía, así que el cumplimiento es total.
        // Esa rama además evita una división por cero, que en Rust aborta la ejecución.
        let tasa = tasa_de_cumplimiento(pagadas, ciclos);

        // Quien todavía no cobró no puede tener mora posterior a cobrar.
        let tras_cobro = if e.ya_cobro.get() {
            defaults.saturating_sub(e.defaults_al_cobrar.get().to::<u32>())
        } else {
            0
        };

        (
            I128::try_from(tasa).unwrap_or(I128::ZERO),
            e.pagos_puntuales.get().to::<u32>(),
            e.pagos_atrasados.get().to::<u32>(),
            defaults,
            I128::try_from(e.atraso_max_periodos.get().to::<u128>() as i128).unwrap_or(I128::ZERO),
            tras_cobro,
            ciclos,
            e.disputas_perdidas.get().to::<u32>(),
        )
    }

    /// Reconcilia la contabilidad del contrato contra el saldo que el token le reconoce.
    ///
    /// Es la única afirmación de este sistema que puede resultar falsa, y por eso es la
    /// única que vale la pena publicar. Se rompe si alguien envía tokens sueltos al
    /// contrato, si un error mueve fondos sin tocar los contadores, o si aparece un camino
    /// de salida que no sea `distribute`.
    ///
    /// La verificación es del contrato completo y no de una junta: `balanceOf` devuelve un
    /// solo saldo para todas, así que restar por junta no cuadraría nunca (ADR-0004, con
    /// la corrección que impone el contrato multi-junta del ADR-0001).
    ///
    /// Devuelve `(aportado, distribuido, saldo_real, cuadra)`.
    pub fn verify_integrity(&self) -> Result<(U256, U256, U256, bool), JuntaError> {
        let aportado = self.aportado_global.get();
        let distribuido = self.distribuido_global.get();
        let saldo = self.consultar_token(
            balanceOfCall {
                account: self.vm().contract_address(),
            }
            .abi_encode(),
        )?;
        Ok((
            aportado,
            distribuido,
            saldo,
            aportado - distribuido == saldo,
        ))
    }

    /// Cuántas de las cuotas esperadas del ciclo en curso ya entraron.
    ///
    /// Reporta progreso, no salud financiera: a mitad de ciclo el pozo todavía no se le
    /// debe a nadie, así que no hay ninguna razón de cobertura que tenga sentido mostrar.
    ///
    /// Devuelve `(ciclo, pagadas, total)`.
    pub fn cycle_coverage(&self, junta_id: u32) -> (u32, u32, u32) {
        let ciclos = self.ciclos_transcurridos(junta_id);
        let j = self.juntas.get(U32::from(junta_id));
        let total = j.miembros.len() as u32;

        let mut pagadas = 0u32;
        for i in 0..j.miembros.len() {
            let m = j.miembros.get(i).unwrap_or(Address::ZERO);
            if j.estado.get(m).cuotas_pagadas.get().to::<u32>() > ciclos {
                pagadas += 1;
            }
        }
        (ciclos, pagadas, total)
    }

    /// El estado visible de una junta: `(pozo, ciclo, turno, miembros, aportado, distribuido)`.
    ///
    /// `aportado` y `distribuido` son de esta junta; la reconciliación contra el token es
    /// del contrato entero y vive en `verify_integrity`.
    pub fn junta_state(&self, junta_id: u32) -> (U256, u32, u32, u32, U256, U256) {
        let ciclos = self.ciclos_transcurridos(junta_id);
        let j = self.juntas.get(U32::from(junta_id));
        let aportado = j.aportado.get();
        let distribuido = j.distribuido.get();
        (
            aportado - distribuido,
            ciclos,
            j.turno.get().to::<u32>(),
            j.miembros.len() as u32,
            aportado,
            distribuido,
        )
    }

    /// El nombre de la junta.
    ///
    /// Va en su propia función y no junto a los demás parámetros por una razón concreta del
    /// entorno: cuando una función devuelve varios valores y **mezcla** un tipo dinámico
    /// —un texto— con tipos de tamaño fijo, la interfaz que `cargo stylus export-abi` emite
    /// no describe los bytes que el contrato realmente devuelve. El contrato envuelve todo
    /// en una tupla adicional que la firma exportada no menciona, así que cualquiera que
    /// consuma esa interfaz falla al descifrar la respuesta.
    ///
    /// Devolver un único valor dinámico, o varios valores todos de tamaño fijo, sí funciona.
    /// Partir la consulta en dos mantiene la interfaz publicada fiel a la realidad, que es
    /// lo que importa cuando el objetivo del proyecto es justamente ser verificable.
    pub fn junta_nombre(&self, junta_id: u32) -> String {
        self.juntas.get(U32::from(junta_id)).nombre.get_string()
    }

    /// Los parámetros con los que nació la junta:
    /// `(cuota, periodo, inicio, miembros, existe)`.
    ///
    /// Sin esto una aplicación no puede decirle a nadie cuánto debe pagar ni cuándo vence,
    /// que son las dos preguntas que cualquiera se hace antes que ninguna otra.
    pub fn junta_params(&self, junta_id: u32) -> (U256, u64, u64, u32, bool) {
        let j = self.juntas.get(U32::from(junta_id));
        (
            j.cuota.get(),
            j.periodo.get().to::<u64>(),
            j.start_at.get().to::<u64>(),
            j.miembros.len() as u32,
            j.existe.get(),
        )
    }

    /// En qué juntas participa una dirección.
    ///
    /// Se mantiene como índice al crear la junta en lugar de deducirse recorriendo todo,
    /// porque "¿en cuáles estoy?" es la primera pantalla de la aplicación y no puede costar
    /// una lectura por cada junta que exista en el contrato.
    pub fn juntas_de(&self, member: Address) -> Vec<u32> {
        let lista = self.juntas_por_miembro.get(member);
        let mut salida = Vec::new();
        for i in 0..lista.len() {
            salida.push(lista.get(i).unwrap_or(U32::ZERO).to::<u32>());
        }
        salida
    }

    /// La situación de un miembro dentro de una junta:
    /// `(es_miembro, cuotas_pagadas, turno_asignado, ya_cobro, cuotas_que_debe)`.
    ///
    /// Es lo que hace falta para responder "¿me toca pagar?" sin obligar a la aplicación a
    /// reconstruirlo desde las señales del historial, que están pensadas para el modelo de
    /// crédito y no para la interfaz.
    pub fn member_state(&self, junta_id: u32, member: Address) -> (bool, u32, u32, bool, u32) {
        let ciclos = self.ciclos_transcurridos(junta_id);
        let j = self.juntas.get(U32::from(junta_id));
        let e = j.estado.get(member);

        let pagadas = e.cuotas_pagadas.get().to::<u32>();

        // El turno de cada quien es su posición en la lista de miembros.
        let mut turno = u32::MAX;
        for i in 0..j.miembros.len() {
            if j.miembros.get(i).unwrap_or(Address::ZERO) == member {
                turno = i as u32;
                break;
            }
        }

        (
            e.es_miembro.get(),
            pagadas,
            turno,
            e.ya_cobro.get(),
            ciclos.saturating_sub(pagadas),
        )
    }

    /// Si `reportante` ya reportó a `member` dentro de esta junta.
    ///
    /// Existe para la interfaz. El segundo reporte revierte, y una aplicación que no puede
    /// preguntarlo antes solo sabe ofrecer un botón que falla: el usuario paga gas para
    /// enterarse de una regla que el contrato ya conocía.
    pub fn ya_reporto(&self, junta_id: u32, reportante: Address, member: Address) -> bool {
        let j = self.juntas.get(U32::from(junta_id));
        let suyos = j.reportes.get(reportante);
        suyos.get(member)
    }

    /// Los miembros de una junta, en el orden de turno.
    pub fn miembros(&self, junta_id: u32) -> Vec<Address> {
        let j = self.juntas.get(U32::from(junta_id));
        let mut out = Vec::new();
        for i in 0..j.miembros.len() {
            out.push(j.miembros.get(i).unwrap_or(Address::ZERO));
        }
        out
    }
}

// Satisface al enlazador de Windows; no se ejecuta nunca. Ver el archivo para el porque.
#[cfg(test)]
#[path = "../../hostio_stubs.rs"]
mod hostio_stubs;

#[cfg(test)]
mod test;
