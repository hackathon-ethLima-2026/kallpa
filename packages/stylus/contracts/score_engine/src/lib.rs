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
//! `attest` publica el score como credencial portable en EAS, para quien no puede leer
//! nuestra Junta. Recomputa en vivo antes de emitir: certificar una fotografía vieja
//! produciría una credencial falsa que además viaja, que es peor que una decisión interna
//! equivocada.
//!
//! Las tres son envoltorios delgados sobre el mismo cálculo, así que no existen dos
//! versiones del modelo capaces de separarse una de otra.
//!
//! ## Por qué la attestation es por junta y no global
//!
//! El crédito se decide con el peor historial de todas las juntas del miembro (ADR-0014),
//! pero la attestation certifica un hecho granular y se autodescribe con su `juntaId`
//! (ADR-0001). La diferencia es de verificabilidad: quien recibe "se comportó así en esta
//! junta" puede releer esa junta y comprobarlo, mientras que un veredicto agregado no dice
//! qué juntas entraron en él, así que no se puede comprobar contra nada. El agregado es una
//! decisión nuestra; la attestation es evidencia de terceros.
//!
//! ## Por qué EAS entra por el constructor
//!
//! La dirección de EAS y el UID del schema son argumentos del constructor y no constantes
//! del binario. No es por flexibilidad, es por cómo falla el error: llamar a una dirección
//! sin código **devuelve éxito con datos vacíos**, así que una dirección equivocada quemada
//! en el WASM no revierte —se ve exactamente igual que un EAS que funciona— y solo se
//! descubre cuando alguien busca la attestation y no está. Corregirla exigiría redesplegar
//! el contrato entero. Además el schema se registra en una transacción aparte, así que su
//! UID no existe todavía cuando este contrato se compila.
//!
//! ## Lo que el score persistido no es
//!
//! `latest_score` es evidencia e historial visible, **no una entrada de decisión**. El Pool
//! nunca lo lee: recomputa. La razón es que una fotografía solo se actualiza cuando alguien
//! paga gas por actualizarla, y quien incumple jamás va a firmar la transacción que hunde
//! su propio score.
//!
//! ## El score por junta y el score global
//!
//! El score se computa siempre a partir de una junta concreta (ADR-0001): esa es su fuente.
//! Pero decidir un crédito mirando **una** junta que elige el propio solicitante no decide
//! nada: quien está en mora en una junta y limpio en otra pide prestado contra la limpia.
//!
//! `score_global` cierra esa puerta leyendo todas las juntas del miembro y quedándose con la
//! peor (ADR-0014). Las funciones por junta siguen existiendo sin cambios, porque mostrar
//! "tu score en esta junta" sigue siendo una pregunta legítima; lo que no puede seguir
//! siendo legítimo es prestar con esa respuesta.

#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
#![cfg_attr(not(any(test, feature = "export-abi")), no_std)]

#[macro_use]
extern crate alloc;

use alloc::string::String;
use alloc::vec::Vec;

