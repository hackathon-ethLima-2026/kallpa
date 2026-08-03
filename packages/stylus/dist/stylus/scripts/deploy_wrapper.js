"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const helpers_1 = require("yargs/helpers");
const yargs_1 = __importDefault(require("yargs"));
const deploy_1 = __importDefault(require("./deploy"));
/**
 * Entry point for the deploy script
 * This script is used to deploy a single contract or all contracts in the stylus folder
 */
if (require.main === module) {
    // Use yargs for argument parsing
    const argv = (0, yargs_1.default)((0, helpers_1.hideBin)(process.argv))
        .usage("Usage: yarn deploy --name <contractName> --network <network>")
        .option("network", {
        alias: "net",
        describe: "Network to deploy to",
        type: "string",
        demandOption: false,
    })
        .option("estimate-gas", {
        alias: "eg",
        describe: "Estimate gas for the deployment",
        type: "boolean",
        demandOption: false,
    })
        .option("max-fee", {
        alias: "mf",
        describe: "Max fee per gas gwei",
        type: "string",
        demandOption: false,
    })
        .help()
        .parseSync();
    (0, deploy_1.default)(argv).catch((error) => {
        console.error("Fatal error:", error);
        process.exit(1);
    });
}
//# sourceMappingURL=deploy_wrapper.js.map