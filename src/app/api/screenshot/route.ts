import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Vercel 등 읽기전용 파일시스템 환경에서는 /tmp 사용, 로컬에서는 public/screenshots 사용
const IS_VERCEL = !!process.env.VERCEL;
const CACHE_DIR = IS_VERCEL
  ? path.join(os.tmpdir(), 'heatmap-screenshots')
  : path.join(process.cwd(), 'public', 'screenshots');
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6시간 캐시

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function pageUrlToFilename(pageUrl: string): string {
  // /landing → landing.png  /  → home.png  /pricing/pro → pricing_pro.png
  const clean = pageUrl.replace(/^\//, '') || 'home';
  return clean.replace(/[/\\?#:*"<>|]/g, '_') + '.png';
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pageUrl = searchParams.get('page_url');

  if (!pageUrl) {
    return NextResponse.json({ error: 'page_url is required' }, { status: 400 });
  }

  try {
    ensureCacheDir();
    const filename = pageUrlToFilename(pageUrl);
    const cachePath = path.join(CACHE_DIR, filename);

    // 캐시 유효성 확인
    const cacheValid =
      fs.existsSync(cachePath) &&
      Date.now() - fs.statSync(cachePath).mtimeMs < CACHE_TTL_MS;

    if (!cacheValid) {
      // 현재 앱 origin으로 절대 URL 생성
      const origin = req.nextUrl.origin;
      const targetUrl = pageUrl.startsWith('http') ? pageUrl : `${origin}${pageUrl}`;

      // playwright로 스크린샷 촬영
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        // 로그인이 필요한 페이지를 위해 쿠키 전달 (같은 origin)
        extraHTTPHeaders: { 'x-screenshot-internal': '1' },
      });
      const page = await context.newPage();

      try {
        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 25000 });
        // 폰트·이미지 로드 대기
        await page.waitForTimeout(1000);
        await page.screenshot({ path: cachePath, fullPage: false, type: 'png' });
      } finally {
        await browser.close();
      }
    }

    // 이미지 반환
    const imageBuffer = fs.readFileSync(cachePath);
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=21600', // 6시간
      },
    });
  } catch (err) {
    console.error('[Screenshot API] Error:', err);
    return NextResponse.json(
      {
        error: 'Failed to capture screenshot',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
