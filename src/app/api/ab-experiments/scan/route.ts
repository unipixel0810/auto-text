import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const page = searchParams.get('page');

  if (!page) {
    return NextResponse.json({ error: 'Page parameter required' }, { status: 400 });
  }

  // 실제로는 서버에서 페이지를 크롤링하여 요소를 스캔해야 하지만,
  // 현재는 클라이언트 사이드에서 처리하도록 안내
  return NextResponse.json({ 
    elements: [],
    message: 'Please use client-side scanning'
  });
}
