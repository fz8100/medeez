
# Solo Doctor SaaS — Full Implementation Guide (AWS + DynamoDB + Next.js + Express)
Target: **U.S. solo doctors**, $29/mo, **BYO integrations**, **mobile‑first**, HIPAA‑aware.  
This guide is written so you can hand it to Claude (or any AI pair‑programmer) and build quickly.

---

## 0) Tech Stack & Architecture

**Frontend:** Next.js (App Router), TypeScript, Tailwind CSS, React Query, Framer Motion, react‑hook‑form, Zod validation  
**Canvas/Annotation:** `react-konva` (or `@tldraw/tldraw`) for body‑chart  
**Backend API:** Node.js + Express on **AWS Lambda** via API Gateway (serverless)  
**DB:** **DynamoDB** (single‑table design, on‑demand capacity), KMS encryption  
**File Storage:** S3 (+ pre‑signed URLs), S3 Object Lambda for PDF generation (optional)  
**Auth:** Cognito (doctors/staff) + short‑lived **magic links** for patients (email only, no account in MVP)  
**Background Jobs:** EventBridge + Lambda, SQS for retries  
**Webhooks:** API Gateway + Lambda routes (Paddle, Google Calendar, SendGrid/Twilio status, Claim.MD acks if applicable)  
**CDN & Hosting:** CloudFront + S3 (assets); Next.js SSR on Amplify Hosting **or** Lambda@Edge (Amplify recommended)  
**Billing (your SaaS):** Paddle (MoR)  
**Reminders:** **BYO** Twilio (SMS) / SendGrid (email) — store doctor creds encrypted  
**Calendar Sync:** Google Calendar OAuth + push notifications (`events.watch`)  
**Claims:** Claim.MD (BYO creds). Start with 837P export + SFTP/API upload; acks/status Phase 2  
**PDF:** server‑side HTML→PDF (e.g., `puppeteer-core` on Lambda) for notes/prescriptions/invoices

High‑level data flow (simplified):

- User (Doctor) → Next.js (SSR/CSR) → API Gateway → Lambda (Express) → DynamoDB/S3
- Webhooks (Paddle/Google) → API Gateway → Lambda → DynamoDB
- Background (reminders/acks) → EventBridge scheduled Lambdas
- Patient magic links → Next.js public route fetches **scoped** read‑only data

---

## 1) Environment & Repos

**Monorepo structure (pnpm/npm workspaces):**
```
/apps
  /web        # Next.js app router
  /api        # Express app (serverless adapter)
/packages
  /types      # Shared TypeScript types (zod schemas)
  /ui         # Shared UI components (optional)
/infra
  /cdk        # AWS CDK stacks (DynamoDB, S3, API GW, Cognito, etc.)
```

**Essential ENV (parameterize via SSM Parameter Store / Secrets Manager):**
- Core: `NODE_ENV`, `REGION`, `DYNAMO_TABLE`, `S3_BUCKET_ATTACHMENTS`
- Auth: `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `JWT_AUDIENCE`, `JWT_ISSUER`
- Paddle: `PADDLE_VENDOR_ID`, `PADDLE_API_KEY`, `PADDLE_PUBLIC_KEY`
- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_WEBHOOK_VERIFICATION` (optional)
- BYO Providers (per‑doctor stored encrypted in DB): Twilio SID/Token, SendGrid API key, Claim.MD creds
- Crypto: `KMS_KEY_ID`
- App: `APP_BASE_URL`, `PUBLIC_BOOKING_DOMAIN` (e.g., `book.medeez.com`), `FEATURE_STRIPE_CONNECT=false`

---

## 2) DynamoDB — Single‑Table Schema (Clinic‑ready, Solo UI)

**Table:** `medeez_app` (on‑demand, point‑in‑time recovery ON, KMS‑encrypted)

### 2.1 Entity Keys
We use **entity‑prefixed** primary keys and GSIs for fast access patterns.

