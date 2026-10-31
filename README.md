# RightSeat — find a CFI and a plane

Cross-platform (iPhone + Android) app built with React Native + Expo.

## Run it on your phone
1. Install Node.js (v20+) on your computer.
2. In this folder: `npm install` then `npx expo start`
3. Install **Expo Go** from the App Store / Google Play and scan the QR code.

## What's in it
- **Explore** – three modes: *CFI + Plane* (combined cost per flight hour), *CFIs*, *Planes*; filters for airport, training goal, price, glass cockpit, IFR, solo rental.
- **CFI profile** – hours, dual given, 1st-time pass rate, checkrides sent, students soloed, flight/ground/discovery pricing, packages, planes they fly (with combined price), specialties, availability, teaching style, reviews.
- **Plane listing** – wet/dry/block rates, avionics, specs, engine time vs TBO, renter/insurance requirements, CFIs who fly it.
- **Book a flight** – pick CFI + plane (or your own plane / solo rental), goal, date, hours, live cost estimate.
- **Account** – create/edit CFI profile, list a plane, link your plane to your profile.

## Keeping bookings on the platform
- **Fees:** 6% student booking fee only on the first lesson with a new CFI; $0 on every repeat lesson. CFI 5% host fee on new students only (0% on CFI Pro). Owners 8%. Renters pay $9/hr rental protection.
- **Wallet:** prepaid training balance with bonus credit; wallet bookings get aircraft block rates and no card fees.
- **Training record:** FAA 61.109 minimums, syllabus progress, endorsements (with expiry), and cost-to-checkride. Updates automatically at close-out.
- **Scheduling:** live CFI + aircraft calendars with time slots; free weather cancellations; late-cancel fee (<24 hr) paid to the CFI.
- **Billing:** CFI or owner closes out with Hobbs in/out. That one step bills, updates the training record and Hobbs/100-hr, logs squawks, and pays everyone (receipt shows the split).
- **Owner protection:** pre-booking checks (ID, certificate, medical, solo endorsement, checkout, insurance minimums, 100-hr, grounding squawks); $500 deposit hold on solo rentals; 100-hr countdown and squawk list.
- **CFI tools:** earnings, standard or instant payouts, guaranteed late-cancel pay, students' progress, weekly calendar; ranking rewards hours flown and verified reviews on RightSeat.
- **Messaging:** in-app chat; phone numbers and emails are hidden until the first booking; off-app payment talk gets a gentle nudge and is counted.
- **Disputes:** only for app bookings.
- **Founder metrics:** student–CFI rebooking rate, leakage watchlist, booking volume, take rate.

## Previous experience
- **Students add their history** (Training tab → "Add previous experience", or from the booking screen on a first lesson with a new CFI). 5 steps: background (program, where they trained, last flight, solo), hours (snap logbook pages or import a ForeFlight/MyFlightbook/LogTen/Garmin Pilot CSV, or type totals, with sanity checks), lessons covered (Done / Rusty / Not yet per syllabus item), endorsements and tests (date + signer, photos), then review & share with chosen CFIs.
- **Quick updates:** tap any syllabus lesson on the Training tab to mark it "Done before", "Done, but rusty" or "Not yet".
- **Self-reported until confirmed:** previous hours count toward FAA minimums, progress and the cost projection right away, shown in a lighter color and labeled "self-reported". The CFI gets a "shared previous experience" card on their dashboard, checks the logbook, marks each lesson Confirmed or Needs work, and confirms. Rusty or needs-work items go back on the plan and show up in the CFI's close-out checklist for sign-off.
- Booking with a new CFI suggests an **assessment flight** first.

## Debriefs
- **CFI writes it at close-out** (or later from "Debrief due" on their dashboard): grade each maneuver (Introduced / Needs practice / Solid / Checkride standard), what went well, what needs work, plan for next lesson, and homework. Items flagged in earlier debriefs are suggested automatically (↺) so weak areas get re-checked.
- **Student reviews it:** from the Training tab, the lesson card or the receipt. They tick off homework, add notes or questions (visible to the CFI), message the CFI, and mark it reviewed.
- **Locked record:** a debrief locks when the student marks it reviewed, or 7 days after the flight, whichever comes first. Before that the CFI can edit it (shown as "Edited <date>"). After that the original never changes: the CFI adds dated, signed amendments (Correction / Clarification / Added detail), optionally changing a grade. Amendments show below the original, amended grades show the original value, and the student is notified ("Amended · new") until they mark it read. When the backend is built, enforce the lock on the server too.
- **History & focus areas:** all debriefs by date and instructor, plus "recurring focus areas", meaning maneuvers flagged across multiple debriefs.
- **Changing CFIs:** the record belongs to the student. Booking a new CFI offers "Share my training record & debriefs". The new CFI sees a Student file: hours, progress, endorsements, where they left off (last plan + what they were working on), recurring focus areas and every past debrief. Students control who can see it, can turn debrief sharing off, and can preview exactly what a CFI sees.

