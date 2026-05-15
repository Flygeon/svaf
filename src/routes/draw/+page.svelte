<script lang="ts">
	import Icon from '@iconify/svelte';
	import { siteConfig } from '$lib/config/site';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { Badge } from '$lib/components/ui/badge';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { forumAuth } from '$lib/forum/stores/auth';
	import { drawEnv, apiError, apiStatus, resolveApiRedirect } from '$lib/draw/stores/env';
	import { connectRunWs, connectStatusWs } from '$lib/draw/api/ws';
	import { fetchMyImages, getImageUrl, getImageProxyUrl, forkOutputImage, recommendImage, deleteMyImage, fetchMyRecommendations } from '$lib/draw/api/client';
	import { consumeFork } from '$lib/draw/stores/fork';
	import type { WsRunMessage, WsStatusEvent, WsRunPayload, DrawWorkflow, DrawRecommendation } from '$lib/draw/types';

	import PageViews from '$lib/components/PageViews.svelte';

	import EnvironmentSwitcher from '$lib/components/draw/EnvironmentSwitcher.svelte';
	import WorkflowDialog from '$lib/components/draw/WorkflowDialog.svelte';
	import StyleDialog from '$lib/components/draw/StyleDialog.svelte';
	import PromptForm from '$lib/components/draw/PromptForm.svelte';
	import ProgressPanel from '$lib/components/draw/ProgressPanel.svelte';
	import FeaturedTab from '$lib/components/draw/FeaturedTab.svelte';
	import Img2imgTab from '$lib/components/draw/Img2imgTab.svelte';
