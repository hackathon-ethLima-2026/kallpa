import deployStylusContract from "./deploy_contract";
import {
  getContractDataFromDeployments,
  getDeploymentConfig,
  getRpcUrlFromChain,
  printDeployedAddresses,
} from "./utils/";
import { DeployOptions } from "./utils/type";
import { config as dotenvConfig } from "dotenv";
import * as path from "path";
import * as fs from "fs";

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  dotenvConfig({ path: envPath });
}

/**
 * EAS en Arbitrum Sepolia, comprobado contra la cadena en docs/eas-arbitrum-sepolia.md.
 *
 * Vive aquí y no dentro del contrato porque una dirección equivocada no revierte: llamar a
 * una dirección sin código devuelve éxito con datos vacíos, así que el error no aparece hasta
 * que alguien busca la attestation. Corregirlo en el WASM costaría un redespliegue; aquí es
 * editar una línea o exportar una variable.
 */
const EAS_POR_OMISION = "0x2521021fc8BF070473E1e1801D3c7B4aB701E1dE";

/** Plazo del préstamo, en segundos. Una semana. */
const PLAZO_POR_OMISION = "604800";

/**
 * UID de nuestro schema (§6.5).
 *
 * Es el `keccak256` del string del schema junto con su resolver y su bandera de revocable,
 * así que se conoce **antes** de registrarlo: registrar produce exactamente este UID o no
 * produce ninguno. Los espacios del string cuentan — el mismo schema sin el espacio tras la
 * coma da otro UID.
 */
const SCHEMA_UID_POR_OMISION =
  "0xe1cd6720370dd3b885c72ea22f914a04f39d941bd951f151d97eb616dc17c78a";

/**
 * Despliega los cuatro contratos de Kallpa en orden de dependencias.
 *
 * Stylus despliega un contrato por transacción, así que "de una vez" significa un solo
 * comando y no una sola transacción. El orden importa: cada contrato recibe en su
 * constructor la dirección del anterior, y esa dirección solo existe una vez desplegado.
 *
 *   mock_usdc  →  junta(token)  →  score_engine(junta, eas, schemaUid)  →  pool(token, score_engine)
 *
 * El Pool no necesita la dirección de EAS: decide recomputando el score, no leyendo una
 * attestation.
 */
export default async function deployScript(deployOptions: DeployOptions) {
  const config = getDeploymentConfig(deployOptions);
  const chainId = config.chain.id.toString();

  console.log(`📡 Endpoint: ${getRpcUrlFromChain(config.chain)}`);
  console.log(
    `🌐 Red: ${config.chain?.name}  ·  Chain ID: ${config.chain?.id}`,
  );
  console.log(`🔑 Desplegando desde: ${config.deployerAddress}`);
  console.log(`📁 Directorio de despliegues: ${config.deploymentDir}\n`);

  /** La dirección de un contrato ya desplegado en esta misma corrida. */
  const direccionDe = (contrato: string): string => {
    const datos = getContractDataFromDeployments(
      config.deploymentDir,
      contrato,
      chainId,
    );
    if (!datos?.address) {
      throw new Error(
        `No se encontró la dirección de '${contrato}'. Los contratos se despliegan en ` +
          `orden de dependencias y este debía estar antes.`,
      );
    }
    return datos.address;
  };

  // 1. El dinero de la demo. No tiene constructor.
  console.log("── 1/4  mock_usdc ──────────────────────────────────────");
  await deployStylusContract({
    contract: "mock_usdc",
    ...deployOptions,
  });
  const token = direccionDe("mock_usdc");

  // 2. La custodia y la fuente de verdad. Necesita saber en qué token cobra.
  console.log("\n── 2/4  junta ──────────────────────────────────────────");
  await deployStylusContract({
    contract: "junta",
    constructorArgs: [token],
    ...deployOptions,
  });
  const junta = direccionDe("junta");

  // 3. El modelo de crédito. Lee el historial de la Junta, así que la necesita cableada, y
  //    publica attestations, así que necesita a EAS y el UID del schema bajo el que emite.
  console.log("\n── 3/4  score_engine ───────────────────────────────────");
  const eas = process.env["EAS_ADDRESS"] || EAS_POR_OMISION;
  const schemaUid = process.env["EAS_SCHEMA_UID"] || SCHEMA_UID_POR_OMISION;
  await deployStylusContract({
    contract: "score_engine",
    constructorArgs: [junta, eas, schemaUid],
    ...deployOptions,
  });
  const scoreEngine = direccionDe("score_engine");

  // 4. El crédito. Paga en el token y consulta al motor en el momento de decidir.
  //
  // El plazo es política del fondo y no del protocolo —quien pone el capital decide a cuánto
  // presta—, así que entra por constructor. Una semana es un plazo razonable para un
  // microcrédito y deja la mora demostrable sin que se dispare sola durante la demostración.
  console.log("\n── 4/4  pool ───────────────────────────────────────────");
  const plazo = process.env["PLAZO_PRESTAMO"] || PLAZO_POR_OMISION;
  await deployStylusContract({
    contract: "pool",
    constructorArgs: [token, scoreEngine, plazo],
    ...deployOptions,
  });

  console.log("\n\n");
  printDeployedAddresses(config.deploymentDir, chainId);

  // El cableado de EAS se imprime junto al resto porque es el único que no falla ruidosamente
  // si está mal: hay que poder compararlo a ojo contra docs/addresses.md al terminar.
  console.log("\n📋 Cableado entre contratos:");
  console.log(`   junta.token             = ${token}`);
  console.log(`   score_engine.junta      = ${junta}`);
  console.log(`   score_engine.eas        = ${eas}`);
  console.log(`   score_engine.schemaUid  = ${schemaUid}`);
  console.log(`   pool.token              = ${token}`);
  console.log(`   pool.scoreEngine        = ${scoreEngine}`);
  console.log(
    "\n👉 Copia estas direcciones a docs/addresses.md — es un entregable del hackathon.",
  );
}
