import type { TranscriptItem } from '@/types/subtitle';

// Parse SRT timestamp "HH:MM:SS,mmm" to seconds
function parseSrtTime(s: string): number {
  const [hms, ms] = s.trim().split(',');
  const [h, m, sec] = hms.split(':').map(Number);
  return h * 3600 + m * 60 + sec + (parseInt(ms || '0') / 1000);
}

// Parse ASS timestamp "H:MM:SS.cc" to seconds
function parseAssTime(s: string): number {
  const parts = s.trim().split(':');
  const h = parseInt(parts[0]);
  const m = parseInt(parts[1]);
  const secParts = parts[2].split('.');
  const sec = parseInt(secParts[0]);
  const cs = parseInt(secParts[1] || '0');
  return h * 3600 + m * 60 + sec + cs / 100;
}

// Strip ASS style tags like {\b1}, {\c&H0000FF&}, etc.
function stripAssTags(text: string): string {
  return text.replace(/\{[^}]*\}/g, '').replace(/\\N/g, '\n').replace(/\\n/g, '\n').trim();
}

export function parseSRT(content: string): TranscriptItem[] {
  const items: TranscriptItem[] = [];
  const blocks = content.trim().split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;
    const timeLine = lines[1];
    const match = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
    if (!match) continue;
    const startTime = parseSrtTime(match[1]);
    const endTime = parseSrtTime(match[2]);
    const text = lines.slice(2).join('\n').replace(/<[^>]+>/g, '').trim();
    items.push({
      id: `srt_${items.length}_${Date.now()}`,
      startTime,
      endTime,
      originalText: text,
      editedText: text,
      isEdited: false,
    });
  }
  return items;
}

export function parseASS(content: string): TranscriptItem[] {
  const items: TranscriptItem[] = [];
  const lines = content.split('\n');
  let inEvents = false;
  let formatFields: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '[Events]') { inEvents = true; continue; }
    if (trimmed.startsWith('[') && trimmed !== '[Events]') { inEvents = false; continue; }
    if (!inEvents) continue;

    if (trimmed.startsWith('Format:')) {
      formatFields = trimmed.replace('Format:', '').split(',').map(f => f.trim().toLowerCase());
      continue;
    }

    if (trimmed.startsWith('Dialogue:')) {
      const data = trimmed.replace('Dialogue:', '').trim();
      const parts = data.split(',');
      if (parts.length < formatFields.length) continue;

      const startIdx = formatFields.indexOf('start');
      const endIdx = formatFields.indexOf('end');
      const textIdx = formatFields.indexOf('text');

      if (startIdx === -1 || endIdx === -1 || textIdx === -1) continue;

      const startTime = parseAssTime(parts[startIdx]);
      const endTime = parseAssTime(parts[endIdx]);
      // Text field is everything from textIdx onwards (may contain commas)
      const rawText = parts.slice(textIdx).join(',');
      const text = stripAssTags(rawText);

      items.push({
        id: `ass_${items.length}_${Date.now()}`,
        startTime,
        endTime,
        originalText: text,
        editedText: text,
        isEdited: false,
      });
    }
  }
  return items;
}

export function parseSubtitleFile(file: File): Promise<TranscriptItem[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) { resolve([]); return; }
      const ext = file.name.toLowerCase().split('.').pop();
      if (ext === 'srt') resolve(parseSRT(content));
      else if (ext === 'ass' || ext === 'ssa') resolve(parseASS(content));
      else reject(new Error('Unsupported subtitle format'));
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsText(file);
  });
}
