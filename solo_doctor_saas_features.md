
# Solo Doctor SaaS - Feature List

## Core MVP Features

### 1. Appointments & Scheduling
- Online booking page (link/QR) for patients
- Calendar view (day/week/month)
- Google/Outlook 2-way sync (covers Zocdoc/Practo via iCal)
- Appointment reminders (SMS/email via BYO Twilio/SendGrid)
- No-show + reschedule tracking

### 2. Patient Management
- Patient directory (demographics, contact info, DOB, allergies)
- Searchable history (visits, invoices, notes)
- Encrypted PHI storage
- HIPAA-ready audit logs

### 3. Clinical Notes (SOAP)
- Structured SOAP editor (S, O, A, P sections)
- Templates + smart phrases (e.g., /normal-pe)
- Autosave + version history
- Sign & lock notes (with addendum support)
- File attachments (PDF, images)

### 4. Body Chart Annotation
- Front/back body silhouette (white fill + black outline)
- Drawing tools: pen, pin, text label, shapes
- Undo/redo, zoom
- Save vector JSON + export PNG/PDF
- Attach to SOAP notes

### 5. Billing & Invoices
- Create invoices (services, fees, taxes)
- Add patient details
- "Pay Now" button with external payment link (BYO Stripe/Square/PayPal)
- Manual "Mark Paid" option + receipt upload
- PDF export/download

### 6. Claims (Insurance)
- Claim.MD integration (BYO credentials)
- Generate 837P claim files from appointments/invoices
- Upload claims to Claim.MD
- (Phase 2) Fetch claim status/ERA

### 7. Prescriptions
- Generate prescription PDFs
- Save to patient record + email/WhatsApp delivery
- Signature field (typed or uploaded)

### 8. Dashboard
- Today's schedule overview
- Patient flow tracking (upcoming, in-progress, completed)
- Quick metrics: appointments this week, revenue, pending claims

---

## Phase 2 - Growth Features

- Telehealth (BYO Zoom/Google Meet links per appointment)
- e-Prescribing via 3rd party (DoseSpot, DrFirst - BYO)
- SMS bundles upsell (if Twilio reselling added)
- Patient portal (login → view invoices, prescriptions, appointments)
- Multi-doctor / clinic support ($99+/mo plan)
- Small clinic roles (front desk, staff logins, provider dashboards)

---

## Future Roadmap (Phase 3+)
- Inventory, expenses, payroll
- Advanced analytics & reporting
- Integrations (QuickBooks, pharmacy APIs, labs)
- Secure patient messaging
- Voice dictation for notes
- ICD-10 / CPT coding integration