- **PK** = `TENANT#{clinicId}`  
- **SK** = composite per entity, e.g.
  - `USER#{userId}`
  - `PATIENT#{patientId}`
  - `APPT#{yyyymmdd}#{appointmentId}`
  - `NOTE#{noteId}`
  - `ATTACH#{attachmentId}`
  - `INVOICE#{invoiceId}`
  - `CLAIM#{claimId}`
  - `INTEGRATION#{type}` (e.g., `INTEGRATION#twilio`)
  - `OAUTH#{provider}` (e.g., `OAUTH#google`)
  - `CALSYNC#{calendarId}`
  - `TEMPLATE#{templateId}`
  - `AUDIT#{timestamp}#{auditId}`

**Common attributes:** `entityType`, `clinicId`, `createdAt`, `updatedAt`, plus entity fields.  
**TTL** on magic links & temp tokens where applicable.

### 2.2 GSIs
- **GSI1 (ByEntityType):**
  - `GSI1PK` = `TYPE#{entityType}`
  - `GSI1SK` = varies (e.g., `clinicId#createdAt` or `providerId#startISO`)
  - **Use:** list all patients, templates, etc. (admin ops)

- **GSI2 (ByPatient):**
  - `GSI2PK` = `PATIENT#{patientId}`
  - `GSI2SK` = `NOTE#{updatedAt}` | `APPT#{startISO}` | `INVOICE#{createdAt}`
  - **Use:** fetch history for a patient fast

- **GSI3 (ByProviderTime):**
  - `GSI3PK` = `PROVIDER#{providerId}`
  - `GSI3SK` = `APPT#{startISO}`
  - **Use:** provider calendar queries by time range

- **GSI4 (ByStatus/Type for Invoices & Claims):**
  - `GSI4PK` = `INVSTAT#{status}` or `CLMSTAT#{status}`
  - `GSI4SK` = `createdAt` or `dosStartISO`
  - **Use:** dashboards, worklists

- **GSI5 (External IDs):**
  - `GSI5PK` = `EXT#{provider}#{externalId}`
  - `GSI5SK` = entity SK
  - **Use:** map Google event IDs, Claim.MD file IDs, Paddle subscription IDs

> Single‑table advantage: one hot partition per clinic, fast lookups by provider/patient, easy dashboards.  
> For solo mode, `clinicId = providerId`, but keep the field for future clinic support.

### 2.3 Entity Shapes (examples)

**Clinic (Tenant)**
```
PK: TENANT#{clinicId}
SK: TENANT#{clinicId}
entityType: "clinic"
name, timezone, address, phone, email, paddleSubscriptionId, status
```

**User (Doctor)**
```
PK: TENANT#{clinicId}
SK: USER#{userId}
entityType: "user"
roles: ["provider","admin"]
email, name, npi, taxonomy, signatureImageUrl
```

**Patient**
```
PK: TENANT#{clinicId}
SK: PATIENT#{patientId}
entityType: "patient"
GSI1PK: TYPE#patient
GSI1SK: clinicId#createdAt
name, dob, sex, phone, email, address, allergies, tags
```

**Appointment**
```
PK: TENANT#{clinicId}
SK: APPT#{yyyymmdd}#{appointmentId}
entityType: "appointment"
GSI2PK: PATIENT#{patientId}
GSI2SK: APPT#{startISO}
GSI3PK: PROVIDER#{providerId}
GSI3SK: APPT#{startISO}
status: "scheduled|checked_in|completed|no_show|cancelled"
startISO, endISO, timezone, patientId, providerId
source: "internal|google|ics"
googleEventId?, notes?
```

**Note (SOAP)**
```
PK: TENANT#{clinicId}
SK: NOTE#{noteId}
entityType: "note"
GSI2PK: PATIENT#{patientId}
GSI2SK: NOTE#{updatedAt}
appointmentId, providerId, version, lockedAt?
soap: { s, o, a, p }           // encrypted columns
attachments: [attachmentId]
```

**Attachment (Body Chart / Files)**
```
PK: TENANT#{clinicId}
SK: ATTACH#{attachmentId}
entityType: "attachment"
noteId, type: "body_chart"|"file"
vectorJson?          // for body chart
fileKey, mime, size, thumbnailKey?, exportKey?
```

**Invoice**
```
PK: TENANT#{clinicId}
SK: INVOICE#{invoiceId}
entityType: "invoice"
GSI2PK: PATIENT#{patientId}
GSI2SK: INVOICE#{createdAt}
GSI4PK: INVSTAT#{status}
GSI4SK: createdAt
status: draft|sent|pending|paid|failed|refunded
lines: [{code, description, qty, unitPrice}]
amountDue, amountPaid, currency
paymentProvider: "external"|"stripe"(later)
externalLinkUrl?, receiptUrl?
```

