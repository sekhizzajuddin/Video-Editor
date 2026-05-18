# VidForge Pro — Complete Audit & Improvement Plan

## Audit Date: May 18, 2026
## Target: CapCut-Level Browser Video Editor

---

## CRITICAL BUGS FOUND (10)

### Bug 1: Audio Sync Gap
- **File:** `src/engine/usePlaybackEngine.ts:78-79`
- **Issue:** Clips starting 0.05-0.1s ahead are played when they shouldn't be, or skipped when they should play
- **Fix:** Change condition from `if (fromTime >= clipEnd || fromTime < clip.startAt - 0.05)` with nested `if (clip.startAt > fromTime + 0.1)` to a single clean check: `if (fromTime >= clipEnd + 0.05) continue; if (fromTime < clip.startAt - 0.05) { if (clip.startAt > fromTime + 0.5) continue; }`

### Bug 2: sourceEnd Ignored in Render
- **File:** `src/engine/RenderEngine.ts:143`
- **Issue:** `sourceTime` calculation ignores `clip.sourceEnd`, allowing clips to play past their intended trim end
- **Fix:** Clamp sourceTime: `const clampedSourceTime = Math.min(sourceTime, clip.sourceEnd || Infinity);`

### Bug 3: Split Doesn't Update sourceEnd
- **File:** `src/store/editorStore.ts:376-381`
- **Issue:** When splitting, new clip's `sourceEnd` is not recalculated. Both clips share the same sourceEnd
- **Fix:** Calculate `sourceEnd` for both clips based on their respective durations and speed

### Bug 4: Export Only Includes 1 Audio Track
- **File:** `src/engine/exportEngine.ts:143-151`
- **Issue:** Only the FIRST audio/video media file is included in FFmpeg command. Multiple audio tracks lost
- **Fix:** Collect ALL audio tracks and add them as inputs with amix filter

### Bug 5: Export Missing Filters/Transitions/Transforms
- **File:** `src/engine/exportEngine.ts:183-261`
- **Issue:** `renderProjectFrame()` is a simplified duplicate that doesn't apply filters, transitions, blend modes, or proper transforms
- **Fix:** Either reuse RenderEngine directly or replicate all its compositing logic in export

### Bug 6: Overlap Logic Only Handles First Overlap
- **File:** `src/store/editorStore.ts:259-265`
- **Issue:** When clip overlaps multiple clips, only pushes past the first one
- **Fix:** Loop until no overlaps remain, pushing past each one sequentially

### Bug 7: Clip Lost on Cross-Track Drag Cancel
- **File:** `src/store/editorStore.ts:338-363`
- **Issue:** Clip removed from source track immediately during drag. If cancelled, clip is lost
- **Fix:** Store original position, only commit on drag end. Use visual ghost for preview

### Bug 8: Double Audio Start on Play/Pause
- **File:** `src/components/PreviewCanvas.tsx:165-177`
- **Issue:** `isPlaying` effect can trigger double `startAudio()` call on rapid play/pause
- **Fix:** Add guard flag `isStartingRef` to prevent concurrent start calls

### Bug 9: Memory Leak — Media URLs Never Revoked
- **Files:** `src/components/AssetLibrary.tsx:88`, `src/store/editorStore.ts`
- **Issue:** `URL.createObjectURL()` called but never revoked on delete/close
- **Fix:** Call `revokeMediaUrl()` in `removeMedia`, `newProject`, `loadProject`

### Bug 10: clipCounter Never Resets
- **File:** `src/store/editorStore.ts:10-11`
- **Issue:** Counter keeps growing across projects, creating unnecessarily long IDs
- **Fix:** Reset `clipCounter = 0` in `newProject()` and `loadProject()`

---

## UI ISSUES (10)

1. **No Responsive Layout** — Canvas hardcoded to 480px
2. **Inspector Always Visible** — Wastes 300px when no clip selected
3. **No Fullscreen Preview** — CSS class exists but no trigger button
4. **Status Bar Overflow** — Wraps on narrow screens
5. **No Undo/Redo Visual Feedback** — No indication of what will be undone
6. **Context Menu Uses Emojis** — Inconsistent with SVG icon system
7. **No Loading States** — No progress for large file imports
8. **Transform Handles All Do Same Thing** — No rotation handle, no per-axis scale
9. **No Aspect Ratio Indicators** — No safe areas or guides
10. **Typo: "Shorcuts"** — Throughout codebase (file name, state, CSS classes)

