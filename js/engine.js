// ===================================================
// js/engine.js — Playback Loop & Canvas Render Engine v2.0
// FIXES: showToast import, fastForward clamp, transitions, multi-track audio
// ===================================================
import { 
  uploadedAssets, videoElementCache, audioElementCache, imageElementCache,
  playbackState, dom, TOTAL_DURATION, projectSettings, textOverlays,
  trackStates, audioMixer, initAudioMixer
} from './state.js';
import { pxPerSec, pxToTimecode, formatTimecode, clamp, seekVideo, showToast } from './utils.js';
import { renderVideoFrame, renderImageFrame, applyVolumeMultiplier, getFilterString, renderTransition } from './codec.js';
import { getClipLeft, getClipWidth, findClipAtTime } from './timeline.js';

// ── Check if timeline has content ──
function hasTimelineContent() {
  const videoClips = dom.videoTrack?.querySelectorAll('.clip').length || 0;
  const audioClips = dom.audioTrack?.querySelectorAll('.clip').length || 0;
  return videoClips > 0 || audioClips > 0;
}

// ── Sync Player to Timeline Position ──
export function syncPlayerToTimeline(timeSec) {
  if (!hasTimelineContent()) {
    if (dom.playerPlaceholder) dom.playerPlaceholder.style.display = 'flex';
    if (dom.previewCanvas) dom.previewCanvas.style.display = 'none';
    if (dom.previewImage) dom.previewImage.style.display = 'none';
    return;
  }

  const activeVideoClip = findActiveClip('video', timeSec);
  const activeAudioClip = findActiveClip('audio', timeSec);

  playbackState.activeVideoClip = activeVideoClip;
  playbackState.activeAudioClip = activeAudioClip;

  const canvas = dom.previewCanvas;
  const ctx = canvas?.getContext('2d', { alpha: false, willReadFrequently: false });

  if (canvas && ctx) {
    if (activeVideoClip) {
      // Check for transition with next clip
      const transitionType = activeVideoClip.dataset.transition;
      if (transitionType) {
        const clipLeft = getClipLeft(activeVideoClip);
        const clipWidth = getClipWidth(activeVideoClip);
        const clipEnd = (clipLeft + clipWidth) / pxPerSec();
        const TRANSITION_DURATION = parseFloat(activeVideoClip.dataset.transitionDuration || 1.0);
        const transitionStart = clipEnd - TRANSITION_DURATION;

        if (timeSec >= transitionStart) {
          const progress = Math.min(1, (timeSec - transitionStart) / TRANSITION_DURATION);
          const nextClip = findNextClip('video', timeSec);
          if (nextClip) {
            renderTransitionFrame(ctx, canvas, activeVideoClip, nextClip, timeSec, progress, transitionType);
          } else {
            renderActiveVideoClip(ctx, canvas, activeVideoClip, timeSec);
          }
        } else {
          renderActiveVideoClip(ctx, canvas, activeVideoClip, timeSec);
        }
      } else {
        renderActiveVideoClip(ctx, canvas, activeVideoClip, timeSec);
      }
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pauseAllVideos();
      canvas.style.display = 'none';
    }
  }

  handleMultiTrackAudio(timeSec);
  renderTextOverlays(timeSec);
  updatePlaceholder(activeVideoClip, activeAudioClip);
}

// ── Find Active Clip ──
function findActiveClip(type, timeSec) {
  const tracks = document.querySelectorAll(`.track[data-track="${type}"]`);
  let activeClip = null;

  tracks.forEach(track => {
    const trackId = track.dataset.trackId;
    // Skip muted tracks for audio
    if (type === 'audio' && trackStates.get(trackId)?.muted) return;

    const clips = Array.from(track.querySelectorAll('.clip'));
    const found = clips.find(clip => {
      const leftPx = getClipLeft(clip);
      const widthPx = getClipWidth(clip);
      const startSec = leftPx / pxPerSec();
      const endSec = (leftPx + widthPx) / pxPerSec();
      return timeSec >= startSec && timeSec < endSec;
    });
    if (found) activeClip = found;
  });

  return activeClip;
}

// ── Find Next Clip (for transitions) ──
function findNextClip(type, timeSec) {
  const tracks = document.querySelectorAll(`.track[data-track="${type}"]`);
  let nextClip = null;
  let nextStart = Infinity;

  tracks.forEach(track => {
    const clips = Array.from(track.querySelectorAll('.clip'));
    clips.forEach(clip => {
      const startSec = getClipLeft(clip) / pxPerSec();
      if (startSec > timeSec && startSec < nextStart) {
        nextStart = startSec;
        nextClip = clip;
      }
    });
  });

  return nextClip;
}

