//! ScoreEngine — el modelo de crédito corriendo dentro de la cadena.
//!
//! Este contrato lee el historial de un miembro directamente del contrato Junta y calcula
//! su score con una regresión logística en aritmética de punto fijo. No hay servidor de por
//! medio y no hay nada que confiar: cualquiera puede reproducir el mismo número fuera de la
//! cadena, porque todo es aritmética entera y los pesos son públicos.
//!
//! ## Tres funciones, tres necesidades distintas
//!
//! `compute_score` es una vista: no cuesta gas, no deja rastro, y es la que usan el Pool
//! para decidir un préstamo, la interfaz para mostrar un número y la página pública para
//! auditar. Es la única fuente viva del score.
//!
//! `record_score` es una transacción: computa lo mismo y además **lo escribe**. Existe
//! porque el valor que devuelve una transacción no le llega a quien la envía —de una
//! transacción minada solo se observan eventos y estado—, así que sin escritura el número
//! no quedaría consultable en ninguna parte. Es la que deja el rastro verificable en el
//! explorador, y deliberadamente **no toca EAS**: la evidencia de que el cálculo ocurrió
//! dentro de la cadena no puede depender de la pieza más frágil del sistema.
//!
//! `attest` publicará el score como credencial portable en EAS, para quien no puede leer
//! nuestra Junta. Recomputará en vivo antes de emitir: certificar una fotografía vieja
//! produciría una credencial falsa que además viaja, que es peor que una decisión interna
//! equivocada.
//!
//! Las tres son envoltorios delgados sobre el mismo cálculo, así que no existen dos
//! versiones del modelo capaces de separarse una de otra.
//!
//! ## Lo que el score persistido no es
//!
//! `latest_score` es evidencia e historial visible, **no una entrada de decisión**. El Pool
//! nunca lo lee: recomputa. La razón es que una fotografía solo se actualiza cuando alguien
//! paga gas por actualizarla, y quien incumple jamás va a firmar la transacción que hunde
//! su propio score.

#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
#![cfg_attr(not(any(test, feature = "export-abi")), no_std)]

#[macro_use]
extern crate alloc;

use alloc::string::String;
use alloc::vec::Vec;

use stylus_sdk::{
    alloy_primitives::{Address, U16, U32, U64},
    alloy_sol_types::{sol, SolCall},
    prelude::*,
    stylus_core::log,
};

mod weights;
use weights::{MAXIMOS, MINIMOS, PESOS, SCALE, SESGO, Z_MAX, Z_MIN};

/// Score a partir del cual la reputación es positiva.
///
/// Es el mismo corte con el que el Pool concede su primer tramo de crédito. Un solo número
/// gobierna "¿le prestamos?" y "¿su reputación es positiva?", de modo que no puede existir
/// un miembro con reputación positiva al que el Pool le niegue el préstamo.
const UMBRAL_POSITIVO: u16 = 400;

/// Ciclos vencidos que un miembro necesita antes de poder recibir crédito.
///
/// Sin esta regla, quien acaba de entrar a una junta puntúa **878 sobre 1000**: no hay
/// ninguna señal negativa que observar, así que el modelo no encuentra motivos para
/// desconfiar. El modelo no se equivoca —literalmente no hay evidencia en contra—, el error
/// sería tratar "no sé" como "excelente" y prestarle el monto máximo a un desconocido.
///
/// Un modelo lineal no sabe expresar incertidumbre, así que la distinción vive aquí afuera:
/// `compute_score` sigue devolviendo lo que el modelo estima, y esta política se aplica
/// encima, se lee sola y se ajusta sin volver a entrenar nada (ADR-0011).
const MINIMO_CICLOS: u32 = 3;

sol! {
    // Lo que necesitamos del contrato Junta. Se arma a mano en vez de usar `sol_interface!`
    // porque ese macro enruta las llamadas por una vía deprecada que esquiva la abstracción
    // de VM, y con ella toda posibilidad de interceptarlas desde las pruebas.
    function history(uint32 juntaId, address member) external view returns (
        int128, uint32, uint32, uint32, int128, uint32, uint32, uint32
    );

    event ScoreComputed(uint32 indexed juntaId, address indexed member, uint16 score, bool positive);

    #[derive(Debug)]
    error LecturaDeJuntaFallida(uint32 juntaId, address member);
}

#[derive(SolidityError, Debug)]
pub enum ScoreError {
    LecturaDeJuntaFallida(LecturaDeJuntaFallida),
}

sol_storage! {
    #[entrypoint]
    pub struct ScoreEngine {
        address junta;
        // Clave: (junta_id, miembro). El score pertenece al par, no al miembro suelto.
        mapping(uint32 => mapping(address => uint16)) ultimo_score;
        mapping(uint32 => mapping(address => bool)) ultimo_positivo;
        mapping(uint32 => mapping(address => uint64)) ultimo_momento;
    }
}

