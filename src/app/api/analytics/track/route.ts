import { NextRequest, NextResponse } from 'next/server';
import { insertEvents } from '@/lib/analytics/store';
import type { AnalyticsEvent } from '@/lib/analytics/types';

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let body: { events?: AnalyticsEvent[] };

    if (contentType.includes('text/plain')) {
      const text = await req.text();
      body = JSON.parse(text);
    } else {
      body = await req.json();
    }

    const { events } = body;

    if (!events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: 'No events provided' }, { status: 400 });
    }

    if (events.length > 100) {
      return NextResponse.json({ error: 'Too many events (max 100)' }, { status: 400 });
    }

    await insertEvents(events);
    return NextResponse.json({ ok: true, count: events.length });
  } catch (err) {
    console.error('[Analytics Track]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