import QwenTab from '$lib/components/draw/QwenTab.svelte';
		import ImageLightbox from '$lib/components/draw/ImageLightbox.svelte';

	// State
	let currentBaseUrl = $state('');
	let onlineCount = $state(0);
	let globalBusy = $state(false);
	let isGenerating = $state(false);
	let otherNode = $state('');
	let otherValue = $state(0);
	let otherMax = $state(0);
	let otherStage = $state('');
	let authToken = $state<string | null>(null);
	let isLoggedIn = $derived(!!authToken);

	// Form state
	let workflowPath = $state('');
	let workflowName = $state('');
	let styleTags = $state('');
	let styleName = $state('');
	let directPrompt = $state('');
	let negativePrompt = $state('');
	let nlPrompt = $state('');
	let rewrite = $state(true);
	let width = $state(0);
	let height = $state(0);
	let inlineWorkflow = $state<object | null>(null);
	let safetyRating = $state('general');
	let forkSeed = $state<number | undefined>(undefined);
	let sameSeed = $state(false);

	// Restore form state from localStorage
	if (typeof localStorage !== 'undefined') {
		try {
			const saved = localStorage.getItem('draw-form');
			if (saved) {
				const p = JSON.parse(saved);
				if (p.workflowPath) workflowPath = p.workflowPath;
				if (p.workflowName) workflowName = p.workflowName;
				if (p.styleTags) styleTags = p.styleTags;
				if (p.styleName) styleName = p.styleName;
				if (p.directPrompt) directPrompt = p.directPrompt;
				if (p.negativePrompt) negativePrompt = p.negativePrompt;
				if (p.nlPrompt) nlPrompt = p.nlPrompt;
				if (p.rewrite !== undefined) rewrite = p.rewrite;
				if (p.width) width = p.width;
				if (p.height) height = p.height;
				if (p.safetyRating) safetyRating = p.safetyRating;
			}
		} catch {}
	}

	// Progress state
	let progressMessages = $state<WsRunMessage[]>([]);
	let showProgress = $state(false);
	let resultImages = $state<{ url: string; filename: string }[]>([]);
	let genCost = $state(0);

	// My images state
	let myImages = $state<{ path: string; mtime: number }[]>([]);
	let myImagesTotal = $state(0);
	let myImagesLoading = $state(false);
	let myImagesLoaded = $state(false);

	// My images lightbox
	let myLbOpen = $state(false);
	let myLbIndex = $state(0);
	let myLbImages = $derived(myImages.map((it) => ({ src: getImageUrl(it.path), creator_id: '' })));

	// Recommendations
	let myRecommendations = $state<DrawRecommendation[]>([]);
	let myRecsLoaded = $state(false);
	let selectMode = $state(false);
	let selectedPaths = $state(new Set<string>());

	// WebSocket refs
	let statusConn: ReturnType<typeof connectStatusWs> | null = null;
	let runWs: WebSocket | null = null;

	// API error state
	let apiErrorMessage = $state("");
	let apiStatusValue = $state("checking");

	$effect(() => {
		const unsub = apiError.subscribe((v) => {
			apiErrorMessage = v || '';
		});
		return unsub;
	});

	$effect(() => {
		const unsub = apiStatus.subscribe((v) => (apiStatusValue = v));
		return unsub;
	});

	// 页面加载时探测 API 状态
	$effect(() => {
		resolveApiRedirect();
	});

	// Tab state
	let activeTab = $state('generate');
	let genSubTab = $state('txt2img');
	let img2imgSubTab = $state('flux2');

	// Persist form state to localStorage
	$effect(() => {
		if (typeof localStorage === 'undefined') return;
		const state = { workflowPath, workflowName, styleTags, styleName, directPrompt, negativePrompt, nlPrompt, rewrite, width, height, safetyRating };
		localStorage.setItem('draw-form', JSON.stringify(state));
	});

	$effect(() => {
		if (activeTab === 'mine' && isLoggedIn) {
			if (!myImagesLoaded) loadMyImages();
			if (!myRecsLoaded) loadMyRecommendations();
		}
	});

	$effect(() => {
		const u1 = drawEnv.baseUrl.subscribe((v) => (currentBaseUrl = v));
		authToken = forumAuth.getToken();

		// 检查是否有待消费的 fork 数据（从其他页面跳转过来）
		const fork = consumeFork();
		if (fork) {
			inlineWorkflow = fork.workflow;
			if (fork.builtin_prompt) directPrompt = fork.builtin_prompt;
			if (fork.builtin_negative_prompt) negativePrompt = fork.builtin_negative_prompt;
			if (fork.default_width) width = fork.default_width;
			if (fork.default_height) height = fork.default_height;
			forkSeed = fork.seed;
			workflowPath = 'fork';
			workflowName = '(fork)';
			if (fork.style_tags) {
				styleTags = fork.style_tags;
				styleName = fork.style_tags;
			} else {
				styleTags = '';
				styleName = '';
			}
			activeTab = 'generate';
		}

		// Connect status WebSocket
		statusConn = connectStatusWs(currentBaseUrl, handleStatusMessage, undefined, () => { globalBusy = false; });

		return () => {
			u1();
			statusConn?.close();
			runWs?.close();
		};
	});

	// Reconnect status WS when base URL changes
	$effect(() => {
		const url = currentBaseUrl;
		if (!url) return;
		statusConn?.close();
		statusConn = connectStatusWs(url, handleStatusMessage, undefined, () => { globalBusy = false; });
	});

	function handleStatusMessage(msg: WsStatusEvent) {
		switch (msg.type) {
			case 'status':
				onlineCount = msg.online;
				globalBusy = msg.busy;
				otherNode = (msg as any).node || '';
				otherValue = (msg as any).value ?? 0;
				otherMax = (msg as any).max ?? 0;
				otherStage = (msg as any).stage || '';
				break;
			case 'online':
				onlineCount = msg.count;
				break;
		}
	}

	function handleWorkflowSelect(wf: DrawWorkflow) {
		workflowPath = wf.path;
		workflowName = wf.path.split('/').pop()?.replace('.json', '') || '';
		inlineWorkflow = null;
		forkSeed = undefined;
		sameSeed = false;
	}

	function handleStyleSelect(tags: string, name: string) {
		styleTags = tags;
		styleName = name;
	}

	function handlePromptLoad(positive: string, negative: string) {
		directPrompt = positive;
		negativePrompt = negative;
	}

	async function handleFork(path: string) {
		try {
			const res = await forkOutputImage(path);
			inlineWorkflow = res.workflow;
			if (res.builtin_prompt) directPrompt = res.builtin_prompt;
			if (res.builtin_negative_prompt) negativePrompt = res.builtin_negative_prompt;
			if (res.default_width) width = res.default_width;
			if (res.default_height) height = res.default_height;
			forkSeed = res.seed;
			workflowPath = 'fork';
			workflowName = '(fork)';
			if (res.style_tags) {
				styleTags = res.style_tags;
				styleName = res.style_tags;
			} else {
				styleTags = '';
				styleName = '';
			}
			activeTab = 'generate';
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Fork 失败');
		}
	}

	function startGeneration() {
		if (isGenerating || globalBusy) return;
		if (!authToken) {
			alert('请先在论坛登录');
			return;
		}
		if (!workflowPath && !inlineWorkflow) {
			alert('请选择工作流');
			return;
		}

		isGenerating = true;
		progressMessages = [];
		resultImages = [];
		genCost = 0;
		showProgress = true;

		const ratingTag = `rating:${safetyRating}`;
		const finalDirectPrompt = directPrompt
			? `${directPrompt}, ${ratingTag}`
			: ratingTag;

		const payload: WsRunPayload = {
			token: authToken,
			workflow_path: workflowPath,
			inline_workflow: inlineWorkflow || undefined,
			direct_prompt: finalDirectPrompt,
			nl_prompt: nlPrompt || undefined,
			rewrite,
			width: width || undefined,
			height: height || undefined,
			style_tags: styleTags || undefined,
			negative_prompt: negativePrompt || undefined,
			seed: sameSeed ? forkSeed : undefined
		};

		runWs = connectRunWs(
			currentBaseUrl,
			payload,
			handleRunMessage,
			undefined,
			() => {
				isGenerating = false;
			},
			() => {
				isGenerating = false;
			}
		);
	}

	function handleRunMessage(msg: WsRunMessage) {
		progressMessages = [...progressMessages, msg];

		if (msg.type === 'image') {
			resultImages = [...resultImages, { url: msg.url, filename: msg.filename }];
		}
		if (msg.type === 'error') {
			isGenerating = false;
		}
		if (msg.type === 'cost') {
			genCost = msg.cost;
		}
		if (msg.type === 'done') {
			isGenerating = false;
		}
	}

	async function loadMyImages() {
		if (myImagesLoaded) return;
		myImagesLoading = true;
		try {
			const res = await fetchMyImages();
			myImages = res.items;
			myImagesTotal = res.total;
			myImagesLoaded = true;
		} catch {
			myImages = [];
		} finally {
			myImagesLoading = false;
		}
	}

	async function loadMyRecommendations() {
		try {
			const res = await fetchMyRecommendations();
			myRecommendations = res.items;
			myRecsLoaded = true;
		} catch {
			myRecommendations = [];
		}
	}

	function toggleSelect(path: string) {
		const s = new Set(selectedPaths);
		if (s.has(path)) s.delete(path);
		else s.add(path);
		selectedPaths = s;
	}

	async function handleBatchDelete() {
		if (selectedPaths.size === 0) return;
		if (!confirm(`确定删除选中的 ${selectedPaths.size} 张图片？`)) return;
		try {
			await Promise.all(Array.from(selectedPaths).map(p => deleteMyImage(p)));
			myImages = myImages.filter(i => !selectedPaths.has(i.path));
			selectMode = false;
			selectedPaths = new Set();
		} catch (e) {
			alert(e instanceof Error ? e.message : "批量删除失败");
		}
	}


	async function handleRecommend(path: string) {
		try {
			await recommendImage(path);
			alert('自荐成功，等待管理员审核');
			loadMyRecommendations();
		} catch (e) {
			alert(e instanceof Error ? e.message : '自荐失败');
		}
	}

	function recStatusBadge(status: string) {
		switch (status) {
			case 'pending': return '⏳ 待审核';
			case 'approved': return '✅ 已通过';
			case 'rejected': return '❌ 已拒绝';
			default: return status;
		}
	}
