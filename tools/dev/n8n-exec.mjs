// Usage: node n8n-exec.mjs <workflowId> [howMany]  -> per-node run summary of latest executions
const base = 'http://localhost:7678';
const login = await fetch(base + '/rest/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emailOrLdapLoginId: 'assessor@tidewave.test', password: 'Tidewave!2026' }) });
const Cookie = login.headers.get('set-cookie').split(';')[0];
const [wf, n = '3'] = process.argv.slice(2);
const list = await (await fetch(`${base}/rest/executions?filter=${encodeURIComponent(JSON.stringify({ workflowId: wf }))}&limit=${n}`, { headers: { Cookie } })).json();
for (const e of list.data.results ?? list.data) {
  const full = await (await fetch(`${base}/rest/executions/${e.id}`, { headers: { Cookie } })).json();
  const d = full.data; let parsed;
  try { const { parse } = await import('flatted'); parsed = parse(d.data); } catch { parsed = null; }
  console.log(`exec ${e.id} ${d.status} ${d.startedAt}`);
  if (!parsed) { console.log('  (install flatted to see node detail)'); continue; }
  for (const [node, runs] of Object.entries(parsed.resultData.runData)) {
    console.log(`  ${node}: runs=${runs.length} ${runs.map(r => (r.error ? 'ERR ' + r.error.message.slice(0, 60) : 'ok') + ' ' + r.executionTime + 'ms').join(' | ')}`);
  }
}
