<script lang="ts">
	import { Heading, Card } from '@keenmate/svelte-pure-admin';

	let formData = $state({
		name: '',
		description: '',
		status: 'active'
	});

	function handleSubmit() {
		console.log('Submit:', formData);
		alert('Form submitted (demo)');
	}
</script>

<Heading level={1}>{{PAGE_LABEL}}</Heading>

<Card titleText="{{PAGE_LABEL}}">
	<form onsubmit|preventDefault={handleSubmit}>
		<div class="pa-form-group">
			<label class="pa-form-label" for="name">Name</label>
			<input type="text" class="pa-input" id="name" bind:value={formData.name} placeholder="Enter name..." />
		</div>

		<div class="pa-form-group">
			<label class="pa-form-label" for="description">Description</label>
			<textarea class="pa-textarea" id="description" bind:value={formData.description} placeholder="Enter description..." rows="3"></textarea>
		</div>

		<div class="pa-form-group">
			<label class="pa-form-label" for="status">Status</label>
			<select class="pa-select" id="status" bind:value={formData.status}>
				<option value="active">Active</option>
				<option value="inactive">Inactive</option>
				<option value="draft">Draft</option>
			</select>
		</div>

		<div class="pa-form-group" style="display: flex; gap: 0.8rem; justify-content: flex-end;">
			<button type="button" class="pa-btn pa-btn--secondary">Cancel</button>
			<button type="submit" class="pa-btn pa-btn--primary">Save</button>
		</div>
	</form>
</Card>
