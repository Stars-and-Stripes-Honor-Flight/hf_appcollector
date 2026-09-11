const { GoogleAuth } = require("google-auth-library");

const STRIP_KEYS = ["cburi", "cbusr", "cbpwd", "full_message"];

/**
 * Remove CouchDB / Gravity Forms leftovers before forwarding to sshf-api.
 * @param {Record<string, unknown>} body
 * @returns {Record<string, unknown>}
 */
function scrubBody(body) {
  const cleaned = { ...(body || {}) };
  for (const key of STRIP_KEYS) {
    delete cleaned[key];
  }
  return cleaned;
}

/**
 * @param {string} apiUrl
 * @returns {string}
 */
function applicationsUrl(apiUrl) {
  const base = String(apiUrl).replace(/\/+$/, "");
  return `${base}/review/applications`;
}

/**
 * Mint a Google ID token for the given audience (API URL).
 * @param {string} audience
 * @returns {Promise<string>} Authorization header value ("Bearer …")
 */
async function getAuthorizationHeader(audience) {
  const auth = new GoogleAuth();
  const client = await auth.getIdTokenClient(audience);
  const headers = await client.getRequestHeaders();
  const authorization = headers.Authorization || headers.authorization;
  if (!authorization) {
    throw new Error("Failed to obtain ID token");
  }
  return authorization;
}

/**
 * Gen2 HTTP entry: Gravity Forms webhook → sshf-api POST /review/applications.
 * Deploy as function `review-intake` with entry point `reviewIntake`.
 */
async function reviewIntake(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    console.error("API_URL is not set");
    res.status(500).send("Server misconfigured");
    return;
  }

  const audience = process.env.REVIEW_INTAKE_AUDIENCE || apiUrl;
  const payload = scrubBody(req.body);

  try {
    const authorization = await getAuthorizationHeader(audience);
    const response = await fetch(applicationsUrl(apiUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization
      },
      body: JSON.stringify(payload)
    });

    const responseBody = await response.text();

    if (response.ok) {
      console.log("review intake accepted", response.status);
      try {
        res.status(response.status).json(JSON.parse(responseBody));
      } catch {
        res.status(response.status).send(responseBody || payload);
      }
      return;
    }

    console.error(
      "sshf-api review intake error",
      response.status,
      response.statusText,
      responseBody
    );
    res.status(502).send("Failed to submit application for review");
  } catch (error) {
    console.error("review intake request failed", error);
    res.status(502).send("Failed to submit application for review");
  }
}

exports.reviewIntake = reviewIntake;
/** @deprecated Alias kept for local smoke tests; deploy entry point is reviewIntake. */
exports.helloWorld = reviewIntake;
exports.scrubBody = scrubBody;
exports.applicationsUrl = applicationsUrl;
