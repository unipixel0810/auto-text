# CapCut-Style Video Editor UI Recreation Prompt

## Objective
Recreate the exact UI shown in the provided image as a fully functional React/Next.js application. This is a pixel-perfect recreation, not inspiration. Match every detail: layout, spacing, typography, colors, component shapes, and visual hierarchy exactly as shown.

## Technical Requirements

### Architecture
- Use strict Object-Oriented Programming (OOP) principles
- Break UI into clean, reusable, well-structured components
- Implement a single global theme file (`src/theme/theme.ts` or `src/styles/theme.ts`) containing:
  - All color definitions (no hardcoded colors in components)
  - All font families, sizes, weights, line heights
  - All spacing values (margins, paddings, gaps)
  - All border radius values
  - All shadow definitions
  - All z-index values
- Components must import from theme file only—no inline styles or hardcoded values
- Use TypeScript with strict typing
- Implement proper state management (React Context or Zustand)
- Ensure proper navigation and routing
- All interactions must be functional and reflect design intent

### Performance & Maintainability
- Optimize component rendering (use React.memo where appropriate)
- Implement code splitting for large components
- Follow clean code principles
- Add proper TypeScript interfaces for all props and state
- Include JSDoc comments for complex components

## UI Structure Breakdown

### 1. Top Menu Bar (Header Component)
**Location:** Fixed at top, full width
**Background:** Dark gray (#1E1E1E or similar)
**Height:** ~48-56px

**Left Section:**
- macOS traffic light buttons (red, yellow, green) - decorative only
- Application title: "0213 (2)" - centered, white text, sans-serif

**Right Section:**
- Three small light gray icons (indistinct)
- "Pro" badge: rounded rectangle, light blue background (#4A9EFF or similar), white "Pro" text
- "공유" (Share) button: rounded rectangle, dark gray background, white text
- "게시" (Publish) button: rounded rectangle, dark gray background, white text  
- "내보내기" (Export) button: rounded rectangle, light blue background, white text, upward arrow icon on left
- User profile icon: light gray
- Notification bell icon: light gray
- Plus/square icon: light gray

**Typography:** All text white/light gray, sans-serif, consistent sizing

### 2. Left Sidebar (Media Panel Component)
**Width:** ~280-320px
**Background:** Dark gray (same as main background)
**Height:** Full viewport height minus header

**Top Tab Navigation:**
- Horizontal row of 9 tabs with icons and text
- Selected tab ("미디어" - Media): light blue underline, white icon and text
- Unselected tabs ("오디오", "텍스트", "스티커", "편집효과", "전환", "캡션", "필터", "조정"): light gray icons and text
- Right arrow icon indicating more tabs off-screen
- Tab height: ~40-48px
- Spacing between tabs: consistent

**Import Section:**
- Header: "가져오기" (Import) in white, medium size, with blue down caret icon
- Drag-and-drop area: large rounded rectangle, slightly lighter dark gray background
  - Large light blue plus icon
  - "가져오기" (Import) text in white
  - Helper text: "여기로 동영상, 사진, 오디오 파일을 끌어다 놓으세요" in light gray, smaller
  - Border: subtle, rounded corners (~8px radius)
  - Padding: generous (~24px)

**Category List:**
- Expandable list items: "미디어", "하위 프로젝트", "내 보관함", "AI 미디어", "공간", "라이브러리", "Dreamina"
- White text, sans-serif
- Light gray dropdown arrow icon on right of each
- Consistent vertical spacing (~8-12px between items)

**Bottom Action Bar:**
- Thin horizontal separator line
- Prompt text: "미디어가 없나요? 이 도구로 만들어 보세요" in light gray, small
- Three square buttons with rounded corners:
  - "AI 미디어": camera icon with plus sign
  - "AI 아바타": person icon with plus sign
  - "녹화": record icon (red circle in square outline)
- Buttons: slightly lighter dark gray background, light gray icons, white text
- Button size: ~64-72px square
- Spacing between buttons: ~12px

### 3. Central Canvas/Player Area (Player Component)
**Location:** Center, between sidebars
**Background:** Black (#000000)
**Aspect Ratio:** Maintain 16:9 or similar

**Header:**
- "플레이어" (Player) text in white, top-left of section
- Font: sans-serif, medium size

**Main Display:**
- Large black rectangle (video canvas)
- Empty state shown in image
- Full width/height of available space

**Playback Controls:**
- Time display: "00:00:00:00 / 00:00:00:00" in light gray, thin horizontal bar
- Toolbar with icons: play, stop, skip forward/back, zoom controls
- "수정하기" (Edit) button on far right: dark gray background, white text
- Icon size: ~20-24px
- Spacing: consistent horizontal gaps

### 4. Right Sidebar (Details Panel Component)
**Width:** ~280-320px
**Background:** Dark gray (same as main)
**Height:** Full viewport height minus header

**Header:**
- "세부 정보" (Details) in white, sans-serif
- Hamburger menu icon (three horizontal lines) on left

**Content Area:**
- Key-value pairs displayed vertically
- Labels (left): "이름:", "경로:", "가로 세로 비율:", "해상도:", "프레임 속도:", "가져온 미디어:", "프록시:", "레이어 배치:"
- Values (right): Corresponding project data
- White text, sans-serif
- Consistent row spacing (~16-20px)
- Small light gray 'i' icons next to "프록시" and "레이어 배치" (info tooltips)

**Typography:** Labels and values both white, slight size/weight variation for hierarchy

### 5. Bottom Timeline/Toolbar (Timeline Component)
**Height:** ~200-240px
**Background:** Dark gray (same as main)

**Top Toolbar:**
- Horizontal row of light gray icons
- Left: dropdown arrow, undo, redo, cut, copy, paste, delete, split
- Right: zoom in/out, snapping toggle, audio level controls
- Icon size: ~20-24px
- Spacing: consistent horizontal gaps (~8-12px)

**Timeline Area:**
- Large dark gray rectangle
- Subtle horizontal dotted lines (track lanes)
- Empty state: "여기로 자료를 드래그하여 만들기 시작" centered in light gray
- Border: subtle top border separating from toolbar

## Theme File Structure

Create `src/theme/theme.ts` with:

```typescript
export const theme = {
  colors: {
    background: {
      primary: '#1E1E1E',      // Main dark gray background
      secondary: '#252525',    // Slightly lighter for panels
      canvas: '#000000',       // Black for video player
      button: {
        default: '#2A2A2A',    // Dark gray buttons
        primary: '#4A9EFF',    // Light blue buttons
        hover: '#5AAFFF',      // Hover state
      },
    },
    text: {
      primary: '#FFFFFF',      // White text
      secondary: '#B0B0B0',    // Light gray text
      muted: '#808080',        // Muted gray text
    },
    accent: {
      blue: '#4A9EFF',         // Light blue accent
      underline: '#4A9EFF',    // Tab underline
    },
    border: {
      default: '#3A3A3A',      // Subtle borders
      separator: '#2A2A2A',    // Separator lines
    },
  },
  typography: {
    fontFamily: {
      sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
    },
    fontSize: {
      xs: '11px',
      sm: '12px',
      base: '14px',
      md: '16px',
      lg: '18px',
      xl: '20px',
      '2xl': '24px',
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.75,
    },
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    '2xl': '32px',
    '3xl': '48px',
  },
  borderRadius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    full: '9999px',
  },
  shadows: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
    md: '0 4px 6px rgba(0, 0, 0, 0.4)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.5)',
  },
  zIndex: {
    base: 0,
    dropdown: 100,
    sticky: 200,
    modal: 300,
    tooltip: 400,
  },
  layout: {
    headerHeight: '56px',
    sidebarWidth: '300px',
    timelineHeight: '220px',
  },
};
```

## Component Structure

```
src/
├── components/
│   ├── layout/
│   │   ├── Header.tsx
│   │   ├── LeftSidebar.tsx
│   │   ├── RightSidebar.tsx
│   │   ├── Timeline.tsx
│   │   └── Player.tsx
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Tab.tsx
│   │   ├── Icon.tsx
│   │   ├── DragDropArea.tsx
│   │   └── PropertyRow.tsx
│   └── common/
│       └── Separator.tsx
├── theme/
│   └── theme.ts
├── hooks/
│   ├── useTheme.ts
│   └── useMedia.ts
├── types/
│   └── index.ts
└── app/
    └── page.tsx
```

## Functional Requirements

1. **Drag and Drop:**
   - Import area must accept video, image, and audio files
   - Timeline must accept dragged media items
   - Visual feedback during drag operations

2. **Tab Navigation:**
   - Clicking tabs switches content in left sidebar
   - Selected state with blue underline
   - Smooth transitions

3. **Player Controls:**
   - Play/pause functionality
   - Timeline scrubbing
   - Time display updates

4. **Property Panel:**
   - Displays current project/selection properties
   - Info tooltips on hover for 'i' icons
   - Editable name field

5. **Timeline:**
   - Multiple track support (visual lanes)
   - Drag to reorder clips
   - Zoom controls functional
   - Snapping toggle functional

6. **Buttons:**
   - Share: opens share dialog
   - Publish: opens publish dialog
   - Export: opens export dialog
   - AI Media/Avatar/Record: open respective creation modals

## Asset Generation

For any missing assets (icons, images, avatars):
- Generate SVG icons matching the line-art style shown
- Use light gray (#B0B0B0) for default icons
- Use light blue (#4A9EFF) for active/selected states
- Use white (#FFFFFF) for icons on colored backgrounds
- Maintain consistent stroke width (~1.5-2px)
- Simple, minimal design matching the UI aesthetic

## Implementation Notes

- Use CSS Modules or styled-components with theme injection
- Ensure responsive behavior maintains layout integrity
- Add smooth transitions for state changes (200-300ms)
- Implement proper focus states for accessibility
- Add keyboard navigation support
- Ensure all text is selectable where appropriate
- Maintain exact spacing and alignment from image

## Deliverables

1. Complete React/Next.js application
2. All components properly typed with TypeScript
3. Theme file with all design tokens
4. Functional interactions matching design intent
5. Auto-generated assets for any missing icons/images
6. Clean, maintainable, well-documented code
7. README with setup instructions

## Quality Checklist

- [ ] No hardcoded colors, fonts, or spacing values
- [ ] All components use theme file
- [ ] OOP principles followed throughout
- [ ] Components are reusable and well-structured
- [ ] TypeScript strict mode enabled
- [ ] All interactions functional
- [ ] Layout matches image exactly
- [ ] Missing assets auto-generated
- [ ] Performance optimized
- [ ] Code is clean and maintainable
