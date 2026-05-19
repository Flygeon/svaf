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
	import { connectStatusWs } from '$lib/draw/api/ws';
	import { fetchMyImages, getImageUrl, getImageProxyUrl, forkOutputImage, recommendImage, deleteMyImage, fetchMyRecommendations, addToQueue, fetchMyQueue } from '$lib/draw/api/client';
	import { consumeFork } from '$lib/draw/stores/fork';
	import { onMount, onDestroy } from 'svelte';
	import type { WsStatusEvent, DrawWorkflow, DrawRecommendation } from '$lib/draw/types';

	import PageViews from '$lib/components/PageViews.svelte';

	import EnvironmentSwitcher from '$lib/components/draw/EnvironmentSwitcher.svelte';
	import WorkflowDialog from '$lib/components/draw/WorkflowDialog.svelte';
	import StyleDialog from '$lib/components/draw/StyleDialog.svelte';
	import PromptForm from '$lib/components/draw/PromptForm.svelte';
	
	import FeaturedTab from '$lib/components/draw/FeaturedTab.svelte';
	import Img2imgTab from '$lib/components/draw/Img2imgTab.svelte';
		import ImageLightbox from '$lib/components/draw/ImageLightbox.svelte';

	// State
	let currentBaseUrl = $state('');
	let onlineCount = $state(0);
	let queuing = $state(false);
	let queueSuccess = $state("");
	let queueError = $state("");
	let queueTimer: ReturnType<typeof setInterval> | null = null;
	let globalBusy = $state(false);
	
	let authToken = $state<string | null>(null);
	let isLoggedIn = $derived(!!authToken);

	// Form state
	let workflowPath = $state('');
	let workflowName = $state('');
	let styleTags = $state('');
	let styleName = $state('');
	let directPrompt = $state('');
	let workflowPrompt = $state("");
	let inlineWorkflowApi = $state<Record<string, any> | null>(null);
	let workflowNegativePrompt = $state("");
	let negativePrompt = $state('');
	let nlPrompt = $state('');
	let width = $state(0);
	let height = $state(0);
	let inlineWorkflow = $state<object | null>(null);
	let forkSeed = $state<number | undefined>(undefined);
	let sameSeed = $state(false);

	// Restore form state from localStorage
		if (typeof localStorage !== 'undefined') {
			try {
				const saved = localStorage.getItem('draw-form');
				if (saved) {
					const p = JSON.parse(saved);
					if (p.workflowPath) workflowPath = p.workflowPath;
					if (localStorage.getItem('wf_prompt')) workflowPrompt = localStorage.getItem('wf_prompt')!;
					if (localStorage.getItem('wf_neg_prompt')) workflowNegativePrompt = localStorage.getItem('wf_neg_prompt')!;
					if (p.workflowName) workflowName = p.workflowName;
					if (p.styleTags) styleTags = p.styleTags;
					if (p.styleName) styleName = p.styleName;
					if (p.directPrompt) directPrompt = p.directPrompt;
					if (p.negativePrompt) negativePrompt = p.negativePrompt;
					if (p.nlPrompt) nlPrompt = p.nlPrompt;
					if (p.width) width = p.width;
					if (p.height) height = p.height;
					if (p.forkSeed !== undefined) forkSeed = p.forkSeed;
					if (p.sameSeed !== undefined) sameSeed = p.sameSeed;
				}
			} catch {}
			// read fork pending
			try {
				const f = localStorage.getItem("draw-fork-pending");
				if (f) {
					const d = JSON.parse(f);
					if (d.builtin_prompt) directPrompt = d.builtin_prompt;
					if (d.builtin_negative_prompt) negativePrompt = d.builtin_negative_prompt;
					if (d.default_width) width = d.default_width;
					if (d.default_height) height = d.default_height;
					if (d.seed) forkSeed = d.seed;
					inlineWorkflowApi = d.workflow_api || null;
					inlineWorkflow = null;
					if (d.workflow_path) workflowPath = d.workflow_path;
					if (d.workflow_name) workflowName = d.workflow_name;
					if (d.style_tags) { styleTags = d.style_tags; styleName = d.style_tags; }
					else { styleTags = ''; styleName = ''; }
					localStorage.removeItem("draw-fork-pending");
				}
			} catch {}
		}
	// Progress state


	// My images state
	let myImages = $state<{ path: string; mtime: number }[]>([]);
	let myImagesTotal = $state(0);
	let myImagesLoading = $state(false);
	let myImagesLoaded = $state(false);
	let myQueueItems = $state<Array<{ id: number; status: string; created_at: number; started_at?: number; finished_at?: number; error?: string; position?: number | null }>>([]);
	let myQueueLoading = $state(false);
	let prevQueueIds = new Set<number>();
	let notifiedIds = new Set<number>();
	// Masonry layout
	let columnCount = $state(4);
	let imgColumns = $state<string[][]>([[], [], [], []]);
	let columnHeights: number[] = [0, 0, 0, 0];
	let sentinelEl: HTMLDivElement | undefined;
	let io: IntersectionObserver | null = null;
	let hasMore = $state(true);
	let loadingMore = $state(false);
	let myImagesDisplayLimit = $state(5);

	// My images lightbox
	let myLbOpen = $state(false);
	let myLbIndex = $state(0);
	let myLbImages = $derived(myImages.map((it) => ({ src: getImageUrl(it.path), cached: getImageProxyUrl(it.path), creator_id: '' })));

	// Recommendations
	let myRecommendations = $state<DrawRecommendation[]>([]);
	let myRecsLoaded = $state(false);
	let selectMode = $state(false);
	let selectedPaths = $state(new Set<string>());

	// WebSocket refs
	let statusConn: ReturnType<typeof connectStatusWs> | null = null;
	

	// API error state
	let apiErrorMessage = $state("");
	let apiStatusValue = $state("checking");
		let turnstileToken = $state("");
		let turnstileTick = $state(0);
		let forkMessage = $state("");

	$effect(() => {
		const unsub = apiError.subscribe((v) => {
				if (v) console.log('[FORK] apiError set to:', v);
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
	let activeTab = $state(location.hash?.slice(1) || 'generate');
	let genSubTab = $state(location.hash?.includes('img2img') ? 'img2img' : 'txt2img');

	// 从 URL hash 恢复 tab 状态
	$effect(() => {
		if (typeof location !== 'undefined') {
			const h = location.hash?.slice(1);
			if (h === 'mine' || h === 'featured' || h === 'generate') activeTab = h;
			if (h === 'img2img' || h === 'txt2img') genSubTab = h;
		}
	});

	// tab 变化时更新 URL hash
	$effect(() => {
		if (typeof location !== 'undefined' && activeTab) {
			console.log('[FORK] activeTab effect:', activeTab);
				history.replaceState(null, '', '#' + activeTab);
		}
	});

	const state = $derived({ workflowPath, workflowName, styleTags, styleName, directPrompt, negativePrompt, nlPrompt, width, height, forkSeed, sameSeed });

		// Persist form state to localStorage
	$effect(() => {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem('draw-form', JSON.stringify(state));
	});

	$effect(() => {
		if (activeTab === 'mine' && isLoggedIn) {
			if (!myImagesLoaded) loadMyImages();
			loadMyQueue();
			queueTimer = setInterval(loadMyQueue, 1000);
			if ('Notification' in window && Notification.permission === 'default') { Notification.requestPermission(); }
			if (!myRecsLoaded) loadMyRecommendations();
		} else {
			if (queueTimer) { clearInterval(queueTimer); queueTimer = null; }
		}
		return () => { if (queueTimer) { clearInterval(queueTimer); queueTimer = null; } };
	});

	$effect(() => {
		console.log('[FORK] $effect (consumeFork) running');
			const u1 = drawEnv.baseUrl.subscribe((v) => {
				if (v !== currentBaseUrl) console.log('[FORK] baseUrl changed:', currentBaseUrl, '->', v);
				currentBaseUrl = v;
			});
		authToken = forumAuth.getToken();

		// 检查是否有待消费的 fork 数据（从其他页面跳转过来）
		const res = consumeFork();
			console.log('[FORK] $effect after consumeFork');
		if (res) {
					inlineWorkflow = res.workflow && Object.keys(res.workflow || {}).length ? res.workflow : null;
				inlineWorkflowApi = res.workflow_api || null;
			if (res.builtin_prompt) { directPrompt = res.builtin_prompt; workflowPrompt = res.builtin_prompt; }
			if (res.builtin_negative_prompt) { negativePrompt = res.builtin_negative_prompt; workflowNegativePrompt = res.builtin_negative_prompt; }
			if (res.default_width) width = res.default_width;
			if (res.default_height) height = res.default_height;
			forkSeed = res.seed;
			if (res.workflow_path && res.workflow_path !== 'fork') workflowPath = res.workflow_path;
			if (res.workflow_name) workflowName = res.workflow_name;
				else workflowName = inlineWorkflow ? '(fork)' : '';
			if (res.style_tags) {
				styleTags = res.style_tags;
				styleName = res.style_tags;
			} else {
				styleTags = '';
				styleName = '';
			}
			console.log('[FORK] $effect setting activeTab=generate');
				activeTab = 'generate';
		}

		// Connect status WebSocket
		statusConn = connectStatusWs(currentBaseUrl, handleStatusMessage, undefined, () => { globalBusy = false; });

		return () => {
			u1();
			statusConn?.close();
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
			workflowPrompt = positive;
			workflowNegativePrompt = negative;
			localStorage.setItem('wf_prompt', positive);
			localStorage.setItem('wf_neg_prompt', negative);
		}

	async function handleFork(path: string) {
		console.log('[FORK] handleFork called', path);
		try {
			const res = await forkOutputImage(path);
			console.log('[FORK] API done', res);
			inlineWorkflow = null;
			inlineWorkflowApi = res.workflow_api || null;
			if (res.builtin_prompt) directPrompt = res.builtin_prompt;
			if (res.builtin_negative_prompt) negativePrompt = res.builtin_negative_prompt;
			if (res.default_width) width = res.default_width;
			if (res.default_height) height = res.default_height;
			forkSeed = res.seed;
			if (res.workflow_path && res.workflow_path !== 'fork') workflowPath = res.workflow_path;
			if (res.workflow_name) workflowName = res.workflow_name;
			else workflowName = inlineWorkflow ? '(fork)' : '';
			if (res.style_tags) {
				styleTags = res.style_tags;
				styleName = res.style_tags;
			} else {
				styleTags = '';
				styleName = '';
			}
			localStorage.setItem('draw-fork-pending', JSON.stringify({ workflow_api: res.workflow_api || null, builtin_prompt: res.builtin_prompt || '', builtin_negative_prompt: res.builtin_negative_prompt || '', default_width: res.default_width || null, default_height: res.default_height || null, seed: res.seed, style_tags: res.style_tags || '', workflow_path: res.workflow_path || '', workflow_name: res.workflow_name || '' }));
			forkMessage = 'Fork 成功';
			console.log('[FORK] success done');
		} catch (e: any) {
			console.log('[FORK] catch error:', e?.message);
			forkMessage = e?.message || 'Fork 失败';
		}
	}
async function startGeneration() {
			if (queuing) return;
			if (!authToken) {
				alert('请先在论坛登录');
				return;
			}
			if (!workflowPath && !inlineWorkflow) {
				alert('请选择工作流');
				}
				if (false) {
					alert('请完成人机验证');
				return;
			}

			const finalDirectPrompt = directPrompt
				? `${directPrompt}`
				: directPrompt;

			queuing = true;
			queueSuccess = '';
			queueError = '';
			try {
				await addToQueue({
					direct_prompt: finalDirectPrompt,
					width: width || undefined,
					height: height || undefined,
					style_tags: styleTags || undefined,
					negative_prompt: negativePrompt || undefined,
					seed: sameSeed ? forkSeed : undefined,
					workflow_path: workflowPath,
					inline_workflow: inlineWorkflow || undefined,
					inline_workflow_api: inlineWorkflowApi || undefined,
				turnstile_token: turnstileToken || undefined,
				});
				queueSuccess = '成功加入队列！等待生图中，前往"我的"页面查看详情。';
				turnstileTick++;
				loadMyQueue();
				if (!queueTimer) queueTimer = setInterval(loadMyQueue, 1000);
			} catch (e) {
				queueError = e instanceof Error ? e.message : '加入队列失败';
			} finally {
				queuing = false;
			}
		}






	async function loadMyImages() {
		if (myImagesLoaded) return;
		myImagesLoading = true;
		try {
			const res = await fetchMyImages();
			const deduped = res.items.filter((v, i, a) => a.findIndex(t => t.path === v.path) === i);
			myImages = deduped;
			myImagesTotal = res.total;
			myImagesLoaded = true;
			rebuildMyColumns();
		} catch {
			myImages = [];
		} finally {
			myImagesLoading = false;
		}
	}

	function rebuildMyColumns() {
		columnCount = getColumnCount();
		imgColumns = Array.from({ length: columnCount }, () => []);
		columnHeights = new Array(columnCount).fill(0);
		const display = myImages.slice(0, myImagesDisplayLimit);
		for (const item of display) pushToShortest(item.path);
		imgColumns = [...imgColumns];
		hasMore = myImagesDisplayLimit < myImages.length;
	}

	function showMoreMyImages() {
		myImagesDisplayLimit = Math.min(myImagesDisplayLimit + 10, myImages.length);
		rebuildMyColumns();
	}

	async function loadMyQueue() {
		if (myQueueItems.length === 0) myQueueLoading = true;
		try {
			const res = await fetchMyQueue();
			const now = res.items;
			const showItems = now.filter(it => it.status === 'pending' || it.status === 'waiting' || it.status === 'running');
				const prevActive = new Set(showItems.map(it => it.id));
				const newlyDone = now.filter(it => (it.status === 'done' || it.status === 'failed') && !notifiedIds.has(it.id) && prevQueueIds.has(it.id));
				for (const item of newlyDone) {
					notifiedIds.add(item.id);
					if (item.status === 'done') {
						// 刷新我的图片
						myImagesLoaded = false;
						loadMyImages();
					}
					if ('Notification' in window && Notification.permission === 'granted') {
						new Notification('生图完成' + (item.status === 'failed' ? '（失败）' : ''), {
							body: item.status === 'done' ? '你的图片已生成完成。' : (item.error || '生图失败'),
							icon: '/favicon.ico'
						});
					}
				}
				prevQueueIds = prevActive;
				// 只有数据变化时才更新，避免闪烁
				const same = myQueueItems.length === showItems.length && myQueueItems.every((old, i) => old.id === showItems[i].id && old.status === showItems[i].status);
				if (!same) myQueueItems = showItems;
		} catch {
			myQueueItems = [];
		} finally {
			myQueueLoading = false;
		}
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

		function formatTimeAgo(ts: number): string {
			const diff = Math.floor(Date.now() / 1000 - ts);
			if (diff < 60) return `${diff}秒前`;
			if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
			return `${Math.floor(diff / 3600)}小时前`;
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
		const flat: string[] = [];
		const idx = new Array(imgColumns.length).fill(0);
		while (true) {
			let added = false;
			for (let c = 0; c < imgColumns.length; c++) {
				if (idx[c] < imgColumns[c].length) {
					flat.push(imgColumns[c][idx[c]++]);
					added = true;
				}
			}
			if (!added) break;
		}
		columnCount = getColumnCount();
		imgColumns = Array.from({ length: columnCount }, () => []);
		columnHeights = new Array(columnCount).fill(0);
		for (const p of flat) pushToShortest(p);
		imgColumns = [...imgColumns];
	}

	function handleResize() {
		const old = columnCount;
		const nu = getColumnCount();
		if (nu === old) return;
		columnCount = nu;
		rebuildColumns();
	}

	function handleImgLoad(e: Event) {
		const img = e.currentTarget as HTMLImageElement;
		if (img.naturalWidth && img.naturalHeight) {
			img.style.aspectRatio = `${img.naturalWidth / img.naturalHeight}`;
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

	onMount(() => {
		columnCount = getColumnCount();
		imgColumns = Array.from({ length: columnCount }, () => []);
		columnHeights = new Array(columnCount).fill(0);
		if (sentinelEl && !myImagesLoaded) {
			io = new IntersectionObserver(
				(entries) => {
					if (entries.some((e) => e.isIntersecting && !loadingMore && hasMore)) loadMoreMyImages();
				},
				{ rootMargin: '400px 0px' }
			);
			io.observe(sentinelEl);
		}
		window.addEventListener('resize', handleResize, { passive: true });
	});

	onDestroy(() => {
		io?.disconnect();
		if (typeof window !== 'undefined') {
			window.removeEventListener('resize', handleResize);
		}
	});

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

	{#if apiErrorMessage && (apiErrorMessage.includes('封禁') || apiErrorMessage.includes('BANNED'))}
		<div class="fixed inset-0 z-50 bg-red-600 flex items-center justify-center p-8">
			<div class="bg-white rounded-xl max-w-lg w-full p-8 text-center space-y-4 shadow-2xl">
				<Icon icon="mdi:account-cancel" class="size-16 mx-auto text-red-500" />
				<h1 class="text-2xl font-bold text-red-600">账号已被封禁</h1>
				<p class="text-base text-gray-700">{apiErrorMessage}</p>
			</div>
		</div>
	{/if}

	{#if apiErrorMessage && !apiErrorMessage.includes('封禁') && !apiErrorMessage.includes('BANNED')}
		<Alert>
			<Icon icon="mdi:cloud-alert" class="size-4 shrink-0" />
			<AlertDescription class="text-xs">{apiErrorMessage}</AlertDescription>
		</Alert>
	{/if}

	<!-- Tabs -->
	{#if apiStatusValue === 'checking'}
		<Alert>
			<Icon icon="mdi:cloud-question" class="size-4" />
			<AlertDescription class="text-xs">正在检测后端 API 状态，请稍候...</AlertDescription>
		</Alert>
	{:else if apiStatusValue === 'offline'}
		<Alert variant="destructive">
			<Icon icon="mdi:cloud-alert" class="size-4" />
			<AlertDescription class="text-xs">后端不可用，二叉树树目前可能需要使用电脑，未启用生图功能</AlertDescription>
		</Alert>
	{:else}
		{#if forkMessage}
			<Alert>
				<Icon icon="mdi:information" class="size-4 shrink-0" />
				<AlertDescription class="text-xs">{forkMessage}</AlertDescription>
				<button class="ml-auto text-xs underline" onclick={() => (forkMessage = '')}>关闭</button>
			</Alert>
		{/if}
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
						bind:turnstileToken
						bind:turnstileTick
						bind:directPrompt
						bind:negativePrompt
						bind:nlPrompt
						bind:workflowPrompt
						bind:workflowNegativePrompt
						bind:width
						bind:height
						onsubmit={startGeneration}
						disabled={queuing || !isLoggedIn}
						busy={queuing}
						bind:sameSeed
						bind:forkSeed
					/>

					{#if queueSuccess}
						<Alert>
							<Icon icon="mdi:check-circle" class="size-4" />
							<AlertDescription class="text-xs">{queueSuccess}</AlertDescription>
						</Alert>
					{/if}
				{#if queueError}
						<Alert variant="destructive">
							<Icon icon="mdi:alert-circle" class="size-4" />
							<AlertDescription class="text-xs">{queueError}</AlertDescription>
						</Alert>
					{/if}

				</TabsContent>

				<TabsContent value="img2img" class="mt-4">
					<Img2imgTab bind:turnstileToken bind:turnstileTick />
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
						<!-- 队列状态 -->
						<div class="space-y-2">
							{#if myQueueLoading}
								<div class="text-xs text-muted-foreground py-3 text-center">加载中...</div>
							{:else if myQueueItems.length > 0}
								<div class="flex items-center justify-between">
									<h3 class="text-sm font-medium flex items-center gap-1.5">
										<Icon icon="mdi:queue-play" class="size-4" />
										队列状态
									</h3>
									<Button variant="ghost" size="sm" onclick={loadMyQueue}>
										<Icon icon="mdi:refresh" class="size-4" />
									</Button>
								</div>
								<div class="space-y-1">
									{#each myQueueItems as item}
										<div class="flex items-center gap-2 text-xs border rounded-lg px-3 py-2 {item.status === 'failed' ? 'border-red-300 bg-red-50 dark:bg-red-950/30' : ''}">
										{#if item.status === 'running'}
											<Icon icon="mdi:loading" class="size-4 animate-spin text-primary" />
											<span class="flex-1">正在生图中</span>
										{:else if item.status === 'done'}
											<Icon icon="mdi:check-circle" class="size-4 text-green-500" />
											<span class="flex-1">生图完成，请前往"我的图片"查看</span>
										{:else if item.status === 'failed'}
											<Icon icon="mdi:alert-circle" class="size-4 text-red-500" />
											<span class="flex-1 truncate">{item.error || '生图失败'}</span>
										{:else if item.status === 'cancelled'}
											<Icon icon="mdi:cancel" class="size-4 text-muted-foreground" />
											<span class="flex-1">已取消</span>
										{:else if item.status === 'waiting'}
											<Icon icon="mdi:clock-outline" class="size-4 text-muted-foreground" />
											<span class="flex-1">等待生图中，前面还有 {item.position ? item.position - 1 : 0} 位</span>
										{:else}
											<Icon icon="mdi:clock-outline" class="size-4 text-muted-foreground" />
											<span class="flex-1">等待生图中，前面还有 {item.position ? item.position - 1 : 0} 位</span>
										{/if}
										</div>
									{/each}
								</div>
							{:else}
								<div class="text-xs text-muted-foreground py-3 text-center">暂无排队任务</div>
							{/if}
						</div>

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
							<div class="flex gap-2 items-start">
								{#each imgColumns as col, ci (ci)}
									<div class="flex flex-1 flex-col gap-2 min-w-0">
										{#each col as path (ci + '-' + path)}
											{@const item = myImages.find(i => i.path === path)}
											{#if item}
												<div role="button" tabindex="0"
													class="group relative rounded-md overflow-hidden border hover:ring-2 hover:ring-primary/50 transition-all cursor-pointer"
													onclick={() => { if (selectMode) toggleSelect(item.path); else { myLbIndex = myImages.indexOf(item); myLbOpen = true; } }}
												>
													<img
														src={getImageProxyUrl(item.path)}
														alt={item.path}
														loading="lazy"
														decoding="async"
														style="aspect-ratio: 1;"
														onload={handleImgLoad}
														class="block w-full h-auto bg-muted"
													/>
												{#if selectMode}
														<div class="absolute top-1 left-1 flex items-center justify-center" onclick={(e) => e.stopPropagation()}>
															<input type="checkbox" checked={selectedPaths.has(item.path)} onchange={() => toggleSelect(item.path)} class="size-4 accent-primary" />
														</div>
												{/if}
												</div>
											{/if}
										{/each}
									</div>
								{/each}
							</div>
							{#if hasMore}
								<div class="flex justify-center pt-2">
									<Button variant="outline" size="sm" onclick={showMoreMyImages}>
										加载更多（{myImages.length - myImagesDisplayLimit} 张）
									</Button>
								</div>
							{/if}
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
	{/if}
<ImageLightbox
	open={myLbOpen}
	images={myLbImages}
	index={myLbIndex}
	onclose={() => (myLbOpen = false)}
	onfork={handleFork}
	onrecommend={handleRecommend}
/>
</div>

