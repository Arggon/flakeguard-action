#!/usr/bin/env node
import process from 'node:process';
import { MalformedArtifactError, parseArtifactFile } from './index.js';
function parseArguments(argv) {
    let artifact;
    let metadata;
    let help = false;
    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (value === '--help' || value === '-h') {
            help = true;
            continue;
        }
        if (value === '--artifact') {
            artifact = argv[index + 1];
            index += 1;
            continue;
        }
        if (value === '--metadata') {
            metadata = argv[index + 1];
            index += 1;
        }
    }
    return { artifact, metadata, help };
}
const USAGE = 'usage: flakeguard-parser --artifact <junit.xml> --metadata <metadata.json>\n';
async function main(argv) {
    const args = parseArguments(argv);
    if (args.help) {
        process.stdout.write(USAGE);
        return 0;
    }
    if (args.artifact === undefined || args.metadata === undefined) {
        process.stderr.write(USAGE);
        return 2;
    }
    try {
        const parsed = await parseArtifactFile(args.artifact, args.metadata);
        process.stdout.write(`${JSON.stringify(parsed, null, 2)}\n`);
        return 0;
    }
    catch (error) {
        if (error instanceof MalformedArtifactError) {
            const at = error.sourcePath !== undefined ? ` (${error.sourcePath})` : '';
            process.stderr.write(`flakeguard-parser: ${error.code}: ${error.detail}${at}\n`);
            return 1;
        }
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`flakeguard-parser: INTERNAL_ERROR: ${message}\n`);
        return 2;
    }
}
process.exitCode = await main(process.argv.slice(2));
