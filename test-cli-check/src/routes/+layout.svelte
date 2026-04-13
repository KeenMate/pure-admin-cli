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
		Footer{{#SETTINGS_PANEL}},
		SettingsPanel{{/SETTINGS_PANEL}}{{#PROFILE_PANEL}},
		ProfilePanel{{/PROFILE_PANEL}}
	} from '@keenmate/svelte-pure-admin';
	{{#SETTINGS_PANEL}}import type { ThemeOption } from '@keenmate/svelte-pure-admin';
	{{/SETTINGS_PANEL}}import '../app.css';

	{{#SETTINGS_PANEL}}const availableThemes: ThemeOption[] = [
				{ id: 'corporate', name: 'Corporate', cssPath: '/themes/corporate/css/corporate.css' },
		{ id: 'audi', name: 'Audi', cssPath: '/themes/audi/css/audi.css' },
		{ id: 'dark', name: 'Dark', cssPath: '/themes/dark/css/dark.css' }
	];
	{{/SETTINGS_PANEL}}

	let { children } = $props();

	let sidebarMobileVisible = $state(false);
	let sidebarUserToggled = $state(false);
	{{#PROFILE_PANEL}}let showProfilePanel = $state(false);{{/PROFILE_PANEL}}

	function toggleSidebar() {
		if (typeof document !== 'undefined') {
			const isMobile = window.innerWidth <= 768;
			if (isMobile) {
				sidebarMobileVisible = !sidebarMobileVisible;
				sidebarUserToggled = false;
				document.body.classList.toggle('sidebar-visible', sidebarMobileVisible);
			} else {
				const hidden = document.body.classList.toggle('sidebar-hidden');
				sidebarUserToggled = !sidebarUserToggled;
				sidebarMobileVisible = false;
				document.body.classList.remove('sidebar-visible');
				localStorage.setItem('sidebar-hidden', String(hidden));
			}
		}
	}
</script>

<PureAdminProvider config={{
	app: {
		name: 'KeenMate s.r.o.',
		copyright: '© 2026 KeenMate s.r.o.'
	}
}}>
	<Layout>
		<Navbar onburgerclick={toggleSidebar} showBurger={true} burgerActive={sidebarMobileVisible || sidebarUserToggled}>
			{{#PROFILE_PANEL}}{#snippet profile()}
				<button class="pa-header__profile-btn" onclick={() => showProfilePanel = !showProfilePanel} aria-label="User Profile">
					<span class="pa-btn__icon">👤</span>
					<span class="pa-header__profile-name">User</span>
				</button>
			{/snippet}{{/PROFILE_PANEL}}
		</Navbar>

		<LayoutInner>
			<Sidebar>
								<SidebarItem href="/" labelText="Dashboard">
					{#snippet icon()}<i class="fa fa-home"></i>{/snippet}
				</SidebarItem>
			</Sidebar>

			<LayoutContent>
				<Main>
					{@render children()}
				</Main>

				<Footer />
			</LayoutContent>
		</LayoutInner>

		{{#SETTINGS_PANEL}}<SettingsPanel
			themes={availableThemes}
			defaultTheme="corporate"
		/>{{/SETTINGS_PANEL}}
		{{#PROFILE_PANEL}}<ProfilePanel bind:show={showProfilePanel} name="User" email="user@example.com" role="User" />{{/PROFILE_PANEL}}
	</Layout>
</PureAdminProvider>
