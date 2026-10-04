# SONIC HUB AI — Production AI Music Platform (KIE.ai Suno V6)

A full-stack, enterprise-grade AI music generation platform powered by the official **KIE.ai Suno API**. Features multi-key provider management with automatic failover, server-side AES-256-GCM encryption, real-time job processing state machines, transactional credit accounting, resilient webhook callbacks, and a studio audio player.

---

## 1. Project Overview

**Sonic Hub AI** is built on a strict **NO-MOCK** architectural foundation:
- Real KIE.ai API tasks are dispatched to `POST https://api.kie.ai/api/v1/jobs/createTask`.
- All credentials are encrypted server-side; API keys are never exposed to browser clients.
- Status updates and audio delivery rely on genuine webhook callbacks (`POST /api/webhooks/kie/music`) and polling fallback.
- Audio tracks returned by KIE.ai are rendered in an HTML5 waveform player with direct and proxied MP3 downloads.
- Automatic credit reservation before task submission, finalization on completion, and instant idempotency-guaranteed refunds if generation fails.

---

## 2. Architecture

```
USER BROWSER (React 19 + TypeScript + Tailwind)
       │
       ▼
SONIC HUB EXPRESS BACKEND (server.ts / :3000)
       │
       ├── AUTH & ROLE GUARD (Firebase Auth + Admin Altamedia)
       ├── CREDIT SERVICE (Reservation / Finalization / Refund)
       ├── KIE ACCOUNT ROUTER (Priority, Cooldown, Concurrency, Failover)
       ├── AES-256-GCM ENCRYPTION SERVICE
       │
       ▼
REAL KIE.AI SUNO API (https://api.kie.ai/api/v1/jobs/createTask)
       │
       ▼
KIE SUNO NEURAL SYNTHESIS CLUSTER
       │
       ▼
KIE WEBHOOK CALLBACK (POST /api/webhooks/kie/music)
       │
       ▼
FIRESTORE PERSISTENCE (fine-discovery-207pf)
       │
       ▼
HTML5 AUDIO PLAYER & DOWNLOAD PROXY
```

---

## 3. Firebase Setup

The application is provisioned with Firebase Firestore and Firebase Authentication:
- **Project ID**: `fine-discovery-207pf`
- **Database ID**: `ai-studio-sonichubai-54df4e0b-6e6d-4ab8-97ea-0988451a296e`
- **Configuration File**: `firebase-applet-config.json`

Client-side Firebase is initialized in `src/firebase/config.ts` and runs connection health checks via `getDocFromServer` on boot.

---

## 4. Authentication Setup

- **Administrator**: `altamedia51@gmail.com` is automatically granted the `admin` role upon sign-in.
- **Regular Users**: Automatically provisioned with 100 starter credits on sign-up.
- **Quick Test Switcher**: Provided in the Auth modal and user profile dropdown for rapid role switching.

---

## 5. Firestore Setup & Security Rules

Firestore data structures are formally declared in `firebase-blueprint.json` and secured in `firestore.rules`:
- `/users/{userId}`: Users can view their own profile; credit adjustments and roles are strictly server/admin-controlled.
- `/kie_accounts/{accountId}`: **Strictly admin-only**. Contains encrypted KIE API keys.
- `/generation_jobs/{jobId}`: Read by job owner or admin; write controlled via server backend.
- `/generation_tracks/{trackId}`: Read by track owner or admin.
- `/credit_transactions/{txId}`: Audit ledger read by user or admin.
- `/system_logs/{logId}`: Audit trail accessible only to administrators.
- `/app_settings/{settingId}`: Platform settings written only by administrators.

Rules deployed using `rpc_action fax.DeployRules`.

---

## 6. Environment Variables

Defined in `.env.example`:

```bash
# GEMINI_API_KEY: Injected by AI Studio runtime
GEMINI_API_KEY="MY_GEMINI_API_KEY"

# APP_URL / PUBLIC_APP_URL: Cloud Run domain used for KIE webhook callbacks
APP_URL="https://ais-dev-bbb2lejx774y7mq2oyvah5-148011146941.asia-southeast1.run.app"
PUBLIC_APP_URL="https://ais-dev-bbb2lejx774y7mq2oyvah5-148011146941.asia-southeast1.run.app"

# KIE_ENCRYPTION_KEY: 32-byte (64 hex characters) key for AES-256-GCM
KIE_ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

# PERSIST_GENERATED_AUDIO: Whether to mirror audio files permanently
PERSIST_GENERATED_AUDIO="false"
```

---

## 7. KIE Account Setup & Multi-Key Management

Administrators can configure multiple KIE.ai accounts in **Admin Portal -> Multi KIE Accounts**:
1. Navigate to `/admin` -> `Multi KIE Accounts`.
2. Click **+ Add KIE Account**.
3. Enter an Account Label (e.g. `KIE Primary Account`), API Key (`sk-...`), Priority (1-10), Max Concurrent Jobs, and Daily Limit.
4. Sonic Hub AI encrypts the key server-side with AES-256-GCM. The plaintext key is discarded immediately.
5. Click **Test Connection** to execute a server-side probe against `api.kie.ai` to verify API key authorization.

---

## 8. Multi-Account Routing & Failover

When a user triggers **Generate Music**:
1. `KieAccountManager` selects an active account based on:
   - Status is `ACTIVE`
   - Not in cooldown (`cooldownUntil <= now`)
   - Below daily limit
   - Below concurrency limit
   - Sorted by highest priority, then least active jobs.
2. The key is decrypted in-memory only on the server.
3. If an account returns a retryable error (HTTP 429 Rate Limit, HTTP 500, network timeout):
   - The account is marked `RATE_LIMITED` with a 60-second cooldown or failure increment.
   - The router automatically fails over to the next eligible KIE account (up to `maxRetries`).
4. If authentication fails (HTTP 401/403), the account is marked `ERROR` and skipped from further routing.

---

## 9. Encryption Key Generation

To generate a cryptographically secure 256-bit encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Place the resulting 64-character hex string into your `.env` as `KIE_ENCRYPTION_KEY`.

---

## 10. Public HTTPS Callback Configuration

KIE.ai Suno API requires a public HTTPS URL for asynchronous webhook callbacks.
- Sonic Hub AI constructs the callback URL as:
  `${PUBLIC_APP_URL}/api/webhooks/kie/music`
- The endpoint acknowledges incoming callbacks with HTTP 200 within 15 seconds.
- An idempotency cache (`${taskId}:${callbackType}`) prevents duplicate credit settlements or duplicate tracks.

---

## 11. Local Development & Testing

```bash
# Install dependencies
npm install

# Start development full-stack server (Express + Vite)
npm run dev

# Compile TypeScript
npm run lint

# Build production assets
npm run build
```

---

## 12. Security Notes

- **Zero Client Keys**: Never include KIE API keys in client-side code or network requests.
- **Key Masking**: Frontend only receives masked keys (e.g., `sk-••••••••••••AB12`).
- **Server Authorization**: All API endpoints inspect authentication headers and enforce administrator roles server-side.
- **Double-Spend Protection**: Credit reservations and refunds are atomic and verified against previous transaction IDs.

---

## 13. Troubleshooting

- **Error: "KIE.ai music provider is not configured"**: Add a valid KIE API key in the Admin Portal.
- **Error: "Rate limit hit"**: The account was placed in a 60-second cooldown; configure a second KIE account for automatic failover.
- **No audio produced**: Check the Admin Audit Logs for the provider task status and raw error code. Reserved credits will be automatically refunded to the user.
