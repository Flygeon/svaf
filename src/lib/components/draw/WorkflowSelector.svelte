<script lang="ts">
	import Icon from '@iconify/svelte';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { fetchWorkflows, fetchWorkflowDetail, getThumbnailUrl } from '$lib/draw/api/client';
	import type { DrawWorkflow } from '$lib/draw/types';

	let {
		value = $bindable(''),
		onselect,
		onpromptload,
		showTitle = true
	}: {
		value?: string;
		onselect?: (wf: DrawWorkflow) => void;
		onpromptload?: (positive: string, negative: string) => void;
		showTitle?: boolean;
	} = $props();

	let workflows = $state<DrawWorkflow[]>([]);
	let categoryOrder = $state<string[]>([]);
	let search = $state('');
	let showSearch = $state(false);
	let loading = $state(true);
	let error = $state('');
	let loadingPath = $state('');
	let abortCtrl: AbortController | null = null;

	const filtered = $derived(() => {
		if (!search.trim()) return workflows;
		const q = search.toLowerCase();
		return workflows.filter(
			(w) => w.name.toLowerCase().includes(q) || w.category.toLowerCase().includes(q)
		);
	});

	const grouped = $derived(() => {
		const list = filtered();
		const order = categoryOrder.length ? categoryOrder : [...new Set(list.map((w) => w.category))];
		const groups: { category: string; items: DrawWorkflow[] }[] = [];
		const seen = new Set<string>();
		for (const cat of order) {
			const items = list.filter((w) => w.category === cat);
			if (items.length) {
				groups.push({ category: cat, items });
				seen.add(cat);
			}
		}
		// remaining categories not in order
		const remaining = list.filter((w) => !seen.has(w.category));
		if (remaining.length) {
			const cats = [...new Set(remaining.map((w) => w.category))];
			for (const cat of cats) {
				groups.push({ category: cat, items: remaining.filter((w) => w.category === cat) });
			}
		}
		return groups;
	});

	$effect(() => {
		loadWorkflows();
	});

	async function loadWorkflows() {
		loading = true;
		error = '';
		try {
			const res = await fetchWorkflows();
			workflows = res.workflows;
			categoryOrder = res.category_order;
		} catch (e) {
			error = e instanceof Error ? e.message : '加载工作流失败';
		} finally {
			loading = false;
		}
	}

	function select(wf: DrawWorkflow) {
		value = wf.path;
		onselect?.(wf);

		abortCtrl?.abort();
		abortCtrl = new AbortController();
		loadingPath = wf.path;

		fetchWorkflowDetail(wf.path, abortCtrl.signal)
			.then((detail) => {
				if (!abortCtrl?.signal.aborted) {
					onpromptload?.(detail.builtin_prompt, detail.builtin_negative_prompt);
					loadingPath = '';
				}
			})
			.catch((e) => {
				if (e?.name === 'AbortError') return;
				if (!abortCtrl?.signal.aborted) {
					loadingPath = '';
				}
			});
	}
</script>

<div class="space-y-2">
	{#if showTitle}
		<div class="flex items-center justify-between">
			<h3 class="text-sm font-medium flex items-center gap-1.5">
				<Icon icon="mdi:cog-outline" class="size-4" />
				工作流
			</h3>
			<div class="flex items-center gap-1">
				<button
					class="p-1 rounded hover:bg-muted transition-colors"
					onclick={() => (showSearch = !showSearch)}
					title="搜索"
				>
					<Icon icon="mdi:magnify" class="size-4" />
				</button>
				<button
					class="p-1 rounded hover:bg-muted transition-colors"
					onclick={loadWorkflows}
					title="刷新"
				>
					<Icon icon="mdi:refresh" class="size-4" />
				</button>
			</div>
		</div>
	{/if}

	{#if showSearch}
		<Input
			bind:value={search}
			placeholder="搜索工作流..."
			class="h-8 text-xs"
		/>
	{/if}

	{#if loading}
		<div class="text-xs text-muted-foreground py-4 text-center">加载中...</div>
	{:else if error}
		<div class="text-xs text-destructive py-4 text-center">{error}</div>
	{:else}
		<div class="max-h-64 overflow-y-auto space-y-2 pr-1">
			{#each grouped() as group}
				<div>
					<div class="text-xs text-muted-foreground font-medium mb-1 px-0.5">{group.category}</div>
					<div class="flex flex-wrap gap-1.5">
						{#each group.items as wf}
							<button
								class="inline-flex items-center gap-1.5 p-1.5 rounded-md border text-left text-xs transition-all hover:bg-accent {value === wf.path ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border'}"
								onclick={() => select(wf)}
								disabled={loadingPath === wf.path}
							>
								{#if wf.thumbnail}
									<img
										src={getThumbnailUrl(wf.path)}
										alt=""
										class="size-8 rounded object-cover shrink-0"
										loading="lazy"
									/>
								{:else}
									<div class="size-8 rounded bg-muted flex items-center justify-center shrink-0">
										<Icon icon="mdi:image-off-outline" class="size-4 text-muted-foreground" />
									</div>
								{/if}
								{#if loadingPath === wf.path}
									<Icon icon="mdi:loading" class="size-4 shrink-0 animate-spin" />
								{/if}
								<span class="truncate">{wf.path.replace('.json', '')}</span>
							</button>
						{/each}
					</div>
				</div>
			{/each}
			{#if grouped().length === 0}
				<div class="text-xs text-muted-foreground py-4 text-center">无匹配工作流</div>
			{/if}
		</div>
	{/if}
</div>
