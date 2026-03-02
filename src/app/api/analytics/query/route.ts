import { NextRequest, NextResponse } from 'next/server';
import { queryEvents, getDistinctPages } from '@/lib/analytics/store';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    if (action === 'pages') {
      const days = searchParams.get('days');
      const pages = await getDistinctPages(days ? parseInt(days) : undefined);
      return NextResponse.json({ pages });
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
