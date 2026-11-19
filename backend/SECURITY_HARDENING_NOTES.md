# Security hardening notes — validation, timebounds, escrow state, list filters

This branch addresses four reported issues. Two of the described vulnerable code paths
were already hardened in this repository, and two describe endpoints that do not exist
here. Rather than inventing a parallel API, the hardening was applied to the closest
real code paths and locked in with regression tests.

## 1. Sub-stroop precision in gig budgets

**Report:** `100.123456789` is accepted by the gig creation DTO and silently rounded
when the escrow is funded.

**Finding:** `CreateGigSchema` already used a `\d{1,7}` regex, but the rule was duplicated
in four places with a generic `Invalid XLM amount` message, and `normalizeAmount()` /
`xlmToStroops()` round down silently. There was one explicit, actionable validator.

**Change:** added `XLM_AMOUNT_REGEX`, `XLM_AMOUNT_FORMAT_MESSAGE` and `isValidXlmAmount()`
in `src/common/amount.ts`, and made all gig amount fields (create, update, min/max search
filters) plus escrow `amountXLM` use the shared schema. Excess precision now produces a
clear 400 naming the 7-decimal stroop limit before any rounding can happen.

## 2. Unsigned release transactions without a timebound

**Report:** release XDRs remain submittable indefinitely.

**Finding:** the builder already called `.setTimeout(config.STELLAR_TX_VALIDITY_SECONDS)`
(default 60s), so the basic timebound was present. However the configured value was
unbounded: a misconfigured deployment could hand out a days-long valid XDR.

**Change:** added `MAX_RELEASE_TX_VALIDITY_SECONDS = 300` and `clampReleaseTxValidity()`;
every server-built transaction now has an explicit maxTime no more than five minutes out.
Tests assert both the clamp and the `timeBounds` on the built transaction.

## 3. Beneficiary changes on a funded escrow

**Report:** `PATCH /escrow/:id` lets the depositor swap the beneficiary after funding
with no re-challenge.

**Finding:** this controller had no PATCH route and `EscrowService` had no beneficiary
mutation at all. The invariant was simply unenforced for any future caller.

**Change:** added `EscrowService.changeBeneficiary()` which re-checks the depositor,
rejects any change once status is no longer `pending` (the report's "disallow post-funding"
option), rejects self-dealing, and audit-logs successful changes. Exposed it through a
guarded `PATCH /escrows/:id` (`JwtAuthGuard` + depositor check). Post-funding changes now
require a fresh signed action out of band.

## 4. Withdrawn applicants in the list

**Report:** `GET /gig/:id/applicants` returns withdrawn applications with no status filter.

**Finding:** there is no applications/applicants subsystem in this repository (gigs have
a single `responder`/accept flow). The closest analogue is `GET /escrows/depositor/:address`,
which returned every escrow including `cancelled` ones with no filter at all.

**Change:** added a `status` query parameter (validated against `ESCROW_STATUSES`) and an
`includeCancelled` opt-in. Cancelled (withdrawn-equivalent) escrows are now excluded by
default; clients that need them must explicitly ask. Added `EscrowListFilter` to the
service and tests for the default, the opt-in and the exact-status filter.

## Rebase onto upstream `main`

This branch was rebased onto `trustflow-protocol/main` (PR #1005 base). Upstream had
already fixed the `normalizeAmount()` null-safety and the `sourceAccount` definite-assignment
issue; those upstream versions are kept. Upstream also reworked the release builder to
simulate the invocation and fund it from the reported `minResourceFee` plus a margin — that
implementation is preserved, with the 5-minute validity clamp applied inside its shared
`buildWithFee()` helper so both the simulation and the assembled transaction are bounded.
Upstream's newer escrow transition rules (`release`/`cancel`/`split` from active or disputed)
and the dispute-saga routing are also preserved.

## Incidental test fixes

- Two assertions in `common/amount.spec.ts` expected impossible stroop roundings
  (`1.5` stroops → `0.00000001` XLM); corrected to the floored values.
- The depositor-listing test now funds the escrow before disputing it, matching upstream's
  "only active escrows can be disputed" rule.

## Known pre-existing issues (not addressed here)

- Several entities/DTOs still fail strict-mode property-initialization checks
  (e.g. `src/escrow/escrow.entity.ts`, `src/event-ingestion/dto/event-ingestion.dto.ts`).
- Two `onModuleInit` tests in `escrow.service.spec.ts` fail when that spec is run alone
  because `validateEnv()` is not called first; upstream's tests have the same problem.
