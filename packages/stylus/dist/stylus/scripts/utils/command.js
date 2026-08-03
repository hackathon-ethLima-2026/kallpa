"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDeployCommand = buildDeployCommand;
exports.estimateGasPrice = estimateGasPrice;
exports.executeCommand = executeCommand;
const child_process_1 = require("child_process");
const contract_1 = require("./contract");
const network_1 = require("./network");
const viem_1 = require("viem");
const DEFAULT_GAS_FEE_MULTIPLIER = 3;
const MIN_FEE_GWEI = 0.1;
function getGasFeeMultiplier() {
    const envVal = process.env["DEPLOY_GAS_FEE_MULTIPLIER"];
    if (envVal) {
        const parsed = parseFloat(envVal);
        if (!isNaN(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return DEFAULT_GAS_FEE_MULTIPLIER;
}
async function getBufferedMaxFeeGwei(rpcUrl) {
    try {
        const publicClient = (0, viem_1.createPublicClient)({
            transport: (0, viem_1.http)(rpcUrl),
        });
        const block = await publicClient.getBlock({ blockTag: "latest" });
        if (block.baseFeePerGas === null) {
            return MIN_FEE_GWEI;
        }
        const baseFeeGwei = Number((0, viem_1.formatUnits)(block.baseFeePerGas, 9));
        const buffered = baseFeeGwei * getGasFeeMultiplier();
        return Math.max(buffered, MIN_FEE_GWEI);
    }
    catch {
        return MIN_FEE_GWEI;
    }
}
async function buildDeployCommand(config, deployOptions) {
    let baseCommand = `cargo stylus deploy --endpoint='${(0, network_1.getRpcUrlFromChain)(config.chain)}' --private-key='${config.privateKey}'`;
    if (deployOptions.estimateGas) {
        return `${baseCommand} --estimate-gas`;
    }
    if (deployOptions.maxFee) {
        baseCommand += ` --max-fee-per-gas-gwei=${deployOptions.maxFee}`;
    }
    else {
        // maxFeePerGas is a CEILING (actual charge = base fee), so over-provisioning is safe and free.
        // Cargo stylus without this flag uses a tight estimate that the base fee can creep past.
        const rpcUrl = (0, network_1.getRpcUrlFromChain)(config.chain);
        const maxFeeGwei = await getBufferedMaxFeeGwei(rpcUrl);
        baseCommand += ` --max-fee-per-gas-gwei=${maxFeeGwei}`;
    }
    if (!deployOptions.verify) {
        baseCommand += ` --no-verify`;
    }
    else {
        if (deployOptions.constructorArgs &&
            deployOptions.constructorArgs.length > 0 &&
            (0, contract_1.isContractHasConstructor)(config.contractFolder)) {
            throw new Error("Verification is not currently supported with constructors. Please implement and use initialize() function to initialize your contracts: Refer to readme.md for tutorial");
        }
    }
    if (deployOptions.constructorArgs &&
        deployOptions.constructorArgs.length > 0 &&
        !deployOptions.isOrbit) {
        baseCommand += ` --constructor-args ${deployOptions.constructorArgs.map((arg) => `"${arg}"`).join(" ")} `;
    }
    return baseCommand;
}
async function estimateGasPrice(config, deployOptions) {
    let deployCommand = `cargo stylus deploy --endpoint='${(0, network_1.getRpcUrlFromChain)(config.chain)}' --private-key='${config.privateKey}' --no-verify --estimate-gas `;
    if (deployOptions.constructorArgs) {
        deployCommand += ` --constructor-args='${deployOptions.constructorArgs.join(" ")}'`;
    }
    const deployOutput = await executeCommand(deployCommand, config.contractName, "Estimating gas price with cargo stylus");
    const gasPrice = (0, contract_1.extractGasPriceFromOutput)(deployOutput);
    if (gasPrice) {
        return gasPrice;
    }
    return "0";
}
function executeCommand(command, cwd, description) {
    console.log(`\n🔄 ${description}...`);
    // Sanitize command to hide private key (create a copy to avoid modifying original)
    const sanitizedCommand = command.slice();
    console.log(`Executing: ${sanitizedCommand.replace(/--private-key=[^\s]+/g, "--private-key=***")}`);
    return new Promise((resolve, reject) => {
        const childProcess = (0, child_process_1.spawn)(command, [], {
            cwd,
            shell: true,
            stdio: ["inherit", "pipe", "pipe"],
        });
        let output = "";
        let errorOutput = "";
        let errorLines = [];
        // Handle stdout
        if (childProcess.stdout) {
            childProcess.stdout.on("data", (data) => {
                const chunk = data.toString();
                output += chunk;
            });
        }
        // Handle stderr
        if (childProcess.stderr) {
            childProcess.stderr.on("data", (data) => {
                const chunk = data.toString();
                errorOutput += chunk;
                const newLines = chunk.split("\n");
                errorLines.push(...newLines);
                // Keep only the last 20 lines, just for safety
                if (errorLines.length > 20) {
                    errorLines = errorLines.slice(-20);
                }
            });
        }
        // Handle process completion
        childProcess.on("close", (code) => {
            // this can extract and detect errors from docker logs because it not throw error code
            const errors = extractErrorLines(errorLines);
            if (code === 0 && !errors) {
                console.log(`\n✅ ${description} completed successfully!`);
                resolve(output);
            }
            else {
                console.error(`\n❌ ${description} failed with exit code ${code}`);
                // Print error output starting from "project metadata hash computed on deployment" or error patterns, or all logs if not found
                if (errors) {
                    console.error(errors);
                    if (!command.includes("--no-verify") &&
                        errors.includes("mismatch number of constructor arguments")) {
                        errorOutput += `\nCan not verify contract with constructor arguments.\n`;
                    }
                }
                reject(new Error(`Command failed with exit code ${code}. Error output: \n${errorOutput}`));
            }
        });
        // Handle process errors
        childProcess.on("error", (error) => {
            console.error(`\n❌ ${description} failed:`, error);
            reject(error);
        });
    });
}
function extractErrorLines(errorLines) {
    let output = "";
    if (errorLines.length > 0) {
        const metadataIndex = errorLines.findIndex((line) => line.includes("project metadata hash computed on deployment"));
        const errorIndex = errorLines.findIndex((line) => line.toLowerCase().includes("error[") ||
            line.toLowerCase().includes("error:"));
        let startIndex = -1;
        if (metadataIndex >= 0) {
            startIndex = metadataIndex;
        }
        else if (errorIndex >= 0) {
            startIndex = errorIndex;
        }
        if (startIndex === -1) {
            return null;
        }
        const linesToPrint = errorLines.slice(startIndex);
        linesToPrint.forEach((line) => {
            if (line.trim())
                output += line + "\n";
        });
        return output;
    }
    return null;
}
//# sourceMappingURL=command.js.map