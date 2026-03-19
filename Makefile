.PHONY: help install dev build test test-frontend test-backend test-e2e test-e2e-docker \
        lint lint-frontend lint-backend clean docker-build docker-run docker-down docker-logs \
        release pre-release version-bump changelog changelog-open changelog-keep db-migrate db-reset \
        db-verify-backup health-check

DOCKER_USERNAME := zimengxiong
IMAGE_NAME := excalidash
VERSION := $(shell cat VERSION 2>/dev/null || echo "0.0.0")

.DEFAULT_GOAL := help

help: ## Show this help message
	@TITLE="ExcaliDash Makefile"; \
	echo "$$TITLE |"; \
	UNDERLINE=$$(printf '%*s' $$(( $${#TITLE} + 1 )) '' | tr ' ' '-'); \
	echo "$$UNDERLINE|"
	@echo "Usage: make [target]"
	@echo "Development:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | grep -E '(install|dev|build|lint|clean)' | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'
	@echo "Testing:"
	@grep -E '^test[-a-zA-Z0-9_]*:.*## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  %-20s %s\n", $$1, $$2}'
	@echo "Docker:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | grep -E '(docker)' | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'
	@echo "Release:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | grep -E '(release|version|changelog)' | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'
	@echo "Database:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | grep -E '(db-)' | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'
	@echo "Ops:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | grep -E '(health-check)' | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'
	@echo "Current version: $(VERSION)"

install: ## Install all dependencies (frontend, backend, e2e)
	@echo "Installing frontend dependencies..."
	cd frontend && npm install
	@echo "Installing backend dependencies..."
	cd backend && npm install
	@echo "Installing e2e dependencies..."
	cd e2e && npm install
	@echo "All dependencies installed."

dev: ## Start backend+frontend in a tmux split screen
	@command -v tmux >/dev/null 2>&1 || { \
		echo "tmux is required for 'make dev'"; \
		echo "Install tmux and try again."; \
		exit 1; \
	}
	@SESSION="excalidash-dev"; \
	if tmux has-session -t $$SESSION 2>/dev/null; then \
		echo "Using existing tmux session: $$SESSION"; \
	else \
		echo "Creating tmux session: $$SESSION"; \
		tmux new-session -d -s $$SESSION -c "$(CURDIR)" "cd backend && npm run dev"; \
		tmux split-window -h -t $$SESSION:0 -c "$(CURDIR)" "cd frontend && npm run dev"; \
		tmux select-layout -t $$SESSION:0 even-horizontal; \
		tmux select-pane -t $$SESSION:0.0; \
	fi; \
	if [ -n "$$TMUX" ]; then \
		tmux switch-client -t $$SESSION; \
	else \
		tmux attach -t $$SESSION; \
	fi

dev-stop: ## Stop the tmux dev session
	@SESSION="excalidash-dev"; \
	if tmux has-session -t $$SESSION 2>/dev/null; then \
		tmux kill-session -t $$SESSION; \
		echo "Stopped tmux session: $$SESSION"; \
	else \
		echo "No tmux session named $$SESSION is running"; \
	fi

dev-frontend: ## Start frontend dev server only
	cd frontend && npm run dev

dev-backend: ## Start backend dev server only
	cd backend && npm run dev

build: ## Build frontend and backend for production
	@echo "Building backend..."
	cd backend && npm run build
	@echo "Building frontend..."
	cd frontend && npm run build
	@echo "Build complete."

lint: lint-frontend lint-backend ## Run linters for frontend and backend

lint-frontend: ## Run frontend linter
	@echo "Linting frontend..."
	cd frontend && npm run lint

lint-backend: ## Run backend linter (if available)
	@echo "Backend linting not configured"

clean: ## Clean build artifacts and node_modules
	@echo "Cleaning build artifacts..."
	rm -rf frontend/dist
	rm -rf frontend/node_modules/.vite
	@echo "Clean complete."

clean-all: clean ## Clean everything including node_modules
	@echo "Removing all node_modules..."
	rm -rf frontend/node_modules
	rm -rf backend/node_modules
	rm -rf e2e/node_modules
	@echo "Full clean complete."

test: test-frontend test-backend ## Run all tests (frontend + backend unit tests)
	@echo "All unit tests passed."

test-all: test test-e2e ## Run ALL tests (unit + e2e)
	@echo "All tests passed."

test-frontend: ## Run frontend unit tests
	@echo "Running frontend tests..."
	cd frontend && npm test

test-backend: ## Run backend unit tests
	@echo "Running backend tests..."
	cd backend && npm test

test-coverage: ## Run all unit tests with coverage
	@echo "Running tests with coverage..."
	cd frontend && npm run test:coverage
	cd backend && npm run test:coverage

test-e2e: ## Run e2e tests (starts servers automatically)
	@echo "Running e2e tests..."
	cd e2e && ./run-e2e.sh

test-e2e-headed: ## Run e2e tests with visible browser
	@echo "Running e2e tests (headed)..."
	cd e2e && ./run-e2e.sh --headed

test-e2e-docker: ## Run e2e tests in Docker containers
	@echo "Running e2e tests in Docker..."
	cd e2e && ./run-e2e.sh --docker

test-watch: ## Run tests in watch mode
	@trap 'kill 0' INT; \
		(cd frontend && npm run test:watch) & \
		(cd backend && npm run test:watch) & \
		wait

docker-build: ## Build Docker images locally
	@echo "Building Docker images..."
	docker compose build
	@echo "Docker images built."

docker-run: ## Start Docker containers (docker-compose up)
	@echo "Starting Docker containers..."
	docker compose up

docker-up: docker-run ## Alias for docker-run

docker-run-detached: ## Start Docker containers in background
	@echo "Starting Docker containers (detached)..."
	docker compose up -d
	@echo "Containers started. Access at http://localhost:6767"

docker-down: ## Stop and remove Docker containers
	@echo "Stopping Docker containers..."
	docker compose down
	@echo "Containers stopped."

docker-down-volumes: ## Stop containers and remove volumes
	@echo "Stopping containers and removing volumes..."
	docker compose down -v

docker-logs: ## Show Docker container logs
	docker compose logs -f

docker-ps: ## Show running Docker containers
	docker compose ps

docker-restart: docker-down docker-run ## Restart Docker containers

docker-rebuild: docker-down docker-build docker-run ## Rebuild and restart containers

version: ## Show current version
	@echo "Current version: $(VERSION)"

version-bump: ## Interactive version bump
	@echo "Current version: $(VERSION)"
	@echo "Select version bump type:"
	@echo "  1) patch ($(VERSION) -> $$(echo $(VERSION) | awk -F. '{print $$1"."$$2"."$$3+1}'))"
	@echo "  2) minor ($(VERSION) -> $$(echo $(VERSION) | awk -F. '{print $$1"."$$2+1".0"}'))"
	@echo "  3) major ($(VERSION) -> $$(echo $(VERSION) | awk -F. '{print $$1+1".0.0"}'))"
	@echo "  4) custom"
	@read -p "Enter choice [1-4]: " choice; \
	case $$choice in \
		1) NEW_VERSION=$$(echo $(VERSION) | awk -F. '{print $$1"."$$2"."$$3+1}') ;; \
		2) NEW_VERSION=$$(echo $(VERSION) | awk -F. '{print $$1"."$$2+1".0"}') ;; \
		3) NEW_VERSION=$$(echo $(VERSION) | awk -F. '{print $$1+1".0.0"}') ;; \
		4) read -p "Enter new version: " NEW_VERSION ;; \
		*) echo "Invalid choice"; exit 1 ;; \
	esac; \
	echo "Bumping version to $$NEW_VERSION..."; \
	echo "$$NEW_VERSION" > VERSION; \
	sed -i '' "s/\"version\": \".*\"/\"version\": \"$$NEW_VERSION\"/" frontend/package.json 2>/dev/null || \
		sed -i "s/\"version\": \".*\"/\"version\": \"$$NEW_VERSION\"/" frontend/package.json; \
	sed -i '' "s/\"version\": \".*\"/\"version\": \"$$NEW_VERSION\"/" backend/package.json 2>/dev/null || \
		sed -i "s/\"version\": \".*\"/\"version\": \"$$NEW_VERSION\"/" backend/package.json; \
	echo "Version bumped to $$NEW_VERSION"

