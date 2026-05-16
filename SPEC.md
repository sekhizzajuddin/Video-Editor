# Pro-Level Browser Video Editor Specification

## Project Overview
- **Name**: VidCraft Studio
- **Type**: Browser-based Video Editor WebApp
- **Core**: Professional video editing in browser with local file handling
- **Target**: Content creators wanting quick, pro-level edits without uploads

## Tech Stack
- React + Vite + TypeScript
- FFmpeg.wasm for video processing/export
- IndexedDB for project persistence
- Zustand for state management
- Framer Motion for animations

## UI/UX Specification

### Color Palette (Dark Pro Studio with Playful Accents)
- **Background Primary**: `#0D0D0F` (near black)
- **Background Secondary**: `#16161A` (dark panels)
- **Background Tertiary**: `#1F1F24` (elevated surfaces)
- **Surface**: `#252529` (cards, inputs)
- **Border**: `#2E2E34` (subtle borders)
- **Primary Accent**: `#6366F1` (indigo - main actions)
- **Secondary Accent**: `#F472B6` (pink - highlights)
- **Success**: `#10B981` (emerald)
- **Warning**: `#F59E0B` (amber)
- **Text Primary**: `#FAFAFA` (white)
- **Text Secondary**: `#A1A1AA` (gray)
- **Text Muted**: `#71717A` (dim)

### Typography
- **Font Family**: "Plus Jakarta Sans" (modern, geometric)
- **Headings**: 600 weight, tracking -0.02em
- **Body**: 400 weight
- **Monospace**: "JetBrains Mono" (for timecodes)

### Layout Structure
```
┌─────────────────────────────────────────────────────────────┐
│  HEADER (56px) - Logo, Project Name, Save/Export           │
├───────────────┬─────────────────────────┬───────────────────┤
│               │                         │                   │
│   MEDIA       │     PREVIEW CANVAS     │    INSPECTOR      │
│   PANEL       │     (16:9 aspect)      │    PANEL          │
│   (280px)     │                         │    (320px)        │
│               │                         │                   │
│               │                         │                   │
├───────────────┴─────────────────────────┴───────────────────┤
│                                                             │
│   TIMELINE (320px height)                                   │
│   - Track controls | Timeline | Playhead                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Responsive Breakpoints
- Desktop: 1440px+ (full layout)
- Tablet: 1024px-1439px (collapsible panels)
- Mobile: NOT SUPPORTED (show message)

### Components

#### Header
- Logo (left): "VidCraft" with gradient text
- Project name (center): editable inline
- Actions (right): Save Project, Export dropdown

#### Media Panel (Left)
- Import button (drag & drop zone)
- Media library grid (thumbnails)
- Tabs: Media | Audio | Text | Stickers

#### Preview Canvas (Center)
- Video preview with play controls
- Zoom controls
- Fullscreen toggle
- Current time display

#### Inspector Panel (Right)
- Context-sensitive properties
- Clip properties when selected
- Text properties when text selected
- Filter controls

#### Timeline (Bottom)
- Track headers (video, audio, text, stickers)
- Timeline ruler with time markers
- Clips as colored blocks
- Playhead (red line)
- Zoom slider

### Interactive Behaviors
- Drag clips on timeline to reorder
- Drag from media panel to timeline
- Double-click clip to open in inspector
- Keyboard shortcuts (Space=play, Delete=remove, etc.)
- Smooth animations on all transitions (200ms ease)

## Functionality Specification

### Core Features

#### 1. Media Import
- Drag & drop files onto import zone
- Accept: MP4, WebM, MOV, AVI, MP3, WAV, PNG, JPG, GIF
- Create thumbnail preview
- Add to media library
- Files stored in IndexedDB as blobs

#### 2. Timeline Editing
- Multi-track: Video, Audio, Text, Stickers
- Add clips by dragging from media
- Trim by dragging clip edges
- Split at playhead (S key)
- Delete selected clips (Delete key)
- Drag to reorder

#### 3. Text Overlays
- Add text layer from panel
- Edit text content inline
- Font selection
- Color picker
- Size slider
- Position (drag on canvas)
- Duration on timeline

#### 4. Filters & Color
- Brightness (-100 to +100)
- Contrast (-100 to +100)
- Saturation (-100 to +100)
- Preset filters (None, Vintage, Cool, Warm, B&W)

#### 5. Transitions
- Fade in/out
- Dissolve
- Crossfade between clips

#### 6. Speed Control
- Speed multiplier: 0.25x, 0.5x, 1x, 1.5x, 2x
- Duration adjusts accordingly

#### 7. Audio Mixing
- Volume control per clip (0-200%)
- Mute toggle
- Background music track

#### 8. Stickers/Emojis
- Emoji picker panel
- Drag stickers onto canvas
- Resize and position
- Duration on timeline

#### 9. Export
- WebM (native, fast, client-side)
- MP4 (via FFmpeg.wasm, heavier)
- Resolution: 720p, 1080p, 4K
- Progress indicator

### Project Save/Load
- Auto-save to IndexedDB
- Save to MongoDB (optional, requires login)
- Load previous projects

### Keyboard Shortcuts
- Space: Play/Pause
- S: Split clip at playhead
- Delete: Remove selected
- Ctrl+Z: Undo
- Ctrl+Shift+Z: Redo
- Ctrl+S: Save project

## Acceptance Criteria

1. ✓ User can import local video/audio/image files
2. ✓ Files appear in media library with thumbnails
3. ✓ User can drag media onto timeline tracks
4. ✓ Timeline shows multiple tracks with clips
5. ✓ User can trim clips by dragging edges
6. ✓ User can split clips at playhead position
7. ✓ User can add text overlays with styling
8. ✓ User can apply color adjustments to clips
9. ✓ User can add transitions between clips
10. ✓ User can adjust speed of clips
11. ✓ User can control audio volume
12. ✓ User can add stickers/emojis
13. ✓ Preview plays edited timeline
14. ✓ Export produces downloadable video file
15. ✓ Project can be saved and loaded
16. ✓ UI is dark, professional, responsive
17. ✓ Can deploy to Vercel without errors