// ── Render Transition Between Two Clips ──
function renderTransitionFrame(ctx, canvas, clipA, clipB, timeSec, progress, transitionType) {
  const parent = canvas.parentElement;
  if (parent && (canvas.width !== parent.clientWidth || canvas.height !== parent.clientHeight)) {
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
  }

  // Render clipA to offscreen canvas
  const offA = document.createElement('canvas');
  offA.width = canvas.width;
  offA.height = canvas.height;
  const ctxA = offA.getContext('2d');

  const assetIdA = clipA.dataset.assetId;
  const assetA = uploadedAssets.find(a => a.id === assetIdA);
  if (assetA?.type === 'video') {
    const vidA = videoElementCache.get(assetIdA);
    if (vidA) renderVideoFrame(ctxA, offA, vidA, null);
  } else if (assetA?.type === 'image') {
    const imgA = imageElementCache.get(assetIdA);
    if (imgA?.complete) renderImageFrame(ctxA, offA, imgA, null);
  }

  // Render clipB to offscreen canvas
  const offB = document.createElement('canvas');
  offB.width = canvas.width;
  offB.height = canvas.height;
  const ctxB = offB.getContext('2d');

  const assetIdB = clipB.dataset.assetId;
  const assetB = uploadedAssets.find(a => a.id === assetIdB);
  if (assetB?.type === 'video') {
    const vidB = videoElementCache.get(assetIdB);
    if (vidB) renderVideoFrame(ctxB, offB, vidB, null);
  } else if (assetB?.type === 'image') {
    const imgB = imageElementCache.get(assetIdB);
    if (imgB?.complete) renderImageFrame(ctxB, offB, imgB, null);
  }

  // Composite with transition
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  renderTransition(ctx, canvas, offA, offB, progress, transitionType);
  canvas.style.display = 'block';
}

