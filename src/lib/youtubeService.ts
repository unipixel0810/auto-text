/**
 * YouTube Data & Analytics Service
 *
 * Uses OAuth access token from NextAuth session to:
 * 1. Fetch user's YouTube channel info & videos
 * 2. Get video performance metrics (views, likes, comments, watch time)
 * 3. Get audience demographics & retention data
 * 4. Cross-reference with editing data for insights
 */

import { google } from 'googleapis';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface YouTubeChannel {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  customUrl?: string;
}

export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  publishedAt: string;
  duration: string;        // ISO 8601 duration
  viewCount: number;
  likeCount: number;
  commentCount: number;
  tags?: string[];
  categoryId?: string;
}

export interface YouTubeAnalytics {
  videoId: string;
  views: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;   // seconds
  averageViewPercentage: number;
  subscribersGained: number;
  subscribersLost: number;
  likes: number;
  dislikes: number;
  shares: number;
  comments: number;
  estimatedRevenue?: number;
}

export interface AudienceDemographics {
  ageGroup: string;  // e.g., "age18-24"
  gender: string;    // "male" | "female" | "other"
  viewerPercentage: number;
}

export interface RetentionDataPoint {
  elapsedVideoTimeRatio: number;  // 0.0 ~ 1.0
  audienceWatchRatio: number;     // retention %
}

export interface YouTubePerformanceSummary {
  channel: YouTubeChannel | null;
  recentVideos: YouTubeVideo[];
  analytics: YouTubeAnalytics[];
  demographics: AudienceDemographics[];
  topPerformingVideo: YouTubeVideo | null;
  avgViewsPerVideo: number;
  avgEngagementRate: number;
  totalRevenue: number;
}

// ─── API Functions ──────────────────────────────────────────────────────────

function createOAuth2Client(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth2Client.setCredentials({ access_token: accessToken });
  return oauth2Client;
}

/** 사용자의 YouTube 채널 정보 가져오기 */
export async function getMyChannel(accessToken: string): Promise<YouTubeChannel | null> {
  const auth = createOAuth2Client(accessToken);
  const youtube = google.youtube({ version: 'v3', auth });

  try {
    const res = await youtube.channels.list({
      part: ['snippet', 'statistics'],
      mine: true,
    });

    const channel = res.data.items?.[0];
    if (!channel) return null;

    return {
      id: channel.id || '',
      title: channel.snippet?.title || '',
      description: channel.snippet?.description || '',
      thumbnailUrl: channel.snippet?.thumbnails?.default?.url || '',
      subscriberCount: parseInt(channel.statistics?.subscriberCount || '0'),
      videoCount: parseInt(channel.statistics?.videoCount || '0'),
      viewCount: parseInt(channel.statistics?.viewCount || '0'),
      customUrl: channel.snippet?.customUrl || undefined,
    };
  } catch (err) {
    console.error('[YouTube] getMyChannel error:', err);
    return null;
  }
}

/** 사용자의 최근 업로드 영상 목록 */
export async function getMyVideos(accessToken: string, maxResults = 20): Promise<YouTubeVideo[]> {
  const auth = createOAuth2Client(accessToken);
  const youtube = google.youtube({ version: 'v3', auth });

  try {
    // 1. 업로드 플레이리스트 ID 가져오기
    const channelRes = await youtube.channels.list({
      part: ['contentDetails'],
      mine: true,
    });
    const uploadsPlaylistId = channelRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) return [];

    // 2. 플레이리스트 아이템 가져오기
    const playlistRes = await youtube.playlistItems.list({
      part: ['snippet'],
      playlistId: uploadsPlaylistId,
      maxResults,
    });

    const videoIds = playlistRes.data.items
      ?.map(item => item.snippet?.resourceId?.videoId)
      .filter(Boolean) as string[];

    if (!videoIds?.length) return [];

    // 3. 영상 상세 정보 가져오기
    const videosRes = await youtube.videos.list({
      part: ['snippet', 'statistics', 'contentDetails'],
      id: videoIds,
    });

    return (videosRes.data.items || []).map(v => ({
      id: v.id || '',
      title: v.snippet?.title || '',
      description: v.snippet?.description || '',
      thumbnailUrl: v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || '',
      publishedAt: v.snippet?.publishedAt || '',
      duration: v.contentDetails?.duration || '',
      viewCount: parseInt(v.statistics?.viewCount || '0'),
      likeCount: parseInt(v.statistics?.likeCount || '0'),
      commentCount: parseInt(v.statistics?.commentCount || '0'),
      tags: v.snippet?.tags || [],
      categoryId: v.snippet?.categoryId || undefined,
    }));
  } catch (err) {
    console.error('[YouTube] getMyVideos error:', err);
    return [];
  }
}

