// HTTP API for the app: start ID checks, submit documents, Stripe webhook, broker confirmation, admin review queue.
import express from 'express';
import { createDb } from './db.js';
import { downloadAircraft, AircraftIndex } from './faa/aircraft.js';
import { AirmenIndex } from './faa/airmen.js';
import { createIdentitySession, constructEvent, handleIdentityEvent } from './verify/identity.js';
import { verifyDocument, confirmBroker } from './verify/pipeline.js';
import { adminRouter } from './admin.js';

const db = createDb();
const deps = { db, airmen: null, aircraft: null, baseUrl: process.env.BASE_URL || '' };

// Load FAA indexes from a local cache dir (populated by the sync jobs) or download aircraft on boot.
if (process.env.FAA_AIRMEN_DIR) deps.airmen = AirmenIndex.fromDir(process.env.FAA_AIRMEN_DIR);
if (process.env.FAA_AIRCRAFT_DIR) deps.aircraft = AircraftIndex.fromDir(process.env.FAA_AIRCRAFT_DIR);
else downloadAircraft().then((a) => (deps.aircraft = a)).catch((e) => console.error('Aircraft registry not loaded:', e.message));

const app = express();

// Stripe needs the raw body to verify the signature.
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const event = await constructEvent(req.body, req.headers['stripe-signature']);
    const doc = await handleIdentityEvent(event);
    if (doc) {
      db.saveDoc({ subjectId: doc.userId, subjectKind: 'user', ...doc });
      if (doc.status === 'approved') db.upsertUser({ id: doc.userId, legalName: doc.fields.name });
    }
    res.json({ received: true });
  } catch (e) {
    res.status(400).send(`Webhook error: ${e.message}`);
  }
});

app.use(express.json({ limit: '15mb' }));

// TODO: replace with your real auth middleware.
const auth = (req, res, next) => {
  req.userId = req.header('x-user-id');
  if (!req.userId) return res.status(401).json({ error: 'auth required' });
  next();
};

app.post('/api/identity/session', auth, async (req, res) => res.json(await createIdentitySession(req.userId)));

// body: { type, listingId?, file?: { base64, mediaType }, corrections? }
app.post('/api/verify/:type', auth, async (req, res) => {
  try {
    const doc = await verifyDocument(deps, { ...req.body, type: req.params.type, userId: req.userId });
    res.json({ status: doc.status, checks: doc.checks, reasons: doc.reasons, fields: doc.fields, expires: doc.expires });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/verify/status', auth, (req, res) => {
  res.json(db.listCurrentDocs().filter((d) => d.userId === req.userId).map(({ type, status, expires, subjectId }) => ({ type, status, expires, subjectId })));
});

app.get('/broker/confirm/:token', (req, res) => {
  const doc = confirmBroker(db, req.params.token);
  res.type('html').send(doc ? '<h2>Thank you — insurance confirmed.</h2>' : '<h2>This link has expired or was already used.</h2>');
});

// Admin console API (see src/admin.js). Includes CORS for the admin web app.
app.use('/api/admin', adminRouter(deps));

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`Positive Rate verification API on :${port}`));
