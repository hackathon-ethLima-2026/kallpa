#!/usr/bin/env ts-node
/**
 * Find all Cargo projects in the stylus directory
 */
declare function findCargoProjects(): Promise<string[]>;
/**
 * Run tests for all Cargo projects
 */
declare function runAllTests(): Promise<void>;
export { runAllTests, findCargoProjects };
//# sourceMappingURL=test.d.ts.map