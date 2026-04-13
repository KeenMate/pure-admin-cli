<script lang="ts">
	import {
		Card,
		Grid,
		Column,
		Alert,
		Heading,
		Paragraph,
		CodeBlock,
		BasicList,
		Badge,
		Table
	} from '@keenmate/svelte-pure-admin';
</script>

<svelte:head>
	<title>Getting Started - My App</title>
</svelte:head>

<Paragraph mode="muted">Everything you need to know to start building with this template.</Paragraph>

<!-- Project Structure -->
<Card titleText="Project Structure">
	<CodeBlock>{`src/
├── app.html              # HTML shell (page loader, FOUC prevention, theme CSS)
├── app.css               # Global styles (theme loaded via <link> in app.html)
├── routes/
│   ├── +layout.svelte    # Main layout (navbar, sidebar, footer, profile panel)
│   ├── +page.svelte      # Dashboard (/)
│   ├── users/
│   │   └── +page.svelte  # Users page (/users)
│   ├── settings/
│   │   └── +page.svelte  # Settings page (/settings)
│   └── getting-started/
│       └── +page.svelte  # This page (/getting-started)
├── static/
│   └── themes/           # Theme CSS files (managed by pureadmin CLI)
├── package.json
├── svelte.config.js      # SvelteKit config
└── pureadmin.json        # Theme registry (pureadmin CLI)`}</CodeBlock>
</Card>

<!-- Routing -->
<Card titleText="Routing (SvelteKit)">
	<Paragraph class="mb-4">
		This template uses <strong>SvelteKit's file-based router</strong>. Each <code>+page.svelte</code> file in <code>src/routes/</code> becomes a route automatically.
	</Paragraph>

	<Heading level={4}>Adding a New Page</Heading>
	<BasicList>
		<li>Create a folder in <code>src/routes/</code> (e.g., <code>src/routes/orders/</code>)</li>
		<li>Add a <code>+page.svelte</code> file inside it</li>
		<li>Add a <code>SidebarItem</code> in <code>+layout.svelte</code> pointing to the new route</li>
		<li>Optionally add a <code>NavItem</code> in the navbar</li>
	</BasicList>

	<Heading level={4} class="mt-4">Example: Adding an Orders Page</Heading>
	<CodeBlock>{`<!-- src/routes/orders/+page.svelte -->
<script lang="ts">
  import { Card, Paragraph } from '@keenmate/svelte-pure-admin';
</script>

<Paragraph mode="muted">Manage customer orders.</Paragraph>
<Card titleText="Orders">
  <!-- Your content here -->
</Card>`}</CodeBlock>

	<Paragraph class="mt-4">Then add the sidebar item in <code>+layout.svelte</code>:</Paragraph>
	<CodeBlock>{`<SidebarItem
  href="/orders"
  labelText="Orders"
  active={isActive('/orders')}
>
  {#snippet icon()}<i class="fas fa-shopping-cart"></i>{/snippet}
</SidebarItem>`}</CodeBlock>
</Card>

<!-- Layout -->
<Card titleText="Layout Components">
	<Paragraph class="mb-4">The layout in <code>+layout.svelte</code> is built from these components:</Paragraph>

	<Table isCompact>
		<thead>
			<tr>
				<th>Component</th>
				<th>Purpose</th>
			</tr>
		</thead>
		<tbody>
			<tr><td><code>PureAdminProvider</code></td><td>Wraps the app, provides config context (app name, version, etc.)</td></tr>
			<tr><td><code>Navbar</code></td><td>Top navigation bar with burger, brand, nav items, profile button</td></tr>
			<tr><td><code>Layout</code></td><td>Main layout container</td></tr>
			<tr><td><code>LayoutInner</code></td><td>Sidebar + content wrapper</td></tr>
			<tr><td><code>Sidebar</code> / <code>SidebarItem</code></td><td>Side navigation with collapsible submenus</td></tr>
			<tr><td><code>LayoutContent</code></td><td>Content area wrapper</td></tr>
			<tr><td><code>Main</code></td><td>Main content area where pages render</td></tr>
			<tr><td><code>Footer</code></td><td>Page footer with start/end sections</td></tr>
			<tr><td><code>ProfileButton</code></td><td>Profile trigger in navbar</td></tr>
			<tr><td><code>ProfilePanel</code></td><td>Slide-out profile panel</td></tr>
		</tbody>
	</Table>
</Card>

