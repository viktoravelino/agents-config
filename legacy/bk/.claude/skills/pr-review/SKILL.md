---
name: pr-review
description: Structured PR code review with prioritized categories, status tables, and actionable findings. Produces a comprehensive review covering security, DRY, architecture, testing, and more.
origin: custom
---

# PR Review Skill

Perform a structured, comprehensive code review of a pull request.

## When to Activate

- User asks to review a PR (by URL, number, or diff)
- User asks for a code review of recent changes
- User runs `/pr-review`

## How to Invoke

The user provides a PR reference:
- A GitHub PR URL (e.g., `https://github.com/owner/repo/pull/123`)
- A PR number (e.g., `#123` — assume current repo if no repo specified)
- A diff or set of files pasted directly

## Review Process

### Step 1 — Fetch PR Data

If given a GitHub URL or number:
```bash
gh pr view <number> --repo <owner/repo> --json number,title,body,author
gh api repos/<owner>/<repo>/pulls/<number>/files --jq '.[] | {filename, status, additions, deletions, changes}'
gh api repos/<owner>/<repo>/pulls/<number>/reviews
```

Read the actual changed files to understand the implementation in depth before writing the review.

### Step 2 — Build the Review

Produce the review in the exact format below.

---

## Output Format

---

## Summary

Write a 1–2 sentence overview of what the PR does and why.

Then produce a **Files Changed** table. Exclude trivial/generated files (lock files, auto-generated JSON, migration hashes). Group by area.

| File | Change | Area |
|------|--------|------|
| `path/to/file.ts` | **New** — short description (N lines) | Frontend |
| `path/to/file.py` | Modified — what changed | Backend |
| `path/to/test.py` | **New** — N lines | Test |

---

## Review by Category

For each category below, produce:
1. A **table** with columns: `Item | Status | Notes`
2. Optional **Observation** callouts for notable positive or negative findings
3. A `**Result:**` line

**Status values:**
- `✅ PASS` — requirement met
- `⚠️ VERIFY` — cannot confirm from diff alone; reviewer must manually check
- `❌ FAIL` — requirement violated; must be fixed
- `N/A` — not applicable to this PR

---

### 🔴 CRITICAL: Security & PII

Check: no PII in logs, no hardcoded secrets/keys, no internal details exposed in error messages to end users, test data uses fake/anonymized values.

| Item | Status | Notes |
|------|--------|-------|
| No PII in logs | ... | ... |
| No secrets/credentials in code | ... | ... |
| No hardcoded API keys | ... | ... |
| No internal details in user-facing errors | ... | ... |
| Test data uses fake/anonymized data | ... | ... |

**Result: ✅ PASS / ❌ FAIL**

---

### 🔴 CRITICAL: DRY Principle

Check: no duplicate type definitions, no duplicate logic, no duplicate constants, shared modules reused correctly.

| Item | Status | Notes |
|------|--------|-------|
| No duplicate type definitions | ... | ... |
| No duplicate logic | ... | ... |
| No duplicate constants | ... | ... |
| Shared module reuse | ... | ... |

Note positive DRY improvements when the PR consolidates existing duplication.

**Result: ✅ PASS / ❌ FAIL**

---

### 🔴 CRITICAL: File Structure Limits

