<script lang="ts">
	import {
		PureAdminProvider,
		Layout,
		LayoutInner,
		LayoutContent,
		Navbar,
		Sidebar,
		SidebarItem,
		Main,
		Footer,
		SettingsPanel
	} from '@keenmate/svelte-pure-admin';
	import type { ThemeOption } from '@keenmate/svelte-pure-admin';
	import '../app.css';

	const availableThemes: ThemeOption[] = [
		{{THEME_OPTIONS}}
	];

	let { children } = $props();

	let sidebarHidden = $state(false);
	let sidebarMobileVisible = $state(false);

	function toggleSidebar() {
		if (typeof document !== 'undefined') {
			const isMobile = window.innerWidth <= 768;
			if (isMobile) {
				sidebarMobileVisible = !sidebarMobileVisible;
			} else {
				sidebarHidden = !sidebarHidden;
			}
		}
	}
</script>

<PureAdminProvider config={{
	app: { name: '{{APP_DISPLAY_NAME}}' }
}}>
	<Layout>
		<Navbar onburgerclick={toggleSidebar} />

		<LayoutInner>
			<Sidebar
				bind:hidden={sidebarHidden}
				bind:mobileVisible={sidebarMobileVisible}
			>
				<SidebarItem href="/" label="Dashboard" icon="fa fa-home" />
			</Sidebar>

			<LayoutContent>
				<Main>
					{@render children()}
				</Main>

				<Footer />
			</LayoutContent>
		</LayoutInner>

		<SettingsPanel
			themes={availableThemes}
			defaultTheme="{{DEFAULT_THEME}}"
		/>
	</Layout>
</PureAdminProvider>
