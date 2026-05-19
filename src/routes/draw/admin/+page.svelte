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
	import { getImageProxyUrl, getImageUrl, getThumbnailUrl, forkOutputImage, clearQueue, fetchDebugInfo } from '$lib/draw/api/client';
	import { pendingFork } from '$lib/draw/stores/fork';
import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
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
	let activeTab = $state(location.hash?.slice(1) || 'announcement');

	$effect(() => {
		const h = location.hash?.slice(1);
		if (h) activeTab = h;
	});

	$effect(() => {
		if (activeTab) history.replaceState(null, '', '#' + activeTab);
	});
	let loading = $state(false);
	let clearing = $state(false);
	let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);


	// Announcement
	let announcement = $state<AdminAnnouncement>({ enabled: false, title: '', content: '' });

	// Recent images
	let recentImages = $state<AdminRecentImage[]>([]);
	let recentTotal = $state(0);
	let recentOffset = $state(0);
	let recentLimit = $state(50);
	let selectedPaths = $state<Set<string>>(new Set());
		let selectMode = $state(false);
	let searchUserId = $state('');
// Masonry layout
let columnCount = $state(4);
let imgColumns = $state<string[][]>([[], [], [], []]);
let columnHeights: number[] = [0, 0, 0, 0];
let sentinelEl = $state<HTMLDivElement | undefined>(undefined);
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
	let bannedUsers = $state<admin.BanEntry[]>([]);
	let newBanUserId = $state('');
	let newBanDays = $state(7);
	let newBanReason = $state('');

	// Collaborators
	let collaborators = $state<{ user_id: number; added_by: number; added_at: number }[]>([]);
	let newCollaboratorId = $state('');
	let pendingNominations = $state<Nomination[]>([]);
	let nomMasonryItems = $derived(pendingNominations.flatMap((n: Nomination) => n.image_paths.map((p: string) => ({ path: p, nomination: n }))));
	let nomImgColumns = $state<string[][]>([]);
	let nomImgHeights: number[] = [];
	let nomRejectReasons = $state<Record<string, string>>({});
		let nomDialogItem = $state<any>(null);

	function fmtBanDate(ts: number): string {
		const d = new Date((ts || 0) * 1000);
		return d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
	}

	// Limits
	let limits = $state<AdminLimits | null>(null);
	let defaults = $state<AdminLimits | null>(null);

	// LLM Config
	let llmConfig = $state<AdminLlmConfig | null>(null);
		let llmProviders = $state<string[]>([]);
		let llmTestResult = $state<{ ok: boolean; provider: string; profile_index?: number; reply?: string; error?: string; raw?: string } | null>(null);
	let llmTesting = $state(false);
		let llmModels = $state<string[] | null>(null);
		let llmModelsLoading = $state(false);
		let llmActiveTab = $state(0);

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
	let debugData = $state<any>(null);
	let debugLoading = $state(false);
	let debugError = $state('');

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
	let lbImages = $state<{ src: string; creator_id?: string; cached?: string }[]>([]);
	let recMasonryEl = $state<HTMLDivElement | undefined>(undefined);
	let recDialogItem = $state<any>(null);
	let recDialogId = $derived(recDialogItem?.id ?? '');

	// Image detail popup
	let detailImg = $state<AdminRecentImage | null>(null);
	let detailImgSrc = $derived(detailImg ? getImageProxyUrl(detailImg.path) : '');

	function openRecDialog(rec: any, i: number) {
		recDialogItem = rec;
	}
	function closeRecDialog() {
		recDialogItem = null;
	}

	function openLb(path: string) {
		lbImages = [{ src: getImageUrl(path), creator_id: '', cached: getImageProxyUrl(path) }];
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
				workflow_api: res.workflow_api || null,
				workflow_path: res.workflow_path || '',
				workflow_name: res.workflow_name || '',
				matched_workflow: res.matched_workflow
			});
			showMsg('success', 'Fork 成功，请切换至生图页面');
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : 'Fork 失败');
		}
	}

