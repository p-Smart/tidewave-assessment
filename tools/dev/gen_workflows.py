#!/usr/bin/env python3
"""Generate the three Tidewave n8n workflows into <repo>/n8n/workflows/.

Usage: python3 -I gen_workflows.py /path/to/tidewave-assessment
"""
import json
import sys
from pathlib import Path

REPO = Path(sys.argv[1]).resolve()
OUT = REPO / "n8n" / "workflows"

LEADS = "http://leads:8081"
ENGINE = "http://engine:8080"
AUTH_CRED = {"httpHeaderAuth": {"id": "cred_tidewave_automation", "name": "Tidewave Automation"}}
SMTP_CRED = {"smtp": {"id": "cred_mailpit_smtp", "name": "Mailpit SMTP"}}
PG_CRED = {"postgres": {"id": "cred_tidewave_postgres", "name": "Tidewave Postgres (automation ledger)"}}

SETTINGS = {
    "executionOrder": "v1",
    # Audit trail: keep every execution (starter had 'none' for successes).
    "saveDataSuccessExecution": "all",
    "saveDataErrorExecution": "all",
    "saveManualExecutions": True,
    "saveExecutionProgress": True,
    "timezone": "Africa/Lagos",
}

# ---------------------------------------------------------------- code blocks

VERIFY_SIGNATURE_JS = r"""
// Verify X-Tidewave-Signature (t=<unix>,v1=<hex HMAC-SHA256 of "t.rawBody">) against the RAW body.
// Never throws: returns { valid:false, reason } so the workflow can answer 401 and log why.
const crypto = require('crypto');
const item = $input.first();
const headers = item.json.headers || {};
const sigHeader = String(headers['x-tidewave-signature'] || '');
const headerEventId = String(headers['x-tidewave-event-id'] || '');
const secret = $env.TIDEWAVE_EVENTS_SIGNING_SECRET;
const fail = (reason) => [{ json: { valid: false, reason, eventId: headerEventId || null } }];

if (!secret) return fail('signing secret not configured on n8n');

let raw = null;
const binKey = item.binary ? Object.keys(item.binary)[0] : null;
if (binKey) {
  try {
    raw = (await this.helpers.getBinaryDataBuffer(0, binKey)).toString('utf8');
  } catch (e) {
    const b = item.binary[binKey];
    if (b && b.data && !b.id) raw = Buffer.from(b.data, 'base64').toString('utf8');
  }
}
if (raw === null) return fail('raw body unavailable');

const parts = {};
for (const p of sigHeader.split(',')) {
  const i = p.indexOf('=');
  if (i > 0) parts[p.slice(0, i).trim()] = p.slice(i + 1).trim();
}
if (!/^\d+$/.test(parts.t || '') || !/^[0-9a-f]{64}$/i.test(parts.v1 || '')) {
  return fail('missing or malformed signature header');
}
const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest('hex');
if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(parts.v1.toLowerCase(), 'hex'))) {
  return fail('signature mismatch');
}

let event;
try { event = JSON.parse(raw); } catch (e) { return fail('body is not valid JSON'); }
if (!event || typeof event.id !== 'string' || typeof event.type !== 'string' || typeof event.data !== 'object' || event.data === null) {
  return fail('event shape invalid');
}
if (headerEventId && headerEventId !== event.id) return fail('X-Tidewave-Event-Id does not match body id');

// Replay protection is done by the idempotency ledger (dedup keys), not by timestamp age:
// the engine test clock (/__tools/clock) can legitimately shift signing times.
return [{ json: {
  valid: true,
  reason: 'signature ok',
  eventId: event.id,
  type: event.type,
  sequence: event.sequence ?? null,
  createdAt: event.createdAt ?? null,
  signedAt: Number(parts.t),
  data: event.data,
} }];
""".strip()

EMAIL_RE = r"/^[^\s@]+@[^\s@]+\.test$/"

