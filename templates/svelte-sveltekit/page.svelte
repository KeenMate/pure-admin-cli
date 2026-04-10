<script lang="ts">
	import { Card, Heading, Paragraph } from '@keenmate/svelte-pure-admin';
</script>

<Heading level={1}>Dashboard</Heading>

<div class="pa-grid pa-grid--3">
	<Card titleText="Welcome">
		<Paragraph>
			Your Pure Admin app is ready. Edit <code>src/routes/+page.svelte</code> to get started.
		</Paragraph>
	</Card>

	<Card titleText="Theme">
		<Paragraph>
			Open the settings panel (gear icon) to switch between themes and modes.
		</Paragraph>
	</Card>

	<Card titleText="Components">
		<Paragraph>
			See the <a href="https://pureadmin.io/docs">documentation</a> for available components.
		</Paragraph>
	</Card>
</div>
