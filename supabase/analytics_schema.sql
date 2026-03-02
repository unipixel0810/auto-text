-- Analytics Events Table
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('click', 'scroll', 'cta_click', 'rage_click', 'dead_click', 'page_view', 'page_leave')),
  page_url TEXT NOT NULL,
  page_title TEXT,
  element_tag TEXT,
  element_class TEXT,
  element_id TEXT,
  element_text TEXT,
  x_pos INTEGER,
  y_pos INTEGER,
  scroll_depth INTEGER,
  session_id TEXT NOT NULL,
  user_agent TEXT,
  referrer TEXT,
  viewport_width INTEGER,
  viewport_height INTEGER,
  time_on_page INTEGER,
  -- UTM 파라미터
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  -- 환경 정보
  device_type TEXT,
  browser TEXT,
  os TEXT,
  screen_width INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Visitor Page Views Table (GA Style)
CREATE TABLE IF NOT EXISTS page_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  page_url TEXT NOT NULL,
  referrer TEXT,
  -- UTM 파라미터
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  -- 환경 정보
  device_type TEXT, -- mobile, tablet, desktop
  browser TEXT,
  os TEXT,
  screen_width INTEGER,
  -- 성과 지표
  duration_seconds INTEGER DEFAULT 0,
  is_bounce BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_analytics_page_url ON analytics_events (page_url);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pv_session_id ON page_views (session_id);
CREATE INDEX IF NOT EXISTS idx_pv_created_at ON page_views (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pv_utm ON page_views (utm_source, utm_medium);

-- RLS
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous inserts events" ON analytics_events FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anonymous reads events" ON analytics_events FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous inserts pv" ON page_views FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anonymous reads pv" ON page_views FOR SELECT TO anon USING (true);

-- A/B Test Events Table
CREATE TABLE IF NOT EXISTS ab_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_name TEXT NOT NULL,
  variant TEXT NOT NULL CHECK (variant IN ('A', 'B')),
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'click')),
  session_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for AB Testing
CREATE INDEX IF NOT EXISTS idx_ab_experiment ON ab_events (experiment_name);
CREATE INDEX IF NOT EXISTS idx_ab_session ON ab_events (session_id);

-- RLS for AB Testing
ALTER TABLE ab_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous inserts ab" ON ab_events FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anonymous reads ab" ON ab_events FOR SELECT TO anon USING (true);
