<script lang="ts">
	import Icon from '@iconify/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import WorkflowSelector from './WorkflowSelector.svelte';
	import type { DrawWorkflow } from '$lib/draw/types';

	let {
		value = $bindable(''),
		onselect,
		onpromptload,
		subdir = 'WAI'
	}: {
		value?: string;
		onselect?: (wf: DrawWorkflow) => void;
		onpromptload?: (positive: string, negative: string) => void;
		subdir?: string;
	} = $props();

	let open = $state(false);

	function handleSelect(wf: DrawWorkflow) {
		onselect?.(wf);
		open = false;
	}

	function handlePromptLoad(positive: string, negative: string) {
		onpromptload?.(positive, negative);
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Button variant="outline" class="w-full justify-start gap-2" {...props}>
				<Icon icon="mdi:cog-outline" class="size-4" />
				{#if value}
					<span class="truncate">{value.split('/').pop()?.replace('.json', '')}</span>
				{:else}
					<span class="text-muted-foreground">选择工作流</span>
				{/if}
			</Button>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="sm:max-w-full max-w-full w-screen h-screen max-h-screen m-0 rounded-none p-4 !grid-rows-[auto_1fr]">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2">
				<Icon icon="mdi:cog-outline" class="size-5" />
				选择工作流
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
			<WorkflowSelector {subdir} bind:value onselect={handleSelect} onpromptload={handlePromptLoad} showTitle={false} constrainHeight={false} />
		</div>
	</Dialog.Content>
</Dialog.Root>
