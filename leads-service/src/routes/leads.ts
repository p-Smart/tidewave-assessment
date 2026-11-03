import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as db from '../db';
import { calculateScore, determineStatus } from '../scoring';
import { LeadCreatedEventPayload, sendLeadCreatedEvent } from '../events';
import { requireAdmin, requireStaff, requireStaffOrAutomation } from '../auth';

export const leadsRouter = Router();

// Numbers may arrive as numbers or numeric strings; missing/empty means 0.
const numberField = (field: string, max: number) =>
  z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? 0 : v),
    z.coerce
      .number({ invalid_type_error: `${field} must be a number` })
      .refine((n) => Number.isFinite(n), `${field} must be a number`)
      .pipe(z.number().min(0, `${field} cannot be negative`).max(max, `${field} must be at most ${max}`))
  );

// Lengths match the DB columns so bad input is a 422, not a 500 (LS-008, LS-009).
const createLeadSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100, 'First name must be at most 100 characters'),
  lastName: z.string().trim().max(100, 'Last name must be at most 100 characters').optional().nullable(),
  // Stored normalised so duplicates are found regardless of case/spaces (LS-004).
  email: z.string().trim().toLowerCase().max(255).email('Invalid email address'),
  phone: z.string().trim().min(1, 'Phone is required').max(50, 'Phone must be at most 50 characters'),
  city: z.string().trim().min(1, 'City is required').max(100, 'City must be at most 100 characters'),
  experienceYears: numberField('experienceYears', 80),
  hoursPerWeek: numberField('hoursPerWeek', 168),
  source: z.string().trim().max(100).optional().nullable(),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Consent must be accepted' }),
  }),
});

/**
 * National significant number: digits only, without the Nigerian/Ghanaian country code or the
 * national trunk prefix 0. "+234 809 000 0101" and "08090000101" -> "8090000101" (LS-005).
 */
export function phoneKey(phone: string): string {
  return phone.replace(/\D/g, '').replace(/^(234|233|0)/, '');
}
const PHONE_KEY_SQL = `regexp_replace(regexp_replace(phone, '\\D', '', 'g'), '^(234|233|0)', '')`;

const newId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

/** Deliver an outbox event after the lead is committed, and record the result (LS-006). */
async function deliverOutboxEvent(outboxId: string, event: LeadCreatedEventPayload): Promise<void> {
  let delivered = false;
  try {
    delivered = await sendLeadCreatedEvent(event);
  } finally {
    await db
      .query(`UPDATE leads.event_outbox SET status = $1 WHERE id = $2`, [delivered ? 'delivered' : 'failed', outboxId])
      .catch((err) => console.error('[Outbox] could not update status', outboxId, (err as Error).message));
  }
}

