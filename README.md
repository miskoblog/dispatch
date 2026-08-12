# Dispatch

The mission control for everything Claw AI Army hands you back.

A free bonus for the Claw AI Army launch. Claw AI Army ships execution — the
agents do the work. Dispatch covers what's left standing with the buyer: what
to brief, whether the output is good enough, how to actually publish it, and
what to charge if you're reselling it.

Four tools share one job record, so a job started in **Brief Forge** carries
through **ShipCheck**, **GoLive** and **RateCard**:

- **Brief Forge** — a weighted positioning-angle scoring engine that turns
  your product, price and audience into a ready-to-paste opening brief.
- **ShipCheck** — a channel-specific quality checklist with a weighted pass/
  revise score, for the moment right before you approve a deliverable.
- **GoLive** — a step-by-step publishing checklist per destination platform,
  with a live launch-readiness tracker.
- **RateCard** — a service/market/complexity pricing engine for anyone
  reselling Claw-generated work, with a copy-ready quote line.

## Tech

Fully static — plain HTML/CSS/JS, no build step, no framework, no backend, no
API calls. Every job autosaves to your own browser via `localStorage` and
restores on return. Nothing is sent anywhere, nothing to set up.

## Access

This app is password-gated with a client-side SHA-256 check. That's a soft
deterrent to keep it off search engines and out of casual hands — it is not
real security. Anyone with browser dev tools can read the hash. Don't put
anything sensitive behind it.
