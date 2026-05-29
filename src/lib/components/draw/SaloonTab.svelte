<script lang="ts">
import Icon from '@iconify/svelte';
import { Button } from '$lib/components/ui/button';
import { Alert, AlertDescription } from '$lib/components/ui/alert';
import { Badge } from '$lib/components/ui/badge';
import { chatRequest, fetchMyQueue } from '$lib/draw/api/client';

let {
	workflowPath = '',
	styleTags = '',
}: {
	workflowPath?: string;
	styleTags?: string;
} = $props();

const PRESETS_KEY = 'chat_presets_v1';

interface ChatPreset {
	name: string;
	systemPrompt: string;
}

interface ChatMessage {
	role: 'user' | 'assistant';
	content: string;
	imageUrls?: string[];
	queuedItemIds?: number[];
	streaming?: boolean;
}

let presets = $state<ChatPreset[]>([]);
let selectedPresetIdx = $state<number>(-1);
let presetName = $state('');
let systemPrompt = $state('');
let chatHistory = $state<ChatMessage[]>([]);
let chatMessages = $state<ChatMessage[]>([]);
let inputText = $state('');
let sending = $state(false);
let settingsOpen = $state(true);
let errorText = $state('');
let queuePolling = $state(false);

// 轮询中的 item_id 集合
let pendingQueueIds = $state<Set<number>>(new Set());

// 加载预设
function loadPresets(): ChatPreset[] {
	try {
		return JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]');
	} catch { return []; }
}

function savePresets(list: ChatPreset[]) {
	localStorage.setItem(PRESETS_KEY, JSON.stringify(list));
}

// 初始化
$effect(() => {
	presets = loadPresets();
});

function selectPreset(idx: number) {
	selectedPresetIdx = idx;
	if (idx >= 0 && presets[idx]) {
		presetName = presets[idx].name;
		systemPrompt = presets[idx].systemPrompt;
	} else {
		presetName = '';
		systemPrompt = '';
	}
}

function savePreset() {
	if (!presetName.trim()) return;
	if (!systemPrompt.trim()) return;
	const list = [...presets];
	const existing = list.findIndex(p => p.name === presetName.trim());
	const entry: ChatPreset = { name: presetName.trim(), systemPrompt: systemPrompt.trim() };
	if (existing >= 0) list[existing] = entry;
	else list.push(entry);
	presets = list;
	savePresets(list);
	selectedPresetIdx = list.findIndex(p => p.name === presetName.trim());
}

function deletePreset() {
	if (selectedPresetIdx < 0 || !presets[selectedPresetIdx]) return;
	const list = presets.filter((_, i) => i !== selectedPresetIdx);
	presets = list;
	savePresets(list);
	selectedPresetIdx = -1;
	presetName = '';
	systemPrompt = '';
}

function newPreset() {
	selectedPresetIdx = -1;
	presetName = '';
	systemPrompt = '';
}

function clearChat() {
	chatMessages = [];
	chatHistory = [];
	pendingQueueIds = new Set();
}