**Claim (837P)**
```
PK: TENANT#{clinicId}
SK: CLAIM#{claimId}
entityType: "claim"
GSI4PK: CLMSTAT#{status}      // queued|sent|accepted|rejected|paid
GSI4SK: dosStartISO
appointmentId, patientId, payerId, icd10:[], cpt:[{code,mod,units}]
ediFileId?, ackRefs: { ack999Id?, ack277Id? }, errors?
```

**Integration Credentials (BYO)**
```
PK: TENANT#{clinicId}
SK: INTEGRATION#twilio|sendgrid|claimmd
entityType: "integration"
encrypted: { accountSid, authToken } // KMS envelope
status: connected|error, lastTestAt
```

**OAuth (Google Calendar)**
```
PK: TENANT#{clinicId}
SK: OAUTH#google
entityType: "oauth"
encrypted: { accessToken, refreshToken, expiry }
calendarId, channelId, resourceId, watchExpiration
```

**AuditLog**
```
PK: TENANT#{clinicId}
SK: AUDIT#{timestamp}#{auditId}
entityType: "audit"
actorUserId, action, entityType, entityId, ip, userAgent
```

---

## 3) API (Express on Lambda) — Routes & Contracts

Base path: `/v1`

### Auth & Tenancy
- `POST /auth/login` (Cognito Hosted UI or custom email/password)  
- Use a `clinicId` claim in JWT; every route enforces `TENANT#{clinicId}` scoping.  
- Patient magic links use signed, single‑use tokens with **scoped access**.

### Patients
- `POST /patients` create
- `GET /patients?search=` list/search (GSI1)
- `GET /patients/:id` fetch
- `PATCH /patients/:id` update

### Appointments
- `POST /appointments` create (also write to Google if connected; free/busy check)
- `GET /appointments?from=&to=&providerId=` list (GSI3)
- `GET /appointments/:id`
- `PATCH /appointments/:id` reschedule/update
- `DELETE /appointments/:id` cancel (mirror to Google if internal event)

### Notes (SOAP) & Attachments
- `POST /notes` (appointmentId, patientId, soap)
- `GET /notes/:id`
- `PATCH /notes/:id` (update soap, autosave increments version)
- `POST /notes/:id/sign` (lock, addendum flow)
- `POST /notes/:id/attachments` (S3 pre‑signed POST; store metadata)
- `POST /notes/:id/bodychart/save` (store vector JSON; export on demand)
- `GET /notes/:id/pdf` (server‑side PDF render)

### Body Chart Export
- `POST /attachments/:id/export` (client sends dataURL → S3)
- or server render from vector JSON (optional Lambda)

### Invoices
- `POST /invoices` create
- `GET /invoices?status=` list (GSI4)
- `GET /invoices/:id`
- `PATCH /invoices/:id` (status, receiptUrl)
- `POST /invoices/:id/send` (email via doctor’s SendGrid + patient email)
- `POST /invoices/:id/mark-paid` (manual reconcile)

### Claims (Claim.MD)
- `POST /claims` create from appointment/invoice
- `GET /claims?status=&payerId=` list (GSI4)
- `GET /claims/:id`
- `POST /claims/:id/submit` (generate 837P, upload via SFTP/API)
- `GET /claims/:id/edi` (download generated file — internal/admin)
- (Phase 2) `POST /claims/:id/poll-ack` → update 999/277, errors

### Integrations
- `POST /integrations/twilio/connect` (store creds encrypted + test send)
- `POST /integrations/sendgrid/connect` (store key + test email)
- `POST /integrations/claimmd/connect` (store creds + test login)
- `GET /integrations` (status of each)

### Calendar (Google)
- `GET /oauth/google/start` → redirect URL
- `GET /oauth/google/callback` → store tokens under `OAUTH#google`
- `POST /calendar/watch` start watch channel
- `POST /webhooks/google` receive push notifications → delta fetch

### Billing (Paddle)
- `POST /webhooks/paddle` → activate/cancel doctor subscription
- `GET /billing/portal` (generate Paddle manage‑billing URL if available)

