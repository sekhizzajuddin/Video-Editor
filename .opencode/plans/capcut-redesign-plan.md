# VidForge Pro → Professional Video Editor
## Complete Redesign & Logic Fix Plan

---

## PROBLEM ANALYSIS

### Current UI Issues (from screenshot):
1. **Left sidebar icons too large** — 24px icons with labels, takes 70px width unnecessarily
2. **Asset library too wide** — 280px wastes horizontal space
3. **Preview canvas too small** — centered with massive dead space on all sides
4. **Inspector panel dead space** — 300px wide showing only "Select a clip..." placeholder
5. **Timeline too short** — 38vh is not enough for comfortable editing
6. **Track headers cramped** — icons too small, hard to click
7. **No visual hierarchy** — everything has similar visual weight
8. **Toolbar cluttered** — too many buttons in timeline toolbar
9. **No panel resizing** — fixed widths don't adapt to screen size
10. **Color scheme inconsistent** — doesn't match professional editor standards

### Current Logic Issues:
1. **Clip dragging janky** — no smooth visual feedback during drag
2. **Trim handles too small** — 6px zone is hard to grab
3. **Transitions hard to apply** — drag-drop is unintuitive
4. **Audio playback desync** — clips don't play in sync during preview
5. **Split at playhead unreliable** — edge cases not handled
6. **Multi-select broken** — selection box doesn't work properly
7. **Undo/redo incomplete** — not all actions are tracked
8. **Export quality poor** — doesn't match preview

---

## PHASE 1: CapCut-Style Layout Redesign

