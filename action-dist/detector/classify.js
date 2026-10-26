import { DetectionError } from './errors.js';
const CLASSIFICATION_ORDER = {
    flaky: 0,
    broken: 1,
    stable: 2,
    new: 3,
};
function isNonPass(observation) {
    return observation.status === 'failed' || observation.status === 'error';
}
function classifyEvidence(evidence) {
    if (evidence.retriedPasses > 0)
        return 'flaky';
    if (evidence.runsObserved < 2)
        return 'new';
    if (evidence.passes > 0 && evidence.failures > 0)
        return 'flaky';
    if (evidence.failures > 0 && evidence.passes === 0)
        return 'broken';
    return 'stable';
}
function buildFinding(testId, group) {
    const evidenceObservations = group.observations.filter((observation) => observation.status !== 'skipped');
    const passes = evidenceObservations.filter((observation) => observation.status === 'passed' && observation.retryCount === 0).length;
    const retriedPasses = evidenceObservations.filter((observation) => observation.status === 'passed' && observation.retryCount > 0).length;
    const failures = evidenceObservations.filter(isNonPass).length;
    const failureCategories = [
        ...new Set(evidenceObservations
            .filter(isNonPass)
            .map((observation) => observation.failureCategory)
            .filter((category) => category !== null)),
    ].sort();
    const evidence = {
        runsObserved: evidenceObservations.length,
        passes,
        retriedPasses,
        failures,
        failureCategories,
    };
    return {
        testId,
        suite: group.suite,
        testName: group.testName,
        classification: classifyEvidence(evidence),
        evidence,
        observations: [...group.observations].sort((a, b) => a.runId.localeCompare(b.runId)),
    };
}
function compareFindings(a, b) {
    const byClass = CLASSIFICATION_ORDER[a.classification] - CLASSIFICATION_ORDER[b.classification];
    if (byClass !== 0)
        return byClass;
    const byFailures = b.evidence.failures - a.evidence.failures;
    if (byFailures !== 0)
        return byFailures;
    return a.testId.localeCompare(b.testId);
}
function summarize(findings, excludedSkipped) {
    const counts = { flaky: 0, broken: 0, stable: 0, new: 0 };
    for (const finding of findings)
        counts[finding.classification] += 1;
    return {
        tests: findings.length,
        flaky: counts.flaky,
        broken: counts.broken,
        stable: counts.stable,
        new: counts.new,
        excludedSkipped,
    };
}
export function classifyArtifacts(artifacts) {
    if (artifacts.length === 0) {
        throw new DetectionError('NO_ARTIFACTS', 'at least one parsed artifact is required');
    }
    const repositories = [...new Set(artifacts.map((artifact) => artifact.metadata.repository))];
    if (repositories.length > 1) {
        throw new DetectionError('MIXED_REPOSITORIES', `artifacts span ${repositories.length} repositories (${repositories.join(', ')}); refusing to compare them`);
    }
    const commits = [...new Set(artifacts.map((artifact) => artifact.metadata.commitSha))];
    if (commits.length > 1) {
        throw new DetectionError('MIXED_COMMITS', `artifacts span ${commits.length} commit SHAs (${commits.join(', ')}); refusing to compare across commits`);
    }
    const repository = repositories[0];
    const commitSha = commits[0];
    const runs = artifacts.map((artifact, index) => artifact.metadata.runId ?? `artifact-${index + 1}`);
    const grouped = new Map();
    for (let index = 0; index < artifacts.length; index += 1) {
        const artifact = artifacts[index];
        const runId = runs[index];
        for (const outcome of artifact.outcomes) {
            let group = grouped.get(outcome.testId);
            if (group === undefined) {
                group = { suite: outcome.suite, testName: outcome.testName, observations: [] };
                grouped.set(outcome.testId, group);
            }
            group.observations.push({
                runId,
                status: outcome.status,
                durationMs: outcome.durationMs,
                retryCount: outcome.retryCount,
                failureCategory: outcome.failureCategory,
            });
        }
    }
    const findings = [];
    const excludedSkipped = [];
    for (const [testId, group] of grouped) {
        const hasEvidence = group.observations.some((observation) => observation.status !== 'skipped');
        if (!hasEvidence) {
            excludedSkipped.push(testId);
            continue;
        }
        findings.push(buildFinding(testId, group));
    }
    findings.sort(compareFindings);
    excludedSkipped.sort();
    return {
        repository,
        commitSha,
        runs,
        findings,
        excludedSkipped,
        summary: summarize(findings, excludedSkipped.length),
    };
}
