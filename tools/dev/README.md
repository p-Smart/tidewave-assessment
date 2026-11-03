# Development helpers (used during the assessment, not part of the product)

| Script | Purpose |
|---|---|
| `gen_workflows.py` | Generates the three n8n workflow JSON files (`python3 -I tools/dev/gen_workflows.py .`). The workflows were authored here as code, imported with `n8n import:workflow`, then exported back with `node tools/tw.mjs export-n8n`. |
| `signed-post.mjs` | Posts an HMAC-signed event to an n8n webhook exactly like the engine / leads service do (`node signed-post.mjs <url> '<json>' [--bad-sig]`). |
| `n8n-exec.mjs` | Prints a per-node summary of the latest executions of a workflow (`node n8n-exec.mjs wf_solace_events 5`). Needs `npm i flatted`. |
| `n8n-export-executions.mjs` | Exports all executions with per-node results to `evidence/n8n-executions.json` (replaces the executions part of `tw.mjs export-n8n`, which asks n8n 2.42 for `limit=250` and gets HTTP 400). |
| `shots.mjs` | Takes the evidence screenshots in `evidence/screenshots/` with Playwright. |

All of these use only the assessment-only credentials published in `docs/SETUP.md`.
