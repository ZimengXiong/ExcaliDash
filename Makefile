.PHONY: help install dev build test test-frontend test-backend test-e2e test-e2e-docker \
        lint lint-frontend lint-backend check clean docker-build docker-run docker-down docker-logs \
        lab-build lab-up lab-down lab-reset lab-status lab-logs lab-smoke lab-open \
        release pre-release version-bump changelog changelog-open changelog-keep db-migrate db-reset

DOCKER_USERNAME := zimengxiong
IMAGE_NAME := excalidash
VERSION := $(shell cat VERSION 2>/dev/null || echo "0.0.0")
LAB_COMPOSE := docker compose -f docker-compose.lab.yml

.DEFAULT_GOAL := help

help: ## Show this help message
	@TITLE="ExcaliDash Makefile"; \
	echo "$$TITLE |"; \
	UNDERLINE=$$(printf '%*s' $$(( $${#TITLE} + 1 )) '' | tr ' ' '-'); \
	echo "$$UNDERLINE|"
	@echo "Usage: make [target]"
	@echo "Development:"
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | grep -E '(install|dev|build|lint|clean)' | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'
	@echo "Testing:"
	@grep -hE '^test[-a-zA-Z0-9_]*:.*## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  %-20s %s\n", $$1, $$2}'
	@echo "Docker:"
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | grep -E '(docker)' | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'
	@echo "Environment lab:"
	@grep -hE '^lab[-a-zA-Z0-9_]*:.*## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  %-20s %s\n", $$1, $$2}'
	@echo "Release:"
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | grep -E '(release|version|changelog)' | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'
	@echo "Database:"
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | grep -E '(db-)' | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'
	@echo "Current version: $(VERSION)"

install: ## Install all dependencies (frontend, backend, e2e)
	@echo "Installing frontend dependencies..."
	cd frontend && npm install
	@echo "Installing backend dependencies..."
	cd backend && npm install
	@echo "Installing e2e dependencies..."
	cd e2e && npm install
	@echo "All dependencies installed."

dev: ## Start backend+frontend in a tmux split screen (single-user local mode)
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
		tmux new-session -d -s $$SESSION -c "$(CURDIR)" "cd backend && PORT=8001 AUTH_MODE=local EXCALIDASH_DEV_SINGLE_USER=true npm run dev"; \
		tmux split-window -h -t $$SESSION:0 -c "$(CURDIR)" "cd frontend && VITE_DEV_BACKEND_URL=http://localhost:8001 npm run dev"; \
		tmux select-layout -t $$SESSION:0 even-horizontal; \
		tmux select-pane -t $$SESSION:0.0; \
	fi; \
	if [ -n "$$TMUX" ]; then \
		tmux switch-client -t $$SESSION; \
	else \
		tmux attach -t $$SESSION; \
	fi

dev-stop: ## Stop the tmux dev session
	@STOPPED=0; \
	for SESSION in excalidash-dev excalidash-dev-auth; do \
		if tmux has-session -t $$SESSION 2>/dev/null; then \
			tmux kill-session -t $$SESSION; \
			echo "Stopped tmux session: $$SESSION"; \
			STOPPED=1; \
		fi; \
	done; \
	if [ $$STOPPED -eq 0 ]; then \
		echo "No ExcaliDash tmux dev sessions are running"; \
	fi

dev-frontend: ## Start frontend dev server only
	cd frontend && npm run dev

dev-backend: ## Start backend dev server only
	cd backend && npm run dev

dev-auth: ## Start backend+frontend in tmux using backend/.env auth settings
	@command -v tmux >/dev/null 2>&1 || { \
		echo "tmux is required for 'make dev-auth'"; \
		echo "Install tmux and try again."; \
		exit 1; \
	}
	@SESSION="excalidash-dev-auth"; \
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

check: ## Run repo checks (max source line count + env boundary)
	@echo "Running repo checks..."
	cd backend && npm run check:max-lines
	cd backend && npm run check:env-boundary
	@echo "Repo checks passed."

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

lab-build: ## Build reproducible local environment lab images
	$(LAB_COMPOSE) build

lab-up: ## Start all reproducible lab environments on ports 1101-1105
	$(LAB_COMPOSE) up -d --build
	@echo ""
	@echo "ExcaliDash lab is starting:"
	@echo "  basic local auth:       http://localhost:1101"
	@echo "  basic + SeaweedFS S3:   http://localhost:1102"
	@echo "  OIDC enforced:          http://localhost:1103"
	@echo "  hybrid auth:            http://localhost:1104"
	@echo "  trusted proxy variant:  http://localhost:1105"
	@echo "  Keycloak admin:         http://localhost:18080/admin"
	@echo "  SeaweedFS filer:        http://localhost:18888"
	@echo "  SeaweedFS S3 endpoint:  http://localhost:18333"
	@echo ""
	@echo "Run 'make lab-smoke' once containers are healthy."

lab-down: ## Stop lab containers without deleting volumes
	$(LAB_COMPOSE) down

lab-reset: ## Stop lab containers and delete lab volumes for a fresh reproducible run
	$(LAB_COMPOSE) down -v --remove-orphans

lab-status: ## Show lab container status
	$(LAB_COMPOSE) ps

lab-logs: ## Follow lab container logs
	$(LAB_COMPOSE) logs -f

lab-smoke: ## Verify all lab frontends, backend health proxies, and SeaweedFS bucket setup
	chmod +x scripts/lab-smoke.sh
	./scripts/lab-smoke.sh

lab-open: ## Open all lab URLs in the default browser
	@URLS="http://localhost:1101 http://localhost:1102 http://localhost:1103 http://localhost:1104 http://localhost:1105 http://localhost:18080/admin http://localhost:18888 http://localhost:18333"; \
	if command -v open >/dev/null 2>&1; then \
		for URL in $$URLS; do open "$$URL"; done; \
	elif command -v xdg-open >/dev/null 2>&1; then \
		for URL in $$URLS; do xdg-open "$$URL" >/dev/null 2>&1 & done; \
	else \
		echo "No browser opener found. Open these URLs manually:"; \
		for URL in $$URLS; do echo "  $$URL"; done; \
	fi

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

include make/release.mk

db-migrate: ## Run database migrations
	@echo "Running database migrations..."
	cd backend && node scripts/provider-prisma.cjs --persist-provider-migrations migrate dev --skip-generate
	@echo "Migrations complete."

db-generate: ## Generate Prisma client
	@echo "Generating Prisma client..."
	cd backend && npx prisma generate
	@echo "Client generated."

db-reset: ## Reset database (WARNING: destroys all data)
	@echo "WARNING: This will destroy all data!"
	@read -p "Are you sure? [y/N]: " confirm; \
	if [ "$$confirm" = "y" ] || [ "$$confirm" = "Y" ]; then \
		cd backend && node scripts/provider-prisma.cjs migrate reset --force --skip-generate; \
		echo "Database reset complete."; \
	else \
		echo "Cancelled"; \
	fi

db-studio: ## Open Prisma Studio (database GUI)
	@echo "Opening Prisma Studio..."
	cd backend && npx prisma studio

up: docker-run ## Alias: Start Docker containers
down: docker-down ## Alias: Stop Docker containers
logs: docker-logs ## Alias: Show Docker logs
t: test ## Alias: Run unit tests
ta: test-all ## Alias: Run all tests
