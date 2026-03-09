export type AnalyticsEventType =
  | 'click'
  | 'scroll'
  | 'cta_click'
  | 'rage_click'
  | 'dead_click'
  | 'page_view'
  | 'page_leave'
  | 'error'
  | 'performance'
  | 'form_interaction';

export interface AnalyticsEvent {
  id?: string;
  event_type: AnalyticsEventType;
  page_url: string;
  page_title?: string;
  element_tag?: string;
  element_class?: string;
  element_id?: string;
  element_text?: string;
  x_pos?: number;
  y_pos?: number;
  scroll_depth?: number;
  session_id: string;
  user_agent?: string;
  referrer?: string;
  viewport_width?: number;
  viewport_height?: number;
  time_on_page?: number;
  created_at?: string;
  // 추가 방문자 정보 (page_view 시)
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  device_type?: 'mobile' | 'tablet' | 'desktop';
  browser?: string;
  os?: string;
  screen_width?: number;
}

export interface AnalyticsSession {
  session_id: string;
  started_at: number;
  expires_at: number;
}

export interface HeatmapPoint {
  x: number;
  y: number;
  count: number;
}

export interface ScrollDepthData {
  depth: number;
  count: number;
  percentage: number;
}

export interface RageClickEntry {
  x_pos: number;
  y_pos: number;
  element_info: string;
  page_url: string;
  count: number;
  last_occurred: string;
}

export interface PageView {
  id?: string;
  session_id: string;
  page_url: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  device_type: 'mobile' | 'tablet' | 'desktop';
  browser: string;
  os: string;
  screen_width: number;
  duration_seconds: number;
  is_bounce: boolean;
  created_at?: string;
}

export interface VisitorStats {
  today_visitors: number;
  yesterday_visitors: number;
  visitor_change_pct: number;
  avg_duration: number;
  bounce_rate: number;
  top_page: string;
}

export interface ChartDataPoint {
  name: string;
  value: number;
  [key: string]: any;
}

export interface DateFilter {
  label: string;
  value: string;
  days: number;
}

export const DATE_FILTERS: DateFilter[] = [
  { label: '오늘', value: 'today', days: 0 },
  { label: '7일', value: '7d', days: 7 },
  { label: '30일', value: '30d', days: 30 },
];

export interface DemographicData {
  estimatedAgeGroup: '13-17' | '18-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65+' | 'unknown';
  estimatedGender: 'male' | 'female' | 'unknown';
  language: string;
  timezone: string;
  country: string;
  region: string;
  city: string;
  connectionType: string;
  screenResolution: string;
  colorDepth: number;
  touchSupport: boolean;
  cookiesEnabled: boolean;
  doNotTrack: boolean;
}

export interface WebVitals {
  lcp?: number;  // Largest Contentful Paint
  fid?: number;  // First Input Delay
  cls?: number;  // Cumulative Layout Shift
  fcp?: number;  // First Contentful Paint
  ttfb?: number; // Time to First Byte
  inp?: number;  // Interaction to Next Paint
}

export interface FunnelStep {
  id: string;
  name: string;
  url_pattern: string;
  order: number;
}

export interface FunnelData {
  id: string;
  name: string;
  steps: FunnelStep[];
  created_at: string;
}

export interface ServiceHealth {
  uptime: number;
  avgResponseTime: number;
  errorRate: number;
  activeUsers: number;
  apiLatency: Record<string, number>;
  jsErrors: { message: string; count: number; lastSeen: string }[];
  webVitals: WebVitals;
}
