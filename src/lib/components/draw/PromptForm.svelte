<script lang="ts">
	import Icon from '@iconify/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { fetchResolutions } from '$lib/draw/api/client';
	import type { DrawResolution } from '$lib/draw/types';

	const SAFETY_RATINGS = [
		{ value: 'general', label: '普通' },
		{ value: 'sensitive', label: '敏感' },
		{ value: 'nsfw', label: 'NSFW' },
		{ value: 'explicit', label: '露骨' }
	] as const;

	let {
		directPrompt = $bindable(''),
		negativePrompt = $bindable(''),
		nlPrompt = $bindable(''),
		rewrite = $bindable(true),
		width = $bindable(0),
		height = $bindable(0),
		safetyRating = $bindable('general'),
		onsubmit,
		disabled = false,
		busy = false,
		otherNode = $bindable(''),
		otherValue = $bindable(0),
		otherMax = $bindable(0),
		otherStage = $bindable(''),
		sameSeed = $bindable(false),
		forkSeed = $bindable<number | undefined>(undefined),
	}: {
		directPrompt?: string;
		negativePrompt?: string;
		nlPrompt?: string;
		rewrite?: boolean;
		width?: number;
		height?: number;
		safetyRating?: string;
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

	$effect(() => {
		loadResolutions();
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

	function selectRes(r: DrawResolution) {
		width = r.w;
		height = r.h;
	}

	function handleSubmit() {
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
		<label class="flex items-center gap-2 text-xs cursor-pointer">
<Checkbox bind:checked={rewrite} />
			<span>改写模式</span>
			<button
				class="text-muted-foreground hover:text-foreground"
				title="开启后 LLM 会重写整个提示词；关闭则将翻译结果追加到现有标签后"
			>
				<Icon icon="mdi:help-circle-outline" class="size-3.5" />
			</button>
		</label>
		{#if forkSeed != null}
			<label class="flex items-center gap-2 text-xs cursor-pointer">
				<Checkbox bind:checked={sameSeed} />
				<span>同种子</span>
				<button
					class="text-muted-foreground hover:text-foreground"
					title="使用与原始图片相同的随机种子，便于控制构图"
				>
					<Icon icon="mdi:help-circle-outline" class="size-3.5" />
				</button>
			</label>
		{/if}
	</div>

	<!-- Safety rating -->
	<div class="space-y-1.5">
		<Label class="text-xs font-medium">分级</Label>
		<div class="flex flex-wrap gap-1.5">
			{#each SAFETY_RATINGS as r}
				<button
					type="button"
					class="px-2 py-1 rounded text-xs border transition-all {safetyRating === r.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent'}"
					onclick={() => (safetyRating = r.value)}

				>
					{r.label}
				</button>
			{/each}
		</div>
	</div>

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

	<!-- Submit button -->
	<Button
		class="w-full"
		size="lg"
		onclick={handleSubmit}
		{disabled}
	>
		{#if busy}
			<Icon icon="mdi:queue-timeline" class="size-4" />
			他人生图中，点击加入队列
		{:else}
			<Icon icon="mdi:sparkles" class="size-5 mr-1.5" />
			开始生成
		{/if}
	</Button>
</div>
