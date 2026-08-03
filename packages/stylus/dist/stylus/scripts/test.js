#!/usr/bin/env ts-node
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
exports.runAllTests = runAllTests;
exports.findCargoProjects = findCargoProjects;
/**
 * Stylus Cargo Test Runner
 *
 * This script automatically finds and runs tests for all Cargo projects
 * in the stylus directory that have a Cargo.toml file.
 *
 * Features:
 * - Automatically discovers Cargo projects by looking for Cargo.toml files
 * - Excludes scripts, deployments, and node_modules directories
 * - Runs `cargo test` for each project
 * - Shows real-time output during test execution
 * - Provides a comprehensive summary of test results
 * - Exits with appropriate error codes for CI/CD integration
 *
 * Usage:
 *   npm run test
 *   or
 *   ts-node scripts/test.ts
 */
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path = __importStar(require("path"));
/**
 * Execute a command and return a promise with the result
 */
function executeCommand(command, cwd) {
    return new Promise((resolve) => {
        console.log(`\n🔄 Running tests in ${path.basename(cwd)}...`);
        console.log(`Executing: ${command}`);
        const childProcess = (0, child_process_1.spawn)(command, [], {
            cwd,
            shell: true,
            stdio: ["inherit", "pipe", "pipe"],
        });
        let output = "";
        let errorOutput = "";
        // Handle stdout
        if (childProcess.stdout) {
            childProcess.stdout.on("data", (data) => {
                const chunk = data.toString();
                output += chunk;
                process.stdout.write(chunk); // Show real-time output
            });
        }
        // Handle stderr
        if (childProcess.stderr) {
            childProcess.stderr.on("data", (data) => {
                const chunk = data.toString();
                errorOutput += chunk;
                process.stderr.write(chunk); // Show real-time errors
            });
        }
        // Handle process completion
        childProcess.on("close", (code) => {
            const success = code === 0;
            if (success) {
                console.log(`✅ Tests completed successfully in ${path.basename(cwd)}!`);
            }
            else {
                console.log(`❌ Tests failed in ${path.basename(cwd)} with exit code ${code}`);
            }
            resolve({
                success,
                output,
                ...(errorOutput && { error: errorOutput }),
            });
        });
        // Handle process errors
        childProcess.on("error", (error) => {
            console.error(`❌ Error running tests in ${path.basename(cwd)}:`, error.message);
            resolve({
                success: false,
                output: "",
                error: error.message,
            });
        });
    });
}
/**
 * Check if a directory contains a Cargo.toml file
 */
async function hasCargoToml(dirPath) {
    try {
        await fs_1.promises.access(path.join(dirPath, "Cargo.toml"));
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Find all Cargo projects in the stylus directory
 */
async function findCargoProjects() {
    const contractsDir = path.resolve(__dirname, "..", "contracts");
    const cargoProjects = [];
    try {
        const entries = await fs_1.promises.readdir(contractsDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const dirName = entry.name;
                // Skip excluded directories
                if (dirName === "target") {
                    continue;
                }
                const dirPath = path.join(contractsDir, dirName);
                if (await hasCargoToml(dirPath)) {
                    cargoProjects.push(dirPath);
                }
            }
        }
    }
    catch (error) {
        console.error("Error scanning for Cargo projects:", error);
    }
    return cargoProjects;
}
/**
 * Run tests for all Cargo projects
 */
async function runAllTests() {
    console.log("🚀 Starting Stylus Cargo Tests...\n");
    const cargoProjects = await findCargoProjects();
    if (cargoProjects.length === 0) {
        console.log("❗ No Cargo projects found with Cargo.toml files.");
        process.exit(1);
    }
    console.log(`Found ${cargoProjects.length} Stylus Contract(s):`);
    cargoProjects.forEach((project) => {
        console.log(`  - ${path.basename(project)}`);
    });
    console.log("");
    const results = [];
    // Run tests for each project
    for (const projectPath of cargoProjects) {
        const projectName = path.basename(projectPath);
        // `--lib` limita la compilacion al binario de tests y evita construir el cdylib.
        // En Windows eso es obligatorio: una DLL no admite simbolos sin resolver, y el
        // contrato referencia los hooks de la VM de Stylus, que solo existen en la cadena.
        // En Linux y macOS el efecto es el mismo, porque no usamos tests de integracion.
        const result = await executeCommand("cargo test --lib", projectPath);
        results.push({
            project: projectName,
            success: result.success,
            output: result.output,
            ...(result.error && { error: result.error }),
        });
    }
    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 TEST SUMMARY");
    console.log("=".repeat(60));
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);
    console.log(`✅ Successful: ${successful.length}`);
    console.log(`❌ Failed: ${failed.length}`);
    console.log(`📦 Total projects: ${results.length}`);
    if (successful.length > 0) {
        console.log("\n✅ Successful projects:");
        successful.forEach((result) => {
            console.log(`  - ${result.project}`);
        });
    }
    if (failed.length > 0) {
        console.log("\n❌ Failed projects:");
        failed.forEach((result) => {
            console.log(`  - ${result.project}`);
            if (result.error) {
                console.log(`    Error: ${result.error.split("\n")[0]}`);
            }
        });
    }
    // Exit with error code if any tests failed
    if (failed.length > 0) {
        console.log("\n💥 Some tests failed!");
        process.exit(1);
    }
    else {
        console.log("\n🎉 All tests passed!");
        process.exit(0);
    }
}
// Main execution
if (require.main === module) {
    runAllTests().catch((error) => {
        console.error("❌ Unexpected error:", error);
        process.exit(1);
    });
}
//# sourceMappingURL=test.js.map