changelog: ## Prepare RELEASE.md from template or keep existing content, then open it
	@read -p "Prepare release notes for editing? [y/N]: " CHOICE; \
	CHOICE_LOWER=$$(printf '%s' "$$CHOICE" | tr '[:upper:]' '[:lower:]'); \
	if [ "$$CHOICE_LOWER" = "y" ] || [ "$$CHOICE_LOWER" = "yes" ]; then \
		echo "Generating fresh RELEASE.md..."; \
		if [ "$(PRERELEASE)" = "1" ]; then \
			node scripts/reset-release-notes.cjs --prerelease; \
		else \
			node scripts/reset-release-notes.cjs; \
		fi; \
	else \
		echo "Keeping current RELEASE.md."; \
	fi
	@$(MAKE) changelog-open

changelog-open: ## Open current RELEASE.md without resetting
	@echo "Opening RELEASE.md for editing..."
	@if [ -n "$$EDITOR" ]; then \
		$$EDITOR RELEASE.md; \
	elif command -v code >/dev/null 2>&1; then \
		code --wait RELEASE.md; \
	elif command -v open >/dev/null 2>&1; then \
		open RELEASE.md; \
		echo "Edit RELEASE.md in your GUI editor, then press Enter to continue..."; \
		read _; \
	elif command -v xdg-open >/dev/null 2>&1; then \
		xdg-open RELEASE.md; \
		echo "Edit RELEASE.md in your GUI editor, then press Enter to continue..."; \
		read _; \
	else \
		echo "No GUI opener found. Falling back to vi."; \
		vi RELEASE.md; \
	fi

