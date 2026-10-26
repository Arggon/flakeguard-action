import { classifyArtifacts } from '../detector/classify.js';
import { MalformedArtifactError, parseJunitArtifact } from '../parser/index.js';
import { toJsonReport } from '../report/json.js';
import { toMarkdownReport } from '../report/markdown.js';
import { GitHubApiError, mergeByRun } from './github.js';
import { matchesPattern } from './inputs.js';
import { readZip } from './zip.js';
export class ActionError extends Error {
    code;
    detail;
    constructor(code, detail) {
        super(`${code}: ${detail}`);
        this.name = 'ActionError';
        this.code = code;
        this.detail = detail;
    }
}
async function selectRuns(reader, inputs) {
    const runs = await reader.listRunsForSha(inputs.commitSha, Math.max(inputs.lookbackRuns * 5, 20));
    const selected = [];
    for (const run of runs) {
        if (selected.length >= inputs.lookbackRuns)
            break;
        const artifacts = (await reader.listArtifacts(run.id)).filter((artifact) => !artifact.expired && matchesPattern(artifact.name, inputs.artifactPattern));
        if (artifacts.length > 0)
            selected.push({ run, artifacts });
    }
    return selected;
}
function summaryMarkdown(result, reportDir, runsCompared) {
    const flaky = result.findings.filter((finding) => finding.classification === 'flaky');
    const flakyLine = flaky.length === 0 ? 'No flaky tests in the observed runs.' : flaky.map((finding) => `\`${finding.testId}\``).join(', ');
    const newFindings = result.findings.filter((finding) => finding.classification === 'new');
    const newLine = newFindings.length === 0
        ? 'None.'
        : newFindings
            .map((finding) => {
            const observed = finding.observations.filter((observation) => observation.status !== 'skipped');
            return `\`${finding.testId}\` (${observed.map((observation) => observation.status).join('/')})`;
        })
            .join(', ');
    return [
        `## FlakeGuard — ${result.repository}@${result.commitSha}`,
        '',
        `Compared ${runsCompared} same-commit run(s) over ${result.findings.length} test(s).`,
        '',
        '| Flaky | Broken | Stable | New | Excluded (skipped) |',
        '|---|---|---|---|---|',
        `| ${result.summary.flaky} | ${result.summary.broken} | ${result.summary.stable} | ${result.summary.new} | ${result.summary.excludedSkipped} |`,
        '',
        `**Flaky:** ${flakyLine}`,
        '',
        `**New (single observation, status shown):** ${newLine}`,
        '',
        `Report: \`${reportDir}/flakeguard-report.json\` and \`${reportDir}/flakeguard-report.md\`.`,
        '',
    ].join('\n');
}
export async function runAction(deps) {
    const { inputs, reader } = deps;
    let selected;
    try {
        selected = await selectRuns(reader, inputs);
    }
    catch (error) {
        const detail = error instanceof GitHubApiError ? error.message : error instanceof Error ? error.message : String(error);
        throw new ActionError('API_ERROR', detail);
    }
    if (selected.length === 0) {
        throw new ActionError('NO_ARTIFACTS', `no artifacts matching "${inputs.artifactPattern}" for ${inputs.repository}@${inputs.commitSha}; refusing to report a successful run`);
    }
    const parsed = [];
    let artifactsRead = 0;
    for (const { run, artifacts } of selected) {
        const metadata = {
            repository: inputs.repository,
            commitSha: inputs.commitSha,
            runId: String(run.id),
            runAttempt: run.runAttempt,
        };
        for (const artifact of artifacts) {
            let entries;
            try {
                entries = readZip(await reader.downloadArtifactZip(artifact.id));
            }
            catch (error) {
                if (error instanceof GitHubApiError)
                    throw new ActionError('API_ERROR', error.message);
                throw new ActionError('MALFORMED_ARTIFACT', `${artifact.name}: ${error instanceof Error ? error.message : String(error)}`);
            }
            const xmlEntries = entries.filter((entry) => entry.name.toLowerCase().endsWith('.xml') && !entry.name.endsWith('/'));
            if (xmlEntries.length === 0) {
                throw new ActionError('NO_JUNIT_CONTENT', `artifact ${artifact.name} contains no .xml file`);
            }
            artifactsRead += 1;
            for (const entry of xmlEntries) {
                try {
                    parsed.push(parseJunitArtifact({
                        xml: entry.data.toString('utf8'),
                        metadata,
                        sourcePath: `${artifact.name}/${entry.name}`,
                    }));
                }
                catch (error) {
                    if (error instanceof MalformedArtifactError) {
                        throw new ActionError('MALFORMED_ARTIFACT', `${error.code}: ${error.detail}`);
                    }
                    throw error;
                }
            }
        }
    }
    const merged = mergeByRun(parsed);
    const result = classifyArtifacts(merged);
    const jsonPath = `${inputs.reportDir}/flakeguard-report.json`;
    const markdownPath = `${inputs.reportDir}/flakeguard-report.md`;
    try {
        await deps.writeFile(jsonPath, `${JSON.stringify(toJsonReport(result), null, 2)}\n`);
        await deps.writeFile(markdownPath, toMarkdownReport(result));
        await deps.appendSummary(summaryMarkdown(result, inputs.reportDir, selected.length));
    }
    catch (error) {
        throw new ActionError('WRITE_ERROR', error instanceof Error ? error.message : String(error));
    }
    deps.log(`flakeguard: ${result.summary.flaky} flaky, ${result.summary.broken} broken, ${result.summary.stable} stable from ${selected.length} run(s); report in ${inputs.reportDir}`);
    return {
        result,
        reportDir: inputs.reportDir,
        runsCompared: selected.length,
        artifactsRead,
    };
}
