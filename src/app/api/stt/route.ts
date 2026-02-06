import { NextRequest, NextResponse } from 'next/server';

// Vercel 서버리스 함수 설정
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    console.log('[STT] 요청 받음');
    
    const formData = await request.formData();
    const audioFile = formData.get('file') as Blob;
    
    if (!audioFile) {
      console.log('[STT] 오디오 파일 없음');
      return NextResponse.json({ error: '오디오 파일이 필요합니다' }, { status: 400 });
    }

    console.log('[STT] 파일 크기:', audioFile.size, 'bytes');
    
    // 파일 크기 체크 (25MB 제한)
    if (audioFile.size > 25 * 1024 * 1024) {
      return NextResponse.json({ 
        error: `파일이 너무 큽니다 (${(audioFile.size / 1024 / 1024).toFixed(1)}MB). 25MB 이하로 업로드해주세요.` 
      }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.log('[STT] API 키 없음');
      return NextResponse.json({ error: 'OpenAI API 키가 설정되지 않았습니다' }, { status: 500 });
    }

    // OpenAI Whisper API 호출
    const whisperFormData = new FormData();
    whisperFormData.append('file', audioFile, 'audio.webm');
    whisperFormData.append('model', 'whisper-1');
    whisperFormData.append('language', 'ko');
    whisperFormData.append('response_format', 'verbose_json');
    whisperFormData.append('timestamp_granularities[]', 'segment');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: whisperFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API 에러:', errorText);
      return NextResponse.json({ error: `OpenAI API 에러: ${response.status}` }, { status: response.status });
    }

    const result = await response.json();
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('STT 처리 에러:', error);
    return NextResponse.json({ error: '음성 인식 처리 중 오류가 발생했습니다' }, { status: 500 });
  }
}

