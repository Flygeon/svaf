import type { DrawApiEnv } from '../types';
import type { Readable, Writable } from 'svelte/store';
import { readLocalStorage, writeLocalStorage } from '$lib/forum/utils/storage';
import { derived, get, writable } from 'svelte/store';

export const DRAW_API_ENV_STORAGE_KEY = 'draw-api-env';
export const DRAW_API_CUSTOM_BASE_URL_STORAGE_KEY = 'draw-api-custom-base-url';

export const DRAW_API_BASE_URLS: Record<DrawApiEnv, string> = {
	prod: 'https://api-ai.2x.nz',
	dev: 'http://localhost:8080'
};

function normalizeBaseUrl(value: string) {
	return value.trim().replace(/\/+$/, '');
}

function normalizeEnv(value: DrawApiEnv | string | null | undefined): DrawApiEnv {
	return value === 'dev' ? 'dev' : 'prod';
}

function sanitizeBaseUrl(value: string | null | undefined, env: DrawApiEnv) {
	const v = normalizeBaseUrl(value || '');
	if (!v) return DRAW_API_BASE_URLS[env];
	try {
		const url = new URL(v);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') {
			return DRAW_API_BASE_URLS[env];
		}
		return normalizeBaseUrl(url.toString());
	} catch {
		return DRAW_API_BASE_URLS[env];
	}
}

interface DrawCustomBaseUrlStore {
	subscribe: Writable<string>['subscribe'];
	set(value: string): void;
	reset(env: DrawApiEnv): void;
}

interface DrawEnvStore {
	subscribe: Writable<DrawApiEnv>['subscribe'];
	baseUrl: Readable<string>;
	customBaseUrl: DrawCustomBaseUrlStore;
	set(value: DrawApiEnv): void;
	toggle(): void;
	getBaseUrl(env: DrawApiEnv): string;
}

function createEnvStore(): DrawEnvStore {
	const initialEnv = normalizeEnv(
		readLocalStorage<DrawApiEnv | string>(DRAW_API_ENV_STORAGE_KEY, 'prod')
	);
	const initialCustomBaseUrl = sanitizeBaseUrl(
		readLocalStorage<string>(
			DRAW_API_CUSTOM_BASE_URL_STORAGE_KEY,
			DRAW_API_BASE_URLS[initialEnv]
		),
		initialEnv
	);
	const envStore = writable<DrawApiEnv>(initialEnv);
	const customBaseUrlStore = writable<string>(initialCustomBaseUrl);

	customBaseUrlStore.subscribe((value) => {
		writeLocalStorage(
			DRAW_API_CUSTOM_BASE_URL_STORAGE_KEY,
			sanitizeBaseUrl(value, get(envStore))
		);
	});

	const baseUrl = derived([envStore, customBaseUrlStore], ([$env, $custom]) =>
		sanitizeBaseUrl($custom, $env)
	);

	return {
		subscribe: envStore.subscribe,
		baseUrl,
		customBaseUrl: {
			subscribe: customBaseUrlStore.subscribe,
			set: (v) => customBaseUrlStore.set(sanitizeBaseUrl(v, get(envStore))),
			reset: (env) => customBaseUrlStore.set(DRAW_API_BASE_URLS[env])
		},
		set: (v) => {
			const next = normalizeEnv(v);
			writeLocalStorage(DRAW_API_ENV_STORAGE_KEY, next);
			envStore.set(next);
			customBaseUrlStore.set(DRAW_API_BASE_URLS[next]);
		},
		toggle: () => {
			let next: DrawApiEnv = 'prod';
			envStore.update((cur) => {
				next = cur === 'prod' ? 'dev' : 'prod';
				writeLocalStorage(DRAW_API_ENV_STORAGE_KEY, next);
				return next;
			});
			customBaseUrlStore.set(DRAW_API_BASE_URLS[next]);
		},
		getBaseUrl: (env) => DRAW_API_BASE_URLS[env]
	};
}

export const drawEnv: DrawEnvStore = createEnvStore();

let _redirectResolved = false;

/**
 * 探测 API 端点是否有重定向（CDN / 负载均衡），
 * 仅首次调用时真正发起请求，后续直接返回缓存结果。
 */
export async function resolveApiRedirect(): Promise<void> {
	if (_redirectResolved) return;
	_redirectResolved = true;
	const baseUrl = get(drawEnv.baseUrl);
	console.log(`当前API：${baseUrl}`);
	try {
		// 不设置 redirect: 'manual'，让浏览器自动跟随重定向，
		// 通过 resp.url 获取最终地址（该 302 响应已携带 CORS 头）
		const resp = await fetch(baseUrl, { method: 'HEAD' });
		const finalUrl = resp.url.replace(/\/+$/, '');
		console.log('最终响应URL:', finalUrl);
		if (finalUrl !== baseUrl) {
			console.log(`检查重定向：有，目标：${finalUrl}`);
			drawEnv.customBaseUrl.set(finalUrl);
		} else {
			console.log('检查重定向：无，锁定API');
		}
		console.log('API可用性：✅');
	} catch (e) {
		console.log('检查重定向：请求异常', e);
		console.log('API可用性：❌，使用原地址');
	}
}
