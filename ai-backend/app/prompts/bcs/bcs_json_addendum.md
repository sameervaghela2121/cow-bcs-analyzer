In addition to everything above, after you finish your normal narrative response
(landmark reasoning, caveats, recommendation, FINAL BCS line, and summary table if
multiple animals), append one more section at the very end containing ONLY a single
fenced code block labelled ```json, with no commentary before or after it, matching
this exact schema:

```json
{
  "assessments": [
    {
      "recommendation": "short recommendation text",
      "final_bcs": 3.25,
      "confidence": "High"
    }
  ]
}
```

Rules for the JSON block:
- "final_bcs" is a number between 1.0 and 5.0 in quarter-point increments.
- "confidence" is exactly one of "High", "Medium", or "Low".
- Include one object in "assessments" per animal scored, in the same order as your narrative.
- The JSON must be valid (double-quoted keys/strings, no trailing commas, no comments).
- Do not omit this block under any circumstances, even at Low confidence.
