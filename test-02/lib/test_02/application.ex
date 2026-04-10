defmodule Test02.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      Test02Web.Telemetry,
      Test02.Repo,
      {DNSCluster, query: Application.get_env(:test_02, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: Test02.PubSub},
      # Start a worker by calling: Test02.Worker.start_link(arg)
      # {Test02.Worker, arg},
      # Start to serve requests, typically the last entry
      Test02Web.Endpoint
    ]

    # See https://hexdocs.pm/elixir/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: Test02.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    Test02Web.Endpoint.config_change(changed, removed)
    :ok
  end
end