async function sendMessage() {
	const msg = inputText.trim();
	if (!msg || sending) return;
	if (!systemPrompt.trim()) {
		errorText = '请先填写角色设定';
		return;
	}
	errorText = '';
	sending = true;

	// 添加用户消息
	const userMsg: ChatMessage = { role: 'user', content: msg };
	chatMessages = [...chatMessages, userMsg];
	inputText = '';

	// 添加助手占位
	const assistantIdx = chatMessages.length;
	const placeholder: ChatMessage = { role: 'assistant', content: '', streaming: true };
	chatMessages = [...chatMessages, placeholder];

	try {
		const response = await chatRequest({
			message: msg,
			workflow_path: workflowPath || undefined,
			style_tags: styleTags || undefined,
			system_prompt: systemPrompt,
			negative_prompt: 'worst quality, low quality, blurry',
			history: chatHistory,
		});

		const reader = response.body?.getReader();
		if (!reader) throw new Error('无法读取响应流');
		const decoder = new TextDecoder();
		let buffer = '';
		let textContent = '';
		const newItemIds: number[] = [];

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			while (true) {
				const newlineIdx = buffer.indexOf('\n');
				if (newlineIdx === -1) break;
				const line = buffer.slice(0, newlineIdx).trim();
				buffer = buffer.slice(newlineIdx + 1);

				if (line.startsWith('event: ')) {
					const eventType = line.slice(7).trim();
					const nextNewline = buffer.indexOf('\n');
					if (nextNewline === -1) { buffer = line + '\n' + buffer; break; }
					const dataLine = buffer.slice(0, nextNewline).trim();
					buffer = buffer.slice(nextNewline + 1);

					if (dataLine.startsWith('data: ')) {
						try {
							const data = JSON.parse(dataLine.slice(6));
							if (eventType === 'text' && data.content) {
								textContent += data.content;
								chatMessages = chatMessages.map((m, i) =>
									i === assistantIdx ? { ...m, content: textContent, streaming: true } : m
								);
							} else if (eventType === 'gen_queued') {
								newItemIds.push(data.item_id);
								pendingQueueIds = new Set([...pendingQueueIds, data.item_id]);
								const queueText = `\n🎨 已提交生图 #${data.index + 1}（排队中）`;
								chatMessages = chatMessages.map((m, i) =>
									i === assistantIdx ? { ...m, content: m.content + queueText, streaming: true } : m
								);
							} else if (eventType === 'error') {
								textContent += `\n❌ ${data.message}`;
								chatMessages = chatMessages.map((m, i) =>
									i === assistantIdx ? { ...m, content: textContent } : m
								);
							}
						} catch {}
					}
				}
			}
		}

		// 结束流
		chatMessages = chatMessages.map((m, i) =>
			i === assistantIdx ? { ...m, streaming: false, queuedItemIds: newItemIds } : m
		);

		// 记录到历史
		chatHistory = [...chatHistory, { role: 'user', content: msg }, { role: 'assistant', content: textContent }];
		if (chatHistory.length > 40) chatHistory = chatHistory.slice(-40);

		// 如果有入队的生图，开始轮询
		if (newItemIds.length > 0) {
			startQueuePolling();
		}
	} catch (e: any) {
		chatMessages = chatMessages.map((m, i) =>
			i === assistantIdx ? { ...m, content: `❌ ${e.message || '请求失败'}`, streaming: false } : m
		);
	}
	sending = false;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

function startQueuePolling() {
	if (pollTimer) return;
	queuePolling = true;
	pollTimer = setInterval(async () => {
		if (pendingQueueIds.size === 0) {
			stopQueuePolling();
			return;
		}
		try {
			const res = await fetchMyQueue();
			for (const item of res.items) {
				if (!pendingQueueIds.has(item.id)) continue;
				if (item.status === 'done') {
					pendingQueueIds = new Set([...pendingQueueIds].filter(id => id !== item.id));
					// 在消息中更新状态
					chatMessages = chatMessages.map(m => {
						if (m.role !== 'assistant') return m;
						const updatedContent = m.content.replace(
							`🎨 已提交生图（排队中）`,
							`✅ 生图完成`
						);
						return { ...m, content: updatedContent };
					});
				} else if (item.status === 'failed') {
					pendingQueueIds = new Set([...pendingQueueIds].filter(id => id !== item.id));
					chatMessages = chatMessages.map(m => {
						if (m.role !== 'assistant') return m;
						const updatedContent = m.content.replace(
							`🎨 已提交生图（排队中）`,
							`❌ 生图失败: ${item.error || '未知错误'}`
						);
						return { ...m, content: updatedContent };
					});
				}
			}
		} catch {}
		if (pendingQueueIds.size === 0) stopQueuePolling();
	}, 3000);
}

function stopQueuePolling() {
	if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
	queuePolling = false;
}

function handleKeydown(e: KeyboardEvent) {
	if (e.key === 'Enter' && !e.shiftKey) {
		e.preventDefault();
		sendMessage();
	}
}

let chatContainer: HTMLDivElement | undefined;
$effect(() => {
	// 滚动到底部
	if (chatMessages.length && chatContainer) {
		requestAnimationFrame(() => {
			if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
		});
	}
});
</script>

