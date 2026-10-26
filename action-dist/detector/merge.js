export function mergeByRun(artifacts) {
    const merged = new Map();
    for (const artifact of artifacts) {
        const runId = artifact.metadata.runId ?? 'unknown-run';
        let existing = merged.get(runId);
        if (existing === undefined) {
            existing = { metadata: artifact.metadata, dialect: artifact.dialect, outcomes: new Map() };
            merged.set(runId, existing);
        }
        else if (existing.dialect !== artifact.dialect) {
            existing.dialect = 'junit';
        }
        for (const outcome of artifact.outcomes) {
            let perTest = existing.outcomes.get(outcome.testId);
            if (perTest === undefined) {
                perTest = new Map();
                existing.outcomes.set(outcome.testId, perTest);
            }
            const retryClass = outcome.status === 'passed' && outcome.retryCount > 0 ? 'retried-pass' : outcome.status;
            const key = `${outcome.status}:${retryClass}`;
            if (!perTest.has(key))
                perTest.set(key, outcome);
        }
    }
    return [...merged.values()].map((value) => ({
        metadata: value.metadata,
        dialect: value.dialect,
        outcomes: [...[...value.outcomes.values()].flatMap((perTest) => [...perTest.values()])],
    }));
}
