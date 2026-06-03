<script lang="ts">
import Icon from '@iconify/svelte';
import { Button } from '$lib/components/ui/button';
import { Label } from '$lib/components/ui/label';
import { Alert, AlertDescription } from '$lib/components/ui/alert';
import { forumAuth } from '$lib/forum/stores/auth';
import { addToQueue, fetchMyQueue, getImageUrl, fetchTtsSpeakers } from '$lib/draw/api/client';
import { Badge } from '$lib/components/ui/badge';
import { onMount } from 'svelte';
import TurnstileWidget from '$lib/components/TurnstileWidget.svelte';

let {
  ttsPerChar = 0.01, ttsPerSec = 0.033, ttsMin = 1,
  turnstileToken = $bindable(''),
  turnstileTick = $bindable(0),
  turnstileEnabled = false,
}: {
  ttsPerChar?: number;
  ttsPerSec?: number;
  ttsMin?: number;
  turnstileToken?: string;
  turnstileTick?: number;
  turnstileEnabled?: boolean;
} = $props();

type TtsMode = 'preset' | 'custom' | 'clone';
let mode = $state<TtsMode>('preset');

// Mode → workflow 映射
const WF_MAP: Record<TtsMode, string> = {
  preset: 'TTS/QwenTTS预设.json',
  custom: 'TTS/QwenTTS自定义音色.json',
  clone: 'TTS/QwenTTS声音克隆.json',
};

// Preset mode
let speakers = $state<Array<{ id: string; description: string }>>([]);
let selectedSpeaker = $state('Vivian');

// Clone & Custom mode
let instruct = $state('');
let refText = $state('');

// Audio upload (clone only)
let audioFile = $state<File | null>(null);
let audioUrl = $state('');

// Shared
let targetText = $state('');
let language = $state('auto');
let submitting = $state(false);
let error = $state('');

// Queue state
let queueItemId = $state<number | null>(null);
let queueStatus = $state('');
let queuePosition = $state<number | null>(null);
let queueError = $state('');
let pollTimer: ReturnType<typeof setInterval> | null = null;
let resultUrl = $state('');
let done = $state(false);

let estimatedCost = $derived(Math.max(ttsMin, Math.ceil(targetText.length * ttsPerChar)));
let costLabel = $derived(estimatedCost > 0 ? `⚡${estimatedCost}~` : '');

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  audioFile = file;
  audioUrl = URL.createObjectURL(file);
}

async function handleSubmit() {
  if (submitting || !targetText) return;
  error = '';
  submitting = true;
  try {
    const payload: any = {
      direct_prompt: targetText,
      workflow_path: WF_MAP[mode],
      language,
      turnstile_token: turnstileToken || undefined,
    };
    if (mode === 'preset') {
      payload.speaker = selectedSpeaker;
      if (instruct) payload.instruct = instruct;
    } else if (mode === 'custom') {
      if (instruct) payload.instruct = instruct;
    } else if (mode === 'clone') {
      if (refText) payload.ref_text = refText;
    }
    const res = await addToQueue(payload);
    turnstileTick++;
    queueItemId = res.item_id;
    queueStatus = 'pending';
    queuePosition = res.position;
    pollTimer = setInterval(pollStatus, 2000);
  } catch (e: unknown) {
    error = e instanceof Error ? e.message : '提交失败';
  } finally {
    submitting = false;
  }
}

async function pollStatus() {
  if (!queueItemId) return;
  try {
    const q = await fetchMyQueue();
    const item = q.items.find(i => i.id === queueItemId);
    if (!item) {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      return;
    }
    queueStatus = item.status;
    queuePosition = item.position ?? null;
    if (item.status === 'done') {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      const files = (item as any)._output_files || [];
      if (files.length > 0) {
        resultUrl = getImageUrl(files[0]);
      }
      done = true;
    } else if (item.status === 'failed') {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      queueError = item.error || '生成失败';
    }
  } catch {}
}

function handleReset() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  queueItemId = null;
  queueStatus = '';
  queuePosition = null;
  queueError = '';
  resultUrl = '';
  done = false;
  error = '';
}

onMount(async () => {
  try {
    const sp = await fetchTtsSpeakers();
    speakers = sp.speakers;
    if (speakers.length > 0) selectedSpeaker = speakers[0].id;
  } catch {}
});

function statusLabel(s: string): string {
  switch (s) {
    case 'pending': return '排队中';
    case 'waiting': return '等待中';
    case 'running': return '转换中';
    case 'done': return '完成';
    case 'failed': return '失败';
    default: return s;
  }
}
</script>

