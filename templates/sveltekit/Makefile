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
	npm install
	npx pureadmin themes

dev:
	npm run dev

build:
	npm run build

preview:
	npm run preview

themes:
	npx pureadmin themes

clean:
	rm -rf .svelte-kit build node_modules
