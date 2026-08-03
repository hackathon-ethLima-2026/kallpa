"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = deployScript;
const deploy_contract_1 = __importDefault(require("./deploy_contract"));
const utils_1 = require("./utils/");
const dotenv_1 = require("dotenv");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
    (0, dotenv_1.config)({ path: envPath });
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
async function deployScript(deployOptions) {
    const config = (0, utils_1.getDeploymentConfig)(deployOptions);
    const chainId = config.chain.id.toString();
    console.log(`📡 Endpoint: ${(0, utils_1.getRpcUrlFromChain)(config.chain)}`);
    console.log(`🌐 Red: ${config.chain?.name}  ·  Chain ID: ${config.chain?.id}`);
    console.log(`🔑 Desplegando desde: ${config.deployerAddress}`);
    console.log(`📁 Directorio de despliegues: ${config.deploymentDir}\n`);
    /** La dirección de un contrato ya desplegado en esta misma corrida. */
    const direccionDe = (contrato) => {
        const datos = (0, utils_1.getContractDataFromDeployments)(config.deploymentDir, contrato, chainId);
        if (!datos?.address) {
            throw new Error(`No se encontró la dirección de '${contrato}'. Los contratos se despliegan en ` +
                `orden de dependencias y este debía estar antes.`);
        }
        return datos.address;
    };
    // 1. El dinero de la demo. No tiene constructor.
    console.log("── 1/4  mock_usdc ──────────────────────────────────────");
    await (0, deploy_contract_1.default)({
        contract: "mock_usdc",
        ...deployOptions,
    });
    const token = direccionDe("mock_usdc");
    // 2. La custodia y la fuente de verdad. Necesita saber en qué token cobra.
    console.log("\n── 2/4  junta ──────────────────────────────────────────");
    await (0, deploy_contract_1.default)({
        contract: "junta",
        constructorArgs: [token],
        ...deployOptions,
    });
    const junta = direccionDe("junta");
    // 3. El modelo de crédito. Lee el historial de la Junta, así que la necesita cableada.
    console.log("\n── 3/4  score_engine ───────────────────────────────────");
    await (0, deploy_contract_1.default)({
        contract: "score_engine",
        constructorArgs: [junta],
        ...deployOptions,
    });
    const scoreEngine = direccionDe("score_engine");
    // 4. El crédito. Paga en el token y consulta al motor en el momento de decidir.
    console.log("\n── 4/4  pool ───────────────────────────────────────────");
    await (0, deploy_contract_1.default)({
        contract: "pool",
        constructorArgs: [token, scoreEngine],
        ...deployOptions,
    });
    console.log("\n\n");
    (0, utils_1.printDeployedAddresses)(config.deploymentDir, chainId);
    console.log("\n📋 Cableado entre contratos:");
    console.log(`   junta.token        = ${token}`);
    console.log(`   score_engine.junta = ${junta}`);
    console.log(`   pool.token         = ${token}`);
    console.log(`   pool.scoreEngine   = ${scoreEngine}`);
    console.log("\n👉 Copia estas direcciones a docs/addresses.md — es un entregable del hackathon.");
}
//# sourceMappingURL=deploy.js.map