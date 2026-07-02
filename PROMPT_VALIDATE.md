# Verification & Testing Prompts

This document contains instructions to validate the wired WORM audit trail, Rent Roll extraction service, and Excel exporter.

---

## 1. Run Verification Script
To confirm the integrity of the WORM audit trail:
- Execute NestJS type checking:
  ```bash
  npm run typecheck
  ```
- Run the NestJS unit tests to verify database rules:
  ```bash
  npm run test --workspace=api
  ```

---

## 2. Next Claude Prompt (Validation and UI integration)

Copy and paste the following prompt into your chat with Claude to outline the Next.js Frontend integration for these endpoints:

```text
All NestJS backend services and REST endpoints for WORM audit logs, Rent Roll parsing, and Excel exports are fully wired in. The monorepo builds cleanly with zero TypeScript errors.

Now, we need the blueprints to wire the frontend Next.js application to trigger these actions:

1. RENT ROLL PARSE TRIGGER IN FRONTEND
In `apps/web/src/app/(dashboard)/documents/page.tsx`:
- We want to add an "Extract Rent Roll" action button on the selected document card if `document.documentType === 'rent_roll'`.
- Provide the React component code and fetch calling logic to trigger `POST /api/workspaces/:workspaceId/documents/:id/extract-rent-roll`.
- Handle loading states and show the extracted counts.

2. EXCEL DOWNLOAD TRIGGER IN FRONTEND
In `apps/web/src/app/(dashboard)/deals/page.tsx` or similar detail panel:
- We want to add a premium "Export Underwriting to Excel" button.
- Provide the React fetch/axios call logic that downloads the binary file from `GET /api/workspaces/:workspaceId/underwrites/:id/export` and saves it locally in the browser with the correct filename.
```