### 1.1 New Layout Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TOP BAR (48px) — Logo | Project Name | Undo/Redo | Layout | Export         │
├──────────┬──────────────────────────────┬───────────────────────────────────┤
│          │                              │                                   │
│  LEFT    │       CENTER PANEL           │        RIGHT PANEL                │
│  SIDEBAR │       (Preview)              │        (Inspector)                │
│  (52px)  │       (flexible)             │        (300px)                    │
│          │                              │                                   │
│  [Media] │    ┌────────────────────┐    │  ┌─ Video ────────────────────┐  │
│  [Text]  │    │                    │    │  │ Transform                   │  │
│  [Sticker│    │   PREVIEW CANVAS   │    │  │ Scale: [████████] 1.00      │  │
│  [Shapes]│    │                    │    │  │ Position X: [████] 0        │  │
│  [Effects│    │                    │    │  │ Position Y: [████] 0        │  │
│  [Audio] │    │                    │    │  │ Rotation: [████] 0°         │  │
│          │    └────────────────────┘    │  │                             │  │
│          │                              │  │ ── Audio ─────────────────  │  │
│          │    [◀◀] [▶] [▶▶]            │  │ Volume: [████████] 100%     │  │
│          │    00:01.17 / 00:10.00       │  │ Fade In: [____] 0.0s        │  │
│          │                              │  │ Fade Out: [____] 0.0s       │  │
│          │                              │  │                             │  │
│          │                              │  │ ── Filters ───────────────  │  │
│          │                              │  │ [None][B&W][Sepia][Warm]   │  │
│          │                              │  │ Brightness: [████] 0        │  │
│          │                              │  │ Contrast: [████] 0          │  │
│          │                              │  │ Saturation: [████] 0        │  │
│          │                              │  └─────────────────────────────┘  │
├──────────┴──────────────────────────────┴───────────────────────────────────┤
│  TIMELINE TOOLBAR (36px) — Split | Delete | Marker | +V +A +T | Zoom        │
├─────────────────────────────────────────────────────────────────────────────┤
│  TIMELINE (280px min, resizable)                                            │
│  ┌──────┬──────────────────────────────────────────────────────────────────┐│
│  │Track │  00:00    00:02    00:04    00:06    00:08    00:10             ││
│  ├──────┼──────────────────────────────────────────────────────────────────┤│
│  │ V1   │  [████████████████████████]  [████████████]                      ││
│  │      │  clip1.mp4                 clip2.mp4                             ││
│  ├──────┼──────────────────────────────────────────────────────────────────┤│
│  │ A1   │  [████████████████████████████████████████████████████████]      ││
│  │      │  music.mp3                                                         ││
│  ├──────┼──────────────────────────────────────────────────────────────────┤│
│  │ T1   │           [████████████]                                          ││
│  │      │           "Title Text"                                            ││
│  └──────┴──────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Exact Proportions (CapCut-style)

| Panel | Width | Height | Notes |
|-------|-------|--------|-------|
| Top Bar | 100% | 48px | Fixed |
| Left Sidebar | 52px | flex | Icon-only, no labels |
| Asset Library | 260px | flex | Collapsible |
| Preview Canvas | flex (max 800px) | flex | Centered, aspect-ratio locked |
| Inspector Panel | 280px | flex | Collapsible when empty |
| Timeline Toolbar | 100% | 36px | Fixed |
| Timeline | 100% | 280px min | Resizable, default 35vh |

### 1.3 Color Scheme (CapCut Professional Dark)

```css
--bg-deepest: #0d0d0d;      /* Timeline track areas */
--bg-primary: #141414;       /* Main background */
--bg-secondary: #1e1e1e;     /* Panels */
--bg-tertiary: #2a2a2a;      /* Cards, inputs */
--bg-hover: #333333;         /* Hover states */
--bg-active: #3a3a3a;        /* Active/selected */
--border: #2d2d2d;           /* Dividers */
--border-light: #3d3d3d;     /* Subtle borders */
--text-primary: #ffffff;     /* Main text */
--text-secondary: #a0a0a0;   /* Labels, hints */
--text-dim: #666666;         /* Disabled, placeholders */
--accent: #00d4ff;           /* Primary accent (cyan) */
--accent-hover: #00b8e6;     /* Accent hover */
--accent-dim: #0099cc;       /* Dimmed accent */
--playhead: #ff3b3b;         /* Timeline playhead (red) */
--selection: #00b4d8;        /* Clip selection border */
--video-track: #3b82f6;      /* Video track color */
--audio-track: #22c55e;      /* Audio track color */
--text-track: #a855f7;       /* Text track color */
--sticker-track: #f59e0b;    /* Sticker track color */
--danger: #ef4444;           /* Delete, errors */
--success: #22c55e;          /* Success states */
```

### 1.4 Files to Modify for Layout

| File | Changes |
|------|---------|
| `src/index.css` | Complete rewrite of all layout CSS |
| `src/App.tsx` | Restructure component layout |
| `src/components/Header.tsx` | Slimmer design, CapCut-style |
| `src/components/LeftSidebar.tsx` | Icon-only, 52px width |
| `src/components/AssetLibrary.tsx` | 260px, better grid |
| `src/components/PreviewCanvas.tsx` | Larger, centered, better controls |
| `src/components/InspectorPanel.tsx` | Better empty state, organized sections |
| `src/components/Timeline.tsx` | Taller, better track headers |

---

## PHASE 2: Editing Logic Fixes

### 2.1 Clip Manipulation

| Feature | Current State | Fix Required |
|---------|--------------|--------------|
| Drag to move | Works but janky | Smooth 60fps drag with ghost preview |
| Trim start/end | 6px zone too small | 12px zone with visual cursor change |
| Cross-track drag | Loses clip on cancel | Already fixed with pendingDrag |
| Multi-select | Selection box broken | Fix coordinate calculation |
| Ripple delete | Works | Already fixed |
| Split at playhead | Edge cases fail | Add validation, show split preview |

### 2.2 Timeline Interactions

| Feature | Current State | Fix Required |
|---------|--------------|--------------|
| Playhead click | Works | Add smooth animation |
| Ruler click | Works | Add snap indicator |
| Zoom (Ctrl+Scroll) | Works | Add visual zoom indicator |
| Pan (Shift+Scroll) | Works | Add scroll inertia |
| Track resize | Not implemented | Add drag handles between tracks |
| Track reorder | Not implemented | Add drag to reorder |

### 2.3 Audio

| Feature | Current State | Fix Required |
|---------|--------------|--------------|
| Playback sync | Desync issues | Already partially fixed |
| Volume per clip | Works | Add visual volume indicator |
| Fade in/out | Data exists, no UI | Add inspector controls (done) |
| Audio waveform | Generated | Render in timeline (works) |
| Mute solo | UI exists | Implement solo logic |

### 2.4 Transitions

| Feature | Current State | Fix Required |
|---------|--------------|--------------|
| Apply transition | Drag-drop only | Add click-to-apply from inspector |
| Transition preview | Works in render | Add preview in timeline |
| Transition duration | Fixed 0.3s | Make configurable per transition |
| Transition direction | Some have direction | Add direction toggle |

### 2.5 Export

| Feature | Current State | Fix Required |
|---------|--------------|--------------|
| Filter parity | Fixed | Already done |
| Transition parity | Fixed | Already done |
| Audio mixing | Fixed | Already done |
| Chroma key in export | Fixed | Already done |
| Export speed | Slow (frame-by-frame) | Optimize with WebCodecs |

---

## PHASE 3: Professional Features

### 3.1 Must-Have (CapCut Parity)

1. **Magnetic Timeline Toggle** — Clips auto-snap together like CapCut's main track
2. **Link/Unlink Audio-Video** — Toggle linking between video and its audio
3. **Speed Presets** — 0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x quick buttons
4. **Freeze Frame** — Actually create a still frame clip
5. **Reverse Clip** — Actually reverse video playback
6. **Clip Opacity in Timeline** — Visual indication of opacity
7. **Timeline Markers with Labels** — Click to edit marker name/color
8. **Fit to Screen Zoom** — One-click fit timeline to viewport
9. **Keyboard Shortcut Overlay** — Show shortcuts on hover
10. **Export Progress with ETA** — Realistic time remaining

### 3.2 Nice-to-Have

11. **Clip Color Labels** — Right-click → label color
12. **Track Color Customization** — Per-track color picker
13. **Project Settings Panel** — FPS, resolution, aspect ratio
14. **Media Search/Filter** — Search imported media by name
15. **Drag to Reorder Tracks** — Visual track reordering
16. **Timeline Ruler Sub-frames** — Show frame numbers at high zoom
17. **Clip Thumbnail on Hover** — Show frame at hover position
18. **Audio Level Meter** — Real-time audio level display
19. **Safe Area Guides** — Toggle rule-of-thirds overlay
20. **Export Presets** — YouTube, TikTok, Instagram presets

---

## PHASE 4: Implementation Order

### Sprint 1: Layout Foundation (2-3 days)
1. Rewrite `index.css` with CapCut color scheme and layout
2. Resize all panels to correct proportions
3. Make left sidebar icon-only (52px)
4. Make inspector panel collapsible when empty
5. Increase timeline height to 35vh minimum

### Sprint 2: Inspector Panel Redesign (1-2 days)
6. Redesign inspector with CapCut-style sections
7. Add alignment buttons (top bar of inspector)
8. Add keyframe diamond buttons next to each property
9. Organize properties into collapsible sections
10. Better empty state with project settings

### Sprint 3: Timeline Improvements (2-3 days)
11. Increase track height to 64px (video), 48px (audio)
12. Better track header design with proper icons
13. Add track resize handles
14. Add magnetic timeline toggle
15. Add link/unlink toggle

### Sprint 4: Editing Logic Fixes (2-3 days)
16. Fix multi-select selection box
17. Improve trim handle grab zone (12px)
18. Add split preview line
19. Fix audio playback sync completely
20. Implement solo track logic

### Sprint 5: Polish & Features (2-3 days)
21. Add speed preset buttons
22. Implement true freeze frame
23. Implement true reverse playback
24. Add export presets (YouTube, TikTok, etc.)
25. Add safe area guides toggle

### Sprint 6: Performance (1-2 days)
26. Virtualize timeline (only render visible clips)
27. Optimize canvas rendering
28. Add FPS counter for debug
29. Optimize media thumbnail generation
30. Add loading states for all async operations

---

## DETAILED CSS CHANGES

### Current → New Layout CSS Mapping

| Current Class | New Class | Changes |
|--------------|-----------|---------|
| `.navbar` | `.top-bar` | Slimmer, CapCut colors |
| `.left-sidebar` | `.tool-sidebar` | 52px, icon-only |
| `.asset-library` | `.asset-panel` | 260px, better grid |
| `.preview-player` | `.preview-area` | Larger, centered |
| `.inspector-panel` | `.inspector-panel` | Collapsible, organized |
| `.timeline-section` | `.timeline-area` | 35vh, taller tracks |

### Key CSS Variables to Add

```css
:root {
  --sidebar-w: 52px;
  --asset-w: 260px;
  --inspector-w: 280px;
  --topbar-h: 48px;
  --timeline-toolbar-h: 36px;
  --timeline-min-h: 280px;
  --track-h-video: 64px;
  --track-h-audio: 48px;
  --track-h-text: 40px;
  --track-h-sticker: 40px;
  --border-radius: 8px;
  --border-radius-sm: 4px;
  --transition-fast: 100ms ease;
  --transition-normal: 200ms ease;
}
```

---

## FILES TO CREATE

| File | Purpose |
|------|---------|
| `src/components/InspectorHeader.tsx` | Alignment buttons, keyframe toggle |
| `src/components/InspectorSection.tsx` | Collapsible property section |
| `src/components/SpeedPresets.tsx` | Quick speed buttons |
| `src/components/SafeAreaOverlay.tsx` | Rule-of-thirds overlay |
| `src/components/ExportPresets.tsx` | YouTube/TikTok/Instagram presets |
| `src/hooks/usePanelResize.ts` | Panel resize drag logic |
| `src/hooks/useTrackResize.ts` | Track height resize logic |

---

## FILES TO DELETE

| File | Reason |
|------|--------|
| `src/components/MediaPanel.tsx` | Unused, superseded by AssetLibrary |
| `src/utils/exportUtils.ts` | Unused, superseded by exportEngine |

---

## ESTIMATED EFFORT

| Phase | Tasks | Estimated Time |
|-------|-------|---------------|
| Phase 1: Layout | 10 tasks | 2-3 days |
| Phase 2: Logic Fixes | 15 tasks | 2-3 days |
| Phase 3: Features | 20 tasks | 3-4 days |
| Phase 4: Polish | 10 tasks | 1-2 days |
| **Total** | **55 tasks** | **8-12 days** |

---

## SUCCESS CRITERIA

After implementation, the editor should:

1. **Look like CapCut** — Same layout proportions, color scheme, visual hierarchy
2. **Feel responsive** — 60fps drag, smooth animations, no jank
3. **Work reliably** — All editing operations work correctly
4. **Export correctly** — Output matches preview exactly
5. **Be professional** — No amateur UI patterns, consistent design language
6. **Be performant** — Handles 10+ tracks, 50+ clips without lag
