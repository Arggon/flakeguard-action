#!/usr/bin/env node
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import process from 'node:process';
import { ActionError, runAction } from './action.js';
import { GitHubApi } from './github.js';
import { ActionInputError, readInputs } from './inputs.js';
async function main() {
    try {
        const inputs = readInputs(process.env);
        const reader = new GitHubApi({
            token: inputs.token,
            repository: inputs.repository,
            apiUrl: process.env['GITHUB_API_URL'] ?? 'https://api.github.com',
        });
        await runAction({
            inputs,
            reader,
            writeFile: async (path, content) => {
                await mkdir(dirname(path), { recursive: true });
                await writeFile(path, content, 'utf8');
            },
            appendSummary: async (markdown) => {
                const summaryPath = process.env['GITHUB_STEP_SUMMARY'];
                if (summaryPath !== undefined && summaryPath !== '')
                    await appendFile(summaryPath, markdown, 'utf8');
            },
            log: (message) => process.stdout.write(`${message}\n`),
        });
        return 0;
    }
    catch (error) {
        const message = error instanceof ActionError
            ? `${error.code}: ${error.detail}`
            : error instanceof ActionInputError
                ? `INVALID_INPUT: ${error.message}`
                : error instanceof Error
                    ? error.message
                    : String(error);
        process.stdout.write(`::error::flakeguard: ${message.replace(/\r?\n/g, ' ')}\n`);
        return 1;
    }
}
process.exitCode = await main();
