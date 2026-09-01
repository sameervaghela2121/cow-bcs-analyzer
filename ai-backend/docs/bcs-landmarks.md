# BCS Anatomical Landmarks — Reference

What the anatomical prompt extracts from a cow photo, and what every field means.

This describes the **ANATOMICAL** scoring mode only. The service ships two prompts
and one is active at a time — see the `PROMPT SELECTION` block in
`app/services/bcs_service.py`. The original holistic prompt produces no landmarks
at all, just a score.

Source of truth for everything below:
- `app/prompts/bcs/bcs_anatomical_system_prompt.md` — the landmark table and bins
- `app/prompts/bcs/bcs_anatomical_json_addendum.md` — the JSON contract
- `app/services/llm/gemini_provider.py` — `_RESPONSE_SCHEMA`, Gemini's structured output

---

## The 8 body parts

Each landmark carries a fixed weight reflecting how reliably it can be read from a
photograph. Weights sum to 1.00. Hooks and the posterior hook angle together are the
strongest visual predictor of body condition; brisket fill is the weakest and only
really discriminates at the fat end of the scale.

| # | Landmark | JSON `name` | Weight | Needs |
|---|----------|-------------|--------|-------|
| 1 | Hook bones (hip bones) | `hooks` | **0.20** | rear view |
| 2 | Posterior hook angle | `posterior_hook_angle` | **0.15** | rear view |
| 3 | Tailhead / sacral ligaments | `tailhead` | **0.15** | rear view |
| 4 | Pin bones | `pins` | **0.12** | rear view |
| 5 | Thurl line (hook→thurl→pin) | `thurl_line` | **0.12** | side/oblique only |
| 6 | Ribs | `ribs` | **0.10** | side/oblique only |
| 7 | Spine / topline | `spine` | **0.10** | rear or top |
| 8 | Shoulder / brisket fill | `brisket` | **0.06** | side view |

All eight objects are always present in the response, in this order, even when a
landmark could not be seen.

---

## Fields extracted per landmark

Every landmark object carries six fields:

