<script lang="ts">
	import Icon from '@iconify/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { fetchFeatured, getImageUrl, getImageProxyUrl } from '$lib/draw/api/client';
	import ImageLightbox from '$lib/components/draw/ImageLightbox.svelte';
	let masonry: any = null;
	import type { DrawOutputItem } from '$lib/draw/types';

	const tip = '精选图片由管理员挑选，展示社区优质作品。仅收录SFW';

	let {
		onFork
	}: {
		onFork?: (path: string) => void;
	} = $props();

	let items = $state<DrawOutputItem[]>([]);
	let loading = $state(true);
	let displayLimit = $state(5);
	let hasMore = $state(false);
	let masonryEl: HTMLDivElement | undefined;

	let lbOpen = $state(false);
	let lbIndex = $state(0);
	let lbImages = $derived(items.map((it) => ({ src: getImageUrl(it.path), creator_id: it.creator_id || '', cached: getImageProxyUrl(it.path) })));

	function openLightbox(i: number) {
		lbIndex = i;
		lbOpen = true;
	}

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

	$effect(() => {
		hasMore = displayLimit < items.length;
		if (masonryEl && items.length > 0) {
			setTimeout(() => {
				import('masonry-layout').then(m => {
					if (masonry) masonry.destroy();
					masonry = new m.default(masonryEl!, {
						itemSelector: '.featured-item',
						columnWidth: '.featured-sizer',
						percentPosition: true,
					});
					const imgs = masonryEl.querySelectorAll("img");
					let loaded = 0;
					const total = imgs.length;
					if (total === 0) return;
					for (const img of imgs) {
						if (img.complete) { loaded++; if (loaded === total) masonry.layout(); }
						else img.addEventListener("load", () => { loaded++; if (loaded === total) masonry.layout(); });
					}
				});
			}, 50);
		}
	});

	function showMoreFeatured() {
		displayLimit = Math.min(displayLimit + 10, items.length);
		setTimeout(() => {
			if (masonryEl) {
				import('masonry-layout').then(m => {
					if (masonry) masonry.destroy();
					masonry = new m.default(masonryEl!, {
						itemSelector: '.featured-item',
						columnWidth: '.featured-sizer',
						percentPosition: true,
					});
					const imgs = masonryEl.querySelectorAll("img");
					let loaded = 0;
					const total = imgs.length;
					if (total === 0) return;
					for (const img of imgs) {
						if (img.complete) { loaded++; if (loaded === total) masonry.layout(); }
						else img.addEventListener("load", () => { loaded++; if (loaded === total) masonry.layout(); });
					}
				});
			}
		}, 100);
	}
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

	<Alert>
		<AlertDescription class="text-xs">
			{tip}<br />
			<b>你可以前往"我的"页面自荐自己的图片，管理员审核通过后自动加入精选。</b>
		</AlertDescription>
	</Alert>

	{#if loading}
		<div class="text-xs text-muted-foreground py-8 text-center">加载中...</div>
	{:else if items.length === 0}
		<div class="text-xs text-muted-foreground py-8 text-center">暂无精选图片</div>
	{:else}
		<div bind:this={masonryEl} class="relative w-full">
			<div class="featured-sizer w-1/2 md:w-1/3 lg:w-1/4 xl:w-1/5"></div>
			{#each items.slice(0, displayLimit) as item, i (item.path)}
				<div class="featured-item w-1/2 md:w-1/3 lg:w-1/4 xl:w-1/5 p-1">
					<div class="relative group">
						<button
							type="button"
							class="w-full rounded-lg overflow-hidden border hover:ring-2 hover:ring-primary/50 transition-all cursor-pointer"
							onclick={() => openLightbox(items.indexOf(item))}
						>
							<img
								src={getImageProxyUrl(item.path)}
								alt={item.path}
								loading="lazy"
								decoding="async"
								class="block w-full h-auto bg-muted"
							/>
						</button>
						<div class="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] px-1 py-0.5 truncate rounded-b-lg pointer-events-none">
							{item.creator_id || '?'}
						</div>
					</div>
				</div>
			{/each}
		</div>
		{#if hasMore}
			<div class="flex justify-center pt-2">
				<Button variant="outline" size="sm" onclick={showMoreFeatured}>
					加载更多（{items.length - displayLimit} 张）
				</Button>
			</div>
		{/if}
	{/if}
</div>

<ImageLightbox
	open={lbOpen}
	images={lbImages}
	index={lbIndex}
	onclose={() => (lbOpen = false)}
	onfork={onFork}
/>
