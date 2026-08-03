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
exports.exportStylusAbi = exportStylusAbi;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const utils_1 = require("./utils/");
async function exportStylusAbi(contractFolder, contractName, isScript = true, chainId) {
    console.log("📄 Starting Stylus ABI export...");
    // Resolve the actual filesystem path (contracts live under contracts/)
    const fsPath = path.join("contracts", contractFolder);
    const config = (0, utils_1.getExportConfig)(fsPath, contractName, chainId);
    if (!config.contractAddress) {
        console.error(`❌ Contract address not found. Please deploy the contract first or ensure it is saved in a chain-specific deployment file in ${config.deploymentDir}`);
        process.exit(1);
    }
    if (isScript) {
        console.log(`📄 Contract name: ${config.contractName}`);
        console.log(`📁 Deployment directory: ${config.deploymentDir}`);
        console.log(`📍 Contract address: ${config.contractAddress}`);
        console.log(`🔗 Chain ID: ${config.chainId}`);
    }
    try {
        (0, utils_1.ensureDeploymentDirectory)(config.deploymentDir);
        // Export ABI
        // cwd is now contracts/<contract>/, so ../../ reaches packages/stylus/
        const exportCommand = `cargo stylus export-abi --output='../../${config.deploymentDir}/${config.contractFolder}' --json`;
        await (0, utils_1.executeCommand)(exportCommand, fsPath, "Exporting ABI");
        console.log(`📄 ABI file location: ${config.deploymentDir}/${config.contractFolder}`);
        const abiFilePath = path.resolve(config.deploymentDir, `${config.contractFolder}`);
        if (fs.existsSync(abiFilePath)) {
            console.log(`✅ ABI file verified at: ${abiFilePath}`);
        }
        else {
            console.warn(`⚠️  ABI file not found at expected location: ${abiFilePath}`);
        }
        // do not Generate TypeScript ABI when called from yarn script
        if (!isScript) {
            await (0, utils_1.generateTsAbi)(abiFilePath, config.contractName, config.contractAddress, config.txHash, config.chainId);
        }
    }
    catch (error) {
        (0, utils_1.handleSolcError)(error);
        process.exit(1);
    }
}
if (require.main === module) {
    // Get contract folder from command line args, default to 'your-contract'
    const rawContract = process.argv[2] || "your-contract";
    const contractFolder = path.join("contracts", rawContract);
    if (!fs.existsSync(contractFolder)) {
        console.error(`❌ Contract folder does not exist: ${contractFolder}`);
        process.exit(1);
    }
    exportStylusAbi(rawContract, rawContract).catch((error) => {
        console.error("Fatal error:", error);
        process.exit(1);
    });
}
//# sourceMappingURL=export_abi.js.map