```json
{
  "name": "hooks",
  "x": 398,
  "y": 320,
  "bin": "HOOKS_DEFINED_SMOOTH",
  "anchor": 3.0,
  "weight": 0.2
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `name` | string | One of the eight names in the table above. Fixed vocabulary. |
| `x` | int \| null | Horizontal position, **normalised 0–1000** (see below). `null` when not visible. |
| `y` | int \| null | Vertical position, **normalised 0–1000**, origin top-left. `null` when not visible. |
| `bin` | string | The discrete rating chosen for this landmark, or `NOT_VISIBLE`. |
| `anchor` | float \| null | The BCS value that bin represents (1.50 / 2.25 / 3.00 / 3.75 / 4.50). `null` when not visible. |
| `weight` | float | This landmark's fixed weight. Always present, even when `NOT_VISIBLE`. |

### The coordinate system is 0–1000, not pixels

`x` and `y` are **normalised to a 0–1000 grid**, origin at top-left — not pixel
coordinates, regardless of the image's real dimensions.

To draw a point on the original image:

```python
px = x / 1000 * image_width
py = y / 1000 * image_height
```

> **This is not optional.** Gemini emits this scale even when the prompt explicitly
> asks for pixels and states the image dimensions. Treating these numbers as raw
> pixels puts every landmark in the top-left corner of the frame — on a
> 1739×978 photo, all eight land in the sky above the cow. Nothing errors; you
> just get confident, perfectly-stable, completely-wrong landmarks.

### `NOT_VISIBLE` is a normal outcome, not a failure

When a landmark cannot be seen — wrong angle, cropped out, obscured by another
animal, lost in shadow, or the frame is an ear-tag/head/hoof close-up — the model
must return `bin: "NOT_VISIBLE"` with `x`, `y`, and `anchor` all `null`. The
landmark is then excluded from **both** sides of the score calculation, which
re-normalises the weights over what was actually readable.

This is what stops the model inventing body condition from a photo of an ear tag.

---

## Record-level fields

Alongside the `landmarks` array:

| Field | Type | Meaning |
|-------|------|---------|
| `visible_weight` | float | Sum of `weight` over landmarks whose bin is **not** `NOT_VISIBLE`. Ranges 0.00–1.00. |
| `weighted_sum` | float | Sum of `anchor × weight` over those same landmarks. |
| `recommendation` | string | Short management note. **The only prose field the backend stores.** |
| `final_bcs` | float | The score, 1.0–5.0 in 0.25 steps. |
| `confidence` | string | `High`, `Medium`, or `Low`. |

`visible_weight` is the honest measure of how much of the animal was actually
assessable. A record with `visible_weight: 0.35` scored on roughly a third of the
evidence — treat it very differently from one at 1.00, even though both may report
`confidence: High`.

### How the score is computed

```
final_bcs = round_to_0.25( weighted_sum / visible_weight )
```

The model performs this arithmetic itself — the backend does not recompute it.
`_run_single_provider` in `app/services/bcs_service.py` reads only
`recommendation`, `final_bcs`, and `confidence`; the landmark array is currently
logged but **not persisted** (`BcsAnalysis.js` has no field for it).

### Confidence thresholds

| Confidence | Condition |
|------------|-----------|
| `High` | visible weight ≥ 0.70, includes hooks or tailhead, and a rear or side view is present |
| `Medium` | visible weight 0.40 – 0.69 |
| `Low` | visible weight < 0.40, or only close-ups / head shots / ear-tag frames |

---

## Bin vocabulary

Each landmark has exactly five rating bins plus `NOT_VISIBLE`. Bins run lean → fat,
anchored at 1.50, 2.25, 3.00, 3.75, 4.50. The model must copy a label verbatim; it
may not invent bins, blend two, or place a landmark "between" bins.

Discrete bins are the whole point of this design: a continuous score has ~17
reachable values on the quarter-point scale and small perceptual wobble moves it,
whereas a five-way category only changes when the model's judgement of that
landmark genuinely flips.

### 1. `hooks` — weight 0.20
Sharpness of the bony edge at the top of the pelvis.

| Bin | Anchor | What it looks like |
|-----|--------|--------------------|
| `HOOKS_SHARP_SKELETAL` | 1.50 | Bone edge knife-sharp, skin drawn tight, no cover at all |
| `HOOKS_PROMINENT_ANGULAR` | 2.25 | Clearly angular and standing out, minimal cover |
| `HOOKS_DEFINED_SMOOTH` | 3.00 | Bone location obvious but edge rounded, thin even cover |
| `HOOKS_ROUNDED_PADDED` | 3.75 | Bone softened into surrounding tissue, clear fat cover |
| `HOOKS_BURIED` | 4.50 | Location only inferable; fat has flattened the contour |

### 2. `posterior_hook_angle` — weight 0.15
Shape of the slope running behind/below the hook, down toward the pin.

| Bin | Anchor | What it looks like |
|-----|--------|--------------------|
| `POST_HOOK_DEEPLY_CONCAVE` | 1.50 | Pronounced scooped hollow behind the hook |
| `POST_HOOK_CONCAVE` | 2.25 | Clearly dished inward |
| `POST_HOOK_NEARLY_FLAT` | 3.00 | Straight or very slightly dished line |
| `POST_HOOK_CONVEX` | 3.75 | Slope bulges outward |
| `POST_HOOK_STRONGLY_CONVEX` | 4.50 | Rounded fat bulge, no trace of a hollow |

### 3. `tailhead` — weight 0.15
Depth of the hollow either side of the tail root, and visibility of the sacral
ligament cords.

| Bin | Anchor | What it looks like |
|-----|--------|--------------------|
| `TAILHEAD_CAVERNOUS` | 1.50 | Deep pit each side, ligaments standing out as sharp cords |
| `TAILHEAD_DEEP_HOLLOW` | 2.25 | Obvious depression, ligaments clearly visible |
| `TAILHEAD_SLIGHT_HOLLOW` | 3.00 | Shallow dish, ligaments only faintly traceable |
| `TAILHEAD_FILLED` | 3.75 | Hollow filled level, ligaments not visible |
| `TAILHEAD_FAT_PADDED` | 4.50 | Fat pads bulge above the surrounding surface |

### 4. `pins` — weight 0.12
Lower paired pelvic points either side of the tail.

| Bin | Anchor | What it looks like |
|-----|--------|--------------------|
| `PINS_SHARP_SKELETAL` | 1.50 | Sharp, bare, prominent knobs |
| `PINS_PROMINENT` | 2.25 | Clearly protruding with little cover |
| `PINS_DEFINED_SMOOTH` | 3.00 | Visible but rounded off |
| `PINS_ROUNDED_PADDED` | 3.75 | Softened, well covered |
| `PINS_BURIED` | 4.50 | Location only inferable, fat-covered |

### 5. `thurl_line` — weight 0.12 — *side/oblique views only*
Shape of the line traced from hook, through thurl, down to pin.

| Bin | Anchor | What it looks like |
|-----|--------|--------------------|
| `THURL_SHARP_V` | 1.50 | Hard, narrow V |
| `THURL_V` | 2.25 | Clearly V-shaped |
| `THURL_SHALLOW_V` | 3.00 | Soft V, beginning to round at the base |
| `THURL_U` | 3.75 | Rounded, filled U |
| `THURL_FLAT_U` | 4.50 | Broad flat U, essentially no dip |

### 6. `ribs` — weight 0.10 — *side/oblique views only*
How much of the rib cage reads through the skin.

| Bin | Anchor | What it looks like |
|-----|--------|--------------------|
| `RIBS_ALL_SHARPLY_VISIBLE` | 1.50 | Every rib individually countable and sharp |
| `RIBS_MOST_VISIBLE` | 2.25 | Most ribs countable |
| `RIBS_LAST_FEW_FAINT` | 3.00 | Only rear ribs faintly discernible |
| `RIBS_NOT_VISIBLE_SMOOTH` | 3.75 | No ribs, smooth cover |
| `RIBS_FAT_COVERED` | 4.50 | No ribs and the flank visibly rounded with fat |

### 7. `spine` — weight 0.10
The backbone line over the loin.

| Bin | Anchor | What it looks like |
|-----|--------|--------------------|
| `SPINE_INDIVIDUAL_VERTEBRAE` | 1.50 | Separate vertebrae readable as bumps |
| `SPINE_SHARP_RIDGE` | 2.25 | Distinct sharp ridge |
| `SPINE_ROUNDED_RIDGE` | 3.00 | A ridge, but rounded over |
| `SPINE_NEARLY_FLAT` | 3.75 | Barely raised above the loin |
| `SPINE_FLAT_OR_CHANNELLED` | 4.50 | Flat, or a fat channel either side |

### 8. `brisket` — weight 0.06
Secondary confirming signal; only meaningfully discriminates at the fat end.

| Bin | Anchor | What it looks like |
|-----|--------|--------------------|
| `BRISKET_HOLLOW_BONY` | 1.50 | Shoulder bones stand out, brisket hollow |
| `BRISKET_LEAN` | 2.25 | Lean, angular shoulder |
| `BRISKET_MODERATE` | 3.00 | Smooth, neither hollow nor bulging |
| `BRISKET_FILLED` | 3.75 | Well filled, softened outline |
| `BRISKET_FAT_PAD` | 4.50 | Obvious fat pad at brisket or shoulder |

---

## Worked example

A real Claude response (2026-08-21), one landmark not readable:

| Landmark | Bin | Anchor | Weight | Contribution |
|----------|-----|--------|--------|--------------|
| hooks | `HOOKS_DEFINED_SMOOTH` | 3.00 | 0.20 | 0.600 |
| posterior_hook_angle | `POST_HOOK_NEARLY_FLAT` | 3.00 | 0.15 | 0.450 |
| tailhead | `TAILHEAD_SLIGHT_HOLLOW` | 3.00 | 0.15 | 0.450 |
| pins | `PINS_DEFINED_SMOOTH` | 3.00 | 0.12 | 0.360 |
| thurl_line | `THURL_SHALLOW_V` | 3.00 | 0.12 | 0.360 |
| ribs | `RIBS_NOT_VISIBLE_SMOOTH` | 3.75 | 0.10 | 0.375 |
| spine | `SPINE_ROUNDED_RIDGE` | 3.00 | 0.10 | 0.300 |
| brisket | `NOT_VISIBLE` | — | 0.06 | *excluded* |

```
weighted_sum   = 2.895
visible_weight = 0.94          (1.00 − 0.06 for the excluded brisket)
2.895 / 0.94   = 3.0798
final_bcs      = 3.00          (rounded to nearest 0.25)
confidence     = High          (0.94 ≥ 0.70, hooks present, rear view)
```

---

## Known limitations

**Coordinates are not comparable across providers.** They are reproducible *within*
a provider — Gemini at `temperature=0` with thinking disabled returned bit-identical
coordinates across 3 runs — but the three models place the same landmark in very
different spots. Measured on one image, in 0–1000 units:

| Landmark | x spread across providers | y spread |
|----------|--------------------------|----------|
| `hooks` | 245 | 135 |
| `tailhead` | 325 | 160 |
| `pins` | 335 | 180 |
| `spine` | 85 | 310 |

A third of the frame apart on the same landmark. Use coordinates to sanity-check one
provider's attention, or to render an overlay — **never** to compare models against
each other, and never as input to geometric measurement.

**Coordinates are approximate even within a provider.** Spot-checked placement runs
roughly 30–60 px off a human annotator's ideal point. Their job is to force the model
to look at a specific place before rating it; the *bin* carries the signal, not the
coordinate. This is why the score is not derived from landmark geometry.

**The score is not yet calibrated.** Measured against the three hand-scored
ground-truth cows, the anatomical prompt showed a systematic compression toward the
middle of the scale — lean cows reading too fat, fat cows too lean. This is a
calibration problem correctable with labelled data, not a prompt-wording problem, and
it is not fixed by adding more landmarks: weighted averaging pulls toward the centre
by construction, so more terms would compress further, not less.

**Landmark errors can be correlated, not independent.** In testing, a single
misread of a dark-coated animal flipped all eight landmarks to the fat side at once.
Averaging protects against one landmark drifting; it does not protect against the
model forming one wrong global impression and expressing it eight times.

**Landmarks are not persisted.** `BcsAnalysis.js` has no field for them, so they are
computed, logged, and discarded on every analysis. Adding a field is a prerequisite
for any overlay review UI or for fitting a calibration curve from stored data.