changelog-keep: ## Alias: open current RELEASE.md without resetting
	@$(MAKE) changelog-open

release: ## Full release workflow (main branch only)
	@CURRENT_BRANCH=$$(git rev-parse --abbrev-ref HEAD); \
	if [ "$$CURRENT_BRANCH" != "main" ]; then \
		echo "ERROR: Releases must be made from 'main' branch!"; \
		echo "Current branch: $$CURRENT_BRANCH"; \
		echo "Please switch to main and try again."; \
		exit 1; \
	fi
	@echo "On main branch."
	@echo "Pulling latest changes..."
	@git pull origin main
	@echo "Up to date with remote."
	@echo "Current status:"
	@git status --short || true
	@echo "Running tests..."
	@$(MAKE) test
	@echo "All tests passed."
	@CURRENT=$$(cat VERSION); \
	PATCH=$$(echo $$CURRENT | awk -F. '{print $$1"."$$2"."$$3+1}'); \
	MINOR=$$(echo $$CURRENT | awk -F. '{print $$1"."$$2+1".0"}'); \
	MAJOR=$$(echo $$CURRENT | awk -F. '{print $$1+1".0.0"}'); \
	echo "Current version: $$CURRENT"; \
	echo "Select version bump:"; \
	echo "  1) patch -> $$PATCH"; \
	echo "  2) minor -> $$MINOR"; \
	echo "  3) major -> $$MAJOR"; \
	echo "  4) custom"; \
	echo "  5) skip (keep $$CURRENT)"; \
	read -p "Enter choice [1-5]: " choice; \
	case $$choice in \
		1) NEW_VERSION=$$PATCH ;; \
		2) NEW_VERSION=$$MINOR ;; \
		3) NEW_VERSION=$$MAJOR ;; \
		4) read -p "Enter new version: " NEW_VERSION ;; \
		5) NEW_VERSION=$$CURRENT ;; \
		*) echo "Invalid choice, using current."; NEW_VERSION=$$CURRENT ;; \
	esac; \
	if [ "$$NEW_VERSION" != "$$CURRENT" ]; then \
		echo "Bumping version to $$NEW_VERSION..."; \
		echo "$$NEW_VERSION" > VERSION; \
		sed -i '' "s/\"version\": \".*\"/\"version\": \"$$NEW_VERSION\"/" frontend/package.json 2>/dev/null || \
			sed -i "s/\"version\": \".*\"/\"version\": \"$$NEW_VERSION\"/" frontend/package.json; \
		sed -i '' "s/\"version\": \".*\"/\"version\": \"$$NEW_VERSION\"/" backend/package.json 2>/dev/null || \
			sed -i "s/\"version\": \".*\"/\"version\": \"$$NEW_VERSION\"/" backend/package.json; \
		echo "Version bumped to $$NEW_VERSION."; \
	else \
		echo "Keeping version $$CURRENT."; \
	fi
	@echo "Preparing fresh release notes (RELEASE.md)..."
	@$(MAKE) changelog
	@NEW_VERSION=$$(cat VERSION); \
	echo "Release summary:"; \
	echo "  Version: v$$NEW_VERSION"; \
	echo "  Branch: main"; \
	echo "  Tag: v$$NEW_VERSION"; \
	echo "Changes to be committed:"; \
	git status --short; \
	true
	@read -p "Proceed with release? [y/N]: " confirm; \
	if [ "$$confirm" != "y" ] && [ "$$confirm" != "Y" ]; then \
		echo "Release aborted."; \
		exit 1; \
	fi
	@NEW_VERSION=$$(cat VERSION); \
	echo "Committing release..."; \
	git add -A; \
	git commit -m "chore: release v$$NEW_VERSION" || echo "Nothing to commit."
	@echo "Changes committed."
	@echo "Pushing to remote..."
	@git push origin main
	@echo "Pushed to origin/main."
	@NEW_VERSION=$$(cat VERSION); \
	echo "Creating tag v$$NEW_VERSION..."; \
	git tag -a "v$$NEW_VERSION" -m "Release v$$NEW_VERSION"; \
	git push origin "v$$NEW_VERSION"
	@echo "Tag v$$NEW_VERSION created and pushed."
	@NEW_VERSION=$$(cat VERSION); \
	echo "Creating GitHub release..."; \
	if command -v gh &> /dev/null; then \
		gh release create "v$$NEW_VERSION" \
			--title "ExcaliDash v$$NEW_VERSION" \
			--notes-file RELEASE.md; \
		echo "GitHub release created."; \
	else \
		echo "gh CLI not installed!"; \
		echo "Install with: brew install gh"; \
		echo "Then run: gh auth login"; \
		exit 1; \
	fi
	@echo "Building and pushing Docker images..."
	@./scripts/publish-docker.sh
	@NEW_VERSION=$$(cat VERSION); \
	echo "Release complete."; \
	echo "Version: v$$NEW_VERSION"; \
	echo "Git tag pushed."; \
	echo "GitHub release created."; \
	echo "Docker images published."

