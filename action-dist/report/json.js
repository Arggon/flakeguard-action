export const REPORT_LIMITATIONS = [
    'Runs are pooled across every workflow that ran on the commit SHA; workflow, job, and matrix-leg identity are not compared.',
    'A test is matched by suite::name; a renamed test appears as new and is not linked to its previous identity.',
    'Only test metadata is stored: no logs, source, secrets, or personal data.',
];
export function toJsonReport(result) {
    return {
        report_version: 2,
        repository: result.repository,
        commit_sha: result.commitSha,
        runs: result.runs,
        limitations: REPORT_LIMITATIONS,
        summary: {
            tests: result.summary.tests,
            flaky: result.summary.flaky,
            broken: result.summary.broken,
            stable: result.summary.stable,
            new: result.summary.new,
            excluded_skipped: result.summary.excludedSkipped,
        },
        findings: result.findings.map((finding) => ({
            test_id: finding.testId,
            suite: finding.suite,
            test_name: finding.testName,
            classification: finding.classification,
            evidence: {
                observations: finding.evidence.runsObserved,
                passes: finding.evidence.passes,
                retried_passes: finding.evidence.retriedPasses,
                failures: finding.evidence.failures,
                failure_categories: finding.evidence.failureCategories,
            },
            observations: finding.observations.map((observation) => ({
                run: observation.runId,
                status: observation.status,
                duration_ms: observation.durationMs,
                retry_count: observation.retryCount,
                failure_category: observation.failureCategory,
            })),
        })),
        excluded_skipped: result.excludedSkipped,
    };
}
