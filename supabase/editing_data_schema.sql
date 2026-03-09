-- ═══════════════════════════════════════════════════════════════
-- Editing Data Asset Schema
-- Tracks user editing actions for analytics & premium services
-- ═══════════════════════════════════════════════════════════════

-- 편집 액션 로그 (모든 개별 편집 행위)
CREATE TABLE IF NOT EXISTS editing_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT,
  project_id TEXT,
  action_type TEXT NOT NULL,        -- clip_add, clip_trim_left, subtitle_add, etc.
  target_track INTEGER,             -- 0=subtitle, 1=main, 2=audio, 10-14=overlay
  clip_duration REAL,               -- seconds
  clip_media_type TEXT,             -- video, audio, image, subtitle
  action_value JSONB,               -- action-specific details
  timeline_position REAL,           -- playhead position (seconds)
  project_duration REAL,            -- total project duration
  clip_count INTEGER,               -- total clips at time of action
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 프로젝트 요약 (프로젝트별 편집 통계)
CREATE TABLE IF NOT EXISTS project_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT,
  project_id TEXT UNIQUE,
  total_clips INTEGER DEFAULT 0,
  video_clips INTEGER DEFAULT 0,
  audio_clips INTEGER DEFAULT 0,
  subtitle_clips INTEGER DEFAULT 0,
  overlay_clips INTEGER DEFAULT 0,
  total_duration REAL DEFAULT 0,
  total_cuts INTEGER DEFAULT 0,
  total_trims INTEGER DEFAULT 0,
  total_subtitle_edits INTEGER DEFAULT 0,
  total_effects INTEGER DEFAULT 0,
  total_undos INTEGER DEFAULT 0,
  editing_duration REAL DEFAULT 0,    -- seconds spent editing
  actions_per_minute REAL DEFAULT 0,
  most_used_action TEXT,
  export_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 편집 패턴 (자주 사용되는 편집 시퀀스)
CREATE TABLE IF NOT EXISTS editing_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_hash TEXT UNIQUE NOT NULL,   -- hash of action_sequence for dedup
  action_sequence JSONB NOT NULL,      -- ordered list of action types
  frequency INTEGER DEFAULT 1,
  avg_interval_ms REAL,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- 편집 템플릿 (유저가 저장하거나 AI가 생성한 편집 프리셋)
CREATE TABLE IF NOT EXISTS editing_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,                        -- 'vlog', 'tutorial', 'shorts', 'commercial'
  action_blueprint JSONB NOT NULL,      -- structured editing steps
  clip_structure JSONB,                 -- track layout & timing info
  subtitle_style JSONB,                 -- font, color, animation presets
  popularity_score REAL DEFAULT 0,
  is_premium BOOLEAN DEFAULT FALSE,
  price_cents INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_editing_actions_session ON editing_actions(session_id);
CREATE INDEX IF NOT EXISTS idx_editing_actions_type ON editing_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_editing_actions_created ON editing_actions(created_at);
CREATE INDEX IF NOT EXISTS idx_editing_actions_user ON editing_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_project_summaries_user ON project_summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_editing_templates_category ON editing_templates(category);
CREATE INDEX IF NOT EXISTS idx_editing_templates_premium ON editing_templates(is_premium);
