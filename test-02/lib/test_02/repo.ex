defmodule Test02.Repo do
  use Ecto.Repo,
    otp_app: :test_02,
    adapter: Ecto.Adapters.Postgres
end
