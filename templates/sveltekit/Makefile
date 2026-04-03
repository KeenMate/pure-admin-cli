# {{APP_DISPLAY_NAME}} — Makefile

.PHONY: help setup dev build preview clean themes

help:
	@echo "{{APP_DISPLAY_NAME}}"
	@echo ""
	@echo "  make setup      Install dependencies and download themes"
	@echo "  make dev        Start development server"
	@echo "  make build      Build for production"
	@echo "  make preview    Preview production build"
	@echo "  make themes     Download/update themes"
	@echo "  make clean      Clean build artifacts"
	@echo ""

setup:
	{{PM}} install
	{{PM_EXEC}} pureadmin themes

dev:
	{{PM_RUN}} dev

build:
	{{PM_RUN}} build

preview:
	{{PM_RUN}} preview

themes:
	{{PM_EXEC}} pureadmin themes

clean:
	rm -rf .svelte-kit build node_modules
