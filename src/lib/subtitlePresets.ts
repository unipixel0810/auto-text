// Subtitle Style Presets for CapCut-style editor
export interface SubtitlePreset {
  id: number;
  name: string;
  color: string;
  backgroundColor: string;
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  glowColor?: string;
  borderColor?: string;
  borderWidth?: number;
  fontWeight?: number;
}

export const SUBTITLE_PRESETS: SubtitlePreset[] = [
  // Row 1: ✕(none) | dark+shadow | Aa white | dark+shadow2 | Aa white2
  // 0. None
  { id: 0, name: 'None', color: '#FFFFFF', backgroundColor: 'transparent', strokeColor: '#000000', strokeWidth: 0, shadowColor: 'transparent', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 },
  // 1. White text, black outline
  { id: 1, name: 'White/Black Outline', color: '#FFFFFF', backgroundColor: 'transparent', strokeColor: '#000000', strokeWidth: 4, shadowColor: 'transparent', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, fontWeight: 700 },
  // 2. White text, dark shadow
  { id: 2, name: 'White/Dark Shadow', color: '#FFFFFF', backgroundColor: 'transparent', strokeColor: 'transparent', strokeWidth: 0, shadowColor: 'rgba(0,0,0,0.8)', shadowBlur: 6, shadowOffsetX: 2, shadowOffsetY: 2 },
  // 3. White text, gray outline
  { id: 3, name: 'White/Gray Outline', color: '#FFFFFF', backgroundColor: 'transparent', strokeColor: '#555555', strokeWidth: 3, shadowColor: 'transparent', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 },
  // 4. White text, white glow
  { id: 4, name: 'White/White Glow', color: '#FFFFFF', backgroundColor: 'transparent', strokeColor: 'transparent', strokeWidth: 0, shadowColor: 'rgba(255,255,255,0.6)', shadowBlur: 8, shadowOffsetX: 0, shadowOffsetY: 0 },

  // Row 2: gray bg | light gray bg | yellow bg | purple bg | purple+outline
  // 5. Gray BG
  { id: 5, name: 'Gray BG', color: '#222222', backgroundColor: '#AAAAAA', strokeColor: 'transparent', strokeWidth: 0, shadowColor: 'transparent', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 },
  // 6. Light gray BG
  { id: 6, name: 'Light Gray BG', color: '#222222', backgroundColor: '#CCCCCC', strokeColor: 'transparent', strokeWidth: 0, shadowColor: 'transparent', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 },
  // 7. Yellow BG
  { id: 7, name: 'Yellow BG', color: '#000000', backgroundColor: '#FFE066', strokeColor: 'transparent', strokeWidth: 0, shadowColor: 'transparent', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 },
  // 8. Purple BG
  { id: 8, name: 'Purple BG', color: '#FFFFFF', backgroundColor: '#9B59B6', strokeColor: 'transparent', strokeWidth: 0, shadowColor: 'transparent', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 },
  // 9. Purple BG + yellow text
  { id: 9, name: 'Purple/Yellow', color: '#FFE066', backgroundColor: '#9B59B6', strokeColor: 'transparent', strokeWidth: 0, shadowColor: 'transparent', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 },

  // Row 3: white bg | cyan border+black bg | black bg+green | black bg+gray | black bg+gold
  // 10. White BG
  { id: 10, name: 'White BG', color: '#000000', backgroundColor: '#FFFFFF', strokeColor: 'transparent', strokeWidth: 0, shadowColor: 'transparent', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 },
  // 11. Cyan border box
  { id: 11, name: 'Cyan Border', color: '#FFFFFF', backgroundColor: '#000000', strokeColor: 'transparent', strokeWidth: 0, shadowColor: 'transparent', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, borderColor: '#00D4D4', borderWidth: 3 },
  // 12. Black BG + green text
  { id: 12, name: 'Black/Green', color: '#50FF50', backgroundColor: '#000000', strokeColor: 'transparent', strokeWidth: 0, shadowColor: 'transparent', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 },
  // 13. Black BG + gray text
  { id: 13, name: 'Black/Gray', color: '#AAAAAA', backgroundColor: 'rgba(0,0,0,0.7)', strokeColor: 'transparent', strokeWidth: 0, shadowColor: 'transparent', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 },
  // 14. Gold text
  { id: 14, name: 'Gold', color: '#FFD700', backgroundColor: 'transparent', strokeColor: '#AA6C00', strokeWidth: 2, shadowColor: 'rgba(255,215,0,0.5)', shadowBlur: 4, shadowOffsetX: 0, shadowOffsetY: 0 },

  // Row 4: red glow | yellow glow | green glow
  // 15. Red glow
  { id: 15, name: 'Red Glow', color: '#FF4444', backgroundColor: 'transparent', strokeColor: 'transparent', strokeWidth: 0, shadowColor: 'rgba(255,68,68,0.8)', shadowBlur: 12, shadowOffsetX: 0, shadowOffsetY: 0, glowColor: '#FF4444' },
  // 16. Yellow glow
  { id: 16, name: 'Yellow Glow', color: '#FFE066', backgroundColor: '#000000', strokeColor: 'transparent', strokeWidth: 0, shadowColor: 'rgba(255,224,102,0.8)', shadowBlur: 15, shadowOffsetX: 0, shadowOffsetY: 0, glowColor: '#FFE066' },
  // 17. Green glow
  { id: 17, name: 'Green Glow', color: '#50FF50', backgroundColor: '#000000', strokeColor: 'transparent', strokeWidth: 0, shadowColor: 'rgba(80,255,80,0.8)', shadowBlur: 15, shadowOffsetX: 0, shadowOffsetY: 0, glowColor: '#50FF50' },
];