// ── Render Active Video Clip ──
function renderActiveVideoClip(ctx, canvas, clip, timeSec) {
  const assetId = clip.dataset.assetId;
  const asset = uploadedAssets.find(a => a.id === assetId);
  if (!asset) return;

  const parent = canvas.parentElement;
  if (parent && (canvas.width !== parent.clientWidth || canvas.height !== parent.clientHeight)) {
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (asset.type === 'video') {
    renderVideoClip(ctx, canvas, clip, asset, timeSec);
  } else if (asset.type === 'image') {
    renderImageClip(ctx, canvas, clip, asset);
  }

  const filter = clip.dataset.filter;
  if (filter) {
    applyFilterToCanvas(ctx, canvas, filter);
  }

  canvas.style.display = 'block';
}

// ── Render Video Clip ──
function renderVideoClip(ctx, canvas, clip, asset, timeSec) {
  const crop = clip.dataset.crop ? JSON.parse(clip.dataset.crop) : null;
  const hiddenVideo = videoElementCache.get(asset.id);
  if (!hiddenVideo) return;

  const clipStartPx = getClipLeft(clip);
  const clipStartSec = clipStartPx / pxPerSec();
  const trimStart = parseFloat(clip.dataset.trimStart || 0);
  const trimEnd = parseFloat(clip.dataset.trimEnd || clip.dataset.baseDur || 0);
  const speed = Math.max(0.1, parseFloat(clip.dataset.speed || 1));

  const offsetSec = timeSec - clipStartSec;
  let expectedLocalTime = trimStart + (offsetSec * speed);
  expectedLocalTime = Math.min(Math.max(expectedLocalTime, trimStart), trimEnd);

  hiddenVideo.muted = false;

  if (hiddenVideo.playbackRate !== speed) {
    hiddenVideo.playbackRate = speed;
  }

  const drift = Math.abs(hiddenVideo.currentTime - expectedLocalTime);
  
  if (playbackState.isPlaying) {
    if (hiddenVideo.paused) {
      hiddenVideo.play().catch(err => console.warn('Video play error:', err));
    }
    // Continuous sync during playback if drift is too large
    if (drift > 0.15) {
      hiddenVideo.currentTime = expectedLocalTime;
    }
  } else {
    // Precise sync when scrubbed/stopped
    if (drift > 0.04) {
      hiddenVideo.currentTime = expectedLocalTime;
    }
    if (!hiddenVideo.paused) hiddenVideo.pause();
  }

  const clipVolume = parseFloat(clip.dataset.volume || 100) / 100;
  const masterVolume = parseInt(dom.volumeSlider?.value || 80, 10) / 100;
  hiddenVideo.volume = Math.min(1, clipVolume * masterVolume);

  renderVideoFrame(ctx, canvas, hiddenVideo, crop);
}

// ── Render Image Clip ──
function renderImageClip(ctx, canvas, clip, asset) {
  const crop = clip.dataset.crop ? JSON.parse(clip.dataset.crop) : null;
  const imgCache = imageElementCache.get(asset.id);
  if (!imgCache || !imgCache.complete) return;
  renderImageFrame(ctx, canvas, imgCache, crop);
}

// ── Apply Filter to Canvas ──
function applyFilterToCanvas(ctx, canvas, filterName) {
  const filterString = getFilterString(filterName);
  if (!filterString) return;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.putImageData(imageData, 0, 0);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.filter = filterString;
  ctx.drawImage(tempCanvas, 0, 0);
  ctx.filter = 'none';
}

// ── Multi-Track Audio Mixing ──
function handleMultiTrackAudio(timeSec) {
  // First, handle the video clip's embedded audio via the previewAudio element
  const activeVideoClip = playbackState.activeVideoClip;
  const activeAudioClip = findActiveClip('audio', timeSec);

  const mediaEl = dom.previewAudio;
  if (!mediaEl) return;

  // Find all active audio clips across all audio tracks
  const allAudioTracks = document.querySelectorAll('.track[data-track="audio"]');
  const allActiveAudioClips = [];

  allAudioTracks.forEach(track => {
    const trackId = track.dataset.trackId;
    if (trackStates.get(trackId)?.muted) return;

    track.querySelectorAll('.clip').forEach(clip => {
      const startSec = getClipLeft(clip) / pxPerSec();
      const endSec = (getClipLeft(clip) + getClipWidth(clip)) / pxPerSec();
      if (timeSec >= startSec && timeSec < endSec) {
        allActiveAudioClips.push(clip);
      }
    });
  });

  // Priority: Use first active audio track clip for main preview audio
  let activeClip = allActiveAudioClips[0] || null;
  let asset = null;

  if (activeClip) {
    const assetId = activeClip.dataset.assetId;
    asset = uploadedAssets.find(a => a.id === assetId);
    if (!asset || asset.type !== 'audio') {
      activeClip = null;
      asset = null;
    }
  }

  // Fall back to video clip's embedded audio ONLY if no audio clip is found
  // AND mute the hidden video element if we are using the previewAudio instead
  // Actually, standardizing: Video clips use hiddenVideo, Audio clips use previewAudio
  
  if (activeClip && asset && asset.type === 'audio') {
    if (mediaEl.dataset.activeAssetId !== asset.id) {
      mediaEl.src = asset.objectURL;
      mediaEl.dataset.activeAssetId = asset.id;
      mediaEl.load();
    }

    const clipStartPx = getClipLeft(activeClip);
    const clipStartSec = clipStartPx / pxPerSec();
    const trimStart = parseFloat(activeClip.dataset.trimStart || 0);
    const speed = Math.max(0.1, parseFloat(activeClip.dataset.speed || 1));
    const offsetSec = timeSec - clipStartSec;
    const expectedLocalTime = trimStart + (offsetSec * speed);

    if (mediaEl.playbackRate !== speed) {
      mediaEl.playbackRate = speed;
    }

    const drift = Math.abs(mediaEl.currentTime - expectedLocalTime);
    if (drift > 0.2 || !playbackState.isPlaying) {
      mediaEl.currentTime = expectedLocalTime;
    }

    if (playbackState.isPlaying && mediaEl.paused) {
      mediaEl.play().catch(err => console.warn('Audio play error:', err));
    }

    const clipVolume = parseFloat(activeClip.dataset.volume || 100) / 100;
    const masterVolume = parseInt(dom.volumeSlider?.value || 80, 10) / 100;
    mediaEl.volume = Math.min(1, clipVolume * masterVolume);
  } else {
    if (!mediaEl.paused) mediaEl.pause();
    mediaEl.removeAttribute('data-active-asset-id');
  }
}

// ── Render Text Overlays ──
function renderTextOverlays(timeSec) {
  const layer = dom.textOverlayLayer;
  if (!layer) return;

  layer.innerHTML = '';

  textOverlays.forEach(overlay => {
    if (timeSec >= overlay.startTime && timeSec < overlay.endTime) {
      const el = document.createElement('div');
      el.className = `text-overlay text-overlay--${overlay.type || 'custom'}`;
      el.textContent = overlay.text;
      el.style.cssText = `
        position: absolute;
        left: ${overlay.x || 50}%;
        top: ${overlay.y || 50}%;
        transform: translate(-50%, -50%);
        font-size: ${overlay.fontSize || 48}px;
        color: ${overlay.color || '#ffffff'};
        font-family: Inter, sans-serif;
        font-weight: bold;
        text-shadow: 2px 2px 8px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.5);
        pointer-events: none;
        z-index: 100;
        white-space: pre-wrap;
        text-align: center;
        max-width: 90%;
        word-break: break-word;
      `;
      layer.appendChild(el);
    }
  });
}

// ── Update Placeholder Visibility ──
function updatePlaceholder(activeVideoClip, activeAudioClip) {
  if (dom.playerPlaceholder) {
    const hasContent = activeVideoClip || activeAudioClip;
    dom.playerPlaceholder.style.display = hasContent ? 'none' : 'flex';
  }
}

// ── Pause All Videos ──
function pauseAllVideos() {
  videoElementCache.forEach(v => {
    if (!v.paused) v.pause();
  });
}

// ── Stop Playback ──
export function stopPlayback() {
  playbackState.isPlaying = false;
  if (dom.btnPlay) dom.btnPlay.textContent = '▶';

  if (playbackState.rafId) {
    cancelAnimationFrame(playbackState.rafId);
    playbackState.rafId = null;
  }

  const pa = dom.previewAudio;
  if (pa && !pa.paused) pa.pause();
  pauseAllVideos();
}

// ── Set Playhead Position ──
export function setPlayheadX(px) {
  if (dom.playheadEl) {
    dom.playheadEl.style.left = `${px}px`;
  }
  if (dom.timecodeDisplay) {
    const current = pxToTimecode(px);
    const lastClipEnd = getLastClipEndTime();
    const total = lastClipEnd > 0 ? lastClipEnd : TOTAL_DURATION;
    dom.timecodeDisplay.textContent = `${current} / ${formatTimecode(total)}`;
  }
  // Update ruler time display too
  if (dom.rulerTimeDisplay) {
    dom.rulerTimeDisplay.textContent = pxToTimecode(px);
  }
}

// ── Calculate Last Clip End Time ──
export function getLastClipEndTime() {
  let lastEnd = 0;
  document.querySelectorAll('.clip').forEach(clip => {
    const left = getClipLeft(clip);
    const width = getClipWidth(clip);
    const endTime = (left + width) / pxPerSec();
    if (endTime > lastEnd) lastEnd = endTime;
  });
  return lastEnd;
}

// ── Playback Tick ──
export function playbackTick(now) {
  if (!playbackState.isPlaying) return;

  const deltaTime = (now - playbackState.lastTickTime) / 1000;
  playbackState.lastTickTime = now;
  playbackState.currentTime += deltaTime;

  const lastClipEnd = getLastClipEndTime();
  const endBoundary = lastClipEnd > 0 ? lastClipEnd : TOTAL_DURATION;

  if (playbackState.currentTime >= endBoundary) {
    if (playbackState.loop && playbackState.loopStart < playbackState.loopEnd) {
      playbackState.currentTime = playbackState.loopStart;
    } else {
      playbackState.currentTime = endBoundary;
      setPlayheadX(endBoundary * pxPerSec());
      stopPlayback();
      return;
    }
  }

  setPlayheadX(playbackState.currentTime * pxPerSec());
  syncPlayerToTimeline(playbackState.currentTime);

  // Auto-scroll playhead into view
  const playheadPx = playbackState.currentTime * pxPerSec();
  if (dom.trackArea) {
    const rect = dom.trackArea.getBoundingClientRect();
    const visibleEnd = dom.trackArea.scrollLeft + rect.width - 40;
    if (playheadPx > visibleEnd) {
      dom.trackArea.scrollLeft = playheadPx - rect.width / 2;
    }
  }

  playbackState.rafId = requestAnimationFrame(playbackTick);
}

// ── Start Playback ──
export function startPlayback() {
  if (playbackState.isPlaying) return;

  if (!hasTimelineContent()) {
    showToast('Timeline is empty — add media first', 'warning');
    return;
  }

  // Resume AudioContext if suspended
  if (window.__audioContext && window.__audioContext.state === 'suspended') {
    window.__audioContext.resume();
  }

  playbackState.isPlaying = true;
  if (dom.btnPlay) dom.btnPlay.textContent = '⏸';

  playbackState.currentTime = (parseFloat(dom.playheadEl?.style.left) || 0) / pxPerSec();
  playbackState.lastTickTime = performance.now();
  playbackState.mode = 'timeline';
  playbackState.rafId = requestAnimationFrame(playbackTick);
}

// ── Toggle Playback ──
export function togglePlayback() {
  if (playbackState.isPlaying) stopPlayback();
  else startPlayback();
}

// ── Jump to Start ──
export function jumpToStart() {
  stopPlayback();
  playbackState.currentTime = 0;
  setPlayheadX(0);
  syncPlayerToTimeline(0);
}

// ── Jump to End ──
export function jumpToEnd() {
  stopPlayback();
  const lastClipEnd = getLastClipEndTime();
  const target = lastClipEnd > 0 ? lastClipEnd : TOTAL_DURATION;
  playbackState.currentTime = target;
  setPlayheadX(target * pxPerSec());
  syncPlayerToTimeline(target);
}

// ── Rewind ──
export function rewind(seconds = 5) {
  stopPlayback();
  playbackState.currentTime = Math.max(0, playbackState.currentTime - seconds);
  setPlayheadX(playbackState.currentTime * pxPerSec());
  syncPlayerToTimeline(playbackState.currentTime);
}

// ── Fast Forward — FIX: use lastClipEnd not TOTAL_DURATION ──
export function fastForward(seconds = 5) {
  stopPlayback();
  const lastClipEnd = getLastClipEndTime();
  const maxTime = lastClipEnd > 0 ? lastClipEnd : TOTAL_DURATION;
  playbackState.currentTime = Math.min(maxTime, playbackState.currentTime + seconds);
  setPlayheadX(playbackState.currentTime * pxPerSec());
  syncPlayerToTimeline(playbackState.currentTime);
}

// ── Show Preview Element ──
export function showPreviewEl(type) {
  const canvas = dom.previewCanvas;
  const pa = dom.previewAudio;
  const previewImage = dom.previewImage;

  if (canvas) canvas.style.display = 'none';
  if (pa) pa.style.display = 'none';
  if (previewImage) previewImage.style.display = 'none';

  if (type === 'video' && canvas) canvas.style.display = 'block';
  else if (type === 'audio' && pa) pa.style.display = 'block';
  else if (type === 'image' && previewImage) previewImage.style.display = 'block';

  if (dom.playerPlaceholder) dom.playerPlaceholder.style.display = 'none';
}

// ── Stop Preview ──
export function stopPreview() {
  const canvas = dom.previewCanvas;
  const pa = dom.previewAudio;
  const previewImage = dom.previewImage;

  if (canvas) canvas.style.display = 'none';
  if (pa) { pa.pause(); pa.style.display = 'none'; }
  if (previewImage) previewImage.style.display = 'none';

  pauseAllVideos();
  if (dom.playerPlaceholder) dom.playerPlaceholder.style.display = '';
  if (dom.btnPlay) dom.btnPlay.textContent = '▶';

  if (window.__previewRaf) {
    cancelAnimationFrame(window.__previewRaf);
    window.__previewRaf = null;
  }
}

// ── Seek to Time ──
export function seekToTime(timeSec) {
  const lastEnd = getLastClipEndTime();
  const maxTime = lastEnd > 0 ? lastEnd : TOTAL_DURATION;
  stopPlayback();
  playbackState.currentTime = clamp(timeSec, 0, maxTime);
  setPlayheadX(playbackState.currentTime * pxPerSec());
  syncPlayerToTimeline(playbackState.currentTime);
}

// ── Seek to Percentage ──
export function seekToPercent(percent) {
  seekToTime((percent / 100) * TOTAL_DURATION);
}

// ── Loop Region ──
export function setLoopRegion(startTime, endTime) {
  playbackState.loop = true;
  playbackState.loopStart = startTime;
  playbackState.loopEnd = endTime;
}

export function clearLoopRegion() {
  playbackState.loop = false;
  playbackState.loopStart = 0;
  playbackState.loopEnd = 0;
}