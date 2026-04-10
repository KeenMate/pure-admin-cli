<script lang="ts">
	import { Heading, Card, Paragraph } from '@keenmate/svelte-pure-admin';
	import { page } from '$app/stores';

	const id = $derived($page.params.id);
</script>

<Heading level={1}>__PAGE_LABEL__ #{id}</Heading>

<Card titleText="Details">
	<div class="pa-fields pa-fields--horizontal pa-fields--bordered">
		<div class="pa-field">
			<div class="pa-field__label">ID</div>
			<div class="pa-field__value">{id}</div>
		</div>
		<div class="pa-field">
			<div class="pa-field__label">Name</div>
			<div class="pa-field__value">Item {id}</div>
		</div>
		<div class="pa-field">
			<div class="pa-field__label">Status</div>
			<div class="pa-field__value"><span class="pa-badge pa-badge--success">Active</span></div>
		</div>
	</div>
</Card>
