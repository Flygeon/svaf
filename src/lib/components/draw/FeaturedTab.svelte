<script lang="ts">
	import Icon from '@iconify/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import * as Dialog from '$lib/components/ui/dialog';
	import { fetchFeatured, getImageUrl, getImageProxyUrl } from '$lib/draw/api/client';
	import type { DrawOutputItem } from '$lib/draw/types';

	const tip = '精选图片由管理员挑选，展示社区优质作品。';

	let items = $state<DrawOutputItem[]>([]);
	let loading = $state(true);

	let lightboxOpen = $state(false);
	let lightboxIndex = $state(0);

	$effect(() => {
		loadFeatured();
	});

	async function loadFeatured() {
		loading = true;
		try {
			const res = await fetchFeatured();
			items = res.items;
		} catch {
			items = [];
		} finally {
			loading = false;
		}
	}

	function openLightbox(index: number) {
		lightboxIndex = index;
		lightboxOpen = true;
	}

	function prev() {
		lightboxIndex = (lightboxIndex - 1 + items.length) % items.length;
	}

	function next() {
		lightboxIndex = (lightboxIndex + 1) % items.length;
	}

	const currentItem = $derived(items[lightboxIndex]);
</script>

<div class="space-y-3">
	<div class="flex items-center justify-between">
		<h3 class="text-sm font-medium flex items-center gap-1.5">
			<Icon icon="mdi:star-outline" class="size-4" />
			精选
			<span class="text-xs text-muted-foreground">({items.length})</span>
		</h3>
		<Button variant="ghost" size="sm" onclick={loadFeatured} disabled={loading}>
			<Icon icon="mdi:refresh" class="size-4" />
		</Button>
	</div>

	{#if tip}
		<Alert>
			<Icon icon="mdi:lightbulb-outline" class="size-4" />
			<AlertDescription class="text-xs">{tip}</AlertDescription>
		</Alert>
	{/if}

	{#if loading}
		<div class="text-xs text-muted-foreground py-8 text-center">加载中...</div>
	{:else if items.length === 0}
		<div class="text-xs text-muted-foreground py-8 text-center">暂无精选图片</div>
	{:else}
		<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
			{#each items as item, i}
				<button
					class="aspect-square rounded-lg overflow-hidden border hover:ring-2 hover:ring-primary/50 transition-all"
					onclick={() => openLightbox(i)}
				>
					<img
						src={getImageProxyUrl(item.path)}
						alt={item.path}
						class="w-full h-full object-cover"
						loading="lazy"
					/>
				</button>
			{/each}
		</div>
	{/if}
</div>

<Dialog.Root bind:open={lightboxOpen}>
	<Dialog.Content class="max-w-3xl p-0 overflow-hidden">
		{#if currentItem}
			<div class="relative">
				<img
					src={getImageUrl(currentItem.path)}
					alt={currentItem.path}
					class="w-full max-h-[70vh] object-contain"
				/>
				<div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-3">
					<div class="flex items-center justify-between text-white text-xs">
						<span class="truncate">{currentItem.path}</span>
						<a
							href={getImageUrl(currentItem.path, true)}
							download
							class="p-1.5 rounded bg-white/20 hover:bg-white/30"
						>
							<Icon icon="mdi:download" class="size-4" />
						</a>
					</div>
				</div>
			</div>
			{#if items.length > 1}
				<div class="flex items-center justify-between px-3 py-2 border-t">
					<Button variant="ghost" size="sm" onclick={prev}>
						<Icon icon="mdi:chevron-left" class="size-5" />
					</Button>
					<span class="text-xs text-muted-foreground">{lightboxIndex + 1} / {items.length}</span>
					<Button variant="ghost" size="sm" onclick={next}>
						<Icon icon="mdi:chevron-right" class="size-5" />
					</Button>
				</div>
			{/if}
		{/if}
	</Dialog.Content>
</Dialog.Root>
