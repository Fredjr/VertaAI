# Test: Ultimate Track A Output with Auditability Restored

This PR validates that the **auditability regression** has been fixed.

## What Was the Regression?

The initial Ultimate Track A output improved readability but lost critical "hard anchors":

### ❌ Lost in Initial Version:
1. **Pack/Rule Provenance** - No pack names, versions, rule IDs, or codes
2. **Evidence Evaluation Transparency** - No "where did we look" or "what's acceptable"
3. **Opaque Scoring** - Risk scores without thresholds or rule mapping
4. **Lost Determinism** - "Advisor output" instead of "Policy output"

## ✅ What's Been Restored

### 1. Policy Provenance Section
Shows which packs, rules, and codes were evaluated:
- Pack name and version
- Rule IDs and names
- Decision for each rule (BLOCK/WARN/PASS)
- Obligation counts (passed/failed/not evaluable)
- Reason codes for failures

### 2. Evidence Trace Section
Shows where we looked for evidence and what we found:
- Concrete evidence locations (files, patterns, PR fields)
- What evidence types are acceptable
- Why evidence was deemed missing
- How to fix each failed obligation

### 3. Decision Thresholds in Executive Summary
Prevents opaque scoring by showing:
- BLOCK: Any obligation with `decisionOnFail: block` fails
- WARN: Any obligation with `decisionOnFail: warn` fails (and no blocks)
- PASS: All obligations pass or have `decisionOnFail: pass`

## Expected Output Structure

### A) Executive Summary ✅
- Global decision (PASS/WARN/BLOCK)
- "Why" in 1-2 sentences
- Merge recommendation
- Confidence score with degradation reasons
- **NEW:** Decision thresholds

### B) Change Surface Summary ⭐ THE DIFFERENTIATOR
- Detected surfaces (API/DB/Infra/Obs)
- Confidence level for each surface
- Detection method and matched files

### C) Required Contracts & Obligations
- For each surface, shows what contracts are required
- Explicit causal link: "Because X changed → Y is required"
- Status of each obligation

### D) Findings (Ranked by Risk)
- What is wrong (plain English)
- Why it matters (risk)
- Evidence (files, diff lines, links)
- How to fix (exact steps)
- Who can approve/override (owner)

### E) Not-Evaluable Section
- Separate from findings (policy quality issues)
- Grouped by category
- Shows confidence impact and remediation

### F) Next Best Actions
- Prioritized agentic steps
- Categories: fix_blocking, fix_warning, configure_policy, request_approval

### **NEW: G) Policy Provenance** 🔍
- Evaluated packs with versions
- Triggered rules with decisions
- Obligation results with codes
- **Ensures auditability and reproducibility**

### **NEW: H) Evidence Trace** 🔎
- Where we looked for evidence
- What we found (or didn't find)
- Why obligations failed or couldn't be evaluated
- How to pass each check
- **Ensures transparency and debuggability**

## Success Criteria

- [x] Executive summary includes decision thresholds
- [ ] Policy Provenance section shows pack/rule IDs and codes
- [ ] Evidence Trace section shows where we looked
- [ ] Output is both human-readable AND debuggable
- [ ] No "why did this block?" questions possible
- [ ] Clear path from high-level decision to underlying rules

## The Fix

> "Keep the new summary, but never drop pack/rule IDs + evidence trace—that's what separates you from a bot and prevents 'why did this block?' backlash."

This PR validates that we've achieved both:
1. ✅ **Human-first narrative** (decision-grade summary)
2. ✅ **Evidence audit trail** (policy provenance + evidence trace)

