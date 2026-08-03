import { DeploymentConfig, DeployOptions } from "./type";
export declare function buildDeployCommand(config: DeploymentConfig, deployOptions: DeployOptions): Promise<string>;
export declare function estimateGasPrice(config: DeploymentConfig, deployOptions: DeployOptions): Promise<string>;
export declare function executeCommand(command: string, cwd: string, description: string): Promise<string>;
//# sourceMappingURL=command.d.ts.map