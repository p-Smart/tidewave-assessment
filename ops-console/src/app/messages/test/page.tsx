'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Template, TemplateVariable } from '@/lib/types';

const STAFF_TEST_INBOX = 'staff-test@tidewave.test';
const PREVIEW_DEBOUNCE_MS = 400;

type Notice = { type: 'success' | 'error' | 'note'; message: string };
type Preview = { state: 'idle' | 'loading' | 'ready' | 'error'; subject?: string; html?: string; message?: string };

const newRequestId = () =>
  `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const isUrlField = (v: TemplateVariable) => /url$/i.test(v.name);

/** Returns a message for an invalid value, or null when the value is acceptable. */
function validateField(v: TemplateVariable, value: string): string | null {
  const trimmed = value.trim();
  if (v.required && trimmed === '') return `${v.label} is required.`;
  if (trimmed !== '' && isUrlField(v) && !/^(https?:\/\/|mailto:)/i.test(trimmed)) {
    return `${v.label} must start with http://, https:// or mailto:.`;
  }
  return null;
}

export default function MessageTestPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<Preview>({ state: 'idle' });
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  // One id per "version" of the form: a double click re-sends the same id and n8n sends one email.
  const requestId = useRef(newRequestId());
  const previewSeq = useRef(0);

  useEffect(() => {
    fetch('/api/templates', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Could not load templates (HTTP ${res.status})`);
        return res.json();
      })
      .then((data: Template[]) => {
        if (!Array.isArray(data)) throw new Error('Unexpected response from the templates service');
        // Only approved templates can be test-sent; drafts are hidden on purpose.
        const approved = data.filter((t) => t.status === 'approved').sort((a, b) => a.name.localeCompare(b.name));
        setTemplates(approved);
        if (approved.length > 0) setSelectedKey(approved[0].key);
        else setTemplatesError('There are no approved templates to test yet.');
      })
      .catch((err: unknown) => setTemplatesError(err instanceof Error ? err.message : 'Failed to load templates'));
  }, []);

  const template = useMemo(() => templates.find((t) => t.key === selectedKey), [templates, selectedKey]);
  const variables = useMemo(() => template?.variables ?? [], [template]);

  const errors = useMemo(() => {
    const out: Record<string, string> = {};
    for (const v of variables) {
      const e = validateField(v, values[v.name] ?? '');
      if (e) out[v.name] = e;
    }
    return out;
  }, [variables, values]);
  const isValid = Object.keys(errors).length === 0;

  /** Variables sent to the renderer / n8n: trimmed, empty optional ones left out. */
  const payloadVariables = useMemo(() => {
    const out: Record<string, string> = {};
    for (const v of variables) {
      const val = (values[v.name] ?? '').trim();
      if (val !== '') out[v.name] = val;
    }
    return out;
  }, [variables, values]);

  const resetForm = useCallback(() => {
    setValues({});
    setTouched({});
    setNotice(null);
    requestId.current = newRequestId();
  }, []);

  const handleTemplateChange = (key: string) => {
    setSelectedKey(key);
    resetForm();
  };

  const handleValueChange = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setNotice(null);
    requestId.current = newRequestId(); // a changed form is a new test run
  };

  const fillExamples = () => {
    const example: Record<string, string> = {};
    for (const v of variables) example[v.name] = v.example ?? '';
    setValues(example);
    setTouched({});
    setNotice(null);
    requestId.current = newRequestId();
  };

  // Live preview, debounced, ignoring responses that arrive out of order.
  useEffect(() => {
    if (!template) return;
    const seq = ++previewSeq.current;
    setPreview((p) => ({ ...p, state: 'loading' }));
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/templates/${encodeURIComponent(template.key)}/render`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ variables: payloadVariables, test: true }),
        });
        const data = await res.json();
        if (seq !== previewSeq.current) return;
        if (!res.ok) throw new Error(data.error || `Preview failed (HTTP ${res.status})`);
        setPreview({ state: 'ready', subject: data.subject, html: data.html });
      } catch (err: unknown) {
        if (seq !== previewSeq.current) return;
        setPreview({ state: 'error', message: err instanceof Error ? err.message : 'Preview failed' });
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [template, payloadVariables]);

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!template) return;
    // Show every validation message at once if the user tries to send too early.
    setTouched(Object.fromEntries(variables.map((v) => [v.name, true])));
    if (!isValid) {
      setNotice({ type: 'error', message: 'Please fix the highlighted fields before sending.' });
      return;
    }
    if (sending) return;
    setSending(true);
    setNotice(null);
    try {
      const res = await fetch('/api/messages/test-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateKey: template.key, variables: payloadVariables, requestId: requestId.current }),
      });
      const result = await res.json().catch(() => ({}));
      const outcome: string | undefined = result.outcome;

      if (res.ok && outcome === 'sent') {
        setNotice({
          type: 'success',
          message: `Test email sent to ${STAFF_TEST_INBOX}. Subject: "${result.subject ?? preview.subject ?? ''}". Check the Mailpit inbox.`,
        });
      } else if (res.ok && outcome === 'duplicate') {
        setNotice({ type: 'note', message: `This exact test was already sent to ${STAFF_TEST_INBOX}. Change a value to send it again.` });
      } else if (res.status === 409 || outcome === 'in_progress') {
        setNotice({ type: 'note', message: 'This test is already being sent. Please wait a moment.' });
      } else {
        const detail = result.error || result.detail || result.reason || result.message || `HTTP ${res.status}`;
        setNotice({ type: 'error', message: `Not sent: ${detail}` });
      }
    } catch (err: unknown) {
      setNotice({ type: 'error', message: `Not sent: ${err instanceof Error ? err.message : 'network error'}` });
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Test an email template</h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Fill in the fields, check the preview, then send a test. Test emails only ever go to{' '}
            <strong>{STAFF_TEST_INBOX}</strong>.
          </p>
        </div>
      </div>

      {templatesError && (
        <div className="alert-box alert-error" role="alert">{templatesError}</div>
      )}

      <div className="test-layout">
        <form className="card" onSubmit={handleSendTest} noValidate aria-busy={sending}>
          <div className="form-group">
            <label htmlFor="template-select">Template</label>
            <select
              id="template-select"
              className="select-input"
              value={selectedKey}
              onChange={(e) => handleTemplateChange(e.target.value)}
              disabled={templates.length === 0}
            >
              {templates.map((tpl) => (
                <option key={tpl.key} value={tpl.key}>{tpl.name}</option>
              ))}
            </select>
            {template && (
              <p className="field-hint">
                Audience: {template.audience === 'street-team' ? 'Street Team applicants' : 'Solace Avenue listeners'} · Subject: “{template.subject}”
              </p>
            )}
          </div>

          {template && (
            <fieldset className="fieldset">
              <legend className="legend">
                Email fields <span className="field-hint">(<span className="required-mark">*</span> required)</span>
              </legend>
              {variables.map((v) => {
                const id = `var-${v.name}`;
                const error = touched[v.name] ? errors[v.name] : undefined;
                return (
                  <div className="form-group" key={v.name}>
                    <label htmlFor={id}>
                      {v.label}
                      {v.required && <span className="required-mark" aria-hidden="true"> *</span>}
                    </label>
                    <input
                      id={id}
                      name={v.name}
                      className={`input-text${error ? ' input-invalid' : ''}`}
                      type={isUrlField(v) ? 'url' : 'text'}
                      value={values[v.name] ?? ''}
                      placeholder={v.example ? `e.g. ${v.example}` : ''}
                      required={v.required}
                      aria-required={v.required}
                      aria-invalid={!!error}
                      aria-describedby={error ? `${id}-error` : undefined}
                      onChange={(e) => handleValueChange(v.name, e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, [v.name]: true }))}
                    />
                    {error && <p id={`${id}-error`} className="field-error" role="alert">{error}</p>}
                  </div>
                );
              })}
              <button type="button" className="btn btn-secondary" onClick={fillExamples}>
                Fill with example values
              </button>
            </fieldset>
          )}

          {notice && (
            <div
              className={`alert-box alert-${notice.type}`}
              role={notice.type === 'error' ? 'alert' : 'status'}
              data-testid="send-result"
            >
              {notice.message}
            </div>
          )}

          <div className="actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={sending || !template}
            >
              {sending ? 'Sending…' : 'Send TEST run'}
            </button>
            <span className="field-hint">to {STAFF_TEST_INBOX}</span>
          </div>
        </form>

        <section className="card preview-card" aria-label="Email preview">
          <div className="preview-header">
            <h2 className="preview-title">Preview</h2>
            {preview.state === 'loading' && <span className="field-hint" role="status">Updating…</span>}
          </div>
          {preview.state === 'error' && (
            <div className="alert-box alert-error" role="alert">Preview unavailable: {preview.message}</div>
          )}
          {preview.subject && (
            <p className="preview-subject">
              <span className="field-hint">Subject:</span> <strong data-testid="preview-subject">{preview.subject}</strong>
            </p>
          )}
          {preview.html ? (
            <iframe
              title="Rendered email preview"
              className="preview-frame"
              sandbox=""
              srcDoc={preview.html}
              data-testid="preview-frame"
            />
          ) : (
            preview.state !== 'error' && <p className="field-hint">Choose a template to see the preview.</p>
          )}
        </section>
      </div>
    </div>
  );
}
