# V15 Task 1 — White-label Contract Verification Status

สถานะ: **PASS — Task 1 verified complete**

## Source / Release Gate

- Source gate run: `31996317195`
- Candidate artifact: `v15-task1-candidate-pending-d1-smoke`
- Candidate artifact ID: `9276947765`
- Candidate artifact digest: `sha256:9343d09dd935f60e176d31fc6448b37b7e6b6de5f1d01fe410be50d5e8b76260`
- Full tests: PASS
- Lint: PASS
- Cloudflare type gate: PASS
- Pages build: PASS
- Package generation/release safety/parity: PASS

## Real Cloudflare D1 Smoke

- Final smoke run: `31999654570`
- Job: `95297460674`
- Head SHA: `61f057ecd098a2c739e390ea1350b845b8091121`
- Smoke evidence artifact ID: `9278000143`
- Smoke evidence artifact digest: `sha256:29445589e75e8379f42bc373c88a06b9a0b2f24534f51d07d5dca132f6965faf`

### Pro candidate

- SHA-256: `987c6dcf0ea531efa166ddd463bc0f854a8e98045603da8ba2c68f5a38956264`
- Health: PASS
- Backup formatVersion 1 / schemaVersion 7: PASS
- V7 mutate → restore → exact logical hash match: PASS
- Portable White-label restore: PASS
- Brand logo key excluded from portable backup: PASS
- Legacy V6 validate + restore: PASS
- V6 preserves current White-label / brand logo state: PASS
- Business data restore: PASS
- LINE integration preservation: PASS
- Google OAuth preservation: PASS
- Owner login after restore: PASS
- RESTORE_BACKUP audit entries: 2 / PASS
- Demo plan switch: White-label PUT = 403 PLAN_REQUIRED, backup export allowed, restore = 403 PLAN_REQUIRED
- Cache-Control no-store assertions: PASS

### Demo candidate

- SHA-256: `e4d42bbfe0d0c79287c6cab31fa3a96e0601924735e8ccfb8eedcc72128394b7`
- Health: PASS
- First setup dorm name allowed: PASS
- Initial subscription plan = demo: PASS
- White-label mutation = 403 PLAN_REQUIRED: PASS
- Backup export allowed: PASS
- Backup formatVersion 1 / schemaVersion 7: PASS
- Backup response no-store: PASS

## Cleanup

Temporary Cloudflare resources from the final smoke were deleted successfully:

- Pro Pages cleanup exit 0
- Pro D1 cleanup exit 0
- Demo Pages cleanup exit 0
- Demo D1 cleanup exit 0

## Health timeout root cause resolved

The first V15 smoke attempt used Wrangler's hash-prefixed preview deployment URL. In the GitHub Actions runner that hostname resolved but failed TLS handshake. A dedicated diagnostic reproduced the issue and proved the stable project URL `https://<project>.pages.dev` returned `/api/health` HTTP 200 using the same smoke HTTP client. The smoke workflow was changed to test the stable project URL only; candidate/application source was not modified for this fix.

## Release decision

V15 Task 1 White-label contract is verified complete. This status does **not** merge or replace the repository `main` branch. Integration to `main` remains a separate deliberate decision.
