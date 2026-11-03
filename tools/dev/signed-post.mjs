// Usage: node signed-post.mjs <url> '<json body>' [--bad-sig]
import crypto from 'node:crypto';
const [url, body, flag] = process.argv.slice(2);
const secret = flag === '--bad-sig' ? 'wrong_secret' : 'whsec_tidewave_demo_2f9a';
const t = Math.floor(Date.now() / 1000);
const sig = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
const id = JSON.parse(body).id;
const res = await fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'X-Tidewave-Event-Id': id, 'X-Tidewave-Signature': `t=${t},v1=${sig}` } });
console.log(res.status, await res.text());