BUILD_INTRO_JOB_JS = r"""
// optin.created -> decide whether to send the Solace Avenue intro email.
const ev = $('Verify Signature').first().json;
const d = ev.data || {};
// The intro brief is about the active campaign. Engine events have been seen carrying the
// CLOSED campaign slug (coastline-ep), so the link is pinned to the active campaign.
const ACTIVE_CAMPAIGN_URL = 'http://localhost:7080/campaigns/harmattan-sessions';
const email = String(d.email || '').trim().toLowerCase();
const firstName = String(d.firstName || '').trim();

let decision = 'send';
let reason = 'opted in with marketing consent';
if (d.consent !== true) { decision = 'skip'; reason = 'no marketing consent in event'; }
else if (!EMAIL_RE.test(email)) { decision = 'skip'; reason = 'recipient missing or outside the .test domain'; }
else if (d.artistSlug && d.artistSlug !== 'solace-avenue') { decision = 'skip'; reason = `no intro template for artist ${d.artistSlug}`; }

return [{ json: {
  decision, reason,
  workflow: 'solace-events',
  eventId: ev.eventId,
  dedupKey: `solace-intro:${email}`,           // one intro per person, however often the event repeats
  templateKey: 'solace-intro',
  to: email,
  variables: { firstName: firstName || 'there', campaignUrl: ACTIVE_CAMPAIGN_URL },
  activity: { subjectType: d.participantId ? 'participant' : 'optin', subjectId: d.participantId || ev.eventId },
  eventCampaignSlug: d.campaignSlug ?? null,
  eventSource: d.source ?? null,
} }];
""".strip().replace("EMAIL_RE", EMAIL_RE)

BUILD_CONFIRMED_JOB_JS = r"""
// payment.updated -> decide using ONLY the engine's provider-verified view of the payment.
// The status inside the inbound event is never trusted.
const ev = $('Verify Signature').first().json;
const claimed = ev.data || {};
const p = $input.first().json;               // GET /api/automation/payments/{id}
const email = String(p.participant?.email || '').trim().toLowerCase();
// Statuses that can still become 'succeeded' later (PR7: an expired payment may be confirmed late).
const NOT_FINAL = ['pending', 'processing', 'expired'];

let decision = 'send';
let reason = 'payment succeeded and verified with provider';
if (p.id !== claimed.paymentId) { decision = 'skip'; reason = 'engine returned a different payment id'; }
else if (p.status !== 'succeeded' || p.verifiedWithProvider !== true) {
  if (claimed.status === 'succeeded' && NOT_FINAL.includes(p.status)) {
    decision = 'retry';
    reason = `event claims succeeded but provider-verified status is ${p.status}; ask engine to redeliver later`;
  } else {
    decision = 'skip';
    reason = `provider-verified status is ${p.status} (event claimed ${claimed.status}); no confirmation email`;
  }
}
else if (!EMAIL_RE.test(email)) { decision = 'skip'; reason = 'recipient missing or outside the .test domain'; }

return [{ json: {
  decision, reason,
  workflow: 'solace-events',
  eventId: ev.eventId,
  dedupKey: `solace-confirmed:${p.id}`,        // one confirmation per payment, ever
  templateKey: 'solace-confirmed',
  to: email,
  variables: {
    firstName: p.participant?.firstName || 'there',
    amountText: p.amountText,
    levelName: p.level || '',
  },
  activity: { subjectType: 'participant', subjectId: p.participant?.id || claimed.participantId },
  claimedStatus: claimed.status ?? null,
  verifiedStatus: p.status ?? null,
  verifiedWithProvider: p.verifiedWithProvider === true,
} }];
""".strip().replace("EMAIL_RE", EMAIL_RE)

