function escapeCell(value) {
    return value.replace(/\|/g, '\\|');
}
function formatEvidence(finding) {
    return finding.observations
        .map((observation) => {
        const retry = observation.retryCount > 0 ? `, ${observation.retryCount} retr${observation.retryCount === 1 ? 'y' : 'ies'}` : '';
        const category = observation.failureCategory !== null ? `, ${observation.failureCategory}` : '';
        return `${observation.runId}: ${observation.status}${category}${retry}`;
    })
        .join('; ');
}
function findingRow(finding) {
    const evidence = finding.evidence;
    return `| ${escapeCell(finding.testId)} | ${evidence.runsObserved} | ${evidence.passes} | ${evidence.retriedPasses} | ${evidence.failures} | ${evidence.failureCategories.length > 0 ? evidence.failureCategories.join(', ') : '—'} | ${escapeCell(formatEvidence(finding))} |`;
}
function section(title, findings) {
    if (findings.length === 0)
        return [`## ${title}`, '', `None.`, ''];
    return [
        `## ${title}`,
        '',
        '| Test | Runs | Passes | Retries | Failures | Categories | Evidence |',
        '|---|---|---|---|---|---|---|',
        ...findings.map(findingRow),
        '',
    ];
}
export function toMarkdownReport(result) {
    const byClassification = (classification) => result.findings.filter((finding) => finding.classification === classification);
    const lines = [
        `# FlakeGuard report — ${result.repository}@${result.commitSha}`,
        '',
        `Generated from ${result.runs.length} run(s): ${result.runs.map((run) => `\`${run}\``).join(', ')}.`,
        '',
        '## Summary',
        '',
        '| Tests | Flaky | Broken | Stable | New | Excluded (skipped) |',
        '|---|---|---|---|---|---|',
        `| ${result.summary.tests} | ${result.summary.flaky} | ${result.summary.broken} | ${result.summary.stable} | ${result.summary.new} | ${result.summary.excludedSkipped} |`,
        '',
        ...section('Flaky tests (conflicting outcomes or a retried pass)', byClassification('flaky')),
        ...section('Broken tests (consistent failure, not flaky)', byClassification('broken')),
        '## Stable tests',
        '',
        byClassification('stable').length === 0
            ? 'None.'
            : byClassification('stable')
                .map((finding) => `- \`${finding.testId}\``)
                .join('\n'),
        '',
        '## New tests (single observation, not enough history)',
        '',
        byClassification('new').length === 0
            ? 'None.'
            : byClassification('new')
                .map((finding) => `- \`${finding.testId}\` — observed ${formatEvidence(finding)}`)
                .join('\n'),
        '',
        '## Excluded from evidence',
        '',
        result.excludedSkipped.length === 0
            ? 'None.'
            : result.excludedSkipped.map((testId) => `- \`${testId}\` (skipped)`).join('\n'),
        '',
        '---',
        '',
        'Report version 1. Only test metadata is reported: repository, commit SHA, test identity, status,',
        'duration, retry count, and coarse failure category. No logs, source, secrets, or PII.',
        '',
    ];
    return lines.join('\n');
}
