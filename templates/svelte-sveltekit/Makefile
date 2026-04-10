# __APP_DISPLAY_NAME__ — Makefile

.PHONY: help setup dev build preview clean themes

help:
	@echo "__APP_DISPLAY_NAME__"
	@echo ""
	@echo "  make setup      Install dependencies and download themes"
	@echo "  make dev        Start development server"
	@echo "  make build      Build for production"
	@echo "  make preview    Preview production build"
	@echo "  make themes     Download/update themes"
	@echo "  make clean      Clean build artifacts"
	@echo ""

setup:
	__PM__ install
	__PM_EXEC__ pureadmin themes

dev:
	__PM_RUN__ dev

build:
	__PM_RUN__ build

preview:
	__PM_RUN__ preview

themes:
	__PM_EXEC__ pureadmin themes

clean:
	rm -rf .svelte-kit build node_modules
