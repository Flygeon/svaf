import type { DrawApiEnv } from '../types';
import type { Readable, Writable } from 'svelte/store';
import { readLocalStorage, writeLocalStorage } from '$lib/forum/utils/storage';
import { derived, get, writable } from 'svelte/store';

export const DRAW_API_ENV_STORAGE_KEY = 'draw-api-env';
export const DRAW_API_CUSTOM_BASE_URL_STORAGE_KEY = 'draw-api-custom-base-url';

/** 全局 API 错误状态：当 drawRequest 彻底失败时设置 */
export const apiError = writable<string | null>(null);

/** 重定向检测日志（可在页面上展示） */
export const redirectLogs = writable<string[]>([]);
let _logIdx = 0;
export function addRedirectLog(msg: string) {
  redirectLogs.update(arr => {
    const newLog = `[${++_logIdx}] ${msg}`;
    arr = [...arr, newLog];
    if (arr.length > 20) arr = arr.slice(-20);
    return arr;
  });
}

export type ApiStatus = 'checking' | 'online' | 'offline';
export const apiStatus = writable<ApiStatus>('checking');

// apiError 和 apiStatus 同步：错误时离线
apiError.subscribe(v => {
  if (v) {
    apiStatus.set('offline');
  }
});

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
  const envStore = writable<DrawApiEnv>(initialEnv);
  const customBaseUrlStore = writable<string>(
    readLocalStorage<string>(DRAW_API_CUSTOM_BASE_URL_STORAGE_KEY, '') || DRAW_API_BASE_URLS[initialEnv]
  );

  const baseUrl = derived([envStore, customBaseUrlStore], ([$env, $custom]) =>
    sanitizeBaseUrl($custom, $env)
  );

  return {
    subscribe: envStore.subscribe,
    baseUrl,
    customBaseUrl: {
      subscribe: customBaseUrlStore.subscribe,
      set: (v) => {
      const url = sanitizeBaseUrl(v, get(envStore));
      writeLocalStorage(DRAW_API_CUSTOM_BASE_URL_STORAGE_KEY, url);
      _redirectResolved = false;
      _redirectFailAt = 0;
      apiStatus.set('checking');
      customBaseUrlStore.set(url);
    },
      reset: (env) => {
      writeLocalStorage(DRAW_API_CUSTOM_BASE_URL_STORAGE_KEY, '');
      _redirectResolved = false;
      _redirectFailAt = 0;
      customBaseUrlStore.set(DRAW_API_BASE_URLS[env]);
    }
    },
    set: (v) => {
      const next = normalizeEnv(v);
      writeLocalStorage(DRAW_API_ENV_STORAGE_KEY, next);
      _redirectResolved = false;
      _redirectFailAt = 0;
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
      _redirectResolved = false;
      _redirectFailAt = 0;
      customBaseUrlStore.set(DRAW_API_BASE_URLS[next]);
    },
    getBaseUrl: (env) => DRAW_API_BASE_URLS[env]
  };
}

export const drawEnv: DrawEnvStore = createEnvStore();

/**
 * 探测 API 端点是否有重定向（CDN / 负载均衡），
 * 失败后有 30s 冷却，避免高频重试。
 */
let _redirectResolved = false;
let _redirectFailAt = 0;
const REDIRECT_COOLDOWN = 30000;

let _redirectPending: Promise<void> | null = null;

export async function resolveApiRedirect(force = false): Promise<void> {
  if (_redirectResolved && !force) return;
  if (_redirectPending) return _redirectPending;
  const now = Date.now();
  if (!force && now - _redirectFailAt < REDIRECT_COOLDOWN) return;
  _redirectPending = (async () => {
    apiStatus.set('checking');
    const baseUrl = get(drawEnv.baseUrl);
    addRedirectLog(`检测 ${baseUrl}/health`);
    try {
      const resp = await fetch(`${baseUrl}/health?_t=${Date.now()}`, { method: 'GET' });
      addRedirectLog(`响应 status=${resp.status} url=${resp.url}`);
      if (!resp.ok) { addRedirectLog(`不 OK`); throw new Error('health check failed'); }
      const finalUrl = new URL(resp.url.replace(/\/health[\?&].*$/, '').replace(/\/health$/, '')).origin;
      addRedirectLog(`原始=${baseUrl} 最终=${finalUrl}`);
      if (finalUrl !== baseUrl && finalUrl.startsWith('http')) {
        addRedirectLog(`检测到重定向，切换为 ${finalUrl}`);
        drawEnv.customBaseUrl.set(finalUrl);
      } else {
        addRedirectLog(`无重定向，使用 ${baseUrl}`);
      }
      _redirectResolved = true;
      apiStatus.set('online');
      apiError.set(null);
    } catch {
      addRedirectLog(`失败`);
      _redirectFailAt = Date.now();
      apiStatus.set('offline');
    } finally {
      _redirectPending = null;
    }
  })();
  return _redirectPending;
}
