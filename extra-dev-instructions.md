
# Extra Developer Instructions for Smooth Claude-Assisted Development

These are practical conventions, prompts, and guardrails to keep the build fast, consistent, and low‑bug with Claude (or any AI pair programmer). Use this alongside the **Implementation Guide**.

---

## 1) Project Conventions (Do This Everywhere)

**Language & Style**
- TypeScript everywhere (frontend & backend).
- ESLint + Prettier + `strict` TS. Enable `noImplicitAny`, `exactOptionalPropertyTypes`.
- File naming: kebab-case for files, PascalCase for React components.

**Component Architecture (Next.js App Router)**
- UI components in `/components/*` with a clear split:
  - `ui/` → low-level presentational components (buttons, inputs, modals).
  - `features/<domain>/` → smart components with data hooks.
- Hooks in `/hooks/*` (e.g., `useAppointments`, `useNotes`).
- Shared types/schemas in `/packages/types` (also used by API).

**State & Data**
- React Query for server state; keep local UI-only state in components.
- Zod for schemas + validation; generate inference types from Zod.
- Use optimistic updates where safe (appointments drag-drop, invoice edits).

**Styling & UX**
- Tailwind CSS; mobile‑first; responsive breakpoints `sm, md, lg`.
- Framer Motion for micro‑interactions (cards, modals, drag ghost).
- Accessible by default: labels, aria attributes, keyboard nav.

**I18n & TZ**
- Store times in UTC; render in clinic timezone.
- Keep copy in constants for easy future i18n; no hard-coded strings in logic.

---

## 2) API & DTO Conventions

**HTTP**
- Prefix: `/v1` (future-proof for breaking changes).
- JSON only. Error body shape is consistent.

**Request/Response DTOs**
- Define Zod for each endpoint in `packages/types/api/*`:
  - `Appointments.CreateReq/Res`, `Notes.UpdateReq/Res`, etc.
- Parse and validate requests **at the edge** in Express routes.

**Error Shape**
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Field x is required", "details": {...} } }
```

**Pagination**
- Use `cursor` (Dynamo `LastEvaluatedKey` base64) + `limit` (default 25, max 100).

**Idempotency**
- For create endpoints that can be retried (webhooks, reminders), accept `Idempotency-Key` header and store short TTL tokens in Dynamo (separate keyspace).

---

## 3) Logging, Monitoring, and Tracing

**Levels**
- `debug` (dev only), `info` (business events), `warn`, `error`.
- Redact PHI before logging. Never log SOAP content.

**Correlation**
- Generate `requestId` per request; propagate in logs and responses.

**Metrics**
- Put custom CloudWatch metrics: `appointments.created`, `reminders.sent.success`, `claims.submitted`.
- Alarm on error rate spikes and webhook failure counts.

**Tracing**
- Use AWS X-Ray if possible; otherwise include `requestId` and `userId` breadcrumbs.

---

## 4) Security & HIPAA Guardrails

- **Tenancy:** all queries scoped by `clinicId` (`TENANT#{clinicId}`).
- **Encryption:** PHI columns with envelope encryption (KMS). S3 private with signed URLs.
- **Auth:** Cognito JWT middleware validates `aud`, `iss`, `exp`. Map to `req.context.userId/clinicId`.
- **RBAC:** even if “solo”, design roles: `provider`, `admin`, `staff` (feature-flagged for later).
- **Audit:** log read/write of PHI with timestamp, user, and entity.
- **Rate limits:** per-IP and per-user limits on sensitive routes / brute-force surfaces.
- **Secrets:** store in Secrets Manager; rotate keys; zero secrets in env files or code.
- **Uploads:** validate mime/size; scan if feasible; never accept PHI in filenames.
- **Webhooks:** verify signatures (Paddle), verify Google channel headers.

---

## 5) DynamoDB Patterns (Single Table)

- Always use **ProjectionExpression** to fetch only needed attributes.
- Use **BatchGetItem** for aggregating patient timelines (appointments + notes + invoices via known keys).
- GSI usage:
  - GSI2 (ByPatient) for timelines; GSI3 (ByProviderTime) for calendar range.
  - GSI4 for worklists by status (invoices/claims).
- Use **transactions** sparingly (note sign/lock + audit write).
- Soft-delete with `deletedAt`; never physically remove PHI unless required.

---

## 6) Frontend UX Rules (Mobile‑First)

- Primary CTA accessible with one thumb (bottom right on mobile).
- Use sheet/drawer modals for forms on small screens.
- Skeletons for all lists; optimistic UI for calendar drag and invoice edits.
- Empty states with a CTA (“Create your first patient”).
- Toasts: success minimal, error actionable (“Retry”, “Contact support”).

**Accessibility**
- Tab order, ARIA roles on modals/menus.
- Color contrast AA; focus rings preserved.

---

