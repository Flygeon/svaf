<script lang="ts">
	import Icon from '@iconify/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import TurnstileWidget from '$lib/components/TurnstileWidget.svelte';
	import { fetchResolutions } from '$lib/draw/api/client';
	import { drawEnv } from '$lib/draw/stores/env';
	import { forumAuth } from '$lib/forum/stores/auth';
	import { get } from 'svelte/store';
	import type { DrawResolution } from '$lib/draw/types';

	let {
		directPrompt = $bindable(''),
		negativePrompt = $bindable(''),
		nlPrompt = $bindable(''),
		workflowPrompt = $bindable(''),
		workflowNegativePrompt = $bindable(''),
		width = $bindable(0),
		height = $bindable(0),
				onsubmit,
		disabled = false,
		busy = false,
		otherNode = $bindable(''),
		otherValue = $bindable(0),
		otherMax = $bindable(0),
		otherStage = $bindable(''),
		sameSeed = $bindable(false),
		forkSeed = $bindable<number | undefined>(undefined),
			turnstileToken = $bindable(''),
			turnstileTick = $bindable(0),
	}: {
		directPrompt?: string;
		negativePrompt?: string;
		nlPrompt?: string;
		workflowPrompt?: string;
		workflowNegativePrompt?: string;
		width?: number;
		height?: number;
				onsubmit?: () => void;
		disabled?: boolean;
		busy?: boolean;
		otherNode?: string;
		otherValue?: number;
		otherMax?: number;
		otherStage?: string;
		sameSeed?: boolean;
		forkSeed?: number;
	} = $props();

	let resolutions = $state<DrawResolution[]>([]);
	let selectedRes = $derived(width && height ? `${width}x${height}` : '');
	let promptsOpen = $state(false);
	let translating = $state(false);
	let translateError = $state("");
	let llmPrompt = $state("");
	let hasTranslated = $state(false);

	$effect(() => {
		loadResolutions();
	});

	// 工作流切换时清除 LLM 结果
	$effect(() => {
		if (workflowPrompt) { llmPrompt = ''; hasTranslated = false; }
	});
	async function loadResolutions() {
		try {
			const res = await fetchResolutions();
			resolutions = res.presets;
			if (resolutions.length && !width && !height) {
				const first = resolutions[0];
				width = first.w;
				height = first.h;
			}
		} catch {
			resolutions = [];
		}
	}
				async function handleTranslate() {
		if (!nlPrompt?.trim()) return;
		translating = true;
		translateError = ''; hasTranslated = false;
		promptsOpen = true;
		let accumulated = '';
		llmPrompt = '';
		const token = forumAuth.getToken();
		try {
			const baseUrl = get(drawEnv.baseUrl);
			const resp = await fetch(`${baseUrl}/api/translate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
				body: JSON.stringify({
					prompt: nlPrompt,
					original_prompt: directPrompt || undefined,
					negative_prompt: negativePrompt || undefined
				})
			});
			const reader = resp.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const nlIdx = buffer.indexOf('\n');
				if (nlIdx === -1) break;
				const line = buffer.slice(0, nlIdx).trim();
				buffer = buffer.slice(nlIdx + 1);
				if (line.startsWith('event: ')) {
					const ev = line.slice(7).trim();
					const nl2 = buffer.indexOf('\n');
					if (nl2 === -1) break;
					const dataLine = buffer.slice(0, nl2).trim();
					buffer = buffer.slice(nl2 + 1);
					if (!dataLine.startsWith('data: ')) continue;
					const data = JSON.parse(dataLine.slice(6));
					if (ev === 'chunk') {
						accumulated += data.text;
						// 实时解析 POSITIVE:/NEGATIVE: 并去掉前缀
						const posM = accumulated.match(/POSITIVE:\s*(.+?)(?:\nNEGATIVE|$)/s);
						const negM = accumulated.match(/NEGATIVE:\s*(.+)$/s);
						if (posM) directPrompt = posM[1].trim();
						if (negM) negativePrompt = negM[1].trim();
					} else if (ev === 'done') {
						llmPrompt = data.positive; hasTranslated = true;
						directPrompt = data.positive;
						negativePrompt = data.negative;
					} else if (ev === 'error') {
						translateError = '转换失败: ' + (data.message || '未知错误');
					}
				}
			}
		} catch (e) {
			translateError = '请求失败: ' + (e instanceof Error ? e.message : '未知错误');
		} finally {
			translating = false;
		}
	}

	function handleSubmit() {
		if (nlPrompt?.trim() && directPrompt === workflowPrompt && !confirm('自然语言还未转换，是否先点"转换"生成标签？\n\n点确定继续提交，点取消返回去转换。')) {
			return;
		}
		onsubmit?.();
	}
</script>

<div class="space-y-3">
	<!-- Natural language -->
	<div class="space-y-1.5">
		<Label class="text-xs font-medium flex items-center gap-1">
			<Icon icon="mdi:translate" class="size-3.5" />
			自然语言描述
			<Badge variant="secondary" class="text-[10px] px-1 py-0">可选，中文/英文</Badge>
		</Label>
		<textarea
			bind:value={nlPrompt}
			rows={3}
			placeholder="一个蓝发少女站在花园里..."
			class="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
		></textarea>
			<Button size="sm" variant="outline" onclick={handleTranslate} disabled={translating || !nlPrompt?.trim()} class="mt-1.5">
				<Icon icon={translating ? "mdi:loading" : "mdi:auto-fix"} class="size-4 mr-1 {translating ? 'animate-spin' : ''}" />
				{translating ? "转换中..." : "转换"}
			</Button>
		{#if workflowPrompt && (directPrompt !== workflowPrompt || negativePrompt !== workflowNegativePrompt)}
			<div class="flex gap-2 mt-1">
				<Button size="sm" variant="outline" onclick={() => { directPrompt = workflowPrompt; negativePrompt = workflowNegativePrompt; llmPrompt = ''; hasTranslated = false; }}>
					<Icon icon="mdi:restore" class="size-3.5 mr-1" />
					重置到工作流默认
				</Button>
			</div>
		{/if}
		{#if translateError}
			<div class="text-xs text-red-500 mt-1">{translateError}</div>
		{/if}
		</div>
		<!-- Collapsible prompts -->
	<div class="space-y-2">
		<button
			type="button"
			class="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
			onclick={() => (promptsOpen = !promptsOpen)}
		>
			<Icon icon={promptsOpen ? "mdi:chevron-down" : "mdi:chevron-right"} class="size-4" />
			<Icon icon="mdi:text-box-outline" class="size-3.5" />
			正向 / 反向提示词
			{#if directPrompt || negativePrompt}
				<Badge variant="secondary" class="text-[10px] px-1 py-0 ml-1">已填写</Badge>
			{/if}
		</button>
		{#if promptsOpen}
			<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
				<div class="space-y-1.5">
					<Label class="text-xs font-medium flex items-center gap-1">
						<Icon icon="mdi:text-box-outline" class="size-3.5" />
						正向提示词
					</Label>
					<textarea
						bind:value={directPrompt}
						rows={3}
						placeholder="1girl, blue_hair, garden, masterpiece, best quality..."
						class="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
					></textarea>
				</div>
				<div class="space-y-1.5">
					<Label class="text-xs font-medium flex items-center gap-1">
						<Icon icon="mdi:text-box-remove-outline" class="size-3.5" />
						反向提示词
					</Label>
					<textarea
						bind:value={negativePrompt}
						rows={3}
						placeholder="bad hands, too many fingers, long neck, poorly drawn..."
						class="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
					></textarea>
				</div>
			</div>
		{/if}
	</div>

	<!-- Options row -->
	<div class="flex flex-wrap items-center gap-4">
		
		{#if forkSeed != null}
			<label class="flex items-center gap-2 text-xs cursor-pointer">
				<Checkbox bind:checked={sameSeed} />
				<span>同种子</span>
				<button
					class="text-muted-foreground hover:text-foreground"
					title="使用与原始图片相同的随机种子，便于控制构图"
				>
					<Icon icon="mdi:help-circle-outline" class="size-3.5" />
			</label>
		{/if}
	</div>

	<!-- Safety rating -->

	<!-- Resolution presets -->
	{#if resolutions.length > 0}
		<div class="space-y-1.5">
			<Label class="text-xs font-medium">分辨率</Label>
			<div class="flex flex-wrap gap-1.5">
				{#each resolutions as r}
					{@const key = `${r.w}x${r.h}`}
					<button
						class="px-2 py-1 rounded text-xs border transition-all {selectedRes === key ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent'}"
						onclick={() => selectRes(r)}

					>
						{r.label || key}
					</button>
				{/each}
		</div>
		</div>
	{/if}

	<TurnstileWidget
			siteKey="0x4AAAAAADSVSh5jjelMNlrv"
			tick={turnstileTick}
			onToken={(t) => (turnstileToken = t)}
			onExpired={() => (turnstileToken = '')}
		/>

		<!-- Submit button -->
	<Button
		class="w-full"
		size="lg"
		onclick={handleSubmit}
		{disabled}
	>
		{#if busy}
			<Icon icon="mdi:loading" class="size-4 animate-spin" />
			加入队列中...
		{:else}
			<Icon icon="mdi:playlist-plus" class="size-5 mr-1.5" />
			加入队列
		{/if}
	</Button>
</div>
