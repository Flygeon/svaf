<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { siteConfig } from '$lib/config/site';
	import Icon from '@iconify/svelte';
	import { onMount } from 'svelte';
	import { spaCache } from '$lib/utils/spaCache';
	import { fadeInUp, fadeIn } from '$lib/utils/motion';
	import { slide } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import PageViews from '$lib/components/PageViews.svelte';
	import TimetableCard from '$lib/components/TimetableCard.svelte';
	import SponsorBanners from '$lib/components/SponsorBanners.svelte';
	import Announcement from '$lib/components/Announcement.svelte';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let isLive = $state<boolean>(false);
	let pageViewsLoaded = $state(spaCache.peek('homepage-pageviews') !== undefined);

	async function checkLiveStatus() {
		isLive = await spaCache.get('live-status', async () => {
			const response = await fetch(siteConfig.live.statusApi);
			if (response.ok) {
				const status = await response.text();
				return status.trim() === '1';
			}
			return false;
		}, 30000); // 30秒过期
	}
	
	onMount(() => {
		checkLiveStatus();

		// 每 30 秒更新一次直播状态
		const interval = setInterval(checkLiveStatus, 30000);
		return () => clearInterval(interval);
	});
</script>

<svelte:head>
	<title>{siteConfig.title} - 首页</title>
	<style>
		@keyframes live-pulse {
			0%, 100% {
				opacity: 1;
				transform: scale(1);
			}
			50% {
				opacity: 0.8;
				transform: scale(1.05);
			}
		}
		
		@keyframes live-ring {
			0% {
				transform: scale(1);
				opacity: 1;
			}
			100% {
				transform: scale(1.5);
				opacity: 0;
			}
		}
		
		.live-avatar-container {
			position: relative;
			display: inline-block;
		}
		
		.live-ring {
			position: absolute;
			top: -4px;
			left: -4px;
			right: -4px;
			bottom: -4px;
			border: 3px solid #ff2d55;
			border-radius: 50%;
			animation: live-ring 1.5s ease-out infinite;
			pointer-events: none;
		}
		
		.live-ring:nth-child(2) {
			animation-delay: 0.5s;
		}
		
		.live-ring:nth-child(3) {
			animation-delay: 1s;
		}
		
		.live-badge {
			position: absolute;
			bottom: 0;
			right: 0;
			background: linear-gradient(135deg, #ff2d55 0%, #ff6b9d 100%);
			color: white;
			padding: 4px 12px;
			border-radius: 12px;
			font-size: 12px;
			font-weight: bold;
			display: flex;
			align-items: center;
			gap: 4px;
			box-shadow: 0 2px 8px rgba(255, 45, 85, 0.4);
			animation: live-pulse 2s ease-in-out infinite;
			pointer-events: none;
		}
		
		.live-dot {
			width: 6px;
			height: 6px;
			background: white;
			border-radius: 50%;
			animation: live-pulse 1s ease-in-out infinite;
		}
	</style>
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
	<div class="fixed top-4 right-4 z-50">
		<ThemeToggle />
	</div>
	<div class="mo-fade-in-up" use:fadeInUp>
		<Announcement />
	</div>

	<div class="live-avatar-container mo-fade-in-up" use:fadeInUp>
		{#if isLive}
			<div class="live-ring"></div>
			<div class="live-ring"></div>
			<div class="live-ring"></div>
		{/if}
		{#if isLive}
			<a href={siteConfig.live.roomUrl} target="_blank" rel="noopener noreferrer">
				<img src={siteConfig.bio.avatar} alt="Avatar" class="h-32 w-32 rounded-full cursor-pointer" />
			</a>
		{:else}
			<img src={siteConfig.bio.avatar} alt="Avatar" class="h-32 w-32 rounded-full" />
		{/if}
		{#if isLive}
			<div class="live-badge">
				<div class="live-dot"></div>
				<span>直播中</span>
			</div>
		{/if}
	</div>
	
	<div class="text-center mo-fade-in-up" use:fadeInUp={{ delay: 0.1 }}>
		<h1 class="text-4xl font-bold mb-2">{siteConfig.bio.name}</h1>
		<p class="text-lg text-muted-foreground mb-4">{siteConfig.bio.bio}</p>
		{#if !pageViewsLoaded}
			<div style="position:absolute;pointer-events:none;" aria-hidden="true">
				<PageViews pathname="/" cacheKey="homepage-pageviews" onloaded={() => pageViewsLoaded = true} />
			</div>
		{/if}
		{#if pageViewsLoaded}
			<div transition:slide={{ duration: 350, easing: quintOut }}>
				<p class="text-sm text-muted-foreground">
					您是第 <PageViews pathname="/" cacheKey="homepage-pageviews" prefix="" suffix="个访客" />
				</p>
			</div>
		{/if}
	</div>

	<!-- 课程表卡片 -->
	<div class="w-full max-w-xs mo-fade-in" use:fadeIn={{ delay: 0.2 }}>
		<TimetableCard />
	</div>

	<!-- 社交媒体链接 -->
	<div class="w-full max-w-2xl mx-auto mo-fade-in-up" use:fadeInUp={{ delay: 0.2 }}>
		<Card class="relative overflow-hidden">
			<CardHeader class="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
				<CardTitle class="text-center text-5xl font-black tracking-widest text-foreground/[0.04] dark:text-foreground/[0.06] select-none">社交</CardTitle>
			</CardHeader>
			<CardContent class="relative z-10">
				<div class="flex flex-wrap gap-3 justify-center">
					{#each siteConfig.bio.links as link}
						{@const isLocalImage = link.icon.startsWith('/')}
						<a href={link.url} target="_blank" rel="noopener noreferrer">
							<Button variant="outline" class="flex items-center gap-2">
								{#if isLocalImage}
									<img src={link.icon} alt={link.name} class="w-5 h-5" />
								{:else}
									<Icon
										icon={link.icon}
										class="w-5 h-5"
										style={link.color ? `color: ${link.color}` : ''}
									/>
								{/if}
								<span class="text-sm font-medium">{link.name}</span>
							</Button>
						</a>
					{/each}
				</div>
			</CardContent>
		</Card>
	</div>

	<!-- 导航按钮 -->
	<div class="w-full max-w-2xl mx-auto mo-fade-in-up" use:fadeInUp={{ delay: 0.3 }}>
		<Card class="relative overflow-hidden">
			<CardHeader class="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
				<CardTitle class="text-center text-5xl font-black tracking-widest text-foreground/[0.04] dark:text-foreground/[0.06] select-none">导航</CardTitle>
			</CardHeader>
			<CardContent class="relative z-10">
				<div class="flex flex-wrap gap-3 justify-center">
					{#each siteConfig.navLinks as link}
						{@const isExternal = link.href.startsWith('http')}
						<a href={link.href} {...isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {}}>
							<Button
								variant={link.highlight ? 'default' : 'outline'}
								class="flex items-center gap-2 {link.highlight ? 'ring-2 ring-primary/40 shadow-md shadow-primary/20' : ''}"
							>
								<Icon icon={link.icon} class="w-5 h-5" />
								{link.label}
								{#if link.badge}
									<Badge variant="secondary" class="ml-0.5">{link.badge}</Badge>
								{/if}
								{#if isExternal}
									<Icon icon="mdi:open-in-new" class="w-3.5 h-3.5 opacity-60" />
								{/if}
							</Button>
						</a>
					{/each}
				</div>
			</CardContent>
		</Card>
	</div>

	<!-- 赞助商 -->
	<div class="w-full max-w-2xl mx-auto flex flex-col items-center mo-fade-in-up" use:fadeInUp={{ delay: 0.4 }}>
		<SponsorBanners />
	</div>
</div>
