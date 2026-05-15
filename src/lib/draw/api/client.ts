import { forumAuth } from '$lib/forum/stores/auth';
import { drawEnv, resolveApiRedirect, apiError } from '../stores/env';
import { DrawApiError } from '../types';
import type { DrawApiErrorPayload, DrawRecommendation } from '../types';
import { get } from 'svelte/store';

export interface DrawRequestOptions extends RequestInit {
	requiresAuth?: boolean;
	query?: Record<string, string | number | boolean | undefined | null>;
	json?: unknown;
}

function buildUrl(
	path: string,
	query?: DrawRequestOptions['query'],
	baseUrl = get(drawEnv.baseUrl)
): string {
	const normalizedPath = path.startsWith('/') ? path : `/${path}`;
	const url = new URL(normalizedPath, baseUrl);
	for (const [k, v] of Object.entries(query || {})) {
		if (v === undefined || v === null || v === '') continue;
		url.searchParams.set(k, String(v));
	}
	return url.toString();
}

async function parseResponse<T>(response: Response): Promise<T> {
	const contentType = response.headers.get('content-type') || '';
	const isJson = contentType.includes('application/json');
	const body = isJson ? await response.json() : await response.text();

	if (!response.ok) {
		const payload = (
			typeof body === 'object' && body
				? body
				: { message: typeof body === 'string' ? body : undefined }
		) as DrawApiErrorPayload;
		throw new DrawApiError(response.status, payload);
	}
	return body as T;
}

export async function drawRequest<T>(
	path: string,
	options: DrawRequestOptions = {}
): Promise<T> {
	await resolveApiRedirect();
	const headers = new Headers(options.headers);
	const method = (options.method || 'GET').toUpperCase();
	const token = forumAuth.getToken();
	const currentEnv = get(drawEnv);
	const baseUrl = get(drawEnv.baseUrl);
	const defaultBaseUrl = drawEnv.getBaseUrl(currentEnv);

	if (options.requiresAuth && !token) {
		throw new DrawApiError(401, {
			message: '未检测到登录令牌，请先在论坛登录。',
			code: 'DRAW_AUTH_TOKEN_MISSING'
		});
	}

	if (options.json !== undefined) headers.set('Content-Type', 'application/json');

	if (token) headers.set('Authorization', `Bearer ${token}`);

	const requestInit: RequestInit = {
		...options,
		method,
		headers,
		body: options.json !== undefined ? JSON.stringify(options.json) : options.body
	};

	let response: Response;
	try {
		response = await fetch(buildUrl(path, options.query, baseUrl), requestInit);
	} catch (error) {
		if (method === 'GET' && baseUrl !== defaultBaseUrl) {
			try {
				response = await fetch(buildUrl(path, options.query, defaultBaseUrl), requestInit);
				drawEnv.customBaseUrl.reset(currentEnv);
				return parseResponse<T>(response);
			} catch {
				// fall through
			}
		}
		apiError.set('后端不可用，二叉树树目前可能需要使用电脑，未启用生图功能');
		throw new DrawApiError(503, {
			code: 'DRAW_API_UNREACHABLE',
			message:
				error instanceof Error
					? `生图接口不可访问：${error.message}`
					: '生图接口不可访问，请检查环境地址配置。'
		});
	}

	return parseResponse<T>(response);
}

// --- Convenience functions ---

export async function fetchWorkflows(subdir?: string) {
	return drawRequest<{
		workflows: import('../types').DrawWorkflow[];
		category_order: string[];
	}>('/api/workflows', { query: { subdir } });
}

export async function fetchWorkflowDetail(path: string, signal?: AbortSignal) {
	return drawRequest<import('../types').DrawWorkflowDetail>('/api/workflows/current', {
		query: { path },
		signal
	});
}

export async function fetchStyles() {
	return drawRequest<import('../types').DrawStylesResponse>('/api/styles');
}

export async function fetchResolutions() {
	return drawRequest<import('../types').DrawResolutionsResponse>('/api/resolutions');
}

export async function fetchMyImages() {
	return drawRequest<{ items: { path: string; mtime: number }[]; total: number }>(
		'/api/draw/my-images',
		{ requiresAuth: true }
	);
}

export async function fetchOutputList(limit = 500, offset = 0) {
	return drawRequest<import('../types').DrawOutputListResponse>('/api/output/list', {
		query: { limit, offset }
	});
}

export async function fetchFeatured() {
	return drawRequest<import('../types').DrawFeaturedResponse>('/api/output/featured');
}

export async function forkOutputImage(path: string) {
	return drawRequest<{
		workflow: object;
		summary: Record<string, unknown>;
		default_width: number | null;
		default_height: number | null;
		builtin_prompt: string;
		builtin_negative_prompt: string;
		loras: string[];
		format: string;
		seed?: number;
		style_tags?: string;
		matched_workflow?: string;
	}>('/api/output/fork', { method: 'POST', json: { path } });
}

export async function deleteMyImage(path: string) {
	return drawRequest<{ ok: boolean }>('/api/draw/my-images', {
		method: 'DELETE',
		json: { path }
	});
}

export async function addToQueue(payload: {
	direct_prompt: string;
	image1_name?: string;
	image2_name?: string;
}) {
	return drawRequest<{ queued: boolean; position: number }>('/api/draw/queue', {
		method: 'POST',
		json: payload,
		requiresAuth: true,
	});
}

export async function recommendImage(imagePath: string, reason?: string) {
	return drawRequest<{ ok: boolean; recommendation: DrawRecommendation }>('/api/draw/recommend', {
		method: 'POST',
		json: { image_path: imagePath, reason: reason || '' }
	});
}

export async function fetchMyRecommendations() {
	return drawRequest<{ items: DrawRecommendation[]; total: number }>('/api/draw/my-recommendations');
}

function _appendToken(url: URL): string {
	const token = forumAuth.getToken();
	if (token) url.searchParams.set('token', token);
	return url.toString();
}

export function getImageUrl(path: string, full = false): string {
	const baseUrl = get(drawEnv.baseUrl);
	const url = new URL('/api/output/file', baseUrl);
	url.searchParams.set('path', path);
	if (full) url.searchParams.set('full', '1');
	return _appendToken(url);
}

export function getThumbnailUrl(path: string): string {
	const baseUrl = get(drawEnv.baseUrl);
	const url = new URL('/api/thumbnail', baseUrl);
	url.searchParams.set('path', path);
	return _appendToken(url);
}

export function getImageProxyUrl(filename: string, subfolder = '', type = 'output'): string {
	const baseUrl = get(drawEnv.baseUrl);
	const url = new URL('/api/image', baseUrl);
	url.searchParams.set('filename', filename);
	if (subfolder) url.searchParams.set('subfolder', subfolder);
	url.searchParams.set('type', type);
	return _appendToken(url);
}
