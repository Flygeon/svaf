<script lang="ts">
	import Icon from '@iconify/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import StyleSelector from './StyleSelector.svelte';

	let {
		value = $bindable(''),
		onselect
	}: {
		value?: string;
		onselect?: (tags: string, name: string) => void;
	} = $props();

	let open = $state(false);

	function handleSelect(tags: string, name: string) {
		onselect?.(tags, name);
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Button variant="outline" class="w-full justify-start gap-2" {...props}>
				<Icon icon="mdi:palette-outline" class="size-4" />
				{#if value}
					<span class="truncate">选择风格</span>
				{:else}
					<span class="text-muted-foreground">选择风格</span>
				{/if}
			</Button>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="sm:max-w-full max-w-full w-screen h-screen max-h-screen m-0 rounded-none p-4 flex flex-col">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2">
				<Icon icon="mdi:palette-outline" class="size-5" />
				选择风格
			</Dialog.Title>
		</Dialog.Header>
		<div class="flex-1 overflow-y-auto">
			<StyleSelector bind:value onselect={handleSelect} showTitle={false} />
		</div>
	</Dialog.Content>
</Dialog.Root>
