import { drawRequest } from './client';
import type {
	AdminRecentImage,
	AdminReport,
	AdminLimits,
	AdminMaintenance,
	AdminAnnouncement,
	AdminGcResult,
	AdminLlmConfig
} from '../types';

// --- Featured ---

export async function getFeatured() {
	return drawRequest<{ items: string[] }>('/api/draw/admin/featured');
}

export async function addFeatured(path: string) {
	return drawRequest<{ ok: boolean; items: string[] }>('/api/draw/admin/featured/add', {
		method: 'POST',
		json: { path }
	});
}

export async function removeFeatured(path: string) {
	return drawRequest<{ ok: boolean; items: string[] }>('/api/draw/admin/featured/remove', {
		method: 'POST',
		json: { path }
	});
}

export async function reorderFeatured(items: string[]) {
	return drawRequest<{ ok: boolean; items: string[] }>('/api/draw/admin/featured/reorder', {
		method: 'POST',
		json: { items }
	});
}

// --- Limits ---

export async function getLimits() {
	return drawRequest<{ limits: AdminLimits; defaults: AdminLimits }>('/api/draw/admin/limits');
}

export async function updateLimits(partial: Partial<AdminLimits>) {
	return drawRequest<{ ok: boolean; limits: AdminLimits }>('/api/draw/admin/limits', {
		method: 'POST',
		json: partial
	});
}

// --- Recent Images ---

export async function getRecentImages(limit = 200, offset = 0) {
	return drawRequest<{
		items: AdminRecentImage[];
		total: number;
		limit: number;
		offset: number;
	}>('/api/draw/admin/recent', { query: { limit, offset } });
}

export async function getImagesByUser(userId: number) {
	return drawRequest<{ items: AdminRecentImage[]; total: number }>(
		'/api/draw/admin/images_by_user',
		{ query: { user_id: userId } }
	);
}

// --- Delete ---

export async function deleteImage(path: string) {
	return drawRequest<{ ok: boolean }>('/api/draw/admin/delete', {
		method: 'POST',
		json: { path }
	});
}

export async function deleteImages(paths: string[]) {
	return drawRequest<{ ok: boolean; deleted: number; failed: number }>(
		'/api/draw/admin/delete_batch',
		{ method: 'POST', json: { paths } }
	);
}

// --- Reports ---

export async function getReports() {
	return drawRequest<{ reports: AdminReport[]; total: number }>('/api/draw/admin/reports');
}

export async function resolveReport(
	reportId: string,
	action: 'delete' | 'ban_creator' | 'ban_reporter' | 'dismiss'
) {
	return drawRequest<{ ok: boolean; action: string }>('/api/draw/admin/report/resolve', {
		method: 'POST',
		json: { report_id: reportId, action }
	});
}

// --- Announcement ---

export async function getAnnouncement() {
	return drawRequest<{ announcement: AdminAnnouncement }>('/api/draw/admin/announcement');
}

export async function updateAnnouncement(partial: Partial<AdminAnnouncement>) {
	return drawRequest<{ ok: boolean; announcement: AdminAnnouncement }>(
		'/api/draw/admin/announcement',
		{ method: 'POST', json: partial }
	);
}

// --- Maintenance ---

export async function getMaintenance() {
	return drawRequest<AdminMaintenance>('/api/draw/admin/maintenance');
}

export async function updateMaintenance(partial: Partial<AdminMaintenance>) {
	return drawRequest<{ ok: boolean; maintenance: AdminMaintenance }>(
		'/api/draw/admin/maintenance',
		{ method: 'POST', json: partial }
	);
}

// --- Banned Users ---

export async function getBannedUsers() {
	return drawRequest<{ banned: number[] }>('/api/draw/admin/draw-banned');
}

export async function banUser(userId: number) {
	return drawRequest<{ ok: boolean; banned: number[] }>('/api/draw/admin/draw-ban', {
		method: 'POST',
		json: { user_id: userId }
	});
}

export async function unbanUser(userId: number) {
	return drawRequest<{ ok: boolean; banned: number[] }>('/api/draw/admin/draw-unban', {
		method: 'POST',
		json: { user_id: userId }
	});
}

// --- GC ---

export async function runGc() {
	return drawRequest<AdminGcResult>('/api/draw/admin/gc', { method: 'POST' });
}

// --- Styles ---

export async function getStyles() {
	return drawRequest<{ styles: import('../types').DrawStyle[] }>('/api/draw/admin/styles');
}

export async function updateStyles(styles: import('../types').DrawStyle[]) {
	return drawRequest<{ ok: boolean; styles: import('../types').DrawStyle[] }>('/api/draw/admin/styles', {
		method: 'POST',
		json: { styles }
	});
}

export async function uploadStyleThumbnail(file: File) {
	const form = new FormData();
	form.append('file', file);
	return drawRequest<{ ok: boolean; filename: string }>('/api/draw/admin/style_thumbnail', {
		method: 'POST',
		body: form
	});
}

// --- Workflows ---

export async function getWorkflowFiles() {
	return drawRequest<{ files: string[] }>('/api/draw/admin/workflow_files');
}

export async function renameWorkflow(oldName: string, newName: string) {
	return drawRequest<{ ok: boolean }>('/api/draw/admin/workflow_rename', {
		method: 'POST',
		json: { old: oldName, new: newName }
	});
}

export async function getWorkflowMeta() {
	return drawRequest<{ workflow_meta: { workflow: string; thumbnail?: string; lora_link?: string; category?: string }[] }>('/api/draw/admin/workflow_meta');
}

export async function updateWorkflowMeta(meta: { workflow: string; thumbnail?: string; lora_link?: string; category?: string }[]) {
	return drawRequest<{ ok: boolean; workflow_meta: { workflow: string; thumbnail?: string; lora_link?: string; category?: string }[] }>('/api/draw/admin/workflow_meta', {
		method: 'POST',
		json: { workflow_meta: meta }
	});
}

export async function uploadWfThumbnail(file: File) {
	const form = new FormData();
	form.append('file', file);
	return drawRequest<{ ok: boolean; filename: string }>('/api/draw/admin/wf_thumbnail', {
		method: 'POST',
		body: form
	});
}

// --- LLM Config ---

export async function getLlmConfig() {
	return drawRequest<{
		config: AdminLlmConfig;
		defaults: AdminLlmConfig;
		providers: string[];
		google_thinking_options: string[];
	}>('/api/draw/admin/llm_config');
}

export async function updateLlmConfig(partial: Partial<AdminLlmConfig>) {
	return drawRequest<{ ok: boolean; config: AdminLlmConfig }>('/api/draw/admin/llm_config', {
		method: 'POST',
		json: partial
	});
}

export async function testLlmConfig() {
	return drawRequest<{ ok: boolean; provider: string; reply?: string; error?: string }>('/api/draw/admin/llm_config/test', {
		method: 'POST'
	});
}