<!-- Theming -->
<Card titleText="Theming">
	<Paragraph class="mb-4">Themes are managed via the <code>pureadmin</code> CLI and loaded as static CSS files.</Paragraph>

	<Heading level={4}>Available Commands</Heading>
	<CodeBlock>{`npx pureadmin list              # List all available themes
npx pureadmin themes audi       # Download Audi theme
npx pureadmin themes dark       # Download Dark theme
npx pureadmin update            # Update all downloaded themes`}</CodeBlock>

	<Heading level={4} class="mt-4">Switching Themes</Heading>
	<Paragraph>Change the theme CSS <code>&lt;link&gt;</code> in <code>src/app.html</code>:</Paragraph>
	<CodeBlock>{`<!-- In src/app.html <head> -->
<link rel="stylesheet" href="/themes/audi/css/audi.css" />
<!-- or -->
<link rel="stylesheet" href="/themes/dark/css/dark.css" />`}</CodeBlock>
</Card>

<!-- Key Concepts -->
<Card titleText="Key Concepts">
	<Grid>
		<Column size="100" lg="1-2">
			<Heading level={4}>Svelte 5 Runes</Heading>
			<Paragraph class="mb-2">This template uses Svelte 5 exclusively:</Paragraph>
			<BasicList>
				<li><code>$state()</code> for reactive state</li>
				<li><code>$derived()</code> for computed values</li>
				<li><code>$props()</code> for component props</li>
				<li><code>$effect()</code> for side effects</li>
				<li><code>{`{#snippet}`}</code> instead of <code>&lt;slot&gt;</code></li>
			</BasicList>
		</Column>
		<Column size="100" lg="1-2">
			<Heading level={4}>Component Patterns</Heading>
			<Paragraph class="mb-2">Common patterns used throughout:</Paragraph>
			<BasicList>
				<li><code>titleText</code> prop for card/section headings</li>
				<li><code>variant</code> prop for color variants (primary, success, etc.)</li>
				<li><code>icon</code> snippet for icon content</li>
				<li><code>children</code> snippet for default content</li>
				<li><code>bind:show</code> for panel visibility</li>
			</BasicList>
		</Column>
	</Grid>
</Card>

<!-- Internationalization -->
<Card titleText="Internationalization (i18n)">
	<Paragraph class="mb-4">
		All internal component strings (close buttons, aria labels, dialog confirmations, etc.) are translatable via <strong>svelte-i18n</strong>. Built-in locales: English and Czech.
	</Paragraph>

	<Heading level={4}>How It Works</Heading>
	<Paragraph class="mb-2">
		The <code>PureAdminProvider</code> initializes i18n automatically. Components use the <code>$_('key')</code> store internally for all user-facing text.
	</Paragraph>

	<Heading level={4} class="mt-4">Adding a Language</Heading>
	<CodeBlock>{`<script>
  import { i18n } from '@keenmate/svelte-pure-admin';

  // Register a custom locale
  i18n.registerLocale('de', {
    'pureAdmin.buttons.close': 'Schließen',
    'pureAdmin.dialog.confirm': 'Bestätigen',
    'pureAdmin.dialog.cancel': 'Abbrechen',
    // ... see ai/i18n.txt for all keys
  });

  // Switch locale
  i18n.setLocale('de');
</script>`}</CodeBlock>

	<Heading level={4} class="mt-4">Using Translations in Your App</Heading>
	<CodeBlock>{`<script>
  import { _, addMessages } from '@keenmate/svelte-pure-admin';

  // Add your own app translations
  addMessages('en', {
    'app.welcome': 'Welcome to My App',
    'app.orders.title': 'Customer Orders'
  });
</script>

<!-- Use in templates -->
<h1>{$_('app.welcome')}</h1>`}</CodeBlock>

	<Heading level={4} class="mt-4">Built-in Translation Keys</Heading>
	<Paragraph>
		All keys are namespaced under <code>pureAdmin.*</code>. See the full list in <code>node_modules/@keenmate/svelte-pure-admin/ai/i18n.txt</code>. Key categories: buttons, dialog, form validation, a11y labels, command palette, toast, pagination.
	</Paragraph>
</Card>

<!-- Resources -->
<Card titleText="Resources">
	<BasicList>
		<li><strong>Component Library:</strong> <code>@keenmate/svelte-pure-admin</code> — 100+ components</li>
		<li><strong>CSS Framework:</strong> <code>@keenmate/pure-admin-core</code> — BEM-based styling</li>
		<li><strong>AI Reference:</strong> <code>node_modules/@keenmate/svelte-pure-admin/ai/INDEX.txt</code> — point your AI assistant here</li>
		<li><strong>SvelteKit Docs:</strong> <code>https://svelte.dev/docs/kit</code></li>
	</BasicList>
</Card>
