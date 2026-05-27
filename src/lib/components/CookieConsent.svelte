<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Dialog from '$lib/components/ui/dialog';
	import Icon from '@iconify/svelte';

	interface ConsentPreferences {
		necessary: boolean;
		functional: boolean;
		analytics: boolean;
	}

	let showBanner = $state(false);
	let showSettings = $state(false);

	let preferences = $state<ConsentPreferences>({
		necessary: true,
		functional: false,
		analytics: false
	});

	let agreed = $state(false);
	let overlayContent = $state<string | null>(null);
	let readAgreement = $state(false);
	let readPrivacy = $state(false);
	let canAgree = $derived(readAgreement && readPrivacy);

	const STORAGE_KEY = 'cookie-consent-preferences';
	const CONSENT_VERSION = '2.0';

	onMount(() => {
		loadPreferences();

		const handleClick = (e: Event) => {
			const target = e.target as HTMLElement;
			if (target.id === 'open_preferences_center' || target.closest('#open_preferences_center')) {
				e.preventDefault();
				showSettings = true;
			}
		};

		document.addEventListener('click', handleClick);
		return () => {
			document.removeEventListener('click', handleClick);
		};
	});

	function loadPreferences() {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				const data = JSON.parse(stored);
				if (data.version === CONSENT_VERSION && data.agreed) {
					preferences = data.preferences;
					agreed = true;
					applyConsent();
					return;
				}
			}
		} catch (e) {
			console.error('Failed to load cookie preferences:', e);
		}

		showBanner = true;
	}

	function savePreferences(close = true) {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({
				version: CONSENT_VERSION,
				preferences,
				agreed: true,
				timestamp: Date.now()
			}));
			agreed = true;
		} catch (e) {
			console.error('Failed to save cookie preferences:', e);
		}
		if (close) {
			applyConsent();
			showBanner = false;
			showSettings = false;
		}
	}

	function acceptAll() {
		preferences = {
			necessary: true,
			functional: true,
			analytics: true
		};
		savePreferences();
	}

	function acceptNecessary() {
		preferences = {
			necessary: true,
			functional: false,
			analytics: false
		};
		savePreferences();
	}

	function saveCustomPreferences() {
		preferences.necessary = true;
		savePreferences();
	}

	function withdrawConsent() {
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {}
		agreed = false;
		readAgreement = false;
		readPrivacy = false;
		showBanner = true;
		showSettings = false;
	}

	function applyConsent() {
		window.dispatchEvent(new CustomEvent('cookie-consent-updated', {
			detail: preferences
		}));
	}
</script>

