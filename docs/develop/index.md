# Local development

Run the backend and frontend in separate terminals.

## Requirements

- Node.js 20.19+ or 22.12+
- npm 10
- Git

## Install dependencies

From the repository root:

```bash
npm run install:all
npm install
```

The first command installs app and test dependencies. The second installs root tooling, including VitePress.

## Configure the apps

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Vite proxies `/api` requests to the backend.

Replace the generated path placeholders in `backend/.env`:

```dotenv
DATABASE_URL=file:./dev.db
BACKUP_DIR=./backups
```

## Start the backend

```bash
cd backend
npm run dev
```

The backend initializes the database and listens on port `8000`.

## Start the frontend

In another terminal:

```bash
cd frontend
npm run dev
```

Open `http://localhost:6767`.

## Run checks

```bash
npm test
npm run check
```

`npm test` runs database integration tests and Playwright tests in both authentication modes.

To run a smaller suite:

```bash
npm run test:integration
npm run test:e2e
npm run test:e2e:auth
npm --prefix e2e test -- tests/export-import.spec.ts
```

Before running Playwright, install Chromium:

```bash
cd e2e
npx playwright install chromium --with-deps
```

Playwright starts test servers on ports `26767` and `28000`. Keep those ports free. Tests use separate databases and create and delete their own data.

Run `npm --prefix e2e run report` or `report:auth` from the repository root to open a test report. Failures retain traces and screenshots.

The integration suite also deploys the released SQLite migration baseline into
a disposable database, seeds existing drawings, images, history and sharing,
then applies current migrations twice. It checks that existing data is unchanged
and the current Prisma client can read it. It never upgrades your development DB.

`NO_SERVER=true` targets explicitly supplied `BASE_URL`/`API_URL` instead. Use it
only for disposable test deployments, never a production instance. The anonymous
setup checks authentication is already disabled; it will not disable it for you.

## Release workflow

Pull requests run checks and build images without publishing. A push to `dev`
publishes `VERSION-dev.<short-sha>` images and a GitHub pre-release; a push to
`main` publishes `VERSION` images and a stable release. `VERSION` is the single
source of truth, and stable versions cannot be reused for another commit.

Both versioned images must build and expose Linux amd64 and arm64 manifests
before CI promotes `:dev` or `:latest`. Publishing runs are not cancelled by
newer pushes. Registry tag updates are separate operations, not a transaction;
pin the same versioned tag for both services for repeatable deployments.

Finish local fixes, push `dev` when authorized, and wait for its CI. Update each
selected contributor branch against that dev, merge passing PRs into dev, and
pull the resulting dev before opening the release PR to main. Run the final
checks on that reconciled head. Use a merge commit for dev-to-main so shared
ancestry is retained. CI fast-forwards dev back to main only if dev has not moved.

## Work on these docs

```bash
npm run docs:dev
```

VitePress reloads the browser when files change.

The dev site includes a [draft and comment panel](/develop/docs-review). Drafts autosave separately from the source files.
