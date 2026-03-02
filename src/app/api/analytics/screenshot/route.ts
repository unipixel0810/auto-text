import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pageUrl = searchParams.get('url') || '/';

  const baseUrl = req.headers.get('x-forwarded-host')
    ? `${req.headers.get('x-forwarded-proto') || 'http'}://${req.headers.get('x-forwarded-host')}`
    : `http://localhost:${process.env.PORT || 3000}`;

  const fullUrl = pageUrl.startsWith('http') ? pageUrl : `${baseUrl}${pageUrl}`;

  return NextResponse.json({
    url: fullUrl,
    pageUrl,
  });
}
