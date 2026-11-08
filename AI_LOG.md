# AI log

## How I used AI

I used an AI agent for nearly the whole build:

- turning the brief into a plan,
- scaffolding the app,
- writing the booking engine, the API, the UI and the tests,
- verifying the result.

I reviewed the plan, steered its scope, and checked the results.

## Key prompts

1. _"Make a plan for the Slotbook repo, TypeScript end to end"_ (with the brief PDF attached).
2. _"Make sure this plan is simple and easy, as I have to explain it in 5 minutes. It should follow best practices and not be over-engineered."_ This cut the plan down to one Next.js app, plain SQL, and one transaction pattern.
3. _"Make sure it is perfectly aligned with the brief, nothing extra from your side."_ This removed every optional extension and kept only the 5 API endpoints the brief asks for, plus the host API the dashboard needs.
4. _"Build this app with Docker and this plan."_

## Where the AI got things wrong (and what was fixed)

- **Tooling versions.** It first installed Vitest 5, which needs Node 22. The box had Node 20, so it was pinned to Vitest 4. A CommonJS warning from the Vite config was fixed by renaming it to `vitest.config.mts`.
- **Off-by-one in the slot range.** A `+1 ms` hack made the `to` bound inclusive, and a test caught it. Now `to` is exclusive.
- **Hydration mismatch.** Dates were formatted with the default locale, and the time-zone list came from the server's `Intl` data. Both differ between server and browser, so React logged hydration errors. The fix was a fixed locale and loading the zone list after mount. This was found with a headless-Chrome run of the guest flow.
- **Duplicate slots.** Overlapping availability windows on the same day (for example, adding 09:00–17:00 next to 09:00–12:00) produced the same slot twice. Overlapping windows are now rejected with a `422`, and a test covers it.
- **Wrong manage link inside Docker.** The link was built from `req.url`, which is the bind address (`0.0.0.0`). It is now built from the request's `Host` header.
- **Test-and-cleanup mistakes in its own process.** For example, a `pkill` pattern that did not match the Next server process, so an old build kept serving during one check. It was caught and the checks were re-run.

## What I changed or decided by hand

- Kept the scope to the core (no optional extensions) and asked for the simplest design that still meets every requirement.
- Chose the design decisions listed under _Assumptions_ in the README after reviewing the plan.
- _(Add any manual edits you make before submitting here.)_
