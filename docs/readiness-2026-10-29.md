# V2 readiness corrections — 2026-10-29

The fourteen findings from the ICM review of `55ebdf5` are corrected on `fix/v2-readiness-2026-10-29`. This change is based on the existing V2 branch; it is not a merge into master or an update of a live deployment.

| Finding                     | Correction                                                                                                                                                                         | Regression evidence                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| F1: history disclosure      | Apply current field permissions/type to history and restore inputs; omit deleted field definitions and hidden actions.                                                             | Unit role/type/deletion cases; original API probe.                                     |
| F2: token scope bypass      | Scope-check viewer-level mutations, global-view management, token issuance and deletion. Admin tokens cannot be minted using write scope; child expiry is bounded.                 | Unit and HTTP endpoint cases; original API probe.                                      |
| F3: hidden-field loss       | Preserve inaccessible fields/actions on save and reject explicit unauthorized overwrites.                                                                                          | Unit malicious-input cases; original API probe.                                        |
| F4: HTTP request loss       | Retain full request objects and action icons; expose advanced HTTP options in the drawer.                                                                                          | Browser unchanged-save round-trip for headers/body/TLS/timeout/expectations/icon.      |
| F5: short secret disclosure | Redact every nonempty secret and password input from output, errors and audit URLs.                                                                                                | Real HTTP echo regression; action tests.                                               |
| F6: browser CSP             | Permit HTTP(S) probe connections while keeping scripts local; policy blocks are unknown.                                                                                           | Original production-image browser probe now reaches its target.                        |
| F7: HTTP check templating   | Resolve headers/body/URL with the strict shared resolver; pass headers through to transport.                                                                                       | Real local HTTP fixture checks received headers and body.                              |
| F8: spaced tags             | Parse and generate quoted tag values, including escapes; preserve free-text phrase semantics.                                                                                      | Parser/query/chip cases and browser sidebar click.                                     |
| F9: preferences backup      | Include preferences in format-1 archives and merge/replace restore; old archives default to no preference rows.                                                                    | Backup unit tests and original encrypted restore probe.                                |
| F10: V1 data loss           | Preserve exact values, infer protocols/hosts, give populated unlabeled columns fallback labels, merge missing values across groups and reject conflicts without disclosing values. | Three Python unit tests, three original planner probes and both integration role runs. |
| F11: OpenAPI                | Shared-validator request bodies, resource response schemas, path/query parameters, authentication, error envelopes and new routes.                                                 | Contract and HTTP tests; 73 documented operations.                                     |
| F12: personal views         | Add active-sidebar editing and accessible move controls for personal views.                                                                                                        | Real browser rename/reorder/delete flow.                                               |
| F13: secret links           | Add an audited, field-authorized, non-cacheable reveal endpoint and explicit reveal/anchor controls in each view.                                                                  | Unit/HTTP denial cases and browser reveal flow.                                        |
| F14: managed favicons       | Queue discovery after committed managed changes; skip dry runs and unchanged upserts.                                                                                              | Real HTTP favicon test including dry-run and idempotence assertions.                   |

Additional corrections include status-tooltip details, stale UI documentation and gating release publication on the reusable CI workflow.

## Validation

- `pnpm lint` and `pnpm typecheck`: passed.
- `pnpm test`: 59 tests passed in 18 files.
- `pnpm test:smoke`: three Chromium tests passed.
- Production image: built and exercised on amd64 with disposable SQLite data and the non-root runtime.
- Original review probes against the production image: 30 API assertions, 14 browser assertions, the spaced-tag check and all three V1 planner checks pass.
- Ansible integration: 57 tasks OK, 17 changed, zero failed; both roles and repeated/idempotent operations executed against the disposable image.
- Python migration unit tests: three passed.
- `ansible-test sanity --local --python 3.13 --requirements`: all 24 checks passed with virtualenv support and shellcheck installed. A dedicated temporary directory avoids an Ansible environment issue with `/tmp/.git`.

The normal Playwright suite can select an existing Chromium with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`; otherwise it uses the Playwright-installed browser. Each invocation gets a fresh database. The integration fixture now asserts retention of its populated unlabeled `user3` column instead of asserting the old loss.

## Dependency security

A fresh registry audit prompted Nuxt 4.6.3 and targeted Undici/esbuild updates. The resulting production dependency graph has zero critical, high or moderate audit findings. One low version-based finding remains for [deepmerge GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4), for which no fixed release exists. Its installed source and both distributed bundles are corrected by `patches/deepmerge@4.3.1.patch`; the exploit regression exercises the actual loaded package, including null-prototype inputs. The lockfile and Docker build apply the patch. No advisory is ignored or excluded from the audit.

## Deployment boundary

These results establish the corrected application and collection behavior with synthetic fixtures. Real Entra ID/Keycloak tenant configuration, company-network reachability, each company's actual V1 data, and arm64 execution still require acceptance in those environments. Keep the original V1 data, protect the V2 encryption key, and verify an instance-specific restore before cutover. This work does not change company infrastructure or the existing home-lab instances.