let recMasonry: any = null;
$effect(() => {
		if (recMasonryEl && recommendations.length > 0) {
			const el = recMasonryEl;
			setTimeout(() => {
				import('masonry-layout').then(m => {
					if (recMasonry) recMasonry.destroy();
					recMasonry = new m.default(el, {
						itemSelector: '.rec-item',
						columnWidth: '.rec-sizer',
						percentPosition: true,
					});
					const imgs = el.querySelectorAll('img');
					let loaded = 0, total = imgs.length;
					if (total === 0) return;
					for (const img of imgs) {
						if (img.complete) { loaded++; if (loaded === total) recMasonry.layout(); }
						else img.addEventListener('load', () => { loaded++; if (loaded === total) recMasonry.layout(); });
					}
				});
			}, 50);
		}
	});

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
		if (loadingMore) return;
		loading = true;
		try {
			loadingMore = true;
			const res = await admin.getRecentImages(recentLimit, 0);
			const deduped = res.items.filter((v, i, a) => a.findIndex(t => t.path === v.path) === i);
			recentImages = deduped;
			recentTotal = res.total;
			recentOffset = res.items.length;
			loadingMore = false;
			selectedPaths = new Set();
			columnCount = getColumnCount();
			imgColumns = Array.from({ length: columnCount }, () => []);
			columnHeights = new Array(columnCount).fill(0);
			for (const item of deduped) pushToShortest(item.path);
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
			const moreDeduped = res.items.filter((v, i, a) => a.findIndex(t => t.path === v.path) === i && !recentImages.some(ex => ex.path === v.path));
			recentImages = [...recentImages, ...moreDeduped];
			recentOffset += res.items.length;
			for (const item of moreDeduped) pushToShortest(item.path);
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
			const deduped = res.items.filter((v, i, a) => a.findIndex(t => t.path === v.path) === i);
			recentImages = deduped;
			recentTotal = res.total;
			recentOffset = deduped.length;
			hasMore = false;
			selectedPaths = new Set();
			columnCount = getColumnCount();
			imgColumns = Array.from({ length: columnCount }, () => []);
			columnHeights = new Array(columnCount).fill(0);
			for (const item of deduped) pushToShortest(item.path);
			imgColumns = [...imgColumns];
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
						flat.push(recentImages[j].path); break;
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

	function rebuildNomImgColumns() {
		const cc = getColumnCount();
		nomImgColumns = Array.from({ length: cc }, () => []);
		nomImgHeights = new Array(cc).fill(0);
		for (const item of nomMasonryItems) {
			let minIdx = 0;
			for (let i = 1; i < nomImgHeights.length; i++) {
				if (nomImgHeights[i] < nomImgHeights[minIdx]) minIdx = i;
			}
			nomImgColumns[minIdx] = [...nomImgColumns[minIdx], item.path];
			nomImgHeights[minIdx] += 1;
		}
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
			bannedUsers = Array.isArray(res.banned) ? res.banned.filter((b: any) => typeof b === 'object') : [];
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '加载失败');
		}
	}

	async function handleBan() {
		if (!newBanUserId) return;
		loading = true;
		try {
			const res = await admin.banUser(Number(newBanUserId), newBanDays || 7, newBanReason || '违规行为');
			bannedUsers = Array.isArray(res.banned) ? res.banned.filter((b: any) => typeof b === 'object') : [];
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
			bannedUsers = Array.isArray(res.banned) ? res.banned.filter((b: any) => typeof b === 'object') : [];
			showMsg('success', '已解封');
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '解封失败');
		} finally {
			loading = false;
		}
	}

	async function loadCollaboratorsTab() {
		try {
			const [c, n] = await Promise.all([
				admin.getCollaborators(),
				admin.getPendingNominations()
			]);
			collaborators = c.collaborators;
			pendingNominations = n.items;
			rebuildNomImgColumns();
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '加载失败');
		}
	}

	async function handleAddCollaborator() {
		if (!newCollaboratorId) return;
		loading = true;
		try {
			const res = await admin.addCollaborator(Number(newCollaboratorId));
			collaborators = res.collaborators;
			newCollaboratorId = '';
			showMsg('success', '已添加');
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '添加失败');
		} finally {
			loading = false;
		}
	}

	async function handleRemoveCollaborator(userId: number) {
		if (!confirm(`确定移除协作者 ${userId}？`)) return;
		loading = true;
		try {
			const res = await admin.removeCollaborator(userId);
			collaborators = res.collaborators;
			showMsg('success', '已移除');
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '移除失败');
		} finally {
			loading = false;
		}
	}

	async function handleNominationResolve(id: string, action: 'approve' | 'reject') {
		loading = true;
		try {
			const reason = nomRejectReasons[id] || '';
			await admin.resolveNomination(id, action, reason);
			delete nomRejectReasons[id];
			pendingNominations = pendingNominations.filter(n => n.id !== id);
			rebuildNomImgColumns();
			showMsg('success', action === 'approve' ? '已批准，图片已加入精选' : '已拒绝');
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '操作失败');
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

	async function handleClearQueue() {
		clearing = true;
		try {
			await clearQueue();
			showMsg('success', '已清空队列');
			if (typeof loadDebug === 'function') loadDebug();
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '清空队列失败');
		} finally {
			clearing = false;
		}
	}

	async function loadLlmConfig() {
		try {
			const res = await admin.getLlmConfig();
			llmConfig = res.config;
			llmProviders = res.providers;
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '加载失败');
		}
	}

	async function saveLlmConfig() {
		if (!llmConfig) return;
		loading = true;
		try {
			const res = await admin.updateLlmConfig({ profiles: llmConfig.profiles, active: llmConfig.active });
			if (res.config) llmConfig = res.config;
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
			llmTestResult = await admin.testLlmConfig(llmActiveTab);
		} catch (e) {
			llmTestResult = { ok: false, provider: '', error: e instanceof Error ? e.message : '测试失败' };
		} finally {
			llmTesting = false;
		}
	}

	async function loadLlmModels() {
		llmModelsLoading = true;
		llmModels = null;
		try {
			const res = await admin.getLlmModels(llmActiveTab);
			llmModels = res.models || null;
		} catch (e) {
			llmModels = [];
			showMsg('error', e instanceof Error ? e.message : '探测失败');
		} finally {
			llmModelsLoading = false;
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

	async function loadDebug() {
		debugLoading = true;
		debugError = '';
		try {
			debugData = await fetchDebugInfo();
		} catch (e) {
			debugError = e instanceof Error ? e.message : '加载失败';
		} finally {
			debugLoading = false;
		}
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
			case 'collaborators':
				loadCollaboratorsTab();
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

	// IntersectionObserver sentinelEl 可用时才创建（切到图片 tab 后）
	$effect(() => {
		const el = sentinelEl;
		if (!el) return;
		io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting && !loadingMore && hasMore)) loadMoreRecent();
			},
			{ rootMargin: '400px 0px' }
		);
		io.observe(el);
		return () => io?.disconnect();
	});

	onMount(() => {
	columnCount = getColumnCount();
	imgColumns = Array.from({ length: columnCount }, () => []);
	columnHeights = new Array(columnCount).fill(0);
	window.addEventListener('resize', handleResize, { passive: true });
	return () => {
		io?.disconnect();
		window.removeEventListener('resize', handleResize);
	};
	});