Check each new or significantly modified file:
- **300 lines max** per file (logic lines, excluding blank lines and pure comments)
- **5 functions max** with *different* responsibilities per class or module (functions sharing the same responsibility don't count toward the limit)
- **1 main class** per file (ideally)
- **Single responsibility** — a file should have one clear reason to change

| Item | Status | Notes |
|------|--------|-------|
| `filename.ext` (N lines) | ✅ PASS / ⚠️ VERIFY | Under/over 300-line limit |
| Functions per file | ✅ PASS | Count of public functions and their responsibilities |
| Main classes per file | ✅ PASS | N class(es) |
| Mixed responsibilities | ✅ PASS / ❌ FAIL | Single-responsibility check |

List any ⚠️ VERIFY items that require manual line-count inspection.

**Result: ✅ PASS / ✅ PASS with VERIFY items / ❌ FAIL**

---

### 🟠 IMPORTANT: Architecture & Structure

Check: single responsibility at component level, proper layer separation (data/business/presentation), no business logic in view/handler layers, unidirectional data flow, thread/concurrency safety where relevant.

| Item | Status | Notes |
|------|--------|-------|
| Single Responsibility | ... | ... |
| Layer Separation | ... | ... |
| No business logic in handlers/views | ... | ... |
| Data flow direction | ... | ... |
| Thread safety (if concurrent code) | ... | ... |

**Result: ✅ PASS / ❌ FAIL**

---

### 🟠 IMPORTANT: Code Quality

Check: strong typing (no `any`/`object`), immutability preferred, intention-revealing names, early returns/guard clauses used, no magic numbers/strings.

| Item | Status | Notes |
|------|--------|-------|
| Strong typing | ... | ... |
| No `any`/`object` types | ... | ... |
| Immutability | ... | ... |
| Clean naming | ... | ... |
| Early returns / guard clauses | ... | ... |
| No magic numbers/strings | ... | ... |

**Result: ✅ PASS / ❌ FAIL**

---

### 🟠 IMPORTANT: Error Handling

Check: no silent failures (swallowed exceptions without logging/re-raising), explicit error handling for expected failure modes, meaningful error context, null/undefined safety throughout.

| Item | Status | Notes |
|------|--------|-------|
| No silent failures | ... | ... |
| Explicit error handling | ... | ... |
| Meaningful error context | ... | ... |
| Null safety | ... | ... |

**Result: ✅ PASS / ❌ FAIL**

---

### 🟡 RECOMMENDED: Observability

Check: logging at key decision points, no sensitive data in logs, tracing/metrics integration updated if needed.

| Item | Status | Notes |
|------|--------|-------|
| Logging at key points | ... | ... |
| No sensitive data in logs | ... | ... |
| Tracing integration | ... | ... |

**Result: ✅ PASS / ❌ FAIL**

---

### 🟡 RECOMMENDED: Comments

Check: comments explain WHY (not WHAT — the code says what), no TODO/FIXME without a ticket reference, no commented-out dead code.

| Item | Status | Notes |
|------|--------|-------|
| No comments explaining WHAT | ... | ... |
| Only WHY comments | ... | ... |
| No TODO without ticket | ... | ... |
| No commented-out dead code | ... | ... |

**Result: ✅ PASS / ❌ FAIL**

---

### 🟢 TESTING

Produce two sub-tables.

**Coverage table** — list every new test file:

| Test File | What It Validates | Lines |
|-----------|-------------------|-------|
| `path/to/test.py` | What scenarios are covered | N |

**Missing scenarios** — list gaps found during review:

| Scenario | Severity |
|----------|----------|
| Description of missing test | 🔴 CRITICAL / 🟠 IMPORTANT / 🟡 RECOMMENDED / 🟢 NICE TO HAVE |

**Checklist:**

| Item | Status | Notes |
|------|--------|-------|
| Unit tests for core logic | ... | ... |
| Happy path covered | ... | ... |
| Adversarial/error cases | ... | ... |
| Edge cases | ... | ... |
| Test naming | ... | ... |
| Independent tests (no shared state) | ... | ... |
| Mocking of external dependencies | ... | ... |
| AAA pattern (Arrange-Act-Assert) | ... | ... |
| One logical act per test | ... | ... |

Include the commands needed to run coverage:
```bash
# Backend
pytest --cov=<module> --cov-report=term-missing

# Frontend
npx vitest run --coverage
```

**Result: ✅ PASS / ❌ FAIL**

---

### 🟢 LEGACY CODE AWARENESS

Check: PR does not perpetuate bad existing patterns, no copy-paste from legacy code, backward compatibility handled correctly (optional fields, validators, feature flags if needed).

| Item | Status | Notes |
|------|--------|-------|
| Not prolonging bad patterns | ... | ... |
| No copy-paste from legacy | ... | ... |
| Backward compatibility | ... | ... |

**Result: ✅ PASS / ❌ FAIL**

---

### 🟢 FRONTEND-SPECIFIC *(include only when PR touches frontend code)*

Check: proper TypeScript types (no `any`), expensive computations/callbacks memoized (`useMemo`/`useCallback`), conditional rendering for optional data, UI/UX consistency with existing patterns, accessibility (keyboard nav, ARIA, screen reader support).

| Item | Status | Notes |
|------|--------|-------|
| TypeScript types | ... | ... |
| Component structure | ... | ... |
| Memoization | ... | ... |
| Conditional rendering | ... | ... |
| UI/UX consistency | ... | ... |
| Accessibility | ... | ... |

**Result: ✅ PASS / ❌ FAIL**

---

## Overall Assessment

### Score: ✅ APPROVE / 🟠 APPROVE WITH COMMENTS / ❌ REQUEST CHANGES

| Category | Result |
|----------|--------|
| 🔴 Security & PII | ✅ PASS / ❌ FAIL |
| 🔴 DRY | ✅ PASS / ❌ FAIL |
| 🔴 File Structure | ✅ PASS / ❌ FAIL |
| 🟠 Architecture | ✅ PASS / ❌ FAIL |
| 🟠 Code Quality | ✅ PASS / ❌ FAIL |
| 🟠 Error Handling | ✅ PASS / ❌ FAIL |
| 🟡 Observability | ✅ PASS / ❌ FAIL |
| 🟡 Comments | ✅ PASS / ❌ FAIL |
| 🟢 Testing | ✅ PASS / ❌ FAIL |
| 🟢 Legacy Awareness | ✅ PASS / ❌ FAIL |
| 🟢 Frontend-Specific | ✅ PASS / ❌ FAIL / N/A |

**Decision logic:**
- Any 🔴 category ❌ FAIL → `REQUEST CHANGES`
- Any 🟠 category ❌ FAIL → `APPROVE WITH COMMENTS` (or `REQUEST CHANGES` if severe)
- All 🔴 and 🟠 pass but 🟡/🟢 fail → `APPROVE WITH COMMENTS`
- Everything passes → `APPROVE`

---

## Verification Items *(non-blocking)*

Numbered list of items that could not be confirmed from the diff alone and require manual inspection:

1. **Item title** — what to check and how
2. ...

---

## Recommendations *(non-blocking)*

Numbered list of suggested improvements that go beyond the current PR scope but would strengthen the codebase:

1. **Recommendation title** — what to do and why
2. ...

---

## Review Style Rules

- Be precise and specific — quote file names, line references, function names
- Separate facts from opinions clearly
- Call out positive findings, not just problems — acknowledge when a PR actively improves code quality
- Keep each table row to one sentence in the Notes column
- Never invent issues; if uncertain, use ⚠️ VERIFY with an explanation of what to check
- Recommendations must be actionable and include the "why"
- The tone should be collegial and constructive, not adversarial
