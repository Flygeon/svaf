<script lang="ts">
	import Icon from '@iconify/svelte';
	import { siteConfig } from '$lib/config/site';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { forumAuth } from '$lib/forum/stores/auth';
	import { drawEnv, resolveApiRedirect } from '$lib/draw/stores/env';
	import { getImageProxyUrl, getImageUrl } from '$lib/draw/api/client';
	import * as collab from '$lib/draw/api/collaborator';
	import { onMount, onDestroy } from 'svelte';
	import ImageLightbox from '$lib/components/draw/ImageLightbox.svelte';

	let authToken = $state<string | null>(null);
	let currentBaseUrl = $state('');

	// Images tab
	let allImages = $state<{ path: string; mtime: number; user_id: string }[]>([]);
	let imagesLoaded = $state(false);
	let imagesLoading = $state(false);
	let selectedPaths = $state<Set<string>>(new Set());
	let selectMode = $state(false);

	// Column masonry
	let columnCount = $state(4);
	let imgColumns = $state<string[][]>([[], [], [], []]);
	let columnHeights: number[] = [0, 0, 0, 0];

	// Recommendations tab
	let pendingRecs = $state<any[]>([]);
	let recsLoaded = $state(false);
	let selectedRecPaths = $state<Set<string>>(new Set());

	// Nominations tab
	let myNominations = $state<any[]>([]);
	let nominationsLoaded = $state(false);

	// Common
	let loading = $state(false);
	let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let activeTab = $state('images');

	// Lightbox
	let lbOpen = $state(false);
	let lbIndex = $state(0);
	let lbImages = $state<{ src: string; creator_id?: string; cached?: string }[]>([]);

	function showMsg(type: 'success' | 'error', text: string) {
		message = { type, text };
		setTimeout(() => (message = null), 3000);
	}

	function getColumnCount(): number {
		if (typeof window === 'undefined') return 4;
		const w = window.innerWidth;
		if (w >= 1400) return 6;
		if (w >= 1024) return 5;
		if (w >= 768) return 4;
		if (w >= 480) return 3;
		return 2;
	}

	function pushToShortest(path: string) {
		let minIdx = 0;
		for (let i = 1; i < columnHeights.length; i++) {
			if (columnHeights[i] < columnHeights[minIdx]) minIdx = i;
		}
		imgColumns[minIdx] = [...imgColumns[minIdx], path];
		columnHeights[minIdx] += 1;
	}

	function rebuildColumns() {
		columnCount = getColumnCount();
		imgColumns = Array.from({ length: columnCount }, () => []);
		columnHeights = new Array(columnCount).fill(0);
		for (const item of allImages) pushToShortest(item.path);
		imgColumns = [...imgColumns];
	}

	function handleResize() {
		const nu = getColumnCount();
		if (nu === columnCount) return;
		columnCount = nu;
		rebuildColumns();
	}

	function toggleSelect(path: string) {
		const next = new Set(selectedPaths);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		selectedPaths = next;
	}

	function openLb(index: number) {
		lbIndex = index;
		lbImages = allImages.map(i => ({ src: getImageUrl(i.path), creator_id: i.user_id, cached: getImageProxyUrl(i.path) }));
		lbOpen = true;
	}

	async function loadImages() {
		if (imagesLoaded) return;
		imagesLoading = true;
		try {
			const res = await collab.getAllImages();
			allImages = res.items;
			imagesLoaded = true;
			rebuildColumns();
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '加载失败');
		} finally {
			imagesLoading = false;
		}
	}

	async function loadRecommendations() {
		if (recsLoaded) return;
		try {
			const res = await collab.getPendingRecommendations();
			pendingRecs = res.items;
			recsLoaded = true;
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '加载失败');
		}
	}

	async function loadMyNominations() {
		if (nominationsLoaded) return;
		try {
			const res = await collab.getMyNominations();
			myNominations = res.items;
			nominationsLoaded = true;
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '加载失败');
		}
	}

	async function submitNomination() {
		const paths = [...selectedPaths];
		if (!paths.length) return;
		loading = true;
		try {
			await collab.submitNomination(paths);
			showMsg('success', `已提交 ${paths.length} 张图片的精选提名，等待管理员审核`);
			selectedPaths = new Set();
			selectMode = false;
			nominationsLoaded = false;
			loadMyNominations();
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '提交失败');
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		resolveApiRedirect();
	});

	$effect(() => {
		authToken = forumAuth.getToken();
		const u = drawEnv.baseUrl.subscribe((v) => (currentBaseUrl = v));
		return u;
	});

	$effect(() => {
		const tab = activeTab;
		if (!authToken) return;
		switch (tab) {
			case 'images': loadImages(); break;
			case 'recommendations': loadRecommendations(); break;
			case 'nominations': loadMyNominations(); break;
		}
	});

	onMount(() => {
		columnCount = getColumnCount();
		imgColumns = Array.from({ length: columnCount }, () => []);
		window.addEventListener('resize', handleResize, { passive: true });
	});

	onDestroy(() => {
		window.removeEventListener('resize', handleResize);
	});
