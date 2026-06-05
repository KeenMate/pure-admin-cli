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
		// data-pa="settings-imports"
		SettingsPanel,
		// /data-pa="settings-imports"
		// data-pa="profile-imports"
		ProfilePanel,
		// /data-pa="profile-imports"
	} from '@keenmate/svelte-pure-admin';
	// data-pa="settings-types"
	import type { ThemeOption } from '@keenmate/svelte-pure-admin';
	// /data-pa="settings-types"
	import '../app.css';

	// data-pa="settings-data"
	const availableThemes: ThemeOption[] = [
		__THEME_OPTIONS__
	];
	// /data-pa="settings-data"

	let { children } = $props();

	let sidebarMobileVisible = $state(false);
	let sidebarUserToggled = $state(false);
	// data-pa="profile-state"
	let showProfilePanel = $state(false);
	// /data-pa="profile-state"

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
		name: '__APP_DISPLAY_NAME__',
		copyright: '__COPYRIGHT__'
	}
}}>
	<Layout>
		<Navbar onburgerclick={toggleSidebar} showBurger={true} burgerActive={sidebarMobileVisible || sidebarUserToggled}>
			<!-- data-pa="profile-snippet" -->
			{#snippet profile()}
				<button class="pa-header__profile-btn" onclick={() => showProfilePanel = !showProfilePanel} aria-label="User Profile">
					<span class="pa-btn__icon">👤</span>
					<span class="pa-header__profile-name">User</span>
				</button>
			{/snippet}
			<!-- /data-pa="profile-snippet" -->
		</Navbar>

		<LayoutInner>
			<Sidebar>
				__SIDEBAR_ITEMS__
			</Sidebar>

			<LayoutContent>
				<Main>
					{@render children()}
				</Main>

				<Footer />
			</LayoutContent>
		</LayoutInner>

		<!-- data-pa="settings-component" -->
		<SettingsPanel
			themes={availableThemes}
			defaultTheme="__DEFAULT_THEME__"
		/>
		<!-- /data-pa="settings-component" -->
		<!-- data-pa="profile-component" -->
		<ProfilePanel bind:show={showProfilePanel} name="User" email="user@example.com" role="User" />
		<!-- /data-pa="profile-component" -->
	</Layout>
</PureAdminProvider>
