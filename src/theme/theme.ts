/**
 * Global Theme Configuration
 * Based on Stitch CapCut-style Video Editor Design
 */

export const theme = {
  colors: {
    background: {
      primary: '#1E1E1E',      // Main dark gray background
      secondary: '#252525',    // Slightly lighter for panels
      canvas: '#000000',       // Black for video player
      button: {
        default: '#2A2A2A',    // Dark gray buttons
        primary: '#4A9EFF',    // Light blue buttons (Stitch uses #4da0ff)
        hover: '#5AAFFF',      // Hover state
      },
    },
    text: {
      primary: '#FFFFFF',      // White text
      secondary: '#A0A0A0',    // Light gray text (Stitch uses #A0A0A0)
      muted: '#808080',        // Muted gray text
    },
    accent: {
      blue: '#4da0ff',         // Light blue accent (Stitch primary)
      underline: '#4da0ff',    // Tab underline
    },
    border: {
      default: '#333333',      // Subtle borders (Stitch uses #333333)
      separator: '#2A2A2A',    // Separator lines
    },
  },
  typography: {
    fontFamily: {
      sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      display: ['Inter', 'sans-serif'],
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
    primary: '0 0 20px rgba(77, 160, 255, 0.2)',
  },
  zIndex: {
    base: 0,
    dropdown: 100,
    sticky: 200,
    modal: 300,
    tooltip: 400,
  },
  layout: {
    headerHeight: '48px',      // h-12 = 48px
    secondaryToolbarHeight: '48px',
    sidebarWidth: '320px',    // w-80 = 320px
    rightSidebarWidth: '288px', // w-72 = 288px
    timelineHeight: '256px',   // h-64 = 256px
  },
} as const;

export type Theme = typeof theme;
