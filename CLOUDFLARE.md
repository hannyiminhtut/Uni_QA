# Cloudflare preparation and local testing

The approved Next.js UI is exported as static files. One Cloudflare Worker serves those assets and `/api/chat`; a SQLite-backed Durable Object coordinates the global and browser-session quotas. No Next.js server runs on Cloudflare.

## Completed before publishing

1. `npm run build:cloudflare` copies only the frontend files into ignored `.cloudflare/frontend`, builds the static output, and snapshots the university sources into a server-only knowledge bundle. The root Next.js development server and `/api/chat` still work as before.
2. `cloudflare/worker.js` shares the same question parser, Gemini generation and answer validator as the local backend. It reads the bundled knowledge rather than runtime files. API routes run before static assets.
3. `QuotaStore` uses a single named Durable Object and durable SQLite-backed key/value storage. Reservations are serialized and persisted before provider calls. Defaults remain 3 app requests/minute, 100/day, 2/session/minute and 20/session/day. Daily reset is 00:00 UTC / 06:30 Myanmar time. A signed session cookie is not an identity/login system. Clearing cookies does not bypass the global cap.
4. `npm run test:cloudflare` runs Wrangler/workerd locally against an isolated test configuration, fake secret, simulated provider, and separate SQLite files under ignored `tmp/`. It tests static UI, private-file isolation, answer generation/validation, provider errors, quota enforcement and persistence across runtime restarts. It never calls Gemini or deploys anything.

## Commands you can use now

```powershell
npm run dev
```

The existing Next.js app remains at http://localhost:3000.

```powershell
npm run build:cloudflare
npm run test:cloudflare
```

The integration test owns port 8788 and stops its own processes afterward. Close another application using that port before running it. Tests do not change the real `.quota` counters.

```powershell
npm run preview:cloudflare
```

This starts the actual Worker locally (normally http://localhost:8787). Wrangler reads the existing ignored `.dev.vars` for local-only secrets. Submitting a question in this preview DOES call Gemini and uses quota. Its counters are independent of the Next.js development server and other scripts, but Google's project quota is shared. Stop with Ctrl+C.

## Before public deployment: later steps, not performed yet

- Confirm the account stays on Workers Free and supports SQLite-backed Durable Objects. Do not accept a paid upgrade for this project.
- Set the hosted `GEMINI_API_KEY` through Wrangler's secret prompt, never `vars`, source files, or chat. The local `.dev.vars` is not uploaded as a hosted secret.
- Confirm the target Worker name (`uit-compass` in `wrangler.jsonc`) and account. Resolve name conflicts before publishing; do not replace an unrelated existing Worker.
- Run the full local checks and deployment dry-run before `npm run deploy:cloudflare`. That command rebuilds and publishes; do not run it until ready to publish.
- Verify Gemini access from the actual hosted Worker, the free CPU/request/storage limits, sources, and shared quota enforcement. Local tests do not establish region access or hosted CPU usage. Keep the low pilot caps until those checks pass.
- The Worker health endpoint checks configuration presence, not secret validity or live provider availability.

## Files and privacy

`.cloudflare/`, `.wrangler/`, `.quota/`, `.dev.vars*`, and `tmp/` are ignored. The public asset directory is only `.cloudflare/frontend/out`. The source corpus is bundled into server code for citations; it is not exposed as a raw public file. Questions are sent to Gemini when generating real answers. No questions, answers, IP addresses, student IDs or API keys are stored in quota state; it stores counters and a session-signing secret.

The test entry `cloudflare/test-entry.js` is separate and is not referenced by the production Wrangler configuration. It must never replace `cloudflare/worker.js` for deployment.

## Known remaining launch work

Hosted secret setup, public deployment, hosted runtime/API testing, broader multilingual evaluation, and confirmation of current admissions information remain. These preparation steps do not constitute a production launch or a guarantee of free provider availability.
