/**
 * Editing Data Tracker
 *
 * Tracks user editing actions (cuts, trims, subtitle edits, music additions, etc.)
 * to build a data asset that can power premium services:
 * - AI-powered editing suggestions
 * - Editing templates marketplace
 * - Training data for automated editing models
 * - Project analytics & insights
 */

import { getSessionId } from './session';
import { getSupabase } from './supabase';

// ─── Types ──────────────────────────────────────────────────────────────────

export type EditingActionType =
  | 'clip_add'
  | 'clip_delete'
  | 'clip_trim_left'
  | 'clip_trim_right'
  | 'clip_split'
  | 'clip_move'
  | 'clip_resize'
  | 'clip_speed_change'
  | 'subtitle_add'
  | 'subtitle_edit'
  | 'subtitle_delete'
  | 'subtitle_style_change'
  | 'audio_add'
  | 'audio_volume_change'
  | 'audio_delete'
  | 'effect_apply'
  | 'transition_add'
  | 'export_start'
  | 'export_complete'
  | 'project_create'
  | 'project_save'
  | 'undo'
  | 'redo';

export interface EditingAction {
  id?: string;
  session_id: string;
  user_id?: string;
  project_id?: string;
  action_type: EditingActionType;
  target_track?: number;       // which track (0=subtitle, 1=main, 2=audio, 10-14=overlay)
  clip_duration?: number;      // duration of affected clip
  clip_media_type?: string;    // 'video' | 'audio' | 'image' | 'subtitle'
  action_value?: string;       // JSON string with action-specific details
  timeline_position?: number;  // playhead position at time of action
  project_duration?: number;   // total project duration at time of action
  clip_count?: number;         // total clips in project
  created_at?: string;
}

export interface ProjectSummary {
  id?: string;
  session_id: string;
  user_id?: string;
  project_id?: string;
  total_clips: number;
  video_clips: number;
  audio_clips: number;
  subtitle_clips: number;
  overlay_clips: number;
  total_duration: number;       // seconds
  total_cuts: number;
  total_trims: number;
  total_subtitle_edits: number;
  total_effects: number;
  total_undos: number;
  editing_duration: number;     // seconds spent editing
  actions_per_minute: number;
  most_used_action: string;
  export_count: number;
  created_at?: string;
  updated_at?: string;
}

export interface EditingPattern {
  action_sequence: EditingActionType[];
  frequency: number;
  avg_interval_ms: number;
}

// ─── Tracker ────────────────────────────────────────────────────────────────

let actionQueue: EditingAction[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let sessionStartTime = 0;
let actionCount = 0;
let actionCounts: Record<string, number> = {};

const FLUSH_INTERVAL = 5000;
const BATCH_SIZE = 30;

async function flushActions() {
  if (actionQueue.length === 0) return;
  const batch = actionQueue.splice(0, BATCH_SIZE);
  try {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.from('editing_actions').insert(batch);
  } catch {
    // Re-queue on failure
    actionQueue.unshift(...batch);
  }
}

export function initEditingTracker() {
  if (typeof window === 'undefined') return;
  sessionStartTime = Date.now();
  actionCount = 0;
  actionCounts = {};
  if (!flushTimer) {
    flushTimer = setInterval(flushActions, FLUSH_INTERVAL);
  }
}

export function stopEditingTracker() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  flushActions(); // final flush
}

export function trackEditingAction(
  actionType: EditingActionType,
  details?: {
    targetTrack?: number;
    clipDuration?: number;
    clipMediaType?: string;
    actionValue?: Record<string, any>;
    timelinePosition?: number;
    projectDuration?: number;
    clipCount?: number;
    projectId?: string;
    userId?: string;
  }
) {
  actionCount++;
  actionCounts[actionType] = (actionCounts[actionType] || 0) + 1;

  const action: EditingAction = {
    session_id: getSessionId(),
    user_id: details?.userId,
    project_id: details?.projectId,
    action_type: actionType,
    target_track: details?.targetTrack,
    clip_duration: details?.clipDuration,
    clip_media_type: details?.clipMediaType,
    action_value: details?.actionValue ? JSON.stringify(details.actionValue) : undefined,
    timeline_position: details?.timelinePosition,
    project_duration: details?.projectDuration,
    clip_count: details?.clipCount,
  };

  actionQueue.push(action);

  if (actionQueue.length >= BATCH_SIZE) {
    flushActions();
  }
}

export function getEditingSessionStats() {
  const elapsed = (Date.now() - sessionStartTime) / 1000 / 60; // minutes
  return {
    totalActions: actionCount,
    actionsPerMinute: elapsed > 0 ? actionCount / elapsed : 0,
    actionBreakdown: { ...actionCounts },
    editingMinutes: elapsed,
    mostUsedAction: Object.entries(actionCounts).sort(([, a], [, b]) => b - a)[0]?.[0] || 'none',
  };
}

export async function saveProjectSummary(
  summary: Omit<ProjectSummary, 'session_id' | 'actions_per_minute' | 'most_used_action' | 'editing_duration'>
) {
  const stats = getEditingSessionStats();
  const fullSummary: ProjectSummary = {
    ...summary,
    session_id: getSessionId(),
    editing_duration: stats.editingMinutes * 60,
    actions_per_minute: stats.actionsPerMinute,
    most_used_action: stats.mostUsedAction,
  };

  try {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.from('project_summaries').upsert(fullSummary, { onConflict: 'project_id' });
  } catch {
    // silent fail
  }
}
