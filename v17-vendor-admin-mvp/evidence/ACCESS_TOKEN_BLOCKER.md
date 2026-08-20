# V17 Vendor Admin MVP — Cloudflare Access Token Blocker

Status: `BLOCKED_EXTERNAL_PERMISSION`

The production CUSTOMER-READY gate reached the real Cloudflare environment and passed the exact V17 baseline/patch check, all 27 Vendor Admin/control-plane tests, TypeScript typecheck, Wrangler dry-run, and stable D1 precheck.

Production gate run: `32424160917`

The gate stopped before canonical deployment because the existing GitHub Actions secret `CLOUDFLARE_API_TOKEN` returned HTTP 403 for Cloudflare Zero Trust Access APIs.

Bounded permission probe run: `32424384900`

Probe results:

- `GET /accounts/{account_id}/access/organizations` -> `403`
- `GET /accounts/{account_id}/access/apps?per_page=1` -> `403`
- No Access application was created by the probe.
- No disposable Access application cleanup was required.

Required additions to the API token used by the existing `CLOUDFLARE_API_TOKEN` GitHub Actions secret:

- Account permission: `Access: Apps and Policies Edit` (API docs describe the accepted write permission as `Access: Apps and Policies Write`).
- Account permission: `Access: Organizations Read` (or the broader read permission that includes Organizations, Identity Providers, and Groups).
- Scope the permissions to the same Cloudflare account already used by the V16/V17 production workflows.

Existing Worker/D1 permissions must be preserved because the same gate deploys the canonical Control Plane and applies the additive `0003_vendor_admin_mvp.sql` migration.

Do not paste the token into repository files, workflow YAML, evidence, or chat. Update the existing GitHub Actions secret in repository settings.

After the secret is updated, re-run failed production gate run `32424160917` / job `96602449632`. The workflow reads the current secret value on re-run and revalidates the frozen V17 source artifact `9394092671` and patch SHA-256 `2f14bff9292e1292d3a974e48f46202e7421580ea82d5009305da74f5bfc6532` before any production change.

CUSTOMER-READY remains false until the rerun produces a successful artifact and `v17-vendor-admin-mvp/evidence/customer-ready-latest.txt` reports `customer_ready=true`.
