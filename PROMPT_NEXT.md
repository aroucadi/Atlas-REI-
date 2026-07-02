# Integration Stage: Wiring Up Controllers and Services

This document contains the prompt to run with Claude to obtain the exact NestJS Controller, Service, and mapping logic to wire up our newly integrated WORM audit logs, Rent Roll parser, and Excel export utility.

---

## The Claude Prompt

Copy and paste the following prompt into your chat with Claude:

```text
We have successfully integrated the Rent Roll schema, the WORM audit trail migration, and the Excel export workbook utility into our Turborepo workspaces. All typechecks are passing cleanly.

Now, we need the exact code to wire these features into our NestJS application. Please provide the blueprints for the following three areas:

1. WIRING UP THE RENT ROLL PARSER IN NESTJS
We have the `RentRollExtractionSchema` in our `@atlas/ai-gateway` package.
- Provide the NestJS Service code (e.g. in a document extraction service) that:
  - Takes a `documentId` and query parameters.
  - Fetches the raw document text/OCR from the DB or files.
  - Calls the AI Gateway using the `RentRollExtractionSchema`.
  - Persists the results to the `document_extractions` table (mapping fields to JSON columns, populating confidence maps, and storing citation spans).

2. WIRING UP THE EXCEL EXPORT REST ENDPOINT
We have the `buildUnderwriteWorkbook` utility in `apps/api/src/exports/underwriteExport.ts`.
- Provide the NestJS Controller endpoint (`GET /api/workspaces/:workspaceId/underwrites/:id/export`) and the corresponding Service method that:
  - Fetches the completed `UnderwriteRun` from the database.
  - Maps the database columns (underwriting outputs, properties, and mandates) to the flat `UnderwriteExportPayload` structure.
  - Invokes `buildUnderwriteWorkbook` to construct the ExcelJS workbook.
  - Streams the workbook directly as a binary attachment (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) back to the client.

3. AUDIT LOG SERVICE SAFETY ENFORCEMENT
To guarantee application-level safety for our WORM audit trail:
- Provide a simple NestJS Interceptor or AuditLogService wrapper method that throws a clean, descriptive Application Exception if any developer tries to call an update/delete method on `prisma.auditLog`.
```
