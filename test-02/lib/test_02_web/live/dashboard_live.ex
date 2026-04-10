defmodule Test02Web.DashboardLive do
  use Test02Web, :live_view

  def mount(_params, _session, socket) do
    {:ok, assign(socket, page_title: "Dashboard")}
  end

  def render(assigns) do
    ~H"""
    <.paragraph>Welcome to KeenMate s.r.o.. Edit <code>lib/test-02_web/live/dashboard_live.ex</code> to customize this page.</.paragraph>

    <.grid>
      <.column size="25">
        <.card>
          <.stat variant="hero" number="1,234" label_text="Users" change_text="▲ 12%" change_direction="positive" />
        </.card>
      </.column>
      <.column size="25">
        <.card>
          <.stat variant="hero" number="$5,678" label_text="Revenue" change_text="▲ 8%" change_direction="positive" />
        </.card>
      </.column>
      <.column size="25">
        <.card>
          <.stat variant="hero" number="98%" label_text="Uptime" change_text="▲ 0.2%" change_direction="positive" />
        </.card>
      </.column>
      <.column size="25">
        <.card>
          <.stat variant="hero" number="42" label_text="Tasks" change_text="▼ 3" change_direction="negative" />
        </.card>
      </.column>
    </.grid>

    <.card title_text="Quick Actions">
      <.button_group>
        <.button variant="primary">New Item</.button>
        <.button variant="secondary">Export</.button>
        <.button variant="secondary">Settings</.button>
      </.button_group>
    </.card>
    """
  end
end
