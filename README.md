# FlakeGuard Action

Reads JUnit XML artifacts for the same commit and reports tests that both passed and failed.

- Composite action; runs the bundled Node entry point (`action-dist/action/cli.js`).
- Inputs: `artifact-pattern`, `lookback-runs`, `token`, `report-dir`.
- Outputs: `flakeguard-report/flakeguard-report.json` and `.md` plus the job summary.
- Reads test metadata only (repository, commit SHA, test identity, status, duration, retry
  count, coarse failure category). No logs, source, secrets, or personal data.

Internal prototype. No support, no marketplace listing, no external users.
