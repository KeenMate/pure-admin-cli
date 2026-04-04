# @keenmate/pureadmin CLI - Makefile

.PHONY: help verify publish-dry publish publish-rc clean test

# NPM publish tag (empty for latest, use TAG=rc for pre-releases)
TAG ?=
NPM_TAG = $(if $(TAG),--tag $(TAG),)

# Default target
help:
	@echo "@keenmate/pureadmin CLI - Available Commands:"
	@echo ""
	@echo "  Package:"
	@echo "    make verify       - Check what would be published"
	@echo "    make publish-dry  - Dry-run publish"
	@echo "    make publish      - Publish to npm (latest)"
	@echo "    make publish-rc   - Publish with --tag rc (pre-release)"
	@echo "    make publish TAG=beta  - Publish with custom tag"
	@echo ""
	@echo "  Development:"
	@echo "    make test         - Run tests"
	@echo "    make link         - npm link for local testing"
	@echo "    make unlink       - npm unlink"
	@echo ""

# Check package contents
verify:
	npm pack --dry-run

# Dry-run publish
publish-dry:
	npm publish --access public --dry-run $(NPM_TAG)

# Publish to npm
publish:
	npm publish --access public $(NPM_TAG)

# Publish as release candidate
publish-rc:
	npm publish --access public --tag rc

# Run tests
test:
	node --test test/*.test.js

# Link for local development
link:
	npm link

# Unlink
unlink:
	npm unlink -g @keenmate/pureadmin

# Clean any generated artifacts
clean:
	rm -f keenmate-pureadmin-*.tgz