/// División entera que trunca hacia cero.
///
/// Es el comportamiento nativo de Rust, y se aísla en una función para poder señalarlo: el
/// espejo en Python tiene que truncar igual. La división de Python redondea hacia abajo, y
/// sobre un producto punto que puede ser negativo esa diferencia cambia el score. Sería un
/// fallo que no se parece en nada a su causa.
fn div_trunc(numerador: i128, denominador: i128) -> i128 {
    numerador / denominador
}

/// Lleva una señal a `[0, SCALE]` con min-max y saturación.
///
/// La saturación no es limpieza de datos: es la barrera que impide que un valor absurdo
/// —cuarenta atrasos, o el resultado de un error aguas arriba— se propague multiplicado por
/// su peso y devuelva un score arbitrario con aspecto de válido. Por eso corre aquí dentro
/// y no solamente durante el entrenamiento.
fn normalizar(valor: i128, minimo: i128, maximo: i128) -> i128 {
    if maximo <= minimo {
        return 0;
    }
    let x = div_trunc((valor - minimo) * SCALE, maximo - minimo);
    if x < 0 {
        0
    } else if x > SCALE {
        SCALE
    } else {
        x
    }
}

/// Convierte log-odds en un score de 0 a 1000.
///
/// La relación es lineal: cada unidad de log-odds vale siempre la misma cantidad de puntos.
/// Es la convención de las tarjetas de puntaje crediticio de toda la vida, y se eligió sobre
/// el complemento de la probabilidad por una razón medible.
///
/// Con el complemento de la probabilidad, el 85% de la población caía en el tramo superior de
/// crédito y los tramos intermedios quedaban vacíos: el score estaba bien calibrado como
/// estimación de riesgo, pero como instrumento de crédito era prácticamente binario, o el
/// monto máximo o nada. En escala de log-odds ese mismo conjunto se reparte con una mediana
/// de 804 y un tercio de la gente en los tramos del medio.
///
/// Como efecto secundario desaparece la sigmoide, que era la única aproximación del cálculo:
/// aquí no hay curva que muestrear, así que tampoco hay error que acotar.
fn puntuar(z: i128) -> u16 {
    let ancho = (Z_MAX - Z_MIN) * SCALE;
    let score = div_trunc((Z_MAX * SCALE - z) * 1000, ancho);
    if score < 0 {
        0
    } else if score > 1000 {
        1000
    } else {
        score as u16
    }
}

/// El modelo completo: de ocho señales crudas a un score de 0 a 1000.
///
/// Un score alto significa buen comportamiento: el modelo estima el riesgo de incumplir y
/// la escala lo invierte.
pub fn calcular_score(features: [i128; 8]) -> u16 {
    let mut acumulado: i128 = 0;
    let mut i = 0;
    while i < 8 {
        acumulado += PESOS[i] * normalizar(features[i], MINIMOS[i], MAXIMOS[i]);
        i += 1;
    }

    let z = div_trunc(acumulado, SCALE) + SESGO;
    puntuar(z)
}

/// Interpreta 32 bytes en complemento a dos como un entero con signo.
///
/// Las señales llegan codificadas para la ABI de Ethereum, donde un número negativo se
/// representa con todos los bits altos en uno. Leerlo sin considerar el signo convertiría
/// un valor pequeño y negativo en uno astronómico, y el score saldría disparado.
fn leer_palabra_con_signo(palabra: &[u8]) -> i128 {
    let negativo = palabra[0] & 0x80 != 0;
    let mut valor: i128 = 0;
    // Los dieciséis bytes bajos alcanzan de sobra para todo lo que este modelo maneja.
    let mut i = 16;
    while i < 32 {
        valor = (valor << 8) | (palabra[i] as i128);
        i += 1;
    }
    if negativo {
        // Reconstruye el negativo restando dos veces el bit más alto.
        valor.wrapping_sub(1i128 << 127).wrapping_sub(1i128 << 127)
    } else {
        valor
    }
}

