# How review intake works

This document describes the **current** Gravity Forms → application review path after the `hf_appcollector` rewrite (issue [#1](https://github.com/Stars-and-Stripes-Honor-Flight/hf_appcollector/issues/1), PR [#2](https://github.com/Stars-and-Stripes-Honor-Flight/hf_appcollector/pull/2)).

## Architecture (high level)

```text
WordPress Gravity Forms
  (Veteran Feed webhook)
           |
           | POST JSON or x-www-form-urlencoded
           | (public HTTPS; no Google IAM on caller)
           v
Cloud Function  review-intake   (Gen2, Node 22)
  project: sshf-api-dev (Dev) / sshf-api-prd (Prod — when cut over)
  runtime SA: review-intake@<project>.iam.gserviceaccount.com
           |
           | 1. Strip cburi / cbusr / cbpwd / full_message
           | 2. Mint Google ID token (audience = API_URL)
           | 3. POST JSON + Authorization: Bearer <id_token>
           v
sshf-api  Cloud Run
  POST /review/applications
  Checks token email ∈ REVIEW_INTAKE_SERVICE_ACCOUNTS
           |
           v
Review CouchDB  (permissive intake; hard validation later on accept)
```

## What changed vs the old path

| | Old (`form-post`) | New (`review-intake`) |
| --- | --- | --- |
| GCP project (live today) | `logistics-app-development` | Dev: `sshf-api-dev` (side-by-side) |
| Function | Gen1 `form-post` | Gen2 `review-intake` |
| Auth to storage | Couch Basic auth from form body (`cburi`/`cbusr`/`cbpwd`) | Google SA **ID token** to sshf-api |
| Destination | CouchDB directly | `POST /review/applications` |
| Credentials in Gravity Forms | Couch password in webhook body | **None** — remove `cb*` after cutover |

**As of 2026-09-11:** live Gravity Forms still points at old `form-post`. Dev `review-intake` is deployed and E2E-tested only. No production cutover until explicitly approved.

## Gravity Forms request formats

The Webhooks add-on supports:

- **JSON** → `Content-Type: application/json` (auto-set on POST/PUT when Request Format = JSON)
- **FORM** → `application/x-www-form-urlencoded`

`review-intake` accepts **both**. Cloud Functions parses either into `req.body`; the function always forwards **JSON** to sshf-api.

Veteran Feed settings currently use **Request Format = JSON**. Older docs/examples used form-urlencoded against `function-test-1` / `form-post`.

## Environment variables

### On the Cloud Function

| Variable | Required | Meaning |
| --- | --- | --- |
| `API_URL` | yes | sshf-api base URL (no path). Audience for the ID token unless overridden. |
| `REVIEW_INTAKE_AUDIENCE` | no | Overrides ID-token audience; defaults to `API_URL`. |

### On sshf-api (Cloud Run)

| Variable | Meaning |
| --- | --- |
| `REVIEW_INTAKE_SERVICE_ACCOUNTS` | Comma-separated list of SA emails allowed to call intake. Must include the function’s runtime SA. |

Intake itself is **permissive** (incomplete form data is OK). Hard validation happens when a reviewer **accepts** an application into logistics.

## Dev inventory (reference)

| Item | Value |
| --- | --- |
| Function URL | https://us-central1-sshf-api-dev.cloudfunctions.net/review-intake |
| Project | `sshf-api-dev` |
| Runtime SA | `review-intake@sshf-api-dev.iam.gserviceaccount.com` |
| API_URL | https://sshf-api-330507742215.us-central1.run.app |
| Live (untouched) webhook | https://us-central1-logistics-app-development.cloudfunctions.net/form-post |

## Code entry

- File: `index.js`
- Export / entry point: `reviewIntake`
- Tests: `npm test` (`index.test.js` — scrubbing + URL helpers)

## Related docs

- [PRODUCTION_CUTOVER.md](./PRODUCTION_CUTOVER.md) — step-by-step how to replicate Dev in production and switch Gravity Forms (when ready)
- Repo root [README.md](../README.md) — deploy commands and quick reference
