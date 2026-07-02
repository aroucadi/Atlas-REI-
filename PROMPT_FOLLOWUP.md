# Follow-up Strategy & Code Blueprint Prompt for Claude

This document contains the next follow-up prompt to run with Claude to extract exact technical implementation specifications for our next development cycle.

---

## The Claude Prompt

Copy the following text block and paste it into your active conversation with Claude:

```text
This is an incredibly sharp, grounded read. We are adopting the US Multifamily Syndicator focus and applying to YC first. 

To execute the first part of the roadmap immediately, we need the exact technical blueprints to modify our Turborepo codebase. Please provide:

1. THE WORM AUDIT TRAIL SCHEMA & POSTGRES TRIGGER (Day 1 execution)
Our current `audit_logs` table is a standard, mutable Postgres table in Prisma. 
- Provide the exact SQL migration code (compatible with Prisma migrate) to:
  - Add a cryptographically secure `previous_hash` column.
  - Implement a Postgres `BEFORE INSERT` trigger that computes the hash of the current log entry (including the hash of the previous row) so each entry is cryptographically chained to the last.
  - Implement a Postgres trigger (`BEFORE UPDATE OR DELETE`) that absolutely blocks any modifications or deletions, throwing a hard SQL error.

2. THE MULTIFAMILY RENT ROLL (T-12) EXTRACTION SCHEMA
We want to implement the multifamily rent roll parser in our `packages/ai-gateway` and `apps/api` workspaces.
- Provide the exact Zod schema (`z.object({...})`) that we should feed to the AI Gateway's `generateStructuredJson` method to extract key fields from a standard multifamily Rent Roll. This needs to capture:
  - Unit details (Unit number, Unit type, bedrooms, bathrooms).
  - Lease details (Tenant name, lease start/end dates, monthly base rent, security deposit).
  - Financial balances (Any past-due balances, concessions, utility chargeback agreements).

3. THE EXCEL EXPORT JSON MAPPING STRATEGY
How should the API format the JSON payload from the underwriting result so it maps 1-to-1 to standard CRE Excel models? Provide a sample JSON schema representing the underwrite output fields (Purchase price, LTV, interest rate, gross yield, net yield, service charges, reserves) that is optimized for easy parsing by a node-xlsx or exceljs writer.
```
