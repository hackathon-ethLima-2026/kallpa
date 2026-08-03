import { DeployOptions } from "./utils/type";
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
export default function deployScript(deployOptions: DeployOptions): Promise<void>;
//# sourceMappingURL=deploy.d.ts.map