<div class="flex flex-col h-[calc(100vh-260px)] min-h-[400px]">
	<!-- 设定区 -->
	<div class="border rounded-lg bg-card mb-3">
		<button
			class="w-full flex items-center justify-between px-3 py-2 text-sm font-medium"
			onclick={() => settingsOpen = !settingsOpen}
		>
			<span class="flex items-center gap-1.5">
				<Icon icon="mdi:cog-outline" class="size-4" />
				角色扮演设定
				{#if presetName}
					<Badge variant="secondary" class="text-[10px]">{presetName}</Badge>
				{/if}
			</span>
			<Icon icon={settingsOpen ? "mdi:chevron-up" : "mdi:chevron-down"} class="size-4 text-muted-foreground" />
		</button>

		{#if settingsOpen}
			<div class="px-3 pb-3 space-y-2 border-t pt-2">
				<!-- 预设选择 -->
				<div class="flex gap-2">
					<select
						class="flex-1 h-8 text-xs border rounded px-2 bg-background"
						value={selectedPresetIdx}
						onchange={(e) => selectPreset(Number(e.currentTarget.value))}
					>
						<option value={-1}>-- 选择或新建 --</option>
						{#each presets as p, i}
							<option value={i}>{p.name}</option>
						{/each}
					</select>
					{#if selectedPresetIdx >= 0}
						<Button variant="outline" size="sm" class="h-8 px-2 text-xs text-destructive" onclick={deletePreset}>
							<Icon icon="mdi:delete-outline" class="size-3.5" />
						</Button>
					{/if}
				</div>

				<!-- 角色名 -->
				<input
					type="text"
					class="w-full h-8 text-xs border rounded px-2 bg-background"
					placeholder="给这个角色设定起个名字"
					bind:value={presetName}
				/>

				<!-- System Prompt -->
				<textarea
					class="w-full text-xs border rounded px-2 py-1.5 bg-background resize-none"
					rows="3"
					placeholder="你正在扮演遐蝶。你是一个..."
					bind:value={systemPrompt}
				></textarea>

				<!-- 按钮行 -->
				<div class="flex gap-2">
					<Button variant="default" size="sm" class="h-7 text-xs" onclick={savePreset}>
						<Icon icon="mdi:content-save-outline" class="size-3.5 mr-1" />
						保存预设
					</Button>
					<Button variant="outline" size="sm" class="h-7 text-xs" onclick={newPreset}>
						新建
					</Button>
					<Button variant="outline" size="sm" class="h-7 text-xs ml-auto" onclick={clearChat}>
						<Icon icon="mdi:chat-remove-outline" class="size-3.5 mr-1" />
						清空聊天
					</Button>
				</div>
			</div>
		{/if}
	</div>

	<!-- 聊天消息区 -->
	<div bind:this={chatContainer} class="flex-1 overflow-y-auto space-y-3 px-1 pb-3">
		{#if chatMessages.length === 0}
			<div class="flex items-center justify-center h-full text-muted-foreground text-sm">
				开始与角色对话吧
			</div>
		{/if}
		{#each chatMessages as msg, i}
			<div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
				<div class="max-w-[80%] {msg.role === 'user'
					? 'bg-primary text-primary-foreground rounded-2xl rounded-br-sm'
					: 'bg-muted rounded-2xl rounded-bl-sm'
				} px-3 py-2 text-sm whitespace-pre-wrap break-words">
					{msg.content}
					{#if msg.streaming}
						<span class="animate-pulse">|</span>
					{/if}
					{#if msg.imageUrls?.length}
						{#each msg.imageUrls as url}
							<img src={url} alt="" class="mt-2 max-w-full rounded" loading="lazy" />
						{/each}
					{/if}
				</div>
			</div>
		{/each}
	</div>

	<!-- 输入区 -->
	<div class="flex gap-2 pt-2 border-t">
		<input
			type="text"
			class="flex-1 h-9 text-sm border rounded px-3 bg-background"
			placeholder="输入消息..."
			bind:value={inputText}
			onkeydown={handleKeydown}
			disabled={sending}
		/>
		<Button
			variant="default"
			size="sm"
			class="h-9 px-4"
			onclick={sendMessage}
			disabled={sending || !inputText.trim()}
		>
			{#if sending}
				<Icon icon="mdi:loading" class="size-4 animate-spin" />
			{:else}
				<Icon icon="mdi:send" class="size-4" />
			{/if}
		</Button>
	</div>

	{#if errorText}
		<Alert variant="destructive" class="mt-2">
			<Icon icon="mdi:alert-circle" class="size-4" />
			<AlertDescription class="text-xs">{errorText}</AlertDescription>
		</Alert>
	{/if}
</div>
