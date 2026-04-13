<script lang="ts">
	import {
		PureAdminProvider,
		Layout,
		LayoutInner,
		LayoutContent,
		// data-pa="navbar-imports"
		Navbar,
		Heading,
		NavItem,
		// /data-pa="navbar-imports"
		// data-pa="sidebar-imports"
		Sidebar,
		SidebarItem,
		// /data-pa="sidebar-imports"
		Main,
		// data-pa="footer-imports"
		Footer,
		// /data-pa="footer-imports"
		// data-pa="popover-imports"
		PopoverContainer,
		// /data-pa="popover-imports"
	} from '@keenmate/svelte-pure-admin';
	import type { PureAdminConfig } from '@keenmate/svelte-pure-admin';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import '../app.css';

	let { children } = $props();

	let sidebarHidden = $state(
		typeof localStorage !== 'undefined' && localStorage.getItem('sidebar-hidden') === 'true'
	);
	let sidebarUserToggled = $state(false);
	let sidebarMobileVisible = $state(false);

	const config: Partial<PureAdminConfig> = {
		app: {
			name: 'KeenMate s.r.o.',
			copyright: '© 2026 KeenMate s.r.o.',
			version: '1.0.0'
		}
	};

	function toggleSidebar() {
		if (typeof document !== 'undefined') {
			const isMobile = window.innerWidth <= 768;
			if (isMobile) {
				sidebarMobileVisible = !sidebarMobileVisible;
				sidebarUserToggled = false;
				document.body.classList.toggle('sidebar-visible', sidebarMobileVisible);
			} else {
				sidebarHidden = !sidebarHidden;
				sidebarUserToggled = !sidebarUserToggled;
				sidebarMobileVisible = false;
				document.body.classList.remove('sidebar-visible');
				document.body.classList.toggle('sidebar-hidden', sidebarHidden);
				localStorage.setItem('sidebar-hidden', String(sidebarHidden));
			}
		}
	}

	function isActive(path: string): boolean {
		return $page.url.pathname === path;
	}

	onMount(() => {
		// data-pa="page-loader-onmount"
		if ((window as any).__pageLoaderReady) {
			(window as any).__pageLoaderReady();
		}
		// /data-pa="page-loader-onmount"

		const sidebarBehavior = localStorage.getItem('sidebar-behavior') || 'hide';
		const sidebar = document.querySelector('.pa-layout__sidebar');
		if (sidebar && sidebarBehavior === 'icon-collapse') {
			sidebar.classList.add('pa-layout__sidebar--icon-collapse');
		}
	});
</script>

<PureAdminProvider {config}>
	<Layout>
		<!-- data-pa="navbar-component" -->
		<Navbar
			onburgerclick={toggleSidebar}
			showBurger={true}
			burgerActive={sidebarMobileVisible || sidebarUserToggled}
		>
			{#snippet brand()}
				<Heading level={1}>KeenMate s.r.o.</Heading>
			{/snippet}

			{#snippet navStart()}
				<NavItem href="/">Dashboard</NavItem>
				<NavItem href="/users">Users</NavItem>
				<NavItem href="/settings">Settings</NavItem>
			{/snippet}

		</Navbar>
		<!-- /data-pa="navbar-component" -->

		<LayoutInner>
			<!-- data-pa="sidebar-component" -->
			<Sidebar>
				<!-- data-pa="sidebar-items" -->
				<SidebarItem href="/getting-started" labelText="Getting Started" active={isActive('/getting-started')}>
					{#snippet icon()}<i class="fas fa-rocket"></i>{/snippet}
				</SidebarItem>
				<SidebarItem href="/" labelText="Dashboard" active={isActive('/')}>
					{#snippet icon()}<i class="fas fa-chart-line"></i>{/snippet}
				</SidebarItem>
				<SidebarItem labelText="Management" hasSubmenu>
					{#snippet icon()}<i class="fas fa-briefcase"></i>{/snippet}
					{#snippet submenu()}
						<SidebarItem href="/users" labelText="Users" active={isActive('/users')}>
							{#snippet icon()}<i class="fas fa-users"></i>{/snippet}
						</SidebarItem>
						<SidebarItem href="/settings" labelText="Settings" active={isActive('/settings')}>
							{#snippet icon()}<i class="fas fa-cog"></i>{/snippet}
						</SidebarItem>
					{/snippet}
				</SidebarItem>
				<!-- /data-pa="sidebar-items" -->
			</Sidebar>
			<!-- /data-pa="sidebar-component" -->

			<LayoutContent>
				<Main>
					{@render children()}
				</Main>

				<!-- data-pa="footer-component" -->
				<Footer>
					{#snippet start()}
						<span>© 2026 KeenMate s.r.o.</span>
					{/snippet}
					{#snippet end()}
						<span>v1.0.0</span>
					{/snippet}
				</Footer>
				<!-- /data-pa="footer-component" -->
			</LayoutContent>
		</LayoutInner>
	</Layout>

	<!-- data-pa="popover-container" -->
	<PopoverContainer />
	<!-- /data-pa="popover-container" -->
</PureAdminProvider>
