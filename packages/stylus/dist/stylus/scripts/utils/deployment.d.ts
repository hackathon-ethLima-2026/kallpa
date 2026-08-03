import { DeploymentConfig, DeployOptions, DeploymentData } from "./type";
export declare function clearDeploymentDir(): void;
export declare function getDeploymentConfig(deployOptions: DeployOptions): DeploymentConfig;
export declare function ensureDeploymentDirectory(deploymentDir: string): void;
/**
 * Save the deployed contract address to <chain.id>_latest.json in the deployment directory.
 * If a latest file already exists, it gets renamed to include a timestamp.
 * Updates or creates the file, using contractName as the key.
 */
export declare function saveDeployment(config: DeploymentConfig, deploymentInfo: DeploymentData): void;
export declare function printDeployedAddresses(deploymentDir: string, chainId?: string): void;
/**
 * Reads the deployed contract data from chain-specific deployment files in the deployment directory.
 * Returns an object with address and chainId for the given contractName, or undefined if not found.
 */
export declare function getContractDataFromDeployments(deploymentDir: string, contractName: string, chainId?: string): {
    address: string;
    txHash: string;
    chainId: string;
} | undefined;
//# sourceMappingURL=deployment.d.ts.map