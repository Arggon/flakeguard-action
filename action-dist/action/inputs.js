export class ActionInputError extends Error {
    constructor(detail) {
        super(detail);
        this.name = 'ActionInputError';
    }
}
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const COMMIT_SHA = /^[0-9a-f]{7,64}$/i;
export function matchesPattern(name, pattern) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(name);
}
function required(env, name) {
    const value = env[name];
    if (value === undefined || value.trim() === '')
        throw new ActionInputError(`${name} is required`);
    return value.trim();
}
export function readInputs(env) {
    const repository = required(env, 'GITHUB_REPOSITORY');
    if (!REPOSITORY.test(repository))
        throw new ActionInputError('GITHUB_REPOSITORY must look like "owner/name"');
    const commitSha = required(env, 'GITHUB_SHA');
    if (!COMMIT_SHA.test(commitSha))
        throw new ActionInputError('GITHUB_SHA must be a hexadecimal commit SHA');
    const token = required(env, 'INPUT_TOKEN');
    const artifactPattern = (env['INPUT_ARTIFACT_PATTERN'] ?? 'junit*').trim();
    if (artifactPattern === '')
        throw new ActionInputError('artifact-pattern must not be empty');
    const rawLookback = (env['INPUT_LOOKBACK_RUNS'] ?? '2').trim();
    const lookbackRuns = Number.parseInt(rawLookback, 10);
    if (!Number.isInteger(lookbackRuns) || lookbackRuns < 1 || lookbackRuns > 10) {
        throw new ActionInputError('lookback-runs must be an integer between 1 and 10');
    }
    const reportDir = (env['INPUT_REPORT_DIR'] ?? 'flakeguard-report').trim();
    if (reportDir === '' || reportDir.startsWith('/') || reportDir.includes('..')) {
        throw new ActionInputError('report-dir must be a relative path without ".."');
    }
    return {
        artifactPattern,
        lookbackRuns,
        reportDir,
        token,
        repository,
        commitSha: commitSha.toLowerCase(),
    };
}
