<script lang="ts">
import Icon from '@iconify/svelte';
import { Button } from '$lib/components/ui/button';
import { Alert, AlertDescription } from '$lib/components/ui/alert';
import { Badge } from '$lib/components/ui/badge';
import { chatRequest, addToQueue, fetchMyQueue, getImageProxyUrl, fetchChatPresets, saveChatPreset, deleteChatPreset, fetchChatHistory, appendChatHistory, clearChatHistory } from '$lib/draw/api/client';
import { onMount } from 'svelte';

let {
	workflowPath = '',
	styleTags = '',
	negativePrompt = '',
	width = 0,
	height = 0,
	turnstileToken = '',
	pointsCostSubmit = 0,
}: {
	workflowPath?: string;
	styleTags?: string;
	negativePrompt?: string;
	width?: number;
	height?: number;
	turnstileToken?: string;
	pointsCostSubmit?: number;
} = $props();

interface ChatPreset { id: string; name: string; systemPrompt: string; }

interface PendingImage { tags: string; itemId: number; status: string; imageUrl: string; }

interface ChatMessage {
	role: 'user' | 'assistant';
	content: string;
	streaming?: boolean;
	imageUrls?: string[];
	pendingImages?: PendingImage[];
}

let presets = $state<ChatPreset[]>([]);
let selectedPresetIdx = $state<number>(-1);
let presetName = $state('');
let systemPrompt = $state('');
let chatMessages = $state<ChatMessage[]>([]);
let chatHistory = $state<Array<{ role: string; content: string; imageUrls?: string[]; systemPrompt?: string }>>([]);
let inputText = $state('');
let sending = $state(false);
let settingsOpen = $state(true);
let errorText = $state('');
let genEnabled = $state(true);
let helpOpen = $state(false);
let conversationStarted = $state(false);

let totalLlmCost = $state(0);
let totalLlmTokens = $state(0);
let totalGenCount = $state(0);
let totalGenCost = $state(0);

// 队列轮询：itemId → messageIndex
let pendingItemIds = $state<Map<number, number>>(new Map());

async function loadPresets() {
	try { const res = await fetchChatPresets(); presets = res.items || []; } catch { presets = []; }
}

onMount(async () => {
	await loadPresets();
		try {
		const res = await fetchChatHistory();
		chatHistory = res.items || [];
		chatMessages = chatHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content, imageUrls: m.imageUrls || [] }));
		if (chatMessages.length > 0) {
			conversationStarted = true;
			// 恢复最后一条消息携带的 systemPrompt
			for (let i = chatHistory.length - 1; i >= 0; i--) {
				if (chatHistory[i].systemPrompt) {
					systemPrompt = chatHistory[i].systemPrompt!;
					break;
				}
			}
		}
	} catch {}
});

function selectPreset(idx: number) {
	selectedPresetIdx = idx;
	if (idx >= 0 && presets[idx]) { presetName = presets[idx].name; systemPrompt = presets[idx].systemPrompt; }
	else { presetName = ''; systemPrompt = ''; }
}

async function savePreset() {
	if (!presetName.trim() || !systemPrompt.trim()) return;
	try {
		await saveChatPreset(presetName.trim(), systemPrompt.trim());
		await loadPresets();
		selectedPresetIdx = presets.findIndex(p => p.name === presetName.trim());
	} catch (e: any) { errorText = '保存失败: ' + (e.message || '未知错误'); }
}

async function deletePreset() {
	if (selectedPresetIdx < 0 || !presets[selectedPresetIdx]) return;
	try {
		await deleteChatPreset(presets[selectedPresetIdx].id);
		await loadPresets();
		selectedPresetIdx = -1; presetName = ''; systemPrompt = '';
	} catch (e: any) { errorText = '删除失败: ' + (e.message || '未知错误'); }
}

function newPreset() { selectedPresetIdx = -1; presetName = ''; systemPrompt = ''; }

function clearChat() {
	chatMessages = []; chatHistory = [];
	pendingItemIds = new Map();
	totalLlmCost = 0; totalLlmTokens = 0; totalGenCount = 0; totalGenCost = 0;
	conversationStarted = false;
	clearChatHistory().catch(() => {});
}

