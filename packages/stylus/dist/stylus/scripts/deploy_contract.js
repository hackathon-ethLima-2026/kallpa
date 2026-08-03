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
exports.default = deployStylusContract;
const utils_1 = require("./utils/");
const export_abi_1 = require("./export_abi");
const command_1 = require("./utils/command");
const viem_1 = require("viem");
const accounts_1 = require("viem/accounts");
const path = __importStar(require("path"));
const supportedChains_1 = require("../../nextjs/utils/scaffold-stylus/supportedChains");
/**
 * Deploy a single contract using cargo stylus
 * @param deployOptions - The deploy options
 * @param additionalOptions - The additional options
 * @returns void
 */
async function deployStylusContract(deployOptions) {
    console.log(`\n🚀 Deploying contract in: ${deployOptions.contract}`);
    const config = (0, utils_1.getDeploymentConfig)(deployOptions);
    (0, utils_1.ensureDeploymentDirectory)(config.deploymentDir);
    console.log(`📄 Contract name: ${config.contractName}`);
    try {
        // Step 1: Deploy the contract using cargo stylus with contract address
        // --contract-address='${config.contractAddress}' deactivated for now as it's not working. Issue https://github.com/OffchainLabs/cargo-stylus/issues/171
        const deployCommand = await (0, command_1.buildDeployCommand)(config, deployOptions);
        const deployOutput = await (0, utils_1.executeCommand)(deployCommand, path.join("contracts", deployOptions.contract), "Deploying contract with cargo stylus");
        if (deployOptions.estimateGas) {
            console.log(deployOutput);
            return;
        }
        // Extract the actual deployed address from the output
        const deploymentInfo = (0, utils_1.extractDeploymentInfo)(deployOutput);
        if (deploymentInfo) {
            const blockExplorerUrl = (0, utils_1.getBlockExplorerUrlFromChain)(config.chain);
            if (blockExplorerUrl) {
                console.log(`📋 Contract deployed: ${blockExplorerUrl}/address/${deploymentInfo.address}`);
                console.log(`Transaction hash: ${blockExplorerUrl}/tx/${deploymentInfo.txHash}`);
            }
            else {
                console.log(`📋 Contract deployed at address: ${deploymentInfo.address}`);
                console.log("Transaction hash: ", deploymentInfo.txHash);
            }
        }
        else {
            throw new Error("Failed to extract deployed address");
        }
        // Save the deployed address to chain-specific deployment file
        (0, utils_1.saveDeployment)(config, deploymentInfo);
        // Step 2: Export ABI using the shared function
        await (0, export_abi_1.exportStylusAbi)(config.contractFolder, config.contractName, false, config.chain.id.toString());
        // Get contract data from deployed contracts after ABI export
        const contractData = (0, utils_1.getContractData)(config.chain.id.toString(), config.contractName);
        // Call the initialize function if orbit deployment
        if (!!deployOptions.isOrbit &&
            config.chain.id !== supportedChains_1.arbitrumNitro.id &&
            (0, utils_1.contractHasInitializeFunction)(contractData)) {
            const publicClient = (0, viem_1.createPublicClient)({
                chain: config.chain,
                transport: (0, viem_1.http)(),
            });
            // need wallet client to sign the transaction
            const walletClient = (0, viem_1.createWalletClient)({
                chain: config.chain,
                transport: (0, viem_1.http)(),
            });
            const account = (0, accounts_1.privateKeyToAccount)(config.privateKey);
            const { request } = await publicClient.simulateContract({
                account,
                address: deploymentInfo.address,
                abi: contractData.abi,
                functionName: "initialize",
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                args: deployOptions.constructorArgs,
            });
            const initTxHash = await walletClient.writeContract(request);
            console.log("Initialize transaction hash: ", initTxHash);
        }
        else {
            console.log("\nContract does not have an initialize function");
            console.log("Skipping initialization");
        }
        // Step 3: Verify the contract
        if (deployOptions.verify) {
            try {
                const output = await (0, utils_1.executeCommand)(`cargo stylus verify --endpoint=${(0, utils_1.getRpcUrlFromChain)(config.chain)} --deployment-tx=${deploymentInfo.txHash}`, path.join("contracts", deployOptions.contract), "Verifying contract with cargo stylus");
                console.log(output);
            }
            catch (error) {
                console.error(`❌ Verification failed in: ${deployOptions.contract}`);
                if (error instanceof Error) {
                    console.error(error.message);
                }
                else {
                    console.error(error);
                }
            }
        }
    }
    catch (error) {
        console.error(`❌ Deployment failed in: ${deployOptions.contract}`);
        if (error instanceof Error) {
            console.error(error.message);
        }
        else {
            console.error(error);
        }
        process.exit(1);
    }
}
//# sourceMappingURL=deploy_contract.js.map