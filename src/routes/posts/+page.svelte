<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Pagination from '$lib/components/ui/pagination';
	import Icon from '@iconify/svelte';
	import { siteConfig } from '$lib/config/site';
	import { slide } from 'svelte/transition';
	import { staggerChildren } from '$lib/utils/motion';
	import { quintOut } from 'svelte/easing';
	import { spaCache } from '$lib/utils/spaCache';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const posts = $derived(data.posts);

	let searchQuery = $state('');
	let allPosts = $state<Array<{ title: string; link: string; description: string; date: string; content: string; wordCount: number; readTime: number }>>([]);
	let isLoading = $state(false);
	let hasLoaded = $state(false);

	// 预填充 SPA 缓存中的浏览量（首次渲染前，避免 transition 动画）
	const _initialViews: Record<string, number> = {};
	for (const post of data.posts) {
		const v = spaCache.peek<number>(`pv:${post.slug}`);
		if (v !== undefined) _initialViews[post.slug] = v;
	}
	let pageViews = $state<Record<string, number>>(_initialViews);
	let isLoadingViews = $state(false);

	let currentPage = $state(1);
	const postsPerPage = 10;

	// 每个搜索结果卡片的展开状态（key: post.slug）
	let expandedCards = $state<Record<string, boolean>>({});
	
	let searchFilters = $state({
		title: true,
		description: true,
		content: true,
		path: true
	});

	function calculateWordCount(text: string): number {
		// 移除 HTML 标签
		const plainText = text.replace(/<[^>]*>/g, '');
		// 计算中文字符
		const chineseChars = plainText.match(/[\u4e00-\u9fa5]/g) || [];
		// 计算英文单词
		const englishWords = plainText.match(/[a-zA-Z]+/g) || [];
		return chineseChars.length + englishWords.length;
	}

	function calculateReadTime(wordCount: number): number {
		// 假设每分钟阅读 300 字
		return Math.ceil(wordCount / 300);
	}

	async function loadRSS() {
		if (hasLoaded) return;
		
		isLoading = true;
		allPosts = await spaCache.get('posts-rss', async () => {
			const response = await fetch('/rss.xml');
			const text = await response.text();
			const parser = new DOMParser();
			const xml = parser.parseFromString(text, 'text/xml');
			const items = xml.querySelectorAll('item');
			
			return Array.from(items).map(item => {
				const content = item.querySelector('content\\:encoded, encoded')?.textContent || '';
				const wordCount = calculateWordCount(content);
				const readTime = calculateReadTime(wordCount);
				
				return {
					title: item.querySelector('title')?.textContent || '',
					link: item.querySelector('link')?.textContent || '',
					description: item.querySelector('description')?.textContent || '',
					date: item.querySelector('pubDate')?.textContent || '',
					content,
					wordCount,
					readTime
				};
			});
		});
		hasLoaded = true;
		isLoading = false;
	}
	
	async function loadPageViews() {
		if (isLoadingViews) return;
		isLoadingViews = true;
		const currentPosts = paginatedPosts;

		// 从 SPA 缓存中读取已有的浏览量，命中则直接显示（无动画）
		const uncachedPosts: typeof currentPosts = [];
		const viewsMap: Record<string, number> = { ...pageViews };
		for (const { post } of currentPosts) {
			const cached = spaCache.peek<number>(`pv:${post.slug}`);
			if (cached !== undefined) {
				viewsMap[post.slug] = cached;
			} else {
				uncachedPosts.push({ post });
			}
		}
		pageViews = viewsMap;

		// 仅请求未缓存的文章
		if (uncachedPosts.length === 0) {
			isLoadingViews = false;
			return;
		}
		const pathnames = uncachedPosts.map(({ post }) => `/posts/${post.slug}/`);
		try {
			const response = await fetch(siteConfig.services.pageViews, {
				method: 'POST',
				headers: { 'Content-Type': 'text/plain' },
				body: JSON.stringify(pathnames)
			});
			if (response.ok) {
				const views = await response.json() as number[];
				const newSlugs: string[] = [];
				uncachedPosts.forEach(({ post }, index) => {
					const v = views[index] || 0;
					viewsMap[post.slug] = v;
					spaCache.set(`pv:${post.slug}`, v);
					newSlugs.push(post.slug);
				});
				// 先让 {#if} 初始为 false，再设置数据触发 transition
				for (const slug of newSlugs) {
					delete pageViews[slug];
				}
				pageViews = { ...pageViews };
				await tick();
				for (const slug of newSlugs) {
					pageViews[slug] = viewsMap[slug];
				}
				pageViews = { ...pageViews };
			}
		} catch (e) {
			console.error(e);
		} finally {
			isLoadingViews = false;
		}
	}

	function parseQueryTerms(query: string): string[] {
		// 按空格切分；保留双引号包裹的短语作为单个 term
		const terms: string[] = [];
		const re = /"([^"]+)"|(\S+)/g;
		let m: RegExpExecArray | null;
		while ((m = re.exec(query)) !== null) {
			const t = (m[1] ?? m[2] ?? '').trim().toLowerCase();
			if (t) terms.push(t);
		}
		return terms;
	}

	function highlightText(text: string, query: string): string {
		const terms = parseQueryTerms(query);
		if (terms.length === 0) return text;
		const escaped = terms
			.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
			.sort((a, b) => b.length - a.length); // 长 term 优先，避免短 term 抢匹配
		const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
		return text.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800">$1</mark>');
	}

	function getMatchedContentLines(content: string, query: string): string[] {
		const terms = parseQueryTerms(query);
		if (terms.length === 0) return [];
		const lines = content.split('\n');
		const matched: string[] = [];

		for (const line of lines) {
			const lower = line.toLowerCase();
			// 行内必须命中所有 term 才算匹配
			if (!terms.every((t) => lower.includes(t))) continue;
			const trimmed = line.trim();
			if (trimmed && !trimmed.startsWith('#') && trimmed.length > 10) {
				matched.push(trimmed);
			}
		}

		return matched;
	}

	function getPostStats(slug: string): { wordCount: number; readTime: number } | null {
		const wc = data.wordCountMap[slug];
		if (wc === undefined) return null;
		return { wordCount: wc, readTime: Math.ceil(wc / 300) };
	}

	let filteredPostsWithMatches = $derived.by(() => {
		if (!searchQuery.trim()) return posts.map(p => ({ post: p, matchedLines: [] }));

		// 检查是否至少选择了一个过滤器
		const hasAnyFilter = searchFilters.title || searchFilters.description || searchFilters.content || searchFilters.path;
		if (!hasAnyFilter) return [];

		const terms = parseQueryTerms(searchQuery);
		if (terms.length === 0) return posts.map(p => ({ post: p, matchedLines: [] }));

		const results: Array<{ post: typeof posts[0], matchedLines: string[] }> = [];

		for (const post of posts) {
			const rssPost = allPosts.find(rss => rss.link.includes(post.slug));
			if (!rssPost) continue;

			const title = rssPost.title.toLowerCase();
			const desc = rssPost.description.toLowerCase();
			const content = rssPost.content.toLowerCase();
			const slug = post.slug.toLowerCase();

			// 每个 term 必须在任一已启用字段中命中（AND 跨 term，OR 跨字段）
			const allHit = terms.every((t) => {
				return (
					(searchFilters.title && title.includes(t)) ||
					(searchFilters.description && desc.includes(t)) ||
					(searchFilters.content && content.includes(t)) ||
					(searchFilters.path && slug.includes(t))
				);
			});
			if (!allHit) continue;

			// 仅当 title/description/path 都没单独命中完整查询时，才尝试给出内容片段
			const titleHasAll = searchFilters.title && terms.every((t) => title.includes(t));
			const descHasAll = searchFilters.description && terms.every((t) => desc.includes(t));
			const pathHasAll = searchFilters.path && terms.every((t) => slug.includes(t));
			const contentHasAll = searchFilters.content && terms.every((t) => content.includes(t));

			const matchedLines = contentHasAll
				? getMatchedContentLines(rssPost.content, searchQuery)
				: [];
			results.push({ post, matchedLines });
		}

		return results;
	});
	
	let paginatedPosts = $derived.by(() => {
		const allResults = filteredPostsWithMatches;
		const startIndex = (currentPage - 1) * postsPerPage;
		const endIndex = startIndex + postsPerPage;
		return allResults.slice(startIndex, endIndex);
	});
	
	let totalPages = $derived(Math.ceil(filteredPostsWithMatches.length / postsPerPage));
	
	// 当搜索条件改变时重置到第一页并加载访问量
	$effect(() => {
		searchQuery;
		searchFilters.title;
		searchFilters.description;
		searchFilters.content;
		searchFilters.path;
		currentPage = 1;
		expandedCards = {}; // 重置展开状态
	});
	
	// 监听页码变化，加载对应页面的访问量
	$effect(() => {
		const page = currentPage; // 读取 currentPage 以触发 effect
		// 使用 setTimeout 避免在同一个 tick 内多次调用
		const timer = setTimeout(() => {
			loadPageViews();
		}, 0);
		return () => clearTimeout(timer);
	});
	
	let hasAnyFilter = $derived(searchFilters.title || searchFilters.description || searchFilters.content || searchFilters.path);

	function formatDate(dateString: string) {
		const date = new Date(dateString);
		return date.toLocaleDateString('zh-CN', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}
	
	import { onMount, tick } from 'svelte';
	
	onMount(() => {
		loadRSS();
	});
</script>

<svelte:head>
	<title>文章列表 - {siteConfig.title}</title>
	<meta name="description" content="浏览所有文章" />
</svelte:head>

<div class="container mx-auto max-w-4xl px-4 py-12">
	<div class="mb-12 text-center">
		<h1 class="mb-4 text-4xl font-bold">文章列表</h1>
		<p class="text-muted-foreground">分享技术、想法和经验</p>
		<p class="mt-2 text-sm text-muted-foreground">
			共 {data.totalPosts} 篇文章 · 总计 {data.totalWords.toLocaleString()} 字
		</p>
	</div>

	<div class="mb-8">
		<Input
			type="text"
			bind:value={searchQuery}
			onfocus={loadRSS}
			placeholder="搜索文章标题、描述或内容..."
			class="w-full"
		/>
		
		<div class="mt-3 flex flex-wrap gap-4">
			<label class="flex items-center gap-2 cursor-pointer">
				<Checkbox bind:checked={searchFilters.title} />
				<span class="text-sm">标题</span>
			</label>
			<label class="flex items-center gap-2 cursor-pointer">
				<Checkbox bind:checked={searchFilters.description} />
				<span class="text-sm">简介</span>
			</label>
			<label class="flex items-center gap-2 cursor-pointer">
				<Checkbox bind:checked={searchFilters.content} />
				<span class="text-sm">正文</span>
			</label>
			<label class="flex items-center gap-2 cursor-pointer">
				<Checkbox bind:checked={searchFilters.path} />
				<span class="text-sm">路径</span>
			</label>
		</div>
		
		{#if searchQuery}
			<div class="mt-2 min-h-[20px]">
				{#if !hasAnyFilter}
					<p class="text-sm text-red-500">你什么都不选怎么搜啊喂！</p>
				{:else if isLoading}
					<p class="text-sm text-muted-foreground">搜索中...</p>
				{:else if filteredPostsWithMatches.length === 0}
					<p class="text-sm text-muted-foreground">未找到匹配的文章</p>
				{:else}
					<p class="text-sm text-muted-foreground">找到 {filteredPostsWithMatches.length} 篇文章</p>
				{/if}
			</div>
		{/if}
	</div>

	<div class="space-y-6 mo-stagger" use:staggerChildren>
		{#each paginatedPosts as { post, matchedLines }}
			<a href="/posts/{post.slug}" class="block">
				<Card.Root class="group transition-all hover:shadow-lg ring-0">
					<Card.Content>
						<div class="flex flex-col gap-4 md:flex-row">
							{#if post.metadata.image}
								<div class="md:w-48 md:flex-shrink-0">
									<img
										src={post.metadata.image}
										alt={post.metadata.title}
										class="h-48 w-full rounded-md object-cover md:h-32"
									/>
								</div>
							{/if}
							
							<div class="flex-1">
								<div class="mb-2 flex items-center gap-2">
									{#if post.metadata.pinned}
										<Badge>置顶</Badge>
									{/if}
									<time class="text-sm text-muted-foreground">
										{formatDate(post.metadata.published)}
									</time>
									{#if getPostStats(post.slug)}
										<span class="text-sm text-muted-foreground">·</span>
										<span class="text-sm text-muted-foreground">{getPostStats(post.slug)!.wordCount} 字</span>
										<span class="text-sm text-muted-foreground">·</span>
										<span class="text-sm text-muted-foreground">约 {getPostStats(post.slug)!.readTime} 分钟</span>
									{/if}
									{#if pageViews[post.slug] !== undefined}
										<div class="inline" transition:slide={{ duration: 350, easing: quintOut }}>
											<span class="text-sm text-muted-foreground">· {pageViews[post.slug].toLocaleString()} 次浏览</span>
										</div>
									{/if}
								</div>
								
								<h2 class="mb-2 text-2xl font-semibold group-hover:text-primary">
									{@html highlightText(post.metadata.title, searchQuery)}
								</h2>
								
								<p class="text-muted-foreground">
									{@html highlightText(post.metadata.description, searchQuery)}
								</p>

								{#if matchedLines.length > 0}
									{@const isExpanded = expandedCards[post.slug] ?? false}
									{@const displayLines = isExpanded ? matchedLines : matchedLines.slice(0, 3)}
									{@const hasMore = matchedLines.length > 3}

									<div class="mt-3 space-y-2">
										<div class="space-y-1 border-l-2 border-primary/30 pl-3">
											{#each displayLines as line, idx}
												<button
													type="button"
													onclick={(e) => {
														e.preventDefault();
														e.stopPropagation();
														// 在 URL 中传递搜索词，文章页会自动高亮并滚动到匹配位置
														const url = `/posts/${post.slug}?highlight=${encodeURIComponent(searchQuery)}`;
														window.open(url, '_blank');
													}}
													class="block w-full text-left text-sm text-muted-foreground hover:text-foreground transition-colors"
												>
													<span class="inline-flex items-start gap-1.5">
														<Icon
															icon="mdi:arrow-right-thin"
															class="size-4 flex-shrink-0 mt-0.5 opacity-50"
														/>
														<span>{@html highlightText(line, searchQuery)}</span>
													</span>
												</button>
											{/each}
										</div>

										{#if hasMore}
											<button
												type="button"
												onclick={(e) => {
													e.preventDefault();
													e.stopPropagation();
													expandedCards[post.slug] = !isExpanded;
												}}
												class="text-xs text-primary hover:underline flex items-center gap-1"
											>
												<Icon
													icon={isExpanded ? 'mdi:chevron-up' : 'mdi:chevron-down'}
													class="size-4"
												/>
												{isExpanded
													? '收起'
													: `展开 (还有 ${matchedLines.length - 3} 行)`}
											</button>
										{/if}
									</div>
								{/if}
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			</a>
		{/each}
	</div>

	{#if paginatedPosts.length === 0 && !searchQuery}
		<div class="py-12 text-center">
			<p class="text-muted-foreground">暂无文章</p>
		</div>
	{/if}
	
	{#if totalPages > 1}
		<div class="mt-8 flex justify-center">
			<Pagination.Root count={filteredPostsWithMatches.length} perPage={postsPerPage} bind:page={currentPage}>
				{#snippet children({ pages })}
					<Pagination.Content>
						<Pagination.Item>
							<Pagination.PrevButton>
								{#snippet children()}
									<Icon icon="mdi:chevron-left" class="w-4 h-4" />
									<span class="hidden sm:inline">上一页</span>
								{/snippet}
							</Pagination.PrevButton>
						</Pagination.Item>
						{#each pages as page (page.key)}
							{#if page.type === 'ellipsis'}
								<Pagination.Item>
									<Pagination.Ellipsis />
								</Pagination.Item>
							{:else}
								<Pagination.Item>
									<Pagination.Link {page} isActive={currentPage === page.value}>
										{page.value}
									</Pagination.Link>
								</Pagination.Item>
							{/if}
						{/each}
						<Pagination.Item>
							<Pagination.NextButton>
								{#snippet children()}
									<span class="hidden sm:inline">下一页</span>
									<Icon icon="mdi:chevron-right" class="w-4 h-4" />
								{/snippet}
							</Pagination.NextButton>
						</Pagination.Item>
					</Pagination.Content>
				{/snippet}
			</Pagination.Root>
		</div>
	{/if}
</div>
