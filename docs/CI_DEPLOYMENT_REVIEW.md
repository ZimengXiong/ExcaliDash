# CI and deployment review

Reviewed locally on September 18, 2026. This review did not run a workflow,
publish an image, create a release, push a branch, or change any remote state.

## Executive summary

The runtime images have a solid foundation: multi-stage builds, locked npm
installs, non-root runtime users, health checks, provider-specific Prisma
clients, and persistent SQLite storage are already present. The weak point is
release control. CI and image publication are separate, publication is driven
by three similar workstation scripts, and the repository does not currently
prove that a published backend/frontend pair came from the same tested commit.

The recommended end state is one required CI workflow and one reusable publish
workflow. Every image should first receive an immutable commit tag. Moving
channel tags such as `dev`, `beta`, and `latest` should only be applied after
both images have built, scanned, and passed smoke tests from the same commit.

## Findings

### P0: fix before relying on CI as a release gate

1. The `Security Sanitization Tests` job in `.github/workflows/test.yml` never
   runs a test command. It checks out the repository, installs backend
   dependencies, and generates Prisma, then succeeds. Either remove the
   misleading duplicate job or make it run a named security suite.
2. Stable, prerelease, and custom development publication bypass CI. The three
   `scripts/publish-docker*.sh` files build and push directly from a maintainer
   workstation without checking the worktree, commit identity, test result, or
   version/tag consistency.
3. Backend and frontend images are pushed sequentially. If the second build
   fails, a channel can contain a new backend and an old frontend. Publishing
   immutable tags for both images first, testing the pair, and promoting
   aliases last would prevent this split release.

### P1: standardize the release model

1. Branch and channel names disagree. CI watches `main`, `beta`, and `dev` on
   push, while the prerelease script permits `prerelease` and `pre-release`.
   The local remote list contains `pre-release`, `beta`, `dev`, and `alpha`, but
   no `prerelease` branch. Choose one model and document it.
2. `docker-compose.prod.yml` deploys `:latest` even though the operator guidance
   recommends pinning a release or digest. Keep a convenience example if
   desired, but make the production example consume an explicit
   `EXCALIDASH_VERSION` with no silent `latest` fallback.
3. Mutable tags can be overwritten by all three local scripts. The stable
   script also accepts an arbitrary version argument. Validate SemVer, require
   the `VERSION` file and Git tag to agree, and refuse to publish an existing
   immutable tag.
4. Release scripts use `set -e` but not unset-variable or pipeline checking.
   More importantly, their duplicated implementation is already drifting.
   Replace them with one workflow or one thin local command that calls the same
   build definition used by CI.
5. CI does not build or smoke-test the production containers. Unit tests and a
   development-server browser run do not verify Dockerfiles, entrypoints,
   nginx templating, migration startup, rootless execution, or the published
   compose path.

### P2: hardening and efficiency

1. Pin Docker base images by digest and pin third-party GitHub Actions to commit
   SHAs. Automated update pull requests can keep those pins current.
2. Add image metadata (`org.opencontainers.image.*`), SBOM/provenance
   attestations, a vulnerability scan, and optional signature verification.
3. Add workflow `concurrency`, explicit `timeout-minutes`, and least-privilege
   permissions per job. Cancel superseded pull-request and `dev` runs, but do
   not cancel an in-progress stable publication.
4. The E2E shell block does not fail explicitly when either readiness loop is
   exhausted, and its process cleanup is not protected by a shell trap. Use a
   dedicated test orchestration command or Compose health conditions and always
   collect server logs on failure.
5. Backend and frontend dependencies are reinstalled across several jobs.
   Preserve job isolation but use a small matrix/reusable workflow and npm's
   download cache to reduce duplication. Do not cache `node_modules`.
6. Local audit results currently report 5 backend advisories (3 moderate, 2
   high), 7 frontend advisories (1 low, 4 moderate, 2 high), and none in the
   root or E2E packages. Triage the dependency paths and upgrade deliberately;
   do not apply a blind forced audit fix.
7. The local lab pins image versions by tag, which is good for repeatability,
   but those tags are old and not digest-pinned. Put lab dependency versions in
   one documented location and update them on a schedule.

## Recommended channel contract

| Source                                    | Immutable tags                                | Moving aliases  | Promotion rule                                                                 |
| ----------------------------------------- | --------------------------------------------- | --------------- | ------------------------------------------------------------------------------ |
| Any tested commit                         | `sha-<12-char-sha>` on both images            | none            | CI, image build, scan, and paired smoke test pass                              |
| `dev` branch                              | same commit tags                              | `dev`           | Promote the already-tested pair after required `dev` checks pass               |
| Prerelease Git tag such as `v0.6.3-rc.1`  | `0.6.3-rc.1` plus commit tags                 | optional `beta` | Protected environment approval after the paired smoke test                     |
| Stable Git tag such as `v0.6.3` on `main` | `0.6.3` plus commit tags                      | `0.6`, `latest` | Protected environment approval; `VERSION`, package versions, and Git tag agree |
| One-off test build                        | commit tags plus sanitized `dev-<name>-<sha>` | none            | Manual dispatch; never update `dev`, `beta`, or `latest`                       |

Use the same version/tag set for the backend and frontend. Record both image
digests in the GitHub release so operators can deploy an exact pair.

## Recommended workflow layout

### `ci.yml`

- Trigger on pull requests into every protected integration/release branch and
  pushes to `dev`, the chosen prerelease branch, and `main`.
- Run the root formatting, lint, and environment-boundary gate.
- Run backend and frontend unit tests and builds.
- Run E2E against isolated ports and a disposable database.
- Build production images without pushing, then smoke-test the pair with both
  SQLite and PostgreSQL migration paths where practical.
- Upload reports and service logs only when useful, with short retention.

### `publish.yml`

- Trigger from a successful CI result for `dev`, and from protected manual or
  Git-tag events for prerelease/stable channels.
- Resolve one commit SHA and one validated version before building anything.
- Build both architectures with BuildKit cache, provenance, SBOM, and OCI
  labels; push immutable tags first.
- Scan and smoke-test the exact digests.
- Promote channel aliases only after the complete pair passes.
- Emit a release manifest containing source SHA, version, build timestamp, and
  both digests.

## Suggested rollout

1. Correct or remove the empty security job and make the existing CI workflow
   required for protected branches.
2. Decide whether `beta` or `pre-release` is the single prerelease branch, then
   align triggers, docs, and tags.
3. Add container build/smoke tests without publishing.
4. Introduce immutable commit-tag publication for `dev` while retaining the
   current scripts as an emergency fallback.
5. Add protected prerelease and stable promotions, then retire the direct-push
   scripts.
6. Change production examples to explicit version/digest inputs after the new
   release manifest is available.

## Current strengths to preserve

- Backend and frontend runtime processes are non-root.
- npm installs use lockfiles and `npm ci`.
- The backend image includes both supported Prisma clients for offline startup.
- Runtime migrations are configurable and guarded by a lock for the supported
  single-backend deployment model.
- Frontend nginx configuration is rendered and validated at startup.
- Compose defines health checks and persists the SQLite database outside the
  container filesystem.