</script>

<svelte:head>
	<title>AI 生图 - {siteConfig.title}</title>
</svelte:head>

<div class="w-full max-w-4xl mx-auto px-4 py-6 space-y-4">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
		<div class="flex items-center gap-2">
			<Icon icon="mdi:palette" class="size-6 text-primary" />
			<h1 class="text-xl font-bold">AI 生图</h1>
				<PageViews pathname="/draw/" class="text-sm text-muted-foreground" />
			{#if onlineCount > 0}
				<Badge variant="secondary" class="text-xs">
					<Icon icon="mdi:account-multiple" class="size-3 mr-0.5" />
					{onlineCount}
				</Badge>
			{/if}
			{#if globalBusy}
				<Badge variant="default" class="text-xs animate-pulse">生成中</Badge>
			{/if}
			{#if apiStatusValue === "checking"}
				<Badge variant="outline" class="text-xs text-muted-foreground">API 检测中</Badge>
			{:else if apiStatusValue === "offline"}
				<Badge variant="destructive" class="text-xs">API 离线</Badge>
			{:else if apiStatusValue === "online"}
				<Badge variant="outline" class="text-xs text-green-500 border-green-500">API 在线</Badge>
			{/if}
		</div>
	</div>

	<!-- Environment Switcher -->
	<EnvironmentSwitcher />


	<!-- Auth warning -->
	{#if !isLoggedIn}
		<Alert>
			<Icon icon="mdi:account-alert-outline" class="size-4" />
			<AlertDescription class="text-xs">
				请先<a href="/forum/auth/login?redirect=/draw/" class="underline font-medium">登录论坛</a>后使用生图功能。
			</AlertDescription>
		</Alert>
	{/if}

	{#if apiErrorMessage}
		<Alert>
			<Icon icon="mdi:cloud-alert" class="size-4 shrink-0" />
			<AlertDescription class="text-xs">{apiErrorMessage}</AlertDescription>
		</Alert>
	{/if}

	<!-- Tabs -->
	<Tabs bind:value={activeTab} class="w-full">
		<TabsList class="w-full">
			<TabsTrigger value="generate" class="flex-1">
				<Icon icon="mdi:sparkles" class="size-4 mr-1" />
				生成
			</TabsTrigger>
			<TabsTrigger value="mine" class="flex-1">
				<Icon icon="mdi:account-outline" class="size-4 mr-1" />
				我的
			</TabsTrigger>
			<TabsTrigger value="featured" class="flex-1">
				<Icon icon="mdi:star-outline" class="size-4 mr-1" />
				精选
			</TabsTrigger>
		</TabsList>

		<!-- Generate Tab -->
		<TabsContent value="generate" class="mt-4">
			<Tabs bind:value={genSubTab} class="w-full">
				<TabsList class="w-full">
					<TabsTrigger value="txt2img" class="flex-1">
						<Icon icon="mdi:sparkles" class="size-4 mr-1" />
						文生图
					</TabsTrigger>
					<TabsTrigger value="img2img" class="flex-1">
						<Icon icon="mdi:image-edit-outline" class="size-4 mr-1" />
						图生图
					</TabsTrigger>
				</TabsList>

				<TabsContent value="txt2img" class="space-y-4 mt-4">
					<div class="grid grid-cols-2 gap-4">
						<WorkflowDialog bind:value={workflowPath} onselect={handleWorkflowSelect} onpromptload={handlePromptLoad} />
						<StyleDialog bind:value={styleTags} bind:name={styleName} onselect={handleStyleSelect} />
					</div>

					<PromptForm
						bind:directPrompt
						bind:negativePrompt
						bind:nlPrompt
						bind:rewrite
						bind:width
						bind:height
						bind:safetyRating
						onsubmit={startGeneration}
						disabled={isGenerating || globalBusy || !isLoggedIn}
						busy={globalBusy && !isGenerating}
						bind:otherNode
						bind:otherValue
						bind:otherMax
						bind:otherStage
						bind:sameSeed
						bind:forkSeed
					/>

					<ProgressPanel
						bind:messages={progressMessages}
						visible={showProgress}
						busy={isGenerating}
						bind:resultImages
						cost={genCost}
						onFork={handleFork}
					/>
				</TabsContent>

				<TabsContent value="img2img" class="mt-4">
					<Tabs bind:value={img2imgSubTab} class="w-full">
						<TabsList class="w-full">
							<TabsTrigger value="flux2" class="flex-1">Flux2</TabsTrigger>
							<TabsTrigger value="qwen" class="flex-1">Qwen</TabsTrigger>
						</TabsList>
						<TabsContent value="flux2" class="mt-4">
							<Img2imgTab {globalBusy} bind:otherNode bind:otherValue bind:otherMax bind:otherStage />
						</TabsContent>
						<TabsContent value="qwen" class="mt-4">
							<QwenTab {globalBusy} bind:otherNode bind:otherValue bind:otherMax bind:otherStage />
						</TabsContent>
					</Tabs>
				</TabsContent>

			</Tabs>
		</TabsContent>

		<!-- My Images Tab -->
		<TabsContent value="mine" class="mt-4">
			{#if activeTab === 'mine'}
				{#if !isLoggedIn}
					<Alert>
						<Icon icon="mdi:account-alert-outline" class="size-4" />
						<AlertDescription class="text-xs">
							请先<a href="/forum/auth/login?redirect=/draw/" class="underline font-medium">登录论坛</a>查看自己的图片。
						</AlertDescription>
					</Alert>
				{:else}
					<div class="space-y-3">
						<div class="flex items-center justify-between">
							<h3 class="text-sm font-medium flex items-center gap-1.5">
								<Icon icon="mdi:account-outline" class="size-4" />
								我的图片
								<span class="text-xs text-muted-foreground">({myImages.length}/{myImagesTotal})</span>
							</h3>
							<div class="flex items-center gap-1">
								<Dialog.Root>
									<Dialog.Trigger>
										{#snippet child({ props })}
											<Button variant="outline" size="sm" onclick={loadMyRecommendations} {...props}>
												<Icon icon="mdi:star-plus-outline" class="size-4" />
												自荐
											</Button>
										{/snippet}
									</Dialog.Trigger>
									<Dialog.Content class="sm:max-w-lg">
										<Dialog.Header>
											<Dialog.Title class="flex items-center gap-2">
												<Icon icon="mdi:star-plus-outline" class="size-5" />
												我的自荐
											</Dialog.Title>
										</Dialog.Header>
										<div class="max-h-96 overflow-y-auto space-y-2">
											{#if !myRecsLoaded}
												<div class="text-xs text-muted-foreground py-4 text-center">加载中...</div>
											{:else if myRecommendations.length === 0}
												<div class="text-xs text-muted-foreground py-4 text-center">暂无自荐记录</div>
											{:else}
												{#each myRecommendations as rec}
													<div class="border rounded-lg p-3 space-y-1">
														<div class="flex items-center gap-2 text-xs">
															<img src={getImageProxyUrl(rec.image_path)} alt="" class="size-10 rounded object-cover border shrink-0" />
															<span class="truncate flex-1">{rec.image_path}</span>
															<Badge variant={rec.status === "approved" ? "default" : rec.status === "rejected" ? "destructive" : "secondary"} class="text-[10px] shrink-0">
																{recStatusBadge(rec.status)}
															</Badge>
														</div>
														{#if rec.user_reason}
															<div class="text-[10px] text-muted-foreground">理由: {rec.user_reason}</div>
														{/if}
														{#if rec.admin_reason}
															<div class="text-[10px] text-muted-foreground">管理员: {rec.admin_reason}</div>
														{/if}
													</div>
												{/each}
											{/if}
										</div>
									</Dialog.Content>
								</Dialog.Root>
									{#if selectMode}
										<Button variant="ghost" size="sm" onclick={() => { selectMode = false; selectedPaths = new Set(); }}>
											<Icon icon="mdi:close" class="size-4" />
											取消
										</Button>
										<Button variant="destructive" size="sm" onclick={handleBatchDelete} disabled={selectedPaths.size === 0}>
											<Icon icon="mdi:delete-outline" class="size-4" />
											删除({selectedPaths.size})
										</Button>
									{:else}
										<Button variant="ghost" size="sm" onclick={() => { selectMode = true; selectedPaths = new Set(); }}>
											<Icon icon="mdi:select" class="size-4" />
											选择
										</Button>
									{/if}
								<Button variant="ghost" size="sm" onclick={() => { myImagesLoaded = false; loadMyImages(); }} disabled={myImagesLoading}>
									<Icon icon="mdi:refresh" class="size-4" />
								</Button>
							</div>
						</div>

						{#if myImagesLoading}
							<div class="text-xs text-muted-foreground py-8 text-center">加载中...</div>
						{:else if myImages.length === 0}
							<div class="text-xs text-muted-foreground py-8 text-center">你还没有生成过图片</div>
						{:else}
							<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5">
								{#each myImages as item, i}
									<div role="button" tabindex="0"
										class="group relative aspect-square rounded-md overflow-hidden border hover:ring-2 hover:ring-primary/50 transition-all cursor-pointer"
										onclick={() => { if (selectMode) toggleSelect(item.path); else { myLbIndex = i; myLbOpen = true; } }}
									>
										<img
											src={getImageProxyUrl(item.path)}
											alt={item.path}
											class="w-full h-full object-cover"
											loading="lazy"
										/>
									{#if selectMode}
											<div class="absolute top-1 left-1 flex items-center justify-center" onclick={(e) => e.stopPropagation()}>
												<input type="checkbox" checked={selectedPaths.has(item.path)} onchange={() => toggleSelect(item.path)} class="size-4 accent-primary" />
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>

				{/if}
			{/if}
		</TabsContent>

		<!-- Featured Tab -->
		<TabsContent value="featured" class="mt-4">
			{#if activeTab === 'featured'}
				{#if !isLoggedIn}
					<Alert>
						<Icon icon="mdi:account-alert-outline" class="size-4" />
						<AlertDescription class="text-xs">
							请先<a href="/forum/auth/login?redirect=/draw/" class="underline font-medium">登录论坛</a>查看精选图片。
						</AlertDescription>
					</Alert>
				{:else}
					<FeaturedTab onFork={handleFork} />
				{/if}
			{/if}
		</TabsContent>

		</Tabs>

<ImageLightbox
	open={myLbOpen}
	images={myLbImages}
	index={myLbIndex}
	onclose={() => (myLbOpen = false)}
	onfork={handleFork}
	onrecommend={handleRecommend}
/>
</div>