BUILD_PROSPECT_JOB_JS = r"""
// lead.created -> decide using the lead as stored by the leads service (not the event payload).
const ev = $('Verify Signature').first().json;
const lead = $input.first().json;            // GET /leads/{id}
const email = String(lead.email || '').trim().toLowerCase();
// No screening booking page exists yet on the public site; this is the URL given in the
// template metadata. Change here only.
const SCREENING_URL = 'http://localhost:7080/street-team/screening';
const NEXT_STEP_TEXT = 'The next step is a short screening call with our team. Please choose a time that suits you using the button below.';

let decision = 'send';
let reason = 'lead qualified for a screening invite';
if (lead.id !== ev.data.leadId) { decision = 'skip'; reason = 'leads service returned a different lead'; }
else if (lead.status !== 'screening_invite') { decision = 'skip'; reason = `lead status is ${lead.status}; only screening_invite gets this email`; }
else if (lead.duplicateOf) { decision = 'skip'; reason = `lead is a duplicate of ${lead.duplicateOf}`; }
else if (lead.consent !== true) { decision = 'skip'; reason = 'lead has no consent'; }
else if (!EMAIL_RE.test(email)) { decision = 'skip'; reason = 'recipient missing or outside the .test domain'; }

return [{ json: {
  decision, reason,
  workflow: 'street-team-lead',
  eventId: ev.eventId,
  // Keyed on the normalised address, not the lead id: the leads service misses some duplicates
  // (email case, phone format), and one person must never get two invites.
  dedupKey: `street-team-prospect:${email}`,
  templateKey: 'street-team-prospect',
  to: email,
  variables: {
    firstName: String(lead.firstName || '').trim() || 'there',
    nextStepText: NEXT_STEP_TEXT,
    screeningUrl: SCREENING_URL,
  },
  leadId: lead.id,
  leadStatus: lead.status ?? null,
} }];
""".strip().replace("EMAIL_RE", EMAIL_RE)

CONTENT_GUARD_JS = r"""
// Last check before sending a street-team email: Tidewave never tells an applicant they are
// hired / active / field ready. Throwing here routes to Mark Failed and nothing is sent.
const r = $input.first().json;
const FORBIDDEN = /\b(hired|active|field[ -]?ready)\b/i;
const hit = (String(r.subject || '') + ' \n ' + String(r.text || '')).match(FORBIDDEN);
if (hit) throw new Error(`content guard: rendered email contains forbidden wording "${hit[0]}"`);
if (!r.html || !r.subject) throw new Error('content guard: render returned no subject/html');
return [{ json: r }];
""".strip()

STAFF_VALIDATE_JS = r"""
// Validate the ops console request. Recipient is NOT taken from the request: always staff-test@tidewave.test.
const body = $input.first().json.body || {};
const errors = [];
const templateKey = typeof body.templateKey === 'string' ? body.templateKey.trim() : '';
if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(templateKey)) errors.push('templateKey is missing or invalid');
const variables = body.variables ?? {};
if (typeof variables !== 'object' || Array.isArray(variables) || variables === null) errors.push('variables must be an object');
const requestId = typeof body.requestId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(body.requestId) ? body.requestId : null;
return [{ json: {
  valid: errors.length === 0,
  errors,
  templateKey,
  variables: errors.length ? {} : variables,
  requestId,
  requestedBy: typeof body.requestedBy === 'string' ? body.requestedBy.slice(0, 40) : 'unknown',
} }];
""".strip()