function formatTime(ts: number) {
		return new Date(ts * 1000).toLocaleString('zh-CN');
	}

	let debugInterval: ReturnType<typeof setInterval> | null = null;

	$effect(() => {
		if (activeTab === 'debug') {
			loadDebug();
			debugInterval = setInterval(loadDebug, 2000);
		} else {
			if (debugInterval) {
				clearInterval(debugInterval);
				debugInterval = null;
			}
		}
		return () => {
			if (debugInterval) {
				clearInterval(debugInterval);
				debugInterval = null;
			}
		};
	});
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
			{/if}
		{#if authToken}
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
					<TabsTrigger value="collaborators" class="text-xs">
						<Icon icon="mdi:account-group-outline" class="size-3.5 mr-1" />协作者
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
				<TabsTrigger value="debug" class="text-xs">
					<Icon icon="mdi:bug-outline" class="size-3.5 mr-1" />调试
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
				<div class="sticky top-14 z-10 bg-background py-2 flex flex-wrap gap-2 items-center border-b">
							<Button variant={selectMode ? 'default' : 'outline'} size="sm" onclick={() => { selectMode = !selectMode; }}>
								<Icon icon="mdi:select" class="size-4 mr-1" />
								{selectMode ? '取消选择' : '选择'}
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
					{#if recentImages.length > 0}
					<div class="flex gap-2 items-start">
						{#each imgColumns as col, ci (ci)}
							<div class="flex flex-1 flex-col gap-2 min-w-0">
								{#each col as path (ci + '-' + path)}
									{@const img = recentImages.find(i => i.path === path)}
									{#if img}
										<div class="relative group">
											<button
												class="w-full rounded-md overflow-hidden border {selectedPaths.has(img.path) ? 'ring-2 ring-primary' : ''}"
												onclick={() => { if (selectMode) toggleSelect(img.path); else openLb(img.path); }}
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
											{#if selectMode}
										<div class="absolute top-1 left-1 flex gap-1 items-start">
											<input
												type="checkbox"
												checked={selectedPaths.has(img.path)}
												onchange={() => toggleSelect(img.path)}
												onclick={(e) => e.stopPropagation()}
												class="size-4 accent-primary opacity-60 group-hover:opacity-100 transition-opacity"
											/>
										</div>
									{/if}

											<div class="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
												<button
													class="p-0.5 rounded bg-destructive/80 text-white hover:bg-destructive"
													onclick={(e) => { e.stopPropagation(); handleDeleteOne(img.path); }}
													title="删除"
												>
													<Icon icon="mdi:delete" class="size-3.5" />
												</button>
											</div>
											<div class="absolute bottom-0 inset-x-0 flex">
												<div class="flex-1 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate pointer-events-none">
													UID {img.user_id || '?'}{#if img.deleted} - <span class="text-red-400 font-bold">已删</span>{/if}
												</div>
												<button
													class="bg-black/70 text-white text-[10px] px-1.5 py-0.5 hover:bg-black/90"
													onclick={(e) => { e.stopPropagation(); detailImg = img; }}
												>
													详情
												</button>
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

			{#if detailImg}
				<div class="fixed inset-0 z-40 bg-black/40 flex items-center justify-center" onclick={() => detailImg = null} role="dialog">
					<div class="bg-card rounded-lg border shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onclick={(e) => e.stopPropagation()}>
						<div class="flex items-center justify-between p-3 border-b">
							<h3 class="text-sm font-medium truncate">{detailImg.path}</h3>
							<button class="text-muted-foreground hover:text-foreground" onclick={() => detailImg = null}>
								<Icon icon="mdi:close" class="size-5" />
							</button>
						</div>
						<div class="p-3 space-y-3 text-xs">
							<div class="grid grid-cols-3 gap-2">
								<div>
									<p class="text-[10px] text-muted-foreground mb-1">原图 1</p>
									{#if detailImg.image1}
										<img src="{currentBaseUrl}/api/uploads/{detailImg.image1}" alt="原图1" class="rounded border max-h-48 w-auto h-auto" loading="lazy" />
									{/if}
								</div>
								<div>
									<p class="text-[10px] text-muted-foreground mb-1">原图 2</p>
									{#if detailImg.image2}
										<img src="{currentBaseUrl}/api/uploads/{detailImg.image2}" alt="原图2" class="rounded border max-h-48 w-auto h-auto" loading="lazy" />
									{/if}
								</div>
								<div>
									<p class="text-[10px] text-muted-foreground mb-1">结果图</p>
									<img src={getImageUrl(detailImg.path)} alt="结果" class="rounded border max-h-48 w-auto h-auto" loading="lazy" />
								</div>
							</div>
							<div class="flex flex-wrap gap-2">
								<div><span class="text-muted-foreground">生图者：</span>{detailImg.user_id || '?'}</div>
								<div><span class="text-muted-foreground">时间：</span>{detailImg.mtime ? new Date(detailImg.mtime * 1000).toLocaleString() : '-'}</div>
							</div>
							{#if detailImg.prompt}
								<div>
									<span class="text-muted-foreground">正向 Prompt：</span>
									<div class="mt-0.5 p-2 bg-muted rounded text-[11px] break-all">{detailImg.prompt}</div>
								</div>
							{/if}
							{#if detailImg.negative_prompt}
								<div>
									<span class="text-muted-foreground">反向 Prompt：</span>
									<div class="mt-0.5 p-2 bg-muted rounded text-[11px] break-all">{detailImg.negative_prompt}</div>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<!-- Recommendations -->
						<TabsContent value="recommendations" class="mt-4">
				<div class="flex items-center justify-between mb-3">
					<h3 class="text-sm font-medium flex items-center gap-1.5">
						<Icon icon="mdi:star-plus-outline" class="size-4" />
						自荐审核
						{#if recommendations.length > 0}
							<Badge variant="secondary">{recommendations.length}</Badge>
						{/if}
					</h3>
					<Button variant="ghost" size="sm" onclick={loadRecommendations} disabled={loading}>
						<Icon icon="mdi:refresh" class="size-4" />
					</Button>
				</div>
				{#if recommendations.length === 0}
					<div class="text-sm text-muted-foreground py-8 text-center">无待审核自荐</div>
					{:else}
						<div bind:this={recMasonryEl} class="relative w-full">
						<div class="rec-sizer w-1/2 md:w-1/3 lg:w-1/4 xl:w-1/5"></div>
						{#each recommendations as rec, i (rec.id || i)}
							<div class="rec-item w-1/2 md:w-1/3 lg:w-1/4 xl:w-1/5 p-1">
								<div class="relative group rounded-lg overflow-hidden border hover:ring-2 hover:ring-primary/50 transition-all cursor-pointer"
									role="button" tabindex="0"
									onclick={() => openRecDialog(rec, i)}
								>
									<img src={getImageProxyUrl(rec.image_path)} alt="" loading="lazy" decoding="async" class="block w-full h-auto bg-muted" />
								</div>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Approve/reject dialog -->
				{#if recDialogItem}
					<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onclick={closeRecDialog} role="dialog">
						<div class="relative flex flex-col items-center max-w-[90vw] max-h-[90vh]" onclick={(e) => e.stopPropagation()}>
							<button class="absolute top-2 right-2 z-10 text-white/80 hover:text-white" onclick={closeRecDialog}>
								<Icon icon="mdi:close" class="size-8" />
							</button>
							<img src={getImageUrl(recDialogItem.image_path)} alt="" class="max-w-full max-h-[75vh] object-contain rounded-lg" />
							<div class="flex items-center gap-3 mt-4 bg-background/80 backdrop-blur rounded-lg px-4 py-3">
								<div class="text-xs text-muted-foreground mr-2">
									UID: {recDialogItem.user_id ?? '?'} &nbsp; {recDialogItem.image_path}
								</div>
								<Button size="sm" variant="default" onclick={() => { resolveRec(recDialogItem.id, 'approve'); closeRecDialog(); }} disabled={loading}>
									通过
								</Button>
								<Input bind:value={recRejectReasons[recDialogId]}
									placeholder="拒绝理由" class="h-8 text-xs w-40"
								/>
								<Button size="sm" variant="destructive" onclick={() => { resolveRec(recDialogItem.id, 'reject'); closeRecDialog(); }} disabled={loading}>
									拒绝
								</Button>
							</div>
						</div>
					</div>
				{/if}
			</TabsContent><TabsContent value="featured" class="mt-4">
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
								placeholder="用户 ID"
								type="number"
									class="max-w-20"
								/>
								<Input bind:value={newBanDays} type="number" class="max-w-16" min="1" />
								<span class="text-xs text-muted-foreground">天</span>
								<Input bind:value={newBanReason} placeholder="原因" class="max-w-36" />
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
								{#each bannedUsers as ban}
									<div class="flex items-center justify-between border rounded-md px-3 py-2">
										<span class="text-sm font-mono">{ban.user_id} - ({fmtBanDate(ban.banned_at)} - {fmtBanDate(ban.banned_until)})</span>
										<Button size="sm" variant="ghost" onclick={() => handleUnban(ban.user_id)} disabled={loading}>
											<Icon icon="mdi:account-check" class="size-4 mr-1" />解封
										</Button>
									</div>
								{/each}
							</div>
						{/if}
					</CardContent>
				</Card>
						</TabsContent>

			<!-- Collaborators -->
			<TabsContent value="collaborators" class="mt-4">
				<Card>
					<CardHeader>
						<CardTitle class="text-base">协作者管理</CardTitle>
					</CardHeader>
					<CardContent class="space-y-3">
						<div class="flex gap-2">
							<Input bind:value={newCollaboratorId} placeholder="用户 ID" type="number" class="max-w-20" />
							<Button size="sm" onclick={handleAddCollaborator} disabled={loading}>
								<Icon icon="mdi:account-plus" class="size-4 mr-1" />添加
							</Button>
							<Button variant="outline" size="sm" onclick={loadCollaboratorsTab} disabled={loading}>
								<Icon icon="mdi:refresh" class="size-4 mr-1" />刷新
							</Button>
						</div>
						{#if collaborators.length === 0}
							<div class="text-sm text-muted-foreground py-2">无协作者</div>
						{:else}
							<div class="space-y-1.5">
								{#each collaborators as c}
									<div class="flex items-center justify-between border rounded-md px-3 py-2">
										<span class="text-sm font-mono">{c.user_id}</span>
										<Button size="sm" variant="ghost" onclick={() => handleRemoveCollaborator(c.user_id)} disabled={loading}>
											<Icon icon="mdi:account-remove" class="size-4 mr-1" />移除
										</Button>
									</div>
								{/each}
							</div>
						{/if}
					</CardContent>
				</Card>

				<Card class="mt-4">
					<CardHeader>
						<CardTitle class="text-base">提名审核</CardTitle>
						<CardDescription>协作者提交的精选提名，需要你审核</CardDescription>
					</CardHeader>
					<CardContent>
						{#if pendingNominations.length === 0}
							<div class="text-sm text-muted-foreground py-4 text-center">无待审核提名</div>
						{:else}
							<div class="flex gap-2 items-start">
								{#each nomImgColumns as col, ci (ci)}
									<div class="flex flex-1 flex-col gap-2 min-w-0">
										{#each col as path (ci + '-' + path)}
											{@const item = nomMasonryItems.find((i: any) => i.path === path)}
												{#if item}
													<div class="border rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all" onclick={() => nomDialogItem = item}>
														<img src={getImageProxyUrl(item.path)} alt={item.path} loading="lazy" decoding="async" style="aspect-ratio: 1;" onload={handleImgLoad} class="block w-full h-auto bg-muted" />
													</div>
												{/if}
									</div>
								{/each}
							</div>
						{/if}
					</CardContent>
				</Card>
			</TabsContent>

			{#if nomDialogItem}
				<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onclick={() => nomDialogItem = null} role="dialog">
					<div class="relative flex flex-col items-center max-w-[90vw] max-h-[90vh]" onclick={(e) => e.stopPropagation()}>
						<button class="absolute top-2 right-2 z-10 text-white/80 hover:text-white" onclick={() => nomDialogItem = null}>
							<Icon icon="mdi:close" class="size-8" />
						</button>
						<img src={getImageUrl(nomDialogItem.path)} alt="" class="max-w-full max-h-[75vh] object-contain rounded-lg" />
						<div class="flex items-center gap-3 mt-4 bg-background/80 backdrop-blur rounded-lg px-4 py-3">
							<div class="text-xs text-muted-foreground mr-2">
								UID {nomDialogItem.nomination.collaborator_id} | {nomDialogItem.nomination.image_paths.length} 张 | {new Date(nomDialogItem.nomination.submitted_at * 1000).toLocaleString()}
							</div>
							{#if nomDialogItem.nomination.note}
								<div class="text-xs text-muted-foreground">备注: {nomDialogItem.nomination.note}</div>
							{/if}
							<Button size="sm" variant="default" onclick={() => { handleNominationResolve(nomDialogItem.nomination.id, 'approve'); nomDialogItem = null; }} disabled={loading}>
								<Icon icon="mdi:check" class="size-4 mr-1" />通过
							</Button>
							<Input bind:value={nomRejectReasons[nomDialogItem.nomination.id]}
								placeholder="拒绝理由" class="h-8 text-xs w-40"
							/>
							<Button size="sm" variant="destructive" onclick={() => { handleNominationResolve(nomDialogItem.nomination.id, 'reject'); nomDialogItem = null; }} disabled={loading}>
								<Icon icon="mdi:close" class="size-4 mr-1" />拒绝
							</Button>
						</div>
					</div>
				</div>
			{/if}

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
								{@render limitField('生成后冷却（秒）', 'gen_cooldown_after_sec', 'number')}
								{@render limitField('每用户队列上限', 'max_queue_per_user', 'number')}
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
								<div class="flex items-center gap-2 pt-2">
									<Button variant="destructive" size="sm" onclick={handleClearQueue} disabled={clearing}>
										{#if clearing}
											<Icon icon="mdi:loading" class="size-4 mr-1 animate-spin" />
																					<Icon icon="mdi:delete-sweep" class="size-4 mr-1" />
										{/if}
										清空队列
									</Button>
								</div>

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
							<div class="flex flex-wrap items-center gap-1">
								{#each llmConfig.profiles as profile, i}
									<div class="flex items-center gap-0">
										<button
											class="px-2.5 py-1.5 text-xs rounded-l-md border transition-colors {llmActiveTab === i ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:bg-accent'}"
											onclick={() => llmActiveTab = i}>
											{profile.name || ('配置' + (i + 1))}
											{#if llmConfig.active === i}
												<span class="ml-1 text-green-600">✓</span>
											{/if}
										</button>
										{#if llmConfig.profiles.length > 1}
											<button
												class="px-1.5 py-1.5 text-xs rounded-r-md border border-l-0 text-muted-foreground hover:text-destructive transition-colors"
												onclick={() => {
													llmConfig.profiles.splice(i, 1);
													if (llmActiveTab >= llmConfig.profiles.length) llmActiveTab = llmConfig.profiles.length - 1;
													if (llmConfig.active === i) llmConfig.active = 0;
													else if (llmConfig.active > i) llmConfig.active--;
												}}>✕</button>
										{/if}
									</div>
								{/each}
								<Button variant="ghost" size="sm" class="text-xs" onclick={() => {
									llmConfig.profiles.push({
										name: 'Custom',
										provider: 'custom',
										custom_endpoint: '',
										custom_api_key: '',
										custom_model: '',
										llm_stream: true
									});
									llmActiveTab = llmConfig.profiles.length - 1;
								}}>
									<Icon icon="mdi:plus" class="size-3.5 mr-0.5" />新增配置
								</Button>
							</div>

							{@const p = llmConfig.profiles[llmActiveTab]}
							{#if p}
								<div class="space-y-1.5">
									<Label class="text-xs">名称</Label>
									<Input class="text-xs" bind:value={p.name} placeholder="配置{(llmActiveTab + 1)}" />
								</div>
								<div class="space-y-1.5">
									<Label class="text-xs">类型</Label>
									<div class="flex gap-2">
										{#each ['google', 'custom'] as prov}
											<button
												class="px-3 py-1.5 text-xs rounded-md border transition-colors {p.provider === prov ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:bg-accent'}"
												onclick={() => {
													p.provider = prov;
													if (prov === 'google') { p.google_api_key = p.google_api_key || ''; p.google_model = p.google_model || ''; p.google_thinking = p.google_thinking || 'off'; }
													else { p.custom_endpoint = p.custom_endpoint || ''; p.custom_api_key = p.custom_api_key || ''; p.custom_model = p.custom_model || ''; }
												}}
											>{prov === 'google' ? 'Google Gemini' : 'Custom'}</button>
										{/each}
									</div>
								</div>

								{#if p.provider === 'google'}
									<div class="space-y-1.5">
										<Label class="text-xs">API Key</Label>
										<Input class="text-xs" type="password" bind:value={p.google_api_key} placeholder="AIza..." />
									</div>
									<div class="space-y-1.5">
										<Label class="text-xs">模型名称</Label>
										<div class="flex gap-1">
											<Input class="text-xs flex-1" bind:value={p.google_model} placeholder="gemma-4-31b-it" />
											<Button variant="outline" size="sm" onclick={loadLlmModels} disabled={llmModelsLoading}>
												<Icon icon={llmModelsLoading ? 'mdi:loading' : 'mdi:magnify'} class="size-3.5 mr-0.5 {llmModelsLoading ? 'animate-spin' : ''}" />
												探测模型
											</Button>
										</div>
									</div>
									<div class="space-y-1.5">
										<Label class="text-xs">思维链</Label>
										<div class="flex flex-wrap gap-1">
											{#each ['off', 'level_minimal', 'level_low', 'level_medium', 'level_high'] as opt}
												<button
													class="px-2 py-1 text-xs rounded border transition-colors {p.google_thinking === opt ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent'}"
													onclick={() => { p.google_thinking = opt; }}
												>{thinkingLabels[opt] || opt}</button>
											{/each}
										</div>
									</div>
																	<div class="space-y-1.5">
										<Label class="text-xs">API 端点 <span class="text-[9px] text-muted-foreground">（完整路径，含 /v1）</span></Label>
										<Input class="text-xs" bind:value={p.custom_endpoint} placeholder="https://api.openai.com/v1" />
									</div>
									<div class="space-y-1.5">
										<Label class="text-xs">API Key</Label>
										<Input class="text-xs" type="password" bind:value={p.custom_api_key} placeholder="sk-..." />
									</div>
									<div class="space-y-1.5">
										<Label class="text-xs">模型名称</Label>
										<div class="flex gap-1">
											<Input class="text-xs flex-1" bind:value={p.custom_model} placeholder="gpt-4o" />
											<Button variant="outline" size="sm" onclick={loadLlmModels} disabled={llmModelsLoading}>
												<Icon icon={llmModelsLoading ? 'mdi:loading' : 'mdi:magnify'} class="size-3.5 mr-0.5 {llmModelsLoading ? 'animate-spin' : ''}" />
												探测模型
											</Button>
										</div>
									</div>
								{/if}

								{#if llmModels !== null}
									<div class="border rounded p-2 max-h-40 overflow-y-auto">
										<p class="text-[10px] text-muted-foreground mb-1">可用模型（{llmModels.length} 个）：</p>
										{#if llmModels.length === 0}
											<p class="text-xs text-muted-foreground">无可用模型或探测失败</p>
																					{#each llmModels as model}
												<div class="text-xs py-0.5 hover:bg-accent rounded px-1 cursor-pointer"
													onclick={() => {
														/* full id */
														if (p.provider === 'google') p.google_model = model;
														else p.custom_model = model;
													}}>{model}</div>
											{/each}
										{/if}
									</div>
								{/if}

								<div class="flex items-center gap-2">
									<Switch checked={p.llm_stream ?? true} onCheckedChange={(e) => { p.llm_stream = e; }} />
									<Label class="text-xs">流式输出</Label>
								</div>

								<div class="flex flex-wrap gap-2 pt-2">
									<Button variant="outline" size="sm" onclick={testLlmConfig} disabled={llmTesting || loading}>
										<Icon icon={llmTesting ? 'mdi:loading' : 'mdi:flask-outline'} class="size-3.5 mr-1 {llmTesting ? 'animate-spin' : ''}" />
										测试连通性
									</Button>
									<Button size="sm" onclick={saveLlmConfig} disabled={loading}>
										<Icon icon="mdi:content-save" class="size-3.5 mr-1" />
										保存
									</Button>
									{#if llmConfig.active !== llmActiveTab}
										<Button variant="secondary" size="sm" onclick={() => { llmConfig.active = llmActiveTab; }}>
											<Icon icon="mdi:check-circle-outline" class="size-3.5 mr-1" />
											设为当前配置
										</Button>
																			<Badge variant="outline" class="text-xs text-green-600 border-green-300">当前配置</Badge>
									{/if}
								</div>

								{#if llmTestResult}
									<Alert variant={llmTestResult.ok ? 'default' : 'destructive'}>
										<AlertDescription class="text-xs">
											{#if llmTestResult.ok}
												<span class="font-medium text-green-600">✓ {llmTestResult.provider}</span> — {llmTestResult.reply}
																							<span class="font-medium">✗ 失败</span> — {llmTestResult.error}
												{#if llmTestResult.raw}
													<br /><span class="text-[9px] text-muted-foreground">原始回复: {llmTestResult.raw}</span>
												{/if}
											{/if}
										</AlertDescription>
									</Alert>
								{/if}
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

			<TabsContent value="debug" class="mt-4">
				<Card>
					<CardHeader>
						<CardTitle class="text-base flex items-center gap-2">
							<Icon icon="mdi:bug-outline" class="size-5" />
							生图调试总览
						</CardTitle>
						<CardDescription>活跃状态、队列统计、卡住任务</CardDescription>
					</CardHeader>
					<CardContent class="space-y-4">
						<Button variant="outline" size="sm" onclick={loadDebug} disabled={debugLoading}>
							<Icon icon="mdi:refresh" class="size-4 mr-1" />
							{debugLoading ? '加载中...' : '刷新'}
						</Button>

						{#if debugError}
							<Alert variant="destructive">
								<Icon icon="mdi:alert-circle" class="size-4" />
								<AlertDescription class="text-xs">{debugError}</AlertDescription>
							</Alert>
						{/if}

						{#if debugData}

							<div>
								<h4 class="text-sm font-medium mb-2">队列状态分布</h4>
								<div class="flex flex-wrap gap-2">
									{#each Object.entries(debugData.queue_stats) as [status, count]}
										{#if count > 0}
											<Badge variant={status === 'failed' ? 'destructive' : status === 'done' ? 'default' : 'secondary'} class="text-xs">
												{status}: {count}
											</Badge>
										{/if}
									{/each}
								</div>
							</div>

							<div class="flex gap-2">
								<Button variant="destructive" size="sm" onclick={handleClearQueue} disabled={clearing}>
									{#if clearing}
										<Icon icon="mdi:loading" class="size-4 animate-spin" />
									{/if}
									清空队列
								</Button>
							</div>

							{#if debugData.meta_stats}
								<div>
									<h4 class="text-sm font-medium mb-2">元数据写入</h4>
									<div class="flex flex-wrap gap-2">
										<Badge variant="outline" class="text-xs">图片数: {debugData.meta_stats.output_total}</Badge>
									</div>
							</div>
							{/if}

							{#if debugData.queue_users.length > 0}
								<div>
									<h4 class="text-sm font-medium mb-2">队列中的用户</h4>
									<div class="flex flex-wrap gap-2">
										{#each debugData.queue_users as [uid, count]}
											<Badge variant="secondary" class="text-xs">
												UID {uid} x {count}
											</Badge>
										{/each}
									</div>
							</div>
							{/if}

							{#if debugData.stuck.length > 0}
								<div>
									<h4 class="text-sm font-medium mb-2 text-red-500">卡住任务 ({debugData.stuck.length})</h4>
									<div class="space-y-1">
										{#each debugData.stuck as item}
											<div class="flex items-center gap-2 text-xs border rounded px-3 py-2">
												<Icon icon="mdi:alert" class="size-4 text-red-500" />
												<span>UID {item.user_id}</span>
												<Badge variant="destructive" class="text-[10px]">{item.status}</Badge>
												<span class="text-muted-foreground">ID:{item.id}</span>
											</div>
										{/each}
									</div>
								</div>
							{/if}

							<div>
								<h4 class="text-sm font-medium mb-2">最近 20 条队列项</h4>
								<div class="overflow-x-auto">
									<table class="w-full text-xs">
										<thead>
											<tr class="border-b text-left text-muted-foreground">
												<th class="py-1 pr-2">ID</th>
												<th class="py-1 pr-2">UID</th>
												<th class="py-1 pr-2">类型</th>
												<th class="py-1 pr-2">状态</th>
												<th class="py-1 pr-2">创建</th>
												<th class="py-1 pr-2">启动</th>
													<th class="py-1 pr-2">工作流</th>
													<th class="py-1 pr-2">错误</th>
														<th class="py-1 pr-2">元数据</th>
											</tr>
										</thead>
										<tbody>
											{#each debugData.recent_items_full as item}
												<tr class="border-b">
													<td class="py-1 pr-2 font-mono">{item.id}</td>
													<td class="py-1 pr-2">{item.user_id}</td>
													<td class="py-1 pr-2 text-xs">{item.type === 'img2img' ? '🖼️' : '📝'}</td>
													<td class="py-1 pr-2">
														<Badge variant={item.status === 'failed' ? 'destructive' : item.status === 'done' ? 'default' : item.status === 'running' ? 'default' : 'secondary'} class="text-[10px]">{item.status}</Badge>
													</td>
													<td class="py-1 pr-2 text-muted-foreground">{item.created_ago}s前</td>
													<td class="py-1 pr-2 text-muted-foreground">{item.started_ago != null ? `${item.started_ago}s前` : '-'}</td>
														<td class="py-1 pr-2 break-all max-w-[120px] text-muted-foreground text-[10px]">{item.workflow_path || '-'}</td>
														<td class="py-1 pr-2 break-all max-w-xs text-destructive text-[10px]" title={item.error || ''}>{item.error || '-'}</td>
														<td class="py-1 pr-2 break-all max-w-[120px] text-muted-foreground text-[10px]">{item.meta_write ? `正向:${item.meta_write.prompt} 反向:${item.meta_write.negative} 原图1:${item.meta_write.image1} 原图2:${item.meta_write.image2}` : '-'}</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
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

