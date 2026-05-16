// ===================================================
// js/timeline.js — Timeline Physics, Drag & Drop
// ===================================================
import { 
  uploadedAssets, playbackState, dom, zoomFactor, selectedClip, setSelectedClip,
  selectedClips, clearSelectedClips, clipDrag, resizeDrag, TOTAL_SECONDS, TOTAL_DURATION,
  setTotalDuration, isSpeedModeActive, setSpeedMode, videoElementCache, trackStates,
  initTrackState, toggleTrackMute, toggleTrackVisibility, toggleTrackLock
} from './state.js';
import { pxPerSec, formatDuration, showToast, clamp, pxToSeconds, secondsToPx, pxToTimecode } from './utils.js';
import { syncPlayerToTimeline, setPlayheadX } from './engine.js';
import { drawWaveform } from './codec.js';

// ── Clip Selection ──
import { updateInspectorFields } from './tools.js';

export function deselectAll() {
  if (selectedClip) {
    selectedClip.classList.remove('clip--selected');
  }
  setSelectedClip(null);
  clearSelectedClips();
  updateTrimInputs(null);
}

export function selectClip(clip, multi = false) {
  if (multi) {
    if (selectedClips.has(clip)) {
      selectedClips.delete(clip);
      clip.classList.remove('clip--selected');
    } else {
      addSelectedClip(clip);
    }
    return;
  }
  
  if (selectedClip === clip) return;
  deselectAll();
  setSelectedClip(clip);
  if (clip) {
    clip.classList.add('clip--selected');
    updateTrimInputs(clip);
  }
}

export function getClipLeft(clip) {
  return parseFloat(clip?.style?.left) || 0;
}

export function getClipWidth(clip) {
  return parseFloat(clip?.style?.width) || 0;
}

export function getClipDuration(clip) {
  return getClipWidth(clip) / pxPerSec();
}

// ── Make Clip Draggable ──
export function makeClipDraggable(clip) {
  clip.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('clip__resize')) return;
    
    const trackEl = clip.parentElement;
    const trackId = trackEl?.dataset?.trackId;
    if (trackId && trackStates.get(trackId)?.locked) {
      showToast('Track is locked', 'warning');
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();

    const multi = e.ctrlKey || e.metaKey;
    selectClip(clip, multi && !selectedClip);

    clipDrag.active = true;
    clipDrag.clip = clip;
    clipDrag.startMouseX = e.clientX;
    clipDrag.startLeft = getClipLeft(clip);
    clipDrag.trackEl = trackEl;
    clipDrag.startTrackEl = trackEl; // remember original track for cross-track drag

    clip.classList.add('clip--dragging');
    clip.style.zIndex = '20';
  });
  
  // Touch support
  clip.addEventListener('touchstart', (e) => {
    if (e.target.classList.contains('clip__resize')) return;
    const touch = e.touches[0];
    const trackEl = clip.parentElement;
    const trackId = trackEl?.dataset?.trackId;
    if (trackId && trackStates.get(trackId)?.locked) return;
    
    clipDrag.active = true;
    clipDrag.clip = clip;
    clipDrag.startMouseX = touch.clientX;
    clipDrag.startLeft = getClipLeft(clip);
    clipDrag.trackEl = trackEl;
    clipDrag.startTrackEl = trackEl;
    clip.classList.add('clip--dragging');
    clip.style.zIndex = '20';
  }, { passive: false });
}

// ── Drop Zone Logic ──
export function isDropAllowed(trackEl, assetType) {
  const trackType = trackEl?.dataset?.track;
  if (assetType === 'video' || assetType === 'image') return trackType === 'video';
  if (assetType === 'audio') return trackType === 'audio';
  if (assetType === 'text') return trackType === 'text';
  if (assetType === 'vfx') return trackType === 'vfx';
  return false;
}

export function dropPositionX(e, trackEl) {
  const rect = trackEl.getBoundingClientRect();
  const clientX = e.clientX || (e.touches?.[0]?.clientX || 0);
  const scrollLeft = dom.trackArea?.scrollLeft || 0;
  return Math.max(0, clientX - rect.left + scrollLeft);
}

// ── Snap Logic ──
function findSnapPosition(newLeft, width, trackEl, excludeClip) {
  const SNAP_TOLERANCE = 12;
  const snapPoints = [];
  
  // Playhead
  const playheadLeft = parseFloat(dom.playheadEl?.style.left) || 0;
  snapPoints.push({ pos: playheadLeft, type: 'playhead' });
  
  // Other clips
  const siblings = Array.from(trackEl?.querySelectorAll('.clip') || []).filter(c => c !== excludeClip);
  siblings.forEach(c => {
    const cLeft = getClipLeft(c);
    const cWidth = getClipWidth(c);
    snapPoints.push({ pos: cLeft, type: 'clip-start', clip: c });
    snapPoints.push({ pos: cLeft + cWidth, type: 'clip-end', clip: c });
  });
  
  // Zero
  snapPoints.push({ pos: 0, type: 'start' });
  
  let bestLeftDist = SNAP_TOLERANCE + 1, bestLeftPos = newLeft, snapType = null;
  let bestRightDist = SNAP_TOLERANCE + 1, bestRightPos = newLeft + width;
  
  snapPoints.forEach(pt => {
    const dL = Math.abs(pt.pos - newLeft);
    if (dL < bestLeftDist) { 
      bestLeftDist = dL; 
      bestLeftPos = pt.pos; 
      snapType = pt.type;
    }
    const dR = Math.abs(pt.pos - (newLeft + width));
    if (dR < bestRightDist) { 
      bestRightDist = dR; 
      bestRightPos = pt.pos; 
    }
  });
  
  let snappedLeft = newLeft;
  let snappedRight = newLeft + width;
  let didSnap = false;
  
  if (bestLeftDist <= SNAP_TOLERANCE) {
    snappedLeft = bestLeftPos;
    didSnap = true;
  } else if (bestRightDist <= SNAP_TOLERANCE) {
    snappedRight = bestRightPos;
    snappedLeft = snappedRight - width;
    didSnap = true;
  }
  
  return { left: snappedLeft, right: snappedRight, didSnap, snapType };
}

function showSnapIndicator(x) {
  if (!dom.snapIndicator) return;
  dom.snapIndicator.style.left = `${x}px`;
  dom.snapIndicator.classList.add('snap-indicator--visible');
}

function hideSnapIndicator() {
  if (!dom.snapIndicator) return;
  dom.snapIndicator.classList.remove('snap-indicator--visible');
}

// ── Collision Detection ──
function resolveCollision(newLeft, width, trackEl, excludeClip, direction) {
  const siblings = Array.from(trackEl?.querySelectorAll('.clip') || []).filter(c => c !== excludeClip);
  let finalLeft = newLeft;
  
  if (direction > 0) { // Moving right
    siblings.forEach(c => {
      const cLeft = getClipLeft(c);
      if (cLeft >= clipDrag.startLeft + getClipWidth(excludeClip) - 1) {
        if (finalLeft + width > cLeft) {
          finalLeft = cLeft - width;
        }
      }
    });
  } else { // Moving left
    siblings.forEach(c => {
      const cRight = getClipLeft(c) + getClipWidth(c);
      if (cRight <= clipDrag.startLeft + 1) {
        if (finalLeft < cRight) {
          finalLeft = cRight;
        }
      }
    });
  }
  
  return Math.max(0, finalLeft);
}

