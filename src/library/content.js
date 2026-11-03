// Learning Library content: one pre-flight study lesson per Private, Commercial,
// Instrument and Multi-Engine task, written from FAA sources only (Airplane Flying
// Handbook FAA-H-8083-3C, PHAK FAA-H-8083-25C, Instrument Flying Handbook FAA-H-8083-15B,
// Instrument Procedures Handbook FAA-H-8083-16B, Flying Light Twins Safely FAA-P-8740-66,
// the AIM, 14 CFR 91, and the ACS: FAA-S-ACS-6C, 7B and 8C). Fact-checked Nov 2, 2026.
//
// Each lesson: pvt = Private ACS standards (or Instrument ACS when kind is "ir"),
// com = Commercial ACS standards. DIAG[id]() returns the diagram as SVG path layers
// (viewBox 0 0 320 170) that src/library/Diagram.js draws.
/* eslint-disable */
const G = "M10 130 H310";
const AFH = "Airplane Flying Handbook", AFHc = "FAA-H-8083-3C";
const PHK = "Pilot's Handbook of Aeronautical Knowledge", PHKc = "FAA-H-8083-25C";
const A6 = "Ch. 6 — Takeoffs and Departure Climbs", A5 = "Ch. 5 — Maintaining Aircraft Control (slow flight, stalls, spins)",
      A7 = "Ch. 7 — Ground Reference Maneuvers", A9 = "Ch. 9 — Approaches and Landings",
      A10 = "Ch. 10 — Performance Maneuvers", A18 = "Ch. 18 — Emergency Procedures";
const P5 = "Ch. 5 — Aerodynamics of Flight", P11 = "Ch. 11 — Aircraft Performance", P14 = "Ch. 14 — Airport Operations";
const IFH = ["Instrument Flying Handbook", "FAA-H-8083-15B"], IPH = ["Instrument Procedures Handbook", "FAA-H-8083-16B"],
      AIM = ["Aeronautical Information Manual", "FAA AIM"], AFHr = ["Airplane Flying Handbook", "FAA-H-8083-3C"],
      FLT = ["Flying Light Twins Safely", "FAA-P-8740-66"], CFR = ["14 CFR Part 91", "FAA regulations"];
const A13 = "Ch. 13 — Transition to Multiengine Airplanes";
const G2 = "M10 130 H310", MDA = "M10 130 H310 M10 95 H310";