</script>

<svelte:head>
	<title>协作者 - {siteConfig.title}</title>
</svelte:head>

<div class="w-full max-w-4xl mx-auto px-4 py-6 space-y-4">
	<div class="flex items-center gap-2">
		<Icon icon="mdi:account-group-outline" class="size-6 text-primary" />
		<h1 class="text-xl font-bold">协作者面板</h1>
	</div>

	{#if !authToken}
		<Alert>
			<Icon icon="mdi:account-alert-outline" class="size-4" />
			<AlertDescription class="text-xs">
				请先<a href="/forum/auth/login?redirect=/draw/collaborator/" class="underline font-medium">登录论坛</a>后使用。
			</AlertDescription>
		</Alert>
	{:else}
		{#if message}
			<Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
				<Icon icon={message.type === 'error' ? 'mdi:alert-circle' : 'mdi:check-circle'} class="size-4" />
				<AlertDescription class="text-xs">{message.text}</AlertDescription>
			</Alert>
		{/if}

		<Tabs bind:value={activeTab} class="w-full">
			<TabsList class="w-full">
				<TabsTrigger value="images" class="flex-1">
					<Icon icon="mdi:image-multiple-outline" class="size-4 mr-1" />图片
				</TabsTrigger>
				<TabsTrigger value="recommendations" class="flex-1">
					<Icon icon="mdi:star-plus-outline" class="size-4 mr-1" />自荐
				</TabsTrigger>
				<TabsTrigger value="nominations" class="flex-1">
					<Icon icon="mdi:send-outline" class="size-4 mr-1" />我的提名
				</TabsTrigger>
			</TabsList>

			<!-- Images Tab -->
			<TabsContent value="images" class="mt-4 space-y-4">
				<div class="sticky top-14 z-10 bg-background py-2 flex flex-wrap gap-2 items-center border-b">
					<Button variant={selectMode ? 'default' : 'outline'} size="sm" onclick={() => { selectMode = !selectMode; }}>
						<Icon icon="mdi:select" class="size-4 mr-1" />
						{selectMode ? '取消选择' : '选择'}
					</Button>
					{#if selectedPaths.size > 0}
						<Button variant="default" size="sm" onclick={submitNomination} disabled={loading}>
							<Icon icon="mdi:send" class="size-4 mr-1" />
							提交提名 ({selectedPaths.size})
						</Button>
					{/if}
				</div>

				{#if imagesLoading}
					<div class="text-sm text-muted-foreground py-8 text-center">加载中...</div>
				{:else if allImages.length === 0}
					<div class="text-sm text-muted-foreground py-8 text-center">暂无图片</div>
				{:else}
					<div class="flex gap-2 items-start">
						{#each imgColumns as col, ci (ci)}
							<div class="flex flex-1 flex-col gap-2 min-w-0">
								{#each col as path (ci + '-' + path)}
									{@const img = allImages.find(i => i.path === path)}
									{#if img}
										<div class="relative group rounded-md overflow-hidden border hover:ring-2 hover:ring-primary/50 transition-all cursor-pointer"
											role="button" tabindex="0"
											onclick={() => { if (selectMode) toggleSelect(img.path); else openLb(allImages.indexOf(img)); }}
										>
											<img
												src={getImageProxyUrl(img.path)}
												alt={img.path}
												loading="lazy"
												decoding="async"
												style="aspect-ratio: 1;"
												class="block w-full h-auto bg-muted"
											/>
											{#if selectMode}
												<div class="absolute top-1 left-1 flex items-center justify-center" onclick={(e) => e.stopPropagation()}>
													<input type="checkbox" checked={selectedPaths.has(img.path)} onchange={() => toggleSelect(img.path)} class="size-4 accent-primary" />
												</div>
											{/if}
											<div class="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate pointer-events-none">
												UID {img.user_id || '?'}
											</div>
										</div>
									{/if}
								{/each}
							</div>
						{/each}
					</div>
				{/if}
			</TabsContent>

			<!-- Recommendations Tab -->
			<TabsContent value="recommendations" class="mt-4">
				<Card>
					<CardHeader>
						<CardTitle class="text-base flex items-center gap-2">
							<Icon icon="mdi:star-plus-outline" class="size-4" />
							用户自荐
						</CardTitle>
						<CardDescription>所有用户提交的待审核自荐，你可以选择并提交精选提名</CardDescription>
					</CardHeader>
					<CardContent>
						{#if !recsLoaded}
							<div class="text-sm text-muted-foreground py-4 text-center">加载中...</div>
						{:else if pendingRecs.length === 0}
							<div class="text-sm text-muted-foreground py-4 text-center">无待审核自荐</div>
						{:else}
							<div class="space-y-2">
								{#each pendingRecs as rec}
									<div class="flex items-center gap-3 border rounded-lg p-2 {selectedRecPaths.has(rec.image_path) ? 'ring-2 ring-primary' : ''}">
										<img src={getImageProxyUrl(rec.image_path)} alt="" class="size-16 object-cover rounded border shrink-0" />
										<div class="flex-1 min-w-0 text-xs space-y-0.5">
											<div class="truncate font-mono">{rec.image_path}</div>
											<div class="text-muted-foreground">UID {rec.user_id} | {new Date(rec.timestamp * 1000).toLocaleString()}</div>
										</div>
										<input
											type="checkbox"
											checked={selectedRecPaths.has(rec.image_path)}
											onchange={() => {
												const s = new Set(selectedRecPaths);
												if (s.has(rec.image_path)) s.delete(rec.image_path); else s.add(rec.image_path);
												selectedRecPaths = s;
											}}
											class="size-4 accent-primary shrink-0"
										/>
									</div>
								{/each}
							</div>
							{#if selectedRecPaths.size > 0}
								<div class="mt-3">
									<Button size="sm" onclick={async () => {
										selectedPaths = new Set(selectedRecPaths);
										selectedRecPaths = new Set();
										await submitNomination();
									}} disabled={loading}>
										<Icon icon="mdi:send" class="size-4 mr-1" />
										提交提名 ({selectedRecPaths.size})
									</Button>
								</div>
							{/if}
						{/if}
					</CardContent>
				</Card>
			</TabsContent>

			<!-- My Nominations Tab -->
			<TabsContent value="nominations" class="mt-4">
				<Card>
					<CardHeader>
						<CardTitle class="text-base flex items-center gap-2">
							<Icon icon="mdi:send-outline" class="size-4" />
							我的提名
						</CardTitle>
					</CardHeader>
					<CardContent>
						{#if !nominationsLoaded}
							<div class="text-sm text-muted-foreground py-4 text-center">加载中...</div>
						{:else if myNominations.length === 0}
							<div class="text-sm text-muted-foreground py-4 text-center">暂无提名记录</div>
						{:else}
							<div class="space-y-2">
								{#each myNominations as nom}
									<div class="border rounded-lg p-3 space-y-1">
										<div class="flex items-center gap-2 text-xs">
											<Badge variant={nom.status === 'approved' ? 'default' : nom.status === 'rejected' ? 'destructive' : 'secondary'}>
												{nom.status === 'approved' ? '已批准' : nom.status === 'rejected' ? '已拒绝' : '待审核'}
											</Badge>
											<span class="text-muted-foreground">{new Date(nom.submitted_at * 1000).toLocaleString()}</span>
											<span class="text-muted-foreground">{nom.image_paths.length} 张</span>
										</div>
										<div class="flex flex-wrap gap-1">
											{#each nom.image_paths as p}
												<span class="text-[10px] bg-muted px-1 py-0.5 rounded truncate max-w-[150px]">{p}</span>
											{/each}
										</div>
										{#if nom.admin_reason}
											<div class="text-xs text-muted-foreground">管理员: {nom.admin_reason}</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</CardContent>
				</Card>
			</TabsContent>
		</Tabs>

		<ImageLightbox
			open={lbOpen}
			images={lbImages}
			index={lbIndex}
			onclose={() => (lbOpen = false)}
		/>
	{/if}
</div>
