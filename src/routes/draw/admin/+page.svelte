<script lang="ts">
	import Icon from '@iconify/svelte';
	import { siteConfig } from '$lib/config/site';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { Switch } from '$lib/components/ui/switch';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import * as Table from '$lib/components/ui/table';
	import { forumAuth } from '$lib/forum/stores/auth';
	import { drawEnv } from '$lib/draw/stores/env';
	import * as admin from '$lib/draw/api/admin';
	import { getImageProxyUrl, getImageUrl, getThumbnailUrl, forkOutputImage } from '$lib/draw/api/client';
	import { pendingFork } from '$lib/draw/stores/fork';
	import { onMount, onDestroy } from 'svelte';
import ImageLightbox from '$lib/components/draw/ImageLightbox.svelte';
	import type {
		AdminRecentImage,
		AdminLimits,
		AdminAnnouncement,
		AdminLlmConfig,
		DrawRecommendation
	} from '$lib/draw/types';

	let authToken = $state<string | null>(null);
	let currentBaseUrl = $state('');
	let activeTab = $state('announcement');
	let loading = $state(false);
	let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);


	// Announcement
	let announcement = $state<AdminAnnouncement>({ enabled: false, title: '', content: '' });

	// Recent images
	let recentImages = $state<AdminRecentImage[]>([]);
	let recentTotal = $state(0);
	let recentOffset = $state(0);
	let recentLimit = $state(50);
	let selectedPaths = $state<Set<string>>(new Set());
	let searchUserId = $state('');
