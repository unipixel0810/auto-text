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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_analytics_page_url ON analytics_events (page_url);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events (event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_session ON analytics_events (session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_page_type_date ON analytics_events (page_url, event_type, created_at DESC);

-- RLS: allow anonymous inserts, admin reads
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous inserts" ON analytics_events
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anonymous reads" ON analytics_events
  FOR SELECT TO anon USING (true);