### Patient Magic Links
- `POST /patients/:id/magic-link` → email link to view invoices/prescriptions
- `GET /p/:token` → Next.js renders a narrow, read‑only view

### Audit
- Implicit logging middleware → writes `AUDIT#...` items for CRUD/events.

---

## 4) Frontend (Next.js App Router) — Pages & Routes

**Mobile‑first**; Tailwind + Framer Motion for lively interactions.

### Public
- `/` — Landing (hero, pricing $29, features, CTA → trial).  
  - Content: value prop, screenshots, compliance blurb, testimonials (later)
- `/signup` — Create account → redirect to Paddle checkout or trial start
- `/login` — Cognito Hosted UI or custom
- `/book/[doctorSlug]` — Public booking page (date/time picker, collects patient info)
- `/p/[token]` — Patient magic link view (upcoming appt, invoices list, prescription downloads)

### Authenticated (Doctor)
- `/dashboard` — **Today at a glance**: next appointments, tasks, KPIs
- `/calendar` — **RBC** Day/Week/Month (drag/drop, create, reschedule)
- `/appointments` — List + filters (status, date range)
- `/patients` — Directory (search, add)
- `/patients/[id]` — Patient profile (demographics, history tabs: Appointments, Notes, Invoices, Files)
- `/notes/[noteId]` — SOAP editor
  - Tabs: S | O | A | P; right panel: Templates, Smart Phrases, Attachments
  - Body‑chart modal: front/back silhouette, draw tools, export → attach
- `/invoices` — List + statuses; create/edit
- `/invoices/[id]` — Invoice detail (send, mark paid, receipt URL)
- `/claims` — Worklist by status; create from encounter; submit; view EDI
- `/settings` — Tabs:
  - **Profile** (signature, timezone, NPI)
  - **Integrations** (Twilio, SendGrid, Claim.MD, Google Calendar)
  - **Templates** (SOAP templates + smart phrases)
  - **Billing** (Paddle subscription details)
  - **Security** (API keys, sessions)
- `/help` — Docs, onboarding videos

**UI components to build:**
- Calendar (RBC wrapper), Appointment drawer, Patient form (react‑hook‑form + Zod), Notes editor, Body‑chart dialog, Invoice builder, Claim scrubber, Integration connect cards, KPI cards, Empty states.

**Mobile UX principles:**
- Sticky bottom action bar (Save, Create, Start Note)
- One‑handed reach: primary CTA bottom‑right
- Large tap targets, swipeable lists, pull‑to‑refresh
- Skeleton loaders, optimistic UI where safe

---

## 5) SOAP + Body‑Chart — Implementation Details

### SOAP Editor
- Data shape: `soap: { s: string, o: string, a: string, p: string }`
- Autosave with debounce (e.g., 800ms) → PATCH `/notes/:id`
- Versioning: store previous `soap` into a `NoteVersion` child record or keep diff in note item; simplest: copy old into `versions` array with max N
- **Sign & Lock:** set `lockedAt` + prevent edits; allow **Addendum** child that appends text

### Templates & Smart Phrases
- `Template` items (clinic‑scoped)
- Insert merges variables (`{{patient.name}}`, `{{vitals.bp}}` etc.); keep a simple replacer
- Smart phrases: client‑side map of `/shortcode → text`

### Body‑Chart (Konva)
- Load **SVG silhouette** (white fill, black stroke) as background layer (locked)
- Tools: pen (freehand), ellipse, arrow, text, pin
- Keep a `vectorJson` state; on save, store in `Attachment`
- **Export:** `stage.toDataURL({pixelRatio: 2})` → POST to `/attachments` (S3 pre‑signed PUT)

### PDF Export (Full Note)
- Server renders HTML template (note header, SOAP content, thumbnails of body‑charts)
- `puppeteer-core` + chromium for Lambda; stream PDF to S3; return signed URL

---

## 6) Calendars & Reminders

### Google Calendar
- OAuth Standard flow; store tokens encrypted
- Start **watch channel** on selected calendar
- On webhook: delta fetch with `syncToken`; upsert appointments (mark `source="google"`)
- **Read‑only guard**: prevent editing events with `source !== 'internal'`
- Free/busy check before create; if busy → prompt

