# AVTODROM — Category B driving simulator

A local Three.js / Rapier simulator built around the supplied Chevrolet Cobalt, Uzbek autodrome diagram, penalty table, and instructional video. Uzbek Latin and Russian interfaces; guided practice, individual exercises, and a scored manual-transmission exam.

## Run

Requires Node.js 24 or newer. Dependencies are pinned in `package-lock.json`.

The reference videos in `video/` use Git LFS. Install [Git LFS](https://git-lfs.com/) before cloning, or run `git lfs install` followed by `git lfs pull` in an existing clone to download them.

```powershell
npm ci
npm run dev
```

Open the Local URL printed by Vite (normally http://127.0.0.1:5173). Use Chrome or Edge with hardware acceleration enabled. Everything runs locally; no account, server database, API key, or remote asset requests are required.

On Windows, after dependencies are installed, you can also double-click **Start Simulator.cmd**.

```powershell
npm test          # Rule, physics, geometry, and complete-route sensor tests
npm run build    # Type check + production build into dist/
npm run preview  # Serve the production build locally
```

`npm run test:browser` runs browser checks against the dev server. It uses an installed Chrome via `CHROME_PATH`, the detected local Playwright Chromium, or Playwright's default browser. If no browser is installed, run `npx playwright install chromium`. Results and screenshots go to `test-results/`.

`npm run test:steering` checks full steering travel at 5/40/60/100 km/h and in reverse, slower keyboard input at speed, optional steering assistance, settings persistence, exam bypass and the cabin/road wheel animation. Separate flat-track runs exercise turning, countersteering and releasing at 10/60/100 km/h, including front-tyre slip under excessive steering. Screenshots and reports go to `test-results/steering/`.

`npm run test:railway` checks the railway crossing in the full course at 8, 25 and 45 km/h, in reverse, obliquely and in the opposite lane. The rails have rounded running heads, narrow webs, broad feet, sleepers, baseplates and spring fasteners beneath weathered deck boards and packed infill. Asphalt meets the outer rail faces directly. Shared rail/deck profiles supply real tyre support and suspension movement. Traversable surfaces are separate from collision-penalty obstacles. Video 07:08 and 07:32 guide the two connected L-shaped stopping lines and the open area between them. The minimap shares these paths. Screenshots, a clearly labelled construction cutaway and measurements are in `test-results/railway/`. Construction dimensions are modelling estimates.

`npm run test:play` drives the start and pedestrian crossing with keyboard controls and telemetry feedback, then checks reverse, steering, remapping, menu layout, wheel placement, and route arrows. It saves review screenshots and diagnostics in `test-results/review/`. Run it against the development server.

`npm run test:markings` checks that signs stand outside driveable asphalt, have readable fronts and plain backs, and that pedestrian practice starts without a false stop penalty. It captures the crossing approach, overhead layout, and hill sign in `test-results/road-markings/`.

`npm run test:intersection` checks the four signal approaches, visible white curbs, roadside signs and seven lighting phases. It also advances the simulated clock and checks pause behaviour. Intersection screenshots and the report are saved to `test-results/intersection/`. Signals on crossing roads use separate phases; the HUD and red-light penalties use the same controller.

The junction uses four shared signal posts. Each carries opposing front/rear vehicle heads and bracket-mounted pedestrian heads serving the two adjacent zebras, matching the user's examination-centre reference. The pedestrian heads have standing red and walking green figures, 200 mm lenses and visors. The smooth black housings have thin white contrast borders. Vehicle panels have semicircular ends and a lower edge at 2.27 m; oval pedestrian panels have their lower edge at 2.335 m. The crossing sign sits below the cluster. Both pedestrian heads use short brackets, with the adjacent crossing's head offset to the opposite side to keep the rear vehicle lenses visible. Both vehicle and pedestrian heads have slim capsule housings, oval contrast panels and smoothly flared hoods with elliptical sloping openings, following the supplied modern Tashkent signal photographs. Housing depths are 75 mm for vehicles and 65 mm for pedestrians. Both shells sit against their oval panels, with the pedestrian shell's former gap removed. The lenses, symbols and complete hoods move inward together; visor shapes and post arrangements remain fixed. These depths are visual modelling choices guided by the supplied photos. Rear access panels and galvanized supports remain, without added housing seams or face screws. The local 85-second training cycle reserves seconds 69–81 for pedestrians, with blinking green during the final three seconds and clearance before vehicles restart. All vehicle signals stay red throughout the pedestrian interval, including for turns. `npm run test:pedestrian-signals` checks mounting heights, clearance from crossing signs, shared mounts, front/rear agreement, visibility from the opposite verge, all signal states and desktop/mobile views in `test-results/pedestrian-signals/`.

`npm run reference:frames` extracts 24 timestamped samples from `video/RQZeRiXdsk9ualSykoFF+J6Yl64tQNes.mp4`, with a contact sheet in `test-results/reference-video/`. Supply timestamps in seconds after `--` for specific frames. It uses Chromium's video decoder and the installed Sharp image dependency. `npm run test:video` captures the updated exercises and checks curb colours, railway signage, stop feedback, and whether instruments cover the chase car at desktop sizes.

`npm run test:model` captures the Cobalt exterior, cabin, real cockpit camera, and nine lighting states in `test-results/model-review/`. It checks that the speed display and tachometer are unobstructed from the driver's eye, and measures visible red brake/white reverse pixels on both outer lenses. Checks include braking after a stall and braking while reverse is selected. The inspection uses development telemetry controls while paused.

`npm run test:cabin` captures nine interior views and checks the ceiling, rear bench, cushion cloth, pillar trim and wheel-well lining. Asset tests also verify closed seat seams, upholstery clearance, defrost slots, the shift-pattern cap and preservation of the floor/firewall. Reports and images are in `test-results/cabin-review/`.

`npm run test:rear-lights` checks rear indicators, both white reversing lights selected with R, all three stop lamps (including the high-mounted lamp behind the rear glass), and brake/reverse combinations. Brake lights remain active after an engine stall. Medium/low-quality screenshots and the report are in `test-results/rear-lights/`.

`npm run test:front-lights` checks keyboard/HUD light switches, both visible headlamps and fog lamps, synchronized amber front/rear indicators and hazards at medium/low quality. A dimmed test scene measures real road illumination near the car and 15 metres ahead; front glows must remain invisible from behind. Reports and screenshots are in `test-results/front-lights/`.

`npm run test:column-controls` captures the turn-signal/high-beam and wiper stalks with their separate legends. The left switch has the long Cobalt/R4 MENU and SET/CLR grip, and the right has wiper-speed legends and a knurled selector. Keyboard checks cover Q/E selection and cancellation, a latched lever while steering, and neutral behaviour with hazards. Images and the report are in `test-results/column-controls/`. Wipers remain visual fittings.

`npm run test:cabin-reference` captures matched cabin views against the supplied photographs, including the plain-spoke wheel, smaller badge, satin V trim, signal-switch details and blue instrument/console lighting with the engine running. It checks signal selection, cancellation and independence from steering rotation. Reports and before/after images are in `test-results/cabin-reference/`.

`npm run test:mirror` checks the photo-fitted interior mirror, windscreen clearance, live rear-view texture and visible rear marker on the rendered glass. Driver and mirror close-ups are in `test-results/mirror-reference/`.
`npm run test:mirror-motion` checks that visible mirrors refresh every driving frame at all quality levels, while offscreen mirrors skip rendering.
`npm run test:side-mirror-body` checks that both side mirrors show the real car at the inner edge, retain the road view and restore the default view after adjustment. Captures and measurements are in `test-results/side-mirror-body/`.
`npm run test:mirror-mount` checks closed mirror/door connections and verifies that neither neck projects below its rounded casing. Driver-seat and exterior captures are in `test-results/mirror-mount/`. Asset tests also check shared paint-seam positions/normals, removed lining shards, inner-trim clearance and unobstructed glass throughout adjustment.

`npm run test:rear-trim` captures two fixed rear exterior views and the parcel shelf from inside, and verifies the matte rear materials in the running renderer. Before/after screenshots and ray witnesses are in `test-results/rear-trim/`. Asset regressions protect the painted rear-window rim and smooth backrest seams.

`npm run test:rear-glass` captures nine rear-window views, including four lighting directions, both quarters and the interior. It checks 28 rays from both sides of the glass in the running renderer. The rear windshield uses one smooth, double-sided surface, eliminating the closed source shell's second reflection while retaining its combined tint opacity. Reports and before/after screenshots are in `test-results/rear-glass/`.

`npm run test:surfaces` verifies the paint normal field against the dense source and captures seven studio angles in paint and normal-colour modes, without world shadows or signs obscuring the car. Reports and before/after screenshots are in `test-results/surface-review/`.

`npm run test:body` captures both sides, both front/rear quarters, the windscreen, seats and rear wheel arch in `test-results/body-review/`. Rays check the metal roof and both upper arches, while asset tests check the shaped seats and short headrest supports. `npm run test:shadows` drives and brakes with the keyboard, checks shadow projection stability during suspension movement and cockpit/mirror rendering, verifies actual tyre/road contact and measures the visible road shadow. Its six-frame driving sequence and report are in `test-results/shadows/`.

`npm run test:course` captures the asphalt labels, curbs, start, right-angle approach, intersection, parking, finish and full layout in `test-results/course-details/`. Roads share one polygon boundary with the curbs and off-road sensors. Main corridors are 7.8-8 m wide, narrow roads are 4.5-5.2 m, edge/centre paint is 0.10 m wide, and parking pockets are 3 m deep. These are traced estimates at the drawing's existing 0.1 m/pixel scale; the video supplies appearance and placement rather than surveyed dimensions.

`npm run test:signs` captures the updated sign models from both sides and the ramp's approach, profile and concrete edging in `test-results/sign-hill/`. Sign faces are authored at 512 px on shaped metal boards with mounting hardware. The ramp is 1.8 m high with approximately 16.4% slopes, plain concrete wheel kerbs and piers; its asphalt, collider and structure use one elevation function.

The driving HUD keeps the map hidden when entering practice or an exam. Open it with the Map button or **M** (remappable in settings). Escape closes an open panel before pausing; its close button returns keyboard focus to the toggle. Controls groups keyboard hints, light switches and the practice restart behind a separate button. Speed, gear, vehicle warnings and the current exercise stay visible. Map and Controls panels are mutually exclusive, and hidden maps skip canvas redraws.

`npm run test:hud` checks default visibility, keyboard and button toggles, focus return, pause/resume, the mirror panel, RU/UZ labels and bounds at desktop, compact, portrait and landscape sizes. Screenshots and its report are saved in `test-results/hud/`.

Practice offers **Put on wheels** when the car is on its side or roof and has slowed below 3 m/s. Recovery preserves the current exercise, score, elapsed time, belt and lights; it stops the car in neutral with the handbrake on. It checks for nearby kerbs/posts and uses the ramp height before placing the car. This action is unavailable in exams. `npm run test:recovery` checks the contextual button at desktop/mobile sizes, progress preservation, driving afterwards and the exam guard; physics tests also cover ramps and blocked placements.

`npm run test:minimap` captures the mini-map at desktop, compact and narrow sizes, compares road/grass pixels with the actual asphalt boundary, and drives through keyboard controls to verify the moving marker. The map uses the traced 3D road polygons with one scale for both axes, a cached background, road-direction arrows, START/FINISH labels, crossing/parking/ramp landmarks, separate car/goal symbols and the current ordered B route leg. Reports and images are saved in `test-results/minimap/`.

`npm run test:full-map` checks the eight connected grass islands and 44 independent road/grass witnesses against the rendered asphalt, distinguishes both junction visits, and captures the full overhead course and minimap. The garage grass is one connected island, including the narrow divider between the B and CD bays. `test-results/full-map/plan-overlay.png` compares the runtime boundaries and B guide with the supplied plan. Extracting `video/uz_video.mp4` at 35 seconds into `test-results/full-map-reference/` first also enables the side-by-side video/aerial comparison.

`npm run test:paint-joins` inspects the outside corners of all four junction stop/divider joins at medium/low quality, including 36 road-surface probes. The common stroke builder closes cyclic contours with shared mitres; separate solid lines sharing an endpoint receive only the missing corner area, using both line widths. Open ends and deliberate dash gaps stay intact. Screenshots and reports are in `test-results/paint-joins/`.

`npm run test:all-markings` verifies continuous solid separators and curves in the running game, yellow boundaries at garage/parking/snake stations, and the attached painted gores. It captures the T-junction shown in the reference video and the other marking areas in `test-results/all-markings/`. Marking paths are shared with the minimap.

`npm run test:yellow-edge` checks continuous yellow colour on the B and snake bends and the intended white/yellow transition at the B entrance. Before/after close views and seven runtime ray witnesses are in `test-results/yellow-edge/`.

`npm run test:trees` captures the roadside trees and leaf detail in `test-results/trees/`, verifies the local foliage texture and checks all three graphics levels. Trees use curved branches, textured bark, irregular crowns and gentle wind, with 74 trees in six instanced groups. Lower graphics levels reduce foliage detail. The generated atlas and its prompt are documented in [tree assets](docs/TREE-ASSETS.md).

`npm run test:curbs` captures both sides and the exposed end of the striped curbs in `test-results/curbs/`. Curbs are closed solids with outward-facing walls and bases extending 2.5 cm into the ground. The browser checks use the normal single-sided material.

`npm run test:curb-boundaries` checks paint alignment across curb tops and bevels, closed-loop seams, overlapping faces, camera movement and subpixel stripe filtering. The visible curb is a continuous swept cross-section with one shared paint station across its top, bevels and walls. Tangential miter displacement is removed from the paint coordinates, keeping straight stripes aligned across the concrete. Rendering regions partition its faces without adding internal ends. Exposed ramp cuts remain closed; collision geometry is retained. The shader averages black/yellow coverage over the pixel footprint to reduce shimmer at a distance. Reports and close-up views are saved to `test-results/curb-boundaries/`.

`npm run test:curb-joints` checks the actual colour coordinates at coincident vertices and shared edge midpoints across all three curb regions. The browser also moves the camera across fixed top/wall probes in striped and white modes with the normal 2048-pixel sun shadows. Reports and close-ups are saved to `test-results/curb-joints/`.

`npm run test:curb-motion` additionally checks vertices at arbitrary fractions of every visible edge, detects internal region caps, and measures stationary rendering while the shadow anchor moves. Subpixel camera sequences are compared against a reference rendered at four times the resolution in each direction. Reports and views are saved to `test-results/curb-motion/`. Run `node scripts/curb-motion-check.mjs before` to retain the original extruded meshes in intercepted browser source for a reproducible baseline.

The main practice button opens free driving with educational penalty points for seatbelt use, speeding, stalls and collisions. Toasts explain new errors; the collapsible trip history records every error with its time and points. Points never end the drive, including at 100 or more. Waiting before starting, reversing and choosing your own route are allowed. There is no assigned route, target ring, exercise timer or automatic finish. Its map shows the course and vehicle without a target or highlighted itinerary. The exercise picker pauses free driving and starts a checked individual task; closing it resumes the same drive. Selected exercises retain contextual instructions, bound keys, the next 30 m of arrows and an oriented parking outline. The 3D target ring and beam have been removed. A retry starts a fresh attempt with a cleared score and timer; free driving is also available directly from the task.

`npm run test:practice-guide` checks all 12 selected exercises, free-mode transitions, live stop feedback, retry, keyboard instruction disclosure, Russian/Uzbek copy, compact layouts and exclusion of training aids in exam mode. Selected tasks require their actual conditions: prepared/signal-correct start, accepted stops, hill handbrake/rollback control, the full ordered snake/right-angle section without line touches, green-light crossing, reversed/aligned parking held still for two seconds, second-gear travel with a 20–40 km/h acceleration exit, an emergency stop/hazards/continuous hold sequence and a signal-correct finish crossing followed by a stop. Reaching a destination alone cannot pass any selected task. Unit replays cover correct independent attempts and the 13-visit exam itinerary. Screenshots and reports are saved to `test-results/practice-guide/`.

`npm run test:physics` measures all six gears on a synthetic flat track, assisted 0–100 km/h acceleration, braking from 20/50/100 km/h plus powered forward/reverse stops and grass braking, physical curb impacts at 8/25/50 km/h, and a hill start. Assertions and measurements are saved in `test-results/physics/report.json`. `npm run test:physics-browser` checks keyboard assisted shifts, powered braking with both pedals held, the manual exam clutch, reverse interlocks and collisions with the actual course curbs; its screenshots and report are in `test-results/physics-browser/`.

`npm run test:hill-start` checks restarting on the actual ascent after a service-brake stop, both immediately and after rolling back, plus the handbrake sequence and keyboard controls. Powered torque can overcome motion against the selected gear; passive engine drag and held service brakes retain their braking limits. Reports and screenshots are in `test-results/hill-start/`. Unit tests cover first and reverse gear uphill, pedal-transfer delay and manual clutch operation.

`npm run test:curb-physics` checks curb traversal in the complete course at the fixed 60 Hz physics step. It exercises slow, medium, fast, reverse and oblique approaches, verifies clearance of all four physical tyres and collision scoring across both axles, and captures the approach, impact, flight, rear contact, clearance and braking stages in `test-results/curb-physics-browser/`. Unit regressions also check tall obstacles, single-wheel impacts, suspension travel and mechanical-energy bounds.

`npm run test:powered-curb` reproduces the previous powered blockage against a 10 cm kerb, then checks that both axles can cross from touching rest with the corrected rolling contact. It also checks crossing the actual 20 cm course kerb from the grass at an angle and reversing afterward. Unit regressions cover the straight/oblique climb, held brake/clutch, engine off after flywheel rundown, low concrete friction, a wall and reverse recovery from a 32 cm obstacle. Screenshots and measurements are in `test-results/powered-curb/`.

`npm run test:curb-steering` checks five grass-verge positions beside the actual 20 cm course curb while holding throttle and left steering. All four physical tyres must clear the concrete inside its continuous span, with finite suspension states and no overturn or launch. Screenshots and measurements are in `test-results/curb-steering/`. Unit regressions also cover the mirrored turn, held brake/clutch, engine off, neutral and a taller wall.

## First drive

Choose **Mashq qilish / Начать практику**. Practice starts with clutch assistance enabled; turn it off in settings to practice fully manual starts.

1. **B**: fasten the belt. **I**: start the engine.
2. Hold **Shift**, press **1**, then **Space** to release the handbrake.
3. **Q**: signal left for the start. Press **W** gently and release **Shift** to engage the clutch gradually. Press **Q** again before travelling 10 metres past the start.
4. **W / S**: throttle / brake; **A / D**: steering. Release W to reduce throttle. Keyboard inputs are smoothed.
5. Hold **Shift** when stopping or changing gear. **1–5** select forward gears, **R** reverse, **N** neutral.
6. **L**: headlights; **F**: front fog lamps (also enables headlights). Switching headlights off also turns fog lamps off. Both switches are available in the bottom control bar.
7. **Q / E**: left/right indicators; **H**: hazards; **C**: chase, cockpit, overhead cameras. **Z / X**: look left/right in the cockpit.
8. **Escape** pauses. Losing focus pauses both physics and exam time; resume explicitly.

If the engine stalls, hold Shift and press I. In exam mode the clutch is manual regardless of the saved assistance setting. The exam ends at 100 or more penalty points. Leaving the exam records rule 26 and a failure report.

Settings include remappable controls, three graphics levels, sound volume, language, practice assistance, and the provisional exam duration. Preferences and the last ten complete-route results are stored in this browser. Practice exercise resets are available; exam resets require finishing or leaving the attempt.

## Driving physics

Engine torque, clutch slip, gearing and wheel speed determine acceleration and RPM. Practice assistance opens the clutch, lifts the throttle and re-engages it during a shift; exams require the clutch pedal. Reverse engagement while moving forward and downshifts that would over-rev are rejected, including when speed changes during an assisted shift. Releasing the throttle produces engine braking; pressing the clutch or selecting neutral allows freer coasting.

Approximate speed at **2,500 RPM** with an engaged clutch:

| Gear | 1 | 2 | 3 | 4 | 5 | R |
| --- | --- | --- | --- | --- | --- | --- |
| km/h | 19 | 36 | 54 | 75 | 94 | 20 |

These are gearing reference points, not automatic shift thresholds or fixed speed caps. At full throttle, the flat-track review reaches approximately 47/89/131/176/165 km/h in gears 1–5. Fifth is an overdrive: road load limits its speed before the rev limiter, and fourth can reach a higher speed in this estimated tune. The course's existing 20/40 km/h scoring limits still apply. The simulated 0–100 km/h run takes about 14.7 seconds with assisted shifts; braking from 50 km/h takes about 12.1 m, from brake application without reaction time.

Air resistance grows with the square of speed; rolling resistance and available grip change on grass. Keyboard steering moves more slowly at speed while retaining full mechanical travel. Holding a steering key eventually reaches full lock; releasing it returns smoothly to centre. Different inner/outer wheel angles follow Ackermann geometry, and the cabin wheel follows the actual rack position. Optional **steering assistance** in Settings limits the angle at speed using the front tyres' estimated surface grip. It is off by default, separate from automatic clutch assistance, and disabled during exams. Suspension, body inertia, anti-roll forces and front-biased braking control pitch and roll. Traction and braking are capped by each wheel's suspension load and surface grip, so a verge affects only the tyres on grass. Engine torque and brake demand are combined before the ray controller runs; the brakes remain effective in gear and with the throttle held. From 50 km/h, the review measures about 12.1 m on dry asphalt and 22.0 m on grass. The handbrake acts on the rear wheels, reduces their lateral grip while moving, and holds an incline only while available tyre grip is sufficient. Releasing it wakes a stationary car so it can roll downhill. Shaft speed includes uphill/downhill velocity, and solid tyre poses use the current suspension rays before obstacle contacts are resolved.

Course curbs and ramp structures have physical surfaces matching their visible geometry. Massless solid tyres with rounded shoulders supply obstacle-normal impulses, while the ray controller supplies grip and brakes. A finite tyre sweep finds curb support missed by the centre ray and moves that suspension ray inside the bevel, preserving axle height and tyre clearance. Concrete contact supplies its own grip and rolling resistance. The solids have no independent spin, so additional Coulomb friction on them would incorrectly lock a rolling tyre against a curb. With sufficient traction or momentum the car can climb or cross a curb, losing speed and compressing/extending its suspension; taller obstacles can still stop it, and asymmetric impacts can turn or overturn it. Both axles belong to one collision episode until the vehicle footprint clears the local impact area. Later hits remain separate even when curbs share one course-wide collider. This is a rigid-body model without tyre deformation, independent unsprung wheel mass, body damage, tyre heat or a measured Cobalt suspension model.

## Data and limitations

Read [the reference report](docs/REFERENCE.md) for all 32 penalties, source timestamps, rule interpretations, dimensions, and assumptions. Read [validation results](docs/VALIDATION.md) for what was tested and what remains approximate.

- The provided diagram is reconstructed as a connected 3D course, not a surveyed replica. Nominal scoring-lane span is 3.5 m, the ramp grade is approximately 16.4% after comparison with the gameplay video, and map scale is 0.1 m/pixel.
- The **15-minute limit is provisional**, chosen during planning. It is not presented as a verified official limit.
- Cobalt length and wheelbase use manufacturer dimensions. Mass, transmission ratios, torque curve, suspension, friction, and keyboard pedal response are simulation estimates, not a validated vehicle-dynamics model.
- The supplied video was inspected through timestamped visual samples. Its complete audio narration was not transcribed.
- Daylight and dry road only. Single player, desktop keyboard. No mobile controls, traffic AI, other license categories, or hosting.

## Architecture and tuning

`src/data` holds course geometry, the ordered itinerary (including a second intersection visit), vehicle parameters, and the versioned 32-rule table. `src/simulation` contains input, drivetrain, Rapier vehicle integration, swept geometric sensors, and an independent exam state machine. `src/render` owns the scene, optimized model, environment, mirrors, and synthesized sound. `src/ui` owns localization, settings, results, and HUD.

The data contracts are `CourseDefinition`, `VehicleConfig`, `RuleDefinition`, `VehicleTelemetry`, and `ExamEvent` in `src/types.ts`. Physics advances at 60 Hz with a capped accumulator. Sensors feed facts into the scoring engine, and the engine emits timestamped penalties. Scoring never depends on render frame rate.

Tune `course.laneWidth`, `course.hillGradient`, road vertices, stop-line normals, and parking boxes in `src/data/course.ts`. Positions are metric world coordinates converted from the original diagram with `mapPoint`. Width changes scale the road corridors; painted markings and roadside props may also need alignment when making substantial layout changes. Vehicle gearing and dynamics estimates are in `vehicleConfig` and `vehicleDynamics` in `src/data/vehicle.ts`.

`window.__avtodrom.snapshot()` exposes read-only diagnostics. Additional test controls exist only in Vite development builds.

## Model preparation and attribution

The game depicts the supplied 2026 examination-centre Cobalt with a five-speed manual transmission. Its fitted centre monitor follows the latest user photograph and displays the live exercise, elapsed time, penalties and result in Russian or Uzbek. The dashboard retains paired vents, the lock/hazard/airbag row, three manual climate knobs, a manual lever and three pedals. `npm run test:cabin-2026` captures the cabin and verifies its live monitor states.

The four source files at the project root are preserved. The optimized derivative is `public/assets/cobalt.glb`. To regenerate:

```powershell
npm run prepare:car
```

The preparation script uses `scripts/refine-car.mjs`, `scripts/cobalt-body.mjs`, `scripts/cobalt-cabin.mjs`, `scripts/cobalt-upholstery.mjs`, `scripts/cobalt-column-controls.mjs`, `scripts/cobalt-glass.mjs` and `scripts/cobalt-lamps.mjs`. It preserves panel borders and calculates corner-angle weighted normals on edge-connected smoothing fans of the dense source mesh before simplification. Normal-aware simplification retains narrow bevel support rows and that normal field, preventing roof-edge bevels and large door triangles from producing false dents; UV seams stay continuous while sharp folds and separate sheets remain independent. Roof lining fits inside the shell; duplicate tubular A-pillar covers are removed, retaining the source frame and its interior trim; rear door trim follows the wheel-arch cut. The manual cabin has a swept dashboard, open instrument recess, silver centre bezel, a fitted black 16:9 examination monitor, lock/hazard/airbag row and triangular manual climate controls, manual lever, three-spoke wheel, grey cloth seats with tapered backs and short headrest supports, belts, mats, handbrake, cup wells, mirror and visors. The digital speed display, gauges, rear lamps and independently mounted left indicator stalk follow telemetry. Both column switches follow the supplied Cobalt/Ravon R4 component photographs: long moulded grips and broad flat shanks, left MENU button and SET/CLR end, fine knurled rings and separate white turn/selector/wiper legends. The plain-spoke wheel, smaller badge, satin V and blue instruments with neutral climate markings follow the supplied manual-cabin references. Front pillar lining continues behind the dashboard with clean material boundaries; the cowl joins the instrument-hood side walls. The tapered steering hub and moulded spokes support a continuous rounded satin V. A photo-fitted GM-style interior mirror has a bowed black housing, swept mount and lower manual tab; its glass displays the live rear cabin/window view. Authored cabin textures are embedded; reference photographs are not bundled. The derivative contains **217,207 unique triangles**, within the existing 220,000-triangle budget, and is approximately **5.2 MB** after welding. This is a reconstruction from photographs using the supplied body shell, not manufacturer CAD; references are recorded in `docs/REFERENCE.md`.

At runtime the shell follows the supplied Cobalt dimension diagram: 4479 mm length, 1735 mm body width excluding mirrors, 1514 mm roof height excluding the antenna, 2620 mm wheelbase, 1504/1509 mm front/rear tracks and 160 mm central clearance. The imported body and cabin share one dimension transform; smooth overhang extensions retain the overall length after correcting the axle spacing. The driver eye follows that transform. Tyres use the selected 195/65 R15 proportions: 634.5 mm diameter and 195 mm width. Visual hubs, physical tyres and scoring telemetry share the axle coordinates. A tapered convex chassis has a low central belly and roof; it retains the explicit mass and inertia. The nominal loaded suspension places the visible body about 10.6 cm above the physics origin. `npm run test:vehicle-dimensions` measures the actual rendered geometry and physical clearance and saves exterior/cockpit captures in `test-results/vehicle-dimensions/`. The shadow camera follows the road elevation, snaps all three light-space axes, and uses a 48 m / 2048 px projection on medium/high quality. Transparent glass does not cast an opaque shadow; back-face casting and depth bias prevent moving stripes on painted panels. Low graphics continues to disable world shadows.

Original source model: **Chevrolet Cobalt LTZ 2014**, by **Q.SARDOR**. [Original on Sketchfab](https://sketchfab.com/3d-models/chevrolet-cobalt-ltz-2014-f91cbef731444f939e263041400216ca), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), as identified in the supplied GLB metadata. Changes: duplicate wheel groups removed, geometry welded/deduplicated/simplified, metric scaling, authored cabin and lamp details/textures, wheel/steering animation, and material adjustments. Credits are also accessible inside the game.

In the cockpit, open **??????? / Ko?zgular** to adjust side mirrors. Select **L** or **R**, hold the directional pad, or choose **0** to lock adjustment. Glass pivots and its reflected view move together; each side has its own saved position and reset. `npm run test:mirror-adjustment` checks pointer/keyboard control, actuator travel, independent reset, reload persistence and narrow-screen layout.

`npm run test:pillar-photo` captures both photo-fitted A-pillar/dashboard joints and the normal driver view in `test-results/pillar-photo/`. Their pale moulded feet taper down to the curved cowl with a narrow dark joint.

The **Mirrors / ??????? / Ko?zgular** button is always available beside the camera button during driving. Opening it switches to the cockpit and previews the selected L/R mirror. Choose L or R, then hold the arrows to adjust; 0 locks the pad. The inner door-window ledges use dark trim so exposed white painted fragments do not show below the mirrors.

The physical black mirror switch on the left triangular door trim follows the supplied cabin photograph. In cockpit view, point at its round knob and click to open the same L/R adjustment panel. Its face angles toward the driver, with a fitted wedge connecting it to the original trim. The cursor and localized tooltip identify the clickable part; other bodywork occludes it, and exterior views disable cabin picking. `npm run test:cabin-mirror-switch` checks clicking from the normal driver camera, real actuator movement and persistence, occlusion and low graphics quality; screenshots are in `test-results/cabin-mirror-switch/`.
