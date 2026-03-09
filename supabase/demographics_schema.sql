-- Visitor demographics and profiles
CREATE TABLE IF NOT EXISTS visitor_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  visitor_id TEXT, -- persistent visitor ID from cookie
  language TEXT,
  timezone TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  connection_type TEXT,
  screen_resolution TEXT,
  color_depth INTEGER,
  touch_support BOOLEAN DEFAULT false,
  cookies_enabled BOOLEAN DEFAULT true,
  do_not_track BOOLEAN DEFAULT false,
  estimated_age_group TEXT DEFAULT 'unknown',
  estimated_gender TEXT DEFAULT 'unknown',
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  total_sessions INTEGER DEFAULT 1,
  total_page_views INTEGER DEFAULT 0,
  avg_session_duration REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- JS Error logs
CREATE TABLE IF NOT EXISTS js_errors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  message TEXT,
  source TEXT,
  lineno INTEGER,
  colno INTEGER,
  stack TEXT,
  page_url TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Web performance metrics
CREATE TABLE IF NOT EXISTS web_vitals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  page_url TEXT,
  lcp REAL,
  fid REAL,
  cls REAL,
  fcp REAL,
  ttfb REAL,
  inp REAL,
  device_type TEXT,
  connection_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversion funnels definition
CREATE TABLE IF NOT EXISTS funnels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Funnel tracking events
CREATE TABLE IF NOT EXISTS funnel_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  funnel_id UUID REFERENCES funnels(id),
  session_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  page_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE visitor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE js_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for visitor_profiles" ON visitor_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for js_errors" ON js_errors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for web_vitals" ON web_vitals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for funnels" ON funnels FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for funnel_events" ON funnel_events FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_visitor_profiles_session ON visitor_profiles(session_id);
CREATE INDEX IF NOT EXISTS idx_visitor_profiles_visitor ON visitor_profiles(visitor_id);
CREATE INDEX IF NOT EXISTS idx_js_errors_session ON js_errors(session_id);
CREATE INDEX IF NOT EXISTS idx_js_errors_created ON js_errors(created_at);
CREATE INDEX IF NOT EXISTS idx_web_vitals_session ON web_vitals(session_id);
CREATE INDEX IF NOT EXISTS idx_web_vitals_created ON web_vitals(created_at);
CREATE INDEX IF NOT EXISTS idx_funnel_events_funnel ON funnel_events(funnel_id);
