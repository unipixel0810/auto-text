import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('file') as Blob;
    
    if (!audioFile) {
      return NextResponse.json({ error: '오디오 파일이 필요합니다' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
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

