# TRAXO Token Verification Service

This small Express service verifies Firebase ID tokens using the Firebase Admin SDK.

Setup

1. Install dependencies:

```bash
cd server
npm install
```

2. Provide credentials (one of the two methods):

- Set `GOOGLE_APPLICATION_CREDENTIALS` to the path of a service account JSON file, or
- Set `FIREBASE_SERVICE_ACCOUNT_JSON` to the raw JSON content of the service account (useful in container env vars).

3. Start the server:

```bash
npm run dev
# or
npm start
```

Endpoints

- `GET /health` — simple healthcheck
- `POST /verify-token` — Accepts `Authorization: Bearer <idToken>` and returns decoded token data.

Next steps

- Wire this service behind your backend APIs. On each request from the frontend, forward the Firebase ID token to `/verify-token` to validate identity.
- After verification, the service can query your SQL/Data Connect layer and return user-specific data.
