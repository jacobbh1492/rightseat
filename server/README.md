# RightSeat verification server

Automates checking credentials, insurance and aircraft documents. Clean documents are approved in seconds with no human involved. Anything unclear goes to a short review queue.

## What's automated

| Document | How it's checked automatically | When a human looks |
|---|---|---|
| Government ID | Stripe Identity: ID authenticity + live selfie match (webhook) | Stripe can't verify |
| Pilot / CFI certificate | FAA Airmen Registry match on verified name + city/state; CFI ratings from type "F" records | Multiple FAA records share the name |
| Medical / BasicMed | AI reads the photo; name vs ID; expiry; class cross-checked with FAA (informational) | Low read confidence, limitations, name variation |
| Renter / instructor insurance | AI reads declarations page; name, dates, limits vs minimums | Low confidence, damage limit below suggested |
| Aircraft registration | FAA Aircraft Registry by N-number: status, expiry, make/model, serial, owner | Registered owner ≠ lister (LLC, trust, leaseback) |
| Airworthiness certificate | AI reads serial; matched to FAA registry | Serial mismatch |
| Aircraft insurance (COI) | AI reads COI; tail, approved use, limits, additional insured, expiry; then **broker emailed a one-click confirm link** | Additional insured missing |
| Annual / 100-hr | AI reads logbook entry; mechanic found in FAA registry; 12-calendar-month rule; 100-hr sets next-due Hobbs | No IA card on file (IA is **not** in public FAA data) |

Rules for every decision live in `src/verify/rules.js`:
- **Any hard fail** (expired, wrong use, not in the FAA registry): rejected. The user fixes it and re-uploads.
- **Any warning, AI confidence under 90%, or a field the user corrected**: goes to the human review queue.
- **Otherwise**: approved automatically.

## Scheduled jobs (`npm run jobs`)

| Job | Schedule | What it does |
|---|---|---|
| FAA aircraft sync | Nightly 12:15 AM Central (FAA refreshes 11:30 PM) | Re-checks every listing; pauses on deregistration, invalid/expired registration, ownership change |
| FAA airmen sync | Monthly (3rd) | Re-checks pilot/CFI certificates; updates ratings; re-queues anything that no longer matches |
| Expiration sweep | Daily 6 AM ET | Reminders at 30/14/3 days; on expiry marks expired and pauses listings |
| Broker reminders | Daily 10 AM ET | Re-sends confirm links every 3 days until the broker clicks |

Run any job once: `npm run sync:aircraft`, `npm run sync:airmen`, `npm run sweep`.

## API (`npm start`)

- `POST /api/identity/session`: create a Stripe Identity session; the app opens it with `client_secret`
- `POST /webhooks/stripe`: receives `identity.verification_session.verified` / `requires_input`
- `POST /api/verify/:type`: `{ listingId?, file?: { base64, mediaType }, corrections? }`; returns status, checks and reasons
- `GET /api/verify/status`: the current user's documents and expiry dates
- `GET /broker/confirm/:token`: one-click broker confirmation (single-use, 14-day expiry)
- `GET /api/admin/queue`, `POST /api/admin/queue/:id` `{ decision: approved|rejected|reupload, note }`

## Setup

```
npm install
npm test            # 17 tests against FAA-format fixtures
```

Environment:
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`: Stripe Identity
- `ANTHROPIC_API_KEY` (optional `EXTRACT_MODEL`): AI document reading
- `FAA_AIRMEN_ZIP_URL`: the CSV ZIP link from the FAA releasable airmen download page (published monthly)
- `FAA_AIRMEN_DIR` / `FAA_AIRCRAFT_DIR`: optional local cache of unzipped FAA files
- `POSTMARK_TOKEN`, `EMAIL_FROM`: email (prints to console if unset)
- `BASE_URL`: public URL for broker confirm links
- `ADMIN_KEY`: admin queue access

## Before launch

- Replace `src/db.js` (JSON file) with Postgres, and the `x-user-id` header with real auth.
- Store uploads encrypted (e.g. S3 with KMS). Keep medical images only as long as needed: keep the extracted fields and delete the image after approval.
- Background checks: use a provider (e.g. Checkr) and follow its consent and adverse-action flow. Don't build that yourself.
- "Verified" means the documents were checked and are current. It is not a guarantee of skill or airworthiness. Say so in your terms, and have an aviation attorney review them.
