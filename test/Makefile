# KeenMate s.r.o. — Makefile

.PHONY: help setup dev build preview clean themes

help:
	@echo "KeenMate s.r.o."
	@echo ""
	@echo "  make setup      Install dependencies and download themes"
	@echo "  make dev        Start development server"
	@echo "  make build      Build for production"
	@echo "  make preview    Preview production build"
	@echo "  make themes     Download/update themes"
	@echo "  make clean      Clean build artifacts"
	@echo ""

setup:
	pnpm install
	pnpm exec pureadmin themes

dev:
	pnpm run dev

build:
	pnpm run build

preview:
	pnpm run preview

themes:
	pnpm exec pureadmin themes

clean:
	rm -rf .svelte-kit build node_modules
