export function toJsonReport(result) {
    return {
        report_version: 1,
        repository: result.repository,
        commit_sha: result.commitSha,
        runs: result.runs,
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
                runs_observed: finding.evidence.runsObserved,
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