const LESSONS = {
"normal-takeoff": {
  area: "Takeoffs & Landings", title: "Normal & Crosswind Takeoff and Climb", min: 3, acsP: "PA.IV.A", acsC: "CA.IV.A",
  view: "Side view", alt: "Takeoff roll along the runway, then a steady climb", ref: G, track: "M20 128 L130 128 Q170 128 300 40",
  cap: "Roll on centerline, rotate at Vr, then hold the Vy climb attitude.",
  why: "Every flight starts here. A clean takeoff is about directional control on the ground and a steady, on-speed climb. With a crosswind, the job is to keep the airplane from drifting while it is still on the runway.",
  setup: ["Before-takeoff checklist", "Check wind direction", "Vr and Vy from your POH"],
  steps: [
    "Line up on the centerline. With a crosswind, start with full aileron into the wind.",
    "Smoothly add full power. Check engine gauges and confirm the airspeed is alive.",
    "Hold the centerline with rudder. Ease the aileron input off as speed and control effectiveness build.",
    "Rotate at the recommended speed and lift off smoothly.",
    "Pitch for Vy. In a crosswind, crab into the wind to track the extended centerline.",
    "Hold right rudder against left-turning tendencies and climb to a safe maneuvering altitude.",
    "Complete the after-takeoff checklist."
  ],
  pvt: [["Climb airspeed", "Vy +10/−5 kt"], ["Rotation", "At recommended airspeed"], ["Ground track", "Centerline / extended centerline"]],
  com: [["Climb airspeed", "Vy ±5 kt"], ["Rotation", "At recommended airspeed"], ["Ground track", "Centerline / extended centerline"]],
  errors: ["Too little crosswind aileron early in the takeoff roll", "Drifting off the extended centerline after liftoff", "Pitching well above the Vy attitude", "Not enough right rudder in the climb"],
  qc: [{q: "During a crosswind takeoff roll, how do you hold the ailerons?", a: "Full into the wind at the start, then reduce the input as airspeed and control effectiveness increase."},
       {q: "What does Vy give you?", a: "Best rate of climb: the most altitude gained in a given amount of time."}],
  afh: A6, phak: P11
},
"normal-landing": {
  area: "Takeoffs & Landings", title: "Normal & Crosswind Approach and Landing", min: 4, acsP: "PA.IV.B", acsC: "CA.IV.B",
  view: "Side view", alt: "Stabilized descent to a flare and touchdown at a marked point", ref: G + " M210 122 V138", track: "M20 30 L195 116 Q212 126 235 128 L300 128",
  cap: "A stabilized glidepath, a smooth flare, and touchdown at or just past your point.",
  why: "Good landings come from good approaches. Get stabilized early on speed, configuration and glidepath, so the flare and touchdown are small, predictable corrections. In a crosswind, no side drift at touchdown.",
  setup: ["Before-landing checklist", "Pick a touchdown point", "Approach speed from POH"],
  steps: [
    "Abeam your touchdown point on downwind, reduce power, add flaps as appropriate and begin the descent.",
    "On base, adjust power, pitch and flaps to manage airspeed and glidepath.",
    "On final, fly a stabilized approach at the recommended approach speed (or not more than 1.3 Vso if none is published).",
    "Crosswind: lower the upwind wing to stop drift and use opposite rudder to keep the nose aligned with the runway (wing-low method).",
    "Round out and flare, touching down on the main wheels with no side drift.",
    "After touchdown, keep the centerline and increase aileron into the wind as you slow."
  ],
  pvt: [["Approach airspeed", "+10/−5 kt (gust factor applied)"], ["Touchdown", "On or within 400 ft beyond the point"], ["Drift", "None; aligned with runway"]],
  com: [["Approach airspeed", "±5 kt (gust factor applied)"], ["Touchdown", "On or within 200 ft beyond the point"], ["Drift", "None; aligned with runway"]],
  errors: ["Unstabilized approach that needs big late corrections", "Touching down in a crab, side-loading the gear", "Flaring too high or ballooning", "Relaxing crosswind controls after touchdown"],
  qc: [{q: "If your POH gives no approach speed, what does the ACS use?", a: "Not more than 1.3 Vso."},
       {q: "In the wing-low method, what stops drift and what aligns the nose?", a: "Bank into the wind with aileron to stop drift; opposite rudder keeps the longitudinal axis aligned with the runway."}],
  afh: A9, phak: P11
},
"soft-takeoff": {
  area: "Takeoffs & Landings", title: "Soft-Field Takeoff and Climb", min: 3, acsP: "PA.IV.C", acsC: "CA.IV.C",
  view: "Side view", alt: "Early liftoff, level acceleration in ground effect, then climb", ref: G, track: "M20 128 L75 128 Q90 120 110 120 L185 120 Q225 118 300 40",
  cap: "Get the weight off the wheels early, accelerate in ground effect, then climb.",
  why: "Grass, sand, mud or snow drags on the wheels. The goal is to transfer the weight from the wheels to the wings as soon as possible and keep it there.",
  setup: ["Flaps per POH", "Keep rolling: don't stop", "Vx / Vy from POH"],
  steps: [
    "Taxi with full back elevator pressure and keep the airplane moving onto the runway.",
    "Without stopping, add takeoff power smoothly while holding back pressure to lift the nosewheel early.",
    "Hold a nose-high attitude and let the airplane lift off at the lowest possible airspeed.",
    "Lower the nose slightly and stay in ground effect while you accelerate.",
    "Climb out at Vx (if there's an obstacle) or Vy once you reach that speed.",
    "Retract flaps per the POH at a safe altitude and complete the after-takeoff checklist."
  ],
  pvt: [["Climb airspeed", "Vx or Vy +10/−5 kt"], ["Liftoff", "Lowest possible airspeed"], ["After liftoff", "Stay in ground effect to accelerate"]],
  com: [["Climb airspeed", "Vx or Vy ±5 kt"], ["Liftoff", "Lowest possible airspeed"], ["After liftoff", "Stay in ground effect to accelerate"]],
  errors: ["Stopping on the soft surface before takeoff", "Climbing out of ground effect too soon and settling back", "Over-rotating and risking a tail strike", "Losing directional control with the nose high"],
  qc: [{q: "Why stay in ground effect after liftoff?", a: "Induced drag is lower there, so the airplane can accelerate to a safe climb speed before leaving it."},
       {q: "Roughly how high does ground effect extend?", a: "Within about one wingspan of the surface."}],
  afh: A6, phak: P5
},
"soft-landing": {
  area: "Takeoffs & Landings", title: "Soft-Field Approach and Landing", min: 3, acsP: "PA.IV.D", acsC: "CA.IV.D",
  view: "Side view", alt: "Shallow approach, long flare in ground effect, gentle touchdown", ref: G, track: "M20 40 L165 108 Q185 120 225 121 Q252 122 272 128 L300 128",
  cap: "Hold it just off the surface and touch down as slowly and softly as possible.",
  why: "On a soft surface the wheels can dig in. Touch down as slowly as possible with a very low sink rate, then keep the nosewheel's weight off the ground.",
  setup: ["Flaps per POH", "Approach speed from POH", "Plan to keep moving"],
  steps: [
    "Fly a stabilized approach at the recommended speed with flaps as the POH recommends.",
    "Round out and hold the airplane a foot or two above the surface in ground effect.",
    "Keep a little power in to control the sink rate and keep the nose high.",
    "Touch down on the main wheels at the lowest possible airspeed.",
    "Hold back pressure to keep the nosewheel off as long as you can, then lower it gently.",
    "Avoid braking. Keep enough speed or power to taxi to a firm surface without bogging down."
  ],
  pvt: [["Approach airspeed", "+10/−5 kt (gust factor applied)"], ["Touchdown", "Minimum sink rate, no side drift"], ["After touchdown", "Keep moving; avoid sinking in"]],
  com: [["Approach airspeed", "±5 kt (gust factor applied)"], ["Touchdown", "Minimum sink rate, no side drift"], ["After touchdown", "Keep moving; avoid sinking in"]],
  errors: ["Too high a descent rate at touchdown", "Letting the nosewheel drop early", "Using the brakes on the soft surface", "Stopping and getting stuck"],
  qc: [{q: "Why carry a little power through the flare?", a: "It helps keep the sink rate low and the nose up for the softest possible touchdown."},
       {q: "What do you do right after touchdown?", a: "Hold the nosewheel off with back pressure, avoid braking, and keep moving to a firm surface."}],
  afh: A9, phak: P11
},
"short-takeoff": {
  area: "Takeoffs & Landings", title: "Short-Field Takeoff and Max Performance Climb", min: 3, acsP: "PA.IV.E", acsC: "CA.IV.E",
  view: "Side view", alt: "Short ground roll then a steep climb over an obstacle", ref: G + " M140 130 V88", track: "M20 128 L90 128 L150 70 Q170 52 300 25",
  cap: "Use all the runway, climb at Vx over the obstacle, then lower the nose to Vy.",
  why: "When the runway is short or there's an obstacle off the end, you need the shortest ground roll and the steepest climb the airplane can give.",
  setup: ["Flaps per POH", "Use all available runway", "Vx / Vy from POH"],
  steps: [
    "Taxi to the very beginning of the runway and line up on the centerline.",
    "Apply full power (holding the brakes if the POH recommends it) and check the engine gauges.",
    "Accelerate with the elevator positioned for minimum drag.",
    "Rotate at the recommended speed and pitch for Vx or the obstacle clearance speed.",
    "Hold that speed until the obstacle is cleared, or 50 ft above the surface if it's simulated.",
    "Lower the nose to accelerate to Vy and retract flaps per the POH at a safe altitude."
  ],
  pvt: [["Obstacle climb", "Vx +10/−5 kt to 50 ft / obstacle"], ["Then", "Vy +10/−5 kt"], ["Runway use", "Minimum distance, all available"]],
  com: [["Obstacle climb", "Vx ±5 kt to 50 ft / obstacle"], ["Then", "Vy ±5 kt"], ["Runway use", "Minimum distance, all available"]],
  errors: ["Not using all of the available runway", "Rotating too early, before the recommended speed", "Pitching too high and getting slow (behind the power curve)", "Retracting flaps too soon"],
  qc: [{q: "What's the difference between Vx and Vy?", a: "Vx gives the most altitude over a given distance (clearing obstacles). Vy gives the most altitude over a given time."},
       {q: "When do you transition from Vx to Vy?", a: "Once the obstacle is cleared, or at 50 ft above the surface if the obstacle is simulated."}],
  afh: A6, phak: P11
},
"short-landing": {
  area: "Takeoffs & Landings", title: "Short-Field Approach and Landing", min: 3, acsP: "PA.IV.F", acsC: "CA.IV.F",
  view: "Side view", alt: "Steep approach over an obstacle with minimal float to the point", ref: G + " M70 130 V62 M200 122 V138", track: "M20 15 L188 120 Q198 127 212 128 L250 128",
  cap: "A steeper, slower approach with almost no float, touching down right at the point.",
  why: "This is how you land in the least distance, over an obstacle if needed. Precise airspeed control on final is everything: extra speed turns into float.",
  setup: ["Full flaps (per POH)", "Pick touchdown point", "Approach speed from POH"],
  steps: [
    "Pick your touchdown point and set up a stabilized approach with landing flaps.",
    "Fly the recommended approach speed (or not more than 1.3 Vso) on a steeper approach angle.",
    "Control the descent with coordinated pitch and power; keep the aim point fixed in the windshield.",
    "Make a small flare with little or no float, touching down at minimum controllable airspeed.",
    "Brake as needed (and retract flaps if the POH says to) while holding the centerline."
  ],
  pvt: [["Approach airspeed", "+10/−5 kt (gust factor applied)"], ["Touchdown", "On or within 200 ft beyond the point"], ["Float", "Minimum; no side drift"]],
  com: [["Approach airspeed", "±5 kt (gust factor applied)"], ["Touchdown", "On or within 100 ft beyond the point"], ["Float", "Minimum; no side drift"]],
  errors: ["Extra airspeed on final, then floating past the point", "Dragging it in low and flat", "Flaring too high", "Braking so hard the wheels lock or skid"],
  qc: [{q: "What's the most common reason for floating past the point?", a: "Excess airspeed on final."},
       {q: "What's the Private touchdown tolerance?", a: "On the point or within 200 ft beyond it. (Commercial: within 100 ft.)"}],
  afh: A9, phak: P11
},
"forward-slip": {
  area: "Takeoffs & Landings", title: "Forward Slip to a Landing", min: 3, acsP: "PA.IV.M", acsC: null,
  view: "Side view", alt: "A steep slipping descent compared with a normal glidepath that overshoots", ref: G + " M20 20 L300 72 M215 122 V138", track: "M20 20 L170 112 Q190 126 220 128 L300 128",
  cap: "The slip (amber) steepens your descent without adding speed. The grey line shows where you'd end up without it.",
  why: "A forward slip lets you lose altitude quickly without picking up airspeed. It's the tool for being too high on final, especially with no flaps.",
  setup: ["Too high on final", "Power idle", "Check POH flap/slip limits"],
  steps: [
    "Recognize you're too high to land at your point. Reduce power to idle.",
    "Lower one wing with aileron (the upwind wing if there's a crosswind).",
    "Apply opposite rudder so the ground track stays lined up with the runway.",
    "Adjust pitch to hold the approach airspeed. Use the attitude, since the airspeed indicator can be less accurate in a slip.",
    "Before the flare, recover: level the wings, neutralize the rudder, and align the airplane with the runway.",
    "Touch down with no side drift."
  ],
  pvt: [["Touchdown", "On or within 400 ft beyond the point"], ["Drift", "None; aligned with runway"], ["Ground track", "Aligned with runway during slip"]],
  com: null,
  errors: ["Letting the nose drop and airspeed build", "Not recovering from the slip before touchdown", "Slipping with the wrong wing down in a crosswind", "Ignoring POH limits on slips with flaps"],
  qc: [{q: "In a crosswind, which wing goes down in the slip?", a: "The upwind wing."},
       {q: "Why fly pitch attitude instead of trusting the airspeed indicator?", a: "In a slip the airflow strikes the pitot-static system at an angle, so the indicator may read in error."}],
  afh: A9, phak: null
},
"go-around": {
  area: "Takeoffs & Landings", title: "Go-Around / Rejected Landing", min: 3, acsP: "PA.IV.N", acsC: "CA.IV.N",
  view: "Side view", alt: "Descending approach that transitions to a climb before touchdown", ref: G, track: "M20 40 L150 108 Q172 118 192 110 Q240 88 300 38",
  cap: "Make the decision early, then power, attitude, configuration.",
  why: "A go-around is a normal procedure, not a failure. Whenever the approach or landing isn't right, the safest choice is to go around early and decisively.",
  setup: ["Decide early", "Power · Attitude · Configuration", "Go-around flaps per POH"],
  steps: [
    "Make the decision and commit to it.",
    "Power: apply full takeoff power (carb heat off, if it was on).",
    "Attitude: pitch for a climb and hold right rudder.",
    "Configuration: reduce flaps to the POH go-around setting, in steps.",
    "Climb at Vx or Vy. Sidestep to the side of the runway so you can see any traffic.",
    "Retract the remaining flaps, trim, communicate, and re-enter the pattern."
  ],
  pvt: [["Climb airspeed", "Vx or Vy +10/−5 kt"], ["Then", "Vy +10/−5 kt to safe altitude"], ["Decision", "Timely; recognizes the need"]],
  com: [["Climb airspeed", "Vx or Vy ±5 kt"], ["Then", "Vy ±5 kt to safe altitude"], ["Decision", "Timely; recognizes the need"]],
  errors: ["Waiting too long to decide", "Retracting all the flaps at once", "Not countering the nose-up trim and left-turning forces", "Climbing out over traffic on the runway"],
  qc: [{q: "What are the AFH's three cardinal principles for a go-around?", a: "Power, attitude, and configuration."},
       {q: "Why not retract all the flaps at once?", a: "The sudden loss of lift can make the airplane sink back toward the ground."}],
  afh: A9, phak: null
},
"steep-turns": {
  area: "Performance Maneuvers", title: "Steep Turns", min: 3, acsP: "PA.V.A", acsC: "CA.V.A",
  view: "Top view", alt: "A full 360-degree circle returning to the entry heading", ref: "M40 20 H300", track: "M160 20 A55 55 0 1 1 159.9 20",
  cap: "A full 360° at constant altitude, rolling out on your entry heading.",
  why: "Steep turns build smooth, coordinated control and teach you to feel load factor and the overbanking tendency, all while keeping your eyes outside.",
  setup: ["Clearing turns", "Airspeed ≤ VA (or POH)", "Note heading & reference"],
  steps: [
    "Clear the area and set the entry airspeed (manufacturer's, or not more than VA).",
    "Note your heading and a reference point on the horizon.",
    "Roll smoothly into 45° of bank for Private (50° for Commercial).",
    "As the bank is established, generally before reaching 30°, smoothly add back pressure and power to hold altitude.",
    "Hold the sight picture outside; cross-check the altimeter and bank angle.",
    "Lead the rollout by about half the bank angle, then roll into the turn the other way if asked."
  ],
  pvt: [["Bank", "45° ±5°"], ["Altitude", "±100 ft"], ["Airspeed", "±10 kt"], ["Rollout heading", "±10°"]],
  com: [["Bank", "50° ±5°"], ["Altitude", "±100 ft"], ["Airspeed", "±10 kt"], ["Rollout heading", "±10°"]],
  errors: ["Losing altitude from too little back pressure", "Letting the bank creep steeper (overbanking)", "Uncoordinated flight: the ball out of center", "Not leading the rollout"],
  qc: [{q: "What's the load factor in a 60° level turn?", a: "2 G. Stall speed rises about 41%."},
       {q: "How far ahead should you lead the rollout?", a: "About half the angle of bank."}],
  afh: A10, phak: P5
},
"rectangular-course": {
  area: "Ground Reference", title: "Rectangular Course", min: 3, acsP: "PA.V.B", acsC: null,
  view: "Top view", alt: "A rectangular ground track around a field, entered at 45 degrees to the downwind leg", ref: "M95 45 H225 V105 H95 Z", track: "M70 20 H250 Q260 20 260 30 V120 Q260 130 250 130 H70 Q60 130 60 120 V30 Q60 20 70 20",
  cap: "Wind from the right. Equal distance from every boundary, like flying the traffic pattern.",
  why: "This is the traffic pattern without the runway. It trains wind correction, varying bank with groundspeed, and dividing your attention between the airplane and the ground.",
  setup: ["600–1,000 ft AGL", "Enter on downwind", "Field with landing options"],
  steps: [
    "Pick a rectangular field or area with emergency landing options nearby.",
    "Enter on the downwind leg at 600–1,000 ft AGL, flying parallel to the boundary about ½ to ¾ mile away.",
    "Downwind to base: the steepest bank, because groundspeed is highest.",
    "On the base and crosswind legs, crab into the wind to hold an equal distance from the boundary.",
    "Turning onto the upwind leg: the shallowest bank, because groundspeed is lowest.",
    "Keep altitude and airspeed constant; roll out wings level on each leg."
  ],
  pvt: [["Altitude band", "600–1,000 ft AGL"], ["Altitude", "±100 ft"], ["Airspeed", "±10 kt"], ["Wind correction", "Track parallel to boundaries"]],
  com: null,
  errors: ["Poor drift correction, so the legs aren't parallel", "Flying too close to or too far from the boundaries", "Not varying the bank for groundspeed", "Staring at the ground and losing altitude or traffic"],
  qc: [{q: "Where is the steepest bank?", a: "In the turn from downwind, where groundspeed is highest."},
       {q: "Where is the shallowest bank?", a: "In the turn onto the upwind leg, where groundspeed is lowest."}],
  afh: A7, phak: P14
},
"s-turns": {
  area: "Ground Reference", title: "S-Turns", min: 3, acsP: "PA.V.B", acsC: null,
  view: "Top view", alt: "Alternating half circles of equal size on each side of a straight road", ref: "M10 75 H310", track: "M40 75 A40 40 0 0 1 120 75 A40 40 0 0 0 200 75 A40 40 0 0 1 280 75",
  cap: "Wind perpendicular to the road. Equal half circles, crossing the road wings level.",
  why: "S-turns teach you to change the bank smoothly and constantly to fly a perfect ground track while the wind tries to push you around.",
  setup: ["600–1,000 ft AGL", "Road perpendicular to wind", "Enter downwind"],
  steps: [
    "Pick a straight road or line perpendicular to the wind.",
    "Enter on a downwind heading at 600–1,000 ft AGL, crossing the road wings level.",
    "Right after crossing, use the steepest bank: groundspeed is highest.",
    "Shallow the bank gradually as you turn into the wind, reaching wings level as you recross the road heading upwind.",
    "Immediately roll the other way with a shallow bank, steepening as you turn back downwind.",
    "Fly equal half circles on each side, holding altitude and airspeed."
  ],
  pvt: [["Altitude band", "600–1,000 ft AGL"], ["Altitude", "±100 ft"], ["Airspeed", "±10 kt"], ["Ground track", "Equal half circles"]],
  com: null,
  errors: ["Half circles of unequal size", "Not crossing the road wings level and perpendicular", "Abrupt bank changes instead of smooth ones", "Altitude drifting as bank changes"],
  qc: [{q: "Where is the bank steepest?", a: "Right after crossing the road on the downwind heading."},
       {q: "Why does a constant bank angle make lopsided half circles?", a: "Groundspeed changes with heading, so a constant bank gives a changing radius over the ground."}],
  afh: A7, phak: null
},
"turns-around-point": {
  area: "Ground Reference", title: "Turns Around a Point", min: 3, acsP: "PA.V.B", acsC: null,
  view: "Top view", alt: "A constant-radius circle around a point on the ground", ref: "M157 75 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0", track: "M160 22 A53 53 0 1 1 159.9 22",
  cap: "Wind from the left. The radius stays constant; only the bank changes.",
  why: "Flying a constant-radius circle around a point builds the wind-correction skills you'll use in every pattern and in eights on pylons later.",
  setup: ["600–1,000 ft AGL", "Prominent point", "Enter downwind"],
  steps: [
    "Pick a prominent point with emergency landing options nearby.",
    "Enter on downwind at 600–1,000 ft AGL, at a distance equal to the radius you want.",
    "On the downwind side, use the steepest bank: groundspeed is highest. The AFH suggests keeping it to about 45° or less.",
    "Decrease the bank as you turn upwind; the shallowest bank is directly upwind.",
    "Increase the bank again as you come back around to downwind.",
    "Keep a constant radius, altitude and airspeed; exit on the entry heading."
  ],
  pvt: [["Altitude band", "600–1,000 ft AGL"], ["Altitude", "±100 ft"], ["Airspeed", "±10 kt"], ["Ground track", "Constant radius"]],
  com: null,
  errors: ["Entering too close to the point, so the bank gets too steep", "Not adjusting the bank smoothly for groundspeed", "Losing sight of the point behind the wing", "Altitude drifting during bank changes"],
  qc: [{q: "Where is the bank steepest?", a: "Directly downwind, where groundspeed is highest."},
       {q: "Where is the bank shallowest?", a: "Directly upwind, where groundspeed is lowest."}],
  afh: A7, phak: null
},
"slow-flight": {
  area: "Slow Flight & Stalls", title: "Maneuvering During Slow Flight", min: 3, acsP: "PA.VII.A", acsC: "CA.VII.A",
  view: "Side view", alt: "Level flight with gentle climbs and descents at slow airspeed", ref: G, track: "M20 82 H115 Q135 82 155 70 H210 Q232 60 252 72 H300",
  cap: "Fly straight, turns, climbs and descents as assigned, just above the stall warning.",
  why: "Slow flight teaches you how the airplane feels and handles at high angles of attack, like on short final, so you recognize the edge before you reach it.",
  setup: ["Clearing turns", "Complete ≥1,500 ft AGL", "Configuration as assigned"],
  steps: [
    "Clear the area. Reduce power and raise the nose to hold altitude as you slow.",
    "Configure flaps and gear as specified.",
    "Settle at a speed where any more angle of attack, load factor or power reduction would trigger the stall warning.",
    "Add power to hold altitude; use pitch to hold airspeed. Keep coordinated with plenty of right rudder.",
    "Fly straight and level, turns, climbs and descents as assigned.",
    "Recover: add full power, lower the nose, and retract flaps in steps as airspeed builds."
  ],
  pvt: [["Altitude", "±100 ft"], ["Heading", "±10°"], ["Airspeed", "+10/−0 kt"], ["Bank", "±10° of specified"], ["Stall warning", "Must not activate"]],
  com: [["Altitude", "±50 ft"], ["Heading", "±10°"], ["Airspeed", "+5/−0 kt"], ["Bank", "±5° of specified"], ["Stall warning", "Must not activate"]],
  errors: ["Activating the stall warning", "Poor coordination at high power and low speed", "Losing altitude in turns", "Raising the flaps all at once during recovery"],
  qc: [{q: "In slow flight, what mainly controls altitude?", a: "Power, while pitch holds the airspeed."},
       {q: "Is the stall warning allowed during the maneuver?", a: "No. Fly just above the speed where it would activate."}],
  afh: A5, phak: P5
},
"power-off-stall": {
  area: "Slow Flight & Stalls", title: "Power-Off Stalls", min: 3, acsP: "PA.VII.B", acsC: "CA.VII.B",
  view: "Side view", alt: "Descent, pitch up to a stall, nose drop and recovery climb", ref: G, track: "M20 50 L120 88 Q150 98 165 84 Q175 74 186 92 Q200 114 240 104 L300 80",
  cap: "Simulates the approach and landing: stabilized descent, pitch up, stall, recover.",
  why: "This stall simulates an approach to landing, like an overshot base-to-final turn. Practicing it teaches you to recognize the cues and recover without hesitation.",
  setup: ["Clearing turns", "Complete ≥1,500 ft AGL", "Approach/landing configuration"],
  steps: [
    "Clear the area. Slow to normal approach speed, configure as specified, and establish a stabilized descent.",
    "Smoothly raise the nose to an attitude that will induce a stall, straight or in a shallow turn.",
    "Stay coordinated and note the cues: buffet, stall warning, mushy controls.",
    "At the stall, first reduce the angle of attack with forward elevator pressure.",
    "Level the wings with coordinated controls and add full power.",
    "Climb at Vx or Vy, retracting flaps in steps per the POH, and return to the assigned altitude and heading."
  ],
  pvt: [["Heading (straight)", "±10°"], ["Bank (turning)", "≤20°, ±10°"], ["Stall", "Recover promptly after full stall"], ["Completion", "No lower than 1,500 ft AGL"]],
  com: [["Heading (straight)", "±10°"], ["Bank (turning)", "≤20°, ±5°"], ["Stall", "Impending or full, as specified"], ["Completion", "No lower than 1,500 ft AGL"]],
  errors: ["Not reducing the angle of attack first", "Pulling up too soon and causing a secondary stall", "Uncoordinated flight at the break, which risks a spin", "Losing too much altitude in the recovery"],
  qc: [{q: "What is the first action in any stall recovery?", a: "Reduce the angle of attack."},
       {q: "What real-world situation does this stall simulate?", a: "An approach to landing, such as a steep or overshot turn from base to final."}],
  afh: A5, phak: P5
},
"power-on-stall": {
  area: "Slow Flight & Stalls", title: "Power-On Stalls", min: 3, acsP: "PA.VII.C", acsC: "CA.VII.C",
  view: "Side view", alt: "Climb with rising pitch to a stall, then a recovery", ref: G, track: "M20 112 Q90 102 140 42 Q155 26 170 50 Q185 80 230 75 L300 60",
  cap: "Simulates takeoff and departure: high power, high pitch, stall, recover.",
  why: "This stall simulates the takeoff and departure climb, where high power and high pitch can sneak up on you. Most of the work is the rudder.",
  setup: ["Clearing turns", "Complete ≥1,500 ft AGL", "Takeoff, departure or cruise config"],
  steps: [
    "Clear the area. Slow to normal liftoff speed in the configuration the evaluator specifies (takeoff, departure or cruise).",
    "Set power to no less than 65% (as the ACS specifies) and smoothly pitch up.",
    "Hold the attitude straight or in a shallow turn, with right rudder for coordination.",
    "At the stall, reduce the angle of attack first.",
    "Level the wings with coordinated controls and add power as needed.",
    "Climb at Vx or Vy and return to the assigned altitude and heading."
  ],
  pvt: [["Power", "No less than 65%"], ["Heading (straight)", "±10°"], ["Bank (turning)", "≤20°, ±10°"], ["Completion", "No lower than 1,500 ft AGL"]],
  com: [["Power", "No less than 65%"], ["Heading (straight)", "±10°"], ["Bank (turning)", "≤20°, ±10°"], ["Stall", "Impending or full, as specified"]],
  errors: ["Too little right rudder, so a wing drops at the break", "An extremely nose-high attitude held too long", "Leveling the wings with aileron before reducing angle of attack", "Not coordinating the recovery"],
  qc: [{q: "Why is a wing drop common in power-on stalls?", a: "Left-turning tendencies are strong at high power and high angle of attack. Without enough right rudder, the airplane is uncoordinated at the stall."},
       {q: "What minimum power does the ACS call for?", a: "No less than 65%."}],
  afh: A5, phak: P5
},
"spin-awareness": {
  area: "Slow Flight & Stalls", title: "Spin Awareness", min: 3, acsP: "PA.VII.D", acsC: "CA.VII.E",
  view: "Side view", alt: "A tight descending spiral path showing spin rotation, then a dive recovery", ref: G, track: "M160 14 Q222 24 160 34 Q98 44 160 54 Q222 64 160 74 Q98 84 160 94 Q205 104 175 116 L240 126",
  cap: "A spin needs two things: a stalled wing and yaw. Remove either and it can't develop.",
  why: "This is a knowledge task: you won't spin on the checkride. Understanding how spins start is how you prevent them, especially low in the pattern.",
  setup: ["Knowledge task", "Stall + yaw = spin", "Your POH procedure first"],
  steps: [
    "Know the cause: the critical angle of attack is exceeded (a stall) while the airplane is yawing (uncoordinated).",
    "Know the traps: a skidding base-to-final turn, cross-controlled flight, and a stall with the ball out of center.",
    "Prevent it: stay coordinated, and reduce the angle of attack at the first sign of a stall.",
    "General recovery (always use your POH first): power to idle and ailerons neutral.",
    "Full rudder opposite the rotation, then brisk forward elevator to break the stall.",
    "Neutralize the rudder when rotation stops, then pull out of the dive smoothly."
  ],
  pvt: [["Type", "Knowledge task, no flight tolerance"], ["Covers", "Aerodynamics of spins"], ["Covers", "Situations that lead to spins"], ["Covers", "Recovery procedure"]],
  com: [["Type", "Knowledge task, no flight tolerance"], ["Covers", "Aerodynamics of spins"], ["Covers", "Situations that lead to spins"], ["Covers", "Recovery procedure"]],
  errors: ["Using aileron to pick up a dropping wing near the stall", "Skidding with rudder to tighten a base-to-final turn", "Delaying the recovery", "Pulling out of the recovery dive too hard (secondary stall)"],
  qc: [{q: "What two conditions are needed for a spin?", a: "A stall (critical angle of attack exceeded) plus yaw."},
       {q: "Which way does the rudder go for recovery?", a: "Full rudder opposite the direction of rotation."}],
  afh: A5, phak: P5
},
"emergency-descent": {
  area: "Emergency Operations", title: "Emergency Descent", min: 2, acsP: "PA.IX.A", acsC: "CA.IX.A",
  view: "Side view", alt: "A steep descending turn followed by level off at a lower altitude", ref: G, track: "M20 20 Q60 20 100 60 L220 108 Q250 122 300 122",
  cap: "Steep, banked, within airspeed limits, then a smooth level-off.",
  why: "Fire, smoke, or a medical or pressurization problem can mean you need to get down now. The goal is the fastest descent that stays within the airplane's limits.",
  setup: ["Clear the area below", "Emergency descent speed per POH", "Respect VNE / VFE / VLE"],
  steps: [
    "Recognize the need and clear the area below you.",
    "Reduce power to idle and configure as the POH recommends.",
    "Roll into a 30°–45° bank to keep a positive load factor and see below.",
    "Lower the nose and hold the emergency descent airspeed without exceeding limits.",
    "Run the checklist and plan your level-off.",
    "Level off smoothly at the specified altitude."
  ],
  pvt: [["Bank", "30°–45°"], ["Airspeed", "+0/−10 kt"], ["Level-off", "±100 ft"], ["Limits", "Never exceed airframe limits"]],
  com: [["Bank", "30°–45°"], ["Airspeed", "+0/−10 kt"], ["Level-off", "±100 ft"], ["Limits", "Never exceed airframe limits"]],
  errors: ["Exceeding VNE, VFE or VLE", "Not clearing the area below", "An abrupt pull-up that overstresses the airplane", "Skipping the checklist"],
  qc: [{q: "Why bank during an emergency descent?", a: "It keeps a positive load factor as the nose lowers and lets you see the area below."},
       {q: "What's the airspeed tolerance?", a: "+0/−10 kt of the appropriate airspeed."}],
  afh: A18, phak: null
},
"emergency-landing": {
  area: "Emergency Operations", title: "Emergency Approach and Landing (Simulated)", min: 3, acsP: "PA.IX.B", acsC: "CA.IX.B",
  view: "Top view", alt: "A gliding pattern from the engine failure point down to a chosen field", ref: "M100 104 H270 V122 H100 Z", track: "M40 25 H245 Q280 25 280 58 V82 Q280 113 248 113 H125",
  cap: "Best glide first, then fly a pattern to the field you picked.",
  why: "If the engine quits, the first seconds matter. Pitch for best glide, pick a field, and fly a plan. Troubleshoot only after the airplane is set up.",
  setup: ["Best glide speed from POH", "Field within glide range", "Checklist from POH"],
  steps: [
    "Immediately pitch for best glide speed and trim.",
    "Pick a suitable landing area within gliding distance, into the wind if you can.",
    "Plan a pattern to the field with key positions.",
    "Run the restart checklist per the POH (for example fuel, mixture, carb heat, magnetos).",
    "Communicate: declare, and squawk 7700 if able.",
    "Secure the engine per the checklist and configure to land at the slowest safe speed. (On a checkride, recover when the examiner says.)"
  ],
  pvt: [["Glide airspeed", "Best glide ±10 kt"], ["Landing area", "Suitable, within range"], ["Checklist", "Followed per POH"], ["Pattern", "Planned to the field"]],
  com: [["Glide airspeed", "Best glide ±10 kt"], ["Landing area", "Suitable, within range"], ["Checklist", "Followed per POH"], ["Pattern", "Planned to the field"]],
  errors: ["Slow to establish best glide", "Changing fields late", "Overshooting or undershooting the field", "Troubleshooting before flying the airplane"],
  qc: [{q: "What's the very first action?", a: "Establish best glide airspeed."},
       {q: "What transponder code signals an emergency?", a: "7700."}],
  afh: A18, phak: null
},
"steep-spiral": {
  area: "Performance Maneuvers", title: "Steep Spiral", min: 3, acsP: null, acsC: "CA.V.B",
  view: "Side view", alt: "A gliding descending spiral of three or more turns around a point", ref: G + " M157 130 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0", track: "M80 18 Q240 18 240 38 Q240 58 160 58 Q80 58 80 78 Q80 98 160 98 Q240 98 240 112 Q240 124 160 124",
  cap: "Power-off descending turns at a constant radius around a point on the ground.",
  why: "The steep spiral trains you to lose altitude in a power-off glide while staying over a point, like a forced landing site, with precise airspeed control.",
  setup: ["Altitude for ≥3 turns", "Finish ≥1,500 ft AGL", "Glide speed from POH"],
  steps: [
    "Clear the area and pick a prominent point on the ground.",
    "Reduce power to idle, establish glide speed, and enter on downwind.",
    "Use the steepest bank on downwind (no more than 60°) and vary the bank to keep a constant radius.",
    "Hold a constant airspeed throughout.",
    "Clear the engine periodically during the descent.",
    "After at least three 360° turns, roll out on the specified heading."
  ],
  pvt: null,
  com: [["Turns", "At least three 360°"], ["Bank", "Not to exceed 60°"], ["Airspeed", "±10 kt"], ["Rollout heading", "±10°"], ["Completion", "No lower than 1,500 ft AGL"]],
  errors: ["Airspeed swinging as the bank changes", "Not correcting for wind, so the radius drifts", "Exceeding 60° of bank", "Forgetting to clear the engine"],
  qc: [{q: "Where is the bank steepest?", a: "On the downwind side, where groundspeed is highest."},
       {q: "Why clear the engine during the spiral?", a: "To keep it from cooling too much or fouling during the long idle descent."}],
  afh: A10, phak: null
},
"chandelle": {
  area: "Performance Maneuvers", title: "Chandelles", min: 4, acsP: null, acsC: "CA.V.C",
  view: "Perspective", alt: "A climbing 180-degree turn ending wings level and slow", ref: "M30 128 H300", track: "M30 125 L110 125 Q230 125 240 80 Q245 40 150 30 L120 30",
  cap: "A maximum-performance climbing 180°: bank first, pitch second.",
  why: "The chandelle trains coordination and energy management: getting the most altitude out of a 180° turn while the airspeed bleeds off to just above the stall.",
  setup: ["Clearing turns", "Finish ≥1,500 ft AGL", "Entry ≤ VA (or POH)"],
  steps: [
    "Clear the area and establish the entry airspeed (manufacturer's, or not more than VA), wings level.",
    "Roll into a coordinated turn of about 30° of bank.",
    "With the bank set, smoothly raise the nose and add power as recommended.",
    "First 90°: hold the bank constant while pitch increases.",
    "From 90° to 180°: hold the pitch constant while you roll out slowly and steadily.",
    "Arrive wings level at the 180° point just above stall speed, hold it momentarily, then lower the nose."
  ],
  pvt: null,
  com: [["Bank", "About 30°"], ["Rollout", "180° point ±10°"], ["Airspeed at rollout", "Just above stall, no stall"], ["Completion", "No lower than 1,500 ft AGL"]],
  errors: ["Changing the bank during the first 90°", "Changing the pitch during the second 90°", "Reaching 180° too early or too late", "Stalling, or finishing too fast at the end"],
  qc: [{q: "What stays constant in the first 90°?", a: "The bank angle (pitch is increasing)."},
       {q: "What stays constant in the second 90°?", a: "The pitch attitude (bank is decreasing)."}],
  afh: A10, phak: null
},
"lazy-eight": {
  area: "Performance Maneuvers", title: "Lazy Eights", min: 4, acsP: null, acsC: "CA.V.D",
  view: "Pilot's view", alt: "A figure eight lying on its side traced along the horizon", ref: "M10 75 H310", track: "M160 75 C200 20 290 20 290 75 C290 130 200 130 160 75 C120 20 30 20 30 75 C30 130 120 130 160 75",
  cap: "Two 180° turns in opposite directions, each with a climb and a descent.",
  why: "Nothing is ever constant in a lazy eight. It builds smooth, coordinated control through changing pitch, bank and airspeed, along with planning and orientation.",
  setup: ["Clearing turns", "Finish ≥1,500 ft AGL", "Refs at 45°, 90°, 135°"],
  steps: [
    "Clear the area. Pick reference points on the horizon at 45°, 90° and 135° from your entry heading.",
    "From level flight at the entry airspeed, begin a climbing turn, slowly increasing both pitch and bank.",
    "At 45°: the highest pitch, with about half your maximum bank.",
    "At 90°: the steepest bank (about 30°), pitch passing through level, and the lowest airspeed.",
    "At 135°: the lowest pitch as the bank decreases.",
    "At 180°: wings level, back at the entry altitude and airspeed. Then start the next turn the other way."
  ],
  pvt: null,
  com: [["Bank", "About 30° at steepest"], ["At 180° point: altitude", "±100 ft of entry"], ["At 180° point: airspeed", "±10 kt of entry"], ["At 180° point: heading", "±10°"], ["Completion", "No lower than 1,500 ft AGL"]],
  errors: ["Flat or lopsided loops", "Using a constant rate of roll and pitch", "Poor rudder coordination as speed changes", "Watching the instruments instead of the horizon"],
  qc: [{q: "Where is the bank steepest?", a: "At the 90° point."},
       {q: "Where is the airspeed lowest?", a: "At the 90° point, as the nose passes through the horizon."}],
  afh: A10, phak: null
},
"eights-on-pylons": {
  area: "Ground Reference", title: "Eights on Pylons", min: 4, acsP: null, acsC: "CA.V.E",
  view: "Top view", alt: "A figure eight around two pylons on the ground", ref: "M92 75 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0 M222 75 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0", track: "M160 75 C190 25 270 25 270 75 C270 125 190 125 160 75 C130 25 50 25 50 75 C50 125 130 125 160 75",
  cap: "Pivotal altitude ≈ groundspeed² ÷ 11.3 (knots). Higher on downwind, lower upwind.",
  why: "The most advanced ground reference maneuver. You hold a wingtip on the pylon by changing altitude, not bank, which builds precise feel and divided attention.",
  setup: ["Two pylons ⟂ to wind", "Pivotal altitude = GS² ÷ 11.3", "Bank ≤40°"],
  steps: [
    "Pick two pylons on a line perpendicular to the wind, far enough apart for a short straight leg between turns.",
    "Enter diagonally crosswind between the pylons (or on a downwind heading passing midway between them), at pivotal altitude.",
    "Hold the line of sight from your eye along the wing to the pylon.",
    "If the pylon moves ahead of the reference, descend. If it moves behind, climb. Use elevator, not rudder.",
    "Expect pivotal altitude to be highest on downwind (fastest groundspeed) and lowest upwind.",
    "Fly straight between the pylons, crabbing for wind, then turn the opposite way around the second pylon."
  ],
  pvt: null,
  com: [["Bank", "Not to exceed 40°"], ["Pylon position", "Held with pivotal altitude"], ["Coordination", "No slips or skids"], ["Pattern", "Figure eight, wind-corrected"]],
  errors: ["Using rudder to hold the pylon (skidding)", "Entering at the wrong pivotal altitude", "Starting the turn too early or late", "Not crabbing on the straight legs"],
  qc: [{q: "The pylon moves ahead of your wing reference. What do you do?", a: "Descend, with forward elevator pressure."},
       {q: "What's the pivotal altitude rule of thumb in knots?", a: "Groundspeed squared divided by 11.3."}],
  afh: A7, phak: null
},
"power-off-180": {
  area: "Takeoffs & Landings", title: "Power-Off 180° Accuracy Approach and Landing", min: 4, acsP: null, acsC: "CA.IV.M",
  view: "Top view", alt: "From downwind abeam the point, a 180-degree gliding turn to land on the point", ref: "M60 120 H285 M120 112 V128 M120 47 V60", track: "M285 40 H110 Q50 40 50 80 Q50 120 100 120 H126",
  cap: "Power to idle abeam the point, then a 180° glide to a spot landing.",
  why: "It's an engine-out landing from the pattern. Judging glide, wind and energy without power makes every landing you do more precise.",
  setup: ["Pattern altitude", "Idle abeam the point", "Best glide from POH"],
  steps: [
    "Fly downwind at pattern altitude. Abeam the touchdown point, reduce power to idle.",
    "Pitch for best glide speed and trim.",
    "Judge the base turn from your angle to the point and the wind.",
    "Adjust with flaps or a slip (if the POH allows). Don't add power and don't stretch the glide.",
    "Roll out on a stabilized final and complete the final configuration.",
    "Flare and touch down on the point or just past it."
  ],
  pvt: null,
  com: [["Touchdown", "On or within 200 ft beyond the point"], ["Power", "Idle from abeam the point"], ["Drift", "None; aligned with runway"], ["Final", "Stabilized approach"]],
  errors: ["Turning base too late and coming up short", "Adding flaps too early", "Raising the nose to stretch the glide (stall risk)", "Adding power to fix a bad plan"],
  qc: [{q: "What's the touchdown tolerance?", a: "On the point or within 200 ft beyond it. Short is not allowed."},
       {q: "You're high on final. What tools do you have?", a: "Flaps and, if permitted, a forward slip. Not power."}],
  afh: A9, phak: null
},
"accelerated-stall": {
  area: "Slow Flight & Stalls", title: "Accelerated Stalls", min: 3, acsP: null, acsC: "CA.VII.D",
  view: "Top view", alt: "A steep coordinated turn that tightens into a stall break", ref: "M40 125 H300", track: "M40 120 Q40 40 140 35 Q230 30 240 90 L250 128",
  cap: "A stall at a higher-than-normal airspeed, caused by load factor in a turn.",
  why: "Any airplane can stall at any airspeed if the load factor is high enough. This shows how a hard pull in a steep turn can stall the wing, and how fast to recover.",
  setup: ["Clearing turns", "Complete ≥3,000 ft AGL", "Airspeed not above VA"],
  steps: [
    "Clear the area and set up at least 3,000 ft AGL, in the configuration specified.",
    "Set power so the airspeed does not exceed VA.",
    "Roll into a coordinated 45° bank.",
    "Smoothly and firmly increase back pressure until the stall is impending.",
    "At the first indication, reduce the angle of attack, level the wings, and add power as needed.",
    "Return to straight-and-level flight without a secondary stall."
  ],
  pvt: null,
  com: [["Completion", "No lower than 3,000 ft AGL"], ["Bank", "45°, coordinated"], ["Recovery", "First indication of impending stall"], ["Avoid", "Secondary stall, spin"]],
  errors: ["Entering above VA", "Uncoordinated flight at the break (spin risk)", "Delaying the recovery", "Rolling wings level before reducing angle of attack"],
  qc: [{q: "Why does the airplane stall at a higher airspeed in a steep turn?", a: "Load factor increases, and stall speed increases with load factor."},
       {q: "When do you recover?", a: "At the first indication of an impending stall."}],
  afh: A5, phak: P5
},

"ir-flight": {
  kind: "ir", area: "Instrument · Flight by Reference to Instruments", title: "Attitude Instrument Flying", min: 3, acsP: "IR.IV.A", acsC: null,
  view: "Side view", alt: "Level flight transitioning to a climb and level-off", ref: G2, track: "M20 100 H110 Q140 100 160 80 L220 50 Q235 42 260 42 H300",
  cap: "Straight-and-level, standard-rate turns, climbs and descents, with instruments alone.",
  why: "Everything in instrument flying sits on this skill: controlling the airplane precisely with no outside reference, using a disciplined scan instead of feel.",
  setup: ["View-limiting device", "Cross-check · interpret · control", "Standard-rate turns"],
  steps: [
    "Treat the attitude indicator as the center of your scan. Set pitch and bank there first.",
    "Cross-check the supporting instruments, moving out from the attitude indicator and back to it.",
    "Make small, precise attitude changes, then trim off the control pressure.",
    "Turns: standard rate is 3° per second. A rule of thumb for the bank is about 15% of your true airspeed.",
    "Climbs and descents: set pitch and power together. Lead the level-off by about 10% of the vertical speed.",
    "Hold the assigned altitude, heading and airspeed, and keep scanning."
  ],
  pvt: [["Altitude", "±100 ft"], ["Heading", "±10°"], ["Airspeed", "±10 kt"], ["Bank in turns", "±5°"]],
  com: null,
  errors: ["Fixation: staring at one instrument", "Omission: leaving an instrument out of the scan", "Emphasis: relying on one instrument instead of the combination", "Not trimming, so the airplane keeps wandering"],
  qc: [{q: "What are the three fundamental skills of attitude instrument flying?", a: "Instrument cross-check, instrument interpretation, and aircraft control."},
       {q: "About what bank gives a standard-rate turn at 100 KTAS?", a: "About 15° (15% of true airspeed)."}],
  refs: [[...IFH, "Ch. 6 — Airplane Attitude Instrument Flying"], [...IFH, "Ch. 7 — Airplane Basic Flight Maneuvers"]]
},
"ir-unusual": {
  kind: "ir", area: "Instrument · Flight by Reference to Instruments", title: "Recovery from Unusual Flight Attitudes", min: 3, acsP: "IR.IV.B", acsC: null,
  view: "Side view", alt: "A nose-high climb, then a nose-low dive, each recovered to level flight", ref: G2, track: "M30 110 Q90 20 150 70 Q190 110 240 80 L300 75",
  cap: "Nose high: power up, nose down, wings level. Nose low: power back, wings level, then raise the nose.",
  why: "Distraction, turbulence or spatial disorientation can put you in an attitude you didn't intend. A fast, correct recovery by instruments alone can save the flight.",
  setup: ["Confirm on 2+ instruments", "Know nose-high vs nose-low", "Partial panel too"],
  steps: [
    "Recognize it: when an instrument shows something you didn't expect, confirm with the others right away.",
    "Nose high (airspeed decreasing): add power and apply forward pressure to lower the nose.",
    "Then level the wings with coordinated aileron and rudder.",
    "Nose low (airspeed increasing): reduce power and level the wings with coordinated controls.",
    "Then raise the nose to level flight with smooth back pressure. Don't overstress the airplane.",
    "Return to stabilized level flight and resume your scan."
  ],
  pvt: [["Recognition", "Prompt, from instrument indications"], ["Recovery", "Correct sequence, coordinated"], ["Result", "Stabilized level flight"]],
  com: null,
  errors: ["Pulling back while still banked nose-low, which tightens the spiral", "Abrupt control inputs that overstress the airframe", "Slow recognition", "Trusting a single, possibly failed, instrument"],
  qc: [{q: "Nose-low and airspeed climbing: what comes first?", a: "Reduce power and level the wings, then raise the nose."},
       {q: "Why level the wings before pulling up in a nose-low attitude?", a: "Back pressure while banked tightens the turn and adds load factor: the start of a graveyard spiral."}],
  refs: [[...IFH, "Ch. 7 — Airplane Basic Flight Maneuvers"], [...IFH, "Ch. 3 — Human Factors (spatial disorientation)"]]
},
"ir-holding": {
  kind: "ir", area: "Instrument · ATC Clearances & Procedures", title: "Holding Procedures", min: 4, acsP: "IR.III.B", acsC: null,
  view: "Top view", alt: "A racetrack holding pattern with right turns and an inbound leg to the fix", ref: "M10 110 H220 M217 110 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0", track: "M100 50 H220 A30 30 0 0 1 220 110 H100 A30 30 0 0 1 100 50",
  cap: "Standard hold: right turns, 1-minute inbound legs at or below 14,000 ft MSL.",
  why: "ATC uses holds to sequence traffic and buy time, and they're part of many approaches. Getting the entry, timing and wind correction right keeps you in protected airspace.",
  setup: ["Copy fix · direction · course · legs · EFC", "Slow ≤3 min before fix", "Direct · parallel · teardrop"],
  steps: [
    "Copy the hold: fix, direction, course or radial, leg length if not standard, and the expect-further-clearance time.",
    "Within 3 minutes of the fix (but before reaching it), slow to holding speed for your altitude.",
    "Pick the entry for your heading: direct, parallel, or teardrop.",
    "Standard pattern: right turns and 1-minute inbound legs at or below 14,000 ft MSL.",
    "Start the outbound timer abeam the fix (or wings level, if you can't tell). Adjust it so the inbound leg is 1 minute.",
    "Correct for wind: about triple your inbound wind correction on the outbound leg."
  ],
  pvt: [["Airspeed", "±10 kt"], ["Altitude", "±100 ft"], ["Headings", "±10°"], ["Course", "Within ¾-scale CDI"], ["Slow down", "≤3 min before the fix"]],
  com: null,
  errors: ["Choosing the wrong entry, or flying it the wrong way", "Forgetting to start the timer", "Not adjusting the outbound leg for wind", "Arriving at the fix above holding speed"],
  qc: [{q: "Describe a standard holding pattern.", a: "Right turns with 1-minute inbound legs at or below 14,000 ft MSL (1.5 minutes above 14,000)."},
       {q: "How much wind correction do you use outbound?", a: "About triple the inbound wind correction angle."}],
  refs: [[...AIM, "Ch. 5, Sec. 3 — En Route Procedures (5-3-8 Holding)"], [...IFH, "Ch. 10 — IFR Flight"], [...IPH, "Ch. 2 — En Route Operations"]]
},
"ir-tracking": {
  kind: "ir", area: "Instrument · Navigation Systems", title: "Intercepting & Tracking Courses and DME Arcs", min: 4, acsP: "IR.V.A", acsC: null,
  view: "Top view", alt: "A DME arc flown around a navaid, crossing radials", ref: "M160 140 L160 20 M157 140 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0", track: "M40 140 A120 120 0 0 1 280 140",
  cap: "Hold a constant distance from the station by keeping the bearing pointer near the wingtip.",
  why: "Every IFR flight is built from intercepting and tracking courses, from VORs, localizers, GPS legs and DME arcs. Smooth intercepts and good wind correction make the rest easy.",
  setup: ["Tune · identify · set course", "Intercept angle 30°–45°", "Bracket for wind"],
  steps: [
    "Tune and identify the navaid (or verify the GPS course), and set the desired course.",
    "Pick an intercept heading, typically 30° to 45° to the course.",
    "Lead the turn onto the course as the needle starts to center.",
    "Track it by bracketing: find the wind correction that keeps the needle centered.",
    "DME arc: start the turn onto the arc a little before reaching the arc distance, so you roll out on it.",
    "Fly the arc in small heading changes, keeping the bearing pointer near the wingtip. Lead the turn off the arc onto the final course."
  ],
  pvt: [["Airspeed", "±10 kt"], ["Altitude", "±100 ft"], ["Headings", "±5°"], ["Course", "Within ¾-scale CDI"], ["DME arc", "±1 NM"]],
  com: null,
  errors: ["Not identifying the station", "Chasing the needle instead of finding a correction", "Overshooting the intercept", "Drifting outside the arc"],
  qc: [{q: "What's the DME arc tolerance?", a: "±1 nautical mile."},
       {q: "In no wind, where should the bearing pointer stay on an arc?", a: "On the wingtip reference (90° to your heading)."}],
  refs: [[...IFH, "Ch. 9 — Navigation Systems"], [...AIM, "Ch. 1 — Air Navigation"]]
},
"ir-departure": {
  kind: "ir", area: "Instrument · ATC Clearances & Procedures", title: "Clearances, Departures, En Route & Arrivals", min: 4, acsP: "IR.III.A · IR.V.B", acsC: null,
  view: "Top view", alt: "A route of waypoints from departure through en route to arrival", ref: "M77 80 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0 M177 70 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0 M237 30 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0", track: "M20 130 L80 80 L180 70 L240 30 L300 20",
  cap: "Copy it, read it back, load it, verify it, then fly exactly what you were cleared.",
  why: "Most IFR problems start with a clearance that was misunderstood or loaded wrong. A consistent routine for copying, briefing and verifying keeps you where ATC expects you to be.",
  setup: ["Copy in a set order", "Brief SID/ODP & climb gradient", "Verify the GPS route"],
  steps: [
    "Copy the clearance in a consistent order: clearance limit, route, altitude, frequency, transponder (many pilots use C-R-A-F-T).",
    "Read it back and ask about anything you're not sure of.",
    "Brief the departure procedure (ODP or SID), including any required climb gradient.",
    "Load the route in the navigator and check it against the clearance and the chart.",
    "Comply with assigned headings, altitudes and crossing restrictions en route.",
    "Before the arrival, brief the STAR or expected routing and the approach."
  ],
  pvt: [["Airspeed", "±10 kt"], ["Altitude", "±100 ft"], ["Headings", "±10°"], ["Course", "Within ¾-scale CDI"]],
  com: null,
  errors: ["Not reading back, or reading back incorrectly", "A route loaded in the GPS that doesn't match the clearance", "Missing a crossing restriction", "Not checking whether you can meet the climb gradient"],
  qc: [{q: "What are the two kinds of instrument departure procedures?", a: "Obstacle departure procedures (ODPs) for obstacle clearance and standard instrument departures (SIDs) for ATC."},
       {q: "With no climb gradient published, what do the procedures assume?", a: "At least 200 ft per nautical mile."}],
  refs: [[...IPH, "Ch. 1 — Departure Procedures"], [...IPH, "Ch. 3 — Arrivals"], [...AIM, "Ch. 5 — Air Traffic Procedures"]]
},
"ir-npa": {
  kind: "ir", area: "Instrument · Approach Procedures", title: "Nonprecision Approach", min: 4, acsP: "IR.VI.A", acsC: null,
  view: "Side view", alt: "Step-down descent to the minimum descent altitude", ref: MDA, track: "M20 25 H60 L110 65 H160 L200 95 H275",
  cap: "Step down at each fix to the MDA (grey line), then level off until you're visual or at the MAP.",
  why: "Nonprecision approaches give lateral guidance only, to a minimum descent altitude. They demand careful briefing, accurate step-downs, and discipline at the MDA.",
  setup: ["Brief the plate", "Know MDA & MAP", "Missed approach briefed"],
  steps: [
    "Get the weather and brief the plate: frequencies, courses, step-down altitudes, MDA, missed approach point, and missed approach procedure.",
    "Set up and identify the avionics.",
    "Fly the published transition or course reversal, or ATC vectors, to the final approach course.",
    "On final, descend to each step-down altitude only after passing its fix, then level off at the MDA.",
    "Don't go below the MDA unless you have the required visual references and can land normally (14 CFR 91.175).",
    "At the missed approach point without the runway environment, go missed."
  ],
  pvt: [["Altitude", "±100 ft"], ["Heading", "±10°"], ["Airspeed", "±10 kt"], ["Course", "Within ¾-scale CDI"], ["At MDA", "+100/−0 ft"]],
  com: null,
  errors: ["Descending before reaching a step-down fix", "Going below the MDA", "Losing track of the missed approach point", "A rushed or incomplete brief"],
  qc: [{q: "What's the altitude tolerance at the MDA?", a: "+100/−0 ft. You can't go below it."},
       {q: "When can you descend below the MDA?", a: "Only when the 14 CFR 91.175 conditions are met: required visibility, required visual references, and a position to land with a normal descent."}],
  refs: [[...IPH, "Ch. 4 — Approaches"], [...IFH, "Ch. 10 — IFR Flight"], [...CFR, "§ 91.175 — Takeoff and landing under IFR"]]
},
"ir-precision": {
  kind: "ir", area: "Instrument · Approach Procedures", title: "Precision Approach (ILS / LPV)", min: 4, acsP: "IR.VI.B", acsC: null,
  view: "Side view", alt: "A constant glidepath descent to decision altitude", ref: G2 + " M212 92 H236", track: "M20 30 H80 L250 118 Q262 126 280 128",
  cap: "Lateral and vertical guidance on a steady glidepath, down to the decision altitude.",
  why: "Precision approaches (and LPV/RNAV with vertical guidance) give lateral and vertical guidance, so you can get lower. Small, early corrections are the whole game.",
  setup: ["Brief DA & visibility", "Glidepath intercept altitude", "Adjust for your category"],
  steps: [
    "Brief the approach, including the DA and the visibility minimums for your approach category.",
    "Intercept the final approach course (localizer or LPV) and track it.",
    "Intercept the glidepath at the published altitude and check altitude at the final approach fix.",
    "Descend on the glidepath with small pitch and power corrections. Stay ahead of the needles.",
    "At DA, decide: with the required visual references, continue to land. Without them, go missed immediately."
  ],
  pvt: [["Altitude (before glidepath)", "±100 ft"], ["Heading", "±10°"], ["Airspeed", "±10 kt"], ["Lateral & vertical", "Within ¾-scale"], ["At DA", "Missed if not visual"]],
  com: null,
  errors: ["Chasing the glideslope with big corrections", "Starting the descent late", "Going below DA without the required references", "An unstabilized final"],
  qc: [{q: "What do you do at DA without the required visual references?", a: "Immediately start the missed approach."},
       {q: "Name two approaches with approved vertical guidance.", a: "ILS and LPV (RNAV with vertical guidance)."}],
  refs: [[...IPH, "Ch. 4 — Approaches"], [...IFH, "Ch. 9 — Navigation Systems"], [...CFR, "§ 91.175 — Takeoff and landing under IFR"]]
},
"ir-missed": {
  kind: "ir", area: "Instrument · Approach Procedures", title: "Missed Approach", min: 3, acsP: "IR.VI.C", acsC: null,
  view: "Side view", alt: "Approach descent transitioning to a climb at the missed approach point", ref: G2 + " M185 112 V128", track: "M20 40 L170 105 Q185 110 200 100 L260 60 Q275 52 300 52",
  cap: "At DA or the MAP without the runway, power up and climb on the published missed.",
  why: "A missed approach is a planned, high-workload maneuver at low altitude. Briefing it ahead and flying it decisively is what keeps it routine.",
  setup: ["Brief the missed first", "Power · attitude · configure", "Tell ATC"],
  steps: [
    "Recognize when to go missed: at DA or the MAP without the required references, or any time it becomes unsafe.",
    "Power: full power. Attitude: climb pitch. Configure: flaps and gear per the POH once climbing.",
    "Fly the published missed approach procedure, or ATC's instructions.",
    "If you go missed early, fly to the MAP at or above the MDA/DA before you turn, unless ATC says otherwise.",
    "Tell ATC you're going missed and what you'd like to do next."
  ],
  pvt: [["Airspeed", "±10 kt"], ["Heading / course", "±10°"], ["Altitude", "±100 ft"], ["Initiation", "Prompt, at the right point"]],
  com: null,
  errors: ["Hesitating at minimums", "Turning before reaching the MAP on an early missed", "Losing control during the configuration change", "Not telling ATC"],
  qc: [{q: "You decide to go missed before the MAP. Where do you turn?", a: "Fly to the MAP at or above the MDA/DA before turning, unless ATC instructs otherwise."},
       {q: "You lose sight of the runway while circling. What do you do?", a: "Make a climbing turn toward the landing runway and fly the missed approach."}],
  refs: [[...IPH, "Ch. 4 — Approaches"], [...AIM, "Ch. 5, Sec. 4 — Arrival Procedures (Missed Approach)"]]
},
"ir-circling": {
  kind: "ir", area: "Instrument · Approach Procedures", title: "Circling Approach", min: 3, acsP: "IR.VI.D", acsC: null,
  view: "Top view", alt: "Final approach course to the airport, then a visual circle to land on another runway", ref: "M120 120 H260", track: "M10 60 H200 Q270 60 275 95 Q278 120 245 120 H140",
  cap: "Fly the approach to circling minimums, then maneuver visually to land on another runway.",
  why: "Circling lets you land on a runway the approach doesn't line up with. It's low and slow, at night or in poor visibility, so the limits matter.",
  setup: ["Circling MDA for your category", "Bank ≤30°", "Keep the runway in sight"],
  steps: [
    "Brief the circling MDA and visibility for your approach category, and the protected circling area.",
    "Reach the circling MDA (or your chosen altitude above it) before the MAP.",
    "Keep the runway environment in sight continuously.",
    "Maneuver within the protected area with no more than 30° of bank.",
    "Leave the MDA only when you're in position for a normal descent to land.",
    "Touch down in the first third of the runway."
  ],
  pvt: [["Airspeed", "±10 kt"], ["Heading / track", "±10°"], ["Altitude", "+100/−0 ft"], ["Bank", "Not more than 30°"], ["Touchdown", "First third of runway"]],
  com: null,
  errors: ["Losing sight of the runway", "Descending from the MDA too early", "Steep, low-altitude turns", "Flying outside the protected circling area"],
  qc: [{q: "What's the maximum bank angle?", a: "30°."},
       {q: "Where must you touch down?", a: "In the first third of the runway."}],
  refs: [[...IPH, "Ch. 4 — Approaches"], [...AIM, "Ch. 5, Sec. 4 — Arrival Procedures"]]
},
"ir-landing": {
  kind: "ir", area: "Instrument · Approach Procedures", title: "Landing from an Instrument Approach", min: 3, acsP: "IR.VI.E", acsC: null,
  view: "Side view", alt: "Descent past minimums to a visual landing", ref: "M10 130 H310 M10 100 H200", track: "M20 30 L200 110 Q215 120 230 122 Q250 126 280 128",
  cap: "At minimums (grey line), shift from instruments to outside references and land normally.",
  why: "The transition from instruments to a visual landing is where pilots get caught: ducking under, or staying heads-down too long. Know exactly what you need to see.",
  setup: ["Know the 91.175 references", "Stabilized approach", "Go around if unstable"],
  steps: [
    "As you approach minimums, look for the required visual references while keeping up your instrument scan.",
    "Continue below DA or MDA only if 14 CFR 91.175 is met.",
    "Shift to outside references while still cross-checking glidepath and airspeed.",
    "Stay stabilized and configure for landing per the POH.",
    "Land normally in the touchdown zone, or go around if the approach isn't stable."
  ],
  pvt: [["Decision", "At DA/MDA, per 91.175"], ["Transition", "Smooth, instruments to visual"], ["Landing", "Normal landing"], ["Tolerance", "No numeric value in ACS"]],
  com: null,
  errors: ["Ducking under the glidepath once the runway appears", "Staying heads-down too long", "Continuing without the required references", "An unstabilized final"],
  qc: [{q: "If only the approach lights are visible, how low can you go?", a: "No lower than 100 ft above the touchdown zone elevation, unless the red terminating bars or red side row bars are also visible."},
       {q: "Name three visual references from 91.175.", a: "Any of: approach lights, threshold, threshold markings or lights, REIL, the visual glideslope indicator, touchdown zone or its markings/lights, runway or its markings/lights."}],
  refs: [[...CFR, "§ 91.175 — Takeoff and landing under IFR"], [...IPH, "Ch. 4 — Approaches"]]
},
"ir-lostcomm": {
  kind: "ir", area: "Instrument · Emergency Operations", title: "Loss of Communications", min: 3, acsP: "IR.VII.A", acsC: null,
  view: "Top view", alt: "A route continuing to the clearance limit and approach", ref: "M247 50 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0", track: "M20 120 L100 100 L180 60 L250 50 Q290 50 290 90",
  cap: "Route: assigned, vectored, expected, filed. Altitude: highest of assigned, minimum IFR altitude, or expected.",
  why: "Two-way radio failure in IMC is rare but stressful. 14 CFR 91.185 tells you exactly what to fly, so ATC can predict where you'll be.",
  setup: ["Squawk 7600", "Route: A-V-E-F", "Altitude: highest of 3 (91.185)"],
  steps: [
    "Troubleshoot: frequency, volume, squelch, headset and jacks, and try the other radio or the last frequency.",
    "Squawk 7600.",
    "If you're in VFR conditions or reach them, stay VFR and land as soon as practicable.",
    "In IMC, fly the route in this order: last assigned, vectored (direct to where you were headed), expected, filed.",
    "Fly the highest of: last assigned altitude, the minimum altitude for IFR operations (such as the MEA), or the altitude ATC said to expect.",
    "If the clearance limit is where an approach begins: start descent and the approach as close as possible to your EFC, or your ETA if you have no EFC. If it isn't: leave it at the EFC (or on arrival if none), proceed to an approach fix, and start the approach as close as possible to your ETA."
  ],
  pvt: [["Transponder", "7600"], ["Route (91.185)", "Assigned · vectored · expected · filed"], ["Altitude (91.185)", "Highest of assigned / min IFR / expected"], ["ACS tolerance", "None stated"]],
  com: null,
  errors: ["Skipping the basics of troubleshooting", "Flying the wrong altitude for the segment", "Leaving VFR conditions to continue IFR", "Forgetting to squawk 7600"],
  qc: [{q: "What's the route order for lost comms?", a: "Assigned, vectored, expected, filed (AVEF)."},
       {q: "What altitude do you fly?", a: "The highest of the last assigned altitude, the minimum altitude for IFR operations (e.g., the MEA), or the expected altitude, for that route segment."}],
  refs: [[...CFR, "§ 91.185 — IFR operations: Two-way radio communications failure"], [...AIM, "Ch. 6, Sec. 4 — Two-way Radio Communications Failure"], [...IFH, "Ch. 11 — Emergency Operations"]]
},
"ir-partial": {
  kind: "ir", area: "Instrument · Emergency Operations", title: "Approach with Loss of Primary Flight Instrument Indicators", min: 3, acsP: "IR.VII.D", acsC: null,
  view: "Side view", alt: "Step-down descent to the MDA, flown partial panel", ref: MDA, track: "M20 25 H70 L120 70 H170 L210 100 H275",
  cap: "A nonprecision approach flown with the primary flight instruments covered or failed.",
  why: "If the attitude indicator or PFD fails, you still have to get down safely. Recognizing the failure early and flying the backups smoothly is the whole task.",
  setup: ["Recognize & cover failures", "Backups: turn coord., ASI, alt, VSI", "Ask ATC for no-gyro"],
  steps: [
    "Recognize the failure early: look for instruments that disagree, and cover the failed ones.",
    "Control bank with the turn coordinator (or standby) and heading with the compass or timed turns.",
    "Control pitch with the airspeed indicator, altimeter and VSI.",
    "Tell ATC. You can ask for a no-gyro vector or approach.",
    "Fly the nonprecision approach to the same standards, with gentle, small corrections."
  ],
  pvt: [["Altitude", "±100 ft"], ["Heading", "±10°"], ["Airspeed", "±10 kt"], ["Course", "Within ¾-scale CDI"], ["At MDA", "+100/−0 ft"]],
  com: null,
  errors: ["Taking too long to recognize the failure", "Continuing to use the failed instrument", "Overcontrolling with the backups", "Forgetting magnetic compass turning errors"],
  qc: [{q: "In the Northern Hemisphere, how do compass turning errors work?", a: "Undershoot when rolling out on northerly headings and overshoot on southerly headings (UNOS)."},
       {q: "What can you ask ATC for?", a: "A no-gyro vector or no-gyro approach."}],
  refs: [[...IFH, "Ch. 7 — Airplane Basic Flight Maneuvers"], [...IFH, "Ch. 11 — Emergency Operations"], [...AIM, "5-4-11 — Radar Approaches (no-gyro)"]]
},

"me-before-vmc": {
  kind: "me", area: "Multi-Engine · Emergency Operations", title: "Engine Failure During Takeoff Before Vmc", min: 3, acsP: "PA.IX.E", acsC: "CA.IX.E",
  view: "Side view", alt: "Takeoff roll ending in a straight-ahead stop on the runway", ref: G2 + " M235 122 V138", track: "M20 128 L200 128",
  cap: "Below Vmc, there's only one answer: both throttles closed, straight ahead, stop.",
  why: "Below Vmc there isn't enough rudder to control the airplane with one engine at full power. If an engine fails on the takeoff roll, you stop.",
  setup: ["Takeoff brief out loud", "Know accelerate-stop distance", "Vmc = red line"],
  steps: [
    "Brief the takeoff before you take the runway, including what you'll do if an engine fails on the roll.",
    "During the roll, monitor engine instruments and airspeed.",
    "At an engine failure (or the examiner's simulated failure), close both throttles smoothly and promptly.",
    "Keep directional control with rudder and nosewheel steering.",
    "Brake as needed to stop on the runway.",
    "Complete the POH checklist."
  ],
  pvt: [["Throttles", "Closed smoothly and promptly"], ["Directional control", "Maintained"], ["Brakes", "As necessary"], ["Tolerance", "No numeric value in ACS"]],
  com: [["Throttles", "Closed smoothly and promptly"], ["Directional control", "Maintained"], ["Brakes", "As necessary"], ["Tolerance", "No numeric value in ACS"]],
  errors: ["Hesitating or trying to keep going", "Closing only one throttle", "Losing directional control", "Not knowing the accelerate-stop distance"],
  qc: [{q: "Why not continue the takeoff below Vmc?", a: "There isn't enough rudder authority to counter the asymmetric thrust, so the airplane can yaw and roll out of control."},
       {q: "What is accelerate-stop distance?", a: "The runway needed to accelerate to a specified speed (VR or VLOF), have an engine fail, and bring the airplane to a complete stop."}],
  refs: [[...AFHr, A13], [...FLT, "Takeoff and engine failure"]]
},
"me-after-liftoff": {
  kind: "me", area: "Multi-Engine · Emergency Operations", title: "Engine Failure After Liftoff", min: 4, acsP: "PA.IX.F", acsC: "CA.IX.F",
  view: "Side view", alt: "Climb after liftoff that flattens after an engine failure", ref: G2, track: "M20 128 L110 128 Q150 128 190 95 Q230 70 300 55",
  cap: "Control first, then blue line, then clean up and identify, verify, feather.",
  why: "This is the most critical moment in a twin. Getting control, airspeed and drag right in the first few seconds decides whether the airplane climbs.",
  setup: ["Vyse = blue line", "Identify · verify · feather", "Evaluator: ≥400 ft AGL, ≥Vsse"],
  steps: [
    "Control: rudder to stop the yaw, with up to about 5° of bank toward the operating engine.",
    "Pitch for Vyse (blue line). With obstacles, use Vxse or Vmc + 5 kt, whichever is greater, until clear.",
    "Configure: mixtures, props and throttles forward, then gear and flaps up per the POH.",
    "Identify (\"dead foot, dead engine\"), verify by retarding that throttle, then feather (simulated).",
    "If you can't climb at Vyse, hold Vyse and return to the airport or the most suitable landing area.",
    "Secure the engine (simulated) and complete the checklist."
  ],
  pvt: [["Airspeed", "Vyse ±5 kt"], ["Heading", "±10°"], ["With obstacles", "Vxse or Vmc+5 (greater)"], ["Checklist", "Completed"]],
  com: [["Airspeed", "Vyse ±5 kt"], ["Heading", "±10°"], ["With obstacles", "Vxse or Vmc+5 (greater)"], ["Checklist", "Completed"]],
  errors: ["Letting the airspeed decay below Vyse", "Identifying or feathering the wrong engine", "Not cleaning up the drag (gear, flaps)", "Overbanking or flying uncoordinated"],
  qc: [{q: "What does \"dead foot, dead engine\" mean?", a: "The foot you're not pressing on the rudder is on the side of the failed engine."},
       {q: "What's the lowest altitude for a simulated failure after liftoff on a checkride?", a: "At least 400 ft AGL, and at least Vsse, Vxse or Vyse."}],
  refs: [[...AFHr, A13], [...FLT, "Engine failure after liftoff"]]
},
"me-oei-landing": {
  kind: "me", area: "Multi-Engine · Emergency Operations", title: "Approach and Landing with an Inoperative Engine", min: 3, acsP: "PA.IX.G", acsC: "CA.IX.G",
  view: "Side view", alt: "A stabilized descent to touchdown in the first third of the runway", ref: G2 + " M190 122 V138", track: "M20 30 L195 116 Q212 126 240 128 L300 128",
  cap: "Hold blue line until landing is assured, then configure and land in the first third.",
  why: "With one engine out, a go-around late in the approach may not be possible. The goal is a planned, stable approach that commits only when the landing is assured.",
  setup: ["Engine secured", "Blue line until assured", "Commit point planned"],
  steps: [
    "Complete the engine-out checklist and secure the failed engine.",
    "Plan a normal pattern, staying close enough that you can always make the runway.",
    "Hold at least Vyse until the landing is assured.",
    "Extend gear and flaps per the POH, delaying full flaps until the landing is assured.",
    "Fly the recommended approach speed, adjusting rudder trim as power changes.",
    "Touch down in the first third of the runway with no drift."
  ],
  pvt: [["Approach airspeed", "+10/−5 kt"], ["Touchdown", "First third of runway"], ["Drift", "None; aligned with runway"]],
  com: [["Approach airspeed", "±5 kt"], ["Touchdown", "First third of runway"], ["Drift", "None; aligned with runway"]],
  errors: ["Getting slow on the approach", "Full flaps too early", "Trying a late single-engine go-around", "Poor rudder control as power changes"],
  qc: [{q: "Why delay full flaps?", a: "With one engine, the airplane may not be able to climb or go around once it's fully configured."},
       {q: "Where must you touch down?", a: "In the first third of the runway."}],
  refs: [[...AFHr, A13], [...FLT, "Engine-out approach and landing"]]
},
"me-maneuvering": {
  kind: "me", area: "Multi-Engine · Multiengine Operations", title: "Maneuvering with One Engine Inoperative", min: 4, acsP: "PA.X.A", acsC: "CA.X.A",
  view: "Top view", alt: "Straight flight into a turn and climb on one engine", ref: G2, track: "M20 100 H100 Q140 100 160 70 Q180 40 220 40 H300",
  cap: "Turns, climbs and descents on one engine at zero sideslip.",
  why: "Once the engine is secured, you still have to fly the airplane to a landing. This task proves you can control, configure and maneuver on one engine.",
  setup: ["Safe altitude, near an airport", "Zero sideslip: ~1.5°–2.5° bank", "Ball ⅓–½ toward good engine"],
  steps: [
    "Recognize the failure and keep control: rudder first, up to about 5° of bank toward the operating engine.",
    "Configure: mixtures, props, throttles forward; gear and flaps up.",
    "Identify, verify and feather the failed engine. This task calls for an actual feather, done at a safe altitude.",
    "Establish Vyse and zero sideslip: roughly 1.5°–2.5° of bank toward the good engine (it varies by airplane), ball ⅓ to ½ out toward it.",
    "Fly turns, climbs and descents as specified, with coordinated control.",
    "Restart the engine using the POH restart procedure, and complete the checklist."
  ],
  pvt: [["Altitude", "±100 ft (or min sink)"], ["Airspeed", "±10 kt"], ["Headings", "±10°"], ["Checklist", "Completed"]],
  com: [["Altitude", "±100 ft (or min sink)"], ["Airspeed", "±10 kt"], ["Headings", "±10°"], ["Checklist", "Completed"]],
  errors: ["Flying wings-level with the ball centered (big sideslip)", "Feathering the wrong engine", "Airspeed below Vyse", "Skipping checklist items"],
  qc: [{q: "What's the zero-sideslip setup?", a: "A small bank toward the operating engine (the AFH gives about 1.5°–2.5°, varying by airplane), with the ball ⅓ to ½ deflected toward it."},
       {q: "Why does the airplane roll toward the failed engine?", a: "That wing loses its propwash lift, and the yaw toward the dead engine also adds roll."}],
  refs: [[...AFHr, A13], [...FLT, "Engine-out maneuvering"]]
},
"me-vmc": {
  kind: "me", area: "Multi-Engine · Multiengine Operations", title: "Vmc Demonstration", min: 4, acsP: "PA.X.B", acsC: "CA.X.B",
  view: "Side view", alt: "Pitch rising as airspeed bleeds to the first sign of lost control, then recovery", ref: G2, track: "M20 110 Q120 100 180 50 Q195 40 205 60 Q215 85 300 80",
  cap: "Slow about 1 kt per second until the first sign of losing control, then recover.",
  why: "This shows you what losing directional control feels like, safely at altitude, so you never let it happen near the ground.",
  setup: ["Complete ≥3,000 ft AGL", "Critical engine idle", "≈10 kt above Vsse"],
  steps: [
    "Configure per the POH: gear up, flaps and cowl flaps set for takeoff, trim set for takeoff, props high rpm. Pick an altitude that keeps the whole maneuver at or above 3,000 ft AGL (AFH).",
    "Set the critical engine to idle (windmilling) and the other to takeoff or maximum available power.",
    "Establish a single-engine climb about 10 kt above Vsse, with no more than 5° of bank toward the operating engine.",
    "Raise the pitch slowly to lose about 1 kt per second, adding rudder to hold heading.",
    "At the first sign of lost directional control, stall warning or buffet: reduce power on the operating engine and lower the nose.",
    "Then smoothly add power on the operating engine and accelerate to Vsse or Vyse."
  ],
  pvt: [["Recovery", "First indication of loss of control"], ["Heading", "Within 20° of entry"], ["Recovery airspeed", "Vsse / Vyse +10/−5 kt"], ["Bank", "≤5° toward good engine"], ["Altitude (AFH guidance)", "Complete ≥3,000 ft AGL"]],
  com: [["Recovery", "First indication of loss of control"], ["Heading", "Within 20° of entry"], ["Recovery airspeed", "Vsse / Vyse ±5 kt"], ["Bank", "≤5° toward good engine"], ["Altitude (AFH guidance)", "Complete ≥3,000 ft AGL"]],
  errors: ["Continuing past the first indication", "Adding power on the \"failed\" engine", "Not reducing power on the operating engine", "Ignoring a stall that arrives before Vmc"],
  qc: [{q: "Why can a stall come before Vmc at higher altitudes?", a: "Vmc decreases with altitude (less power available) while indicated stall speed stays the same. A stall with asymmetric power can lead to a spin."},
       {q: "What's the first recovery action?", a: "Reduce power on the operating engine and lower the nose."}],
  refs: [[...AFHr, A13], [...FLT, "Vmc demonstration"]]
},
"me-critical": {
  kind: "me", area: "Multi-Engine · Knowledge", title: "Critical Engine & Vmc Factors", min: 3, acsP: "PA.IX.F.K1", acsC: "CA.IX.F.K1",
  view: "Top view", alt: "Twin airplane outline with the right engine's thrust line farther from the fuselage", ref: "M160 20 V130 M40 70 H280 M120 125 H200 M100 58 V82 M220 58 V82", track: "M108 125 V35 M228 125 V35",
  cap: "P-factor moves the right engine's thrust line farther from center, so losing the left engine hurts most.",
  why: "Understanding why Vmc moves, and why the left engine is critical on most twins, is the foundation for every engine-out decision you make.",
  setup: ["Knowledge task", "P-factor & moment arm", "Red line vs blue line"],
  steps: [
    "Critical engine: the one whose failure most affects performance or handling. On most twins without counter-rotating props, it's the left.",
    "Why the left: P-factor shifts each engine's thrust toward its descending blade, so the right engine's thrust acts on a longer arm from the centerline. Losing the left engine leaves that stronger yawing force.",
    "Vmc (red line) is set at certification under specific worst-case conditions, so the real Vmc changes with conditions.",
    "Things that raise Vmc: more power on the good engine, an aft CG, a windmilling prop, and less bank toward the good engine.",
    "In normally aspirated twins, Vmc decreases with altitude as power decreases.",
    "With an engine out, never fly below Vmc. Climb at Vyse (blue line)."
  ],
  pvt: [["Type", "Knowledge, tested in the oral and flight"], ["Vmc", "Red radial line"], ["Vyse", "Blue radial line"], ["Vsse", "Minimum speed to simulate failure"]],
  com: [["Type", "Knowledge, tested in the oral and flight"], ["Vmc", "Red radial line"], ["Vyse", "Blue radial line"], ["Vsse", "Minimum speed to simulate failure"]],
  errors: ["Thinking Vmc is a fixed number", "Flying wings-level, which raises Vmc", "Forgetting that a windmilling prop raises Vmc", "Mixing up Vxse and Vyse"],
  qc: [{q: "Why is the left engine critical on a conventional twin?", a: "P-factor: the descending blade of the right engine is farther from the centerline, so with the left engine out, the right engine's thrust yaws the airplane the most."},
       {q: "What does an aft CG do to Vmc?", a: "Raises it. The rudder has a shorter arm to the CG, so it's less effective."}],
  refs: [[...AFHr, A13], [...FLT, "Critical engine and Vmc"]]
},
"me-oei-instruments": {
  kind: "ir", me: true, area: "Multi-Engine · Instrument", title: "One Engine Inoperative by Reference to Instruments", min: 3, acsP: "IR.VII.B", acsC: null,
  view: "Side view", alt: "Level flight into a turn on one engine", ref: G2, track: "M20 75 H120 Q160 75 180 55 Q200 35 240 35 H300",
  cap: "Same engine-out flow, flown entirely on instruments, then straight-and-level and turns.",
  why: "An engine failure in IMC stacks two hard tasks. A practiced flow on instruments keeps you from losing control while you sort it out.",
  setup: ["Instruments only", "Control → configure → identify", "Zero sideslip"],
  steps: [
    "Recognize the failure from the instruments: yaw, heading change, the ball, engine gauges.",
    "Keep control with rudder and a small bank toward the operating engine. Hold your altitude or minimum sink.",
    "Configure, identify, verify and feather (simulated).",
    "Set up zero sideslip and trim.",
    "Fly straight-and-level and turns as directed. Tell ATC."
  ],
  pvt: [["Altitude", "±100 ft (or min sink)"], ["Airspeed", "±10 kt"], ["Heading", "±10°"], ["Securing checklist", "Verified"]],
  com: null,
  errors: ["Losing the scan while troubleshooting", "Identifying the wrong engine", "Letting heading wander from asymmetric thrust", "Forgetting to tell ATC"],
  qc: [{q: "On instruments, how do you spot which engine failed?", a: "Yaw and the ball show it, confirmed by rudder pressure (dead foot, dead engine), then verified with the throttle and engine gauges."},
       {q: "What's the altitude standard?", a: "±100 ft, or minimum sink if the airplane can't hold altitude."}],
  refs: [[...IFH, "Ch. 11 — Emergency Operations"], [...AFHr, A13]]
},
"me-oei-approach": {
  kind: "ir", me: true, area: "Multi-Engine · Instrument", title: "Instrument Approach & Landing with an Inoperative Engine", min: 4, acsP: "IR.VII.C", acsC: null,
  view: "Side view", alt: "A glidepath approach to minimums flown on one engine", ref: G2 + " M212 92 H236", track: "M20 30 H80 L250 118 Q262 126 280 128",
  cap: "An instrument approach on one engine: configuration timing is everything.",
  why: "With one engine out, configuration changes and any missed approach cost performance you may not have. Plan the approach around what the airplane can still do.",
  setup: ["Engine secured, ATC told", "Plan gear/flap points", "Know OEI missed performance"],
  steps: [
    "Secure the engine, tell ATC, and ask for the most suitable approach.",
    "Brief the approach and check single-engine performance for a missed approach.",
    "Plan when you'll extend gear and flaps per the POH. Usually delay them until descent or landing is assured.",
    "Track the final approach course and glidepath within tolerance.",
    "At the MDA or DA, land if visual. Go missed only if the POH and conditions allow it."
  ],
  pvt: [["Altitude", "±100 ft (or min sink)"], ["Airspeed", "±10 kt"], ["Heading", "±10°"], ["Final approach", "Within ¾-scale"], ["Minimums", "Arrive at MDA/DA"]],
  com: null,
  errors: ["Configuring too early and losing performance", "Not checking whether a missed approach is possible", "Poor rudder trim during power changes", "Chasing the needles"],
  qc: [{q: "Why delay the gear and flaps?", a: "Drag reduces the airplane's ability to hold altitude or climb on one engine."},
       {q: "What's the course standard on final?", a: "Within ¾-scale deflection, vertical (as applicable) and lateral."}],
  refs: [[...IFH, "Ch. 11 — Emergency Operations"], [...AFHr, A13], [...IPH, "Ch. 4 — Approaches"]]
}
};

