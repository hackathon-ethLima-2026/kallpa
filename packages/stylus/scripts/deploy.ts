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
 * Despliega los cuatro contratos de Kallpa en orden de dependencias.
 *
 * Stylus despliega un contrato por transacción, así que "de una vez" significa un solo
 * comando y no una sola transacción. El orden importa: cada contrato recibe en su
 * constructor la dirección del anterior, y esa dirección solo existe una vez desplegado.
 *
 *   mock_usdc  →  junta(token)  →  score_engine(junta)  →  pool(token, score_engine)
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

  // 3. El modelo de crédito. Lee el historial de la Junta, así que la necesita cableada.
  console.log("\n── 3/4  score_engine ───────────────────────────────────");
  await deployStylusContract({
    contract: "score_engine",
    constructorArgs: [junta],
    ...deployOptions,
  });
  const scoreEngine = direccionDe("score_engine");

  // 4. El crédito. Paga en el token y consulta al motor en el momento de decidir.
  console.log("\n── 4/4  pool ───────────────────────────────────────────");
  await deployStylusContract({
    contract: "pool",
    constructorArgs: [token, scoreEngine],
    ...deployOptions,
  });

  console.log("\n\n");
  printDeployedAddresses(config.deploymentDir, chainId);

  console.log("\n📋 Cableado entre contratos:");
  console.log(`   junta.token        = ${token}`);
  console.log(`   score_engine.junta = ${junta}`);
  console.log(`   pool.token         = ${token}`);
  console.log(`   pool.scoreEngine   = ${scoreEngine}`);
  console.log(
    "\n👉 Copia estas direcciones a docs/addresses.md — es un entregable del hackathon.",
  );
}