pre-release: ## Pre-release workflow (pre-release branch only)
	@CURRENT_BRANCH=$$(git rev-parse --abbrev-ref HEAD); \
	if [ "$$CURRENT_BRANCH" != "pre-release" ]; then \
		echo "ERROR: Pre-releases must be made from 'pre-release' branch!"; \
		echo "Current branch: $$CURRENT_BRANCH"; \
		echo "Please switch to pre-release and try again."; \
		exit 1; \
	fi
	@echo "On pre-release branch."
	@echo "Pulling latest changes..."
	@git pull origin pre-release
	@echo "Up to date with remote."
	@echo "Current status:"
	@git status --short || true
	@echo "Running tests..."
	@$(MAKE) test
	@echo "All tests passed."
	@CURRENT=$$(cat VERSION); \
	PATCH=$$(echo $$CURRENT | awk -F. '{print $$1"."$$2"."$$3+1}'); \
	MINOR=$$(echo $$CURRENT | awk -F. '{print $$1"."$$2+1".0"}'); \
	MAJOR=$$(echo $$CURRENT | awk -F. '{print $$1+1".0.0"}'); \
	echo "Current version: $$CURRENT"; \
	echo "Select version bump:"; \
	echo "  1) patch -> $$PATCH-dev"; \
	echo "  2) minor -> $$MINOR-dev"; \
	echo "  3) major -> $$MAJOR-dev"; \
	echo "  4) custom"; \
	echo "  5) skip (keep $$CURRENT-dev)"; \
	read -p "Enter choice [1-5]: " choice; \
	case $$choice in \
		1) NEW_VERSION=$$PATCH ;; \
		2) NEW_VERSION=$$MINOR ;; \
		3) NEW_VERSION=$$MAJOR ;; \
		4) read -p "Enter new version (without -dev suffix): " NEW_VERSION ;; \
		5) NEW_VERSION=$$CURRENT ;; \
		*) echo "Invalid choice, using current."; NEW_VERSION=$$CURRENT ;; \
	esac; \
	if [ "$$NEW_VERSION" != "$$CURRENT" ]; then \
		echo "Bumping version to $$NEW_VERSION..."; \
		echo "$$NEW_VERSION" > VERSION; \
		sed -i '' "s/\"version\": \".*\"/\"version\": \"$$NEW_VERSION\"/" frontend/package.json 2>/dev/null || \
			sed -i "s/\"version\": \".*\"/\"version\": \"$$NEW_VERSION\"/" frontend/package.json; \
		sed -i '' "s/\"version\": \".*\"/\"version\": \"$$NEW_VERSION\"/" backend/package.json 2>/dev/null || \
			sed -i "s/\"version\": \".*\"/\"version\": \"$$NEW_VERSION\"/" backend/package.json; \
		echo "Version bumped to $$NEW_VERSION."; \
	else \
		echo "Keeping version $$CURRENT."; \
	fi
	@echo "Preparing fresh pre-release notes (RELEASE.md)..."
	@$(MAKE) changelog PRERELEASE=1
	@NEW_VERSION=$$(cat VERSION); \
	echo "Pre-release summary:"; \
	echo "  Version: v$$NEW_VERSION-dev"; \
	echo "  Branch: pre-release"; \
	echo "  Tag: v$$NEW_VERSION-dev (pre-release)"; \
	echo "Changes to be committed:"; \
	git status --short; \
	true
	@read -p "Proceed with pre-release? [y/N]: " confirm; \
	if [ "$$confirm" != "y" ] && [ "$$confirm" != "Y" ]; then \
		echo "Pre-release aborted."; \
		exit 1; \
	fi
	@NEW_VERSION=$$(cat VERSION); \
	echo "Committing pre-release..."; \
	git add -A; \
	git commit -m "chore: pre-release v$$NEW_VERSION-dev" || echo "Nothing to commit."
	@echo "Changes committed."
	@echo "Pushing to remote..."
	@git push origin pre-release
	@echo "Pushed to origin/pre-release."
	@NEW_VERSION=$$(cat VERSION); \
	PRE_TAG="v$$NEW_VERSION-dev"; \
	echo "Creating tag $$PRE_TAG..."; \
	git tag -a "$$PRE_TAG" -m "Pre-release $$PRE_TAG"; \
	git push origin "$$PRE_TAG"
	@echo "Tag $$PRE_TAG created and pushed."
	@NEW_VERSION=$$(cat VERSION); \
	PRE_TAG="v$$NEW_VERSION-dev"; \
	echo "Creating GitHub pre-release..."; \
	if command -v gh &> /dev/null; then \
		gh release create "$$PRE_TAG" \
			--title "ExcaliDash $$PRE_TAG (Pre-release)" \
			--notes-file RELEASE.md \
			--prerelease; \
		echo "GitHub pre-release created."; \
	else \
		echo "gh CLI not installed!"; \
		echo "Install with: brew install gh"; \
		echo "Then run: gh auth login"; \
		exit 1; \
	fi
	@echo "Building and pushing Docker images..."
	@./scripts/publish-docker-prerelease.sh
	@NEW_VERSION=$$(cat VERSION); \
	echo "Pre-release complete."; \
	echo "Version: v$$NEW_VERSION-dev"; \
	echo "Git tag pushed."; \
	echo "GitHub pre-release created."; \
	echo "Docker images published."