/** YouTube Analytics — 영상별 성과 데이터 */
export async function getVideoAnalytics(
  accessToken: string,
  videoIds: string[],
  startDate: string,  // YYYY-MM-DD
  endDate: string,
): Promise<YouTubeAnalytics[]> {
  const auth = createOAuth2Client(accessToken);
  const ytAnalytics = google.youtubeAnalytics({ version: 'v2', auth });

  try {
    const res = await ytAnalytics.reports.query({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,dislikes,shares,comments,estimatedRevenue',
      dimensions: 'video',
      filters: `video==${videoIds.join(',')}`,
      sort: '-views',
    });

    return (res.data.rows || []).map((row: any[]) => ({
      videoId: row[0],
      views: row[1] || 0,
      estimatedMinutesWatched: row[2] || 0,
      averageViewDuration: row[3] || 0,
      averageViewPercentage: row[4] || 0,
      subscribersGained: row[5] || 0,
      subscribersLost: row[6] || 0,
      likes: row[7] || 0,
      dislikes: row[8] || 0,
      shares: row[9] || 0,
      comments: row[10] || 0,
      estimatedRevenue: row[11] || 0,
    }));
  } catch (err) {
    console.error('[YouTube Analytics] getVideoAnalytics error:', err);
    return [];
  }
}

/** 시청자 인구통계 (나이×성별) */
export async function getAudienceDemographics(
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<AudienceDemographics[]> {
  const auth = createOAuth2Client(accessToken);
  const ytAnalytics = google.youtubeAnalytics({ version: 'v2', auth });

  try {
    const res = await ytAnalytics.reports.query({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: 'viewerPercentage',
      dimensions: 'ageGroup,gender',
    });

    return (res.data.rows || []).map((row: any[]) => ({
      ageGroup: row[0],
      gender: row[1],
      viewerPercentage: row[2] || 0,
    }));
  } catch (err) {
    console.error('[YouTube Analytics] demographics error:', err);
    return [];
  }
}

/** Gemini Vision으로 영상 프레임에서 YouTube 영상 찾기 */
export async function findYouTubeVideoByFrame(
  frameBase64: string,
  accessToken: string,
): Promise<{ videoId: string; title: string; confidence: number } | null> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) return null;

  try {
    // 1. Gemini Vision으로 프레임 분석 → 키워드 추출
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: frameBase64,
                },
              },
              {
                text: `이 이미지는 YouTube 영상의 한 프레임입니다. 이 영상을 YouTube에서 찾기 위한 검색 키워드를 5개 추출해주세요.

출력 형식 (JSON만):
{"keywords": ["키워드1", "키워드2", "키워드3", "키워드4", "키워드5"], "description": "영상 내용 한 줄 설명"}`,
              },
            ],
          }],
        }),
      }
    );

    const geminiData = await geminiRes.json();
    const textContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // JSON 파싱
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const keywords = parsed.keywords?.join(' ') || parsed.description || '';
    if (!keywords) return null;

    // 2. YouTube 검색으로 매칭 영상 찾기
    const auth = createOAuth2Client(accessToken);
    const youtube = google.youtube({ version: 'v3', auth });

    const searchRes = await youtube.search.list({
      part: ['snippet'],
      q: keywords,
      type: ['video'],
      maxResults: 5,
      forMine: true,  // 내 채널에서만 검색
    });

    const firstResult = searchRes.data.items?.[0];
    if (!firstResult) {
      // 내 채널에 없으면 전체 검색
      const globalRes = await youtube.search.list({
        part: ['snippet'],
        q: keywords,
        type: ['video'],
        maxResults: 3,
      });
      const globalFirst = globalRes.data.items?.[0];
      if (!globalFirst) return null;
      return {
        videoId: globalFirst.id?.videoId || '',
        title: globalFirst.snippet?.title || '',
        confidence: 0.5,
      };
    }

    return {
      videoId: firstResult.id?.videoId || '',
      title: firstResult.snippet?.title || '',
      confidence: 0.8,
    };
  } catch (err) {
    console.error('[YouTube] findByFrame error:', err);
    return null;
  }
}

/** 종합 성과 요약 생성 */
export async function getPerformanceSummary(accessToken: string): Promise<YouTubePerformanceSummary> {
  const channel = await getMyChannel(accessToken);
  const videos = await getMyVideos(accessToken, 20);

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  let analytics: YouTubeAnalytics[] = [];
  let demographics: AudienceDemographics[] = [];

  if (videos.length > 0) {
    const videoIds = videos.map(v => v.id);
    analytics = await getVideoAnalytics(accessToken, videoIds, startDate, endDate);
    demographics = await getAudienceDemographics(accessToken, startDate, endDate);
  }

  const totalViews = videos.reduce((s, v) => s + v.viewCount, 0);
  const avgViews = videos.length > 0 ? totalViews / videos.length : 0;
  const totalEngagement = videos.reduce((s, v) => s + v.likeCount + v.commentCount, 0);
  const avgEngagement = totalViews > 0 ? (totalEngagement / totalViews) * 100 : 0;
  const totalRevenue = analytics.reduce((s, a) => s + (a.estimatedRevenue || 0), 0);
  const topVideo = videos.sort((a, b) => b.viewCount - a.viewCount)[0] || null;

  return {
    channel,
    recentVideos: videos,
    analytics,
    demographics,
    topPerformingVideo: topVideo,
    avgViewsPerVideo: Math.round(avgViews),
    avgEngagementRate: +avgEngagement.toFixed(2),
    totalRevenue: +totalRevenue.toFixed(2),
  };
}
