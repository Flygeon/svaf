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
					readAgreement = true;
					readPrivacy = true;
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
			<div class="text-[10px] {canAgree ? 'text-green-600' : 'text-red-500'}">
				{#if canAgree}
					已完整阅读以上协议 ✓
				{:else}
					您还需要完整阅读{!readAgreement ? '《用户协议》' : ''}{!readAgreement && !readPrivacy ? '和' : ''}{!readPrivacy ? '《隐私政策》' : ''}后方可勾选该复选框
				{/if}
			</div>
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
							<div class="text-[10px] {canAgree ? 'text-green-600' : 'text-red-500'}">
								{#if canAgree}
									已完整阅读以上协议 ✓
								{:else}
									您还需要完整阅读{!readAgreement ? '《用户协议》' : ''}{!readAgreement && !readPrivacy ? '和' : ''}{!readPrivacy ? '《隐私政策》' : ''}后方可勾选该复选框
								{/if}
							</div>
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

		<Dialog.Footer class="flex-col gap-2 sm:flex-col sm:justify-center items-center">
			<Button variant="destructive" class="w-full max-w-xs" onclick={withdrawConsent}>
				<Icon icon="mdi:close-circle-outline" class="size-4 mr-1" />撤回同意
			</Button>
			<Button class="w-full max-w-xs" onclick={saveCustomPreferences} disabled={!agreed}>
				保存设置
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
					<div class="space-y-4">
						<section>
							<h3 class="font-bold text-base mb-2">运营者信息</h3>
							<p>本网站（以下简称"本站"）由个人运营。联系邮箱：<a href="mailto:i@2x.nz" class="text-primary underline">i@2x.nz</a></p>
							<p>本站服务器位于美国，无中国 ICP 备案。本站无意针对中国大陆用户提供服务，但由于互联网的开放性，中国大陆用户可能通过合法渠道访问本站。你理解并同意，本站运营者未主动向中国大陆市场提供服务，也不以中国大陆为目标市场。</p>
						</section>

						<section>
							<h3 class="font-bold text-base mb-2">免责声明</h3>
							<p>本站是一个个人项目，按「现状」及「可用」基础提供。在法律允许的最大范围内，本站明确声明不承担任何明示或暗示的担保责任，包括但不限于适销性、特定用途适用性及不侵权的担保。本站不保证服务的连续性、及时性、安全性及准确性，你使用本站服务所产生的全部风险由你自行承担。</p>
							<p>你明确理解并同意，本站运营者不对因使用或无法使用本站服务所导致的任何直接、间接、偶然、特殊及后续的损害承担责任，包括但不限于利润损失、数据丢失、业务中断、声誉损害及其他商业损失。</p>
							<p>本站所有生成内容由人工智能自动生成，不代表本站运营者的观点、立场或意见。生成内容的准确性、完整性、合法性及实用性本站不作任何保证。你应对你生成、发布及传播的内容承担全部责任。</p>
						</section>

						<section>
							<h3 class="font-bold text-base mb-2">论坛使用规则（/forum）</h3>
							<ol class="list-decimal list-inside space-y-1">
								<li>禁止发布任何违反中华人民共和国法律法规的内容，包括但不限于危害国家安全、煽动民族仇恨、破坏国家统一、宣扬恐怖主义、传播淫秽色情、赌博、暴力、凶杀、恐怖或者教唆犯罪的信息。</li>
								<li>禁止发布任何侵犯他人合法权益的内容，包括但不限于侵犯他人名誉权、肖像权、知识产权、隐私权及商业秘密。</li>
								<li>禁止恶意攻击、辱骂、骚扰、威胁、歧视其他用户。论坛讨论应保持基本网络礼仪，理性表达观点。</li>
								<li>禁止发布垃圾广告、恶意推广、刷屏、灌水及一切形式的垃圾信息。</li>
								<li>禁止利用论坛进行任何形式的网络诈骗、钓鱼、传播恶意软件或链接。</li>
								<li>禁止绕越或试图绕越论坛的审核、封禁等管理措施。</li>
								<li>论坛管理员有权在不另行通知的情况下删除违规内容、限制或封禁违规账号。</li>
							</ol>
						</section>

						<section>
							<h3 class="font-bold text-base mb-2">AI 生图服务使用规则（/draw）</h3>
							<ol class="list-decimal list-inside space-y-1">
								<li>禁止生成、上传或传播任何形式的色情、淫秽及成人内容。中华人民共和国法律禁止色情内容的制作与传播。</li>
								<li>禁止生成、上传或传播任何包含仇恨言论、极端暴力、恐怖主义、歧视性内容（包括但不限于种族、民族、宗教、性别、性取向、残疾歧视）。</li>
								<li>禁止利用本服务生成、伪造或传播虚假信息、误导性内容及深度伪造内容。</li>
								<li>禁止利用本服务侵犯他人知识产权，包括但不限于未经授权使用受版权保护的图像、角色及商标。</li>
<li>禁止反向工程、破解、攻击或以任何方式破坏本服务的后端系统、队列机制及点券系统。</li>
							<li>禁止批量注册、自动化脚本及一切形式的滥用行为。</li>
							<li>禁止生成受版权保护的角色、商标及知识产权作品，除非你拥有相关权利或已获得合法授权。</li>
							<li>禁止生成涉及机密信息、保密角色、未公开设计及一切形式的私有或受保密义务约束的内容。</li>
							<li>你理解并同意：你滥用本服务所产生的一切法律后果及责任由你自行承担，包括但不限于侵犯第三方知识产权的赔偿责任、违反法律法规的行政处罚责任及民事刑事责任。本站运营者不承担因你滥用服务而产生的任何法律责任。</li>
							<li>本站有权审查你提交的提示词及生成的内容。若发现违规，我们保留限制或永久封禁账号的权利，恕不另行通知。</li>
								<li>你同意本站阅读、审查、存档、分析及分享你生成的所有内容。即使你在账号界面中删除相关记录，本站仍可能在后端保留副本，用于审核、统计、模型改进及其他合法用途。</li>
							</ol>

							<p class="font-bold text-sm mt-3">生图点及服务声明</p>
							<p class="text-xs text-muted-foreground">生图点为 /draw 的子项目，受上述所有规则约束：</p>
							<ol class="list-decimal list-inside space-y-1" start="12">
								<li>本服务按「现状」及「可用」基础提供，不保证任何服务可用性（SLA）。你可能遇到因项目维护、硬件故障、软件更新、网络问题等原因导致的长时间停机、功能受限或服务永久关闭。</li>
								<li>站内生图点为虚拟商品，一经充值售出，概不退换、不折现、不延期。即使服务中断或永久关闭，已充值的生图点不予退还。</li>
								<li>请适度消费，根据你的实际需求合理充值。本站不对因服务不可用导致的生图点浪费承担任何责任。</li>
								<li>本站保留随时调整生图点定价、消耗规则及服务内容的权利，调整后的规则自发布之日起生效。</li>
								<li>因违规被封禁的账号，剩余生图点不予退还。</li>
								<li>若你无法认可本协议的任何条款，请立即停止使用本服务。</li>
							</ol>
						</section>

						<section>
							<h3 class="font-bold text-base mb-2">未成年人条款</h3>
							<p>本站不向未成年人（未满 18 周岁）提供服务。若你未满 18 周岁，请立即停止使用本站。若你隐瞒真实年龄、伪造身份信息或以其他方式欺骗使用本站，你将被视为完全民事行为能力人，自愿承担因使用本站所产生的全部法律责任及后果，本站运营者不承担任何责任。</p>
						</section>

						<section>
							<h3 class="font-bold text-base mb-2">其他条款</h3>
							<ol class="list-decimal list-inside space-y-1">
								<li>本站保留随时修改本协议的权利，修改后的协议自发布之日起生效。你继续使用本站服务即视为接受修改后的协议。</li>
								<li>本协议适用中华人民共和国法律，并按其解释。因本协议引起的或与本协议有关的争议，双方应友好协商解决；协商不成的，提交本站运营者所在地有管辖权的人民法院诉讼解决。</li>
								<li>如本协议的任何条款被认定为无效或不可执行，其余条款仍应保持完全效力。</li>
								<li>若你对本协议有任何疑问，可通过本站提供的联系方式与运营者取得联系。</li>
							</ol>
						</section>
						<section>
							<p class="text-xs text-muted-foreground">最后更新：2026-05-27</p>
						</section>
					</div>
				{:else}
					<div class="space-y-4">
						<section>
							<h3 class="font-bold text-base mb-2">信息收集与使用</h3>
							<p>你使用本站服务时，我们可能收集以下类型的信息：</p>
							<ol class="list-decimal list-inside space-y-1">
								<li><strong>账号信息：</strong>注册论坛时你提供的用户名、邮箱地址及头像。</li>
								<li><strong>使用数据：</strong>访问记录、页面浏览量、操作日志、生成的图片记录及提示词历史。</li>
								<li><strong>设备信息：</strong>浏览器类型、操作系统、IP 地址及设备标识符（通过第三方分析服务收集）。</li>
							</ol>
						</section>

						<section>
							<h3 class="font-bold text-base mb-2">Cookie 及本地存储的使用</h3>
							<p>本站使用以下 Cookie 及浏览器存储技术：</p>
							<p><strong>必要（始终加载）：</strong></p>
							<ul class="list-disc list-inside space-y-0.5 text-muted-foreground">
								<li>Umami Analytics（自托管）— 收集匿名访问数据，用于统计页面浏览量</li>
								<li>Cloudflare Web Analytics — 匿名访问统计，无 Cookie、无指纹追踪</li>
								<li>Cloudflare Turnstile — 人机验证，用于登录、注册、发帖等操作</li>
							</ul>
							<p><strong>功能（需同意）：</strong></p>
							<ul class="list-disc list-inside space-y-0.5 text-muted-foreground">
								<li>Giscus — 基于 GitHub Discussions 的评论系统</li>
							</ul>
							<p><strong>分析（需同意）：</strong></p>
							<ul class="list-disc list-inside space-y-0.5 text-muted-foreground">
								<li>百度统计 — 站点访问情况分析</li>
								<li>Google Analytics (GA4) — 用户行为分析</li>
								<li>Microsoft Clarity — 用户体验分析</li>
							</ul>
							<p><strong>浏览器本地存储：</strong></p>
							<ul class="list-disc list-inside space-y-0.5 text-muted-foreground">
								<li><code>cookie-consent-preferences</code> — Cookie 同意偏好设置</li>
								<li><code>theme</code> — 用户主题偏好（亮色/暗色/跟随系统）</li>
								<li>论坛相关键名 — 登录凭证及环境配置</li>
							</ul>
						</section>

						<section>
							<h3 class="font-bold text-base mb-2">第三方服务</h3>
							<p>本站集成以下第三方服务，它们可能独立收集你的数据：</p>
							<ul class="list-disc list-inside space-y-0.5">
								<li>Umami（自托管）— 服务器位于本站运营者控制的服务器上</li>
							<li>Cloudflare — CDN 及安全服务（美国），受 <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" class="text-primary underline">Cloudflare 隐私政策</a>约束</li>
							<li>GitHub（Giscus）— 评论系统（美国），受 <a href="https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement" target="_blank" class="text-primary underline">GitHub 隐私政策</a>约束</li>
							<li>Google Analytics（美国）— 用户行为分析（需用户同意后激活）</li>
							<li>Microsoft Clarity（美国）— 用户体验分析（需用户同意后激活）</li>
							</ul>
							<p>此外，页面可能按需加载来自 jsdelivr、cdnjs 及 api.iconify.design 等 CDN 的资源，这些请求可能暴露你的 IP 地址给第三方 CDN 服务商。</p>
						</section>

						<section>
							<h3 class="font-bold text-base mb-2">数据存储与安全</h3>
							<p>你生成的内容（包括图片及提示词）存储在本站运营者控制的服务器上。我们采取合理的技术措施保护你的数据安全，但互联网传输无法保证绝对安全。论坛账号密码经过加密存储，但我们建议你不要在多个站点使用相同的密码。</p>
						</section>

						<section>
							<h3 class="font-bold text-base mb-2">数据保留与删除</h3>
							<p>你的账号信息及生成内容在你注销账号前将持续保留。即使你在账号界面中删除相关记录，本站仍可能在后端保留副本用于审核、统计及合法合规目的。Cookie 同意偏好存储在浏览器本地，你可随时清除。统计分析数据的保留期限由各第三方服务商的政策决定。</p>
						</section>

						<section>
							<h3 class="font-bold text-base mb-2">你的权利</h3>
							<p>你享有以下权利：</p>
							<ul class="list-disc list-inside space-y-0.5">
								<li><strong>知情权：</strong>本隐私政策向您说明了我们收集哪些信息及如何使用。</li>
								<li><strong>选择权：</strong>您可以通过本页面的设置选择是否允许功能 Cookie 及分析 Cookie。</li>
								<li><strong>删除权：</strong>您可以通过论坛设置删除您的账号（功能开发中），或通过清除浏览器 localStorage 删除本地存储的数据。</li>
								<li><strong>撤回同意：</strong>您随时可以通过页面底部的「隐私与协议设置」按钮撤回 Cookie 同意（撤回不影响撤回前基于同意的处理的合法性）。</li>
							</ul>
						</section>

						<section>
							<h3 class="font-bold text-base mb-2">协议更新</h3>
							<p>我们可能会不时更新本隐私政策。更新后的政策将在本站发布，并注明最后更新日期。重大变更我们会通过站内公告等方式通知你。</p>
						</section>

						<section>
							<p class="text-xs text-muted-foreground">最后更新：2026-05-27</p>
						</section>
					</div>
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
