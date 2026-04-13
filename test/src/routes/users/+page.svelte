<script lang="ts">
	import {
		Card,
		Grid,
		Column,
		Button,
		ButtonGroup,
		Badge,
		Table,
		TableResponsive,
		Paragraph,
		Heading,
		Input,
		FormGroup
	} from '@keenmate/svelte-pure-admin';

	const users = [
		{ id: 1, name: 'John Doe', email: 'john.doe@example.com', role: 'Admin', status: 'Active', joined: '2024-01-15' },
		{ id: 2, name: 'Jane Smith', email: 'jane.smith@example.com', role: 'Editor', status: 'Active', joined: '2024-02-20' },
		{ id: 3, name: 'Bob Johnson', email: 'bob.j@example.com', role: 'Viewer', status: 'Inactive', joined: '2024-03-10' },
		{ id: 4, name: 'Alice Williams', email: 'alice.w@example.com', role: 'Admin', status: 'Active', joined: '2024-04-05' },
		{ id: 5, name: 'Charlie Brown', email: 'charlie.b@example.com', role: 'Editor', status: 'Active', joined: '2024-05-12' },
		{ id: 6, name: 'Diana Prince', email: 'diana.p@example.com', role: 'Viewer', status: 'Active', joined: '2024-06-18' },
		{ id: 7, name: 'Eve Davis', email: 'eve.d@example.com', role: 'Editor', status: 'Inactive', joined: '2024-07-22' },
		{ id: 8, name: 'Frank Miller', email: 'frank.m@example.com', role: 'Viewer', status: 'Active', joined: '2024-08-30' }
	];

	const statusVariant = (status: string) => status === 'Active' ? 'success' : 'warning';
	const roleVariant = (role: string) => role === 'Admin' ? 'primary' : role === 'Editor' ? 'info' : 'secondary';
</script>

<svelte:head>
	<title>Users - My App</title>
</svelte:head>

<Paragraph mode="muted">Manage your team members and their permissions.</Paragraph>

<!-- User Stats -->
<Grid>
	<Column size="100" md="1-3">
		<Card>
			<div class="text-center">
				<Heading level={2}>{users.length}</Heading>
				<Paragraph mode="muted">Total Users</Paragraph>
			</div>
		</Card>
	</Column>
	<Column size="100" md="1-3">
		<Card>
			<div class="text-center">
				<Heading level={2}>{users.filter(u => u.status === 'Active').length}</Heading>
				<Paragraph mode="muted">Active</Paragraph>
			</div>
		</Card>
	</Column>
	<Column size="100" md="1-3">
		<Card>
			<div class="text-center">
				<Heading level={2}>{users.filter(u => u.role === 'Admin').length}</Heading>
				<Paragraph mode="muted">Admins</Paragraph>
			</div>
		</Card>
	</Column>
</Grid>

<!-- Users Table -->
<Card titleText="All Users">
	{#snippet headerActions()}
		<Button variant="primary" size="sm">
			{#snippet icon()}<i class="fas fa-user-plus"></i>{/snippet}
			Add User
		</Button>
	{/snippet}

	<TableResponsive>
		<Table isCompact isHover isStriped>
			<thead>
				<tr>
					<th>Name</th>
					<th>Email</th>
					<th>Role</th>
					<th>Status</th>
					<th>Joined</th>
					<th>Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each users as user}
					<tr>
						<td><strong>{user.name}</strong></td>
						<td>{user.email}</td>
						<td><Badge variant={roleVariant(user.role)}>{user.role}</Badge></td>
						<td><Badge variant={statusVariant(user.status)}>{user.status}</Badge></td>
						<td>{user.joined}</td>
						<td>
							<ButtonGroup>
								<Button variant="secondary" size="xs" isIconOnly titleText="Edit">
									<i class="fas fa-pen"></i>
								</Button>
								<Button variant="danger" size="xs" isIconOnly titleText="Delete">
									<i class="fas fa-trash"></i>
								</Button>
							</ButtonGroup>
						</td>
					</tr>
				{/each}
			</tbody>
		</Table>
	</TableResponsive>
</Card>
