import fs from 'fs';
import path from 'path';
import handlebars from 'handlebars';
import { config } from './config';

export interface TemplateVariable {
  name: string;
  label: string;
  required: boolean;
  example: string;
}

export interface TemplateMetadata {
  key?: string;
  name: string;
  audience: 'street-team' | 'solace-avenue';
  status: 'approved' | 'draft';
  subject: string;
  variables: TemplateVariable[];
}

export interface TemplateItem extends TemplateMetadata {
  key: string;
}

export interface RenderResult {
  subject: string;
  html: string;
  text: string;
}

export function listTemplates(): TemplateItem[] {
  const dir = process.env.TEMPLATES_DIR || config.templatesDir;
  if (!fs.existsSync(dir)) {
    return [];
  }

  try {
    const files = fs.readdirSync(dir);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    const templates: TemplateItem[] = [];

    for (const jsonFile of jsonFiles) {
      const key = path.basename(jsonFile, '.json');
      const htmlFile = `${key}.html`;

      if (files.includes(htmlFile)) {
        try {
          const jsonContent = fs.readFileSync(path.join(dir, jsonFile), 'utf-8');
          const meta = JSON.parse(jsonContent) as TemplateMetadata;
          templates.push({
            key,
            name: meta.name || key,
            audience: meta.audience || 'street-team',
            status: meta.status || 'draft',
            subject: meta.subject || '',
            variables: meta.variables || [],
          });
        } catch {
          // ignore corrupted individual template
        }
      }
    }

    return templates;
  } catch (err) {
    console.warn(`[Templates] Error reading templates directory: ${(err as Error).message}`);
    return [];
  }
}

export function renderTemplate(
  key: string,
  variables: Record<string, any> = {},
  isTest: boolean = false
): RenderResult | null {
  const dir = process.env.TEMPLATES_DIR || config.templatesDir;
  const jsonPath = path.join(dir, `${key}.json`);
  const htmlPath = path.join(dir, `${key}.html`);

  if (!fs.existsSync(jsonPath) || !fs.existsSync(htmlPath)) {
    return null;
  }

  const metaRaw = fs.readFileSync(jsonPath, 'utf-8');
  const meta: TemplateMetadata = JSON.parse(metaRaw);
  const htmlRaw = fs.readFileSync(htmlPath, 'utf-8');

  const renderContext: Record<string, any> = {};
  if (meta.variables && Array.isArray(meta.variables)) {
    for (const v of meta.variables) {
      // Missing values render as empty so template fallbacks apply, never "undefined" (LS-007).
      renderContext[v.name] = safeValue(v.name, variables?.[v.name]);
    }
  }

  // Also include any extra user variables
  for (const [k, v] of Object.entries(variables || {})) {
    if (renderContext[k] === undefined) {
      renderContext[k] = safeValue(k, v);
    }
  }

  const subjectTemplate = handlebars.compile(meta.subject || '');
  const htmlTemplate = handlebars.compile(htmlRaw);

  let subject = subjectTemplate(renderContext);
  if (isTest) {
    subject = `[TEST] ${subject}`;
  }

  const html = htmlTemplate(renderContext);
  const text = htmlToText(html);

  return {
    subject,
    html,
    text,
  };
}

/**
 * Variables are HTML-escaped by Handlebars, but a link target is still live. Variables named
 * "...Url" must be http(s) or mailto links; anything else (javascript:, data:, …) renders as
 * empty so the template's fallback link is used instead.
 */
function safeValue(name: string, value: unknown): string {
  if (value === undefined || value === null) return '';
  const str = typeof value === 'string' ? value : String(value);
  if (/url$/i.test(name) && str !== '' && !/^(https?:\/\/|mailto:)/i.test(str.trim())) {
    return '';
  }
  return str;
}

/** Plain-text part of the email: drop <head> (title, styles) and hidden preheaders, keep line breaks. */
export function htmlToText(html: string): string {
  const entities: Record<string, string> = {
    '&nbsp;': ' ', '&zwnj;': '', '&middot;': '·', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  };
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<div[^>]*display:\s*none[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
      const text = label.replace(/<[^>]*>/g, '').trim();
      return text && text !== href ? `${text} (${href})` : href;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|tr|div|li)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z#0-9]+;/gi, (e) => entities[e.toLowerCase()] ?? e)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
