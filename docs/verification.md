# Verification

This checklist reflects the current Teruvion runtime. It avoids legacy endpoint promises and should be updated when the implemented API changes.

## Automated Checks

Run from the repository root:

```bash
npm run check
npm test
cd frontend
npm run build
```

Expected result:

- `npm run check` completes without syntax errors.
- `npm test` reports all registered test files passing.
- `npm run build` completes a production Next.js build.

## Decomposition Quality Evaluation

Run a deterministic fixture without an LLM:

```bash
node scripts/evaluate-decomposition-quality.js --provider none --json
```

Expected result:

- `decomposition.productReadiness` is present with a score and level.
- `recomposition.projectQuality` is present with a score and level.
- Weak components and reasons are visible when the route, brief, evidence, or resources are not product-ready.
- No-LLM output is allowed to be weak. The important check is that weak components are visible and not mislabeled as deep extraction.

Run the multi-source deterministic baseline:

```bash
node scripts/evaluate-decomposition-quality.js --fixture all --provider none --json
```

This covers paper, repository, dataset, report, and news source contracts without relying on source-specific branches.

Run a real connector-backed source through the same quality gate:

```bash
node scripts/evaluate-decomposition-quality.js \
  --input "https://www.nature.com/articles/s41586-024-07145-1" \
  --provider none \
  --json
```

For a real GitHub repository:

```bash
node scripts/evaluate-decomposition-quality.js \
  --input "https://github.com/Grups666/teruvion" \
  --provider none \
  --json
```

Real-source runs use the connector registry first, then the same admission, decomposition, quality, and recomposition contracts as fixtures.

To exercise the configured direct LLM API:

```bash
node scripts/evaluate-decomposition-quality.js --provider api --json
```

To exercise the Claude Code-compatible harness:

```bash
TERUVION_AGENT_PROVIDER=claude-code \
TERUVION_AGENT_COMMAND=claude \
TERUVION_AGENT_ARGS="-p --dangerously-skip-permissions" \
TERUVION_AGENT_TIMEOUT=600000 \
node scripts/evaluate-decomposition-quality.js --provider claude-code --json
```

For the full multi-source Claude Code benchmark:

```bash
TERUVION_AGENT_PROVIDER=claude-code \
TERUVION_AGENT_COMMAND=claude \
TERUVION_AGENT_ARGS="-p --dangerously-skip-permissions" \
TERUVION_AGENT_TIMEOUT=600000 \
node scripts/evaluate-decomposition-quality.js --fixture all --provider claude-code --json
```

Claude Code prompt delivery defaults to stdin so long source contracts are not placed on the command line. Provider verification disables direct API fallback by default; add `--fallback` only when explicitly testing fallback behavior. Long paper and multi-source runs may need the longer timeout because each source can trigger admission and decomposition agent calls.

Provider runs must still pass the same schema, provenance, resource-linking, visual-evidence, and product-readiness checks. Agent output is a candidate extraction, not evidence.

## Local Service Smoke Test

Start the API:

```bash
npm run server
```

Start the frontend in another terminal:

```bash
cd frontend
npm run dev
```

Open the frontend and verify:

1. The source input accepts a DOI, GitHub URL, paper URL, or paper title.
2. Example source buttons fill the input without starting an import automatically.
3. A valid source creates a project card.
4. The project card moves from processing to ready, or displays a visible failure reason.
5. Selecting a project opens the floating project panel.
6. Project quality, layer counts, lens summaries, and object groups are visible.
7. `Copy summary` copies a Markdown project summary.
8. Clicking an actionable lens card opens a relevant object inspector.
9. Selecting an object shows object signals, review notes, graph connections, properties, confidence, and source metadata where available.
10. Map markers or regions are visible when imported objects contain spatial fields.

## API Smoke Test

Import a source:

```bash
curl -X POST http://localhost:3000/api/import \
  -H "Content-Type: application/json" \
  -d '{"input":"10.1038/s41586-024-07145-8"}'
```

Then verify:

```bash
curl http://localhost:3000/api/projects
curl http://localhost:3000/api/entities
curl http://localhost:3000/api/lenses
```

For a real `projectId`, verify:

```bash
curl http://localhost:3000/api/projects/<projectId>
curl http://localhost:3000/api/projects/<projectId>/decomposition
curl http://localhost:3000/api/projects/<projectId>/lens
```

For a real `entityId`, verify:

```bash
curl http://localhost:3000/api/entities/<entityId>/explore
```

## Alpha Admin Verification

Configure `ADMIN_SECRET` or `_local/config/admin.local.json`:

```json
{
  "adminSecret": "replace-with-a-long-random-secret"
}
```

Run the alpha smoke flow against a configured host:

```bash
npm run test:alpha
```

Manual admin checks:

1. Open `/admin/alpha`.
2. Enter the admin secret and load data.
3. Applications list loads with pending, approved, and rejected filters.
4. Approving an application returns an invite code.
5. Rejecting a pending application changes its status.
6. Members view lists activated memberships.
7. Member quota fields can be edited and saved.
8. `Copy CSV` copies member id, name, email, role, plan, quota, and created time.

Admin-only API checks:

```bash
curl http://localhost:3000/api/alpha/applications \
  -H "x-admin-secret: $ADMIN_SECRET"

curl http://localhost:3000/api/alpha/memberships \
  -H "x-admin-secret: $ADMIN_SECRET"

curl -X PATCH http://localhost:3000/api/alpha/memberships/<memberId>/quota \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_SECRET" \
  -d '{"maxJobsPerMonth":20,"maxSourcesPerJob":8}'
```

Expected quota behavior:

- valid integer quota values in the range `1..10000` are accepted
- invalid values return a visible API error
- unknown member ids return `Membership not found`

## Safety Checks

- `_local/` remains ignored and must not be committed.
- No real API keys or admin secrets are present in tracked files.
- GitHub repositories are inspected statically; untrusted remote code is not executed by default.
- Mock, demo, or fixture data must remain labeled as such.