impl ScoreEngine {
    /// Lee el historial vivo del miembro en la Junta y computa su score.
    ///
    /// Es una lectura, así que va por `self.vm()` y se puede interceptar desde las pruebas.
    /// Es también el único camino por el que se obtiene un score: las funciones públicas
    /// terminan todas aquí.
    fn score_de(&self, junta_id: u32, member: Address) -> Result<(u16, bool), ScoreError> {
        let datos = historyCall {
            juntaId: junta_id,
            member,
        }
        .abi_encode();

        let contexto: &Self = self;
        let respuesta = self
            .vm()
            .static_call(&contexto, self.junta.get(), &datos)
            .map_err(|_| {
                ScoreError::LecturaDeJuntaFallida(LecturaDeJuntaFallida {
                    juntaId: junta_id,
                    member,
                })
            })?;

        // Ocho valores de treinta y dos bytes. Si la Junta devolviera otra cosa es que las
        // interfaces se desincronizaron, y conviene fallar ruidosamente antes que puntuar
        // basura con aspecto de score válido.
        if respuesta.len() < 8 * 32 {
            return Err(ScoreError::LecturaDeJuntaFallida(LecturaDeJuntaFallida {
                juntaId: junta_id,
                member,
            }));
        }

        let mut features = [0i128; 8];
        let mut i = 0;
        while i < 8 {
            features[i] = leer_palabra_con_signo(&respuesta[i * 32..(i + 1) * 32]);
            i += 1;
        }

        let score = calcular_score(features);
        // La antigüedad es la séptima señal: cuántos ciclos han vencido para este miembro.
        let ciclos = features[6] as u32;
        let con_credito = score >= UMBRAL_POSITIVO && ciclos >= MINIMO_CICLOS;
        Ok((score, con_credito))
    }
}

#[public]
impl ScoreEngine {
    #[constructor]
    pub fn constructor(&mut self, junta: Address) {
        self.junta.set(junta);
    }

    pub fn junta(&self) -> Address {
        self.junta.get()
    }

    /// La huella del modelo desplegado. Permite comprobar con qué versión exacta se calculó
    /// un score, sin tener que confiar en nadie.
    pub fn model_hash(&self) -> String {
        String::from(weights::MODEL_HASH)
    }

    pub fn umbral_positivo(&self) -> u16 {
        UMBRAL_POSITIVO
    }

    /// Ciclos de historial que exige la política de crédito antes de prestar.
    pub fn minimo_ciclos(&self) -> u32 {
        MINIMO_CICLOS
    }

    /// El score vivo de un miembro. Vista: no cuesta gas y no deja rastro.
    ///
    /// Es la fuente que consultan el Pool para decidir, la interfaz para mostrar y la
    /// página pública para auditar. Siempre lee el historial del momento.
    pub fn compute_score(&self, junta_id: u32, member: Address) -> Result<u16, ScoreError> {
        Ok(self.score_de(junta_id, member)?.0)
    }

    /// El score y la elegibilidad de un tirón: `(score, con_credito)`.
    ///
    /// Existe para que el Pool resuelva un préstamo con una sola llamada. Consultando ambas
    /// cosas por separado, cada préstamo leería el historial de la Junta dos veces y las dos
    /// respuestas podrían venir de instantes distintos.
    pub fn score_and_credit(
        &self,
        junta_id: u32,
        member: Address,
    ) -> Result<(u16, bool), ScoreError> {
        self.score_de(junta_id, member)
    }

    /// Si el miembro puede recibir crédito en este momento.
    ///
    /// Son dos condiciones y no una: que el score alcance el umbral, y que haya suficiente
    /// historial para que ese score signifique algo (ADR-0011).
    pub fn is_positive(&self, junta_id: u32, member: Address) -> Result<bool, ScoreError> {
        Ok(self.score_de(junta_id, member)?.1)
    }

    /// Computa el score y lo **escribe** en la cadena, emitiendo el evento.
    ///
    /// Es la transacción que deja el rastro verificable: un hash en el explorador y un
    /// número de gas que se puede citar. No toca EAS a propósito — la prueba de que el
    /// cálculo ocurrió dentro de la cadena no puede depender de una integración externa.
    pub fn record_score(&mut self, junta_id: u32, member: Address) -> Result<u16, ScoreError> {
        let (score, positivo) = self.score_de(junta_id, member)?;
        let ahora = self.vm().block_timestamp();

        let id = U32::from(junta_id);
        self.ultimo_score
            .setter(id)
            .insert(member, U16::from(score));
        self.ultimo_positivo.setter(id).insert(member, positivo);
        self.ultimo_momento
            .setter(id)
            .insert(member, U64::from(ahora));

        log(
            self.vm(),
            ScoreComputed {
                juntaId: junta_id,
                member,
                score,
                positive: positivo,
            },
        );
        Ok(score)
    }

    /// El último score registrado: `(score, positivo, momento)`.
    ///
    /// Es evidencia e historial visible. **No es una entrada de decisión**: el Pool
    /// recomputa en vivo, porque una fotografía solo se actualiza cuando alguien paga gas
    /// por actualizarla, y quien incumple nunca lo hará.
    pub fn latest_score(&self, junta_id: u32, member: Address) -> (u16, bool, u64) {
        let id = U32::from(junta_id);
        (
            self.ultimo_score.get(id).get(member).to::<u16>(),
            self.ultimo_positivo.get(id).get(member),
            self.ultimo_momento.get(id).get(member).to::<u64>(),
        )
    }
}

// Satisface al enlazador de Windows; no se ejecuta nunca. Ver el archivo para el porqué.
#[cfg(test)]
#[path = "../../hostio_stubs.rs"]
mod hostio_stubs;

#[cfg(test)]
mod test;