STAFF_CHECK_TEMPLATE_JS = r"""
// Only approved templates may be test-sent; all required variables must be filled in.
const req = $('Validate Request').first().json;
const list = $input.all().map(i => i.json);
const templates = Array.isArray(list[0]) ? list[0] : list;   // tolerate array-in-one-item
const tpl = templates.find(t => t && t.key === req.templateKey);
const STAFF_TEST_INBOX = 'staff-test@tidewave.test';

let decision = 'send';
let reason = 'approved template, required variables present';
let httpStatus = 200;
if (!tpl) { decision = 'skip'; reason = `template '${req.templateKey}' does not exist`; httpStatus = 404; }
else if (tpl.status !== 'approved') { decision = 'skip'; reason = `template '${req.templateKey}' is ${tpl.status}, only approved templates can be test-sent`; httpStatus = 422; }
else {
  const missing = (tpl.variables || [])
    .filter(v => v.required && String(req.variables[v.name] ?? '').trim() === '')
    .map(v => v.label || v.name);
  if (missing.length) { decision = 'skip'; reason = `missing required fields: ${missing.join(', ')}`; httpStatus = 422; }
}

return [{ json: {
  decision, reason, httpStatus,
  workflow: 'staff-test-run',
  eventId: req.requestId || `exec_${$execution.id}`,
  // A double-click resends the same requestId -> same key -> only one email.
  dedupKey: `staff-test-run:${req.requestId || 'exec_' + $execution.id}`,
  templateKey: req.templateKey,
  to: STAFF_TEST_INBOX,
  variables: req.variables,
  requestedBy: req.requestedBy,
} }];
""".strip()

# ---------------------------------------------------------------- SQL

CLAIM_SQL = """
-- Atomically claim the right to send this message once.
-- claimed=true  -> this execution owns the send (new key, or the previous attempt 'failed').
-- claimed=false -> someone else has it; status tells us 'sent' (done) or 'pending' (in flight).
-- No row at all -> a concurrent claim is still uncommitted: treat as in flight.
WITH ins AS (
  INSERT INTO automation.message_claims (dedup_key, workflow, event_id, status)
  VALUES ($1, $2, $3, 'pending')
  ON CONFLICT (dedup_key) DO UPDATE
    SET status = 'pending',
        attempts = automation.message_claims.attempts + 1,
        event_id = EXCLUDED.event_id,
        updated_at = NOW()
    WHERE automation.message_claims.status = 'failed'
  RETURNING dedup_key, status, attempts
)
SELECT dedup_key, status, attempts, true AS claimed FROM ins
UNION ALL
SELECT dedup_key, status, attempts, false AS claimed
  FROM automation.message_claims
 WHERE dedup_key = $1 AND NOT EXISTS (SELECT 1 FROM ins);
""".strip()

MARK_SENT_SQL = """
UPDATE automation.message_claims
   SET status = 'sent', last_error = NULL, updated_at = NOW()
 WHERE dedup_key = $1
RETURNING dedup_key, status, attempts;
""".strip()

MARK_FAILED_SQL = """
-- Release the claim so an engine retry / redelivery can try again.
UPDATE automation.message_claims
   SET status = 'failed', last_error = $2, updated_at = NOW()
 WHERE dedup_key = $1
RETURNING dedup_key, status, attempts, last_error;
""".strip()

# ---------------------------------------------------------------- node helpers

class WF:
    def __init__(self, wid, name):
        self.wid, self.name = wid, name
        self.nodes, self.conns = [], {}

    def add(self, node):
        self.nodes.append(node)
        return node["name"]

    def link(self, src, dst, out=0):
        outs = self.conns.setdefault(src, {"main": []})["main"]
        while len(outs) <= out:
            outs.append([])
        outs[out].append({"node": dst, "type": "main", "index": 0})

    def dump(self, filename):
        wf = {
            "id": self.wid, "name": self.name, "nodes": self.nodes,
            "connections": self.conns, "settings": SETTINGS, "active": False,
        }
        (OUT / filename).write_text(json.dumps(wf, indent=2, ensure_ascii=False) + "\n")
        print("wrote", OUT / filename)


def node(name, ntype, version, pos, params, **extra):
    n = {"parameters": params, "name": name, "type": ntype, "typeVersion": version, "position": list(pos)}
    n.update(extra)
    return n


def webhook(path, webhook_id, pos, raw=True):
    return node("Webhook", "n8n-nodes-base.webhook", 2, pos, {
        "httpMethod": "POST", "path": path, "responseMode": "responseNode",
        "options": {"rawBody": True} if raw else {},
    }, webhookId=webhook_id)