### Reminders
- Doctor config: default reminders (e.g., 24h & 2h before)
- EventBridge schedule (every 5 min) → pick appointments within send windows
- Send via **doctor’s** Twilio/SendGrid credentials; log success/failure

---

## 7) Claims (Claim.MD) — MVP

- Claim composer maps Appointment/Invoice → 837P (professional)
- Validate required segments (NPI, TaxID, payerId, ICD10, CPT, place of service, dx pointers)
- Generate EDI file → store in S3 → upload via Claim.MD SFTP/API using **doctor’s** creds
- Store `ediFileId` on `Claim` item; set status `sent`
- (Phase 2) Poll 999/277 → update status; show errors in “Exceptions” inbox

---

## 8) Billing

### Your SaaS (Paddle)
- Pricing: $29/mo, $290/yr
- Webhook: subscription created/cancelled → update `Clinic.status` & entitlement flags
- In app: “Manage Billing” opens Paddle portal (if enabled)

### Patient Payments (MVP)
- Invoice has a **Payment Link** field (doctor pastes Stripe/Square/PayPal link they created)
- Button → opens link in new tab
- Manual **Mark Paid** + optional `receiptUrl`

> Later: add Stripe Connect provider behind feature flag.

---

## 9) Security & HIPAA Posture (MVP‑sane)

- KMS encryption at rest; encrypt PHI fields in DynamoDB (application‑level AES‑GCM envelope)
- S3 objects private; access via time‑limited signed URLs
- AuditLog on all PHI reads/writes with user, IP, UA
- Strict tenancy (all queries must include `TENANT#{clinicId}`)
- No card data handled (Paddle handles your billing; patients pay doctors via their own links)
- Redact PHI in logs; separate analytics from PHI
- Backups: PITR on DynamoDB; S3 versioning
- Access: IAM least privilege roles for Lambdas; VPC not required (DDB/S3 over endpoints optional)

---

## 10) Deployment (AWS CDK Outline)

- **DynamoDB** table `medeez_app` with GSIs 1..5, PITR ON
- **S3** buckets: `attachments`, `exports`, `static`
- **KMS** CMK for app‑level encryption keys
- **Cognito** user pool + domain; app client for web
- **API Gateway** + Lambda for Express (Node 20); `serverless-http` adapter
- **EventBridge** rules for reminder worker & cleanup jobs
- **CloudFront** distribution for Next.js static; **Amplify Hosting** for SSR app
- **Route53** records for root + `book.` subdomain
- **Secrets Manager / SSM** for third‑party keys

CI/CD:
- GitHub Actions → build + deploy CDK; build Next.js; invalidate CloudFront

---

## 11) Page Content Details (what Claude should scaffold)

