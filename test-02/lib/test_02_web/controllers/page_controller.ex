defmodule Test02Web.PageController do
  use Test02Web, :controller

  def home(conn, _params) do
    render(conn, :home)
  end
end