// POST /leads (public)
leadsRouter.post('/', async (req: Request, res: Response) => {
  const parseResult = createLeadSchema.safeParse(req.body);
  if (!parseResult.success) {
    const errors = parseResult.error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    res.status(422).json({ errors });
    return;
  }

  const { firstName, lastName, email, phone, city, experienceYears, hoursPerWeek, source, consent } =
    parseResult.data;

  try {
    // Duplicate check on normalised email / phone. Applications where previous consent was
    // withdrawn are not duplicates. lower(trim()) also matches legacy rows stored un-normalised.
    const dupRes = await db.query(
      `SELECT id, status FROM leads.leads
        WHERE (lower(trim(email)) = $1 OR ${PHONE_KEY_SQL} = $2) AND consent_withdrawn = false
        ORDER BY created_at ASC
        LIMIT 1`,
      [email, phoneKey(phone)]
    );
    const duplicateOf: string | null = dupRes.rows[0]?.id ?? null;

    const score = calculateScore({ experienceYears, hoursPerWeek, city });
    const status = duplicateOf ? 'duplicate' : determineStatus(score);
    const leadId = newId('lead');
    const event: LeadCreatedEventPayload | null = duplicateOf
      ? null
      : {
          id: newId('evt'),
          type: 'lead.created',
          createdAt: new Date().toISOString(),
          data: { leadId, status, email, firstName },
        };
    const outboxId = newId('obx');

    // Lead, activity and outbox row are committed together; the event is sent only afterwards.
    const inserted = await db.withTransaction(async (client) => {
      const row = await client.query(
        `INSERT INTO leads.leads (
           id, first_name, last_name, email, phone, city,
           experience_years, hours_per_week, source, consent,
           consent_withdrawn, score, status, duplicate_of
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, $11, $12, $13)
         RETURNING id, status, duplicate_of AS "duplicateOf"`,
        [leadId, firstName, lastName || null, email, phone, city, experienceYears, hoursPerWeek,
          source || null, consent, score, status, duplicateOf]
      );
      await client.query(
        `INSERT INTO leads.lead_activity (id, lead_id, type, detail, actor)
         VALUES ($1, $2, $3, $4, 'system')`,
        [
          newId('act'),
          leadId,
          duplicateOf ? 'duplicate_detected' : 'application_created',
          JSON.stringify(duplicateOf ? { duplicateOf } : { source, score, status }),
        ]
      );
      if (event) {
        await client.query(
          `INSERT INTO leads.event_outbox (id, event_id, event_type, payload, status)
           VALUES ($1, $2, $3, $4, 'pending')`,
          [outboxId, event.id, event.type, JSON.stringify(event)]
        );
      }
      return row.rows[0];
    });

    if (event) {
      // Not awaited: the applicant's response must not wait for n8n. Result lands in event_outbox.
      void deliverOutboxEvent(outboxId, event).catch((err) =>
        console.error('[Outbox] delivery error', outboxId, (err as Error).message)
      );
    }

    res.status(201).json({
      id: inserted.id,
      status: inserted.status,
      duplicateOf: inserted.duplicateOf ?? null,
    });
  } catch (err) {
    console.error('Error creating lead:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /leads (staff tokens)
leadsRouter.get('/', requireStaff, async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(req.query.pageSize as string, 10) || 20));
    const search = ((req.query.search as string) || '').trim();
    const offset = (page - 1) * pageSize;

    let whereClause = '';
    const params: any[] = [];
    if (search) {
      whereClause = `
        WHERE first_name ILIKE $1
           OR last_name ILIKE $1
           OR email ILIKE $1
           OR phone ILIKE $1
           OR city ILIKE $1
      `;
      params.push(`%${search}%`);
    }

    const countRes = await db.query(
      `SELECT COUNT(*)::int AS total FROM leads.leads ${whereClause}`,
      params
    );
    const total = countRes.rows[0].total;

    const dataParams = [...params, pageSize, offset];
    const dataRes = await db.query(
      `SELECT id, first_name AS "firstName", last_name AS "lastName",
              email, phone, city, experience_years AS "experienceYears",
              hours_per_week AS "hoursPerWeek", source, consent, score,
              status, duplicate_of AS "duplicateOf",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM leads.leads
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      dataParams
    );

    res.json({
      items: dataRes.rows,
      page,
      pageSize,
      total,
    });
  } catch (err) {
    console.error('Error fetching leads:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /leads/:id (staff or automation)
leadsRouter.get('/:id', requireStaffOrAutomation, async (req: Request, res: Response) => {
  try {
    const leadRes = await db.query(
      `SELECT id, first_name AS "firstName", last_name AS "lastName",
              email, phone, city, experience_years AS "experienceYears",
              hours_per_week AS "hoursPerWeek", source, consent, score,
              status, duplicate_of AS "duplicateOf",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM leads.leads
       WHERE id = $1`,
      [req.params.id]
    );

    if (leadRes.rows.length === 0) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    res.json(leadRes.rows[0]);
  } catch (err) {
    console.error('Error fetching lead:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /leads/:id/status (staff admin only)
leadsRouter.patch('/:id/status', requireAdmin, async (req: Request, res: Response) => {
  const { status } = req.body;

  // Never 'active', 'hired' or 'field_ready': applying is not a job offer (LS-002).
  const allowedStatuses = ['screening_invite', 'needs_review', 'not_now', 'duplicate'];
  if (!status || !allowedStatuses.includes(status)) {
    res.status(422).json({
      error: `Invalid status. Allowed values: ${allowedStatuses.join(', ')}`,
    });
    return;
  }

  try {
    const existing = await db.query(`SELECT id, status FROM leads.leads WHERE id = $1`, [
      req.params.id,
    ]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    const oldStatus = existing.rows[0].status;

    const updated = await db.query(
      `UPDATE leads.leads
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, first_name AS "firstName", last_name AS "lastName",
                 email, phone, city, experience_years AS "experienceYears",
                 hours_per_week AS "hoursPerWeek", source, consent, score,
                 status, duplicate_of AS "duplicateOf",
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [status, req.params.id]
    );

    await db.query(
      `INSERT INTO leads.lead_activity (id, lead_id, type, detail, actor)
       VALUES ($1, $2, 'status_changed', $3, $4)`,
      [
        `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        req.params.id,
        JSON.stringify({ from: oldStatus, to: status }),
        req.user?.role ?? 'unknown', // audit who changed it (LS-003)
      ]
    );

    res.json(updated.rows[0]);
  } catch (err) {
    console.error('Error updating lead status:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /leads/:id/activity (automation or staff)
leadsRouter.post('/:id/activity', requireStaffOrAutomation, async (req: Request, res: Response) => {
  const { type, detail } = req.body;
  if (!type) {
    res.status(422).json({ error: 'Activity type is required' });
    return;
  }

  try {
    const leadCheck = await db.query(`SELECT id FROM leads.leads WHERE id = $1`, [req.params.id]);
    if (leadCheck.rows.length === 0) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    const activityId = `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await db.query(
      `INSERT INTO leads.lead_activity (id, lead_id, type, detail, actor)
       VALUES ($1, $2, $3, $4, 'system')`,
      [activityId, req.params.id, type, JSON.stringify(detail || {})]
    );

    res.status(201).json({ id: activityId });
  } catch (err) {
    console.error('Error inserting activity:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /leads/:id/activity (staff or automation)
leadsRouter.get('/:id/activity', requireStaffOrAutomation, async (req: Request, res: Response) => {
  try {
    const actRes = await db.query(
      `SELECT id, type, detail, actor, created_at AS "createdAt"
       FROM leads.lead_activity
       WHERE lead_id = $1
       ORDER BY created_at ASC`,
      [req.params.id]
    );

    res.json(actRes.rows);
  } catch (err) {
    console.error('Error fetching activities:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
