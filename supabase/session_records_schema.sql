-- 세션 녹화 테이블
CREATE TABLE IF NOT EXISTS session_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  page_url TEXT NOT NULL,
  events JSONB NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_session_records_session_id ON session_records(session_id);
CREATE INDEX IF NOT EXISTS idx_session_records_page_url ON session_records(page_url);
CREATE INDEX IF NOT EXISTS idx_session_records_created_at ON session_records(created_at);

-- RLS 정책 (필요시)
ALTER TABLE session_records ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽기 가능 (관리자만 접근 가능하도록 앱 레벨에서 제어)
CREATE POLICY "Allow read access" ON session_records
  FOR SELECT USING (true);

-- 모든 사용자가 쓰기 가능 (트래커에서 기록)
CREATE POLICY "Allow insert access" ON session_records
  FOR INSERT WITH CHECK (true);
