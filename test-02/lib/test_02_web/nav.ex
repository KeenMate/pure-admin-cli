defmodule Test02Web.Nav do
  @moduledoc """
  Sidebar navigation helpers — assigns `:current_path` so the sidebar
  can highlight the active item.
  """

  def init(opts), do: opts

  def call(conn, _opts) do
    Plug.Conn.assign(conn, :current_path, conn.request_path)
  end

  def on_mount(:default, _params, _session, socket) do
    {:cont,
     Phoenix.LiveView.attach_hook(socket, :set_current_path, :handle_params, fn _params, uri, socket ->
       path = URI.parse(uri).path
       {:cont, Phoenix.Component.assign(socket, :current_path, path)}
     end)}
  end
end
