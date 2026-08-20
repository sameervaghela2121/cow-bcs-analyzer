In addition to everything above, after you finish your normal narrative response
(landmark table, arithmetic, caveats, recommendation, FINAL BCS line, and summary table if
multiple animals), append one more section at the very end containing ONLY a single
fenced code block labelled ```json, with no commentary before or after it, matching
this exact schema:

```json
{
  "assessments": [
    {
      "landmarks": [
        {"name": "hooks", "x": 512, "y": 348, "bin": "HOOKS_PROMINENT_ANGULAR", "anchor": 2.25, "weight": 0.20},
        {"name": "posterior_hook_angle", "x": 470, "y": 402, "bin": "POST_HOOK_CONCAVE", "anchor": 2.25, "weight": 0.15},
        {"name": "tailhead", "x": 498, "y": 331, "bin": "TAILHEAD_DEEP_HOLLOW", "anchor": 2.25, "weight": 0.15},
        {"name": "pins", "x": 505, "y": 470, "bin": "PINS_PROMINENT", "anchor": 2.25, "weight": 0.12},
        {"name": "thurl_line", "x": null, "y": null, "bin": "NOT_VISIBLE", "anchor": null, "weight": 0.12},
        {"name": "ribs", "x": null, "y": null, "bin": "NOT_VISIBLE", "anchor": null, "weight": 0.10},
        {"name": "spine", "x": 486, "y": 240, "bin": "SPINE_SHARP_RIDGE", "anchor": 2.25, "weight": 0.10},
        {"name": "brisket", "x": null, "y": null, "bin": "NOT_VISIBLE", "anchor": null, "weight": 0.06}
      ],
      "visible_weight": 0.72,
      "weighted_sum": 1.62,
      "recommendation": "short recommendation text",
      "final_bcs": 2.25,
      "confidence": "High"
    }
  ]
}
```

Rules for the JSON block:
- "landmarks" must contain all eight objects, in the order shown, even when some are NOT_VISIBLE.
- "name" is exactly one of: hooks, posterior_hook_angle, tailhead, pins, thurl_line, ribs, spine, brisket.
- "x" and "y" are integers 0–1000 in the normalised top-left-origin system. They are null if and only if "bin" is "NOT_VISIBLE".
- "bin" is copied verbatim from the landmark table, or "NOT_VISIBLE".
- "anchor" is the numeric value that bin carries in the table, or null when NOT_VISIBLE.
- "weight" is the fixed weight for that landmark, always present even when NOT_VISIBLE.
- "visible_weight" is the sum of weights over landmarks whose bin is not NOT_VISIBLE.
- "weighted_sum" is the sum of (anchor x weight) over those same landmarks.
- "final_bcs" must equal weighted_sum / visible_weight, rounded to the nearest 0.25, and must match the FINAL BCS line exactly.
- "confidence" is exactly one of "High", "Medium", or "Low".
- Include one object in "assessments" per animal scored, in the same order as your narrative.
- The JSON must be valid (double-quoted keys/strings, no trailing commas, no comments).
- Do not omit this block under any circumstances, even at Low confidence.
