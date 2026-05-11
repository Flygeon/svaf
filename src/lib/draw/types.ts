export type DrawApiEnv = 'prod' | 'dev';

export interface DrawApiErrorPayload {
	code?: string;
	message?: string;
	error?: string;
}

export class DrawApiError extends Error {
	status: number;
	code?: string;

	constructor(status: number, payload: DrawApiErrorPayload = {}) {
		super(payload.message || payload.error || `生图请求失败（${status}）`);
		this.name = 'DrawApiError';
		this.status = status;
		this.code = payload.code;
	}
}

// --- API response types ---

export interface DrawWorkflow {
	path: string;
	name: string;
	thumbnail: boolean;
	category: string;
}

export interface DrawWorkflowsResponse {
	workflows: DrawWorkflow[];
	category_order: string[];
}

export interface DrawWorkflowDetail {
	path: string;
	summary: {
		node_count: number;
		link_count: number;
		group_count: number;
		types: Record<string, number>;
	};
	thumbnail: boolean;
	default_width: number;
	default_height: number;
	builtin_prompt: string;
	builtin_negative_prompt: string;
	loras: string[];
	lora_link?: string;
}

export interface DrawStyle {
	name: string;
	tags: string;
	image?: string;
	thumbnail_url?: string;
}

export interface DrawStylesResponse {
	styles: DrawStyle[];
}

export interface DrawResolution {
	w: number;
	h: number;
	label?: string;
}

export interface DrawResolutionsResponse {
	presets: DrawResolution[];
}

export interface DrawGpuInfo {
	index: number;
	name: string;
	'utilization.gpu': number;
	'utilization.memory': number;
	'memory.used': number;
	'memory.total': number;
	'temperature.gpu': number;
	'power.draw': number;
	'power.limit': number;
	'clocks.current.graphics': number;
	'clocks.current.memory': number;
	'fan.speed': number;
}

export interface DrawGpuResponse {
	available: boolean;
	gpus: DrawGpuInfo[];
	poll_interval_ms?: number;
	error?: string;
}

export interface DrawAnnouncementResponse {
	announcement: {
		enabled: boolean;
		title: string;
		content: string;
	};
}

export interface DrawOutputItem {
	path: string;
	mtime: number;
	size?: number;
}

export interface DrawOutputListResponse {
	output_dir: string;
	archive_dir: string;
	exists: boolean;
	total: number;
	items: DrawOutputItem[];
}

export interface DrawFeaturedResponse {
	items: DrawOutputItem[];
	total: number;
}

export interface DrawTranslateResponse {
	text: string;
	negative: string;
}

// --- WebSocket message types ---

export interface WsLogMessage {
	type: 'log';
	message: string;
}

export interface WsLlmStartMessage {
	type: 'llm_start';
}

export interface WsLlmChunkMessage {
	type: 'llm_chunk';
	delta: string;
}

export interface WsLlmDoneMessage {
	type: 'llm_done';
	text: string;
	negative?: string;
}

export interface WsProgressMessage {
	type: 'progress';
	node: string;
	value: number;
	max: number;
	done: number;
	total: number;
}

export interface WsPromptIdMessage {
	type: 'prompt_id';
	prompt_id: string;
	final_prompt: string;
}

export interface WsPreviewMessage {
	type: 'preview';
	image: string;
}

export interface WsImageMessage {
	type: 'image';
	url: string;
	filename: string;
	subfolder: string;
	image_type: string;
}

export interface WsDoneMessage {
	type: 'done';
	final_prompt: string;
	count: number;
}

export interface WsErrorMessage {
	type: 'error';
	message: string;
}

export interface WsStatusMessage {
	type: 'status';
	online: number;
	busy: boolean;
	stage?: 'loading' | 'llm' | 'generating';
	workflow?: string;
}

export interface WsOnlineMessage {
	type: 'online';
	count: number;
}

export interface WsMirrorMessage {
	type: 'mirror';
	event: WsRunMessage;
}

export type WsRunMessage =
	| WsLogMessage
	| WsLlmStartMessage
	| WsLlmChunkMessage
	| WsLlmDoneMessage
	| WsProgressMessage
	| WsPromptIdMessage
	| WsPreviewMessage
	| WsImageMessage
	| WsDoneMessage
	| WsErrorMessage;

export type WsStatusEvent =
	| WsStatusMessage
	| WsOnlineMessage
	| WsMirrorMessage;

export interface WsRunPayload {
	token: string;
	workflow_path: string;
	inline_workflow?: object | null;
	direct_prompt: string;
	nl_prompt?: string;
	rewrite?: boolean;
	width?: number | null;
	height?: number | null;
	style_tags?: string;
	negative_prompt?: string;
}

// --- Admin types ---

export interface AdminRecentImage {
	path: string;
	user_id: string;
	mtime: number;
}

export interface AdminReport {
	id: string;
	image_path: string;
	reporter_id: string;
	reason: string;
	timestamp: number;
	status: string;
	creator_id: string;
	image_exists: boolean;
}

export interface AdminLimits {
	gen_cooldown_sec: number;
	image_rate_window_sec: number;
	image_rate_max: number;
	report_window_sec: number;
	report_window_max: number;
	report_pending_max: number;
	gpu_poll_interval_ms: number;
	gpu_cache_ttl_ms: number;
	gc_interval_hours: number;
	category_order: string[];
}

export interface AdminMaintenance {
	enabled: boolean;
	message: string;
}

export interface AdminAnnouncement {
	enabled: boolean;
	title: string;
	content: string;
}

export interface AdminGcResult {
	ok: boolean;
	cleaned: Record<string, number>;
}
