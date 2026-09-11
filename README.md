# hf_appcollector

Gravity Forms webhook relay → **sshf-api** `POST /review/applications` using a Google service-account **ID token**.

This replaces the old CouchDB Basic-auth relay (`cburi` / `cbusr` / `cbpwd` in the form body).

## Docs

| Doc | Purpose |
| --- | --- |
| [docs/HOW_IT_WORKS.md](./docs/HOW_IT_WORKS.md) | Architecture, GF formats, Dev inventory |
| [docs/PRODUCTION_CUTOVER.md](./docs/PRODUCTION_CUTOVER.md) | **Full prod runbook** (replicate Dev → `sshf-api-prd`, then cut over Gravity Forms) |

## Behavior

1. Accepts `POST` as **JSON** or **`application/x-www-form-urlencoded`** (Gravity Forms Request Format JSON or FORM).
2. Strips `cburi`, `cbusr`, `cbpwd`, and `full_message` (never forwards Couch credentials).
3. Mints an ID token for audience `REVIEW_INTAKE_AUDIENCE` or, if unset, `API_URL`.
4. POSTs the cleaned body as JSON to `{API_URL}/review/applications` with `Authorization: Bearer <id_token>`.

Intake on the API is permissive; hard validation happens later when accepting into logistics.

## Environment

| Variable | Required | Description |
| --- | --- | --- |
| `API_URL` | yes | sshf-api base URL (no trailing path). Dev: `https://sshf-api-330507742215.us-central1.run.app`. Prod: `https://sshf-api-928260206537.us-central1.run.app` |
| `REVIEW_INTAKE_AUDIENCE` | no | ID-token audience; defaults to `API_URL` |

On **sshf-api**, set `REVIEW_INTAKE_SERVICE_ACCOUNTS` to the **runtime service account email** of this function (comma-separated if more than one).

## Entry point

- Export: `reviewIntake`
- Gen2 function name: `review-intake`
- Runtime: Node.js 22

## Current status (2026-09-11)

| Environment | Status |
| --- | --- |
| **Dev** | Deployed & E2E tested: https://us-central1-sshf-api-dev.cloudfunctions.net/review-intake |
| **Prod** | Not cut over — follow [docs/PRODUCTION_CUTOVER.md](./docs/PRODUCTION_CUTOVER.md) when ready |
| **Live Gravity Forms** | Still → https://us-central1-logistics-app-development.cloudfunctions.net/form-post (`logistics-app-development`). Leave untouched until explicit cutover. |

## Deploy (new function only — do not overwrite live `form-post`)

### Dev (already done; command for redeploy)

```bash
gcloud functions deploy review-intake \
  --gen2 \
  --runtime=nodejs22 \
  --region=us-central1 \
  --project=sshf-api-dev \
  --source=. \
  --entry-point=reviewIntake \
  --trigger-http \
  --allow-unauthenticated \
  --service-account=review-intake@sshf-api-dev.iam.gserviceaccount.com \
  --set-env-vars=API_URL=https://sshf-api-330507742215.us-central1.run.app \
  --memory=256Mi \
  --timeout=60s
```

### Prod

Use the same pattern with project `sshf-api-prd`, SA `review-intake@sshf-api-prd.iam.gserviceaccount.com`, and prod `API_URL`. See [docs/PRODUCTION_CUTOVER.md](./docs/PRODUCTION_CUTOVER.md).

`--allow-unauthenticated` matches Gravity Forms (public HTTPS webhook). Auth to the API is the ID token from the runtime SA.

**Do not** deploy this code as `form-post` in `logistics-app-development` until cutover is approved.

## Local test

```bash
npm install
npm test
```

## Related

- Issue: [#1](https://github.com/Stars-and-Stripes-Honor-Flight/hf_appcollector/issues/1)
- API: sshf-api review intake (`POST /review/applications`)
