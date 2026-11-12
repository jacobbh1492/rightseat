# Positive Rate admin console

Browser-based back office for the Positive Rate team. React + Vite.

## Run it
```
npm install
npm run dev            # http://localhost:5173
npm run build          # static site in dist/ → deploy to Vercel, Netlify, S3, etc.
npm run build:single   # one self-contained index.html (used for the preview)
```

## Pages
- **Overview:** lessons flown, bookings, revenue and take rate, rebooking rate, users, aircraft; weekly charts (hover + table view); "Needs attention" list; recent admin activity.
- **Bookings:** search/filter; booking detail with money split and timeline; cancel; refunds (Support role capped at $250).
- **Payments & payouts:** charges with the instructor / owner / Positive Rate split, payouts, refunds.
- **Disputes:** full refund, partial refund or deny; payouts held until resolved.
- **Users:** students, CFIs, owners, schools; profile, spend/earnings, bookings, internal notes; suspend/reinstate.
  - **New account:** create a CFI (rates, certificates, specialties, bio), flight school (school details, plan, instructor terms + admin contact) or plane owner.
  - **Edit details:** change name, email, phone, home airport, CFI rates/profile, school details and terms, and aircraft rates/airport for owners and schools.
- **Aircraft listings:** 100-hr, insurance, squawks, status; pause/resume.
- **Verification queue:** only what automation couldn't approve; extracted fields, every check and its source; approve / re-upload / reject.
- **Reviews:** reported reviews; keep or hide.
- **Trust & safety:** flagged messages (contact info, off-app payment), leakage watchlist, rebooking rate.
- **Automation:** scheduled jobs (run now) and upcoming expirations with reminder status.
- **Settings & team:** fees and pricing, verification rules, team members and roles, data source (demo / live server), searchable audit log.

## Roles
| Role | Can do |
|---|---|
| Owner | Everything, including fees, rules and the team |
| Admin | All operations, including creating and editing accounts; not fees or team |
| Reviewer | Verification, reviews, trust & safety, automation, listings |
| Support | Users (including creating and editing accounts), bookings, payments, disputes, reviews; refunds up to $250 |

Every action requires a reason and is written to the audit log.

## Live data
Settings & team → Data source → Live server, enter the server URL and `ADMIN_KEY`.
Live today: verification queue and decisions, users and suspensions, listings pause/resume, settings, jobs, audit log (server `src/admin.js`).
Bookings, payments, disputes and reviews use demo data until the booking backend exists.

## Live accounts (create / edit CFIs, schools, owners)
Settings & team → Data source → **Accounts: live Positive Rate data**. Sign in with an app account on the admin team (6-digit email code, same as the app). The Users page then shows real CFIs, schools and owners, and New account / Edit details write to Supabase through the `admin-accounts` Edge Function.
- Who's on the admin team: `profiles.is_staff = true`, or an email listed in the `ADMIN_STAFF_EMAILS` function secret (comma-separated; default `admin@positiverateflying.com`). The address must have signed in to the app once.
- New accounts are created already confirmed; the person signs in to the app with that email. If the email already has an account, the role is added to it.
- Every create/edit needs a reason and is written to `audit_log` with the staff member's id.
- Aircraft tail/make/model and verification/publish status aren't editable here (they come from FAA and verification checks).

## Before launch
- Replace the shared admin key and demo sign-in with SSO (Google Workspace / Okta) + required 2-step verification, and per-member roles checked on the server.
- Set `ADMIN_ORIGIN` on the server to the console's URL (CORS).
- Host the console on its own subdomain (e.g. admin.yourdomain.com), behind SSO.