## 7) Claude Prompting Patterns (Copy/Paste)

**A. Implement a Feature Incrementally**
```
You are coding in an existing monorepo (Next.js frontend, Express API, DynamoDB).
Follow these constraints:
- Use TypeScript, Zod for validation, React Query on the client.
- Do not hallucinate env var names—use placeholders I can replace.
- Produce small PR-sized changes with a file tree diff and code blocks.

Task:
Implement the /v1/appointments list endpoint with cursor pagination (limit default 25), querying GSI3 (ByProviderTime) between from and to (ISO). Validate inputs with Zod. Return items, nextCursor.
Also create a React Query hook `useAppointments(range)` that calls it and renders a basic list with a skeleton.
```

**B. Keep Schemas Single-Source-of-Truth**
```
Given Zod schemas in packages/types, generate types from them and import into API and UI. 
Never duplicate interface definitions.
```

**C. Tests First**
```
Write unit tests for the 837P builder mapping function with realistic fixtures (ICD10, CPT). Use table-driven tests for edge cases. Keep files under /apps/api/tests/claims.
```

**D. Guardrails**
```
- If any necessary field or path is missing, ask me for it before proceeding.
- Do not invent AWS resources—reference infra/cdk outputs.
- For secrets, call a helper `getSecret('name')` instead of inlining.
```

---

## 8) Error Handling & Retries

- Network calls (Google, Twilio, Claim.MD): retry with backoff (100ms, 500ms, 1000ms) and jitter; cap attempts.
- Webhook handlers must be **idempotent**.
- Background jobs: write execution results; dead-letter to SQS on repeated failure.

**User‑Facing Errors**
- Transform internal errors into friendly messages: “Couldn’t connect to Google Calendar. Please reconnect in Settings.”
- Never expose raw stack traces to UI.

---

## 9) CI/CD & Environments

- Branch strategy: `main` (prod), `dev` (staging). PRs require checks green.
- GitHub Actions:
  - Lint + typecheck + tests
  - Build Next.js, build API, synth + deploy CDK to **dev** on merge to `dev`
  - Promote to **prod** via manual approval
- Amplify previews for PRs (frontend), seeded with mock data.

---

## 10) Feature Flags & Config

- Use a simple `config` document (per clinic) with booleans:
  - `features: { stripeConnect: false, patientPortal: false, telehealth: false }`
- Gate UI with flags; hide incomplete features cleanly.
- Kill‑switch env flag for external webhooks if needed.

---

## 11) Release Checklist (Each Increment)

- [ ] Migrations / GSI updates documented
- [ ] API contract documented (Zod schemas updated)
- [ ] Permissions updated (Cognito groups / RBAC)
- [ ] Frontend loading/empty/error states covered
- [ ] E2E happy path tested (Cypress/Playwright)
- [ ] Observability: logs/metrics/alarms added
- [ ] Docs updated (README + feature guide)

---

## 12) Developer Ergonomics

- Create `dev-seed.ts` to insert a sample clinic, provider, 10 patients, and 20 appointments.
- Local dev: `serverless-offline` or SAM for API; DynamoDB Local; Next.js dev server.
- Add Storybook for key components (forms, notes editor, body-chart).

---

## 13) Accessibility & PDF

- PDFs must embed fonts; 11–12pt base; black on white; include metadata (patient, date, provider).
- Body-chart thumbnails with captions (“Figure 1: Anterior annotations”).

---

## 14) Performance Budgets

- LCP < 2.5s on 4G; JS bundle under 200KB per route if possible.
- Use dynamic imports for heavy editors (body-chart modal), load on demand.
- Cache Google tokens & Claim.MD sessions where allowed.

---

## 15) Support & Onboarding

- In-app **“Test my integrations”** button: sends a test SMS/email and attempts Claim.MD login.
- Add a **Setup Checklist** widget on Dashboard: connect calendar, add sender, import patients.
- Free setup call link (Calendly) shown after upgrade.

---

## 16) Known Tricky Areas

- Google Calendar ICS refresh lag (manage expectations in UI).
- Time zones + DST: always store UTC + source TZ; show TZ badge.
- Large notes: autosave debounced + version limit to prevent bloat.

---

## 17) Documentation Stubs to Keep Updated

- `docs/api.md` (endpoint table + error codes)
- `docs/dynamo-keys.md` (PK/SK patterns & GSIs)
- `docs/security.md` (HIPAA posture, data flows)
- `docs/runbook.md` (alarms, how to fix common issues)

---

## 18) Sample Commit & PR Format

**Commit**
```
feat(calendar): add GSI3 query & day/week views with drag-create
```

**PR Template**
- What & Why
- Screenshots (mobile + desktop)
- API changes (Zod links)
- Test plan (steps + results)
- Rollout considerations (flags, migrations)

---

Keep this file in `/docs/extra-dev-instructions.md` and evolve it as you build.
