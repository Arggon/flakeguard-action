import { MalformedArtifactError } from './errors.js';
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const COMMIT_SHA = /^[0-9a-f]{7,64}$/i;
export function parseMetadata(raw, sourcePath) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new MalformedArtifactError('METADATA_INVALID', 'metadata must be a JSON object', sourcePath);
    }
    const record = raw;
    const repository = record['repository'];
    if (typeof repository !== 'string' || !REPOSITORY.test(repository)) {
        throw new MalformedArtifactError('METADATA_INVALID', 'metadata.repository must look like "owner/name"', sourcePath);
    }
    const commitSha = record['commitSha'];
    if (typeof commitSha !== 'string' || !COMMIT_SHA.test(commitSha)) {
        throw new MalformedArtifactError('METADATA_INVALID', 'metadata.commitSha must be a 7-64 character hexadecimal commit SHA', sourcePath);
    }
    const runId = record['runId'];
    if (runId !== undefined && (typeof runId !== 'string' || runId.length === 0)) {
        throw new MalformedArtifactError('METADATA_INVALID', 'metadata.runId must be a non-empty string', sourcePath);
    }
    const runAttempt = record['runAttempt'];
    if (runAttempt !== undefined &&
        (typeof runAttempt !== 'number' || !Number.isInteger(runAttempt) || runAttempt < 1)) {
        throw new MalformedArtifactError('METADATA_INVALID', 'metadata.runAttempt must be a positive integer', sourcePath);
    }
    return {
        repository,
        commitSha: commitSha.toLowerCase(),
        ...(runId !== undefined ? { runId } : {}),
        ...(runAttempt !== undefined ? { runAttempt } : {}),
    };
}
export function parseMetadataJson(text, sourcePath) {
    let raw;
    try {
        raw = JSON.parse(text);
    }
    catch {
        throw new MalformedArtifactError('METADATA_INVALID', 'metadata is not valid JSON', sourcePath);
    }
    return parseMetadata(raw, sourcePath);
}