def code(name, js, pos, **extra):
    return node(name, "n8n-nodes-base.code", 2, pos, {"mode": "runOnceForAllItems", "jsCode": js}, **extra)


def respond(name, pos, status, body_expr):
    return node(name, "n8n-nodes-base.respondToWebhook", 1.1, pos, {
        "respondWith": "json", "responseBody": "={{ " + body_expr + " }}",
        "options": {"responseCode": status},
    })


def http(name, pos, method, url, body_expr=None, tries=3, wait=1000, on_error="continueErrorOutput"):
    params = {
        "method": method, "url": url,
        "authentication": "predefinedCredentialType", "nodeCredentialType": "httpHeaderAuth",
        "options": {"timeout": 4000},
    }
    if body_expr:
        params.update({"sendBody": True, "specifyBody": "json", "jsonBody": "={{ " + body_expr + " }}"})
    return node(name, "n8n-nodes-base.httpRequest", 4.2, pos, params, credentials=AUTH_CRED,
                retryOnFail=True, maxTries=tries, waitBetweenTries=wait, onError=on_error)


def pg(name, pos, sql, params_expr, **extra):
    return node(name, "n8n-nodes-base.postgres", 2.6, pos, {
        "operation": "executeQuery", "query": sql,
        "options": {"queryReplacement": "={{ " + params_expr + " }}"},
    }, credentials=PG_CRED, **extra)


def if_not_empty(name, pos, expr):
    return node(name, "n8n-nodes-base.if", 2.2, pos, {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
            "conditions": [{
                "id": name.lower().replace(" ", "-"), "leftValue": "={{ " + expr + " }}", "rightValue": "",
                "operator": {"type": "string", "operation": "notEmpty", "singleValue": True},
            }],
            "combinator": "and",
        },
        "options": {},
    })


def if_true(name, pos, expr):
    return node(name, "n8n-nodes-base.if", 2.2, pos, {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
            "conditions": [{
                "id": name.lower().replace(" ", "-"), "leftValue": "={{ " + expr + " }}", "rightValue": "",
                "operator": {"type": "boolean", "operation": "true", "singleValue": True},
            }],
            "combinator": "and",
        },
        "options": {},
    })


def switch(name, pos, expr, keys, fallback=True):
    rules = []
    for k in keys:
        rules.append({
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
                "conditions": [{
                    "id": f"{name}-{k}".lower().replace(" ", "-").replace(".", "-"),
                    "leftValue": "={{ " + expr + " }}", "rightValue": k,
                    "operator": {"type": "string", "operation": "equals"},
                }],
                "combinator": "and",
            },
            "renameOutput": True, "outputKey": k,
        })
    return node(name, "n8n-nodes-base.switch", 3.2, pos, {
        "rules": {"values": rules},
        "options": {"fallbackOutput": "extra", "renameFallbackOutput": "other"} if fallback else {},
    })


def email(name, pos, job_ref, to_expr=None):
    return node(name, "n8n-nodes-base.emailSend", 2.1, pos, {
        "fromEmail": "Tidewave Music <hello@tidewave.test>",
        "toEmail": "={{ " + (to_expr or f"{job_ref}.to") + " }}",
        "subject": "={{ $json.subject }}",
        "emailFormat": "both",
        "text": "={{ $json.text }}",
        "html": "={{ $json.html }}",
        "options": {"appendAttribution": False},
    }, credentials=SMTP_CRED, retryOnFail=True, maxTries=3, waitBetweenTries=1500, onError="continueErrorOutput")


