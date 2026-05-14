<script lang="ts">
	import Icon from '@iconify/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import StyleSelector from './StyleSelector.svelte';

	let {
		value = $bindable(''),
		name = $bindable(''),
		onselect
	}: {
		value?: string;
		name?: string;
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
					<span class="truncate">{name || value}</span>
				{:else}
					<span class="text-muted-foreground">选择风格</span>
				{/if}
			</Button>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="sm:max-w-full max-w-full w-screen h-screen max-h-screen m-0 rounded-none p-4 !grid-rows-[auto_1fr]">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2">
				<Icon icon="mdi:palette-outline" class="size-5" />
				选择风格
			</Dialog.Title>
		</Dialog.Header>
			<Dialog.Close>
				{#snippet child({ props })}
					<Button variant="ghost" size="icon" class="absolute top-4 right-4" {...props}>
						<Icon icon="mdi:close" class="size-5" />
					</Button>
				{/snippet}
			</Dialog.Close>
		<div class="overflow-y-auto min-h-0">
			<StyleSelector bind:value onselect={handleSelect} showTitle={false} constrainHeight={false} />
		</div>
	</Dialog.Content>
</Dialog.Root>
