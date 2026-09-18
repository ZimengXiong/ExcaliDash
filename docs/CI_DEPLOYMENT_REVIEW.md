# CI and releases

ExcaliDash uses two active branches and one CI workflow.

| Branch | Purpose                            | Images                            |
| ------ | ---------------------------------- | --------------------------------- |
| `dev`  | Integration and prerelease testing | `:dev` and `:<version>-dev.<sha>` |
| `main` | Stable releases                    | `:<version>` and `:latest`        |

Feature branches target `dev`. A release is a reviewed `dev` to `main` pull
request. The root `VERSION` file is the only authored application version.

## CI gate

Pull requests and pushes run formatting, linting, version/config checks,
backend tests, frontend tests, browser E2E tests, and production image builds.
Superseded development runs are cancelled; stable release runs are not.

Third-party actions and reusable workflows are pinned to commits. Docker's
maintained builder fans AMD64 and ARM64 work out to native Ubuntu 24.04
runners, then assembles the manifests. Published images include OCI source,
revision, and version labels plus signed provenance and SBOM attestations.

## Development images

Every successful push to `dev` builds Linux AMD64 and ARM64 images. The final
manifests are published under both the immutable tag
`<version>-dev.<short-sha>` and the moving `dev` alias only after every native
platform build succeeds. No Git tag or GitHub release is created.

Deploy the rolling development channel with the production Compose file:

```bash
EXCALIDASH_TAG=dev docker compose -f docker-compose.prod.yml pull
EXCALIDASH_TAG=dev docker compose -f docker-compose.prod.yml up -d
```

For reproducible testing, replace `dev` with an immutable prerelease tag.

## Stable releases

Merging `dev` into `main` is the release action. After the complete CI gate:

1. CI validates that `VERSION` is valid and not assigned to another commit.
2. Backend and frontend images are built natively for AMD64 and ARM64.
3. Final manifests are published and verified before the GitHub release.
4. GitHub creates `v<version>` and generates the release notes.
5. CI fast-forwards `dev` to the release merge when `dev` has not advanced.

Stable version tags are never intentionally reused for another commit. If
`dev` advances during a release, its automatic sync is skipped without
rewriting history.

## Credentials

Docker Hub publication uses the repository `DOCKERHUB_TOKEN` secret and the
`zimengxiong` account. Builds and tests never require this secret. Publishing
is only enabled for push events on `dev` and `main`; pull requests only build
images locally in the GitHub runner.

Local scripts do not publish application images. This keeps release identity,
tests, architecture coverage, and credentials inside GitHub Actions.