<!-- Cookie 横幅 -->
{#if showBanner}
	<div class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
		<div class="fixed bottom-0 left-0 right-0 p-4 md:p-6">
			<Card class="mx-auto max-w-3xl">
				<CardHeader class="pb-2">
					<CardTitle class="flex items-center gap-2">
						<Icon icon="mdi:cookie" class="h-5 w-5" />
						隐私与协议
					</CardTitle>
				</CardHeader>
				<CardContent class="pt-0">
					<p class="text-xs text-muted-foreground mb-3">
						继续使用本网站即表示你同意以下协议及隐私政策中所述的 Cookie 使用方式。
					</p>
					<div class="space-y-4">
						<p class="text-sm text-muted-foreground">
							点击"接受全部"即表示您同意我们使用所有 Cookie，您也可以点击"自定义设置"来选择您希望启用的 Cookie 类型。
						</p>

			<label class="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
				<Checkbox bind:checked={agreed} disabled={!canAgree} class="mt-0.5" />
				<div class="text-xs space-y-1">
					<span>我已阅读并同意</span>
					<button type="button" class="text-primary underline hover:text-primary/80" onclick={() => overlayContent = 'agreement'}>《用户协议》</button>
					<span>和</span>
				<button type="button" class="text-primary underline hover:text-primary/80" onclick={() => overlayContent = 'privacy'}>《隐私政策》</button>
			</div>
			{#if !canAgree}
				<div class="text-[10px] text-muted-foreground mt-1">请先点击上方链接阅读并确认同意协议</div>
			{/if}
		</label>

						<div class="flex flex-wrap gap-3">
							<Button onclick={acceptAll} disabled={!agreed}>
								<Icon icon="mdi:check-all" class="mr-2 h-4 w-4" />
								接受全部
							</Button>
							<Button variant="outline" onclick={acceptNecessary} disabled={!agreed}>
								仅必要 Cookie
							</Button>
							<Button variant="outline" onclick={() => showSettings = true} disabled={!agreed}>
								<Icon icon="mdi:cog" class="mr-2 h-4 w-4" />
								自定义设置
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	</div>
{/if}

<!-- Cookie 设置对话框 -->
<Dialog.Root bind:open={showSettings}>
	<Dialog.Content class="max-w-2xl max-h-[90vh] overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>隐私与协议设置</Dialog.Title>
			<Dialog.Description>
				请阅读并同意用户协议与隐私政策，并选择您希望启用的 Cookie 类型。必要 Cookie 无法禁用。
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-6 py-4">
						<label class="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
							<Checkbox bind:checked={agreed} disabled={!canAgree} class="mt-0.5" />
							<div class="text-xs space-y-1">
								<span>我已阅读并同意</span>
								<button type="button" class="text-primary underline hover:text-primary/80" onclick={() => overlayContent = 'agreement'}>《用户协议》</button>
								<span>和</span>
								<button type="button" class="text-primary underline hover:text-primary/80" onclick={() => overlayContent = 'privacy'}>《隐私政策》</button>
							</div>
							{#if !canAgree}
								<div class="text-[10px] text-muted-foreground mt-1">请先点击上方链接阅读并确认同意协议</div>
							{/if}
						</label>

			<!-- 必要 Cookie -->
			<div class="space-y-3">
				<div class="flex items-start gap-3">
					<Checkbox checked={true} disabled={true} class="mt-1" />
					<div class="flex-1">
						<h3 class="font-semibold">必要 Cookie</h3>
						<p class="text-sm text-muted-foreground mt-1 mb-2">
							这些 Cookie 对于网站的基本功能是必需的，无法禁用。
						</p>
						<ul class="text-sm text-muted-foreground space-y-1 list-disc list-inside">
							<li>Umami Analytics - 网站统计</li>
							<li>Cloudflare Insights - 性能监控</li>
						</ul>
					</div>
				</div>
			</div>

			<!-- 功能性 Cookie -->
			<div class="space-y-3">
				<div class="flex items-start gap-3">
					<Checkbox bind:checked={preferences.functional} class="mt-1" />
					<div class="flex-1">
						<h3 class="font-semibold">功能性 Cookie</h3>
						<p class="text-sm text-muted-foreground mt-1 mb-2">
							这些 Cookie 用于增强网站功能和个性化体验。
						</p>
						<ul class="text-sm text-muted-foreground space-y-1 list-disc list-inside">
							<li>Giscus - 评论系统</li>
						</ul>
					</div>
				</div>
			</div>

			<!-- 分析 Cookie -->
			<div class="space-y-3">
				<div class="flex items-start gap-3">
					<Checkbox bind:checked={preferences.analytics} class="mt-1" />
					<div class="flex-1">
						<h3 class="font-semibold">分析 Cookie</h3>
						<p class="text-sm text-muted-foreground mt-1 mb-2">
							这些 Cookie 帮助我们了解访问者如何使用网站，以便改进用户体验。
						</p>
						<ul class="text-sm text-muted-foreground space-y-1 list-disc list-inside">
							<li>百度统计 - 访问分析</li>
							<li>Google Analytics - 用户行为分析</li>
							<li>Microsoft Clarity - 用户体验分析</li>
						</ul>
					</div>
				</div>
			</div>
		</div>

		<Dialog.Footer class="flex-wrap gap-2">
			<Button variant="ghost" size="sm" onclick={withdrawConsent} class="text-destructive hover:text-destructive">
				<Icon icon="mdi:close-circle-outline" class="size-3.5 mr-1" />撤回同意
			</Button>
			<div class="flex-1" />
			<Button variant="outline" onclick={acceptNecessary} disabled={!agreed}>
				仅必要 Cookie
			</Button>
			<Button onclick={saveCustomPreferences} disabled={!agreed}>
				保存设置
			</Button>
			<Button onclick={acceptAll} disabled={!agreed}>
				接受全部
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- 全屏协议展示 -->
{#if overlayContent}
	<div class="fixed inset-0 z-50 bg-background overflow-y-auto" onclick={() => overlayContent = null}>
		<div class="max-w-2xl mx-auto px-6 py-8" onclick={(e) => e.stopPropagation()}>
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-lg font-bold">{overlayContent === 'agreement' ? '用户协议' : '隐私政策'}</h2>
				<button type="button" class="text-muted-foreground hover:text-foreground" onclick={() => overlayContent = null}>
					<Icon icon="mdi:close" class="size-6" />
				</button>
			</div>
			<div class="text-sm space-y-3 leading-relaxed">
				{#if overlayContent === 'agreement'}
					<p>1. 本网站提供的 AI 生图服务生成的内容由人工智能自动生成，不代表本网站观点。</p>
					<p>2. 你承诺不会利用本服务生成、上传或传播任何违法、侵权、色情、暴力、政治敏感或其他违反中国法律法规及公序良俗的内容。</p>
					<p>3. 论坛发言请遵守基本网络礼仪，禁止恶意攻击、垃圾广告、刷屏等行为。违规内容可能被删除，账号可能被限制或封禁。</p>
					<p>4. 本服务按"现状"提供，不保证任何服务可用性（SLA）。站内点券及内购服务为自愿充值，一经售出概不退换。</p>
					<p>5. 我们有权审查你提交及生成的内容，并依据本协议对违规账号采取措施。</p>
					<p>6. 我们保留随时修改本协议的权利，修改后的协议自发布之日起生效。</p>
				{:else}
					<p><strong>必要服务（始终加载）：</strong>Umami Analytics（自托管）收集匿名访问数据；Cloudflare Web Analytics 无 Cookie 无指纹追踪。</p>
					<p><strong>广告：</strong>Google Adsense 展示广告，使用 Cookie 提供个性化广告。</p>
					<p><strong>功能（需同意）：</strong>Giscus 基于 GitHub Discussions 的评论系统。</p>
					<p><strong>分析（需同意）：</strong>百度统计、Google Analytics、Microsoft Clarity 收集站点访问与用户行为数据。</p>
					<p><strong>本地存储：</strong>cookie-consent-preferences（同意偏好）、theme（主题）、论坛登录凭证。</p>
					<p><strong>其他：</strong>Cloudflare Turnstile 人机验证；按需加载 CDN 资源。</p>
					<p>数据控制：可通过本页面底部的「隐私与协议设置」按钮随时修改。清除 localStorage 可删除本地存储的所有数据。</p>
				{/if}
			</div>
			<div class="mt-6 flex justify-center">
				<button type="button" class="px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90" onclick={() => { if (overlayContent === 'agreement') readAgreement = true; if (overlayContent === 'privacy') readPrivacy = true; overlayContent = null; }}>
					我已阅读
				</button>
			</div>
		</div>
	</div>
{/if}