/* ---------- Diagram helpers ---------- */
const R = (n) => Math.round(n * 10) / 10;
function poly(pts, x, y, ang, s) {
  const a = ang * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
  return "M" + pts.map(([px, py]) => R(x + s * (px * c - py * sn)) + " " + R(y + s * (px * sn + py * c))).join(" L") + " Z";
}
const PL_TOP = [[9,0],[6,-1],[2,-1],[0,-9],[-2,-9],[-2,-1],[-6,-1],[-8,-4],[-9,-4],[-8.5,0],[-9,4],[-8,4],[-6,1],[-2,1],[-2,9],[0,9],[2,1],[6,1]];
const PL_SIDE = [[10,0.5],[7,-1.5],[3,-2.6],[-1,-2.2],[-7,-1.2],[-9.5,-6],[-11,-6],[-10.5,0.8],[-6,1.6],[6,1.8]];
const HEAD = [[5,0],[-3,-3.5],[-3,3.5]];
function circ(x, y, r) { return "M" + R(x - r) + " " + R(y) + " a" + r + " " + r + " 0 1 0 " + (2 * r) + " 0 a" + r + " " + r + " 0 1 0 " + (-2 * r) + " 0"; }
const GND = "M0 150 H320 V170 H0 Z";
const RWY = (x1, x2) => "M" + x1 + " 147.5 H" + x2 + " V152 H" + x1 + " Z";
const TREE = (x, top) => "M" + (x - 7) + " 150 L" + x + " " + top + " L" + (x + 7) + " 150 Z";
/* ground segment of an attitude indicator: bank in degrees (right wing down +), off = px of nose-up pitch */
function seg(cx, cy, r, bank, off) {
  const b = bank * Math.PI / 180, nx = Math.sin(b), ny = Math.cos(b), n = 90;
  const pts = [], fl = [];
  for (let i = 0; i < n; i++) { const t = i / n * 2 * Math.PI, px = cx + r * Math.cos(t), py = cy + r * Math.sin(t); pts.push([px, py]); fl.push((px - cx) * nx + (py - cy) * ny > off); }
  const st = fl.findIndex((f, i) => f && !fl[(i - 1 + n) % n]);
  if (st < 0) return fl[0] ? circ(cx, cy, r) : "";
  const out = [];
  for (let k = 0; k < n; k++) { const i = (st + k) % n; if (!fl[i]) break; out.push(pts[i]); }
  return "M" + out.map((p) => R(p[0]) + " " + R(p[1])).join(" L") + " Z";
}
function ai(cx, cy, r, bank, off) {
  return {
    sky: circ(cx, cy, r), brown: seg(cx, cy, r, bank, off),
    ref: circ(cx, cy, r) + " M" + cx + " " + (cy - r) + " V" + (cy - r + 6),
    track: "M" + R(cx - r * 0.7) + " " + cy + " H" + R(cx - r * 0.25) + " L" + R(cx - r * 0.12) + " " + R(cy + r * 0.15) + " L" + cx + " " + cy + " L" + R(cx + r * 0.12) + " " + R(cy + r * 0.15) + " L" + R(cx + r * 0.25) + " " + cy + " H" + R(cx + r * 0.7)
  };
}
function sixpack(bank, covered) {
  const A = ai(160, 58, 32, bank, 0);
  const I = { ASI: [90, 58], ALT: [230, 58], TC: [90, 128], HI: [160, 128], VSI: [230, 128] };
  let ref = A.ref, dash = "", surface = "", track = A.track;
  const labels = [];
  Object.keys(I).forEach((k) => {
    const [x, y] = I[k], dx = x - 160, dy = y - 58, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
    ref += " " + circ(x, y, 22);
    dash += " M" + R(160 + ux * 35) + " " + R(58 + uy * 35) + " L" + R(x - ux * 25) + " " + R(y - uy * 25);
    labels.push([x, y + 3.5, k, "middle"]);
  });
  (covered || []).forEach((k) => {
    const [x, y] = k === "AI" ? [160, 58] : I[k], h = k === "AI" ? 34 : 24;
    surface += " M" + (x - h) + " " + (y - h) + " H" + (x + h) + " V" + (y + h) + " H" + (x - h) + " Z";
    labels.push([x, y + (k === "AI" ? 4 : 14), "INOP", "middle", 1]);
  });
  return { sky: A.sky, brown: (covered || []).includes("AI") ? "" : A.brown, ref, dash, surface, track: (covered || []).includes("AI") ? "" : track, labels };
}
function mk(o) {
  const planes = (o.planes || []).map(([x, y, a, k, s]) => poly(k === "t" ? PL_TOP : PL_SIDE, x, y, a, s || 1.5)).join(" ");
  const arrows = (o.arrows || []).map(([x, y, a]) => poly(HEAD, x, y, a, 1.3)).join(" ");
  const dots = (o.dots || []).map(([x, y, r]) => circ(x, y, r || 3)).join(" ");
  let wind = "", windHead = "";
  if (o.wind) {
    const [x, y, a, len] = o.wind, rad = a * Math.PI / 180, ex = x + len * Math.cos(rad), ey = y + len * Math.sin(rad);
    wind = "M" + x + " " + y + " L" + R(ex) + " " + R(ey);
    windHead = poly(HEAD, ex, ey, a, 1.6);
  }
  const out = { sky: o.sky || "", ground: o.ground || "", brown: o.brown || "", surface: o.surface || "", dash: o.dash || "", ref: o.ref || "", ghost: o.ghost || "", track: o.track || "", wind, windHead, arrows, dots, planes };
  const lb = o.labels || [];
  for (let i = 0; i < 8; i++) {
    const l = lb[i];
    out["l" + i] = l ? { x: l[0], y: l[1], t: l[2], a: l[3] || "start", c: l[4] ? "#F5A623" : "#DCE4F0" } : { x: 0, y: 0, t: "", a: "start", c: "#DCE4F0" };
  }
  return out;
}
const SIDE = (o) => mk(Object.assign({ ground: GND }, o));