async function submitGenJob(tags: string, msgIdx: number) {
	let finalWfPath = workflowPath;
	if (finalWfPath.endsWith('.txt')) finalWfPath = 'WAI/通用/无Lora.json';
	try {
		const res = await addToQueue({
			direct_prompt: tags, width: width || undefined, height: height || undefined,
			style_tags: styleTags || undefined, negative_prompt: negativePrompt || undefined,
			workflow_path: finalWfPath, turnstile_token: turnstileToken || undefined,
		});
		// 添加到消息的 pendingImages
		chatMessages = chatMessages.map((m, i) => {
			if (i !== msgIdx) return m;
			const pending = [...(m.pendingImages || []), { tags, itemId: res.item_id, status: 'pending', imageUrl: '' }];
			return { ...m, pendingImages: pending };
		});
		pendingItemIds = new Map(pendingItemIds).set(res.item_id, msgIdx);
		totalGenCount++; totalGenCost += pointsCostSubmit;
		startQueuePolling();
	} catch {}
}

async function sendMessage() {
	const msg = inputText.trim();
	if (!msg || sending) return;
	if (!systemPrompt.trim()) { errorText = '请先填写角色设定'; return; }
	if (!workflowPath) { errorText = '请先在文生图页选择工作流'; return; }
	errorText = ''; sending = true; conversationStarted = true;

	chatMessages = [...chatMessages, { role: 'user', content: msg }];
	inputText = '';

	const assistantIdx = chatMessages.length;
	chatMessages = [...chatMessages, { role: 'assistant', content: '', streaming: true, imageUrls: [], pendingImages: [] }];

	try {
		const response = await chatRequest({
			message: msg, workflow_path: workflowPath || undefined, style_tags: styleTags || undefined,
			system_prompt: systemPrompt, negative_prompt: negativePrompt || 'worst quality, low quality, blurry',
			history: chatHistory, gen_enabled: genEnabled,
		});

		const reader = response.body?.getReader();
		if (!reader) throw new Error('无法读取响应流');
		const decoder = new TextDecoder();
		let buffer = ''; let textContent = '';

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
							} else if (eventType === 'gen_tags' && genEnabled && data.tags?.length) {
								// 直接提交生图，不写文字
								for (const tags of data.tags) {
									await submitGenJob(tags, assistantIdx);
								}
							} else if (eventType === 'error') {
								textContent += `\n❌ ${data.message}`;
								chatMessages = chatMessages.map((m, i) =>
									i === assistantIdx ? { ...m, content: textContent } : m
								);
							} else if (eventType === 'done') {
								if (data.llm_cost) totalLlmCost += data.llm_cost;
								if (data.llm_tokens) totalLlmTokens += data.llm_tokens;
							}
						} catch {}
					}
				}
			}
		}

		chatMessages = chatMessages.map((m, i) => i === assistantIdx ? { ...m, streaming: false } : m);

		chatHistory = [...chatHistory, { role: 'user', content: msg }, { role: 'assistant', content: textContent }];
		if (chatHistory.length > 40) chatHistory = chatHistory.slice(-40);
		try { await appendChatHistory([{ role: 'user', content: msg, systemPrompt }, { role: 'assistant', content: textContent }]); } catch {}
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
	pollTimer = setInterval(async () => {
		if (pendingItemIds.size === 0) { stopQueuePolling(); return; }
		try {
			const res = await fetchMyQueue();
			for (const item of res.items) {
				if (!pendingItemIds.has(item.id)) continue;
				const msgIdx = pendingItemIds.get(item.id)!;
				if (item.status === 'done') {
					const files = (item as any)._output_files as string[] | undefined;
					let imageUrl = '';
					if (files?.length) {
						const f = files[0]; const parts = f.split('/');
						const filename = parts.pop()!; const subfolder = parts.join('/');
						imageUrl = getImageProxyUrl(filename, subfolder);
					}
					// 移到 imageUrls
					chatMessages = chatMessages.map((m, i) => {
						if (i !== msgIdx) return m;
						const imageUrls = [...(m.imageUrls || []), imageUrl];
						const pendingImages = (m.pendingImages || []).filter(p => p.itemId !== item.id);
						return { ...m, imageUrls, pendingImages };
					});
					// 同步更新 chatHistory 并保存
					const updatedMsg = chatMessages[msgIdx];
					if (updatedMsg) {
						chatHistory = chatHistory.map((h, i) => {
							if (i !== msgIdx) return h;
							return { ...h, imageUrls: updatedMsg.imageUrls };
						});
						try { await appendChatHistory([{ role: 'assistant', content: updatedMsg.content, imageUrls: updatedMsg.imageUrls }]); } catch {}
					}
					pendingItemIds = new Map([...pendingItemIds].filter(([k]) => k !== item.id));
				} else if (item.status === 'failed') {
					chatMessages = chatMessages.map((m, i) => {
						if (i !== msgIdx) return m;
						const pendingImages = (m.pendingImages || []).map(p =>
							p.itemId === item.id ? { ...p, status: 'failed' } : p
						);
						return { ...m, pendingImages };
					});
					pendingItemIds = new Map([...pendingItemIds].filter(([k]) => k !== item.id));
				} else {
					chatMessages = chatMessages.map((m, i) => {
						if (i !== msgIdx) return m;
						const pendingImages = (m.pendingImages || []).map(p =>
							p.itemId === item.id ? { ...p, status: item.status } : p
						);
						return { ...m, pendingImages };
					});
				}
			}
		} catch {}
		if (pendingItemIds.size === 0) stopQueuePolling();
	}, 3000);
}

function stopQueuePolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

function handleKeydown(e: KeyboardEvent) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }

let chatContainer: HTMLDivElement | undefined;
$effect(() => {
	if (chatMessages.length && chatContainer) {
		requestAnimationFrame(() => { if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight; });
	}
});
</script>

<div class="flex flex-col h-[calc(100vh-260px)] min-h-[400px]">
	<!-- 设定区 -->
	<div class="border rounded-lg bg-card mb-3">
		<button class="w-full flex items-center justify-between px-3 py-2 text-sm font-medium" onclick={() => settingsOpen = !settingsOpen}>
			<span class="flex items-center gap-1.5">
				<Icon icon="mdi:cog-outline" class="size-4" />
				角色扮演设定
				{#if presetName}<Badge variant="secondary" class="text-[10px]">{presetName}</Badge>{/if}
				{#if conversationStarted}
					<Badge variant="outline" class="text-[10px] text-muted-foreground">对话中锁定</Badge>
					<button class="text-[10px] px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/80 transition-colors" onclick={(e) => { e.stopPropagation(); clearChat(); }}>清空并新建</button>
				{/if}
			</span>
			<Icon icon={settingsOpen ? "mdi:chevron-up" : "mdi:chevron-down"} class="size-4 text-muted-foreground" />
		</button>
		{#if settingsOpen}
			<div class="px-3 pb-3 space-y-2 border-t pt-2">
				<div class="flex gap-2">
					<select class="flex-1 h-8 text-xs border rounded px-2 bg-background" value={selectedPresetIdx} onchange={(e) => selectPreset(Number(e.currentTarget.value))} disabled={conversationStarted}>
						<option value={-1}>-- 选择或新建 --</option>
						{#each presets as p, i}<option value={i}>{p.name}</option>{/each}
					</select>
					{#if selectedPresetIdx >= 0 && !conversationStarted}
						<Button variant="outline" size="sm" class="h-8 px-2 text-xs text-destructive" onclick={deletePreset}><Icon icon="mdi:delete-outline" class="size-3.5" /></Button>
					{/if}
				</div>
				<input type="text" class="w-full h-8 text-xs border rounded px-2 bg-background" placeholder="给这个角色设定起个名字" bind:value={presetName} disabled={conversationStarted} />
				<textarea class="w-full text-xs border rounded px-2 py-1.5 bg-background resize-none" rows="3" placeholder="你正在扮演遐蝶。你是一个..." bind:value={systemPrompt} disabled={conversationStarted}></textarea>
				<div class="flex gap-2">
					{#if !conversationStarted}
						<Button variant="default" size="sm" class="h-7 text-xs" onclick={savePreset}><Icon icon="mdi:content-save-outline" class="size-3.5 mr-1" />保存预设</Button>
						<Button variant="outline" size="sm" class="h-7 text-xs" onclick={newPreset}>新建</Button>
						<Button variant="outline" size="sm" class="h-7 text-xs ml-auto" onclick={clearChat}>
							<Icon icon="mdi:chat-remove-outline" class="size-3.5 mr-1" />清空聊天
						</Button>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<!-- 聊天消息区 -->
	<div bind:this={chatContainer} class="flex-1 overflow-y-auto space-y-3 px-1 pb-3">
		{#if chatMessages.length === 0}
			<div class="flex items-center justify-center h-full text-muted-foreground text-sm">开始与角色对话吧</div>
		{/if}
		{#each chatMessages as msg, i}
			<div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
				<div class="max-w-[80%] {msg.role === 'user'
					? 'bg-primary text-primary-foreground rounded-2xl rounded-br-sm'
					: 'bg-muted rounded-2xl rounded-bl-sm'
				} px-3 py-2 text-sm whitespace-pre-wrap break-words">
					{msg.content}
					{#if msg.streaming}<span class="animate-pulse">|</span>{/if}

					<!-- 已完成的图片 -->
					{#if msg.imageUrls?.length}
						<div class="flex flex-wrap gap-1.5 mt-2">
							{#each msg.imageUrls as url}
								{#if url}
									<a href={url} target="_blank" rel="noopener">
										<img src={url} alt="" class="max-w-[180px] rounded border" loading="lazy" />
									</a>
								{/if}
							{/each}
						</div>
					{/if}

					<!-- 生成中的图片占位 -->
					{#if msg.pendingImages?.length}
						<div class="flex flex-wrap gap-1.5 mt-2">
							{#each msg.pendingImages as pending}
								<div class="w-[120px] h-[120px] rounded border bg-background/50 flex flex-col items-center justify-center gap-1">
									{#if pending.status === 'failed'}
										<Icon icon="mdi:alert-circle" class="size-6 text-destructive" />
										<span class="text-[10px] text-destructive">失败</span>
									{:else}
										<div class="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
										<span class="text-[10px] text-muted-foreground">
											{pending.status === 'pending' ? '排队中' : pending.status === 'waiting' ? '等待中' : '生图中'}
										</span>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>

	<!-- 输入区 -->
	<div class="flex gap-2 pt-2 border-t items-center">
		<div class="flex h-9 border rounded overflow-hidden">
			<button class="flex items-center gap-1 px-2 text-xs transition-colors {genEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}" onclick={() => genEnabled = !genEnabled} title={genEnabled ? '生图已开启，点击关闭' : '生图已关闭，点击开启'}>
				<Icon icon="mdi:image-outline" class="size-4" />
				<span class="hidden sm:inline">{genEnabled ? '生图' : '纯聊'}</span>
			</button>
			<button class="flex items-center justify-center w-7 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border-l" onclick={() => helpOpen = true} title="使用帮助">?</button>
		</div>
		<input type="text" class="flex-1 h-9 text-sm border rounded px-3 bg-background" placeholder={genEnabled ? '输入消息，AI 会边聊边生图...' : '输入消息...'} bind:value={inputText} onkeydown={handleKeydown} disabled={sending} />
		<Button variant="default" size="sm" class="h-9 px-4" onclick={sendMessage} disabled={sending || !inputText.trim()}>
			{#if sending}<Icon icon="mdi:loading" class="size-4 animate-spin" />{:else}<Icon icon="mdi:send" class="size-4" />{/if}
		</Button>
	</div>

	{#if errorText}
		<Alert variant="destructive" class="mt-2">
			<Icon icon="mdi:alert-circle" class="size-4" />
			<AlertDescription class="text-xs">{errorText}</AlertDescription>
		</Alert>
	{/if}

	{#if totalLlmCost > 0 || totalGenCount > 0}
		<div class="flex items-center gap-3 text-[10px] text-muted-foreground pt-1.5 border-t mt-1.5">
			<span>本次消耗：</span>
			{#if totalLlmCost > 0}<span>💬 LLM {totalLlmTokens} tokens / {totalLlmCost} 点</span>{/if}
			{#if totalGenCount > 0}<span>🎨 生图 ×{totalGenCount} / {totalGenCost} 点</span>{/if}
			<span class="font-medium text-foreground">共 {totalLlmCost + totalGenCost} 点</span>
		</div>
	{/if}
</div>

{#if helpOpen}
	<div class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onclick={() => helpOpen = false}>
		<div class="bg-card rounded-lg shadow-xl max-w-md w-full p-5 space-y-3" onclick={(e) => e.stopPropagation()}>
			<h3 class="text-lg font-bold">酒馆使用说明</h3>
			<div class="text-sm text-muted-foreground space-y-2">
				<p><strong>酒馆</strong>是一个角色扮演聊天功能，AI 会扮演你设定的角色与你对话。</p>
				<p><strong>生图开关</strong>：开启后，AI 会在对话中自动生图（消耗生图点数）。关闭后为纯文字聊天。</p>
				<p><strong>使用步骤</strong>：</p>
				<ol class="list-decimal pl-4 space-y-1">
					<li>在上方「角色设定」中填写角色名和 System Prompt</li>
					<li>在「文生图」页选择好工作流、画风、分辨率</li>
					<li>开始聊天，AI 会以角色身份回复并自动生图</li>
				</ol>
				<p><strong>计费</strong>：聊天按 LLM token 消耗点数，生图按次扣费。</p>
			</div>
			<button class="w-full py-2 bg-primary text-primary-foreground rounded text-sm" onclick={() => helpOpen = false}>知道了</button>
		</div>
	</div>
{/if}