// ── Add Clip to Timeline ──
export function addClipToTrack(asset, trackEl, leftPx, options = {}) {
  const isVideo = asset.type === 'video';
  const isImage = asset.type === 'image';
  const isAudio = asset.type === 'audio';
  
  const clipType = isVideo ? 'clip--video' : (isImage ? 'clip--image' : 'clip--audio');
  const icon = isVideo ? '🎬' : (isImage ? '🖼️' : '🎵');

  let duration = asset.duration || 5;
  if (options.speed && options.speed !== 1) {
    duration = duration / options.speed;
  }
  const durationWidth = Math.max(80, Math.round(duration * pxPerSec()));

  const clip = document.createElement('div');
  clip.className = `clip ${clipType}`;
  clip.style.left = `${leftPx}px`;
  clip.style.width = `${durationWidth}px`;
  clip.draggable = true;

  clip.dataset.assetId = asset.id;
  clip.dataset.type = asset.type; // for cross-track type check
  clip.dataset.baseDur = asset.duration || 0;
  clip.dataset.trimStart = options.trimStart || 0;
  clip.dataset.trimEnd = options.trimEnd || asset.duration || 5;
  clip.dataset.speed = options.speed || 1;
  clip.dataset.volume = options.volume || 100;
  clip.dataset.startTime = leftPx / pxPerSec();
  clip.dataset.clipId = `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  clip.innerHTML = `
    <div class="clip__thumb"></div>
    <div class="clip__label">${icon} ${asset.name}</div>
    <div class="clip__speed-badge" style="display:none;"></div>
    <div class="clip__duration">${formatDuration(duration)}</div>
    <div class="clip__waveform clip__waveform--${asset.type}">
      <canvas class="waveform-canvas" width="${durationWidth}" height="30" style="width:100%; height:100%; pointer-events:none;"></canvas>
    </div>
    <div class="clip__resize clip__resize--left"></div>
    <div class="clip__resize clip__resize--right"></div>
  `;

  trackEl.appendChild(clip);
  
  // Draw waveform
  if (asset.waveformData) {
    const canvas = clip.querySelector('.waveform-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (isAudio) {
        drawEnhancedWaveform(ctx, canvas, asset.waveformData);
      } else {
        drawWaveform(ctx, canvas, asset.waveformData, { color: 'rgba(255,255,255,0.3)' });
      }
    }
  }

  // Capture initial frame thumbnail for video clips
  if (isVideo) {
    const video = videoElementCache.get(asset.id);
    if (video) {
      captureInitialFrame(video, clip);
    }
  }
  if (isImage && asset.thumbnail) {
    const thumb = clip.querySelector('.clip__thumb');
    if (thumb) thumb.style.backgroundImage = `url('${asset.thumbnail}')`;
  }

  makeClipDraggable(clip);
  makeClipResizable(clip);
  
  if (options.speed && options.speed !== 1) {
    updateSpeedBadge(clip, options.speed);
  }

  // Dynamic duration expansion
  updateTimelineDuration();

  showToast(`Added "${asset.name}" to timeline`, 'success');
  return clip;
}

function captureInitialFrame(video, clip) {
  const thumb = clip.querySelector('.clip__thumb');
  if (!thumb || !video) return;
  const tryCapture = () => {
    if (video.readyState < 2) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 180;
    const ctx = canvas.getContext('2d');
    const savedTime = video.currentTime;
    video.currentTime = parseFloat(clip.dataset.trimStart) || 0;
    const onSeeked = () => {
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        thumb.style.backgroundImage = `url('${canvas.toDataURL('image/jpeg', 0.6)}')`;
      } catch(e) {}
      video.currentTime = savedTime;
      video.removeEventListener('seeked', onSeeked);
    };
    video.addEventListener('seeked', onSeeked);
  };
  if (video.readyState >= 2) tryCapture();
  else video.addEventListener('loadeddata', tryCapture, { once: true });
}

function drawEnhancedWaveform(ctx, canvas, waveformData) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const w = canvas.width, h = canvas.height;
  const barCount = Math.floor(w / 3);
  const step = Math.ceil(waveformData.length / barCount);
  const amp = h / 2;
  const midY = h / 2;

  // Center line
  ctx.strokeStyle = 'rgba(79,195,247,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(w, midY);
  ctx.stroke();

  for (let i = 0; i < barCount; i++) {
    const value = waveformData[i * step] || 0;
    const barH = Math.max(1, value * amp * 1.8);
    const x = i * 3;
    const y = midY - barH / 2;
    // White for high peaks (vocal), blue for rest
    const isHighPeak = value > 0.5;
    ctx.fillStyle = isHighPeak ? 'rgba(255,255,255,0.85)' : '#4FC3F7';
    ctx.fillRect(x, y, 2, barH);
  }
}

function updateSpeedBadge(clip, speed) {
  const badge = clip.querySelector('.clip__speed-badge');
  if (badge) {
    if (speed !== 1) {
      badge.textContent = `${parseFloat(speed).toFixed(2)}×`;
      badge.style.display = 'block';
    } else {
      badge.style.display = 'none';
    }
  }
}

export function clearDropHighlights() {
  document.querySelectorAll('.track').forEach(t => {
    t.classList.remove('track--drop-active', 'track--drop-reject');
  });
}

// ── Global Drag Handler (with cross-track support) ──
function handleDragMove(clientX, clientY) {
  if (!clipDrag.active || !clipDrag.clip) return;
  
  const clip = clipDrag.clip;
  const currentTrack = clip.parentElement;
  const width = getClipWidth(clip);
  const startLeft = clipDrag.startLeft;
  
  let newLeft = startLeft + (clientX - clipDrag.startMouseX);
  newLeft = Math.max(0, newLeft);
  
  // ── Cross-Track Detection ──
  if (clientY !== undefined) {
    const allTracks = Array.from(document.querySelectorAll('.track'));
    let targetTrack = null;
    for (const t of allTracks) {
      const r = t.getBoundingClientRect();
      if (clientY >= r.top && clientY <= r.bottom) {
        targetTrack = t;
        break;
      }
    }
    
    // Clear drag-target highlights
    allTracks.forEach(t => t.classList.remove('track--drag-target'));
    
    if (targetTrack && targetTrack !== currentTrack) {
      const clipType = clip.dataset.type || (clip.classList.contains('clip--video') ? 'video' : clip.classList.contains('clip--audio') ? 'audio' : 'video');
      if (isDropAllowed(targetTrack, clipType)) {
        targetTrack.classList.add('track--drag-target');
        clipDrag.hoverTrackEl = targetTrack;
      } else {
        clipDrag.hoverTrackEl = null;
      }
    } else {
      clipDrag.hoverTrackEl = null;
    }
  }
  
  // Snap
  const snapResult = findSnapPosition(newLeft, width, currentTrack, clip);
  let finalLeft = snapResult.left;
  
  if (snapResult.didSnap) {
    showSnapIndicator(snapResult.left);
  } else {
    hideSnapIndicator();
  }
  
  // Collision (only on current track)
  const direction = newLeft > startLeft ? 1 : -1;
  finalLeft = resolveCollision(finalLeft, width, currentTrack, clip, direction);
  
  clip.style.left = `${finalLeft}px`;
  clip.dataset.startTime = finalLeft / pxPerSec();
  
  updateTimelineDuration();
}

document.addEventListener('mousemove', (e) => {
  if (clipDrag.active) handleDragMove(e.clientX, e.clientY);
});

document.addEventListener('touchmove', (e) => {
  if (clipDrag.active) {
    e.preventDefault();
    handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
  }
}, { passive: false });

document.addEventListener('mouseup', () => {
  if (clipDrag.active && clipDrag.clip) {
    hideSnapIndicator();
    // ── Finalize cross-track move ──
    if (clipDrag.hoverTrackEl && clipDrag.hoverTrackEl !== clipDrag.clip.parentElement) {
      const clip = clipDrag.clip;
      const targetTrack = clipDrag.hoverTrackEl;
      const clipType = clip.classList.contains('clip--audio') ? 'audio' : 'video';
      if (isDropAllowed(targetTrack, clipType)) {
        // Check for overlaps on target
        const cLeft = getClipLeft(clip);
        const cWidth = getClipWidth(clip);
        const hasOverlap = Array.from(targetTrack.querySelectorAll('.clip')).some(c => {
          const tL = getClipLeft(c); const tR = tL + getClipWidth(c);
          return cLeft < tR && cLeft + cWidth > tL;
        });
        if (!hasOverlap) {
          targetTrack.appendChild(clip);
          showToast('Clip moved to track', 'success');
        } else {
          showToast('Cannot move — overlaps existing clip', 'warning');
        }
      }
    }
    document.querySelectorAll('.track--drag-target').forEach(t => t.classList.remove('track--drag-target'));
    clipDrag.clip.classList.remove('clip--dragging');
    clipDrag.clip.style.zIndex = '';
    clipDrag.active = false;
    clipDrag.clip = null;
    clipDrag.hoverTrackEl = null;
    refreshTimelineLayout();
  }
});

document.addEventListener('touchend', () => {
  if (clipDrag.active && clipDrag.clip) {
    hideSnapIndicator();
    document.querySelectorAll('.track--drag-target').forEach(t => t.classList.remove('track--drag-target'));
    clipDrag.clip.classList.remove('clip--dragging');
    clipDrag.clip.style.zIndex = '';
    clipDrag.active = false;
    clipDrag.clip = null;
    clipDrag.hoverTrackEl = null;
  }
});

// ── Register Drop Zone for a Single Track ──
export function initSingleTrackDropZone(trackEl) {
  if (!trackEl) return;
  const trackId = trackEl.dataset.trackId;
  if (trackId) initTrackState(trackId);

  trackEl.addEventListener('dragenter', (e) => {
    e.preventDefault();
    clearDropHighlights();
    const assetType = window.__currentDragType;
    if (!assetType) return;
    if (isDropAllowed(trackEl, assetType)) {
      trackEl.classList.add('track--drop-active');
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    } else {
      trackEl.classList.add('track--drop-reject');
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    }
  });
  trackEl.addEventListener('dragover', (e) => e.preventDefault());
  trackEl.addEventListener('dragleave', (e) => {
    if (!trackEl.contains(e.relatedTarget)) {
      trackEl.classList.remove('track--drop-active', 'track--drop-reject');
    }
  });
  trackEl.addEventListener('drop', (e) => {
    e.preventDefault();
    clearDropHighlights();
    const assetId = e.dataTransfer?.getData('text/plain') || window.__currentDragId;
    const asset = uploadedAssets.find(a => a.id === assetId);
    if (!asset) { showToast('Asset not found', 'error'); return; }
    if (!isDropAllowed(trackEl, asset.type)) {
      showToast(`Cannot drop ${asset.type} here`, 'warning');
      return;
    }
    let leftPx = dropPositionX(e, trackEl);
    const duration = asset.duration || 5;
    const durationPx = Math.max(80, duration * pxPerSec());

    // ── Smart Placement: find blank space ──
    const targetTrack = findDropTarget(trackEl, leftPx, durationPx, asset.type);
    const finalLeft = findBlankLeft(targetTrack, leftPx, durationPx);

    addClipToTrack(asset, targetTrack, finalLeft);
    syncPlayerToTimeline(playbackState.currentTime);
    window.__currentDragId = null;
    window.__currentDragType = null;
  });
}

// Find the best track to drop into (same track if space, else existing same-type, else new)
function findDropTarget(preferredTrack, leftPx, widthPx, assetType) {
  // Check if preferred track has space
  if (!hasOverlapAtPosition(preferredTrack, leftPx, widthPx)) return preferredTrack;
  // Check other same-type tracks
  const trackType = preferredTrack.dataset.track;
  const allSameTracks = Array.from(document.querySelectorAll(`.track--${trackType}`));
  for (const t of allSameTracks) {
    if (t === preferredTrack) continue;
    if (!hasOverlapAtPosition(t, leftPx, widthPx)) return t;
  }
  // No space found — create new track
  showToast('Added to new track (no space available)', 'info');
  return addNewTrack(trackType);
}

function hasOverlapAtPosition(trackEl, leftPx, widthPx) {
  const rightPx = leftPx + widthPx;
  return Array.from(trackEl.querySelectorAll('.clip')).some(c => {
    const cL = getClipLeft(c); const cR = cL + getClipWidth(c);
    return leftPx < cR && rightPx > cL;
  });
}

// Snap leftPx to first available blank space on track
function findBlankLeft(trackEl, preferredLeft, widthPx) {
  if (!hasOverlapAtPosition(trackEl, preferredLeft, widthPx)) return preferredLeft;
  // Try appending after last clip
  const clips = Array.from(trackEl.querySelectorAll('.clip')).sort((a,b) => getClipLeft(a) - getClipLeft(b));
  if (clips.length === 0) return preferredLeft;
  const lastRight = getClipLeft(clips[clips.length-1]) + getClipWidth(clips[clips.length-1]);
  return lastRight + 2;
}

// ── Initialize Track Drop Zones ──
export function initTrackDropZones() {
  [dom.videoTrack, dom.audioTrack].filter(Boolean).forEach(trackEl => initSingleTrackDropZone(trackEl));

  document.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.asset-card, .audio-item');
    if (!card) return;
    window.__currentDragId = card.dataset.id;
    window.__currentDragType = card.dataset.type;
  });
  document.addEventListener('dragend', (e) => {
    if (e.target.closest('.asset-card, .audio-item')) {
      clearDropHighlights();
      setTimeout(() => { window.__currentDragId = null; window.__currentDragType = null; }, 0);
    }
  });
}

// ── Speed Functions ──
function clampSpeed(v) {
  return Math.max(0.1, Math.min(4.0, parseFloat(v.toFixed(2))));
}

export function applySpeedToClip(clip, speed) {
  if (!clip) return;
  const clamped = clampSpeed(speed);
  clip.dataset.speed = clamped;
  
  if (dom.speedInput && selectedClip === clip) {
    dom.speedInput.value = clamped.toFixed(2);
  }

  videoElementCache.forEach(v => {
    if (!v.paused && v.dataset.id === clip.dataset.assetId) {
      v.playbackRate = clamped;
    }
  });

  updateSpeedBadge(clip, clamped);

  const trimDur = parseFloat(clip.dataset.trimEnd) - parseFloat(clip.dataset.trimStart);
  if (trimDur > 0) {
    const newVisualDur = trimDur / clamped;
    const newWidth = Math.max(40, newVisualDur * pxPerSec());
    clip.style.width = `${newWidth}px`;
    const durEl = clip.querySelector('.clip__duration');
    if (durEl) durEl.textContent = formatDuration(newVisualDur);
  }
}

// ── Trim Input Functions ──
export function updateTrimInputs(clip) {
  if (!clip) {
    if (dom.trimStartInput) dom.trimStartInput.value = '';
    if (dom.trimEndInput) dom.trimEndInput.value = '';
    return;
  }
  
  const trimStart = parseFloat(clip.dataset.trimStart || 0);
  const trimEnd = parseFloat(clip.dataset.trimEnd || clip.dataset.baseDur || 0);
  
  if (dom.trimStartInput) dom.trimStartInput.value = trimStart.toFixed(2);
  if (dom.trimEndInput) dom.trimEndInput.value = trimEnd.toFixed(2);
  
  updateInspectorFields(clip);
}

// ── Make Clip Resizable ──
export function makeClipResizable(clip) {
  const handles = clip.querySelectorAll('.clip__resize');
  
  handles.forEach(handle => {
    const startResize = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const trackEl = clip.parentElement;
      const trackId = trackEl?.dataset?.trackId;
      if (trackId && trackStates.get(trackId)?.locked) {
        showToast('Track is locked', 'warning');
        return;
      }

      resizeDrag.active = true;
      resizeDrag.handle = handle;
      resizeDrag.clip = clip;
      resizeDrag.startX = e.clientX || e.touches?.[0]?.clientX;
      resizeDrag.startLeft = getClipLeft(clip);
      resizeDrag.startWidth = getClipWidth(clip);
      resizeDrag.isLeft = handle.classList.contains('clip__resize--left');
      resizeDrag.startTrimStart = parseFloat(clip.dataset.trimStart || 0);
      resizeDrag.startTrimEnd = parseFloat(clip.dataset.trimEnd || clip.dataset.baseDur || 0);
      resizeDrag.baseDur = parseFloat(clip.dataset.baseDur || 0);

      clip.classList.add('clip--dragging');
      document.body.style.cursor = 'ew-resize';
    };
    
    handle.addEventListener('mousedown', startResize);
    handle.addEventListener('touchstart', startResize, { passive: false });
  });
}

// ── Push Siblings Function (for auto-push on clip extension) ──
function pushSiblingsOnResize(clip, newRightPx, track) {
  const siblings = Array.from(track.querySelectorAll('.clip'))
    .filter(c => c !== clip)
    .sort((a, b) => getClipLeft(a) - getClipLeft(b));
  
  let currentPushBoundary = newRightPx;
  
  siblings.forEach(sibling => {
    const siblingLeft = getClipLeft(sibling);
    // If this sibling starts before our push boundary, push it
    if (siblingLeft < currentPushBoundary - 1) {
      const pushAmount = currentPushBoundary - siblingLeft;
      const newLeft = siblingLeft + pushAmount;
      sibling.style.left = `${newLeft}px`;
      sibling.dataset.startTime = newLeft / pxPerSec();
      // Update boundary for next sibling
      currentPushBoundary = newLeft + getClipWidth(sibling);
    }
  });
}

// ── Resize Handler ──
function handleResizeMove(clientX) {
  if (!resizeDrag.active || !resizeDrag.clip) return;
  
  const clip = resizeDrag.clip;
  const track = clip.parentElement;
  const dx = clientX - resizeDrag.startX;
  
  const baseDurSec = resizeDrag.baseDur;
  const speed = parseFloat(clip.dataset.speed || 1);
  const siblings = Array.from(track.querySelectorAll('.clip')).filter(c => c !== clip);
  
  const SNAP_TOLERANCE = 10;
  const snapPoints = [parseFloat(dom.playheadEl?.style.left) || 0];
  siblings.forEach(c => {
    const cLeft = getClipLeft(c);
    snapPoints.push(cLeft, cLeft + getClipWidth(c));
  });

  let newLeft = resizeDrag.startLeft;
  let newWidth = resizeDrag.startWidth;

  if (isSpeedModeActive) {
    if (resizeDrag.isLeft) {
      newLeft = Math.max(0, resizeDrag.startLeft + dx);
      siblings.forEach(c => {
        const cRight = getClipLeft(c) + getClipWidth(c);
        if (cRight <= resizeDrag.startLeft + 1 && newLeft < cRight) newLeft = cRight;
      });
      snapPoints.forEach(pt => { if (Math.abs(pt - newLeft) < SNAP_TOLERANCE) newLeft = pt; });
      newWidth = Math.max(40, resizeDrag.startWidth - (newLeft - resizeDrag.startLeft));
    } else {
      newWidth = Math.max(40, resizeDrag.startWidth + dx);
      const newRightCandidate = newLeft + newWidth;
      let finalRight = newRightCandidate;
      siblings.forEach(c => {
        const cLeft = getClipLeft(c);
        if (cLeft >= resizeDrag.startLeft + resizeDrag.startWidth - 1 && finalRight > cLeft) {
          finalRight = cLeft;
        }
      });
      snapPoints.forEach(pt => { if (Math.abs(pt - finalRight) < SNAP_TOLERANCE) finalRight = pt; });
      newWidth = Math.max(40, finalRight - newLeft);
      
      // AUTO-PUSH: When extending clip to the right, push other clips
      if (newWidth > resizeDrag.startWidth) {
        pushSiblingsOnResize(clip, newLeft + newWidth, track);
      }
    }
    
    clip.style.left = `${newLeft}px`;
    clip.style.width = `${newWidth}px`;
    
    updateTimelineDuration();
    
    const currentTrimWidthPx = (parseFloat(clip.dataset.trimEnd) - parseFloat(clip.dataset.trimStart)) * pxPerSec();
    const newSpeed = currentTrimWidthPx / newWidth;
    const clampedSpeed = Math.max(0.1, Math.min(4.0, newSpeed));
    
    clip.dataset.speed = clampedSpeed;
    if (dom.speedInput && selectedClip === clip) {
      dom.speedInput.value = clampedSpeed.toFixed(2);
    }
    
  } else {
    const maxIntrinsicWidthPx = baseDurSec * pxPerSec();
    const currentTrimStart = parseFloat(clip.dataset.trimStart || 0) * pxPerSec();
    
    if (resizeDrag.isLeft) {
      const absoluteMaxLeftBound = resizeDrag.startLeft - (currentTrimStart / speed);
      newLeft = resizeDrag.startLeft + dx;
      
      siblings.forEach(c => {
        const cRight = getClipLeft(c) + getClipWidth(c);
        if (cRight <= resizeDrag.startLeft + 1 && newLeft < cRight) newLeft = cRight;
      });
      snapPoints.forEach(pt => { if (Math.abs(pt - newLeft) < SNAP_TOLERANCE) newLeft = pt; });
      
      newLeft = Math.max(Math.max(0, absoluteMaxLeftBound), Math.min(newLeft, resizeDrag.startLeft + resizeDrag.startWidth - 40));
      newWidth = resizeDrag.startWidth - (newLeft - resizeDrag.startLeft);
      
      clip.style.left = `${newLeft}px`;
      clip.style.width = `${newWidth}px`;
      
      const offsetLeftPx = newLeft - absoluteMaxLeftBound;
      clip.dataset.trimStart = (offsetLeftPx * speed) / pxPerSec();
    } else {
      const maxAllowedWidthPx = ((baseDurSec - parseFloat(clip.dataset.trimStart)) / speed) * pxPerSec();
      let finalRight = resizeDrag.startLeft + resizeDrag.startWidth + dx;
      
      siblings.forEach(c => {
        const cLeft = getClipLeft(c);
        if (cLeft >= resizeDrag.startLeft + resizeDrag.startWidth - 1 && finalRight > cLeft) {
          finalRight = cLeft;
        }
      });
      snapPoints.forEach(pt => { if (Math.abs(pt - finalRight) < SNAP_TOLERANCE) finalRight = pt; });
      
      const newWidthTemp = finalRight - newLeft;
      newWidth = Math.max(40, Math.min(newWidthTemp, maxAllowedWidthPx));
      
      clip.style.width = `${newWidth}px`;
      const trimEndCalculated = parseFloat(clip.dataset.trimStart) + ((newWidth * speed) / pxPerSec());
      clip.dataset.trimEnd = trimEndCalculated;
      
      // AUTO-PUSH: When extending clip to the right (trim mode), push other clips
      if (newWidth > resizeDrag.startWidth) {
        pushSiblingsOnResize(clip, newLeft + newWidth, track);
      }
    }
    
    if (dom.trimStartInput && selectedClip === clip) {
      dom.trimStartInput.value = parseFloat(clip.dataset.trimStart).toFixed(2);
      if (dom.trimEndInput) dom.trimEndInput.value = parseFloat(clip.dataset.trimEnd).toFixed(2);
    }
  }
}

document.addEventListener('mousemove', (e) => {
  if (resizeDrag.active) handleResizeMove(e.clientX);
});

document.addEventListener('touchmove', (e) => {
  if (resizeDrag.active) {
    e.preventDefault();
    handleResizeMove(e.touches[0].clientX);
  }
}, { passive: false });

document.addEventListener('mouseup', () => {
  if (!resizeDrag.active) return;
  
  if (isSpeedModeActive && resizeDrag.clip) {
    applySpeedToClip(resizeDrag.clip, parseFloat(resizeDrag.clip.dataset.speed));
  } else if (!isSpeedModeActive && resizeDrag.clip) {
    const durEl = resizeDrag.clip.querySelector('.clip__duration');
    if (durEl) {
      durEl.textContent = formatDuration(getClipWidth(resizeDrag.clip) / pxPerSec());
    }
  }
  
  resizeDrag.clip?.classList.remove('clip--dragging');
  document.body.style.cursor = '';
  resizeDrag.active = false;
  resizeDrag.clip = null;
});

document.addEventListener('touchend', () => {
  if (!resizeDrag.active) return;
  resizeDrag.clip?.classList.remove('clip--dragging');
  document.body.style.cursor = '';
  resizeDrag.active = false;
  resizeDrag.clip = null;
});

// ── Build Time Ruler ──
export function buildRuler() {
  if (!dom.timeRuler) return;
  dom.timeRuler.innerHTML = '';

  const pps = pxPerSec();
  const totalWidth = Math.ceil(TOTAL_SECONDS * pps);
  dom.timeRuler.style.minWidth = `${totalWidth}px`;

  const majorIntervals = [60, 30, 15, 10, 5, 2, 1, 0.5, 0.25];
  const minLabelGap = 60;
  let majorInterval = majorIntervals[0];
  
  for (const iv of majorIntervals) {
    if (iv * pps >= minLabelGap) {
      majorInterval = iv;
    } else {
      break;
    }
  }
  
  const minorInterval = majorInterval / 4;
  const frag = document.createDocumentFragment();
  const numMajorTicks = Math.floor(TOTAL_SECONDS / majorInterval) + 1;
  
  for (let i = 0; i < numMajorTicks; i++) {
    const sec = i * majorInterval;
    const xPx = sec * pps;
    
    if (xPx > totalWidth) break;
    
    const majorTick = document.createElement('div');
    majorTick.className = 'ruler-tick ruler-tick--major';
    majorTick.style.left = `${xPx}px`;
    
    const label = document.createElement('span');
    label.className = 'ruler-tick__label';
    
    if (sec < 60) {
      label.textContent = `0:${sec.toString().padStart(2, '0')}`;
    } else {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      label.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    }
    
    majorTick.appendChild(label);
    const line = document.createElement('div');
    line.className = 'ruler-tick__line';
    majorTick.appendChild(line);
    frag.appendChild(majorTick);
    
    if (i < numMajorTicks - 1 && minorInterval > 0) {
      for (let j = 1; j < 4; j++) {
        const minorSec = sec + (j * minorInterval);
        const minorPx = minorSec * pps;
        if (minorPx > totalWidth) break;
        
        const minorTick = document.createElement('div');
        minorTick.className = 'ruler-tick ruler-tick--minor';
        minorTick.style.left = `${minorPx}px`;
        const minorLine = document.createElement('div');
        minorLine.className = 'ruler-tick__line';
        minorTick.appendChild(minorLine);
        frag.appendChild(minorTick);
      }
    }
  }
  
  dom.timeRuler.appendChild(frag);
}

// ── Track Header Controls ──
export function initTrackControls() {
  document.querySelectorAll('.track-header').forEach(header => {
    const trackId = header.dataset.trackId;
    if (!trackId) return;
    
    initTrackState(trackId);
    
    const muteBtn = header.querySelector('.track-mute-btn');
    const visibilityBtn = header.querySelector('.track-visibility-btn');
    const lockBtn = header.querySelector('.track-lock-btn');
    
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        const muted = toggleTrackMute(trackId);
        muteBtn.textContent = muted ? '🔇' : '🔊';
        muteBtn.classList.toggle('track-ctrl-btn--active', !muted);
        showToast(`Track ${muted ? 'muted' : 'unmuted'}`, 'info');
      });
    }
    
    if (visibilityBtn) {
      visibilityBtn.addEventListener('click', () => {
        const visible = toggleTrackVisibility(trackId);
        visibilityBtn.textContent = visible ? '👁' : '🚫';
        visibilityBtn.classList.toggle('track-ctrl-btn--active', visible);
        
        const trackEl = document.querySelector(`.track[data-track-id="${trackId}"]`);
        if (trackEl) {
          trackEl.style.opacity = visible ? '1' : '0.3';
        }
      });
    }
    
    if (lockBtn) {
      lockBtn.addEventListener('click', () => {
        const locked = toggleTrackLock(trackId);
        lockBtn.textContent = locked ? '🔒' : '🔓';
        lockBtn.classList.toggle('track-ctrl-btn--active', locked);
        showToast(`Track ${locked ? 'locked' : 'unlocked'}`, 'info');
      });
    }
    
    const deleteBtn = header.querySelector('.track-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (confirm(`Are you sure you want to delete track ${trackId}?`)) {
          const trackEl = document.querySelector(`.track[data-track-id="${trackId}"]`);
          if (trackEl) trackEl.remove();
          header.remove();
          showToast(`Track deleted`, 'info');
        }
      });
    }
  });
}

// ── Add New Track ──
export function addNewTrack(type = 'video') {
  const trackId = `${type}${document.querySelectorAll(`.track--${type}`).length + 1}`;
  
  const header = document.createElement('div');
  header.className = 'track-header';
  header.dataset.trackId = trackId;
  header.innerHTML = `
    <div class="track-header__icon">${type === 'video' ? '🎦' : (type === 'text' ? 'T' : (type === 'fx' ? '✨' : '🎵'))}</div>
    <div class="track-header__info">
      <p class="track-header__name">${type.charAt(0).toUpperCase() + type.slice(1)} ${document.querySelectorAll(`.track--${type}`).length + 1}</p>
      <div class="track-header__controls">
        ${type === 'video' || type === 'audio' ? '<button class="track-ctrl-btn track-mute-btn" title="Mute">🔇</button>' : ''}
        <button class="track-ctrl-btn track-visibility-btn track-ctrl-btn--active" title="Visible">👁</button>
        <button class="track-ctrl-btn track-lock-btn" title="Lock">🔓</button>
        <button class="track-ctrl-btn track-delete-btn" title="Delete Track">🗑️</button>
      </div>
    </div>
  `;
  
  const addTrackHeader = document.querySelector('.track-header--add');
  if (addTrackHeader) {
    addTrackHeader.parentElement.insertBefore(header, addTrackHeader);
  }
  
  const track = document.createElement('div');
  track.className = `track track--${type}`;
  track.dataset.track = type;
  track.dataset.trackId = trackId;
  
  const trackArea = dom.trackArea;
  if (trackArea) {
    trackArea.appendChild(track);
  }
  
  initTrackState(trackId);
  initSingleTrackDropZone(track); // BUG-05: register drop zone
  
  // Wire controls for new header
  const muteBtn = header.querySelector('.track-mute-btn');
  const visBtn = header.querySelector('.track-visibility-btn');
  const lockBtn = header.querySelector('.track-lock-btn');
  muteBtn?.addEventListener('click', () => {
    const muted = toggleTrackMute(trackId);
    muteBtn.textContent = muted ? '🔇' : '🔊';
    muteBtn.classList.toggle('track-ctrl-btn--active', !muted);
    showToast(`Track ${muted ? 'muted' : 'unmuted'}`, 'info');
  });
  visBtn?.addEventListener('click', () => {
    const visible = toggleTrackVisibility(trackId);
    visBtn.textContent = visible ? '👁' : '🚫';
    visBtn.classList.toggle('track-ctrl-btn--active', visible);
    track.style.opacity = visible ? '1' : '0.3';
  });
  lockBtn?.addEventListener('click', () => {
    const locked = toggleTrackLock(trackId);
    lockBtn.textContent = locked ? '🔒' : '🔓';
    lockBtn.classList.toggle('track-ctrl-btn--active', locked);
    showToast(`Track ${locked ? 'locked' : 'unlocked'}`, 'info');
  });
  
  const deleteBtn = header.querySelector('.track-delete-btn');
  deleteBtn?.addEventListener('click', () => {
    if (confirm(`Are you sure you want to delete this track?`)) {
      track.remove();
      header.remove();
      showToast(`Track deleted`, 'info');
    }
  });

  showToast(`Added new ${type} track`, 'success');
  
  return track;
}

// ── Get All Clips ──
// ── Refresh Timeline Layout (Zoom/Resize) ──
export function refreshTimelineLayout() {
  const pps = pxPerSec();
  document.querySelectorAll('.clip').forEach(clip => {
    // Update Position
    const startTime = parseFloat(clip.dataset.startTime || 0);
    clip.style.left = `${startTime * pps}px`;
    
    // Update Width
    const trimStart = parseFloat(clip.dataset.trimStart || 0);
    const trimEnd = parseFloat(clip.dataset.trimEnd || 0);
    const speed = parseFloat(clip.dataset.speed || 1);
    const duration = (trimEnd - trimStart) / speed;
    const newWidth = Math.max(40, duration * pps);
    clip.style.width = `${newWidth}px`;
    
    // Update duration text
    const durEl = clip.querySelector('.clip__duration');
    if (durEl) durEl.textContent = formatDuration(duration);
  });
  
  // Render transitions
  document.querySelectorAll('.transition-btn').forEach(btn => btn.remove());
  const TRANSITION_ICONS = { fade: '⬛', wipe: '◧', dissolve: '🌫', zoom: '🔍', slide: '▶', blur: '💫', none: '+' };
  document.querySelectorAll('.track--video, .track--audio').forEach(track => {
    const clips = Array.from(track.querySelectorAll('.clip'))
      .sort((a, b) => getClipLeft(a) - getClipLeft(b));
    
    for (let i = 0; i < clips.length - 1; i++) {
      const c1 = clips[i];
      const c2 = clips[i+1];
      const c1Right = getClipLeft(c1) + getClipWidth(c1);
      const c2Left = getClipLeft(c2);
      
      if (Math.abs(c2Left - c1Right) < 20) {
        const appliedType = c1.dataset.transitionOut;
        const btn = document.createElement('div');
        btn.className = appliedType ? 'transition-btn transition-btn--applied' : 'transition-btn';
        btn.dataset.c1Id = c1.dataset.clipId;
        btn.dataset.c2Id = c2.dataset.clipId;
        btn.title = appliedType ? `Transition: ${appliedType}` : 'Add Transition';
        btn.innerHTML = appliedType ? (TRANSITION_ICONS[appliedType] || '✦') : '+';
        btn.style.left = `${c1Right}px`;
        
        // Left-click: show transition selector AND open FX tab
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          // Open FX tab in media panel
          const fxTab = document.querySelector('.tab[data-tab="transitions"]');
          if (fxTab) fxTab.click();
          showTransitionMenu(c1, c2, e.clientX, e.clientY);
        });

        // Right-click: copy / delete / properties
        btn.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          showTransitionContextMenu(c1, c2, btn, e.clientX, e.clientY);
        });

        track.appendChild(btn);
      }
    }
  });


  // Update dynamic duration based on content/viewport
  updateTimelineDuration();

  // Rebuild ruler
  buildRuler();
  
  // Sync playhead
  if (dom.playheadEl) {
    dom.playheadEl.style.left = `${playbackState.currentTime * pps}px`;
  }
}

let activeTransitionClips = null;
function showTransitionMenu(clip1, clip2, x, y) {
  if (!dom.transitionSelector) return;
  activeTransitionClips = { clip1, clip2 };
  dom.transitionSelector.style.display = 'block';
  dom.transitionSelector.style.left = `${Math.min(x, window.innerWidth - 200)}px`;
  dom.transitionSelector.style.top = `${Math.min(y, window.innerHeight - 220)}px`;
}

function showTransitionContextMenu(clip1, clip2, btn, x, y) {
  removePopover();
  const menu = document.createElement('div');
  menu.className = 'clip-property-popover';
  menu.style.left = `${Math.min(x, window.innerWidth - 240)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - 180)}px`;
  const applied = clip1.dataset.transitionOut || 'None';
  menu.innerHTML = `
    <h4>⚡ Transition</h4>
    <div class="prop-row"><label>Current</label><span style="color:var(--accent)">${applied}</span></div>
    <button class="prop-row-btn" id="tc-change">Change Transition</button>
    <button class="prop-row-btn prop-row-btn--danger" id="tc-remove">Remove Transition</button>
  `;
  document.body.appendChild(menu);
  menu.querySelector('#tc-change')?.addEventListener('click', () => {
    removePopover(); showTransitionMenu(clip1, clip2, x, y);
  });
  menu.querySelector('#tc-remove')?.addEventListener('click', () => {
    delete clip1.dataset.transitionOut; delete clip2.dataset.transitionIn;
    btn.className = 'transition-btn'; btn.innerHTML = '+'; btn.title = 'Add Transition';
    removePopover(); refreshTimelineLayout();
  });
  setTimeout(() => document.addEventListener('click', removePopover, { once: true }), 50);
}

document.addEventListener('click', (e) => {
  if (dom.transitionSelector && !e.target.closest('.transition-btn') && !e.target.closest('#transitionSelector')) {
    dom.transitionSelector.style.display = 'none';
  }
});

// Setup transition menu click listeners
export function initTransitionMenu() {
  if (!dom.transitionSelector) return;
  dom.transitionSelector.querySelectorAll('.context-menu__item').forEach(item => {
    item.addEventListener('click', () => {
      const type = item.dataset.transition;
      if (activeTransitionClips) {
        const { clip1, clip2 } = activeTransitionClips;
        if (type === 'none') {
          delete clip1.dataset.transitionOut;
          delete clip2.dataset.transitionIn;
          showToast('Transition removed', 'info');
        } else {
          clip1.dataset.transitionOut = type;
          clip2.dataset.transitionIn = type;
          showToast(`Applied ${type} transition`, 'success');
        }
        refreshTimelineLayout(); // This updates the + button icon immediately
      }
      dom.transitionSelector.style.display = 'none';
    });
  });
}

export function updateTimelineDuration() {
  if (!dom.trackArea) return;
  const pps = pxPerSec();
  
  // 1. Calculate max content end from all clips
  let maxEnd = 0;
  document.querySelectorAll('.clip').forEach(clip => {
    const start = parseFloat(clip.dataset.startTime || 0);
    const trimStart = parseFloat(clip.dataset.trimStart || 0);
    const trimEnd = parseFloat(clip.dataset.trimEnd || 0);
    const speed = parseFloat(clip.dataset.speed || 1);
    const dur = trimEnd > trimStart ? (trimEnd - trimStart) / speed : parseFloat(clip.style.width) / pps;
    maxEnd = Math.max(maxEnd, start + dur);
  });
  
  // 2. Visible duration covers at least the viewport
  const visibleDuration = (dom.trackArea.clientWidth || window.innerWidth) / pps;
  const padding = maxEnd > 0 ? 30 : 0; // 30s breathing room
  const newDuration = Math.max(visibleDuration, maxEnd + padding);
  
  const changed = Math.abs(TOTAL_DURATION - newDuration) > 0.5;
  if (changed) {
    setTotalDuration(newDuration);
    // Always rebuild ruler so time extends dynamically
    buildRuler();
    // Stretch all tracks so horizontal scrollbar works
    const totalPx = Math.ceil(newDuration * pps);
    document.querySelectorAll('.track').forEach(t => { t.style.minWidth = `${totalPx}px`; });
    if (dom.timeRuler) dom.timeRuler.style.minWidth = `${totalPx}px`;
  }
}

export function getAllClips() {
  return Array.from(document.querySelectorAll('.clip'));
}

// ── Get Clips in Time Range ──
export function getClipsInRange(startTime, endTime, trackEl = null) {
  const tracks = trackEl ? [trackEl] : document.querySelectorAll('.track');
  const clips = [];
  
  tracks.forEach(track => {
    track.querySelectorAll('.clip').forEach(clip => {
      const clipStart = pxToSeconds(getClipLeft(clip));
      const clipEnd = clipStart + pxToSeconds(getClipWidth(clip));
      
      if (clipStart < endTime && clipEnd > startTime) {
        clips.push({ clip, start: clipStart, end: clipEnd, track });
      }
    });
  });
  
  return clips.sort((a, b) => a.start - b.start);
}

// ── Find Clip At Time ──
export function findClipAtTime(timeSec, trackEl = null) {
  const tracks = trackEl ? [trackEl] : document.querySelectorAll('.track');
  
  for (const track of tracks) {
    for (const clip of track.querySelectorAll('.clip')) {
      const clipStart = pxToSeconds(getClipLeft(clip));
      const clipEnd = clipStart + pxToSeconds(getClipWidth(clip));
      
      if (timeSec >= clipStart && timeSec < clipEnd) {
        return clip;
      }
    }
  }
  
  return null;
}

// ── Playhead Drag ──
export function initPlayheadDrag() {
  let isDragging = false;
  
  const startDrag = (e) => {
    isDragging = true;
    dom.playheadEl?.classList.add('playhead--dragging');
    updatePlayheadFromEvent(e);
  };
  
  const moveDrag = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    updatePlayheadFromEvent(e);
  };
  
  const endDrag = () => {
    if (!isDragging) return;
    isDragging = false;
    dom.playheadEl?.classList.remove('playhead--dragging');
  };
  
  const updatePlayheadFromEvent = (e) => {
    const clientX = e.clientX || (e.touches?.[0]?.clientX || 0);
    if (!dom.trackArea) return;
    
    const rect = dom.trackArea.getBoundingClientRect();
    let x = clientX - rect.left + (dom.trackArea.scrollLeft || 0);
    x = Math.max(0, x);
    
    setPlayheadX(x);
    playbackState.currentTime = x / pxPerSec();
    
    if (!playbackState.isPlaying) {
      syncPlayerToTimeline(playbackState.currentTime);
    }
    
    if (dom.rulerTimeDisplay) {
      dom.rulerTimeDisplay.textContent = pxToTimecode(x);
    }
  };
  
  dom.playheadHead?.addEventListener('mousedown', startDrag);
  dom.timeRuler?.addEventListener('mousedown', startDrag);
  
  window.addEventListener('mousemove', moveDrag);
  window.addEventListener('mouseup', endDrag);
  
  dom.playheadHead?.addEventListener('touchstart', startDrag, { passive: false });
  dom.timeRuler?.addEventListener('touchstart', startDrag, { passive: false });
  window.addEventListener('touchmove', moveDrag, { passive: false });
  window.addEventListener('touchend', endDrag);
}

// ── Popover helpers ──
function removePopover() {
  document.querySelectorAll('.clip-property-popover').forEach(p => p.remove());
}

// ── Right-click property popovers ──
export function initClipRightClickMenus() {
  document.addEventListener('contextmenu', (e) => {
    const clip = e.target.closest('.clip');
    if (!clip) return;
    // Only intercept non-video/audio for property popover (video/audio handled by tools.js contextMenu)
    const type = clip.dataset.type || '';
    if (type === 'video') { handleVideoRightClick(clip, e); return; }
    if (type === 'audio') { handleAudioRightClick(clip, e); return; }
    if (clip.parentElement?.dataset?.track === 'text') { handleTextRightClick(clip, e); return; }
    if (clip.parentElement?.dataset?.track === 'vfx') { handleVfxRightClick(clip, e); return; }
  });
}

function handleVideoRightClick(clip, e) {
  e.preventDefault();
  removePopover();
  const assetId = clip.dataset.assetId;
  const menu = document.createElement('div');
  menu.className = 'clip-property-popover';
  menu.style.left = `${Math.min(e.clientX, window.innerWidth - 250)}px`;
  menu.style.top = `${Math.min(e.clientY, window.innerHeight - 200)}px`;
  menu.innerHTML = `
    <h4>🎬 Video Clip</h4>
    <div class="prop-row"><label>Speed</label><input type="number" id="rcp-speed" value="${clip.dataset.speed||1}" step="0.1" min="0.1" max="4" style="width:70px;background:var(--bg-panel-2);border:1px solid var(--border);color:var(--text-primary);padding:3px;border-radius:4px;"></div>
    <div class="prop-row"><label>Volume</label><input type="range" id="rcp-vol" min="0" max="200" value="${clip.dataset.volume||100}"></div>
    <button class="prop-row-btn" id="rcp-separate">🎵 Separate Audio Track</button>
    <button class="prop-row-btn prop-row-btn--danger" id="rcp-delete">🗑 Delete Clip</button>
  `;
  document.body.appendChild(menu);
  menu.querySelector('#rcp-speed')?.addEventListener('change', (ev) => { clip.dataset.speed = ev.target.value; });
  menu.querySelector('#rcp-vol')?.addEventListener('input', (ev) => { clip.dataset.volume = ev.target.value; });
  menu.querySelector('#rcp-separate')?.addEventListener('click', () => { separateAudioFromVideo(clip); removePopover(); });
  menu.querySelector('#rcp-delete')?.addEventListener('click', () => { clip.remove(); refreshTimelineLayout(); removePopover(); });
  setTimeout(() => document.addEventListener('click', removePopover, { once: true }), 50);
}

function handleAudioRightClick(clip, e) {
  e.preventDefault();
  removePopover();
  const menu = document.createElement('div');
  menu.className = 'clip-property-popover';
  menu.style.left = `${Math.min(e.clientX, window.innerWidth - 260)}px`;
  menu.style.top = `${Math.min(e.clientY, window.innerHeight - 280)}px`;
  menu.innerHTML = `
    <h4>🎵 Audio Properties</h4>
    <div class="prop-row"><label>Volume</label><input type="range" id="ap-vol" min="0" max="200" value="${clip.dataset.volume||100}"></div>
    <div class="prop-row"><label>Fade In</label><input type="range" id="ap-fi" min="0" max="5" step="0.1" value="${clip.dataset.fadeIn||0}"></div>
    <div class="prop-row"><label>Fade Out</label><input type="range" id="ap-fo" min="0" max="5" step="0.1" value="${clip.dataset.fadeOut||0}"></div>
    <button class="prop-row-btn prop-row-btn--ai" id="ap-ai">✨ AI Vocal Isolation</button>
    <button class="prop-row-btn prop-row-btn--danger" id="ap-del">🗑 Delete Clip</button>
  `;
  document.body.appendChild(menu);
  menu.querySelector('#ap-vol')?.addEventListener('input', (ev) => { clip.dataset.volume = ev.target.value; });
  menu.querySelector('#ap-fi')?.addEventListener('input', (ev) => { clip.dataset.fadeIn = ev.target.value; });
  menu.querySelector('#ap-fo')?.addEventListener('input', (ev) => { clip.dataset.fadeOut = ev.target.value; });
  menu.querySelector('#ap-ai')?.addEventListener('click', () => {
    clip.dataset.aiVocalIsolation = clip.dataset.aiVocalIsolation === 'true' ? 'false' : 'true';
    const btn = menu.querySelector('#ap-ai');
    const on = clip.dataset.aiVocalIsolation === 'true';
    if (btn) btn.textContent = on ? '✅ AI Vocal ON' : '✨ AI Vocal Isolation';
    showToast(on ? 'AI Vocal Isolation enabled' : 'AI Vocal Isolation disabled', 'info');
  });
  menu.querySelector('#ap-del')?.addEventListener('click', () => { clip.remove(); refreshTimelineLayout(); removePopover(); });
  setTimeout(() => document.addEventListener('click', removePopover, { once: true }), 50);
}

function handleTextRightClick(clip, e) {
  e.preventDefault();
  removePopover();
  const menu = document.createElement('div');
  menu.className = 'clip-property-popover';
  menu.style.left = `${Math.min(e.clientX, window.innerWidth - 250)}px`;
  menu.style.top = `${Math.min(e.clientY, window.innerHeight - 220)}px`;
  menu.innerHTML = `
    <h4>T Text Properties</h4>
    <div class="prop-row"><label>Text</label><input type="text" id="tp-text" value="${clip.dataset.text||''}" style="flex:1;background:var(--bg-panel-2);border:1px solid var(--border);color:var(--text-primary);padding:3px 6px;border-radius:4px;"></div>
    <div class="prop-row"><label>Font Size</label><input type="number" id="tp-size" value="${clip.dataset.fontSize||40}" min="10" max="200" style="width:70px;background:var(--bg-panel-2);border:1px solid var(--border);color:var(--text-primary);padding:3px;border-radius:4px;"></div>
    <div class="prop-row"><label>Color</label><input type="color" id="tp-color" value="${clip.dataset.color||'#ffffff'}"></div>
    <div class="prop-row"><label>Animation</label><select id="tp-anim" style="flex:1;background:var(--bg-panel-2);border:1px solid var(--border);color:var(--text-primary);padding:3px;border-radius:4px;"><option value="none">None</option><option value="fade">Fade</option><option value="slide">Slide Up</option><option value="typewrite">Typewrite</option></select></div>
    <button class="prop-row-btn prop-row-btn--danger" id="tp-del">🗑 Delete</button>
  `;
  document.body.appendChild(menu);
  menu.querySelector('#tp-text')?.addEventListener('input', (ev) => { clip.dataset.text = ev.target.value; clip.querySelector('.clip__label').textContent = 'T ' + ev.target.value; });
  menu.querySelector('#tp-size')?.addEventListener('input', (ev) => { clip.dataset.fontSize = ev.target.value; });
  menu.querySelector('#tp-color')?.addEventListener('input', (ev) => { clip.dataset.color = ev.target.value; });
  menu.querySelector('#tp-anim')?.addEventListener('change', (ev) => { clip.dataset.animation = ev.target.value; });
  menu.querySelector('#tp-del')?.addEventListener('click', () => { clip.remove(); refreshTimelineLayout(); removePopover(); });
  setTimeout(() => document.addEventListener('click', removePopover, { once: true }), 50);
}

function handleVfxRightClick(clip, e) {
  e.preventDefault();
  removePopover();
  const menu = document.createElement('div');
  menu.className = 'clip-property-popover';
  menu.style.left = `${Math.min(e.clientX, window.innerWidth - 250)}px`;
  menu.style.top = `${Math.min(e.clientY, window.innerHeight - 200)}px`;
  menu.innerHTML = `
    <h4>✨ VFX Properties</h4>
    <div class="prop-row"><label>Effect</label><span style="color:var(--accent)">${clip.dataset.effect||'None'}</span></div>
    <div class="prop-row"><label>Intensity</label><input type="range" id="vp-int" min="0" max="100" value="${clip.dataset.intensity||50}"></div>
    <div class="prop-row"><label>Blend</label><select id="vp-blend" style="flex:1;background:var(--bg-panel-2);border:1px solid var(--border);color:var(--text-primary);padding:3px;border-radius:4px;"><option value="normal">Normal</option><option value="screen">Screen</option><option value="overlay">Overlay</option><option value="multiply">Multiply</option></select></div>
    <button class="prop-row-btn prop-row-btn--danger" id="vp-del">🗑 Delete</button>
  `;
  document.body.appendChild(menu);
  menu.querySelector('#vp-int')?.addEventListener('input', (ev) => { clip.dataset.intensity = ev.target.value; });
  menu.querySelector('#vp-blend')?.addEventListener('change', (ev) => { clip.dataset.blendMode = ev.target.value; });
  menu.querySelector('#vp-del')?.addEventListener('click', () => { clip.remove(); refreshTimelineLayout(); removePopover(); });
  setTimeout(() => document.addEventListener('click', removePopover, { once: true }), 50);
}

// ── Audio Separation from Video ──
export function separateAudioFromVideo(videoClip) {
  const assetId = videoClip.dataset.assetId;
  const { uploadedAssets, audioElementCache } = window.__vidforgeState || {};
  const audioTrack = document.querySelector('.track--audio');
  if (!audioTrack) { showToast('No audio track found', 'error'); return; }

  const startTime = parseFloat(videoClip.dataset.startTime || 0);
  const leftPx = startTime * pxPerSec();

  // Create a fake audio clip element representing the embedded audio
  const dur = parseFloat(videoClip.dataset.trimEnd) - parseFloat(videoClip.dataset.trimStart);
  const width = Math.max(80, dur * pxPerSec());

  const audioClip = document.createElement('div');
  audioClip.className = 'clip clip--audio clip--audio-separated';
  audioClip.style.left = `${leftPx}px`;
  audioClip.style.width = `${width}px`;
  audioClip.dataset.assetId = assetId;
  audioClip.dataset.type = 'audio';
  audioClip.dataset.trimStart = videoClip.dataset.trimStart;
  audioClip.dataset.trimEnd = videoClip.dataset.trimEnd;
  audioClip.dataset.speed = videoClip.dataset.speed || 1;
  audioClip.dataset.volume = videoClip.dataset.volume || 100;
  audioClip.dataset.startTime = startTime;
  audioClip.dataset.separatedFrom = videoClip.dataset.clipId;
  audioClip.innerHTML = `
    <div class="clip__thumb"></div>
    <div class="clip__label">🔊 Audio</div>
    <div class="clip__duration">${formatDuration(dur)}</div>
    <div class="clip__waveform clip__waveform--audio"><canvas class="waveform-canvas" width="${width}" height="30" style="width:100%;height:100%;pointer-events:none;"></canvas></div>
    <div class="clip__resize clip__resize--left"></div>
    <div class="clip__resize clip__resize--right"></div>
  `;
  audioTrack.appendChild(audioClip);
  makeClipDraggable(audioClip);
  makeClipResizable(audioClip);
  // Mute source video clip audio
  videoClip.dataset.muteAudio = 'true';
  showToast('Audio separated to audio track', 'success');
  refreshTimelineLayout();
}