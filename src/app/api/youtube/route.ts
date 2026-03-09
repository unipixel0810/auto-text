import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  getMyChannel,
  getMyVideos,
  getVideoAnalytics,
  getAudienceDemographics,
  getPerformanceSummary,
  findYouTubeVideoByFrame,
} from '@/lib/youtubeService';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accessToken = (session.user as any).accessToken;
    if (!accessToken) {
      return NextResponse.json({ error: 'YouTube 접근 권한이 없습니다. 다시 로그인해주세요.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    if (action === 'channel') {
      const channel = await getMyChannel(accessToken);
      return NextResponse.json({ channel });
    }

    if (action === 'videos') {
      const limit = parseInt(searchParams.get('limit') || '20');
      const videos = await getMyVideos(accessToken, limit);
      return NextResponse.json({ videos });
    }

    if (action === 'analytics') {
      const videoIds = searchParams.get('videoIds')?.split(',') || [];
      const days = parseInt(searchParams.get('days') || '30');
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

      if (videoIds.length === 0) {
        return NextResponse.json({ analytics: [] });
      }

      const analytics = await getVideoAnalytics(accessToken, videoIds, startDate, endDate);
      return NextResponse.json({ analytics });
    }

    if (action === 'demographics') {
      const days = parseInt(searchParams.get('days') || '30');
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
      const demographics = await getAudienceDemographics(accessToken, startDate, endDate);
      return NextResponse.json({ demographics });
    }

    if (action === 'summary') {
      const summary = await getPerformanceSummary(accessToken);
      return NextResponse.json(summary);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('[YouTube API]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accessToken = (session.user as any).accessToken;
    if (!accessToken) {
      return NextResponse.json({ error: 'YouTube 접근 권한이 없습니다.' }, { status: 403 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'find_by_frame') {
      const { frameBase64 } = body;
      if (!frameBase64) {
        return NextResponse.json({ error: 'frameBase64 required' }, { status: 400 });
      }
      const result = await findYouTubeVideoByFrame(frameBase64, accessToken);
      return NextResponse.json({ result });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('[YouTube API POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
