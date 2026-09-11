# Production cutover runbook — Gravity Forms → review-intake

**Audience:** Steve (or future-you / Grok Bot) when ready to move review intake from Dev side-by-side into **production**.

**Do not start this runbook until Steve explicitly decides to cut over production.** Live site traffic must keep using the old webhook until the final Gravity Forms URL change in this document.

This mirrors what was done for **Dev** on 2026-09-11 (SA + Gen2 function + `REVIEW_INTAKE_SERVICE_ACCOUNTS` + E2E probe). Production uses project **`sshf-api-prd`** instead of **`sshf-api-dev`**.

---

## Goals

1. Deploy **new** Gen2 function `review-intake` in `sshf-api-prd` (do **not** overwrite anything named `form-post`).
2. Allowlist its runtime SA on production sshf-api.
3. Prove E2E with a probe POST (not live Gravity Forms yet).
4. Only then point Gravity Forms Veteran Feed at the new URL.
5. Leave a rollback path (old `form-post` URL) until confident.

---

## Prerequisites

- [ ] sshf-api **production** already has review intake endpoints deployed (`POST /review/applications`) and a review DB configured (same feature set as Dev PR #96 / #95).
- [ ] You have GCP Console (or `gcloud`) access to **`sshf-api-prd`** and read access to **`logistics-app-development`** (to leave `form-post` alone / note its URL for rollback).
- [ ] Repo: https://github.com/Stars-and-Stripes-Honor-Flight/hf_appcollector (`master` includes the rewrite).
- [ ] Cursor Background Agents may not see this repo; use Console Cloud Shell, local `gcloud`, or the GitHub connector as needed.
- [ ] Decide: keep Gravity Forms **Request Format = JSON** (current) or FORM; function supports both.

---

## Reference table — Dev (done) vs Prod (to do)

| | Dev (completed 2026-09-11) | Production (fill / use) |
| --- | --- | --- |
| GCP project | `sshf-api-dev` | `sshf-api-prd` |
| Cloud Run API URL | `https://sshf-api-330507742215.us-central1.run.app` | `https://sshf-api-928260206537.us-central1.run.app` |
| Function name | `review-intake` | `review-intake` (same name, different project) |
| Region | `us-central1` | `us-central1` |
| Runtime | Node.js 22 | Node.js 22 |
| Entry point | `reviewIntake` | `reviewIntake` |
| Runtime SA | `review-intake@sshf-api-dev.iam.gserviceaccount.com` | `review-intake@sshf-api-prd.iam.gserviceaccount.com` |
| Expected function URL | `https://us-central1-sshf-api-dev.cloudfunctions.net/review-intake` | `https://us-central1-sshf-api-prd.cloudfunctions.net/review-intake` |
| Live webhook today (rollback) | `https://us-central1-logistics-app-development.cloudfunctions.net/form-post` | **same until cutover** — do not delete |

Confirm the prod API URL in Console (Cloud Run → `sshf-api` → URL) before deploying; the table matches sshf-api’s documented Dev/Prod pairing.

---

## Phase A — Create dedicated runtime SA (prod)

1. Console → project **`sshf-api-prd`** → IAM & Admin → Service accounts → **Create service account**.
2. Name / ID: `review-intake`  
   Email will be: `review-intake@sshf-api-prd.iam.gserviceaccount.com`
3. Description example: `Runtime SA for Gravity Forms → sshf-api review intake (production)`
4. Skip optional project-wide roles (none required for minting its own ID tokens as the function runtime SA).
5. Finish. Confirm the SA appears **Enabled**.

Do **not** create JSON keys for this SA. The Cloud Function uses Application Default Credentials / metadata.

---

## Phase B — Deploy Gen2 function (prod)

From Cloud Shell (or any machine with `gcloud` + repo checkout):

```bash
gcloud config set project sshf-api-prd

git clone https://github.com/Stars-and-Stripes-Honor-Flight/hf_appcollector.git /tmp/hf_appcollector
cd /tmp/hf_appcollector
# ensure you are on master with the rewrite merged

gcloud functions deploy review-intake \
  --gen2 \
  --runtime=nodejs22 \
  --region=us-central1 \
  --project=sshf-api-prd \
  --source=. \
  --entry-point=reviewIntake \
  --trigger-http \
  --allow-unauthenticated \
  --service-account=review-intake@sshf-api-prd.iam.gserviceaccount.com \
  --set-env-vars=API_URL=https://sshf-api-928260206537.us-central1.run.app \
  --memory=256Mi \
  --timeout=60s
```

Notes:

- Accept prompts to enable Cloud Functions / Cloud Build / Artifact Registry / Eventarc / Cloud Run APIs if needed.
- Accept granting the deploy agents `iam.serviceAccountUser` on `review-intake@...` if prompted.
- **Never** deploy this as `form-post` and **never** deploy into `logistics-app-development` as part of cutover prep.
- `--allow-unauthenticated` is intentional: Gravity Forms cannot present Google IAM. Security is the ID token to sshf-api.

Record the HTTPS trigger URL from the deploy output (should match the Expected function URL above).

---

## Phase C — Allowlist SA on production sshf-api

1. Console → **`sshf-api-prd`** → Cloud Run → service **`sshf-api`** → Edit & deploy new revision.
2. Variables & secrets / container env:
   - Set **`REVIEW_INTAKE_SERVICE_ACCOUNTS`** to  
     `review-intake@sshf-api-prd.iam.gserviceaccount.com`  
   - If the variable already has other emails, **append** (comma-separated); do not wipe unrelated values.
3. Deploy revision. Wait until Ready; confirm 100% traffic on the new revision.

Alternatively with gcloud:

```bash
gcloud run services update sshf-api \
  --region=us-central1 \
  --project=sshf-api-prd \
  --update-env-vars=REVIEW_INTAKE_SERVICE_ACCOUNTS=review-intake@sshf-api-prd.iam.gserviceaccount.com
```

(If other emails must be preserved, read current env first and pass the full comma-separated list.)

**Important:** Production sshf-api is normally promoted via GitHub Release / approval. A Console/`gcloud` env update creates a new revision immediately — coordinate so a later release pipeline does not accidentally drop `REVIEW_INTAKE_SERVICE_ACCOUNTS`. Prefer also recording this var in whatever secret/env source the prod deploy workflow uses (e.g. GitHub Environment / Secret Manager mapping), same as other `*-prd` config.

---

## Phase D — E2E probe (before touching Gravity Forms)

JSON probe (matches current Veteran Feed Request Format):

```bash
curl -sS -w "\nHTTP:%{http_code}\n" -X POST \
  "https://us-central1-sshf-api-prd.cloudfunctions.net/review-intake" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "VeteranApp",
    "app_status": "New",
    "first_name": "Prod",
    "last_name": "IntakeProbe",
    "email": "prod.intake.probe@example.com",
    "notes": "Production review-intake probe — safe to delete",
    "cburi": "https://should-be-stripped.example/db",
    "cbusr": "should-strip",
    "cbpwd": "should-strip",
    "full_message": "should-strip"
  }'
```

Expect **HTTP 201** and a review document `_id` in the JSON body. Confirm the row in the **production** App Review UI / review DB.

Optional form-urlencoded smoke (legacy FORM format):

```bash
curl -sS -w "\nHTTP:%{http_code}\n" -X POST \
  "https://us-central1-sshf-api-prd.cloudfunctions.net/review-intake" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode 'type=VeteranApp' \
  --data-urlencode 'app_status=New' \
  --data-urlencode 'notes=form-urlencoded prod probe'
```

If probes fail:

- **401/403 from API** — SA email missing or typo in `REVIEW_INTAKE_SERVICE_ACCOUNTS`; audience mismatch (`API_URL` must match what the API expects).
- **502 from function** — check Cloud Function logs (`review-intake`) and Cloud Run `sshf-api` logs.
- **Empty name fields** — legacy flat keys may not map into nested `name.first` etc.; intake is permissive; real Gravity Forms field mapping is separate from this relay.

---

## Phase E — Gravity Forms cutover (only when ready)

1. Snapshot current Veteran Feed settings (Request URL, method, format, field map). Keep a copy for rollback.
2. Change **Request URL** from  
   `https://us-central1-logistics-app-development.cloudfunctions.net/form-post`  
   to  
   `https://us-central1-sshf-api-prd.cloudfunctions.net/review-intake`
3. Keep method **POST**. Prefer **Request Format = JSON** (current).
4. **Remove** `cburi` / `cbusr` / `cbpwd` from the webhook body mapping (no longer used; secrets should not live in the form).
5. Submit a **real test** entry on the production form (or a staging clone if available).
6. Confirm App Review UI shows the new application.
7. After confidence: rotate any Couch passwords that were previously embedded in Gravity Forms / chat / old function configs.

**Do not delete** `form-post` in `logistics-app-development` until you no longer need instant rollback.

---

## Rollback

1. Point Gravity Forms Request URL back to  
   `https://us-central1-logistics-app-development.cloudfunctions.net/form-post`
2. Restore any `cb*` mappings if the old function still requires them.
3. Prod `review-intake` can stay deployed (idle) for a later retry.

---

## Checklist summary

- [ ] Prod API has review intake + review DB
- [ ] SA `review-intake@sshf-api-prd.iam.gserviceaccount.com` created
- [ ] Function `review-intake` deployed Gen2 in `sshf-api-prd` with `API_URL` = prod Cloud Run URL
- [ ] `REVIEW_INTAKE_SERVICE_ACCOUNTS` on prod `sshf-api` includes that SA (and survives future releases)
- [ ] Probe POST returns 201; visible in review UI
- [ ] Gravity Forms URL updated; `cb*` removed; test submission OK
- [ ] Old `form-post` retained until rollback window ends
- [ ] Couch credentials rotated if they were ever in the form

---

## Ask Grok Bot (when available)

When ready, tell Chief of Staff / Grok Bot: **“Cut over review-intake to production per docs/PRODUCTION_CUTOVER.md”**. Bring this file; Dev already proved the pattern. Expect the same order: SA → deploy → allowlist → probe → **then** Gravity Forms URL.

---

## History

| Date | Event |
| --- | --- |
| 2026-09-11 | Dev: SA + `review-intake` in `sshf-api-dev`; allowlist on Dev API; JSON + form-urlencoded probes returned 201; Gravity Forms left on `form-post`. |
| (TBD) | Prod cutover per this runbook. |