use stylus_sdk::{
    alloy_primitives::{b256, Address, Bytes, FixedBytes, U16, U256, U32, U64},
    alloy_sol_types::{sol, SolCall, SolValue},
    crypto::keccak,
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

/// Ciclos vencidos a partir de los cuales una junta entra en el score global.
///
/// Es deliberadamente más bajo que `MINIMO_CICLOS`, y la asimetría es el corazón de la regla
/// (ADR-0014): una junta joven **no alcanza para aprobar** un crédito, pero un incumplimiento
/// dentro de ella sí es una señal real de comportamiento. Ignorar las juntas jóvenes dejaría
/// abierta la puerta de "abro una junta nueva, la incumplo, y como es joven no cuenta".
///
/// Debajo de un ciclo no hay nada que observar: ninguna cuota ha vencido todavía, así que la
/// junta no aporta ni evidencia buena ni mala.
const MINIMO_CICLOS_OBSERVABLES: u32 = 1;

/// Cuántas juntas puede tener un miembro para que su veredicto global se pueda computar.
///
/// El número no sale de ninguna teoría: sale de que cada junta cuesta una lectura al contrato
/// Junta dentro de la transacción que decide un préstamo, y ese gas lo paga quien pide. Con
/// treinta y dos hay margen de sobra para cualquier persona real —una junta dura tantos ciclos
/// como miembros tiene, así que llevar treinta y dos a la vez es una vida entera de ahorro— y
/// el techo evita que una dirección fabricada con cientos de juntas vuelva impagable la
/// consulta.
const MAXIMO_JUNTAS_EVALUABLES: u32 = 32;

/// Cuánto vale una attestation antes de que haya que rehacerla (§6.5).
///
/// El historial de una junta viva sigue moviéndose, así que una attestation de hace meses
/// describe a un miembro que ya no existe. Vencerla obliga a recomputar en vez de dejar que
/// una foto favorable le sobreviva a los hechos que la desmienten.
///
/// El vencimiento tiene además una exigencia de EAS: si el instante que se declara ya pasó,
/// la llamada revierte con `InvalidExpirationTime` (`0x08e8b937`), un error que no menciona
/// ninguna fecha y que por eso cuesta reconocer.
const VIGENCIA_ATTESTATION: u64 = 90 * 24 * 60 * 60;

/// La huella del modelo en los treinta y dos bytes que pide el schema.
///
/// `weights::MODEL_HASH` es un `&str` porque `model_hash()` lo expone al frente, y el schema
/// quiere `bytes32`: el mismo valor vive dos veces y **nada las mantiene sincronizadas**. Si
/// `quantize.py` emite un modelo nuevo y solo se actualiza una, las attestations certificarán
/// un modelo distinto del que calculó el score, y el error no se nota —el `bytes32` se ve
/// perfectamente válido—. Por eso hay una prueba que compara las dos representaciones.
const MODEL_HASH_BYTES: FixedBytes<32> =
    b256!("9664441e2342982ac11dab05b4ac95752f480eda32150983805e014fbc92b0c1");

sol! {
    // Lo que necesitamos del contrato Junta. Se arma a mano en vez de usar `sol_interface!`
    // porque ese macro enruta las llamadas por una vía deprecada que esquiva la abstracción
    // de VM, y con ella toda posibilidad de interceptarlas desde las pruebas.
    function history(uint32 juntaId, address member) external view returns (
        int128, uint32, uint32, uint32, int128, uint32, uint32, uint32
    );

    function juntasDe(address member) external view returns (uint32[]);

    // La forma exacta de `IEAS.sol`. Los dos structs se declaran completos aunque solo se
    // use `attest`, porque el selector se calcula sobre la forma entera: un campo de menos
    // produce otro selector sin ningún aviso, y la llamada resultante no revierte por un
    // motivo que se parezca a la causa.
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

    event ScoreComputed(uint32 indexed juntaId, address indexed member, uint16 score, bool positive);

    event ScoreAttested(
        uint32 indexed juntaId,
        address indexed member,
        uint16 score,
        bool positive,
        bytes32 uid
    );

    #[derive(Debug)]
    error LecturaDeJuntaFallida(uint32 juntaId, address member);

    #[derive(Debug)]
    error ListaDeJuntasFallida(address member);

    #[derive(Debug)]
    error AttestationFallida(uint32 juntaId, address member);

    /// El miembro tiene más juntas de las que se pueden recorrer en una sola consulta.
    ///
    /// Dice cuántas tiene y cuál es el techo, porque un revert sin números obligaría a quien
    /// lo recibe a adivinar si le faltan dos juntas o doscientas.
    #[derive(Debug)]
    error DemasiadasJuntas(address member, uint32 juntas, uint32 maximo);
}

#[derive(SolidityError, Debug)]
pub enum ScoreError {
    LecturaDeJuntaFallida(LecturaDeJuntaFallida),
    ListaDeJuntasFallida(ListaDeJuntasFallida),
    AttestationFallida(AttestationFallida),
    DemasiadasJuntas(DemasiadasJuntas),
}

sol_storage! {
    #[entrypoint]
    pub struct ScoreEngine {
        address junta;
        // Cableado de EAS. Entra por constructor y no como constante: ver la cabecera.
        address eas;
        bytes32 schema_uid;
        // Clave: (junta_id, miembro). El score pertenece al par, no al miembro suelto.
        mapping(uint32 => mapping(address => uint16)) ultimo_score;
        mapping(uint32 => mapping(address => bool)) ultimo_positivo;
        mapping(uint32 => mapping(address => uint64)) ultimo_momento;
        // El UID vive bajo la misma clave que el score que certifica: separarlos permitiría
        // leer una attestation y atribuirle un número que no es el suyo.
        mapping(uint32 => mapping(address => bytes32)) ultima_attestation;
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

/// Los ciclos transcurridos que declara un historial: su séptima señal.
///
/// Satura en cero en vez de convertir a secas, porque la Junta declara la antigüedad como
/// `uint32` y un valor negativo solo puede venir de una interfaz desincronizada. Convertido
/// sin más, ese negativo se volvería un número gigantesco que abriría de par en par todas
/// las puertas de historial mínimo.
fn ciclos_transcurridos(features: &[i128; 8]) -> u32 {
    if features[6] < 0 {
        0
    } else {
        features[6] as u32
    }
}

/// Si una junta por sí sola alcanza para conceder crédito.
///
/// Son dos condiciones y no una: que el score llegue al umbral, y que exista suficiente
/// historial para que ese número signifique algo (ADR-0011). Vive suelta porque la aplican
/// tanto el camino de lectura como el de escritura, y dos copias podrían separarse.
fn con_credito(features: &[i128; 8], score: u16) -> bool {
    score >= UMBRAL_POSITIVO && ciclos_transcurridos(features) >= MINIMO_CICLOS
}

/// El compromiso con las señales que produjeron el score: `keccak256` de las ocho palabras.
///
/// Viaja dentro de la attestation para que un tercero pueda comprobar **con qué historial**
/// se calculó ese número sin que la attestation cargue los datos crudos: quien tenga las ocho
/// señales rehace el hash y ve si coinciden; quien no las tenga no aprende nada de ellas.
///
/// Se compromete con las señales **tal como las leyó el modelo** y no con los bytes crudos
/// que devolvió la Junta. Es la versión que se puede defender: lo que el modelo ignoró
/// tampoco influyó en el score, así que incluirlo en el compromiso ataría la attestation a
/// bytes que no la explican. Para una Junta bien formada las dos cosas coinciden.
fn compromiso_de(features: &[i128; 8]) -> FixedBytes<32> {
    let mut palabras = [0u8; 8 * 32];
    let mut i = 0;
    while i < 8 {
        let base = i * 32;
        // Complemento a dos de 256 bits, igual que lo codificaría la ABI de Ethereum: el
        // relleno alto va en unos cuando el valor es negativo. Rellenarlo siempre con ceros
        // daría el mismo hash para un valor y para su negativo en algunas combinaciones.
        if features[i] < 0 {
            let mut j = 0;
            while j < 16 {
                palabras[base + j] = 0xFF;
                j += 1;
            }
        }
        palabras[base + 16..base + 32].copy_from_slice(&features[i].to_be_bytes());
        i += 1;
    }
    keccak(palabras)
}

/// Los cinco campos del schema (§6.5), codificados como los espera EAS.
///
/// Son todos de tamaño fijo, así que esto son 160 bytes planos: cinco palabras seguidas, sin
/// tabla de desplazamientos ni longitudes. Eso es lo que permite verificar la attestation a
/// ojo, y es una propiedad del schema y no una casualidad: agregarle un `string` o un `bytes`
/// volvería el payload dinámico y toda lectura directa dejaría de servir.
///
/// Vive aparte de la llamada porque es la única parte del camino de attestation que se puede
/// probar: la llamada a EAS muta estado ajeno y en el SDK 0.9 no hay dónde interceptarla.
fn payload_del_schema(
    score: u16,
    positivo: bool,
    junta_id: u32,
    compromiso: FixedBytes<32>,
) -> Vec<u8> {
    (score, positivo, junta_id, MODEL_HASH_BYTES, compromiso).abi_encode_params()
}

impl ScoreEngine {
    /// Lee las ocho señales del historial vivo del miembro en la Junta.
    ///
    /// Es una lectura, así que va por `self.vm()` y se puede interceptar desde las pruebas.
    /// Es también el único camino por el que entra el historial: todo lo que puntúa en este
    /// contrato termina aquí, así que no existen dos versiones de lo que se leyó.
    ///
    /// Devuelve las señales crudas y no el score porque el score global necesita además la
    /// antigüedad para decidir si la junta entra en la cuenta, y volver a pedir el historial
    /// para leerla dejaría dos lecturas de instantes distintos describiendo la misma junta.
    fn senales_de(&self, junta_id: u32, member: Address) -> Result<[i128; 8], ScoreError> {
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
        Ok(features)
    }

    /// El score de un miembro en una junta y si esa junta le da crédito por sí sola.
    fn score_de(&self, junta_id: u32, member: Address) -> Result<(u16, bool), ScoreError> {
        let features = self.senales_de(junta_id, member)?;
        let score = calcular_score(features);
        Ok((score, con_credito(&features, score)))
    }

    /// Las juntas en las que participa el miembro, según el índice de la propia Junta.
    ///
    /// Se pregunta en vez de recibirla por parámetro justamente porque el parámetro es el
    /// agujero: quien pide el préstamo elegiría qué juntas declarar. La lista la da el
    /// contrato que las custodia, no el solicitante.
    fn juntas_del_miembro(&self, member: Address) -> Result<Vec<u32>, ScoreError> {
        let datos = juntasDeCall { member }.abi_encode();

        let contexto: &Self = self;
        let respuesta = self
            .vm()
            .static_call(&contexto, self.junta.get(), &datos)
            .map_err(|_| ScoreError::ListaDeJuntasFallida(ListaDeJuntasFallida { member }))?;

        // El arreglo es dinámico, así que se decodifica con el mismo `sol!` que lo pidió en
        // vez de a mano: aquí hay un desplazamiento y una longitud que validar, y una lista
        // mal leída se traduciría en juntas fantasma o en juntas silenciadas.
        juntasDeCall::abi_decode_returns(&respuesta, true)
            .map(|salida| salida._0)
            .map_err(|_| ScoreError::ListaDeJuntasFallida(ListaDeJuntasFallida { member }))
    }

    /// Recomputa el score del par, lo escribe y emite `ScoreComputed`.
    ///
    /// Es el cómputo único de ADR-0002: `record_score` y `attest` son envoltorios delgados
    /// sobre esto, así que no puede existir una versión del modelo que se separe de la otra
    /// ni un score atestiguado que difiera del score registrado en la misma transacción.
    ///
    /// Devuelve también las señales porque `attest` tiene que comprometerse con las mismas
    /// que puntuó. Volver a pedirlas dejaría dos lecturas de instantes distintos dentro de
    /// una attestation que afirma describir un solo momento.
    fn computar_y_persistir(
        &mut self,
        junta_id: u32,
        member: Address,
    ) -> Result<([i128; 8], u16, bool), ScoreError> {
        let features = self.senales_de(junta_id, member)?;
        let score = calcular_score(features);
        let positivo = con_credito(&features, score);
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
        Ok((features, score, positivo))
    }

    /// Publica la attestation en EAS y devuelve el UID que EAS le asignó.
    ///
    /// Solo codifica y envía: el score llega ya recomputado, porque la regla de no certificar
    /// fotos viejas (ADR-0003) pertenece al camino público y no a la mensajería.
    #[allow(deprecated)]
    fn emitir_attestation(
        &mut self,
        junta_id: u32,
        member: Address,
        score: u16,
        positivo: bool,
        compromiso: FixedBytes<32>,
    ) -> Result<FixedBytes<32>, ScoreError> {
        let payload = payload_del_schema(score, positivo, junta_id, compromiso);

        let datos = attestCall {
            request: AttestationRequest {
                schema: self.schema_uid.get(),
                data: AttestationRequestData {
                    recipient: member,
                    expirationTime: self.vm().block_timestamp() + VIGENCIA_ATTESTATION,
                    revocable: true,
                    refUID: FixedBytes::<32>::ZERO,
                    data: Bytes::from(payload),
                    // Nuestro schema se registra sin resolver, y EAS revierte con
                    // `NotPayable` (`0x1574f9f3`) si le llega valor, aunque `attest` esté
                    // marcada `payable`. La vía de abajo manda cero por omisión: el trabajo
                    // aquí es no cambiarla por una que permita adjuntar ETH.
                    value: U256::ZERO,
                },
            },
        }
        .abi_encode();

        // Se lee antes de la llamada a propósito: `&mut *self` y `self.eas.get()` como
        // argumentos de la misma expresión toman el préstamo mutable y el compartido a la vez.
        let eas = self.eas.get();

        // Muta estado ajeno, así que va por `call` y no por `static_call`: en el SDK 0.9
        // `CallAccess::call` pediría `&self` y `&mut self` simultáneamente y no compila. Es
        // la misma vía que usa `mover_token` en el Pool, y el precio es que esta llamada no
        // pasa por la abstracción de VM y por lo tanto no se puede interceptar en pruebas.
        let respuesta = stylus_sdk::call::call(&mut *self, eas, &datos).map_err(|_| {
            ScoreError::AttestationFallida(AttestationFallida {
                juntaId: junta_id,
                member,
            })
        })?;

        // Una dirección sin código devuelve **éxito con cero bytes**. Sin esta comprobación
        // un EAS mal cableado se vería exactamente igual que uno que funciona: guardaríamos
        // ceros como UID y el evento anunciaría una attestation que no existe.
        if respuesta.len() < 32 {
            return Err(ScoreError::AttestationFallida(AttestationFallida {
                juntaId: junta_id,
                member,
            }));
        }

        let uid = FixedBytes::<32>::from_slice(&respuesta[..32]);
        log(
            self.vm(),
            ScoreAttested {
                juntaId: junta_id,
                member,
                score,
                positive: positivo,
                uid,
            },
        );
        Ok(uid)
    }
}

#[public]
impl ScoreEngine {
    #[constructor]
    pub fn constructor(&mut self, junta: Address, eas: Address, schema_uid: FixedBytes<32>) {
        self.junta.set(junta);
        self.eas.set(eas);
        self.schema_uid.set(schema_uid);
    }

    pub fn junta(&self) -> Address {
        self.junta.get()
    }

    /// La dirección de EAS con la que se emiten las attestations.
    ///
    /// Se expone porque el cableado hay que poder auditarlo desde afuera: un EAS equivocado
    /// no revierte nada, y esta vista es la forma barata de descartarlo antes de buscar el
    /// fallo en otra parte.
    pub fn eas(&self) -> Address {
        self.eas.get()
    }

    /// El UID del schema EAS bajo el que se emiten las attestations.
    pub fn schema_uid(&self) -> FixedBytes<32> {
        self.schema_uid.get()
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

    /// El score del miembro mirando **todas** sus juntas: `(peor_score, con_credito,
    /// juntas_evaluadas)`.
    ///
    /// Las funciones por junta responden "¿cómo se comportó aquí?". Esta responde la única
    /// pregunta con la que se puede prestar: "¿cómo se comporta?". La diferencia no es
    /// teórica —una misma dirección de la demo puntúa 1000 en una junta y 194 en otra—, y
    /// mientras el solicitante sea quien elige la junta, elige también su propio veredicto.
    ///
    /// El score que manda es el **peor**, porque es lo que un prestamista real quiere saber:
    /// promediar dejaría que un historial impecable pague el silencio de un incumplimiento,
    /// y es justo el incumplimiento lo que se está tratando de ver.
    ///
    /// Se evalúan las juntas desde **un** ciclo vencido, no desde tres. La asimetría con
    /// `MINIMO_CICLOS` es intencional: una junta joven no basta para APROBAR crédito, pero
    /// un incumplimiento en ella sí es señal real. Si solo contaran las juntas maduras,
    /// bastaría con abrir una junta nueva, incumplirla y esperar a que su juventud la
    /// vuelva invisible (ADR-0014).
    ///
    /// Devuelve `(0, false, 0)` cuando no hay ninguna junta evaluable. Es "no sé", no
    /// "pésimo": sin ciclos vencidos no hay comportamiento que observar, y por eso el
    /// tercer valor viaja de vuelta — quien llama distingue "peor score cero" de "cero
    /// juntas miradas" sin tener que adivinarlo.
    ///
    /// Los tres valores son de tamaño fijo a propósito. Mezclar un tipo dinámico con tipos
    /// fijos en una función de varios retornos produce una interfaz que no describe los
    /// bytes reales, y ya nos costó un fallo una vez.
    pub fn score_global(&self, member: Address) -> Result<(u16, bool, u32), ScoreError> {
        let juntas = self.juntas_del_miembro(member)?;

        // Cada junta cuesta una lectura al contrato Junta, así que el costo crece con cuántas
        // tenga el miembro. Se pone un techo, y al pasarlo se **revierte** en vez de mirar
        // solo las primeras: truncar en silencio abriría la puerta a esconder la peor junta
        // más allá del corte, que es exactamente el hueco que esta función existe para cerrar.
        // Un revert es incómodo y honesto; una respuesta incompleta que parece completa, no.
        if juntas.len() > MAXIMO_JUNTAS_EVALUABLES as usize {
            return Err(ScoreError::DemasiadasJuntas(DemasiadasJuntas {
                member,
                juntas: juntas.len() as u32,
                maximo: MAXIMO_JUNTAS_EVALUABLES,
            }));
        }

        let mut peor: u16 = 0;
        let mut evaluadas: u32 = 0;
        let mut hay_historial_suficiente = false;

        for junta_id in juntas.iter() {
            let features = self.senales_de(*junta_id, member)?;
            let ciclos = ciclos_transcurridos(&features);
            if ciclos < MINIMO_CICLOS_OBSERVABLES {
                continue;
            }

            let score = calcular_score(features);
            if evaluadas == 0 || score < peor {
                peor = score;
            }
            evaluadas += 1;

            // Basta con que UNA junta tenga historial suficiente: la exigencia de ADR-0011
            // es que exista comportamiento observado en alguna parte, no en todas.
            if ciclos >= MINIMO_CICLOS {
                hay_historial_suficiente = true;
            }
        }

        if evaluadas == 0 {
            return Ok((0, false, 0));
        }

        let con_credito = hay_historial_suficiente && peor >= UMBRAL_POSITIVO;
        Ok((peor, con_credito, evaluadas))
    }

    /// Computa el score y lo **escribe** en la cadena, emitiendo el evento.
    ///
    /// Es la transacción que deja el rastro verificable: un hash en el explorador y un
    /// número de gas que se puede citar. No toca EAS a propósito — la prueba de que el
    /// cálculo ocurrió dentro de la cadena no puede depender de una integración externa.
    pub fn record_score(&mut self, junta_id: u32, member: Address) -> Result<u16, ScoreError> {
        Ok(self.computar_y_persistir(junta_id, member)?.1)
    }

    /// Publica el score del miembro como attestation EAS y devuelve su UID.
    ///
    /// Recomputa en vivo antes de emitir (ADR-0003). Certificar una fotografía vieja sería
    /// peor que decidir mal adentro: la credencial falsa viaja, y quien la recibe no tiene
    /// cómo saber que describe un pasado que ya no se sostiene.
    ///
    /// La attestation es de **una junta** y lo dice en su propio `juntaId` (ADR-0001), aunque
    /// el crédito se decida con el peor historial de todas (ADR-0014). El agregado es un
    /// juicio nuestro y nadie de afuera puede recomprobarlo; el hecho granular sí, releyendo
    /// esa junta. Quien quiera el veredicto completo pide una attestation por junta.
    ///
    /// Emite también `ScoreComputed`, porque el score se computó y se escribió igual que en
    /// `record_score`: silenciarlo dejaría transacciones que cambian el score registrado sin
    /// aparecer en el rastro por el que se lo sigue.
    ///
    /// El UID no se puede predecir —EAS lo deriva del instante del bloque y de un contador
    /// interno—, así que se lee del valor de retorno y se guarda. Sin eso existiría solo
    /// dentro de la transacción que lo creó: de una transacción minada no se observa el valor
    /// de retorno.
    pub fn attest(&mut self, junta_id: u32, member: Address) -> Result<FixedBytes<32>, ScoreError> {
        let (features, score, positivo) = self.computar_y_persistir(junta_id, member)?;
        let uid =
            self.emitir_attestation(junta_id, member, score, positivo, compromiso_de(&features))?;

        self.ultima_attestation
            .setter(U32::from(junta_id))
            .insert(member, uid);
        Ok(uid)
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

    /// El UID de la última attestation emitida para el par, o ceros si nunca se emitió.
    ///
    /// Va en su propia vista y no dentro de `latest_score` para no cambiar una interfaz que
    /// ya consumen otros. Con el UID en la mano cualquiera lee la attestation completa
    /// contra EAS y comprueba los cinco campos por su cuenta, que es el punto: no hace falta
    /// creerle a este contrato lo que dice de sí mismo.
    pub fn latest_attestation(&self, junta_id: u32, member: Address) -> FixedBytes<32> {
        self.ultima_attestation.get(U32::from(junta_id)).get(member)
    }
}

// Satisface al enlazador de Windows; no se ejecuta nunca. Ver el archivo para el porqué.
#[cfg(test)]
#[path = "../../hostio_stubs.rs"]
mod hostio_stubs;

#[cfg(test)]
mod test;