def send_chain(wf, job_ref, x, y, render_test=False, guard=False, after_sent=None,
               to_expr=None, fail_status=503, in_progress_status=503):
    """Claim -> Render -> (Guard) -> Send -> Mark Sent [-> after_sent] -> Respond Sent.
    Any failure after the claim -> Mark Failed -> Respond Failed. Returns the Claim node name."""
    claim = wf.add(pg("Claim Send (idempotency)", (x, y), CLAIM_SQL,
                      f"[{job_ref}.dedupKey, {job_ref}.workflow, {job_ref}.eventId]",
                      alwaysOutputData=True, onError="continueErrorOutput"))
    claimed = wf.add(if_true("Claimed?", (x + 220, y), "$json.claimed === true"))
    wf.link(claim, claimed)
    already = wf.add(if_true("Already Sent?", (x + 440, y + 180), "$json.status === 'sent'"))
    wf.link(claimed, already, 1)
    dup = wf.add(respond("Respond Duplicate", (x + 660, y + 140), 200,
                         f"{{ ok: true, outcome: 'duplicate', detail: 'already sent, not sending again', dedupKey: {job_ref}.dedupKey }}"))
    wf.link(already, dup, 0)
    # Still in flight elsewhere: non-2xx so the engine retries later and sees the final outcome.
    busy = wf.add(respond("Respond In Progress", (x + 660, y + 300), in_progress_status,
                          f"{{ ok: false, outcome: 'in_progress', detail: 'another delivery is sending this message, retry later', dedupKey: {job_ref}.dedupKey }}"))
    wf.link(already, busy, 1)
    claim_err = wf.add(respond("Respond Claim Error", (x + 220, y + 340), 503,
                               "{ ok: false, outcome: 'retry', detail: 'idempotency store unavailable, nothing sent' }"))
    wf.link(claim, claim_err, 1)

    render = wf.add(http("Render Template", (x + 440, y), "POST",
                         f"={LEADS}/templates/{{{{ encodeURIComponent({job_ref}.templateKey) }}}}/render",
                         f"JSON.stringify({{ variables: {job_ref}.variables, test: {str(render_test).lower()} }})"))
    wf.link(claimed, render, 0)
    prev = render
    sx = x + 660
    if guard:
        g = wf.add(code("Content Guard", CONTENT_GUARD_JS, (sx, y), onError="continueErrorOutput"))
        wf.link(render, g)
        prev, sx = g, sx + 220
    send = wf.add(email("Send Email", (sx, y), job_ref, to_expr))
    wf.link(prev, send)
    mark_sent = wf.add(pg("Mark Sent", (sx + 220, y), MARK_SENT_SQL, f"[{job_ref}.dedupKey]"))
    wf.link(send, mark_sent, 0)

    last = mark_sent
    if after_sent:
        a = wf.add(after_sent((sx + 440, y)))
        wf.link(mark_sent, a)
        last = a
    sent_body = (f"{{ ok: true, outcome: 'sent', to: {job_ref}.to, template: {job_ref}.templateKey, "
                 f"subject: $('Render Template').first().json.subject, dedupKey: {job_ref}.dedupKey }}")
    sent = wf.add(respond("Respond Sent", (sx + 660 if after_sent else sx + 440, y), 200, sent_body))
    wf.link(last, sent)

    mark_failed = wf.add(pg("Mark Failed", (sx, y + 220), MARK_FAILED_SQL,
                            f"[{job_ref}.dedupKey, String($json.error?.message ?? $json.error ?? 'unknown error').slice(0, 500)]"))
    wf.link(render, mark_failed, 1)
    if guard:
        wf.link(prev, mark_failed, 1)
    wf.link(send, mark_failed, 1)
    failed = wf.add(respond("Respond Failed", (sx + 220, y + 220), fail_status,
                            f"{{ ok: false, outcome: 'failed', detail: $('Mark Failed').first().json.last_error, dedupKey: {job_ref}.dedupKey }}"))
    wf.link(mark_failed, failed)
    return claim