// Masonry layout
let columnCount = $state(4);
let imgColumns = $state<string[][]>([[], [], [], []]);
let columnHeights: number[] = [0, 0, 0, 0];
let sentinelEl: HTMLDivElement | undefined;
let io: IntersectionObserver | null = null;
let hasMore = $state(true);
let loadingMore = $state(false);

	// Recommendations
	let recommendations = $state<DrawRecommendation[]>([]);
	let recRejectReasons = $state<Record<string, string>>({});

	// Featured
	let featuredPaths = $state<string[]>([]);
	let newFeaturedPath = $state('');

	// Banned
	let bannedUsers = $state<number[]>([]);
	let newBanUserId = $state('');

	// Limits
	let limits = $state<AdminLimits | null>(null);
	let defaults = $state<AdminLimits | null>(null);

	// LLM Config
	let llmConfig = $state<AdminLlmConfig | null>(null);
	let llmDefaults = $state<AdminLlmConfig | null>(null);
	let llmProviders = $state<string[]>([]);
	let llmThinkingOptions = $state<string[]>([]);
	let llmTestResult = $state<{ ok: boolean; provider: string; reply?: string; error?: string } | null>(null);
	let llmTesting = $state(false);

	const thinkingLabels: Record<string, string> = {
		off: '关闭',
		level_minimal: 'minimal',
		level_low: 'low',
		level_medium: 'medium',
		level_high: 'high',
	};

	const thinkingGroups: Array<{ label: string; options: string[] }> = [
		{ label: '关闭', options: ['off'] },
		{ label: 'Level (Gemini 3 系列)', options: ['level_minimal', 'level_low', 'level_medium', 'level_high'] },
	];

	// GC
	let gcResult = $state<Record<string, number> | null>(null);

	// Styles
	let styles = $state<import('$lib/draw/types').DrawStyle[]>([]);
	let styleEditIndex = $state(-1);
	let styleEditName = $state('');
	let styleEditTags = $state('');
	let styleEditImage = $state('');
	let styleRenaming = $state(-1);
	let styleRenameName = $state('');
	let styleRenameTags = $state('');

	// Workflows
	let workflowFiles = $state<string[]>([]);
	let workflowMeta = $state<{ workflow: string; thumbnail?: string; lora_link?: string; category?: string }[]>([]);
	let wfRenaming = $state('');
	let wfRenameValue = $state('');
	let wfMetaEditWf = $state('');
	let wfMetaEditCat = $state('');
	let wfMetaEditLora = $state('');
	let wfMetaEditLoraLink = $state('');
	let wfUploadTarget = $state('');

	// Lightbox
	let lbOpen = $state(false);
	let lbImages = $state<{ src: string; creator_id?: string }[]>([]);

	function openLb(path: string) {
		lbImages = [{ src: getImageUrl(path), creator_id: '' }];
		lbOpen = true;
	}

	async function handleAdminFork(path: string) {
		try {
			const res = await forkOutputImage(path);
			pendingFork.set({
				workflow: res.workflow,
				builtin_prompt: res.builtin_prompt,
				builtin_negative_prompt: res.builtin_negative_prompt,
				default_width: res.default_width,
				default_height: res.default_height,
				seed: res.seed,
				style_tags: res.style_tags,
				matched_workflow: res.matched_workflow
			});
			window.location.href = '/draw';
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Fork 失败');
		}
	}

	$effect(() => {
		authToken = forumAuth.getToken();
		const u = drawEnv.baseUrl.subscribe((v) => (currentBaseUrl = v));
		return u;
	});

	function showMsg(type: 'success' | 'error', text: string) {
		message = { type, text };
		setTimeout(() => (message = null), 3000);
	}

	async function loadAnnouncement() {
		try {
			const res = await admin.getAnnouncement();
			announcement = res.announcement;
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '加载失败');
		}
	}

	async function saveAnnouncement() {
		loading = true;
		try {
			const res = await admin.updateAnnouncement(announcement);
			announcement = res.announcement;
			showMsg('success', '公告已更新');
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '保存失败');
		} finally {
			loading = false;
		}
	}

	async function loadRecent() {
		loading = true;
		try {
			const res = await admin.getRecentImages(recentLimit, 0);
			recentImages = res.items;
			recentTotal = res.total;
			recentOffset = res.items.length;
			selectedPaths = new Set();
			columnCount = getColumnCount();
			imgColumns = Array.from({ length: columnCount }, () => []);
			columnHeights = new Array(columnCount).fill(0);
			for (const item of res.items) pushToShortest(item.path);
			imgColumns = [...imgColumns];
			hasMore = recentOffset < recentTotal;
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '加载失败');
		} finally {
			loading = false;
		}
	}

	async function loadMoreRecent() {
		if (loadingMore || !hasMore) return;
		loadingMore = true;
		try {
			const res = await admin.getRecentImages(recentLimit, recentOffset);
			recentImages = [...recentImages, ...res.items];
			recentOffset += res.items.length;
			for (const item of res.items) pushToShortest(item.path);
			imgColumns = [...imgColumns];
			hasMore = recentOffset < recentTotal;
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '加载失败');
		} finally {
			loadingMore = false;
		}
	}

	async function searchByUser() {
		if (!String(searchUserId).trim()) return;
		loading = true;
		try {
			const res = await admin.getImagesByUser(Number(searchUserId));
			recentImages = res.items;
			recentTotal = res.total;
			selectedPaths = new Set();
			rebuildColumns();
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '查询失败');
		} finally {
			loading = false;
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
		while (true) {
			let added = false;
			for (let c = 0; c < imgColumns.length; c++) {
				if (flat.length < recentImages.length) {
					for (let j = c; j < recentImages.length; j += imgColumns.length) {
						flat.push(recentImages[j].path);
					}
					added = true;
					break;
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

	async function handleDeleteSelected() {
		const paths = [...selectedPaths];
		if (!paths.length) return;
		if (!confirm(`确认删除 ${paths.length} 张图片？`)) return;
		loading = true;
		try {
			const res = await admin.deleteImages(paths);
			showMsg('success', `已删除 ${res.deleted} 张，失败 ${res.failed} 张`);
			await loadRecent();
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '删除失败');
		} finally {
			loading = false;
		}
	}

	async function handleDeleteOne(path: string) {
		if (!confirm(`确认删除 ${path}？`)) return;
		loading = true;
		try {
			await admin.deleteImage(path);
			showMsg('success', '已删除');
			recentImages = recentImages.filter((i) => i.path !== path);
			selectedPaths.delete(path);
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '删除失败');
		} finally {
			loading = false;
		}
	}

	async function handleAddSelectedToFeatured() {
		const paths = [...selectedPaths];
		if (!paths.length) return;
		loading = true;
		try {
			await Promise.all(paths.map((p) => admin.addFeatured(p)));
			showMsg('success', `已将 ${paths.length} 张图片加入精选`);
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '操作失败');
		} finally {
			loading = false;
		}
	}

	function toggleSelect(path: string) {
		const next = new Set(selectedPaths);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		selectedPaths = next;
	}

	function toggleSelectAll() {
		if (selectedPaths.size === recentImages.length) {
			selectedPaths = new Set();
		} else {
			selectedPaths = new Set(recentImages.map((i) => i.path));
		}
	}

	async function loadRecommendations() {
		loading = true;
		try {
			const res = await admin.fetchRecommendations();
			recommendations = res.items;
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '加载失败');
		} finally {
			loading = false;
		}
	}

	async function resolveRec(recId: string, action: 'approve' | 'reject') {
		loading = true;
		try {
			const reason = recRejectReasons[recId] || undefined;
			await admin.resolveRecommendation(recId, action, action === 'reject' ? reason : undefined);
			showMsg('success', action === 'approve' ? '已通过' : '已拒绝');
			recommendations = recommendations.filter((r) => r.id !== recId);
			delete recRejectReasons[recId];
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '处理失败');
		} finally {
			loading = false;
		}
	}

	async function loadFeatured() {
		try {
			const res = await admin.getFeatured();
			featuredPaths = res.items;
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '加载失败');
		}
	}

	async function handleAddFeatured() {
		if (!newFeaturedPath.trim()) return;
		loading = true;
		try {
			const res = await admin.addFeatured(newFeaturedPath.trim());
			featuredPaths = res.items;
			newFeaturedPath = '';
			showMsg('success', '已添加到精选');
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '添加失败');
		} finally {
			loading = false;
		}
	}

	async function handleRemoveFeatured(path: string) {
		if (!confirm(`确定要移除精选图片？\n${path}`)) return;
		loading = true;
		try {
			const res = await admin.removeFeatured(path);
			featuredPaths = res.items;
			showMsg('success', '已移除');
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '移除失败');
		} finally {
			loading = false;
		}
	}

	async function loadBanned() {
		try {
			const res = await admin.getBannedUsers();
			bannedUsers = res.banned;
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '加载失败');
		}
	}

	async function handleBan() {
		if (!newBanUserId.trim()) return;
		loading = true;
		try {
			const res = await admin.banUser(Number(newBanUserId));
			bannedUsers = res.banned;
			newBanUserId = '';
			showMsg('success', '已封禁');
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '封禁失败');
		} finally {
			loading = false;
		}
	}

	async function handleUnban(userId: number) {
		loading = true;
		try {
			const res = await admin.unbanUser(userId);
			bannedUsers = res.banned;
			showMsg('success', '已解封');
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '解封失败');
		} finally {
			loading = false;
		}
	}

	async function loadLimits() {
		try {
			const res = await admin.getLimits();
			limits = res.limits;
			defaults = res.defaults;
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '加载失败');
		}
	}

	async function saveLimits() {
		if (!limits) return;
		loading = true;
		try {
			const res = await admin.updateLimits(limits);
			limits = res.limits;
			showMsg('success', '配置已保存');
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '保存失败');
		} finally {
			loading = false;
		}
	}

	async function loadLlmConfig() {
		try {
			const res = await admin.getLlmConfig();
			llmConfig = res.config;
			llmDefaults = res.defaults;
			llmProviders = res.providers;
			llmThinkingOptions = res.google_thinking_options;
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '加载失败');
		}
	}

	async function saveLlmConfig() {
		if (!llmConfig) return;
		loading = true;
		try {
			const res = await admin.updateLlmConfig(llmConfig);
			llmConfig = res.config;
			showMsg('success', 'LLM 配置已保存');
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '保存失败');
		} finally {
			loading = false;
		}
	}

	async function testLlmConfig() {
		llmTesting = true;
		llmTestResult = null;
		try {
			llmTestResult = await admin.testLlmConfig();
		} catch (e) {
			llmTestResult = { ok: false, provider: '', error: e instanceof Error ? e.message : '测试失败' };
		} finally {
			llmTesting = false;
		}
	}

	async function handleGc() {
		loading = true;
		try {
			const res = await admin.runGc();
			gcResult = res.cleaned;
			showMsg('success', 'GC 完成');
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : 'GC 失败');
		} finally {
			loading = false;
		}
	}

	// --- Styles ---

	async function loadStyles() {
		try {
			const res = await admin.getStyles();
			styles = res.styles;
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '加载画风失败');
		}
	}

	function editStyle(i: number) {
		styleEditIndex = i;
		styleEditName = styles[i].name;
		styleEditTags = styles[i].tags;
		styleEditImage = styles[i].image || '';
	}

	function startStyleRename(i: number) {
		styleRenaming = i;
		styleRenameName = styles[i].name;
		styleRenameTags = styles[i].tags;
	}

	function cancelStyleEdit() {
		styleEditIndex = -1;
	}

	async function commitStyleRename() {
		if (styleRenaming < 0) return;
		const updated = [...styles];
		updated[styleRenaming] = {
			...updated[styleRenaming],
			name: styleRenameName,
			tags: styleRenameTags || updated[styleRenaming].tags
		};
		loading = true;
		try {
			const res = await admin.updateStyles(updated);
			styles = res.styles;
			styleRenaming = -1;
			showMsg('success', '画风已更新');
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '保存失败');
		} finally {
			loading = false;
		}
	}

	async function saveStyle() {
		if (styleEditIndex < 0) return;
		const updated = [...styles];
		updated[styleEditIndex] = {
			name: styleEditName,
			tags: styleEditTags,
			image: styleEditImage,
			thumbnail_url: updated[styleEditIndex].thumbnail_url
		};
		loading = true;
		try {
			const res = await admin.updateStyles(updated);
			styles = res.styles;
			styleEditIndex = -1;
			showMsg('success', '画风已保存');
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '保存失败');
		} finally {
			loading = false;
		}
	}

	async function addStyle() {
		const updated = [...styles, { name: '', tags: 'new_style', image: '' }];
		loading = true;
		try {
			const res = await admin.updateStyles(updated);
			styles = res.styles;
			startStyleRename(styles.length - 1);
			showMsg('success', '已添加');
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '添加失败');
		} finally {
			loading = false;
		}
	}

	async function deleteStyle(i: number) {
		if (!confirm('确认删除该画风？')) return;
		const updated = styles.filter((_, idx) => idx !== i);
		loading = true;
		try {
			const res = await admin.updateStyles(updated);
			styles = res.styles;
			if (styleEditIndex === i) styleEditIndex = -1;
			if (styleRenaming === i) styleRenaming = -1;
			showMsg('success', '已删除');
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '删除失败');
		} finally {
			loading = false;
		}
	}

	async function handleStyleThumbnailUpload(e: Event, i: number) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		loading = true;
		try {
			const res = await admin.uploadStyleThumbnail(file);
			const updated = [...styles];
			updated[i] = { ...updated[i], image: res.filename };
			const metaRes = await admin.updateStyles(updated);
			styles = metaRes.styles;
			showMsg('success', '缩略图已上传并关联');
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '上传失败');
		} finally {
			loading = false;
		}
	}

	// --- Workflows ---

	function getWfMeta(wf: string) {
		return workflowMeta.find((m) => m.workflow === wf);
	}

	async function loadWorkflowFiles() {
		try {
			const res = await admin.getWorkflowFiles();
			workflowFiles = res.files;
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '加载工作流文件失败');
		}
	}

	async function loadWorkflowMeta() {
		try {
			const res = await admin.getWorkflowMeta();
			workflowMeta = res.workflow_meta;
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '加载工作流元数据失败');
		}
	}

	function loadWorkflowsAll() {
		loadWorkflowFiles();
		loadWorkflowMeta();
	}

	function startWfRename(wf: string) {
		wfRenaming = wf;
		wfRenameValue = wf.split('/').pop()?.replace('.json', '') || '';
	}

	async function commitWfRename() {
		const newName = wfRenameValue.trim();
		if (!wfRenaming || !newName) {
			wfRenaming = '';
			return;
		}
		const newNameFull = newName.endsWith('.json') ? newName : newName + '.json';
		if (wfRenaming === newNameFull) {
			wfRenaming = '';
			return;
		}
		loading = true;
		try {
			await admin.renameWorkflow(wfRenaming, newNameFull);
			showMsg('success', '重命名成功');
			wfRenaming = '';
			loadWorkflowsAll();
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '重命名失败');
		} finally {
			loading = false;
		}
	}

	function editWfMeta(wf: string) {
		wfMetaEditWf = wf;
		const existing = getWfMeta(wf);
		wfMetaEditCat = existing?.category || '';
		wfMetaEditLora = existing?.lora_link || '';
	}

	async function saveWfMeta() {
		if (!wfMetaEditWf) return;
		const updated = workflowMeta.filter((m) => m.workflow !== wfMetaEditWf);
		const entry: { workflow: string; category?: string; lora_link?: string; thumbnail?: string } = { workflow: wfMetaEditWf };
		if (wfMetaEditCat) entry.category = wfMetaEditCat;
		if (wfMetaEditLora) entry.lora_link = wfMetaEditLora;
		const existing = getWfMeta(wfMetaEditWf);
		if (existing?.thumbnail) entry.thumbnail = existing.thumbnail;
		updated.push(entry);
		loading = true;
		try {
			const res = await admin.updateWorkflowMeta(updated);
			workflowMeta = res.workflow_meta;
			wfMetaEditWf = '';
			showMsg('success', '元数据已保存');
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '保存失败');
		} finally {
			loading = false;
		}
	}

	async function handleWfThumbnailUpload(e: Event, wf: string) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		loading = true;
		try {
			const res = await admin.uploadWfThumbnail(file);
			// Auto-update meta with new thumbnail filename
			const base = wf.split('/').pop()?.replace('.json', '') || '';
			const updated = workflowMeta.filter((m) => m.workflow !== wf);
			const existing = getWfMeta(wf);
			updated.push({
				workflow: wf,
				thumbnail: res.filename || base,
				category: existing?.category || '',
				lora_link: existing?.lora_link || ''
			});
			const metaRes = await admin.updateWorkflowMeta(updated);
			workflowMeta = metaRes.workflow_meta;
			showMsg('success', '缩略图已上传并关联');
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '上传失败');
		} finally {
			loading = false;
			wfUploadTarget = '';
		}
	}

	// Tab change triggers data loading
	$effect(() => {
		const tab = activeTab;
		if (!authToken) return;
		switch (tab) {
			case 'announcement':
				loadAnnouncement();
				break;
			case 'images':
				if (recentImages.length === 0) loadRecent();
				break;
			case 'recommendations':
				loadRecommendations();
				break;
			case 'featured':
				loadFeatured();
				break;
			case 'banned':
				loadBanned();
				break;
			case 'limits':
				loadLimits();
				break;
			case 'styles':
				loadStyles();
				break;
			case 'workflows':
				loadWorkflowsAll();
				break;
		}
	});

	onMount(() => {
	columnCount = getColumnCount();
	imgColumns = Array.from({ length: columnCount }, () => []);
	columnHeights = new Array(columnCount).fill(0);
	if (sentinelEl) {
		io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting && !loadingMore && hasMore)) loadMoreRecent();
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

function formatTime(ts: number) {
		return new Date(ts * 1000).toLocaleString('zh-CN');
	}
</script>

<svelte:head>
	<title>生图管理 - {siteConfig.title}</title>
</svelte:head>

<div class="w-full max-w-5xl mx-auto px-4 py-6 space-y-4">
	<div class="flex items-center gap-2">
		<a href="/draw" class="text-muted-foreground hover:text-foreground">
			<Icon icon="mdi:arrow-left" class="size-5" />
		</a>
		<Icon icon="mdi:shield-crown-outline" class="size-6 text-primary" />
		<h1 class="text-xl font-bold">生图管理</h1>
	</div>

	{#if !authToken}
		<Alert>
			<Icon icon="mdi:account-alert-outline" class="size-4" />
			<AlertDescription class="text-xs">
				请先<a href="/forum/auth/login" class="underline font-medium">登录论坛</a>（需要管理员账号）。
			</AlertDescription>
		</Alert>
	{:else}
		{#if message}
			<Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
				<AlertDescription class="text-xs">{message.text}</AlertDescription>
			</Alert>
		{/if}

		<Tabs bind:value={activeTab} class="w-full">
			<TabsList class="w-full flex flex-wrap gap-1 overflow-visible min-h-9 !h-auto">
				<TabsTrigger value="announcement" class="text-xs">
					<Icon icon="mdi:bullhorn-outline" class="size-3.5 mr-1" />公告
				</TabsTrigger>
				<TabsTrigger value="images" class="text-xs">
					<Icon icon="mdi:image-multiple-outline" class="size-3.5 mr-1" />图片
				</TabsTrigger>
				<TabsTrigger value="recommendations" class="text-xs">
					<Icon icon="mdi:star-plus-outline" class="size-3.5 mr-1" />自荐
				</TabsTrigger>
				<TabsTrigger value="featured" class="text-xs">
					<Icon icon="mdi:star-outline" class="size-3.5 mr-1" />精选
				</TabsTrigger>
				<TabsTrigger value="banned" class="text-xs">
					<Icon icon="mdi:account-cancel-outline" class="size-3.5 mr-1" />封禁
				</TabsTrigger>
				<TabsTrigger value="limits" class="text-xs">
					<Icon icon="mdi:tune-vertical" class="size-3.5 mr-1" />配置
				</TabsTrigger>
				<TabsTrigger value="llm" class="text-xs">
					<Icon icon="mdi:brain" class="size-3.5 mr-1" />LLM
				</TabsTrigger>
				<TabsTrigger value="gc" class="text-xs">
					<Icon icon="mdi:broom" class="size-3.5 mr-1" />GC
				</TabsTrigger>
				<TabsTrigger value="styles" class="text-xs">
					<Icon icon="mdi:palette-outline" class="size-3.5 mr-1" />画风
				</TabsTrigger>
				<TabsTrigger value="workflows" class="text-xs">
					<Icon icon="mdi:cog-outline" class="size-3.5 mr-1" />工作流
				</TabsTrigger>
			</TabsList>


			<!-- Announcement -->
			<TabsContent value="announcement" class="mt-4">
				<Card>
					<CardHeader>
						<CardTitle class="text-base flex items-center gap-2">
							公告管理
							{#if announcement.enabled}
								<Badge>已开启</Badge>
							{:else}
								<Badge variant="secondary">已关闭</Badge>
							{/if}
						</CardTitle>
					</CardHeader>
					<CardContent class="space-y-4">
						<div class="flex items-center gap-3">
							<Switch bind:checked={announcement.enabled} />
							<Label>{announcement.enabled ? '开启' : '关闭'}</Label>
						</div>
						<div class="space-y-1.5">
							<Label class="text-xs">标题</Label>
							<Input bind:value={announcement.title} placeholder="公告标题" />
						</div>
						<div class="space-y-1.5">
							<Label class="text-xs">内容</Label>
							<textarea
								bind:value={announcement.content}
								rows={4}
								placeholder="公告内容..."
								class="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
							></textarea>
						</div>
						<Button onclick={saveAnnouncement} disabled={loading}>
							<Icon icon="mdi:content-save" class="size-4 mr-1" />
							保存
						</Button>
					</CardContent>
				</Card>
			</TabsContent>

			<!-- Images -->
			<TabsContent value="images" class="mt-4 space-y-4">
				<Card>
					<CardHeader>
						<CardTitle class="text-base">图片管理</CardTitle>
						<CardDescription>共 {recentTotal} 张图片</CardDescription>
					</CardHeader>
					<CardContent class="space-y-3">
						<div class="flex flex-wrap gap-2">
							<Button variant="outline" size="sm" onclick={loadRecent} disabled={loading}>
								<Icon icon="mdi:refresh" class="size-4 mr-1" />刷新
							</Button>
							{#if selectedPaths.size > 0}
								<Button variant="default" size="sm" onclick={handleAddSelectedToFeatured} disabled={loading}>
									<Icon icon="mdi:star" class="size-4 mr-1" />
									加入精选 ({selectedPaths.size})
								</Button>
								<Button variant="destructive" size="sm" onclick={handleDeleteSelected} disabled={loading}>
									<Icon icon="mdi:delete" class="size-4 mr-1" />
									删除选中 ({selectedPaths.size})
								</Button>
							{/if}
						</div>
						<div class="flex gap-2">
							<Input
								bind:value={searchUserId}
								placeholder="按用户 ID 查询"
								class="max-w-48"
								type="number"
							/>
							<Button variant="outline" size="sm" onclick={searchByUser} disabled={loading}>查询</Button>
						</div>
					</CardContent>
				</Card>
				{#if recentImages.length > 0}
					<div class="flex gap-2 items-start">
						{#each imgColumns as col, ci (ci)}
							<div class="flex flex-1 flex-col gap-2 min-w-0">
								{#each col as path (path)}
									{@const img = recentImages.find(i => i.path === path)}
									{#if img}
										<div class="relative group">
											<button
												class="w-full rounded-md overflow-hidden border {selectedPaths.has(img.path) ? 'ring-2 ring-primary' : ''}"
												onclick={() => openLb(img.path)}
											>
												<img
													src={getImageProxyUrl(img.path)}
													alt={img.path}
													loading="lazy"
													decoding="async"
													style="aspect-ratio: 1;"
													onload={handleImgLoad}
													class="block w-full h-auto bg-muted"
												/>
											</button>
											<div class="absolute top-1 left-1">
												<input
													type="checkbox"
													checked={selectedPaths.has(img.path)}
													onchange={() => toggleSelect(img.path)}
													onclick={(e) => e.stopPropagation()}
													class="size-4 accent-primary opacity-60 group-hover:opacity-100 transition-opacity"
												/>
											</div>
											<div class="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
												<button
													class="p-0.5 rounded bg-destructive/80 text-white hover:bg-destructive"
													onclick={(e) => { e.stopPropagation(); handleDeleteOne(img.path); }}
													title="删除"
												>
													<Icon icon="mdi:delete" class="size-3.5" />
												</button>
											</div>
											<div class="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] px-1 py-0.5 truncate pointer-events-none">
												{img.user_id || '?'}
											</div>
										</div>
									{/if}
								{/each}
							</div>
						{/each}
					</div>
					{#if !hasMore && recentImages.length > 0}
						<div class="text-center text-xs text-muted-foreground py-2">已加载全部</div>
					{/if}
					<div bind:this={sentinelEl} class="h-4"></div>
				{/if}
			</TabsContent>

			<!-- Recommendations -->
			<TabsContent value="recommendations" class="mt-4">
				<Card>
					<CardHeader>
						<CardTitle class="text-base flex items-center gap-2">
							自荐审核
							{#if recommendations.length > 0}
								<Badge variant="secondary">{recommendations.length}</Badge>
							{/if}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<Button variant="outline" size="sm" onclick={loadRecommendations} disabled={loading} class="mb-3">
							<Icon icon="mdi:refresh" class="size-4 mr-1" />刷新
						</Button>
						{#if recommendations.length === 0}
							<div class="text-sm text-muted-foreground py-4 text-center">无待审核自荐</div>
						{:else}
							<div class="space-y-3">
								{#each recommendations as rec}
									<div class="border rounded-lg p-3 space-y-2">
										<div class="flex items-start justify-between gap-2">
											<div class="space-y-1 min-w-0">
												<div class="flex items-center gap-2">
													<Badge variant="outline" class="text-xs">ID: {rec.id.slice(0, 8)}</Badge>
													<span class="text-xs text-muted-foreground">{formatTime(rec.timestamp)}</span>
												</div>
												<div class="text-xs">
													<span class="text-muted-foreground">图片：</span>
													<span class="font-mono">{rec.image_path}</span>
												</div>
												<div class="text-xs">
													<span class="text-muted-foreground">用户ID：</span>{rec.user_id}
												</div>
												{#if rec.user_reason}
													<div class="text-xs">
														<span class="text-muted-foreground">理由：</span>{rec.user_reason}
													</div>
												{/if}
											</div>
											<button
												class="shrink-0 size-12 rounded overflow-hidden border"
												onclick={() => openLb(rec.image_path)}
											>
												<img
													src={getImageProxyUrl(rec.image_path)}
													alt=""
													class="w-full h-full object-cover"
													loading="lazy"
												/>
											</button>
										</div>
										<div class="flex flex-wrap gap-1.5 items-center">
											<Button size="sm" variant="default" onclick={() => resolveRec(rec.id, 'approve')} disabled={loading}>
												通过
											</Button>
											<Input
												bind:value={recRejectReasons[rec.id]}
												placeholder="拒绝理由（可选）"
												class="h-8 text-xs flex-1 min-w-[140px]"
											/>
											<Button size="sm" variant="destructive" onclick={() => resolveRec(rec.id, 'reject')} disabled={loading}>
												拒绝
											</Button>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</CardContent>
				</Card>
			</TabsContent>

			<!-- Featured -->
			<TabsContent value="featured" class="mt-4">
				<Card>
					<CardHeader>
						<CardTitle class="text-base">精选管理</CardTitle>
					</CardHeader>
					<CardContent class="space-y-3">
						<div class="flex gap-2">
							<Input
								bind:value={newFeaturedPath}
								placeholder="输入图片相对路径"
								class="flex-1"
							/>
							<Button size="sm" onclick={handleAddFeatured} disabled={loading}>
								<Icon icon="mdi:plus" class="size-4 mr-1" />添加
							</Button>
						</div>
						<Button variant="outline" size="sm" onclick={loadFeatured} disabled={loading}>
							<Icon icon="mdi:refresh" class="size-4 mr-1" />刷新
						</Button>
						{#if featuredPaths.length === 0}
							<div class="text-sm text-muted-foreground py-4 text-center">无精选图片</div>
						{:else}
							<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
								{#each featuredPaths as path}
									<div class="relative group">
										<button
											class="aspect-square rounded-md overflow-hidden border w-full"
											onclick={() => openLb(path)}
										>
											<img
												src={getImageProxyUrl(path)}
												alt={path}
												class="w-full h-full object-cover"
												loading="lazy"
											/>
										</button>
										<button
											class="absolute top-1 right-1 p-0.5 rounded bg-destructive/80 text-white hover:bg-destructive opacity-0 group-hover:opacity-100 transition-opacity"
											onclick={() => handleRemoveFeatured(path)}
											title="移除"
										>
											<Icon icon="mdi:close" class="size-3.5" />
										</button>
									</div>
								{/each}
							</div>
						{/if}
					</CardContent>
				</Card>
			</TabsContent>

			<!-- Banned -->
			<TabsContent value="banned" class="mt-4">
				<Card>
					<CardHeader>
						<CardTitle class="text-base">封禁管理</CardTitle>
					</CardHeader>
					<CardContent class="space-y-3">
						<div class="flex gap-2">
							<Input
								bind:value={newBanUserId}
								placeholder="输入用户 ID"
								type="number"
								class="max-w-48"
							/>
							<Button size="sm" variant="destructive" onclick={handleBan} disabled={loading}>
								<Icon icon="mdi:account-cancel" class="size-4 mr-1" />封禁
							</Button>
						</div>
						<Button variant="outline" size="sm" onclick={loadBanned} disabled={loading}>
							<Icon icon="mdi:refresh" class="size-4 mr-1" />刷新
						</Button>
						{#if bannedUsers.length === 0}
							<div class="text-sm text-muted-foreground py-4 text-center">无封禁用户</div>
						{:else}
							<div class="space-y-1.5">
								{#each bannedUsers as uid}
									<div class="flex items-center justify-between border rounded-md px-3 py-2">
										<span class="text-sm font-mono">{uid}</span>
										<Button size="sm" variant="ghost" onclick={() => handleUnban(uid)} disabled={loading}>
											<Icon icon="mdi:account-check" class="size-4 mr-1" />解封
										</Button>
									</div>
								{/each}
							</div>
						{/if}
					</CardContent>
				</Card>
			</TabsContent>

			<!-- Limits -->
			<TabsContent value="limits" class="mt-4">
				<Card>
					<CardHeader>
						<CardTitle class="text-base">系统配置</CardTitle>
						<CardDescription>修改速率限制和其他参数</CardDescription>
					</CardHeader>
					<CardContent class="space-y-4">
						<Button variant="outline" size="sm" onclick={loadLimits} disabled={loading}>
							<Icon icon="mdi:refresh" class="size-4 mr-1" />加载
						</Button>
						{#if limits}
							{@render limitField('生成冷却（秒）', 'gen_cooldown_sec', 'number')}
							{@render limitField('速率窗口（秒）', 'image_rate_window_sec', 'number')}
							{@render limitField('速率上限', 'image_rate_max', 'number')}
							{@render limitField('举报窗口（秒）', 'report_window_sec', 'number')}
							{@render limitField('举报窗口上限', 'report_window_max', 'number')}
							{@render limitField('待处理举报上限', 'report_pending_max', 'number')}
							{@render limitField('GPU 轮询间隔（ms）', 'gpu_poll_interval_ms', 'number')}
							{@render limitField('GPU 缓存 TTL（ms）', 'gpu_cache_ttl_ms', 'number')}
							{@render limitField('GC 间隔（小时）', 'gc_interval_hours', 'number')}
							<Button onclick={saveLimits} disabled={loading}>
								<Icon icon="mdi:content-save" class="size-4 mr-1" />
								保存配置
							</Button>
						{/if}
					</CardContent>
				</Card>
			</TabsContent>

			<!-- LLM Config -->
			<TabsContent value="llm" class="mt-4">
				<Card>
					<CardHeader>
						<CardTitle class="text-base flex items-center gap-2">
							<Icon icon="mdi:brain" class="size-5" />
							LLM 配置
						</CardTitle>
						<CardDescription>配置 AI 改写/翻译所用的大语言模型</CardDescription>
					</CardHeader>
					<CardContent class="space-y-4">
						<Button variant="outline" size="sm" onclick={loadLlmConfig} disabled={loading}>
							<Icon icon="mdi:refresh" class="size-4 mr-1" />加载
						</Button>
						{#if llmConfig}
							<div class="space-y-1.5">
								<Label class="text-xs">模型提供商</Label>
								<div class="flex gap-2">
									{#each llmProviders as p}
										<button
											class="px-3 py-1.5 text-xs rounded-md border transition-colors {llmConfig.provider === p ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:bg-accent'}"
											onclick={() => { if (llmConfig) llmConfig.provider = p as AdminLlmConfig['provider']; }}
										>{p}</button>
									{/each}
								</div>
							</div>

							{#if llmConfig.provider === 'local'}
								<div class="space-y-1.5">
									<Label class="text-xs">本地端点</Label>
									<Input class="text-xs" bind:value={llmConfig.local_endpoint} placeholder={llmDefaults?.local_endpoint || ''} />
								</div>
							{:else if llmConfig.provider === 'google'}
								<div class="space-y-1.5">
									<Label class="text-xs">API Key</Label>
									<Input class="text-xs" type="password" bind:value={llmConfig.google_api_key} placeholder="留空不修改，输入新值覆盖" />
								</div>
								<div class="space-y-1.5">
									<Label class="text-xs">模型名称</Label>
									<Input class="text-xs" bind:value={llmConfig.google_model} placeholder={llmDefaults?.google_model || ''} />
								</div>
								<div class="space-y-1.5">
									<Label class="text-xs">思维链</Label>
									{#each thinkingGroups as group}
										<div class="space-y-1">
											{#if group.label !== '关闭'}
												<p class="text-[10px] text-muted-foreground">{group.label}</p>
											{/if}
											<div class="flex flex-wrap gap-1">
												{#each group.options as opt}
													{#if llmThinkingOptions.includes(opt)}
														<button
															class="px-2 py-1 text-xs rounded border transition-colors {llmConfig.google_thinking === opt ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent'}"
															onclick={() => { if (llmConfig) llmConfig.google_thinking = opt; }}
														>{thinkingLabels[opt] || opt}</button>
													{/if}
												{/each}
											</div>
										</div>
									{/each}
								</div>
							{:else if llmConfig.provider === 'custom'}
								<div class="space-y-1.5">
									<Label class="text-xs">API 端点（OpenAI 兼容）</Label>
									<Input class="text-xs" bind:value={llmConfig.custom_endpoint} placeholder={llmDefaults?.custom_endpoint || ''} />
								</div>
								<div class="space-y-1.5">
									<Label class="text-xs">API Key</Label>
									<Input class="text-xs" type="password" bind:value={llmConfig.custom_api_key} placeholder="留空不修改，输入新值覆盖" />
								</div>
								<div class="space-y-1.5">
									<Label class="text-xs">模型名称</Label>
									<Input class="text-xs" bind:value={llmConfig.custom_model} placeholder={llmDefaults?.custom_model || ''} />
								</div>
							{/if}

							<div class="flex items-center gap-2">
								<Switch bind:checked={llmConfig.llm_stream} />
								<Label class="text-xs">流式输出（SSE）</Label>
							</div>

							<div class="flex gap-2">
								<Button onclick={saveLlmConfig} disabled={loading}>
									<Icon icon="mdi:content-save" class="size-4 mr-1" />
									保存配置
								</Button>
								<Button variant="outline" onclick={testLlmConfig} disabled={llmTesting || loading}>
									<Icon icon={llmTesting ? 'mdi:loading' : 'mdi:flask-outline'} class="size-4 mr-1 {llmTesting ? 'animate-spin' : ''}" />
									测试
								</Button>
							</div>
							{#if llmTestResult}
								<Alert variant={llmTestResult.ok ? 'default' : 'destructive'}>
									<AlertDescription class="text-xs">
										{#if llmTestResult.ok}
											<span class="font-medium text-green-600">✓ {llmTestResult.provider}</span> — {llmTestResult.reply}
										{:else}
											<span class="font-medium">✗ 失败</span> — {llmTestResult.error}
										{/if}
									</AlertDescription>
								</Alert>
							{/if}
						{/if}
					</CardContent>
				</Card>
			</TabsContent>

			<!-- GC -->
			<TabsContent value="gc" class="mt-4">
				<Card>
					<CardHeader>
						<CardTitle class="text-base">垃圾回收</CardTitle>
						<CardDescription>清理已解决的举报、过期的速率限制条目和孤立的创作者映射</CardDescription>
					</CardHeader>
					<CardContent class="space-y-3">
						<Button onclick={handleGc} disabled={loading}>
							<Icon icon="mdi:broom" class="size-4 mr-1" />
							执行 GC
						</Button>
						{#if gcResult}
							<div class="border rounded-md p-3 text-xs space-y-1">
								{#each Object.entries(gcResult) as [key, val]}
									<div class="flex justify-between">
										<span class="text-muted-foreground">{key}</span>
										<span class="font-mono">{val}</span>
									</div>
								{/each}
							</div>
						{/if}
					</CardContent>
				</Card>
			</TabsContent>

			<!-- Styles -->
			<TabsContent value="styles" class="mt-4">
				<Card>
					<CardHeader>
						<CardTitle class="text-base flex items-center gap-2">
							画风管理
							<Badge variant="secondary">{styles.length}</Badge>
						</CardTitle>
						<CardDescription>点击缩略图上传图片，双击名称编辑别名和标签</CardDescription>
					</CardHeader>
					<CardContent class="space-y-3">
						<div class="flex flex-wrap gap-2">
							<Button variant="outline" size="sm" onclick={() => { styleRenaming = -1; styleEditIndex = -1; loadStyles(); }} disabled={loading}>
								<Icon icon="mdi:refresh" class="size-4 mr-1" />刷新
							</Button>
							<Button size="sm" onclick={addStyle} disabled={loading}>
								<Icon icon="mdi:plus" class="size-4 mr-1" />添加画风
							</Button>
						</div>

						<!-- Edit panel for detailed editing -->
						{#if styleEditIndex >= 0 && styles[styleEditIndex]}
							<Card class="border-primary">
								<CardHeader class="pb-2">
									<CardTitle class="text-sm">编辑画风详情</CardTitle>
								</CardHeader>
								<CardContent class="space-y-2">
									<div class="flex gap-2">
										<div class="flex-1 space-y-1">
											<Label class="text-xs">名称（别名）</Label>
											<Input bind:value={styleEditName} placeholder="画风名称" />
										</div>
										<div class="flex-1 space-y-1">
											<Label class="text-xs">Tags</Label>
											<Input bind:value={styleEditTags} placeholder="标签（必填）" />
										</div>
									</div>
									<div class="space-y-1">
										<Label class="text-xs">缩略图文件名</Label>
										<Input bind:value={styleEditImage} placeholder="缩略图文件名" />
									</div>
									<div class="flex gap-2">
										<Button size="sm" onclick={saveStyle} disabled={loading}>
											<Icon icon="mdi:content-save" class="size-4 mr-1" />保存
										</Button>
										<Button size="sm" variant="ghost" onclick={cancelStyleEdit}>取消</Button>
									</div>
								</CardContent>
							</Card>
						{/if}

						<!-- Style grid -->
						{#if styles.length === 0}
							<div class="text-sm text-muted-foreground py-4 text-center">无画风</div>
						{:else}
							<div class="flex flex-wrap gap-2">
								{#each styles as s, i}
									<div class="inline-flex flex-col items-center gap-1 p-1.5 rounded-md border border-border hover:bg-accent transition-all group {styleRenaming === i ? 'border-primary ring-1 ring-primary/30' : ''}">
										<!-- Thumbnail: click to upload -->
										<button
											class="relative size-12 rounded overflow-hidden shrink-0 bg-muted flex items-center justify-center cursor-pointer"
											onclick={() => { document.getElementById(`style-thumb-${i}`)?.click(); }}
											title="点击上传缩略图"
										>
											{#if s.thumbnail_url}
												<img
													src="{currentBaseUrl}{s.thumbnail_url}"
													alt=""
													class="w-full h-full object-cover"
													loading="lazy"
												/>
											{:else}
												<Icon icon="mdi:image-plus-outline" class="size-5 text-muted-foreground" />
											{/if}
											<div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
												<Icon icon="mdi:upload" class="size-4 text-white" />
											</div>
										</button>
										<input
											type="file"
											accept="image/*"
											class="hidden"
											id="style-thumb-{i}"
											onchange={(e) => handleStyleThumbnailUpload(e, i)}
										/>

										<!-- Name: double-click to rename -->
										{#if styleRenaming === i}
											<div class="flex flex-col items-center gap-0.5 w-24">
												<input
													type="text"
													class="w-full text-xs text-center border rounded px-1 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
													bind:value={styleRenameName}
													placeholder="别名"
													onkeydown={(e) => { if (e.key === 'Enter') commitStyleRename(); if (e.key === 'Escape') styleRenaming = -1; }}
												/>
												<input
													type="text"
													class="w-full text-[10px] text-center border rounded px-1 py-0.5 bg-background font-mono focus:outline-none focus:ring-1 focus:ring-ring"
													bind:value={styleRenameTags}
													placeholder="tags"
													onkeydown={(e) => { if (e.key === 'Enter') commitStyleRename(); if (e.key === 'Escape') styleRenaming = -1; }}
													onblur={commitStyleRename}
												/>
											</div>
										{:else}
											<span
												class="text-xs text-center truncate max-w-24 cursor-default"
												title="双击编辑 | 右键详情"
												ondblclick={() => startStyleRename(i)}
												oncontextmenu={(e) => { e.preventDefault(); editStyle(i); }}
											>
												{s.name || s.tags}
											</span>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</CardContent>
				</Card>
			</TabsContent>

			<!-- Workflows -->
			<TabsContent value="workflows" class="mt-4 space-y-4">
				<Card>
					<CardHeader>
						<CardTitle class="text-base flex items-center gap-2">
							工作流管理
							<Badge variant="secondary">{workflowFiles.length}</Badge>
						</CardTitle>
						<CardDescription>点击缩略图上传图片，双击名称重命名</CardDescription>
					</CardHeader>
					<CardContent class="space-y-3">
						<Button variant="outline" size="sm" onclick={() => { wfRenaming = ''; wfMetaEditWf = ''; loadWorkflowsAll(); }} disabled={loading}>
							<Icon icon="mdi:refresh" class="size-4 mr-1" />刷新
						</Button>

						<!-- Metadata edit panel -->
						{#if wfMetaEditWf}
							<Card class="border-primary">
								<CardHeader class="pb-2">
									<CardTitle class="text-sm">编辑元数据: {wfMetaEditWf.split('/').pop()?.replace('.json', '') || ''}</CardTitle>
								</CardHeader>
								<CardContent class="space-y-2">
									<div class="flex gap-2">
										<div class="flex-1 space-y-1">
											<Label class="text-xs">分类</Label>
											<Input bind:value={wfMetaEditCat} placeholder="分类名称" />
										</div>
										<div class="flex-1 space-y-1">
											<Label class="text-xs">Lora 链接</Label>
											<Input bind:value={wfMetaEditLora} placeholder="https://..." />
										</div>
									</div>
									<div class="flex gap-2">
										<Button size="sm" onclick={saveWfMeta} disabled={loading}>
											<Icon icon="mdi:content-save" class="size-4 mr-1" />保存
										</Button>
										<Button size="sm" variant="ghost" onclick={() => (wfMetaEditWf = '')}>取消</Button>
									</div>
								</CardContent>
							</Card>
						{/if}

						<!-- Workflow grid -->
						{#if workflowFiles.length > 0}
							<div class="flex flex-wrap gap-2">
								{#each workflowFiles as wf}
									{@const meta = getWfMeta(wf)}
									<div class="inline-flex flex-col items-center gap-1 p-1.5 rounded-md border border-border hover:bg-accent transition-all group">
										<!-- Thumbnail: click to upload -->
										<button
											class="relative size-12 rounded overflow-hidden shrink-0 bg-muted flex items-center justify-center cursor-pointer"
											onclick={() => { document.getElementById(`wf-thumb-${wf}`)?.click(); }}
											title="点击上传缩略图"
										>
											{#if meta?.thumbnail}
												<img
													src={getThumbnailUrl(wf)}
													alt=""
													class="w-full h-full object-cover"
													loading="lazy"
												/>
											{:else}
												<Icon icon="mdi:image-plus-outline" class="size-5 text-muted-foreground" />
											{/if}
											<div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
												<Icon icon="mdi:upload" class="size-4 text-white" />
											</div>
										</button>
										<!-- Hidden file input per workflow -->
										<input
											type="file"
											accept="image/*"
											class="hidden"
											id="wf-thumb-{wf}"
											onchange={(e) => handleWfThumbnailUpload(e, wf)}
										/>

										<!-- Name: double-click to rename -->
										{#if wfRenaming === wf}
											<input
												type="text"
												class="w-24 text-xs text-center border rounded px-1 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
												bind:value={wfRenameValue}
												onkeydown={(e) => { if (e.key === 'Enter') commitWfRename(); if (e.key === 'Escape') wfRenaming = ''; }}
												onblur={commitWfRename}
											/>
										{:else}
											<span
												class="text-xs text-center truncate max-w-24 cursor-default"
												title="双击重命名 | 右键编辑元数据"
												ondblclick={() => startWfRename(wf)}
												oncontextmenu={(e) => { e.preventDefault(); editWfMeta(wf); }}
											>
												{wf.split('/').pop()?.replace('.json', '') || ''}
											</span>
										{/if}
									</div>
								{/each}
							</div>
						{:else}
							<div class="text-sm text-muted-foreground py-4 text-center">无工作流</div>
						{/if}
					</CardContent>
				</Card>
			</TabsContent>
		</Tabs>
	{/if}
</div>

<ImageLightbox
	open={lbOpen}
	images={lbImages}
	index={0}
	onclose={() => (lbOpen = false)}
	onfork={handleAdminFork}
/>

{#snippet limitField(label: string, key: keyof AdminLimits, type: 'number' | 'text')}
	{#if limits}
		<div class="flex items-center gap-3">
			<Label class="text-xs w-40 shrink-0">{label}</Label>
			{#if type === 'number'}
				<Input
					type="number"
					value={limits[key]}
					oninput={(e) => {
						if (limits) limits = { ...limits, [key]: Number(e.currentTarget.value) };
					}}
					class="max-w-32"
				/>
			{:else}
				<Input
					type="text"
					value={String(limits[key])}
					oninput={(e) => {
						if (limits) limits = { ...limits, [key]: e.currentTarget.value };
					}}
					class="flex-1"
				/>
			{/if}
			{#if defaults}
				<span class="text-[10px] text-muted-foreground">默认: {defaults[key]}</span>
			{/if}
		</div>
	{/if}
{/snippet}

