.PHONY: help sync lint fmt typecheck test check openapi run docker clean-env
help:            ## list targets
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | sed 's/:.*##/\t/'
sync:            ## install everything (API, pipeline, dev) from uv.lock
	uv sync --all-extras --all-groups
lint:            ## ruff lint + format check
	uv run ruff check . && uv run ruff format --check .
fmt:             ## auto-fix and format
	uv run ruff check --fix . && uv run ruff format .
typecheck:       ## ty
	uv run ty check
test:            ## pytest with coverage (fails under 85%)
	uv run pytest --cov
openapi:         ## regenerate docs/openapi.json
	uv run siting-openapi
check: lint typecheck ## everything CI runs
	uv run siting-openapi --check && uv run pytest --cov
run:             ## API on :8780 using ./data
	SITING_DATA=data uv run uvicorn siting.api.app:app --factory --port 8780 --reload
docker:          ## build the image (needs data/ built)
	docker build -t solsat-siting .
