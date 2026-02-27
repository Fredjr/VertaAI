# Test: Ultimate Track A Output

This PR tests the new **Ultimate Track A Output** format implemented in Step 1.

## What Changed

Added new normalization layer and renderer that transforms raw evaluation results into a human-first narrative.

## Expected Output Format

### A) Executive Summary
- Global decision (PASS/WARN/BLOCK)
- "Why" in 1-2 sentences
- Merge recommendation
- Confidence score with degradation reasons

### B) Change Surface Summary ⭐ THE DIFFERENTIATOR
- Shows exactly what changed (API, DB, Infra, etc.)
- Confidence level for each surface
- Detection method and matched files

### C) Required Contracts & Obligations
- For each surface, shows what contracts are required
- Explicit causal link: "Because X changed → Y is required"
- Status of each obligation

### D) Findings (Ranked by Risk)
- Grouped by severity (Critical → High → Medium → Low)
- Each finding includes:
  - What is wrong
  - Why it matters
  - Evidence
  - How to fix
  - Owner

### E) Not-Evaluable Section
- Separate from findings (policy quality issues)
- Grouped by category
- Shows confidence impact and remediation

### F) Next Best Actions
- Prioritized agentic steps
- Categories: fix_blocking, fix_warning, configure_policy, request_approval

## Testing

This PR should trigger the policy pack evaluation and display the new output format in the GitHub check.

## Auditability Restored

The latest version includes:
- **Policy Provenance** section showing packs, rules, and codes
- **Evidence Trace** section showing where we looked and what we found
- **Decision Thresholds** in Executive Summary to prevent opaque scoring