## Verification
- **Verification center (Account):** every required document for pilots, instructors and aircraft, with live status (Verified · auto, In review, Needs attention, Expires in N days).
- **Upload screens:** one per document. ID + selfie (Stripe Identity), FAA registry lookups (certificates, N-number), photo/PDF upload read by Document AI with a "confirm what we read" step, consent for background checks. Checks run live and the result is shown: approved automatically, sent to review, or rejected with what to fix.
- **Admin review queue:** only items automation couldn't approve, with the document, extracted fields, every check and its source, note templates, and approve / re-upload / reject.
- **Automation monitor:** FAA sync jobs, upcoming expirations with 30/14/3-day reminders, auto-paused listings.
- **Badges:** "Verified by RightSeat" on CFI profiles and aircraft listings. Booking is blocked if an aircraft's registration/insurance or a solo renter's medical isn't verified.
- In the app, document reading and lookups are simulated (use the DEMO scenario chips). The real automation is in `/server`; see `server/README.md`.

## Design
- **Welcome & setup:** what brings you here (learn, rent, teach, list a plane, run a school), where you are in training, and your home airport. The app personalizes from this: Explore's default view and sorting, a discovery-flight suggestion for brand-new pilots, and which sections appear in Account. "Skip, just browse" turns everything on.
- **Explore:** greeting and home-airport switcher, one search bar, a filter sheet with a live result count, removable filter chips, simple tabs (CFI + Plane / Instructors / Planes / Schools), "Up next" lesson card, best-match or lowest-price sort (home airport first), and photo-first plane cards.
- **Account:** profile header with verification status, wallet card, and sections grouped by role (Flying, Teaching, Aircraft, Flight school, RightSeat team). Unused roles can be turned on with one tap.
- **Booking:** numbered steps that check off as you go, a short goal list with "More…", a one-line safety check summary (failed checks expand automatically), and a big estimated total with optional breakdown.
- **Throughout:** a custom SVG icon set (`src/icons.js`, no font files), icon tab bar with badges (new debriefs, pending lessons), 44pt+ touch targets, accessibility labels and roles on interactive elements, bottom sheets (`Sheet`), list rows (`ListRow`), and tabs (`Tabs`) in `src/ui.js`.

## Flight schools & their instructors
- **Linking:** an instructor requests to join a school (Account → Flight school), or the school invites them (School dashboard → Instructors → Invite). The other side must accept, and nobody is linked without consent. Schools building their page send invites rather than linking directly.
- **Two arrangements, both paid out automatically through Stripe Connect on every lesson:**
  - *Revenue share (contractors):* the instructor sets their own rate (at or above the school's minimum). The school's share of instruction is agreed, and changes need the instructor to accept.
  - *Employee:* the school sets the instructor's rate and the split. Changes apply to new bookings, and the instructor is notified. The rate is locked on the instructor's own profile.
- **Split math:** instruction + ground, minus RightSeat's CFI host fee (first lesson with a new student only), multiplied by the school share to the school. The rest goes to the instructor. Aircraft rental still goes to the plane's owner (the school, if it owns the plane). Students pay the same price, and their receipt shows the school's share.
- **School dashboard:** earnings this month, upcoming share, a schedule of every lesson with its instructors or in its aircraft (filter by instructor, school share per lesson), an instructor roster with arrangement, rate (school-set for employees), this week's lessons and share, change terms or remove, join requests to review (with a verified-credentials summary and a live split example), and standard terms (arrangement, share, minimum rate, notice period).
- **Leaving:** either side can end it after the school's notice period. Lessons already booked keep the split they were booked under.

## Admin console (`admin/`)
Browser-based back office: overview, bookings, payments, disputes, users, listings, verification queue, reviews, trust & safety, automation, settings, team roles and an audit log. Runs on demo data or against the server's `/api/admin` endpoints. See `admin/README.md`.

## Code map
- `App.js` – tabs + screen stack
- `src/data.js` – sample data (fictional)
- `src/debrief.js` – debrief structure, grades, quick-picks, focus-area analysis
- `src/progress.js` – combines RightSeat-logged and previous experience (lesson states, hours, endorsements)
- `src/verification.js` – document types, checks, decision rules (app-side simulation)
- `src/logic.js` – fees, quotes, safety checks, scheduling, message guardrails, ranking, metrics
- `src/store.js` – app state and actions (booking, close-out, wallet, messages, payouts)
- `src/ui.js` – shared components
- `src/screens/` – Explore, Details (CFI/plane/school), Booking (request, lessons, cancel, close-out, receipt, reviews), Training, Inbox (chat + wallet), Dashboards (CFI, owner, plans, credentials, metrics), Me (account + forms)

## Next steps for production
Backend + accounts (e.g. Supabase/Firebase), photo uploads, payments (Stripe Connect for CFI/owner payouts), messaging, calendar sync, CFI certificate verification, then build with `eas build` and submit to the App Store / Play Store.
