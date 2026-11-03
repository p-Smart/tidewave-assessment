import { NextRequest, NextResponse } from 'next/server';
import { getStaffRole } from '@/lib/serverAuth';

/**
 * Staff test run: forwards to the n8n `staff-test-run` workflow, which renders the template and
 * emails ONLY staff-test@tidewave.test. The recipient is never taken from this request.
 * `requestId` is passed through so a repeated click with the same id sends a single email.
 */
export async function POST(request: NextRequest) {
  const role = await getStaffRole();
  if (!role) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const n8nUrl =
    process.env.N8N_TEST_RUN_URL || 'http://localhost:7678/webhook/staff-test-run';

  let body: { templateKey?: unknown; variables?: unknown; requestId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON' }, { status: 400 });
  }
  if (typeof body.templateKey !== 'string' || !body.templateKey) {
    return NextResponse.json({ error: 'templateKey is required' }, { status: 400 });
  }
  const variables =
    body.variables && typeof body.variables === 'object' && !Array.isArray(body.variables) ? body.variables : {};
  const requestId =
    typeof body.requestId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(body.requestId) ? body.requestId : undefined;

  const payload = {
    templateKey: body.templateKey,
    variables,
    requestId,
    requestedBy: role === 'Admin' ? 'staff.admin' : 'staff.viewer',
  };

  try {
    const res = await fetch(n8nUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { ok: res.ok, message: text };
    }
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : 'is not reachable';
    return NextResponse.json(
      { ok: false, error: `The automation service (n8n) ${reason}. Nothing was sent.` },
      { status: 502 }
    );
  }
}
