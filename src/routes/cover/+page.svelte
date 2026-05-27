<script lang="ts">
	import CoverGenerator from '$lib/components/CoverGenerator.svelte';
	import { siteConfig } from '$lib/config/site';
</script>

<svelte:head>
	<title>封面制作 - {siteConfig.siteName}</title>
</svelte:head>

<div class="container mx-auto max-w-[1920px] px-4 py-8">
	<div class="mb-6">
		<h1 class="text-3xl font-bold mb-2">封面制作</h1>
		<div class="flex items-center gap-2 text-muted-foreground">
			<p>在线生成精美的封面图片</p>
		</div>
	</div>

	<CoverGenerator />
</div>
