.PHONY: help install dev build preview lint typecheck test check clean docker-build docker-run docker-stop docker-logs docker-clean ollama-start ollama-stop edge-dev edge-deploy-staging terraform-init terraform-plan-dev terraform-plan-prod terraform-apply-dev terraform-apply-prod

help:
	@echo "DataScope — Data exploration and AI-powered analysis"
	@echo ""
	@echo "Quick start:"
	@echo "  make install      # npm install"
	@echo "  make dev          # Start development server"
	@echo "  make build        # Production build"
	@echo "  make check        # Run linter, type-check, and tests"
	@echo ""
	@echo "For full options, see targets in this Makefile"

install:
	npm install

dev:
	npm run dev

build:
	npm run build

preview:
	npm run preview

lint:
	npm run lint

typecheck:
	npx tsc -b --noEmit

test:
	npm run test

check: lint typecheck test

clean:
	rm -rf dist node_modules/.tmp

edge-dev:
	npm run edge:dev

edge-deploy-staging:
	npm run edge:deploy:staging

TF := terraform -chdir=infra

terraform-init:
	$(TF) init -backend-config=backend.hcl

terraform-plan-dev:
	$(TF) workspace select dev 2>/dev/null || $(TF) workspace new dev
	$(TF) plan -var-file=envs/dev.tfvars

terraform-plan-prod:
	$(TF) workspace select prod 2>/dev/null || $(TF) workspace new prod
	$(TF) plan -var-file=envs/prod.tfvars

terraform-apply-dev:
	$(TF) workspace select dev 2>/dev/null || $(TF) workspace new dev
	$(TF) apply -var-file=envs/dev.tfvars

terraform-apply-prod:
	$(TF) workspace select prod 2>/dev/null || $(TF) workspace new prod
	$(TF) apply -var-file=envs/prod.tfvars

docker-build:
	docker build -t datascope:local .

docker-run: docker-build
	docker rm -f datascope >/dev/null 2>&1 || true
	docker run -d --name datascope -p 8080:80 datascope:local
	@echo "Running at http://localhost:8080"

docker-stop:
	docker rm -f datascope >/dev/null 2>&1 || true

docker-logs:
	docker logs -f datascope

docker-clean: docker-stop
	docker rmi datascope:local >/dev/null 2>&1 || true

# Local device defaults (on the side):
# OLLAMA_URL := http://localhost:11434
# OLLAMA_MODEL := qwen2.5-coder:1.5b

# Remote M4 Air over Tailscale:
OLLAMA_URL := http://100.126.157.97:11434
OLLAMA_MODEL := qwen2.5-coder:14b

ollama-start:
	@curl -s -m 1 $(OLLAMA_URL)/api/version >/dev/null 2>&1 && echo "Ollama already running at $(OLLAMA_URL)" || \
		(nohup ollama serve >/tmp/ollama-serve.log 2>&1 & echo "Starting Ollama…"; sleep 1)
	@ollama list | grep -q "$(OLLAMA_MODEL)" || ollama pull $(OLLAMA_MODEL)
	@echo "Paste into AI settings (API mode): $(OLLAMA_URL)"

ollama-stop:
	@pkill -f "ollama serve" && echo "Ollama stopped" || echo "Ollama was not running"
