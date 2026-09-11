# hf_appcollector

Gravity Forms webhook relay → **sshf-api** `POST /review/applications` using a Google service-account **ID token**.

This replaces the old CouchDB Basic-auth relay (`cburi` / `cbusr` / `cbpwd` in the form body).

## Behavior

1. Accepts `POST` JSON from Gravity Forms (legacy field names; typically `type=VeteranApp`, `app_status=New`).
2. Strips `cburi`, `cbusr`, `cbpwd`, and `full_message` (never forwards Couch credentials).
3. Mints an ID token for audience `REVIEW_INTAKE_AUDIENCE` or, if unset, `API_URL`.
4. POSTs the cleaned body to `{API_URL}/review/applications` with `Authorization: Bearer <id_token>`.

Intake on the API is permissive; hard validation happens later when accepting into logistics.

## Environment

| Variable | Required | Description |
| --- | --- | --- |
| `API_URL` | yes | sshf-api base URL (no trailing path). Dev example: `https://sshf-api-330507742215.us-central1.run.app` |
| `REVIEW_INTAKE_AUDIENCE` | no | ID-token audience; defaults to `API_URL` |

On **sshf-api**, set `REVIEW_INTAKE_SERVICE_ACCOUNTS` to the **runtime service account email** of this function (comma-separated if more than one).

## Entry point

- Export: `reviewIntake`
- Intended Gen2 function name: `review-intake`
- Runtime: Node.js 22

## Deploy (new function only — do not overwrite live `form-post`)

Live Gravity Forms traffic still hits:

`https://us-central1-logistics-app-development.cloudfunctions.net/form-post`

in project **`logistics-app-development`**. Leave that Gen1 function **untouched** until an explicit cutover.

Deploy a **new** side-by-side function in **`sshf-api-dev`**:

```bash
# Prefer a dedicated runtime SA (create once), then allowlist its email on sshf-api:
#   REVIEW_INTAKE_SERVICE_ACCOUNTS=review-intake@sshf-api-dev.iam.gserviceaccount.com

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
  --set-env-vars=API_URL=https://sshf-api-330507742215.us-central1.run.app
```

`--allow-unauthenticated` matches Gravity Forms (public HTTPS webhook). Auth to the API is the ID token from the runtime SA — not IAM on the webhook caller.

**Do not** deploy this code as `form-post` in `logistics-app-development` until cutover is approved.

## Local test

```bash
npm install
npm test
```

## Related

- Issue: [#1](https://github.com/Stars-and-Stripes-Honor-Flight/hf_appcollector/issues/1)
- API: sshf-api review intake (`POST /review/applications`)
