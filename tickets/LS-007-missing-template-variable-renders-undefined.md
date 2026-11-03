# LS-007: Missing template variables render as the literal text "undefined"

**Area**: Leads Service (templates)  
**Severity**: Medium  
**Environment**: Starter build  
**Retest Status**: Open  

---

## Summary
`renderTemplate` (`src/templates.ts:92-95`) sets a missing declared variable to `'' + variables[v.name]`, i.e. the string `"undefined"`. Emails go out as "Hi undefined,".

## Steps to Reproduce
```bash
curl -X POST http://localhost:7081/templates/solace-intro/render \
  -H 'Authorization: Bearer tw_staff_viewer_81d4e0' -H 'Content-Type: application/json' -d '{"variables":{}}'
```

## Expected Behavior
Either a 422 listing missing required variables, or an empty value so the template's fallback (`{{#if firstName}}…{{else}}there{{/if}}`) applies.

## Actual Behavior
`text: "Solace Avenue Hi undefined, You asked to hear more about Solace Avenue …"` and `href="undefined"` for the campaign link.

## Evidence
- Response above.
- Automated test: Section A `api` project (references LS-007).

## Notes
Fix: `variables?.[v.name] ?? ''` and validate `required` variables (return 422). The n8n `staff-test-run` workflow already rejects missing required variables before rendering.
