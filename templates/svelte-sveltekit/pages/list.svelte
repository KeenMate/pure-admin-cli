<script lang="ts">
	import { Heading, Card } from '@keenmate/svelte-pure-admin';

	// TODO: Replace with real data source
	const items = [
		{ id: 1, name: 'Item 1', status: 'Active' },
		{ id: 2, name: 'Item 2', status: 'Active' },
		{ id: 3, name: 'Item 3', status: 'Inactive' },
	];
</script>

<Heading level={1}>__PAGE_LABEL__</Heading>

<Card>
	<table class="pa-table pa-table--striped pa-table--hover">
		<thead>
			<tr>
				<th>ID</th>
				<th>Name</th>
				<th>Status</th>
				<th>Actions</th>
			</tr>
		</thead>
		<tbody>
			{#each items as item}
				<tr>
					<td>{item.id}</td>
					<td>{item.name}</td>
					<td><span class="pa-badge pa-badge--success">{item.status}</span></td>
					<td>
						<a href="/__PAGE_ENTITY__/{item.id}" class="pa-btn pa-btn--secondary pa-btn--xs">View</a>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</Card>
