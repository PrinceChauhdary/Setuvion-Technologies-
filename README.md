# Setuvion website

Node.js website and inquiry backend for Setuvion Technologies and the AutoVerify Studio developer preview. The backend uses Node's built-in HTTP and filesystem modules; there are no npm dependencies.

## Run locally

Install Node.js 24 LTS or newer, then run from this directory:

```sh
npm start
```

Open `http://localhost:8080`. The website serves its static pages and accepts contact inquiries at `POST /api/inquiries`.

## Backend behavior

- Validates and length-limits inquiry fields, requires a matching browser origin, uses a honeypot, caps request bodies at 16 KiB, and rate-limits each connection to five submissions per 15 minutes in memory.
- Stores submitted name, email, optional company, message, and received time as JSON Lines in `runtime-data/inquiries.jsonl` with restrictive file permissions. The runtime data folder is ignored by Git and is not part of the public asset allowlist.
- Sends a restrictive Content Security Policy and browser security headers; the optional HSTS header is sent only when `SITE_ORIGIN` is HTTPS.
- Serves only explicitly listed public files. Inquiry data and other files beside the public assets are not exposed by the static-file handler.
- Does not send email or use a third-party form service. The site owner reads inquiries from the configured storage volume.
- Does not persist client IP addresses. No analytics or tracking cookies are configured.

## Deployment configuration

Set these environment variables with the hosting provider:

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port; defaults to `8080`. |
| `HOST` | Bind address; defaults to `0.0.0.0`. |
| `DATA_DIR` | Absolute path to a persistent, private volume for inquiries. Defaults to `website/runtime-data`. |
| `SITE_ORIGIN` | Canonical origin such as `https://example.com`, used to validate browser form submissions. |
| `TRUST_PROXY` | Set to `1` only behind a trusted proxy that overwrites `X-Forwarded-For`, so rate limits can use visitor addresses. |

Deploy behind HTTPS and attach persistent storage for `DATA_DIR`. Set an inquiry retention period and publish the matching privacy notice before accepting public submissions. Back up the inquiry file securely and restrict server volume access. This repository does not configure a hosting provider or deploy the site.

The included `Dockerfile` runs the server as a non-root user and expects a persistent volume mounted at `/data`. Build and run it with:

```sh
docker build -t setuvion-website .
docker run --rm -p 8080:8080 -v setuvion-inquiries:/data \
  -e SITE_ORIGIN=https://your-approved-domain.example \
  setuvion-website
```

Replace the example origin before deployment. Configure HTTPS at the hosting proxy. If using a reverse proxy, set `TRUST_PROXY=1` only when it overwrites the forwarded client-address header.

## Assets and preview status

The automotive workshop and motorcycle workshop visuals are illustrative generated imagery. They do not depict Setuvion-owned facilities, equipment, customers, or test results.

The site includes a Security & Privacy overview and a native FAQ. These describe the current preview safeguards and do not represent certification or an independent security assessment. The AutoVerify Studio download panel is intentionally marked unavailable until a distributable package and license policy are ready. Confirm the company name, trademark, domain, legal copy, inquiry retention policy, and contact workflow before public launch.