### `/dashboard`
- KPIs: Today’s appts (#), No‑shows this week, Invoices due, Claims pending
- Cards with lively micro‑animations (Framer Motion)
- Quick actions: New appt, New patient, Start note

### `/calendar`
- React Big Calendar with Day/Week/Month; drag to create; resize
- Appointment drawer: patient picker (or quick‑create), reason, reminder toggles

### `/patients`
- Search + filters (tagged allergies), add patient modal (RHForm + Zod)
- Mobile: list with swipe to call/SMS; desktop: table with actions

### `/patients/[id]`
- Header with name/age/sex/contact; tabs: **Timeline, Notes, Invoices, Files**
- Timeline merges appts + notes + invoices (query GSI2)

### `/notes/[noteId]`
- Tabs S/O/A/P; right panel with Templates & Smart phrases
- Body‑chart button → opens Konva modal (front/back toggle, tools)
- Save / Sign & Lock; PDF export

### `/invoices` & `/invoices/[id]`
- Builder: add line items; taxes; notes
- Payment link field; Send via email (doctor’s SendGrid)
- Status badge; Mark Paid; attach receipt URL

### `/claims`
- Grid by status; Claim editor (patient/ins/payer/codes)
- Submit button → generates EDI, uploads; show file id

### `/settings`
- **Profile:** NPI, timezone, signature upload
- **Integrations:** Connect cards (Twilio test SMS; SendGrid test email; Claim.MD test login; Google connect & watch)
- **Templates:** CRUD SOAP templates + smart phrases
- **Billing:** Paddle subscription info
- **Security:** active sessions, API keys (future)

### `/book/[doctorSlug]` (Public)
- Brand header, doctor photo/name, short blurb
- Date/time picker → collects name, mobile, email → creates appt
- Confirmation screen; email/SMS via doctor’s BYO provider

### `/p/[token]` (Patient magic link)
- Shows appointment details + “Add to Calendar”
- Invoices list with “Pay Now” (opens doctor’s payment link)
- Prescriptions list with downloads

---

## 12) Sample Component/API Contracts (brief)

**Appointment**
```ts
type Appointment = {
  id: string; clinicId: string; providerId: string; patientId: string;
  startISO: string; endISO: string; timezone: string;
  status: 'scheduled'|'checked_in'|'completed'|'no_show'|'cancelled';
  source: 'internal'|'google'|'ics';
  notes?: string;
}
```

**Note (SOAP)**
```ts
type Note = {
  id: string; clinicId: string; patientId: string; appointmentId: string;
  providerId: string; version: number; lockedAt?: string|null;
  soap: { s: string; o: string; a: string; p: string };
  attachments: string[];
}
```

**Invoice**
```ts
type Invoice = {
  id: string; clinicId: string; patientId: string;
  status: 'draft'|'sent'|'pending'|'paid'|'failed'|'refunded';
  lines: { code?: string; description: string; qty: number; unitPrice: number; }[];
  amountDue: number; amountPaid: number; currency: 'USD';
  paymentProvider: 'external'|'stripe'; externalLinkUrl?: string; receiptUrl?: string;
}
```

---

## 13) Testing & QA

- Unit: utility mappers (Google → internal), 837P builder, validators
- Integration: API routes with DynamoDB local + S3 mock
- E2E: Cypress/Playwright for critical flows (create appt → reminder, SOAP → PDF, invoice → emailed)
- Load: calendar list for month view; ensure queries are paginated + indexed

---

## 14) Performance & Cost Tips

- DynamoDB On‑Demand to start; add **LSI** later only if proven necessary
- Avoid N+1 queries: batch `GetItem` with keys, project only needed attributes
- Cache OAuth tokens in memory with TTL in Lambda (per‑invocation) and refresh sparingly
- Use pre‑signed S3 uploads from client to keep API lean
- PDF rendering: queue heavy jobs; show toast + notify when ready

---

## 15) Roadmap Flags (Feature Toggles)

- `FEATURE_STRIPE_CONNECT=false` (enable later)
- `FEATURE_PATIENT_PORTAL=false` (use magic links in MVP)
- `FEATURE_ERA_AUTOPOST=false` (claims v2)
- `FEATURE_TELEHEALTH=false` (later BYO Zoom/Meet)

---

## 16) Prompts for Claude (copy/paste)

- “Generate a Next.js App Router page `/calendar` using React Big Calendar with Tailwind styling, mobile‑first, and an appointment drawer form (react‑hook‑form). Connect to `/v1/appointments` endpoints with React Query.”
- “Implement an Express route `POST /v1/notes/:id/bodychart/save` that stores Konva vector JSON as an Attachment item in DynamoDB and returns an S3 pre‑signed URL for PNG export.”
- “Write a DynamoDB query for GSI3 to fetch all appointments for provider X between date A and B (inclusive), paginated, sorted by startISO.”
- “Create a serverless‑http Express wrapper suitable for API Gateway, with CORS for `*.medeez.com` and JWT (Cognito) middleware injecting `clinicId` into `req.context`.”
- “Implement a Lambda that runs every 5 minutes, finds appointments needing reminders in the next 2 hours, and sends SMS via stored Twilio credentials.”

---

## 17) Done = Looks & Feels “Complete”

- App loads fast on mobile, animated cards, skeletons
- Calendar drag‑drop works; free/busy prevents conflicts
- SOAP editor with autosave + sign/lock + templates + body‑chart
- Invoices email out with a clean PDF; payment link opens
- Claim 837P file generates & uploads; status shows “Sent”
- Integrations page: green checks for connected providers
- Dashboard KPIs reflect real data via GSIs

---

**Now hand this to Claude and start scaffolding. You’ll have a real MVP in ~2–3 weeks of focused work.**
