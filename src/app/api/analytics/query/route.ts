import { NextRequest, NextResponse } from 'next/server';
import { queryEvents, getDistinctPages, getStats, getChartData, getABExperimentResults } from '@/lib/analytics/store';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    if (action === 'pages') {
      const days = searchParams.get('days');
      const pages = await getDistinctPages(days ? parseInt(days) : undefined);
      return NextResponse.json({ pages });
    }

    if (action === 'stats') {
      const days = searchParams.get('days');
      const stats = await getStats(days ? parseInt(days) : 30);
      return NextResponse.json(stats);
    }

    if (action === 'charts') {
      const days = searchParams.get('days');
      const charts = await getChartData(days ? parseInt(days) : 30);
      return NextResponse.json(charts);
    }

    if (action === 'ab-results') {
      try {
        const results = await getABExperimentResults();
        if (results && 'error' in results) {
          return NextResponse.json(results);
        }
        return NextResponse.json({ experiments: results || [] });
      } catch (err) {
        console.error('[Analytics Query] ab-results error:', err);
        return NextResponse.json({ experiments: [], error: 'Failed to fetch A/B test results' });
      }
    }

    const page_url = searchParams.get('page_url') || undefined;
    const event_type = searchParams.get('event_type') || undefined;
    const daysStr = searchParams.get('days');
    const days = daysStr !== null ? parseInt(daysStr) : undefined;
    const limitStr = searchParams.get('limit');
    const limit = limitStr ? parseInt(limitStr) : 10000;

    const events = await queryEvents({ page_url, event_type, days, limit });
    return NextResponse.json({ events, total: events.length });
  } catch (err) {
    console.error('[Analytics Query]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
