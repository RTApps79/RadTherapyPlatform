RTApps · Treatment Planning Suite (standalone)
==============================================
A 2D, client-side teaching planner for the dosimetrist workflow:
scroll a CT stack, contour structures, place isocenter, set beams, calculate
dose, read the DVH/metrics — in FORWARD (manual beam weights) or INVERSE
(set objectives → optimizer solves beam weights).

RUN
  Easiest (all datasets incl. local CT): serve the folder, then open index.html
      python -m http.server 8000   →   http://localhost:8000/
  Single file: treatment_planning_suite.html opens on its own; the BRAIN set
  loads from the web and the offline phantom always works, but the local
  BREAST/LARYNX sets need the datasets/ folder beside it (use the served folder).

DATASETS (registry at the top of tps.js — add a series with ONE line)
  brain   : remote, https://rtapps79.github.io/.../brain_mets_{i}.png  (61)
  breast  : datasets/breast/breast_{i}.png   (36, from your upload)
  larynx  : datasets/larynx/larynx_{i}.png   (58, from your upload)
  demo    : offline procedural phantom (always available)
  To add a diagnosis: copy its images into datasets/<name>/ and add a
  { id, name, kind:'local', count, pad:3, pattern:'datasets/<name>/<name>_{i}.png', seed:{...} } entry.

NOTE: simplified educational dose model (2D, single-energy) — not for clinical use.

--- Update: beam's-eye view + teaching fidelity ---
- Beam's-eye view panel (forward planning): target silhouette down the beam axis
  with the multi-leaf collimator aperture and shielded organs; pick the beam from
  the dropdown. Updates as you contour, change margin/blocking, or switch slices.
- Heterogeneity correction toggle: dose follows tissue density (radiological depth)
  through lung and bone instead of a uniform medium. Uses the CT luminance as a
  density proxy (served local datasets / phantom; remote images may be blocked by
  cross-origin rules, in which case it falls back to uniform).
- Per-beam Wedge (None/15/30/45/60 degrees, with a direction flip) and Bolus
  (removes skin sparing) in each beam's shaping panel.
Educational, simplified models — not for clinical use.
