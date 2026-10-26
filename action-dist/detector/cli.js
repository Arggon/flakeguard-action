#!/usr/bin/env node
import process from 'node:process';
import { MalformedArtifactError, parseArtifactFile } from '../parser/index.js';
import { toJsonReport } from '../report/json.js';
import { toMarkdownReport } from '../report/markdown.js';
import { classifyArtifacts } from './classify.js';
import { mergeByRun } from './merge.js';
import { DetectionError } from './errors.js';
const USAGE = 'usage: flakeguard-detector --artifact <junit.xml> --metadata <metadata.json> [--artifact ... --metadata ...] [--format json|markdown]\n';
function parseArguments(argv) {
    const artifacts = [];
    let format = 'json';
    let help = false;
    let pendingXml;
    let error;
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--help' || argument === '-h') {
            help = true;
            continue;
        }
        if (argument === '--format') {
            const value = argv[index + 1];
            if (value !== 'json' && value !== 'markdown') {
                error = '--format must be "json" or "markdown"';
                break;
            }
            format = value;
            index += 1;
            continue;
        }
        if (argument === '--artifact') {
            const value = argv[index + 1];
            if (value === undefined) {
                error = '--artifact requires a path';
                break;
            }
            pendingXml = value;
            index += 1;
            continue;
        }
        if (argument === '--metadata') {
            const value = argv[index + 1];
            if (value === undefined) {
                error = '--metadata requires a path';
                break;
            }
            if (pendingXml === undefined) {
                error = '--metadata must follow its --artifact';
                break;
            }
            artifacts.push({ xml: pendingXml, metadata: value });
            pendingXml = undefined;
            index += 1;
            continue;
        }
        error = `unknown argument: ${argument ?? ''}`;
        break;
    }
    if (pendingXml !== undefined && error === undefined) {
        error = '--artifact must be followed by its --metadata';
    }
    return { artifacts, format, help, error };
}
async function main(argv) {
    const args = parseArguments(argv);
    if (args.help) {
        process.stdout.write(USAGE);
        return 0;
    }
    if (args.error !== undefined) {
        process.stderr.write(`${args.error}\n${USAGE}`);
        return 2;
    }
    if (args.artifacts.length === 0) {
        process.stderr.write(USAGE);
        return 2;
    }
    try {
        const artifacts = [];
        for (const pair of args.artifacts) {
            artifacts.push(await parseArtifactFile(pair.xml, pair.metadata));
        }
        const result = classifyArtifacts(mergeByRun(artifacts));
        if (args.format === 'markdown') {
            process.stdout.write(toMarkdownReport(result));
        }
        else {
            process.stdout.write(`${JSON.stringify(toJsonReport(result), null, 2)}\n`);
        }
        return 0;
    }
    catch (error) {
        if (error instanceof MalformedArtifactError || error instanceof DetectionError) {
            process.stderr.write(`flakeguard-detector: ${error.code}: ${error.detail}\n`);
            return 1;
        }
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`flakeguard-detector: INTERNAL_ERROR: ${message}\n`);
        return 2;
    }
}
process.exitCode = await main(process.argv.slice(2));
