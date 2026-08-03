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
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearDeploymentDir = clearDeploymentDir;
exports.getDeploymentConfig = getDeploymentConfig;
exports.ensureDeploymentDirectory = ensureDeploymentDirectory;
exports.saveDeployment = saveDeployment;
exports.printDeployedAddresses = printDeployedAddresses;
exports.getContractDataFromDeployments = getContractDataFromDeployments;
const dotenv_1 = require("dotenv");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const supportedChains_1 = require("../../../nextjs/utils/scaffold-stylus/supportedChains");
const network_1 = require("./network");
const contract_1 = require("./contract");
// Load environment variables from .env file
const envPath = path.resolve(__dirname, "../../.env");
if (fs.existsSync(envPath)) {
    (0, dotenv_1.config)({ path: envPath });
}
function clearDeploymentDir() {
    const deploymentDir = process.env["DEPLOYMENT_DIR"] || "deployments";
    if (fs.existsSync(deploymentDir)) {
        fs.rmSync(deploymentDir, { recursive: true });
    }
}
function getDeploymentConfig(deployOptions) {
    // If network is specified, try to get RPC URL from viem chains
    if (!deployOptions.network)
        deployOptions.network = "devnet";
    const chain = (0, network_1.getChain)(deployOptions.network);
    if (!chain)
        throw new Error(`Network ${deployOptions.network} not found`);
    let contractName;
    if (deployOptions.contract) {
        try {
            contractName =
                deployOptions.name ||
                    (0, contract_1.getContractNameFromCargoToml)(path.join("contracts", deployOptions.contract));
        }
        catch (e) {
            throw new Error(`❌ Could not read contract name from Cargo.toml: ${e}`);
        }
    }
    else {
        contractName = "your-contract";
    }
    return {
        deployerAddress: (0, network_1.getAccountAddress)(deployOptions.network),
        privateKey: (0, network_1.getPrivateKey)(deployOptions.network),
        contractFolder: deployOptions.contract,
        contractName,
        deploymentDir: process.env["DEPLOYMENT_DIR"] || "deployments",
        chain,
    };
}
function ensureDeploymentDirectory(deploymentDir) {
    if (!fs.existsSync(deploymentDir)) {
        console.log(`📁 Creating deployment directory: ${deploymentDir}`);
        fs.mkdirSync(deploymentDir, { recursive: true });
    }
}
/**
 * Save the deployed contract address to <chain.id>_latest.json in the deployment directory.
 * If a latest file already exists, it gets renamed to include a timestamp.
 * Updates or creates the file, using contractName as the key.
 */
