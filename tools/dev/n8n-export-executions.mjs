// Export every n8n execution with a per-node audit summary (tools/tw.mjs export-n8n asks for
// limit=250, which n8n 2.42 rejects: "Execution limit must be between 1 and 100").
import fs from 'node:fs';
import { parse } from 'flatted';
const base = 'http://localhost:7678';
const out = process.argv[2] || 'n8n-executions.json';
const login = await fetch(base + '/rest/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emailOrLdapLoginId: 'assessor@tidewave.test', password: 'Tidewave!2026' }) });
const Cookie = login.headers.get('set-cookie').split(';')[0];
// n8n 2.42 pages with an opaque cursor returned alongside each page.
const seen = new Set(); const list = []; let cursor;
for (;;) {
  const url = `${base}/rest/executions?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
  const page = await (await fetch(url, { headers: { Cookie } })).json();
  const data = page.data ?? page;
  const results = data.results ?? [];
  const fresh = results.filter((e) => !seen.has(e.id));
  if (fresh.length === 0) break;
  for (const e of fresh) { seen.add(e.id); list.push(e); }
  cursor = data.cursor ?? data.nextCursor;
  if (!cursor || results.length < 100) break;
}
const executions = [];
for (const e of list.sort((a, b) => Number(a.id) - Number(b.id))) {
  const full = (await (await fetch(`${base}/rest/executions/${e.id}`, { headers: { Cookie } })).json()).data;
  let nodes = [];
  try {
    const run = parse(full.data).resultData.runData;
    nodes = Object.entries(run).map(([node, runs]) => ({
      node, runs: runs.length,
      results: runs.map((r) => ({ ok: !r.error, ms: r.executionTime, error: r.error?.message?.slice(0, 200) })),
    }));
  } catch {}
  executions.push({ id: e.id, workflowId: full.workflowId, workflow: full.workflowData?.name, status: full.status, mode: full.mode, startedAt: full.startedAt, stoppedAt: full.stoppedAt, nodes });
}
const summary = {};
for (const x of executions) { const k = `${x.workflow}:${x.status}`; summary[k] = (summary[k] || 0) + 1; }
fs.writeFileSync(out, JSON.stringify({ exportedAt: new Date().toISOString(), count: executions.length, summary, executions }, null, 2) + '\n');
console.log('exported', executions.length, 'executions ->', out); console.log(summary);