def route_job(wf, job_ref_node, pos, retry_status=503):
    """Switch on decision: send -> returns node name for 'send' wiring; skip/retry respond."""
    r = wf.add(switch("Route Decision", pos, "$json.decision", ["send", "skip", "retry"], fallback=False))
    skip = wf.add(respond("Respond Skipped", (pos[0] + 220, pos[1] + 180), 200,
                          "{ ok: true, outcome: 'skipped', reason: $json.reason }"))
    retry = wf.add(respond("Respond Retry Later", (pos[0] + 220, pos[1] + 340), retry_status,
                           "{ ok: false, outcome: 'retry', reason: $json.reason }"))
    wf.link(r, skip, 1)
    wf.link(r, retry, 2)
    return r


def verify_block(wf, pos):
    v = wf.add(code("Verify Signature", VERIFY_SIGNATURE_JS, pos))
    ok = wf.add(if_true("Signature Valid?", (pos[0] + 220, pos[1]), "$json.valid"))
    wf.link(v, ok)
    bad = wf.add(respond("Respond Unauthorized", (pos[0] + 440, pos[1] + 180), 401,
                         "{ ok: false, error: 'invalid signature', reason: $json.reason }"))
    wf.link(ok, bad, 1)
    return v, ok


# ---------------------------------------------------------------- solace-events

def build_solace():
    wf = WF("wf_solace_events", "Solace Avenue Events")
    wh = wf.add(webhook("solace-events", "5b7c1f1e-3a52-4d7e-9a61-0c2f6a3e1a02", (0, 300)))
    v, ok = verify_block(wf, (220, 300))
    wf.link(wh, v)
    route = wf.add(switch("Route Event Type", (660, 300), "$json.type", ["optin.created", "payment.updated"]))
    wf.link(ok, route, 0)
    ignored = wf.add(respond("Respond Ignored", (880, 560), 200,
                             "{ ok: true, outcome: 'ignored', type: $json.type }"))
    wf.link(route, ignored, 2)

    intro = wf.add(code("Build Intro Job", BUILD_INTRO_JOB_JS, (880, 140)))
    wf.link(route, intro, 0)

    fetch = wf.add(http("Verify Payment With Engine", (880, 380), "GET",
                        f"={ENGINE}/api/automation/payments/{{{{ encodeURIComponent($json.data.paymentId ?? '') }}}}",
                        tries=3, wait=1500))
    wf.link(route, fetch, 1)
    fetch_err = wf.add(respond("Respond Verify Failed", (1100, 560), 503,
                               "{ ok: false, outcome: 'retry', detail: 'could not verify payment with engine, nothing sent' }"))
    wf.link(fetch, fetch_err, 1)
    conf = wf.add(code("Build Confirmation Job", BUILD_CONFIRMED_JOB_JS, (1100, 380)))
    wf.link(fetch, conf, 0)

    r = route_job(wf, None, (1320, 300))
    wf.link(intro, r)
    wf.link(conf, r)

    job = "$('Route Decision').first().json"

    def activity(pos):
        return http("Record Engine Activity", pos, "POST", f"{ENGINE}/api/automation/activity",
                    f"JSON.stringify({{ subjectType: {job}.activity.subjectType, subjectId: {job}.activity.subjectId, "
                    f"type: 'email_sent', detail: `${{{job}.templateKey}} sent (dedup ${{{job}.dedupKey}}, event ${{{job}.eventId}})` }})",
                    tries=3, wait=1000, on_error="continueRegularOutput")

    claim = send_chain(wf, job, 1540, 300, after_sent=activity)
    wf.link(r, claim, 0)
    wf.dump("solace-events.json")


# ---------------------------------------------------------------- street-team-lead

