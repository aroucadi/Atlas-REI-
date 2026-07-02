# Atlas REI: AI-Powered Real Estate Underwriting & Diligence Engine

Atlas REI is an enterprise-grade underwriting and document intelligence platform for real estate investment teams. It automates lease agreement ingestion, parses contract variables, checks them against active investment mandates, and drafts investment committee memos.

For the complete product value proposition, business use cases, and target markets, see **[PRODUCT.md](file:///d:/rouca/DVM/workPlace/dxb_real/PRODUCT.md)**.

---

## 1. Monorepo Project Structure

This project is managed as a monorepo using **Turborepo** and npm/pnpm workspaces:

```
├── apps/
│   ├── api/             # NestJS Backend API (REST, BullMQ, pgvector semantic search)
│   └── web/             # Next.js Frontend Web App (Tailwind CSS, Playwright E2E tests)
├── packages/
│   ├── database/        # Prisma database schema, migrations, and seed scripts
│   ├── ai-gateway/      # Gemini API LLM gateway (forces unmocked real-LLM execution)
│   ├── financial-core/  # Real estate underwriting mathematical formulas
│   ├── country-pack/    # Country-specific investment regulations (e.g., UAE, Spain)
│   └── shared-types/    # Shared TypeScript types across apps/ and packages/
```

---

## 2. Hardened Core Features

- **Grounded AI Citations**: AI Analyst Copilot returns answers that map directly back to clickable source PDF byte spans, preventing LLM hallucinations.
- **Fail-Safe Mode (`ALLOW_MOCK_GATEWAY`)**: Strict production configuration. If the real `GEMINI_API_KEY` is missing and `ALLOW_MOCK_GATEWAY="false"`, the API server will crash on boot rather than silently falling back to simulated data.
- **Database-Level Mandate Safeguards**: Postgres-level schema check constraints ensure that underwriting deals violating active investment mandates (e.g. risk or location rules) are blocked at the database transaction layer.
- **Immutable WORM Audit Trail**: Postgres rules block any `UPDATE` or `DELETE` commands on the `audit_logs` table, maintaining an immutable regulatory audit trail.

---

## 3. Getting Started

### Prerequisites
- **Node.js**: v18.x or v20.x
- **PostgreSQL**: With `pgvector` extension enabled
- **Redis**: For background job queue processing (BullMQ)

### Installation
From the root directory:
```bash
# Install all dependencies across workspaces
npm install
```

### Environment Configuration
Copy the `.env.example` in the root to `.env`:
```bash
cp .env.example .env
```
Ensure you configure the `DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`, and your `GEMINI_API_KEY`.

---

## 4. Development & Testing

### Running Locally
To launch both the API backend and Next.js frontend in development mode:
```bash
# Starts Next.js (port 3000) and NestJS (port 3001) concurrently
npm run dev
```

### Running Tests
- **E2E Playwright Tests** (Frontend, Routing, and Integration):
  ```bash
  cd apps/web
  npx playwright test
  ```
- **Unit & Integration Tests** (Backend & Math Core):
  ```bash
  # Run Vitest tests in NestJS
  npm run test --workspace=api
  ```
- **Type Checking**:
  ```bash
  npm run typecheck
  ```