---

## MISSING FEATURES (55+)

### Priority 1 — Core Editing (9)
1. Keyframe Animation System
2. Speed Ramping (curve-based)
3. Multi-clip Selection Operations
4. Complete Undo/Redo (all actions)
5. Proper Export Parity with Preview
6. Split Audio from Video
7. True Freeze Frame
8. True Reverse Playback
9. Aspect Ratio Presets (9:16, 1:1, 4:3, etc.)

### Priority 2 — Visual Effects (7)
10. Chroma Key / Green Screen
11. Background Removal
12. 20+ Transitions with Configurable Direction
13. Custom Filter Intensity Sliders
14. LUT Support (.cube files)
15. Vignette, Grain, Blur Effects
16. Motion Blur

### Priority 3 — Audio (7)
17. Audio Fade In/Out per Clip
18. Audio Equalizer (Bass/Mid/Treble)
19. Noise Reduction
20. Voice Enhancement
21. Beat Detection → Auto-markers
22. Audio Ducking
23. Volume Envelope (keyframe-based)

### Priority 4 — Text & Graphics (6)
24. Animated Text (typewriter, bounce, slide-in)
25. Text Templates (lower thirds, titles, credits)
26. Shape Drawing (rect, circle, arrow, line)
27. Image Overlay (PNG transparency)
28. Custom Fonts (.ttf/.woff upload)
29. Text-to-Speech

### Priority 5 — Workflow (7)
30. Project Templates
31. Proxy Editing (low-res preview for 4K)
32. Render Queue (batch export)
33. Version History
34. Magnetic Timeline Toggle
35. Clip Grouping
36. Nested Sequences
37. Rich Markers (labels, notes, colors)

### Priority 6 — Architecture & Polish (8)
38. Virtualize Timeline (only render visible clips)
39. WebCodecs API (replace FFmpeg WASM)
40. IndexedDB for Media (stream large files)
41. OffscreenCanvas (free main thread)
42. Plugin Architecture
43. Before/After Split View
44. Zoom to Selection
45. Performance Profiling (FPS, memory)

---

## IMPLEMENTATION ORDER

### Phase 1: Critical Bug Fixes (10 bugs)
- Fix all 10 bugs listed above
- Estimated: 2-3 hours

### Phase 2: Core Features (9 features)
- Keyframe system, speed ramping, export parity, etc.
- Estimated: 8-12 hours

### Phase 3: UI/UX Overhaul (10 improvements)
- Responsive layout, fullscreen, better inspector, etc.
- Estimated: 4-6 hours

### Phase 4: Visual Effects & Audio (14 features)
- Chroma key, transitions, audio tools, etc.
- Estimated: 12-18 hours

### Phase 5: Text, Graphics & Workflow (14 features)
- Animated text, shapes, proxy editing, etc.
- Estimated: 10-15 hours

### Phase 6: Architecture & Polish (8 improvements)
- Virtualization, WebCodecs, plugins, etc.
- Estimated: 8-12 hours

**Total Estimated Time: 44-66 hours**

---

## ARCHITECTURE RECOMMENDATIONS

1. **Single Source of Truth for Rendering** — Use RenderEngine for both preview AND export
2. **Web Worker for Heavy Lifting** — Move rendering, waveform generation, thumbnail creation to workers
3. **Virtual Scrolling for Timeline** — Only DOM-render visible clips
4. **Streaming Media** — Don't load entire blobs into memory; use IndexedDB + URL streaming
5. **Event Bus Pattern** — Decouple components from direct store calls
6. **Plugin System** — Allow third-party effects/transitions via standardized interface

---

## CURRENT STATE SUMMARY

**What Works Well:**
- Multi-track timeline with drag/drop
- Real-time canvas preview
- Basic transitions (10 types)
- Filter presets (7 types)
- Web Audio API mixing
- IndexedDB persistence
- Undo/redo (partial)
- Keyboard shortcuts (20+)
- Auto-save
- Project management

**What Needs Work:**
- Export quality/parity with preview
- Audio mixing in export
- Memory management
- Responsive design
- Feature completeness vs CapCut

**Tech Stack:**
- React 18 + TypeScript + Vite
- Zustand for state management
- Canvas 2D for rendering
- FFmpeg.wasm for export
- Web Audio API for mixing
- IndexedDB for persistence