def build_street():
    wf = WF("wf_street_team_lead", "Street Team Lead Application")
    wh = wf.add(webhook("street-team-lead", "5b7c1f1e-3a52-4d7e-9a61-0c2f6a3e1a01", (0, 300)))
    v, ok = verify_block(wf, (220, 300))
    wf.link(wh, v)
    is_lead = wf.add(switch("Route Event Type", (660, 300), "$json.type", ["lead.created"]))
    wf.link(ok, is_lead, 0)
    ignored = wf.add(respond("Respond Ignored", (880, 500), 200,
                             "{ ok: true, outcome: 'ignored', type: $json.type }"))
    wf.link(is_lead, ignored, 1)
    # Leads service currently emits the event before the row is committed -> retry 404s briefly.
    get = wf.add(http("Get Lead", (880, 300), "GET",
                      f"={LEADS}/leads/{{{{ encodeURIComponent($json.data.leadId ?? '') }}}}", tries=5, wait=1000))
    wf.link(is_lead, get, 0)
    get_err = wf.add(respond("Respond Lead Fetch Failed", (1100, 500), 503,
                             "{ ok: false, outcome: 'retry', detail: 'could not load lead, nothing sent' }"))
    wf.link(get, get_err, 1)
    job_node = wf.add(code("Build Prospect Job", BUILD_PROSPECT_JOB_JS, (1100, 300)))
    wf.link(get, job_node, 0)
    r = route_job(wf, None, (1320, 300))
    wf.link(job_node, r)
    job = "$('Route Decision').first().json"

    def activity(pos):
        return http("Record Lead Activity", pos, "POST",
                    f"={LEADS}/leads/{{{{ encodeURIComponent({job}.leadId) }}}}/activity",
                    f"JSON.stringify({{ type: 'email_sent', detail: {{ template: {job}.templateKey, "
                    f"subject: $('Render Template').first().json.subject, dedupKey: {job}.dedupKey, eventId: {job}.eventId }} }})",
                    tries=3, wait=1000, on_error="continueRegularOutput")

    claim = send_chain(wf, job, 1540, 300, guard=True, after_sent=activity)
    wf.link(r, claim, 0)
    wf.dump("street-team-lead.json")


# ---------------------------------------------------------------- staff-test-run

def build_staff():
    wf = WF("wf_staff_test_run", "Staff Test Run")
    wh = wf.add(webhook("staff-test-run", "5b7c1f1e-3a52-4d7e-9a61-0c2f6a3e1a03", (0, 300), raw=False))
    val = wf.add(code("Validate Request", STAFF_VALIDATE_JS, (220, 300)))
    wf.link(wh, val)
    ok = wf.add(if_true("Request Valid?", (440, 300), "$json.valid"))
    wf.link(val, ok)
    bad = wf.add(respond("Respond Bad Request", (660, 480), 400,
                         "{ ok: false, error: $json.errors.join('; ') }"))
    wf.link(ok, bad, 1)
    lst = wf.add(http("List Templates", (660, 300), "GET", f"{LEADS}/templates", tries=3, wait=1000))
    wf.link(ok, lst, 0)
    lst_err = wf.add(respond("Respond Templates Unavailable", (880, 480), 502,
                             "{ ok: false, error: 'Could not load templates from the leads service. Nothing was sent.' }"))
    wf.link(lst, lst_err, 1)
    chk = wf.add(code("Check Template", STAFF_CHECK_TEMPLATE_JS, (880, 300)))
    wf.link(lst, chk, 0)

    r = wf.add(switch("Route Decision", (1100, 300), "$json.decision", ["send", "skip"], fallback=False))
    wf.link(chk, r)
    # 404 for an unknown template, 422 for a draft or missing required fields (computed in Check Template)
    rej = wf.add(respond("Respond Rejected", (1320, 480), "={{ $json.httpStatus }}",
                         "{ ok: false, error: $json.reason }"))
    wf.link(r, rej, 1)
    job = "$('Route Decision').first().json"
    claim = send_chain(wf, job, 1320, 300, render_test=True,
                       to_expr="'staff-test@tidewave.test'", fail_status=502, in_progress_status=409)
    wf.link(r, claim, 0)
    wf.dump("staff-test-run.json")


if __name__ == "__main__":
    build_solace()
    build_street()
    build_staff()
