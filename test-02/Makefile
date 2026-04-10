.PHONY: help setup deps server dev build assets themes themes-update clean format test ecto-create ecto-reset

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

setup: deps themes ecto-create assets ## Full setup: deps, themes, db, assets

deps: ## Fetch Elixir dependencies
	mix deps.get

dev: server ## Alias for server

server: ## Start Phoenix server
	mix phx.server

build: ## Compile the project
	mix compile

assets: ## Build JS/CSS assets
	mix assets.build

themes: ## Download Pure Admin themes via CLI
	npx @keenmate/pureadmin themes add express --dir priv/static/themes

themes-update: ## Re-download themes that have changed
	npx @keenmate/pureadmin themes update

ecto-create: ## Create the database
	mix ecto.create

ecto-reset: ## Drop and recreate the database
	mix ecto.drop
	mix ecto.create

format: ## Format Elixir code
	mix format

test: ## Run tests
	mix test

clean: ## Clean build artifacts
	mix clean
	rm -rf priv/static/assets/js priv/static/assets/css
