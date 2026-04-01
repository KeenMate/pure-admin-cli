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
	import type { PureAdminConfig, ThemeOption } from '@keenmate/svelte-pure-admin';
	import '../app.css';

	// Theme CSS files are served from static/themes/ to avoid Vite's CSS
	// injection side-effects that occur with ?url imports of CSS-only packages.
	// The correct theme is loaded via a blocking <link> in app.html (no FOUC).
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

	const config: PureAdminConfig = {
		appName: '{{APP_DISPLAY_NAME}}',
		copyright: {
			text: '{{APP_DISPLAY_NAME}}',
			year: new Date().getFullYear()
		}
	};
</script>

<PureAdminProvider {config}>
	<Layout>
		<Navbar
			appName={config.appName}
			onburgerclick={toggleSidebar}
		/>

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

				<Footer
					copyright={config.copyright}
				/>
			</LayoutContent>
		</LayoutInner>

		<SettingsPanel
			themes={availableThemes}
			defaultTheme="{{DEFAULT_THEME}}"
		/>
	</Layout>
</PureAdminProvider>
