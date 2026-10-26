export class GitHubApiError extends Error {
    status;
    constructor(status, path) {
        super(`GitHub API ${status} for ${path}`);
        this.name = 'GitHubApiError';
        this.status = status;
    }
}
const API_VERSION = '2022-11-28';
export class GitHubApi {
    #config;
    constructor(config) {
        this.#config = config;
    }
    async #get(path) {
        const response = await fetch(`${this.#config.apiUrl}${path}`, {
            headers: {
                accept: 'application/vnd.github+json',
                authorization: `Bearer ${this.#config.token}`,
                'user-agent': 'flakeguard-action',
                'x-github-api-version': API_VERSION,
            },
        });
        if (!response.ok)
            throw new GitHubApiError(response.status, path);
        return response;
    }
    async listRunsForSha(sha, limit) {
        const path = `/repos/${this.#config.repository}/actions/runs?head_sha=${encodeURIComponent(sha)}&per_page=${limit}`;
        const response = await this.#get(path);
        const body = (await response.json());
        return (body.workflow_runs ?? []).map((run) => ({
            id: run.id,
            runAttempt: run.run_attempt,
            headSha: run.head_sha,
        }));
    }
    async listArtifacts(runId) {
        const path = `/repos/${this.#config.repository}/actions/runs/${runId}/artifacts?per_page=100`;
        const response = await this.#get(path);
        const body = (await response.json());
        return (body.artifacts ?? []).map((artifact) => ({
            id: artifact.id,
            name: artifact.name,
            expired: artifact.expired,
        }));
    }
    async downloadArtifactZip(artifactId) {
        const path = `/repos/${this.#config.repository}/actions/artifacts/${artifactId}/zip`;
        const response = await this.#get(path);
        return Buffer.from(await response.arrayBuffer());
    }
}
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