release-docker: ## Build and push release Docker images
	./scripts/publish-docker.sh

pre-release-docker: ## Build and push pre-release Docker images
	./scripts/publish-docker-prerelease.sh

dev-release: ## Build and push custom dev release (usage: make dev-release NAME=issue38)
	@if [ -z "$(NAME)" ]; then \
		echo "ERROR: NAME parameter is required!"; \
		echo "Usage: make dev-release NAME=<custom-name>"; \
		echo "Example: make dev-release NAME=issue38"; \
		echo "  This will create tags like: 0.3.1-dev-issue38"; \
		exit 1; \
	fi
	@echo "Building custom dev release: $(NAME)"
	@./scripts/publish-docker-dev.sh $(NAME)

db-migrate: ## Run database migrations
	@echo "Running database migrations..."
	cd backend && npx prisma migrate dev
	@echo "Migrations complete."

db-generate: ## Generate Prisma client
	@echo "Generating Prisma client..."
	cd backend && npx prisma generate
	@echo "Client generated."

db-reset: ## Reset database (WARNING: destroys all data)
	@echo "WARNING: This will destroy all data!"
	@read -p "Are you sure? [y/N]: " confirm; \
	if [ "$$confirm" = "y" ] || [ "$$confirm" = "Y" ]; then \
		cd backend && npx prisma migrate reset --force; \
		echo "Database reset complete."; \
	else \
		echo "Cancelled"; \
	fi

db-studio: ## Open Prisma Studio (database GUI)
	@echo "Opening Prisma Studio..."
	cd backend && npx prisma studio

db-verify-backup: ## Verify the latest backup is restorable
	@./scripts/verify-backup.sh

health-check: ## Run a one-shot health check
	@./scripts/health-check.sh

up: docker-run ## Alias: Start Docker containers
down: docker-down ## Alias: Stop Docker containers
logs: docker-logs ## Alias: Show Docker logs
t: test ## Alias: Run unit tests
ta: test-all ## Alias: Run all tests
