.PHONY: install test build verify

install:
	cd packages/backend-lib && npm install

test:
	cd packages/backend-lib && npx jest --passWithNoTests

build:
	cd packages/backend-lib && npx tsc --noEmit

verify: install test
	@echo "✅ All tests pass"