<div class="space-y-4">
  <h3 class="text-sm font-medium flex items-center gap-1.5">
    <Icon icon="mdi:voice" class="size-4" />
    语音合成 (TTS)
  </h3>

  <!-- Mode Toggle -->
  <div class="flex gap-2">
    <button onclick={() => { mode = 'preset'; handleReset(); }} class="px-3 py-1.5 text-xs rounded-lg border {mode === 'preset' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-accent'} transition-colors">预设音色</button>
    <button onclick={() => { mode = 'custom'; handleReset(); }} class="px-3 py-1.5 text-xs rounded-lg border {mode === 'custom' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-accent'} transition-colors">自定义音色</button>
    <button disabled class="px-3 py-1.5 text-xs rounded-lg border bg-muted text-muted-foreground cursor-not-allowed opacity-50" title="声音克隆暂不可用（需上传参考音频）">声音克隆</button>
  </div>

  {#if mode === 'preset'}
    <!-- Preset Voice -->
    <div class="space-y-1.5">
      <Label for="tts-speaker">预制音色</Label>
      <select id="tts-speaker" bind:value={selectedSpeaker} class="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs">
        {#each speakers as sp}
          <option value={sp.id}>{sp.id} — {sp.description}</option>
        {/each}
      </select>
    </div>
    <div class="space-y-1.5">
      <Label for="tts-instruct">风格指令 <span class="text-muted-foreground text-[10px]">(可选)</span></Label>
      <input id="tts-instruct" bind:value={instruct} placeholder="如：用特别愤怒的语气说、Very happy、悲伤地"
        class="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground" />
    </div>
  {:else if mode === 'custom'}
    <!-- Custom Voice Design -->
    <div class="space-y-1.5">
      <Label for="tts-instruct-custom">音色描述 <span class="text-muted-foreground text-[10px]">(可选)</span></Label>
      <input id="tts-instruct-custom" bind:value={instruct} placeholder="如：女人，萝莉音，难过，甜美，撒娇"
        class="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground" />
    </div>
  {:else}
    <!-- Voice Clone -->
    <div class="space-y-1.5">
      <Label for="tts-refaudio">参考音频 <span class="text-muted-foreground text-[10px]">(可选)</span></Label>
      <input id="tts-refaudio" type="file" accept="audio/*" onchange={handleFileSelect}
        class="block w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer" />
      {#if audioFile}
        <div class="text-xs text-muted-foreground">{audioFile.name} ({(audioFile.size / 1024).toFixed(1)} KB)</div>
        <audio src={audioUrl} controls class="w-full h-10 mt-1" />
      {/if}
    </div>
    <div class="space-y-1.5">
      <Label for="tts-reftext">参考文本 <span class="text-muted-foreground text-[10px]">(可选)</span></Label>
      <textarea id="tts-reftext" bind:value={refText} rows={2}
        placeholder="输入参考音频对应的文本内容"
        class="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground resize-none"></textarea>
    </div>
  {/if}

  <!-- Language -->
  <div class="space-y-1.5">
    <Label for="tts-lang">语言</Label>
    <select id="tts-lang" bind:value={language} class="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs">
      <option value="auto">自动检测</option>
      <option value="zh">中文</option>
      <option value="en">英文</option>
      <option value="ja">日文</option>
      <option value="ko">韩文</option>
    </select>
  </div>

  <!-- Target Text -->
  <div class="space-y-1.5">
    <Label for="tts-text">要合成的文字</Label>
    <textarea id="tts-text" bind:value={targetText} rows={3}
      placeholder="输入要合成语音的文字内容"
      class="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground resize-none"></textarea>
  </div>

  {#if turnstileEnabled}
    <TurnstileWidget
      siteKey="0x4AAAAAADSVSh5jjelMNlrv"
      tick={turnstileTick}
      onToken={(t) => (turnstileToken = t)}
      onExpired={() => (turnstileToken = '')}
    />
  {/if}

  <!-- Submit -->
  <Button onclick={handleSubmit}
    disabled={submitting || !targetText || done} class="w-full">
    <Icon icon="mdi:send" class="size-4 mr-1" />
    {submitting ? '提交中...' : done ? '已完成' : '开始生成'}
    {#if !done && !queueItemId && estimatedCost > 0}
      <Badge variant="secondary" class="ml-1.5 text-[10px] px-1">{costLabel}</Badge>
    {/if}
  </Button>

  <!-- Error -->
  {#if error}
    <Alert variant="destructive">
      <Icon icon="mdi:alert-circle" class="size-4" />
      <AlertDescription class="text-xs">{error}</AlertDescription>
    </Alert>
  {/if}

  <!-- Queue Status -->
  {#if queueItemId && !done && !queueError}
    <div class="flex items-center gap-2 text-xs border rounded-lg px-3 py-2">
      <Icon icon="mdi:loading" class="size-4 animate-spin text-primary" />
      <span class="flex-1">
        {statusLabel(queueStatus)}
        {#if queueStatus === 'pending' && queuePosition != null}
          ，前面还有 {queuePosition - 1} 位
        {/if}
      </span>
    </div>
  {/if}

  <!-- Failed -->
  {#if queueError}
    <Alert variant="destructive">
      <Icon icon="mdi:alert-circle" class="size-4" />
      <AlertDescription class="text-xs">{queueError}</AlertDescription>
    </Alert>
    <Button variant="outline" size="sm" onclick={handleReset} class="mt-2">重新开始</Button>
  {/if}

  <!-- Result -->
  {#if done}
    <div class="space-y-2 border rounded-lg p-3">
      <div class="text-xs font-medium flex items-center gap-1.5">
        <Icon icon="mdi:check-circle" class="size-4 text-green-500" />
        转换完成
      </div>
      {#if resultUrl}
        <audio src={resultUrl} controls class="w-full h-10" />
        <div class="flex gap-2">
          <a href={resultUrl} download class="flex-1">
            <Button variant="default" size="sm" class="w-full">
              <Icon icon="mdi:download" class="size-4 mr-1" />
              下载音频
            </Button>
          </a>
          <Button variant="outline" size="sm" onclick={handleReset}>重新开始</Button>
        </div>
      {:else}
        <div class="text-xs text-muted-foreground">
          音频文件处理中，请前往<a href="/draw/#mine" class="underline font-medium">"我的"页面</a>查看和下载。
        </div>
        <Button variant="outline" size="sm" onclick={handleReset}>重新开始</Button>
      {/if}
    </div>
  {/if}
</div>
