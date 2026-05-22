import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const postsDir = path.join(root, 'src', 'content', 'posts');
const imageCacheDir = path.join(root, '.image-cache');
const backupDir = path.join(root, 'tmp', 'cleanup-backup');

const IMG_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg', '.bmp']);

function getAllPosts() {
	const dirs = fs.readdirSync(postsDir, { withFileTypes: true });
	const posts = [];
	for (const d of dirs) {
		if (!d.isDirectory()) continue;
		const md = path.join(postsDir, d.name, 'index.md');
		if (fs.existsSync(md)) posts.push(d.name);
	}
	return posts;
}

function extractUsedImages(content) {
	const used = new Set();
	const mdRe = /!\[.*?\]\(([^)]+)\)/g;
	let m;
	while ((m = mdRe.exec(content)) !== null) {
		const ref = m[1].trim();
		if (ref.startsWith('img/')) used.add(ref.slice(4));
	}
	const htmlRe = /<img[^>]+src=["']([^"']+)["']/gi;
	while ((m = htmlRe.exec(content)) !== null) {
		const ref = m[1].trim();
		if (ref.startsWith('img/')) used.add(ref.slice(4));
	}
	const fmRe = /^image:\s*(.+)$/m;
	const fm = content.match(fmRe);
	if (fm) {
		const ref = fm[1].trim();
		if (ref.startsWith('img/')) used.add(ref.slice(4));
	}
	return used;
}

function collectOrphanedImages(slug, usedImages) {
	const imgDir = path.join(postsDir, slug, 'img');
	if (!fs.existsSync(imgDir)) return [];
	const files = fs.readdirSync(imgDir);
	const orphaned = [];
	for (const f of files) {
		const ext = path.extname(f).toLowerCase();
		if (!IMG_EXTS.has(ext)) continue;
		if (!usedImages.has(f)) orphaned.push(f);
	}
	return orphaned;
}

function collectCacheOrphans(slug, usedImages) {
	const cacheDir = path.join(imageCacheDir, slug, 'img');
	if (!fs.existsSync(cacheDir)) return [];
	const files = fs.readdirSync(cacheDir);
	const orphaned = [];
	for (const f of files) {
		const ext = path.extname(f).toLowerCase();
		if (!IMG_EXTS.has(ext)) continue;
		if (!usedImages.has(f)) orphaned.push(f);
	}
	return orphaned;
}

function main() {
	console.log('\n  🔍 扫描未使用的文章图片...\n');

	const posts = getAllPosts();
	if (posts.length === 0) {
		console.log('  未找到任何文章。\n');
		process.exit(0);
	}

	const allOrphans = [];
	const cacheOrphans = [];

	for (const slug of posts.sort()) {
		const mdPath = path.join(postsDir, slug, 'index.md');
		const content = fs.readFileSync(mdPath, 'utf-8');
		const used = extractUsedImages(content);

		const imgDir = path.join(postsDir, slug, 'img');
		if (fs.existsSync(imgDir)) {
			const files = fs.readdirSync(imgDir);
			for (const f of files) {
				const ext = path.extname(f).toLowerCase();
				if (!IMG_EXTS.has(ext)) continue;
				if (!used.has(f)) {
					allOrphans.push({ slug, file: f, source: 'img' });
				}
			}
		}

		const cacheDir = path.join(imageCacheDir, slug, 'img');
		if (fs.existsSync(cacheDir)) {
			const files = fs.readdirSync(cacheDir);
			for (const f of files) {
				const ext = path.extname(f).toLowerCase();
				if (!IMG_EXTS.has(ext)) continue;
				if (!used.has(f)) {
					cacheOrphans.push({ slug, file: f, source: '.image-cache' });
				}
			}
		}
	}

	if (allOrphans.length === 0 && cacheOrphans.length === 0) {
		console.log('  ✅ 所有图片均有被引用，无需清理。\n');
		process.exit(0);
	}

	if (allOrphans.length > 0) {
		console.log(`  📦 源目录 (img/) 中发现 ${allOrphans.length} 个未使用图片：\n`);
		for (const { slug, file } of allOrphans) {
			console.log(`    ${slug}/img/${file}`);
		}
		console.log('');
	}

	if (cacheOrphans.length > 0) {
		console.log(`  📦 缓存目录 (.image-cache/) 中发现 ${cacheOrphans.length} 个未使用图片：\n`);
		for (const { slug, file } of cacheOrphans) {
			console.log(`    .image-cache/${slug}/img/${file}`);
		}
		console.log('');
	}

	console.log('  ⚠️   操作前会自动备份到 tmp/cleanup-backup/\n');
	console.log('  是否删除这些文件？(y/N): ');

	process.stdin.once('data', async (buf) => {
		const answer = buf.toString().trim().toLowerCase();
		if (answer !== 'y' && answer !== 'yes') {
			console.log('\n  已取消。\n');
			process.exit(0);
		}

		const timestamp = Date.now();
		const backupRoot = path.join(backupDir, String(timestamp));

		// backup then delete
		const all = [...allOrphans, ...cacheOrphans];
		for (const { slug, file, source } of all) {
			const srcDir = source === 'img'
				? path.join(postsDir, slug, 'img')
				: path.join(imageCacheDir, slug, 'img');
			const src = path.join(srcDir, file);
			if (!fs.existsSync(src)) continue;

			const dest = path.join(backupRoot, source === 'img' ? slug : `.image-cache/${slug}`, 'img');
			fs.mkdirSync(dest, { recursive: true });
			fs.copyFileSync(src, path.join(dest, file));
			fs.unlinkSync(src);
			console.log(`  🗑️   ${source}/${slug}/img/${file}`);
		}

		console.log(`\n  ✅ 已删除 ${all.length} 个文件，备份在 tmp/cleanup-backup/${timestamp}/\n`);
		process.exit(0);
	});
}

main();