const DIAG = {
"normal-takeoff": () => SIDE({ surface: RWY(20, 270), dash: "M30 150 H260",
  track: "M30 146 L140 146 Q180 146 300 52", dots: [[140, 146]], arrows: [[105, 146, 0]],
  planes: [[60, 144, 0, "s"], [250, 86, -32, "s"]],
  labels: [[85, 163, "Takeoff roll · centerline", "middle"], [140, 136, "Rotate (Vr)", "middle", 1], [292, 46, "Climb at Vy", "end"], [200, 104, "Crab to hold extended centerline", "end"]] }),
"normal-landing": () => SIDE({ surface: RWY(170, 315), dash: "M210 140 V158",
  track: "M20 35 L198 140 Q214 146 240 146 L300 146", arrows: [[110, 88, 30]],
  planes: [[60, 58, 30, "s"], [262, 144, 0, "s"]],
  labels: [[20, 25, "Stabilized final · approach speed", "start"], [218, 128, "Round out & flare", "end"], [210, 165, "Touchdown point", "middle", 1], [110, 120, "Crosswind: wing low, opposite rudder", "middle"]] }),
"soft-takeoff": () => SIDE({ surface: RWY(15, 300), dash: "M60 124 H240",
  track: "M20 146 L70 146 Q85 137 105 137 L190 137 Q235 133 300 50", dots: [[100, 137]], arrows: [[150, 137, 0]],
  planes: [[42, 144, -8, "s"], [160, 135, 0, "s"], [266, 78, -38, "s"]],
  labels: [[150, 118, "Ground effect ≈ one wingspan", "middle"], [100, 163, "Keep rolling · nose high", "middle"], [100, 132, "Liftoff", "end", 1], [295, 44, "Vx / Vy", "end"]] }),
"soft-landing": () => SIDE({ surface: RWY(130, 315), dash: "M150 124 H290",
  track: "M20 40 L160 122 Q180 133 220 134 Q250 135 268 146 L300 146", arrows: [[95, 84, 30]],
  planes: [[60, 63, 30, "s"], [212, 132, -5, "s"], [292, 144, -8, "s"]],
  labels: [[20, 30, "Stabilized approach · flaps per POH", "start"], [220, 118, "Hold it off in ground effect", "middle"], [250, 163, "Touch down slow · nose up · keep moving", "middle", 1]] }),
"short-takeoff": () => SIDE({ surface: RWY(15, 120) + " " + TREE(150, 104), dash: "M118 100 H182",
  track: "M22 146 L90 146 L150 85 Q175 62 300 35", dots: [[90, 146]], arrows: [[60, 146, 0]],
  planes: [[40, 144, 0, "s"], [120, 116, -45, "s"], [255, 45, -14, "s"]],
  labels: [[20, 163, "Use all the runway · full power", "start"], [90, 136, "Rotate", "end", 1], [186, 104, "50 ft / obstacle", "start"], [160, 70, "Vx", "end", 1], [300, 28, "Then Vy", "end"]] }),
"short-landing": () => SIDE({ surface: RWY(150, 300) + " " + TREE(70, 72), dash: "M200 141 V158",
  track: "M20 15 L193 139 Q203 146 216 146 L250 146", arrows: [[140, 101, 35]],
  planes: [[110, 79, 35, "s"], [238, 144, 0, "s"]],
  labels: [[70, 163, "Obstacle", "middle"], [86, 46, "Steeper, slower final", "start"], [200, 165, "On the point", "middle", 1], [306, 136, "Minimal float · brake", "end"]] }),
"forward-slip": () => SIDE({ surface: RWY(170, 315) + " M240 18 H310 V42 H240 Z", dash: "M215 141 V158 M244 30 H306",
  ghost: "M20 20 L300 88", track: "M20 20 L176 132 Q192 146 222 146 L300 146", arrows: [[100, 77, 36]],
  planes: [[272, 30, -22, "t", 1.2], [70, 56, 36, "s"]],
  labels: [[300, 98, "Normal glide overshoots", "end"], [96, 108, "Slip: steeper, same airspeed", "start", 1], [215, 165, "Point", "middle"], [275, 52, "Top view: nose yawed,", "middle"], [275, 62, "track stays aligned", "middle"]] }),
"go-around": () => SIDE({ surface: RWY(150, 315),
  track: "M20 40 L150 118 Q175 130 195 120 Q240 95 300 45", dots: [[172, 126]], arrows: [[90, 82, 31], [250, 86, -35]],
  planes: [[60, 64, 31, "s"], [272, 63, -38, "s"]],
  labels: [[20, 30, "Approach not right", "start"], [172, 140, "Decide early", "middle", 1], [300, 36, "Power · Attitude · Configure", "end"], [230, 163, "Sidestep to see traffic", "middle"]] }),
"steep-turns": () => mk({ dash: "M30 25 H160", track: "M160 25 A60 60 0 1 1 159.9 25",
  arrows: [[220, 85, 90], [160, 145, 180], [100, 85, -90]], planes: [[160, 25, 0, "t"]],
  ref: "M262 95 L310 75 M286 85 V100",
  labels: [[30, 18, "Entry heading & horizon reference", "start"], [160, 82, "360° · constant altitude", "middle"], [160, 95, "45° PVT / 50° COM", "middle", 1], [160, 163, "Lead rollout ≈ ½ bank angle", "middle"], [286, 112, "Bank", "middle"]] }),
"rectangular-course": () => mk({ surface: "M100 55 H220 V115 H100 Z",
  track: "M80 30 H240 Q255 30 255 45 V125 Q255 140 240 140 H80 Q65 140 65 125 V45 Q65 30 80 30",
  arrows: [[160, 30, 0], [255, 70, 90], [160, 140, 180], [65, 100, -90]],
  planes: [[120, 30, 0, "t"], [255, 100, 105, "t"]], wind: [12, 85, 0, 34],
  labels: [[160, 22, "Downwind · fastest groundspeed", "middle"], [160, 89, "Field", "middle"], [160, 156, "Upwind · slowest groundspeed", "middle"], [262, 62, "Crab", "start", 1], [14, 78, "WIND", "start"], [262, 30, "Steepest", "start", 1]] }),
"s-turns": () => mk({ surface: "M10 82 H310 V88 H10 Z",
  track: "M40 85 A40 40 0 0 1 120 85 A40 40 0 0 0 200 85 A40 40 0 0 1 280 85",
  arrows: [[80, 45, 0], [160, 125, 0], [240, 45, 0]], planes: [[40, 85, -90, "t"]], wind: [300, 160, -90, 30],
  labels: [[48, 52, "Steepest", "start", 1], [126, 104, "Shallowest", "start", 1], [304, 78, "Road", "end"], [296, 136, "WIND", "end"], [160, 163, "Equal half circles · cross road wings level", "middle"]] }),
"turns-around-point": () => mk({ track: "M160 30 A55 55 0 1 1 159.9 30", dots: [[160, 85, 3.5]],
  arrows: [[215, 85, 90], [160, 140, 180], [105, 85, -90]], planes: [[160, 30, 0, "t"]], wind: [12, 85, 0, 34],
  labels: [[160, 22, "Downwind · steepest bank", "middle", 1], [160, 158, "Upwind · shallowest bank", "middle", 1], [168, 82, "Point", "start"], [14, 78, "WIND", "start"], [306, 100, "Constant radius", "end"]] }),
"slow-flight": () => SIDE({ dash: "M30 82 H290", ref: "M215 82 A60 60 0 0 0 213 66", arrows: [[290, 82, 0]],
  planes: [[160, 82, -12, "s", 4.2]],
  labels: [[30, 75, "Flight path (level)", "start"], [222, 62, "High AOA", "start", 1], [160, 122, "Just above the stall warning", "middle"], [160, 136, "Power for altitude · pitch for airspeed", "middle"], [160, 163, "Complete ≥ 1,500 ft AGL", "middle"]] }),
"power-off-stall": () => SIDE({ track: "M20 50 L115 92 Q150 104 168 86 Q178 76 190 96 Q205 122 245 112 L300 85", dots: [[178, 80]],
  planes: [[60, 68, 24, "s"], [160, 92, -35, "s"], [200, 110, 45, "s"], [285, 92, -25, "s"]],
  labels: [[20, 40, "Approach config · stabilized descent", "start"], [178, 70, "Stall", "middle", 1], [195, 132, "Reduce AOA → level wings → power", "middle"], [300, 76, "Climb", "end"], [160, 163, "Complete ≥ 1,500 ft AGL", "middle"]] }),
"power-on-stall": () => SIDE({ track: "M20 130 Q90 120 140 58 Q155 40 172 66 Q188 98 235 92 L300 75", dots: [[156, 50]],
  planes: [[60, 126, -12, "s"], [128, 72, -58, "s"], [186, 88, 50, "s"], [285, 79, -15, "s"]],
  labels: [[20, 112, "Liftoff speed · ≥65% power", "start"], [160, 40, "Stall", "start", 1], [238, 112, "Reduce AOA · right rudder", "middle"], [160, 163, "Complete ≥ 1,500 ft AGL", "middle"]] }),
"spin-awareness": () => SIDE({ track: "M160 15 Q225 25 160 35 Q95 45 160 55 Q225 65 160 75 Q95 85 160 95 Q210 105 182 118 L250 140",
  arrows: [[200, 28, 30], [120, 48, 150], [200, 68, 30]], planes: [[262, 141, 18, "s"]],
  labels: [[20, 30, "Stalled wing", "start"], [20, 43, "+ yaw = spin", "start", 1], [214, 92, "Power idle · ailerons neutral", "start"], [214, 105, "Full opposite rudder", "start"], [214, 118, "Forward elevator", "start"], [20, 163, "Prevent: coordinate, reduce AOA early", "start"]] }),
"emergency-descent": () => SIDE({ dash: "M200 140 H312",
  track: "M20 25 Q60 25 100 62 L215 128 Q245 140 300 140", arrows: [[160, 97, 30]],
  planes: [[100, 62, 35, "s"], [290, 140, 0, "s"]],
  labels: [[20, 18, "Power idle · bank 30°–45°", "start"], [120, 56, "Emergency descent speed, within limits", "start"], [250, 132, "Level off ±100 ft", "middle", 1], [160, 163, "Clear the area below first", "middle"]] }),
"emergency-landing": () => mk({ surface: "M110 120 H275 V140 H110 Z",
  track: "M40 30 H240 Q280 30 280 70 V90 Q280 128 245 130 H130", dots: [[40, 30, 4]],
  arrows: [[140, 30, 0], [280, 80, 90], [200, 130, 180]], planes: [[150, 130, 180, "t"]], wind: [306, 108, 180, 30],
  labels: [[40, 20, "Engine fails → best glide", "start", 1], [272, 70, "Plan the pattern", "end"], [192, 156, "Field · into the wind", "middle"], [300, 100, "WIND", "end"], [40, 50, "Restart checklist · 7700", "start"]] }),
"steep-spiral": () => SIDE({ dash: "M160 122 V148", dots: [[160, 150, 3]],
  track: "M160 20 C260 20 260 45 160 45 C60 45 60 70 160 70 C260 70 260 95 160 95 C60 95 60 120 160 120 L205 120",
  arrows: [[235, 33, 90], [85, 58, 90], [235, 83, 90]],
  labels: [[12, 22, "Power idle · glide speed", "start"], [12, 35, "≥ 3 turns · ≤ 60° bank", "start"], [205, 113, "Roll out on heading ±10°", "start"], [168, 163, "Point · finish ≥ 1,500 AGL", "start"], [262, 33, "Steepest downwind", "start", 1]] }),
"chandelle": () => SIDE({ dots: [[245, 92]],
  track: "M30 140 L110 140 Q235 140 245 92 Q250 50 150 38 L110 38", arrows: [[180, 136, -10], [205, 42, 190]],
  planes: [[60, 140, 0, "s"], [118, 38, 180, "s"]],
  labels: [[30, 163, "Entry ≤ VA · roll to ~30°", "start"], [235, 120, "0°–90°: hold bank, raise pitch", "end"], [252, 92, "90°", "start", 1], [190, 25, "90°–180°: hold pitch, roll out", "middle"], [104, 56, "180°: wings level, just above stall", "start", 1]] }),
"lazy-eight": () => mk({ dash: "M10 85 H310",
  track: "M160 85 C200 25 290 25 290 85 C290 145 200 145 160 85 C120 25 30 25 30 85 C30 145 120 145 160 85",
  dots: [[245, 40], [290, 85], [245, 130], [160, 85]], arrows: [[215, 48, -15]],
  labels: [[245, 30, "45° · max pitch up", "middle", 1], [245, 88, "90° · max bank, slowest", "middle"], [245, 148, "135° · max pitch down", "middle"], [160, 76, "180°", "middle"], [12, 80, "Horizon", "start"], [75, 163, "Then the same, turning the other way", "start"]] }),
"eights-on-pylons": () => mk({ dash: "M280 85 L229 85", dots: [[95, 85, 4], [225, 85, 4]],
  track: "M160 85 C190 30 280 30 280 85 C280 140 190 140 160 85 C130 30 40 30 40 85 C40 140 130 140 160 85",
  arrows: [[220, 45, 0], [100, 45, 180]], planes: [[280, 85, 90, "t"]], wind: [306, 14, 90, 30],
  labels: [[95, 103, "Pylon", "middle"], [225, 103, "Pylon", "middle"], [254, 79, "Sight line", "middle", 1], [300, 54, "WIND", "end"], [160, 163, "Pivotal altitude ≈ GS² ÷ 11.3 (knots)", "middle"]] }),
"power-off-180": () => mk({ surface: "M60 128 H290 V140 H60 Z", dash: "M110 46 V122 M110 124 V144",
  track: "M290 40 H100 Q45 40 45 85 Q45 134 95 134 H112", dots: [[110, 40, 3.5]],
  arrows: [[200, 40, 180], [45, 90, 90], [80, 134, 0]], planes: [[240, 40, 180, "t"]],
  labels: [[116, 30, "Abeam point: power idle", "start", 1], [56, 95, "Best glide · flaps/slip", "start"], [56, 107, "to adjust (no power)", "start"], [110, 158, "Touchdown: 0 to +200 ft", "start"], [295, 136, "Runway", "end"]] }),
"accelerated-stall": () => mk({ track: "M40 140 Q40 60 140 52 Q230 46 240 100 L248 140", dots: [[240, 100]],
  arrows: [[90, 64, -35], [205, 58, 30]], planes: [[40, 140, -90, "t"]],
  labels: [[54, 140, "Roll into 45°", "start"], [54, 152, "Airspeed ≤ VA", "start"], [140, 42, "Smooth, firm back pressure", "middle"], [234, 108, "First indication: recover", "end", 1], [312, 163, "Complete ≥ 3,000 ft AGL", "end"]] }),

"ir-flight": () => { const s = sixpack(10, []); return mk(Object.assign(s, { labels: s.labels.concat([[160, 104, "AI: center of the scan", "middle", 1], [12, 163, "Cross-check · interpret · control", "start"]]) })); },
"ir-unusual": () => { const a = ai(85, 64, 46, -25, 26), b = ai(235, 64, 46, 30, -28);
  return mk({ sky: a.sky + " " + b.sky, brown: a.brown + " " + b.brown, ref: a.ref + " " + b.ref, track: a.track + " " + b.track,
    labels: [[85, 128, "Nose high", "middle", 1], [85, 142, "Power ↑ · nose ↓ · level wings", "middle"], [235, 128, "Nose low", "middle", 1], [235, 142, "Power ↓ · level wings · nose ↑", "middle"], [160, 163, "Confirm on more than one instrument", "middle"]] }); },
"ir-holding": () => mk({ dash: "M10 50 H230", dots: [[230, 50, 4]],
  track: "M90 50 H230 A30 30 0 0 1 230 110 H90 A30 30 0 0 1 90 50",
  arrows: [[160, 50, 0], [260, 80, 90], [160, 110, 180], [60, 80, -90]], planes: [[125, 50, 0, "t"]],
  labels: [[236, 44, "Fix", "start", 1], [160, 40, "Inbound · 1 min (≤ 14,000 MSL)", "middle"], [160, 126, "Outbound · time from abeam", "middle"], [12, 152, "Entries: direct · parallel · teardrop", "start"], [12, 164, "Slow to holding speed ≤ 3 min before the fix", "start"]] }),
"ir-tracking": () => mk({ dash: "M160 160 L160 34 M160 160 L82 82 M160 160 L238 82", dots: [[160, 160, 4]],
  track: "M50 160 A110 110 0 0 1 270 160", arrows: [[160, 50, 0], [82.2, 82.2, -45]], planes: [[238, 82, 45, "t"]],
  labels: [[160, 26, "Radial / final approach course", "middle"], [168, 154, "VOR/DME", "start"], [272, 128, "Arc ±1 NM", "start", 1], [250, 70, "Pointer on wingtip", "start"], [12, 30, "Intercept 30°–45°", "start"], [12, 43, "Lead the turn", "start"]] }),
"ir-departure": () => mk({ surface: "M18 136 L58 136 L58 144 L18 144 Z",
  track: "M58 140 L100 110 L180 80 L240 40 L312 25", dots: [[100, 110], [180, 80], [240, 40]], arrows: [[140, 95, -20], [276, 32, -12]],
  planes: [[210, 60, -34, "t"]],
  labels: [[18, 160, "Departure (ODP / SID)", "start"], [108, 124, "Check the climb gradient", "start"], [180, 98, "En route · verify the route", "middle"], [236, 28, "Arrival (STAR)", "end"], [12, 20, "Copy · read back · load · verify", "start", 1]] }),
"ir-npa": () => SIDE({ surface: RWY(250, 316), dash: "M10 110 H310 M60 26 V150 M150 56 V150 M275 104 V150",
  track: "M20 30 H60 L100 60 H150 L185 92 H200 L215 110 H275", planes: [[245, 110, 0, "s"]],
  labels: [[60, 20, "FAF", "middle"], [150, 50, "Step-down fix", "middle"], [12, 104, "MDA", "start", 1], [275, 98, "MAP", "middle", 1], [60, 163, "Descend only after each fix", "start"]] }),
"ir-precision": () => SIDE({ surface: RWY(240, 316), dash: "M10 118 H310 M90 35 V150",
  track: "M20 40 H90 L255 140 Q265 146 285 146", planes: [[150, 76, 31, "s"]], arrows: [[200, 107, 31]],
  labels: [[90, 28, "FAF · glidepath intercept", "middle"], [12, 112, "DA", "start", 1], [310, 112, "Visual? Land. If not, missed.", "end"], [160, 163, "Lateral & vertical within ¾ scale", "middle"]] }),
"ir-missed": () => SIDE({ surface: RWY(220, 316), dash: "M180 30 V150 M10 114 H200",
  track: "M20 40 L170 112 Q188 120 205 108 L265 65 Q280 56 310 56", dots: [[180, 116]],
  planes: [[100, 78, 26, "s"], [270, 62, -30, "s"]],
  labels: [[180, 22, "MAP / DA", "middle", 1], [12, 108, "Minimums", "start"], [312, 90, "Fly the published missed", "end"], [200, 136, "Power · attitude · configure", "start"], [12, 163, "Early missed: fly to the MAP before turning", "start"]] }),
"ir-circling": () => mk({ surface: "M130 118 H270 V128 H130 Z", dash: "M90 123 A110 70 0 0 1 310 123",
  track: "M10 60 H210 Q275 60 280 95 Q284 123 245 123 H150", arrows: [[120, 60, 0], [282, 100, 90], [200, 123, 180]],
  planes: [[70, 60, 0, "t"]],
  labels: [[12, 52, "Final approach course", "start"], [296, 52, "Circle at MDA · ≤ 30° bank", "end", 1], [150, 145, "Touch down in the first third", "start"], [12, 163, "Lose the runway? Climbing turn toward it, fly the missed", "start"]] }),
"ir-landing": () => SIDE({ surface: RWY(205, 316), dash: "M10 110 H210",
  track: "M20 30 L200 125 Q215 140 235 146 L290 146", dots: [[165, 149, 1.8], [175, 149, 1.8], [185, 149, 1.8], [195, 149, 1.8]],
  planes: [[110, 78, 28, "s"]],
  labels: [[12, 104, "DA / MDA", "start", 1], [120, 52, "Look for the 91.175 references", "start"], [180, 163, "Approach lights", "middle"], [262, 163, "Touchdown zone", "middle"], [312, 130, "Stabilized, normal landing", "end"]] }),
"ir-lostcomm": () => mk({ track: "M20 140 L100 115 L180 70 L245 50 H285 A12 12 0 0 1 285 74 H245 A12 12 0 0 1 245 50",
  dots: [[100, 115], [180, 70], [245, 50, 4]], arrows: [[140, 92, -30]], planes: [[60, 128, -17, "t"]],
  labels: [[20, 160, "Squawk 7600", "start", 1], [108, 130, "Route: assigned · vectored · expected · filed", "start"], [245, 40, "Clearance limit", "middle"], [252, 94, "Leave at EFC (91.185)", "start"], [12, 20, "Altitude: highest of assigned,", "start"], [12, 33, "minimum IFR, or expected", "start"]] }),
"ir-partial": () => { const s = sixpack(0, ["AI", "HI"]); return mk(Object.assign(s, { labels: s.labels.concat([[12, 163, "Cover failed instruments · fly the backups", "start"]]) })); },

"me-critical": () => mk({ surface: "M155 20 Q160 10 165 20 L166 142 L154 142 Z M40 66 H280 V78 H40 Z M125 134 H195 V142 H125 Z M93 50 H111 V88 H93 Z M209 50 H227 V88 H209 Z",
  ref: "M82 50 H122 M198 50 H238", dash: "M108 34 H160 M160 34 H224",
  track: "M108 48 V18 M224 48 V18", arrows: [[108, 16, -90], [224, 16, -90]],
  labels: [[134, 30, "Short arm", "middle"], [192, 30, "Long arm", "middle", 1], [102, 104, "Left (critical)", "middle", 1], [218, 104, "Right", "middle"], [160, 163, "P-factor: thrust shifts toward each descending blade", "middle"]] }),
"me-before-vmc": () => mk({ surface: "M20 70 H300 V100 H20 Z", dash: "M30 85 H290", ref: "M240 64 V106",
  ghost: "M150 85 Q220 85 262 40", track: "M30 85 H200", dots: [[150, 85, 3.5]], arrows: [[100, 85, 0]], planes: [[212, 85, 0, "t", 1.7]],
  labels: [[150, 62, "Engine fails", "middle", 1], [240, 120, "Vmc", "middle"], [100, 120, "Both throttles closed · brake · stop", "middle"], [316, 30, "Continuing = loss of control", "end"]] }),
"me-after-liftoff": () => SIDE({ surface: RWY(15, 150),
  track: "M20 146 L100 146 Q140 146 175 112 Q220 85 300 68", dots: [[175, 112]],
  planes: [[60, 144, 0, "s"], [262, 76, -14, "s"]],
  labels: [[175, 128, "Engine fails", "middle", 1], [300, 60, "Vyse (blue line)", "end"], [12, 20, "Control → configure →", "start"], [12, 33, "identify · verify · feather", "start"], [160, 163, "Obstacles? Vxse or Vmc + 5 until clear", "middle"]] }),
"me-oei-landing": () => SIDE({ surface: RWY(180, 316), dash: "M223 141 V158",
  track: "M20 30 L195 136 Q212 146 240 146 L300 146", arrows: [[110, 84, 31]], planes: [[70, 60, 31, "s"]],
  labels: [[20, 20, "Hold Vyse until landing is assured", "start"], [130, 118, "Gear & flaps per POH", "end"], [200, 165, "First third", "middle", 1], [312, 136, "No go-around late", "end"]] }),
"me-maneuvering": () => mk({ track: "M20 110 H110 Q150 110 165 80 Q180 50 220 50 H300", arrows: [[140, 98, -50]],
  planes: [[70, 110, 0, "t", 1.8], [262, 50, 0, "t", 1.8]], ref: "M235 140 Q265 156 295 140", dots: [[274, 149, 4]], dash: "M265 136 V158",
  labels: [[12, 22, "Zero sideslip:", "start", 1], [12, 35, "~1.5°–2.5° bank toward good engine", "start"], [12, 48, "ball ⅓–½ toward good engine", "start"], [70, 132, "Feathered", "middle"], [265, 128, "Ball", "middle"]] }),
"me-vmc": () => SIDE({ dash: "M10 140 H310",
  track: "M20 120 Q110 110 175 60 Q190 48 200 66 Q212 92 300 88", dots: [[192, 55]],
  planes: [[100, 108, -22, "s"], [282, 88, 0, "s"]],
  labels: [[12, 134, "≥ 3,000 ft AGL (AFH)", "start"], [60, 100, "Slow ~1 kt/s", "start"], [192, 44, "First indication: recover", "middle", 1], [300, 106, "Vsse / Vyse", "end"], [160, 163, "Critical engine idle · other at max power", "middle"]] }),
"me-oei-instruments": () => { const s = sixpack(2, []); return mk(Object.assign(s, { labels: s.labels.concat([[160, 104, "Small bank toward good engine", "middle", 1], [12, 163, "Control · configure · identify · verify · feather", "start"]]) })); },
"me-oei-approach": () => SIDE({ surface: RWY(240, 316), dash: "M10 118 H310 M90 35 V150", dots: [[150, 76], [215, 116]],
  track: "M20 40 H90 L255 140 Q265 146 285 146",
  labels: [[90, 28, "FAF", "middle"], [156, 70, "Configure per POH", "start"], [220, 106, "Landing assured", "end", 1], [12, 112, "DA / MDA", "start"], [160, 163, "Know your one-engine missed performance", "middle"]] })
};

export { LESSONS, DIAG };
