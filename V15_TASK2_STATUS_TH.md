# V15 Task 2 — Logo Asset Contract + Public Branding API Verification Status

สถานะ: **PASS — Task 2 verified complete**
วันที่: 2026-08-17

## Source / Release Gate

- Source/release run: `32021078155`
- Job: `95360700408`
- Result: PASS
- Candidate artifact: `v15-task2-candidate-pending-d1-smoke`
- Candidate artifact ID: `9285398323`
- Candidate artifact digest: `sha256:7afd28043b806f62ad65c622d665aa335a64864ad3bc2a1593086be0f821e651`
- Focused Task 2 tests: PASS
- Backup regression suite: PASS
- Full test suite: PASS
- Lint: PASS
- Cloudflare type gate: PASS
- Pages build: PASS
- VPS build: PASS
- Preview package generation: PASS
- Package builder/parity tests: PASS
- Guarded customer-ready release builder: PASS
- Final ZIP static audit: PASS

## Immutable Candidate SHA-256

- Master: `d21e9796ee64f95dc3a39c7304b679571e1437c366372a977dbf1628f4bfe05b`
- Basic: `07954265208cee3dee91b8f9922344113c16fc1443da0979af130084500ecc7a`
- Demo: `7734b061edb36e668584e9692669ab9afa1e3cc0e14c820d31398d1b22efe3b4`
- Pro: `28679dcbb5b72757e39af3c3c66ee348f0949060639f8ffb2c7977eed88c6a51`
- Standard: `2518b8c4cbfcfad6df71cec2bf87e33caf2fb7f3e640e31bcaf375c3c25609e`

All hashes were verified against the candidate manifests before the real D1 smoke.

## Real Cloudflare D1 Smoke — Final Verification Run

- Final smoke run: `32022279921`
- Job: `95364281580`
- Head SHA: `e49483fd2f78d8815c1cc41cd7548518a9eec20f`
- Result: PASS
- Evidence artifact ID: `9285857993`
- Evidence artifact digest: `sha256:4edc6fdcffb3bbf16dfffeb008de03a17ed8d6b908a3df8a9a406ac37228329b`

This final run re-used the exact immutable Task 2 candidate from source/release run `32021078155`; only the repository-side smoke/evidence harness changed between evidence runs.

### Pro candidate

- Candidate SHA-256: `28679dcbb5b72757e39af3c3c66ee348f0949060639f8ffb2c7977eed88c6a51`
- Health: PASS
- PNG logo: PASS
- JPEG logo: PASS
- WebP logo: PASS
- SVG rejected with HTTP 400: PASS
- Invalid Base64 rejected with HTTP 400: PASS
- MIME/magic-byte mismatch rejected with HTTP 400: PASS
- Decoded payload over 307,200 bytes rejected with HTTP 400: PASS
- Authenticated Settings exposes `brandLogoUrl` and hides internal logo key: PASS
- Public branding is unauthenticated: PASS
- Public branding explicit-safe-field projection: PASS
- PromptPay / LINE / Google / OAuth sentinel leak checks execute before `overallPass` and passed: PASS
- Demo downgrade masks paid branding: PASS
- Backup remains `formatVersion=1`, `schemaVersion=7`: PASS
- Logo remains non-portable in backup: PASS
- V7 logical backup hash after restore matches original: PASS
- V7 current logo preservation: PASS
- V6 backup accepted: PASS
- V6 current logo preservation: PASS
- V6 current new-branding preservation: PASS
- LINE / Google integration preservation: PASS
- Owner login after restore: PASS
- `RESTORE_BACKUP` audit count >= 2: PASS
- Backup/Validate/Restore no-store assertions: PASS
- Demo-plan logo PUT/DELETE: HTTP 403 `PLAN_REQUIRED`: PASS

### Sanitized evidence note

The shared smoke sanitizer intentionally removes dictionary keys containing sensitive substrings such as `token`, `secret`, `password`, `authorization`, `jwt`, and `refresh`. Therefore a boolean label named `secretLeakCheck` is omitted from the uploaded JSON evidence even though the Pro smoke source performs the sentinel leak assertions before setting `overallPass=true`. The sanitizer safety boundary was intentionally left unchanged.

### Demo candidate

- Candidate SHA-256: `7734b061edb36e668584e9692669ab9afa1e3cc0e14c820d31398d1b22efe3b4`
- Health: PASS
- First setup custom dorm name allowed: PASS
- Dorm name preserved in public branding: PASS
- Initial plan = demo: PASS
- Public branding unauthenticated: PASS
- Public allowlist exact: PASS
- Brand color/contact/logo masked: PASS
- `whiteLabelEnabled=false`: PASS
- Logo PUT = 403 `PLAN_REQUIRED`: PASS
- Logo DELETE = 403 `PLAN_REQUIRED`: PASS
- Backup export allowed: PASS
- Backup remains `formatVersion=1`, `schemaVersion=7`: PASS
- Logo absent from portable backup: PASS
- Backup response no-store: PASS

## Cleanup

Final smoke temporary Cloudflare resources were deleted successfully:

- Pro Pages cleanup exit `0`
- Pro D1 cleanup exit `0`
- Demo Pages cleanup exit `0`
- Demo D1 cleanup exit `0`

## Important Invariants Preserved

- No new Task 2 D1 migration; latest remains `0006_add_white_label_settings.sql`.
- No `brand_logo_data_uri` column was introduced.
- Existing `settings.brand_logo_key` stores validated canonical Data URI in V15 Task 2.
- White-label matrix remains Demo=false, Basic/Standard/Pro=true.
- PromptPay entitlement semantics remain unchanged.
- One Master still generates all four plans; generated ZIPs were not independently patched.
- `.dormbackup` remains formatVersion 1 / schemaVersion 7 and does not carry the logo.
- V6/V7 restore preserves the current logo and integration state.
- Public branding uses explicit allowlist and deterministic primary installation settings row.
- Repository `main` was not merged or replaced.

## Release Decision

**V15 Task 2 is verified complete.**

This approval closes the Logo Asset Contract + Public Branding API foundation only. UI upload controls, theme rendering, bill/logo rendering, R2 storage, PWA icon changes, and logo portability remain outside Task 2 and require their own approved design/implementation cycle.
