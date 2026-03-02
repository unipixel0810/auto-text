export type AnalyticsEventType =
  | 'click'
  | 'scroll'
  | 'cta_click'
  | 'rage_click'
  | 'dead_click'
  | 'page_view'
  | 'page_leave';

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

export interface DateFilter {
  label: string;
  value: 'today' | '7d' | '30d';
  days: number;
}

export const DATE_FILTERS: DateFilter[] = [
  { label: '오늘', value: 'today', days: 0 },
  { label: '7일', value: '7d', days: 7 },
  { label: '30일', value: '30d', days: 30 },
];
