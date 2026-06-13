# Approved Plan: Timeline Pro Behaviors & Pro NLE Gaps

> **Date**: 2025-06-12
> **Goal**: Implement 3 core timeline behaviors + document Pro NLE gaps

---

## Part A — Timeline Pro Behaviors (Approved for Build)

### 1. Anti-Overlap Drag + Auto-Track Creation
**Rule**: Clips on the same track must never overlap.

**Implementation**:
- In `Timeline.tsx` (`handleMoveClip`), after computing the target `newStartTime`, check the target track for overlapping clips (excluding the dragged clip).
- If overlapping:
  - Block the move on the current track.
  - Detect the drag direction (left-to-right or right-to-left).
  - Find or create a track of the **same media type** (`video`/`audio`/`image`/`text`/`graphics`) adjacent to the current track.
  - Move the clip to that new track at the computed `newStartTime` (or clamp to start if needed).
- Update `moveClip` call to accept `forceTrackId?: string` override, or handle track creation and move in the component before calling `moveClip`.

**Files to edit**:
- `Timeline.tsx` (`handleMoveClip`)
- `project-store.ts` (`moveClip` — add `forceTrackId?: string`)

---

### 2. Trim Adjacency Block (Respect Magnetic Timeline)
**Rule**: When two clips on a track are close (within ~0.1s gap), trimming the shared border by dragging is blocked UNLESS `isMagneticTimelineEnabled` is true.

**Implementation**:
- In `ClipComponent.tsx` trim handler, before allowing trim, check if the trim edge has an adjacent clip on the same track within a small `ADJACENCY_THRESHOLD` (e.g., 0.1s).
- If adjacent and `!isMagneticTimelineEnabled`: block the trim (set `isTrimming = false`, show toast or visual feedback).
- If adjacent and `isMagneticTimelineEnabled`: allow trim; the trim will apply magnetic ripple via `handleTrimClip` in `Timeline.tsx`.

**Files to edit**:
- `ClipComponent.tsx` (`handleTrimMouseDown`)
- `Timeline.tsx` (`handleTrimClip` — ensure ripple already handles this)

---

### 3. Max Extend to Actual Size (Magnetic Only)
**Rule**: When **only** `isMagneticTimelineEnabled` is true (and `isDynamicSpeedEnabled` is false), trimming a clip by dragging its border cannot exceed the raw media duration.

**Implementation**:
- In `ClipComponent.tsx` trim handler, when `isDynamicSpeedEnabled === false && isMagneticTimelineEnabled === true`:
  - For right-edge trim: `maxEndTime = startTime + (rawMediaDuration / speed) - inPoint`.
  - For left-edge trim: `minStartTime = startTime - (inPoint / speed)`, clamp to `>= 0`.
  - If user tries to drag beyond these bounds, snap back or clamp.

**Files to edit**:
- `ClipComponent.tsx` (trim handler logic inside `useEffect` for `isTrimming`)

---

### 4. Magnetic + Dynamic Speed Combo
**Rule**: When **both** `isMagneticTimelineEnabled` and `isDynamicSpeedEnabled` are true:
- Dragging the border changes the **speed** (duration) of the clip.
- The **magnetic timeline must also apply**: when speed change alters the clip’s end time, all subsequent clips on that track must ripple (shift) to maintain the gap.

**Implementation**:
- Combine existing Dynamic Speed logic (already in `ClipComponent.tsx`) with the magnetic ripple logic already in `Timeline.tsx` (`handleTrimClip`).
- After `updateClipSpeed` is called, also apply the same ripple shift to subsequent clips as `handleTrimClip.
- Ensure `handleTrimClip` in `Timeline.tsx` is called even in the `isDynamicSpeedEnabled` path, or replicate the ripple logic there.

**Files to edit**:
- `ClipComponent.tsx` (trim handler — after `updateClipSpeed`, trigger magnetic ripple)
- `Timeline.tsx` (`handleTrimClip` — ensure it handles dynamic-speed duration changes)

---

## Part B — Pro NLE Gaps (Documented, Not Part of This Build)

| Category | Status | Notes |
|---|---|---|
| Panel registration | 🟡 Partial | Missing Effects/Transitions panel in workspace |
| ProTrackHeader | 🟡 Overlapping with TrackHeader | Needs cleanup |
| Keyboard shortcuts | 🟡 Wired but dual system + no JKL | `useWorkspaceKeybindings` bypasses manager |
| Scopes | 🟡 Panel registered, engine disconnected | 3 separate implementations |
| Multi-monitor | 🔴 Missing | No `screen` API usage |
| Color management | 🔴 Missing | No ICC profile code |
| Audio waveform scopes | 🔴 Missing | Placeholder only |
| Subclips / bins | 🔴 Missing | Needed for pro workflow |
| Multi-cam | 🟡 Partial | Panel exists, not timeline-integrated |
| Nested timelines | 🟡 Partial | Compound clips only |
| Audio ducking | 🔴 Placeholder | UI stub only |
| Smart bins | 🔴 Missing | Not started |
| Markers (categorized) | 🟡 Basic | No color categories |
| JKL shuttle | 🔴 Missing | No variable-speed jog |
| Roll/Slip tools | 🟡 Backend only | `rollEdit`/`slipClip` exist, no UI |

---

## Execution Order

1. **Phase 1**: Anti-overlap drag + auto-track-creation
2. **Phase 2**: Trim adjacency block (respect magnetic)
3. **Phase 3**: Max-extend-to-actual-size (magnetic only)
4. **Phase 4**: Magnetic + Dynamic Speed combo
5. **Phase 5**: Tests / QA

> **Note**: All changes should be minimally invasive. Re-use existing `project-store.ts` action executor where possible. Avoid duplicating the `moveClip` logic; instead inject a `forceTrackId` or create a new `moveClipToTrack` action.
