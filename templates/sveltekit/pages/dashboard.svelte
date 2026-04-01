<script lang="ts">
	import { Heading, Card, Paragraph } from '@keenmate/svelte-pure-admin';
</script>

<Heading level={1}>Dashboard</Heading>

<div class="pa-row">
	<div class="pa-col-100 pa-col-md-50 pa-col-lg-1-3">
		<Card titleText="Welcome">
			<Paragraph>
				Your Pure Admin app is ready. Edit this page to get started.
			</Paragraph>
		</Card>
	</div>
	<div class="pa-col-100 pa-col-md-50 pa-col-lg-1-3">
		<Card titleText="Theme">
			<Paragraph>
				Open the settings panel (gear icon) to switch between themes and modes.
			</Paragraph>
		</Card>
	</div>
	<div class="pa-col-100 pa-col-md-50 pa-col-lg-1-3">
		<Card titleText="Components">
			<Paragraph>
				See the <a href="https://pureadmin.io/docs">documentation</a> for available components.
			</Paragraph>
		</Card>
	</div>
</div>