function saveDeployment(config, deploymentInfo) {
    try {
        const chainId = config.chain?.id || supportedChains_1.arbitrumNitro.id;
        const networkPath = path.resolve(config.deploymentDir, `${chainId}_latest.json`);
        // Check if the latest file exists and contains the same contract name
        let shouldCreateNewFile = false;
        if (fs.existsSync(networkPath)) {
            try {
                const existingDeployments = JSON.parse(fs.readFileSync(networkPath, "utf8"));
                if (existingDeployments[config.contractName]) {
                    // Contract with same name already exists, create new file
                    shouldCreateNewFile = true;
                }
            }
            catch (e) {
                console.warn(`⚠️  Could not parse existing ${chainId}_latest.json, will overwrite. Error: ${e}`);
            }
        }
        // If we need to create a new file (contract name already exists), backup the current latest file
        if (shouldCreateNewFile) {
            const currentTimestamp = new Date().getTime();
            const backupPath = networkPath.replace("_latest.json", `_${currentTimestamp}.json`);
            fs.renameSync(networkPath, backupPath);
            console.log(`📦 Backed up previous deployment to ${backupPath}`);
        }
        // Read existing deployments or start fresh
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let deployments = {};
        if (fs.existsSync(networkPath)) {
            const content = fs.readFileSync(networkPath, "utf8");
            try {
                deployments = JSON.parse(content);
            }
            catch (e) {
                console.warn(`⚠️  Could not parse existing ${chainId}_latest.json, will overwrite. Error: ${e}`);
            }
        }
        // Save with the new format
        deployments[config.contractName] = {
            address: deploymentInfo.address,
            txHash: deploymentInfo.txHash,
            contract: config.contractFolder,
        };
        fs.writeFileSync(networkPath, JSON.stringify(deployments, null, 2));
        console.log(`💾 Saved deployed contract to ${networkPath}`);
    }
    catch (e) {
        console.error(`❌ Failed to save deployed contract: ${e}`);
    }
}
function printDeployedAddresses(deploymentDir, chainId) {
    // If chainId is provided, only look for that specific chain's deployment file
    if (chainId) {
        const networkPath = path.resolve(deploymentDir, `${chainId}_latest.json`);
        if (!fs.existsSync(networkPath)) {
            console.log(`📦 No deployment file found for chain ${chainId} in ${deploymentDir}`);
            return;
        }
        try {
            const deployments = JSON.parse(fs.readFileSync(networkPath, "utf8"));
            console.log(`📦 Deployed contracts for chain ${chainId} (${networkPath}):`);
            // Format the output to show contract name, address, and contract folder clearly
            Object.entries(deployments).forEach(([contractName, contractData]) => {
                const data = contractData;
                console.log(`  ${contractName}:`);
                console.log(`    Address: ${data.address}`);
                console.log(`    Tx Hash: ${data.txHash}`);
                console.log(`    Contract: ${data.contract}`);
            });
        }
        catch (e) {
            console.warn(`⚠️  Could not parse deployment file ${networkPath}: ${e}`);
        }
        return;
    }
    // If no chainId provided, look for all chain-specific deployment files
    const files = fs.readdirSync(deploymentDir);
    const deploymentFiles = files.filter((file) => file.endsWith("_latest.json"));
    if (deploymentFiles.length === 0) {
        console.log(`📦 No deployment files found in ${deploymentDir}`);
        return;
    }
    deploymentFiles.forEach((file) => {
        const filePath = path.resolve(deploymentDir, file);
        const currentChainId = file.replace("_latest.json", "");
        try {
            const deployments = JSON.parse(fs.readFileSync(filePath, "utf8"));
            console.log(`📦 Deployed contracts for chain ${currentChainId} (${filePath}):`);
            // Format the output to show contract name, address, and contract folder clearly
            Object.entries(deployments).forEach(([contractName, contractData]) => {
                const data = contractData;
                console.log(`  ${contractName}:`);
                console.log(`    Address: ${data.address}`);
                console.log(`    Contract: ${data.contract}`);
            });
        }
        catch (e) {
            console.warn(`⚠️  Could not parse deployment file ${filePath}: ${e}`);
        }
    });
}
/**
 * Reads the deployed contract data from chain-specific deployment files in the deployment directory.
 * Returns an object with address and chainId for the given contractName, or undefined if not found.
 */
function getContractDataFromDeployments(deploymentDir, contractName, chainId) {
    // If chainId is provided, look for that specific chain's deployment file
    if (chainId) {
        const networkPath = path.resolve(deploymentDir, `${chainId}_latest.json`);
        if (fs.existsSync(networkPath)) {
            try {
                const deployments = JSON.parse(fs.readFileSync(networkPath, "utf8"));
                if (deployments[contractName]?.address) {
                    return {
                        address: deployments[contractName].address,
                        txHash: deployments[contractName].txHash,
                        chainId: chainId,
                    };
                }
            }
            catch (e) {
                console.warn(`⚠️  Could not parse deployment file at ${networkPath}: ${e}`);
            }
        }
        return undefined;
    }
    // If no chainId provided, search all deployment files
    const files = fs.readdirSync(deploymentDir);
    const deploymentFiles = files.filter((file) => file.endsWith("_latest.json"));
    for (const file of deploymentFiles) {
        const filePath = path.resolve(deploymentDir, file);
        const currentChainId = file.replace("_latest.json", "");
        try {
            const deployments = JSON.parse(fs.readFileSync(filePath, "utf8"));
            if (deployments[contractName]?.address) {
                return {
                    address: deployments[contractName].address,
                    txHash: deployments[contractName].txHash,
                    chainId: currentChainId,
                };
            }
        }
        catch (e) {
            console.warn(`⚠️  Could not parse deployment file at ${filePath}: ${e}`);
        }
    }
    return undefined;
}
//# sourceMappingURL=deployment.js.map