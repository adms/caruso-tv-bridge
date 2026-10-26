# Message-only remote relay — security review and deployment gate

Copyright (c) 2026 Adms Chung. SPDX-License-Identifier: Apache-2.0.

## Authorized scope

A home Mac mini forwards TV text and speech messages. Remote access must not expose receiver power, volume, source selection, pairing, device configuration, ADB, arbitrary proxying, files or shell commands. The target mini connection and the authenticated transport are not selected yet. No external listener, DNS record, tunnel or account policy has been enabled by this implementation.

`web/relay/core.mjs` is an isolated HTTP handler with a mandatory identity verifier and an explicit owner allowlist. It is not wired into the installed desktop app or exposed on the Internet. Tests provide a simulated identity verifier and loopback server. They do not certify VPN/OIDC authentication or a deployed system.

## Existing local system findings

1. The desktop per-session API token is a CSRF/control token, not an external user-login system. Never directly publish the current loopback controller with a raw tunnel.
2. The Android receiver currently uses HTTP and a bearer credential on the home LAN. An Internet VPN/tunnel would protect the remote-to-mini segment, not automatically the mini-to-TV segment. Protect and document this trusted-LAN boundary; do not claim end-to-end encryption. An actively hostile home LAN remains outside this first candidate's verified security scope. TLS with a pinned/trusted receiver certificate is the preferred hardening before broad/shared access.
3. The receiver's last-request check is bounded idempotency, not complete replay protection. The new relay reserves every authenticated request ID before forwarding, remembers recent requests for two minutes and rejects requests older than 30 seconds. Uncertain outcomes are not retried.
4. Text is passed to Android TextView and TextToSpeech as data. The path does not evaluate JavaScript, SQL, shell commands, templates or LLM instructions. This architectural constraint is the injection boundary; a keyword blacklist or model content judgment would not replace it.
5. Voice itself can disturb viewing and can potentially be heard by nearby voice assistants. Only owner-authorized senders should be allowed. The relay caps per-utterance gain and request rate; this is not a guarantee against every spoken-content risk.

## Implemented in the local relay candidate

- Mandatory externally verified owner identity; no fallback to a caller-supplied email/header.
- Owner-bound CSRF session, five-minute expiry, exact Host and HTTPS Origin allowlist, cross-site denial.
- Fixed routes: session, receiver readiness, message and clear only.
- Strict JSON field allowlist. Caller-supplied URL, host, source, action, command and prototype keys are rejected.
- Plain well-formed Unicode text, maximum 280 code points. ASCII controls and bidi override/isolate controls are rejected. Ordinary metacharacters remain literal data.
- At most 4 KiB uncompressed request bodies; no chunked or compressed request bodies.
- Typed display/speech options, 3–60 second text duration and a maximum 70% per-utterance gain. System volume is not changed.
- Recent-request cache, 30-second request age, no automatic replay after an uncertain delivery.
- One receiver write in flight; per-owner and global message limits; bounded session/request caches.
- Receiver credentials, entered message text and identity tokens are never included in the public status response or error payload.

The production transport must also configure header/body timeouts, header size, connection limits, TLS and identity verification. A compromised mini or compromised authorized account is not mitigated by treating text as data; account/device revocation and mini OS security remain necessary.

## Transport options pending owner choice

- Private Tailscale network: approved devices/users only, ACL/grants restricted to this service, HTTPS, no public Funnel. Prefer identity verification based on the authenticated transport or Tailscale WhoIs. If Serve identity headers are used, explicitly account for trusted local processes on the mini; unsigned headers alone are not cryptographic authentication.
- Cloudflare Tunnel plus Access: no router port forwarding; owner-only login/MFA policy. Validate JWT signature with fixed issuer/JWKS, algorithm, audience, expiry and owner subject. An arbitrary `Cf-Access-*` header must never grant access. Protect the origin against alternate paths and validate proxy origins deliberately.

## Local attack checks

`cd web && node --test test/relay.test.mjs`

Checks include unauthenticated requests, forged identity headers, forbidden controls/pairing/proxy routes, bad Host/Origin/CSRF, command/HTML/prompt injection strings as literal text, unknown/prototype fields, Unicode spoofing controls, length/gain limits, stale requests, duplicates and uncertain-result replay. Transport-provider validation, signed-in remote-browser behavior and a real mini-to-TV test remain deployment gates.

## Required before remote acceptance

1. Identify and connect to the intended mini over an existing trusted connection.
2. Select authenticated transport and configure an explicit owner identity allowlist.
3. Resolve the mini-to-TV confidentiality/trust boundary and complete physical text/speech acceptance locally.
4. Run provider-specific negative authentication tests and remote origin/CSRF/replay tests against a staging endpoint.
5. Check that remote users cannot reach receiver controls, settings, tokens or debug services.
6. Keep the endpoint disabled until the critical authentication/authorization gates pass. Retain an immediate stop switch and credential/session revocation procedure.
