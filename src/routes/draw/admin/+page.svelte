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
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Table from '$lib/components/ui/table';
	import { forumAuth } from '$lib/forum/stores/auth';
	import { drawEnv } from '$lib/draw/stores/env';
	import * as admin from '$lib/draw/api/admin';
	import { getImageProxyUrl, getImageUrl, getThumbnailUrl } from '$lib/draw/api/client';
	import type {
		AdminRecentImage,
		AdminReport,
		AdminLimits,
		AdminMaintenance,
		AdminAnnouncement,
		AdminLlmConfig
	} from '$lib/draw/types';

	let authToken = $state<string | null>(null);
	let currentBaseUrl = $state('');
	let activeTab = $state('maintenance');
	let loading = $state(false);
	let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	// Maintenance
	let maintenance = $state<AdminMaintenance>({ enabled: false, message: '' });

	// Announcement
	let announcement = $state<AdminAnnouncement>({ enabled: false, title: '', content: '' });

	// Recent images
	let recentImages = $state<AdminRecentImage[]>([]);
	let recentTotal = $state(0);
	let recentOffset = $state(0);
	let recentLimit = $state(50);
	let selectedPaths = $state<Set<string>>(new Set());
	let searchUserId = $state('');

	// Reports
	let reports = $state<AdminReport[]>([]);

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
	let lbPath = $state('');

	$effect(() => {
		authToken = forumAuth.getToken();
		const u = drawEnv.baseUrl.subscribe((v) => (currentBaseUrl = v));
		return u;
	});

	function showMsg(type: 'success' | 'error', text: string) {
		message = { type, text };
		setTimeout(() => (message = null), 3000);
	}

	async function loadMaintenance() {
		try {
			maintenance = await admin.getMaintenance();
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '加载失败');
		}
	}

	async function saveMaintenance() {
		loading = true;
		try {
			const res = await admin.updateMaintenance(maintenance);
			maintenance = res.maintenance;
			showMsg('success', '维护模式已更新');
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '保存失败');
		} finally {
			loading = false;
		}
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
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '加载失败');
		} finally {
			loading = false;
		}
	}

	async function loadMoreRecent() {
		loading = true;
		try {
			const res = await admin.getRecentImages(recentLimit, recentOffset);
			recentImages = [...recentImages, ...res.items];
			recentOffset += res.items.length;
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '加载失败');
		} finally {
			loading = false;
		}
	}

	async function searchByUser() {
		if (!searchUserId.trim()) return;
		loading = true;
		try {
			const res = await admin.getImagesByUser(Number(searchUserId));
			recentImages = res.items;
			recentTotal = res.total;
			selectedPaths = new Set();
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '查询失败');
		} finally {
			loading = false;
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

	async function loadReports() {
		loading = true;
		try {
			const res = await admin.getReports();
			reports = res.reports;
		} catch (e) {
			showMsg('error', e instanceof Error ? e.message : '加载失败');
		} finally {
			loading = false;
		}
	}

	async function handleResolveReport(id: string, action: 'delete' | 'ban_creator' | 'ban_reporter' | 'dismiss') {
		loading = true;
		try {
			await admin.resolveReport(id, action);
			showMsg('success', `举报已处理：${action}`);
			reports = reports.filter((r) => r.id !== id);
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
		wfRenameValue = wf.replace('.json', '');
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
			const base = wf.replace('.json', '');
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
			case 'maintenance':
				loadMaintenance();
				break;
			case 'announcement':
				loadAnnouncement();
				break;
			case 'images':
				if (recentImages.length === 0) loadRecent();
				break;
			case 'reports':
				loadReports();
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
			<TabsList class="w-full flex flex-wrap h-auto gap-1">
				<TabsTrigger value="maintenance" class="text-xs">
					<Icon icon="mdi:tools" class="size-3.5 mr-1" />维护
				</TabsTrigger>
				<TabsTrigger value="announcement" class="text-xs">
					<Icon icon="mdi:bullhorn-outline" class="size-3.5 mr-1" />公告
				</TabsTrigger>
				<TabsTrigger value="images" class="text-xs">
					<Icon icon="mdi:image-multiple-outline" class="size-3.5 mr-1" />图片
				</TabsTrigger>
				<TabsTrigger value="reports" class="text-xs">
					<Icon icon="mdi:flag-outline" class="size-3.5 mr-1" />举报
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

			<!-- Maintenance -->
			<TabsContent value="maintenance" class="mt-4">
				<Card>
					<CardHeader>
						<CardTitle class="text-base flex items-center gap-2">
							维护模式
							{#if maintenance.enabled}
								<Badge variant="destructive">已开启</Badge>
							{:else}
								<Badge variant="secondary">已关闭</Badge>
							{/if}
						</CardTitle>
						<CardDescription>开启后所有非管理员 API 请求将返回 503</CardDescription>
					</CardHeader>
					<CardContent class="space-y-4">
						<div class="flex items-center gap-3">
							<Switch bind:checked={maintenance.enabled} />
							<Label>{maintenance.enabled ? '开启' : '关闭'}</Label>
						</div>
						<div class="space-y-1.5">
							<Label class="text-xs">维护提示信息</Label>
							<textarea
								bind:value={maintenance.message}
								rows={4}
								placeholder="站点维护中，请稍后再试..."
								class="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
							></textarea>
						</div>
						<Button onclick={saveMaintenance} disabled={loading}>
							<Icon icon="mdi:content-save" class="size-4 mr-1" />
							保存
						</Button>
					</CardContent>
				</Card>
			</TabsContent>

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
								class="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
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
					<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
						{#each recentImages as img}
							<div class="relative group">
								<button
									class="aspect-square rounded-md overflow-hidden border w-full {selectedPaths.has(img.path) ? 'ring-2 ring-primary' : ''}"
									onclick={() => toggleSelect(img.path)}
								>
									<img
										src={getImageProxyUrl(img.path)}
										alt={img.path}
										class="w-full h-full object-cover"
										loading="lazy"
									/>
								</button>
								<div class="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
									<button
										class="p-0.5 rounded bg-black/50 text-white hover:bg-black/70"
										onclick={(e) => { e.stopPropagation(); lbPath = img.path; lbOpen = true; }}
										title="查看"
									>
										<Icon icon="mdi:eye" class="size-3.5" />
									</button>
									<button
										class="p-0.5 rounded bg-destructive/80 text-white hover:bg-destructive"
										onclick={(e) => { e.stopPropagation(); handleDeleteOne(img.path); }}
										title="删除"
									>
										<Icon icon="mdi:delete" class="size-3.5" />
									</button>
								</div>
								<div class="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] px-1 py-0.5 truncate">
									{img.user_id || '?'} | {formatTime(img.mtime)}
								</div>
							</div>
						{/each}
					</div>
					{#if recentOffset < recentTotal}
						<div class="text-center">
							<Button variant="outline" size="sm" onclick={loadMoreRecent} disabled={loading}>
								加载更多
							</Button>
						</div>
					{/if}
				{/if}
			</TabsContent>

			<!-- Reports -->
			<TabsContent value="reports" class="mt-4">
				<Card>
					<CardHeader>
						<CardTitle class="text-base flex items-center gap-2">
							举报管理
							{#if reports.length > 0}
								<Badge variant="destructive">{reports.length}</Badge>
							{/if}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<Button variant="outline" size="sm" onclick={loadReports} disabled={loading} class="mb-3">
							<Icon icon="mdi:refresh" class="size-4 mr-1" />刷新
						</Button>
						{#if reports.length === 0}
							<div class="text-sm text-muted-foreground py-4 text-center">无待处理举报</div>
						{:else}
							<div class="space-y-3">
								{#each reports as r}
									<div class="border rounded-lg p-3 space-y-2">
										<div class="flex items-start justify-between gap-2">
											<div class="space-y-1 min-w-0">
												<div class="flex items-center gap-2">
													<Badge variant="outline" class="text-xs">ID: {r.id.slice(0, 8)}</Badge>
													<span class="text-xs text-muted-foreground">{formatTime(r.timestamp)}</span>
												</div>
												<div class="text-xs">
													<span class="text-muted-foreground">图片：</span>
													<span class="font-mono">{r.image_path}</span>
													{#if !r.image_exists}
														<Badge variant="secondary" class="ml-1 text-[10px]">已删除</Badge>
													{/if}
												</div>
												<div class="text-xs">
													<span class="text-muted-foreground">举报者：</span>{r.reporter_id}
													<span class="text-muted-foreground ml-2">创作者：</span>{r.creator_id || '未知'}
												</div>
												<div class="text-xs">
													<span class="text-muted-foreground">原因：</span>{r.reason}
												</div>
											</div>
											{#if r.image_exists}
												<button
													class="shrink-0 size-12 rounded overflow-hidden border"
													onclick={() => { lbPath = r.image_path; lbOpen = true; }}
												>
													<img
														src={getImageProxyUrl(r.image_path)}
														alt=""
														class="w-full h-full object-cover"
													/>
												</button>
											{/if}
										</div>
										<div class="flex flex-wrap gap-1.5">
											<Button size="sm" variant="destructive" onclick={() => handleResolveReport(r.id, 'delete')} disabled={loading}>
												删除图片
											</Button>
											<Button size="sm" variant="outline" onclick={() => handleResolveReport(r.id, 'ban_creator')} disabled={loading}>
												封禁创作者
											</Button>
											<Button size="sm" variant="outline" onclick={() => handleResolveReport(r.id, 'ban_reporter')} disabled={loading}>
												封禁举报者
											</Button>
											<Button size="sm" variant="ghost" onclick={() => handleResolveReport(r.id, 'dismiss')} disabled={loading}>
												忽略
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
											onclick={() => { lbPath = path; lbOpen = true; }}
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
									<div class="flex flex-wrap gap-1.5">
										{#each llmThinkingOptions as opt}
											<button
												class="px-2 py-1 text-xs rounded border transition-colors {llmConfig.google_thinking === opt ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent'}"
												onclick={() => { if (llmConfig) llmConfig.google_thinking = opt; }}
											>{opt}</button>
										{/each}
									</div>
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
									<CardTitle class="text-sm">编辑元数据: {wfMetaEditWf.replace('.json', '')}</CardTitle>
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
												{wf.replace('.json', '')}
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

<!-- Lightbox Dialog -->
<Dialog.Root bind:open={lbOpen}>
	<Dialog.Content class="max-w-3xl p-0 overflow-hidden">
		{#if lbPath}
			<img
				src={getImageUrl(lbPath)}
				alt={lbPath}
				class="w-full max-h-[70vh] object-contain"
			/>
			<div class="px-4 py-2 border-t flex items-center justify-between">
				<span class="text-xs font-mono truncate">{lbPath}</span>
				<a
					href={getImageUrl(lbPath, true)}
					download
					class="p-1.5 rounded hover:bg-muted"
				>
					<Icon icon="mdi:download" class="size-4" />
				</a>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>

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
