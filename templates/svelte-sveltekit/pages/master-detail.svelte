<script lang="ts">
	import { Heading, Card } from '@keenmate/svelte-pure-admin';

	// TODO: Replace with real data source
	const items = [
		{ id: 1, name: '__PAGE_LABEL__ 1', description: 'Description for item 1', status: 'Active' },
		{ id: 2, name: '__PAGE_LABEL__ 2', description: 'Description for item 2', status: 'Active' },
		{ id: 3, name: '__PAGE_LABEL__ 3', description: 'Description for item 3', status: 'Inactive' },
		{ id: 4, name: '__PAGE_LABEL__ 4', description: 'Description for item 4', status: 'Active' },
	];

	let selectedId = $state<number | null>(null);
	const selected = $derived(items.find(i => i.id === selectedId));
</script>

<Heading level={1}>__PAGE_LABEL__</Heading>

<div class="pa-detail-view">
	<div class="pa-detail-view__main">
		<Card>
			<table class="pa-table pa-table--striped pa-table--hover">
				<thead>
					<tr>
						<th>Name</th>
						<th>Status</th>
					</tr>
				</thead>
				<tbody>
					{#each items as item}
						<tr
							class:is-selected={selectedId === item.id}
							onclick={() => selectedId = selectedId === item.id ? null : item.id}
							style="cursor: pointer;"
						>
							<td>{item.name}</td>
							<td><span class="pa-badge pa-badge--success">{item.status}</span></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</Card>
	</div>

	<div class="pa-detail-view__panel" class:pa-detail-view__panel--open={selected}>
		{#if selected}
			<div class="pa-detail-panel__content">
				<div class="pa-detail-panel__header">
					<h3 class="pa-detail-panel__title">{selected.name}</h3>
					<button class="pa-detail-panel__close" onclick={() => selectedId = null}>&times;</button>
				</div>
				<div class="pa-detail-panel__body">
					<div class="pa-fields pa-fields--horizontal pa-fields--bordered">
						<div class="pa-field">
							<div class="pa-field__label">ID</div>
							<div class="pa-field__value">{selected.id}</div>
						</div>
						<div class="pa-field">
							<div class="pa-field__label">Description</div>
							<div class="pa-field__value">{selected.description}</div>
						</div>
						<div class="pa-field">
							<div class="pa-field__label">Status</div>
							<div class="pa-field__value"><span class="pa-badge pa-badge--success">{selected.status}</span></div>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
