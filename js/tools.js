// ===================================================
// js/tools.js — UI Toolbar Actions & Logic v2.0
// ===================================================
import { 
  dom, selectedClip, historyStack, historyIdx, setHistoryIdx,
  activeTool, setActiveTool, uploadedAssets, textOverlays, getNextTextOverlayId,
  playbackState, projectSettings, updateProjectSettings, exportState,
  videoElementCache, audioElementCache, imageElementCache, pushHistory,
  clipboardData, setClipboardData, inOutPoints, setInPoint, setOutPoint, clearInOutPoints
} from './state.js';
import { 
  makeClipDraggable, makeClipResizable, selectClip, addClipToTrack,
  applySpeedToClip, updateTrimInputs, getClipLeft, getClipWidth, addNewTrack,
  refreshTimelineLayout
} from './timeline.js';
import { pxPerSec, showToast, formatDuration, clamp, downloadBlob, autoSaveProject } from './utils.js';
import { syncPlayerToTimeline, stopPlayback, jumpToStart, jumpToEnd, rewind, fastForward } from './engine.js';
import { getFilterString, renderTransition, renderTextOverlay, transcodeToMP4 } from './codec.js';

// ── Undo ──
export function handleUndo() {
  if (historyIdx < 0) {
    showToast('Nothing to undo', 'info');
    return;
  }
  
  const act = historyStack[historyIdx];
  setHistoryIdx(historyIdx - 1);
  
  switch (act.type) {
    case 'delete':
      act.track.appendChild(act.clip);
      makeClipDraggable(act.clip);
      makeClipResizable(act.clip);
      break;
    case 'add':
      act.clip.remove();
      break;
    case 'move':
      act.clip.style.left = `${act.oldLeft}px`;
      break;
    case 'resize':
      act.clip.style.left = `${act.oldLeft}px`;
      act.clip.style.width = `${act.oldWidth}px`;
      break;
    case 'split':
      act.clipA.remove();
      if (act.clipB && act.clipB.parentElement) act.clipB.remove(); // BUG-06 fix
      act.track.appendChild(act.originalClip);
      makeClipDraggable(act.originalClip);
      makeClipResizable(act.originalClip);
      break;
  }
  
  showToast('Undo', 'info');
}

// ── Redo ──
export function handleRedo() {
  if (historyIdx >= historyStack.length - 1) {
    showToast('Nothing to redo', 'info');
    return;
  }
  
  setHistoryIdx(historyIdx + 1);
  const act = historyStack[historyIdx];
  
  switch (act.type) {
    case 'delete':
      if (selectedClip === act.clip) selectClip(null);
      act.clip.remove();
      break;
    case 'add':
      act.track.appendChild(act.clip);
      makeClipDraggable(act.clip);
      makeClipResizable(act.clip);
      break;
    case 'move':
      act.clip.style.left = `${act.newLeft}px`;
      break;
    case 'resize':
      act.clip.style.left = `${act.newLeft}px`;
      act.clip.style.width = `${act.newWidth}px`;
      break;
    case 'split':
      act.originalClip.remove();
      act.track.appendChild(act.clipA);
      act.track.appendChild(act.clipB);
      makeClipDraggable(act.clipA);
      makeClipResizable(act.clipA);
      makeClipDraggable(act.clipB);
      makeClipResizable(act.clipB);
      break;
  }
  
  showToast('Redo', 'info');
}

// ── Split Clip ──
export function handleSplit() {
  if (!selectedClip) {
    showToast('Select a clip first', 'warning');
    return;
  }

  const clipLeft = getClipLeft(selectedClip);
  const clipWidth = getClipWidth(selectedClip);
  const playX = parseFloat(dom.playheadEl?.style.left) || 0;
  const splitPt = playX - clipLeft;

  if (splitPt <= 2 || splitPt >= clipWidth - 2) {
    showToast('Move the playhead inside the selected clip', 'warning');
    return;
  }

  const trackEl = selectedClip.parentElement;
  const assetId = selectedClip.dataset.assetId || '';
  const speed = selectedClip.dataset.speed || '1';
  const volume = selectedClip.dataset.volume || '100';
  const trimStart = parseFloat(selectedClip.dataset.trimStart || 0);
  const trimEnd = parseFloat(selectedClip.dataset.trimEnd || 0);
  const clipCls = selectedClip.classList.contains('clip--video') ? 'clip--video' : 
                  selectedClip.classList.contains('clip--image') ? 'clip--image' : 'clip--audio';
  const icon = clipCls === 'clip--video' ? '🎬' : clipCls === 'clip--image' ? '🖼️' : '🎵';
  const labelText = selectedClip.querySelector('.clip__label')?.textContent?.replace(/^[🎬🎵🖼️]\s*/, '') || '';

  const totalDuration = trimEnd - trimStart;
  const splitRatio = splitPt / clipWidth;
  const splitTime = trimStart + (totalDuration * splitRatio);

  function makeHalfClip(left, width, suffix, newTrimStart, newTrimEnd) {
    const c = document.createElement('div');
    c.className = `clip ${clipCls}`;
    c.style.left = `${left}px`;
    c.style.width = `${Math.max(40, width)}px`;
    c.draggable = true;
    c.dataset.assetId = assetId;
    c.dataset.speed = speed;
    c.dataset.volume = volume;
    c.dataset.trimStart = newTrimStart;
    c.dataset.trimEnd = newTrimEnd;
    c.dataset.baseDur = selectedClip.dataset.baseDur || 0;
    c.dataset.startTime = left / pxPerSec();
    
    // BUG-10: Copy all filter/effect/crop data
    if (selectedClip.dataset.filter) c.dataset.filter = selectedClip.dataset.filter;
    if (selectedClip.dataset.effect) c.dataset.effect = selectedClip.dataset.effect;
    if (selectedClip.dataset.transition) c.dataset.transition = selectedClip.dataset.transition;
    if (selectedClip.dataset.crop) c.dataset.crop = selectedClip.dataset.crop;
    
    c.dataset.clipId = `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    c.innerHTML = `
      <div class="clip__label">${icon} ${labelText}${suffix}</div>
      <div class="clip__speed-badge" style="display:${speed !== '1' ? 'block' : 'none'};">${parseFloat(speed).toFixed(2)}×</div>
      <div class="clip__duration">${formatDuration(Math.max(0, width / pxPerSec()))}</div>
      <div class="clip__waveform clip__waveform--${clipCls === 'clip--video' ? 'video' : clipCls === 'clip--image' ? 'image' : 'audio'}"></div>
      <div class="clip__resize clip__resize--left"></div>
      <div class="clip__resize clip__resize--right"></div>
    `;
    
    trackEl.appendChild(c);
    makeClipDraggable(c);
    makeClipResizable(c);
    return c;
  }

  const clipA = makeHalfClip(clipLeft, splitPt, ' [A]', trimStart, splitTime);
  const clipB = makeHalfClip(clipLeft + splitPt, clipWidth - splitPt, ' [B]', splitTime, trimEnd);

  pushHistory({ 
    type: 'split', 
    originalClip: selectedClip, 
    clipA, 
    clipB, 
    track: trackEl 
  });
  
  selectedClip.remove();
  selectClip(clipB);
  refreshTimelineLayout();
  showToast('Clip split at playhead ✓', 'success');
}

// ── Delete Clip ──
export function handleDelete() {
  if (!selectedClip) {
    showToast('Select a clip first', 'warning');
    return;
  }
  
  const clip = selectedClip;
  const track = clip.parentElement;
  
  pushHistory({ type: 'delete', clip, track });
  clip.remove();
  selectClip(null);
  refreshTimelineLayout();
  showToast('🗑 Clip deleted', 'info');
}

// ── Activate Tool ──
export function activateTool(name, panelEl, btnEl) {
  [dom.trimPanel, dom.speedPanel, dom.volumePanel].forEach(p => {
    if (p) p.classList.remove('tool-panel--active');
  });
  
  [dom.btnTrim, dom.btnSpeed, dom.btnCrop, dom.btnVolume].forEach(b => {
    if (b) b.classList.remove('tool-btn--active');
  });

  if (activeTool === name) {
    setActiveTool(null);
    return;
  }
  
  setActiveTool(name);
  if (panelEl) panelEl.classList.add('tool-panel--active');
  if (btnEl) btnEl.classList.add('tool-btn--active');
  
  if (selectedClip) {
    if (name === 'trim') updateTrimInputs(selectedClip);
    if (name === 'speed' && dom.speedInput) {
      dom.speedInput.value = parseFloat(selectedClip.dataset.speed || 1).toFixed(2);
    }
    if (name === 'volume' && dom.volumeInput) {
      dom.volumeInput.value = parseFloat(selectedClip.dataset.volume || 100);
      if (dom.volumeValue) dom.volumeValue.textContent = `${selectedClip.dataset.volume || 100}%`;
    }
  }
}

// ── Initialize Tools ──
export function initTools() {
  initCropOverlay();
  dom.btnUndo?.addEventListener('click', handleUndo);
  dom.btnRedo?.addEventListener('click', handleRedo);
  
  dom.btnSplit?.addEventListener('click', handleSplit);
  dom.btnDelete?.addEventListener('click', handleDelete);
  
  dom.btnTrim?.addEventListener('click', () => {
    if (!selectedClip) {
      showToast('Select a clip first', 'warning');
      return;
    }
    activateTool('trim', dom.trimPanel, dom.btnTrim);
  });
  
  dom.btnSpeed?.addEventListener('click', () => {
    if (!selectedClip) {
      showToast('Select a clip first', 'warning');
      return;
    }
    activateTool('speed', dom.speedPanel, dom.btnSpeed);
  });
  
  dom.btnVolume?.addEventListener('click', () => {
    if (!selectedClip) {
      showToast('Select a clip first', 'warning');
      return;
    }
    activateTool('volume', dom.volumePanel, dom.btnVolume);
  });
  
  dom.btnCrop?.addEventListener('click', () => {
    if (!selectedClip) {
      showToast('Select a clip first', 'warning');
      return;
    }
    activateTool('crop', dom.cropPanel, dom.btnCrop);
    showToast('Crop tool: Drag handles to adjust crop area', 'info');
    showCropOverlay();
  });
  
  dom.btnTrimClose?.addEventListener('click', () => activateTool('trim', dom.trimPanel, dom.btnTrim));
  dom.btnSpeedClose?.addEventListener('click', () => activateTool('speed', dom.speedPanel, dom.btnSpeed));
  dom.btnVolumeClose?.addEventListener('click', () => activateTool('volume', dom.volumePanel, dom.btnVolume));
  
  dom.btnCropClose?.addEventListener('click', () => {
    activateTool('crop', dom.cropPanel, dom.btnCrop);
    hideCropOverlay();
  });
  
  dom.btnCropApply?.addEventListener('click', () => {
    activateTool('crop', dom.cropPanel, dom.btnCrop);
    hideCropOverlay();
    showToast('Crop applied', 'success');
  });

  dom.btnTrimApply?.addEventListener('click', () => {
    if (!selectedClip) {
      showToast('Select a timeline clip first', 'warning');
      return;
    }
    
    const startSec = parseFloat(dom.trimStartInput?.value);
    const endSec = parseFloat(dom.trimEndInput?.value);
    
    if (isNaN(startSec) || isNaN(endSec) || endSec <= startSec) {
      showToast('Invalid trim range — End must be > Start', 'error');
      return;
    }
    
    const assetId = selectedClip.dataset.assetId;
    const asset = uploadedAssets.find(a => a.id === assetId);
    const baseDur = parseFloat(selectedClip.dataset.baseDur) || asset?.duration || 0;
    if (endSec > baseDur) {
      showToast('Trim end exceeds clip duration', 'error');
      return;
    }
    
    const newLeft = Math.max(0, startSec * pxPerSec());
    const newWidth = Math.max(40, (endSec - startSec) * pxPerSec());
    
    pushHistory({
      type: 'resize',
      clip: selectedClip,
      oldLeft: getClipLeft(selectedClip),
      oldWidth: getClipWidth(selectedClip),
      newLeft,
      newWidth
    });
    
    selectedClip.style.left = `${newLeft}px`;
    selectedClip.style.width = `${newWidth}px`;
    selectedClip.dataset.trimStart = startSec;
    selectedClip.dataset.trimEnd = endSec;
    
    const durEl = selectedClip.querySelector('.clip__duration');
    if (durEl) durEl.textContent = formatDuration((endSec - startSec));
    
    showToast(`Trimmed: ${startSec.toFixed(2)}s → ${endSec.toFixed(2)}s`, 'success');
  });
  
  if (dom.speedInput) {
    dom.speedInput.addEventListener('input', () => {
      if (selectedClip) {
        const speed = parseFloat(dom.speedInput.value) || 1;
        applySpeedToClip(selectedClip, speed);
      }
    });
    
    dom.speedInput.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.05 : -0.05;
      const current = parseFloat(dom.speedInput.value) || 1;
      const next = Math.max(0.1, Math.min(4.0, current + delta));
      dom.speedInput.value = next.toFixed(2);
      if (selectedClip) applySpeedToClip(selectedClip, next);
    }, { passive: false });
  }
  
  if (dom.volumeInput) {
    dom.volumeInput.addEventListener('input', () => {
      if (selectedClip) {
        const volume = parseInt(dom.volumeInput.value) || 100;
        selectedClip.dataset.volume = volume;
        if (dom.volumeValue) dom.volumeValue.textContent = `${volume}%`;
      }
    });
  }
  
  dom.addTrackBtn?.addEventListener('click', () => {
    showCustomConfirm('Add Track', 'Which type of track to add?', 'Video Track', 'Audio Track', (isVideo) => {
      addNewTrack(isVideo ? 'video' : 'audio');
    });
  });
}

function showCropOverlay() {
  const overlay = dom.cropOverlay;
  const playerScreen = dom.playerScreen;
  
  if (!overlay || !selectedClip || !playerScreen) {
    console.error('Crop overlay setup failed:', { overlay: !!overlay, selectedClip: !!selectedClip, playerScreen: !!playerScreen });
    showToast('Crop not available - select a clip first', 'error');
    return;
  }
  
  // Show overlay with visible styles
  overlay.style.display = 'block';
  overlay.style.position = 'absolute';
  overlay.style.zIndex = '1000';
  overlay.style.border = '2px solid #ffffff';
  overlay.style.outline = '2px solid #5b6ef5';
  overlay.style.boxShadow = '0 0 20px rgba(0,0,0,0.5)';
  overlay.style.backgroundColor = 'rgba(91, 110, 245, 0.1)';
  
  // Get existing crop data or default
  let cropData = { x: 0, y: 0, width: 100, height: 100 };
  try {
    if (selectedClip.dataset.crop) {
      cropData = JSON.parse(selectedClip.dataset.crop);
    }
  } catch (e) {
    console.warn('Invalid crop data, using default');
  }
  
  const rect = playerScreen.getBoundingClientRect();
  const cropWidthPx = (cropData.width / 100) * rect.width;
  const cropHeightPx = (cropData.height / 100) * rect.height;
  const cropLeftPx = (cropData.x / 100) * rect.width;
  const cropTopPx = (cropData.y / 100) * rect.height;
  
  overlay.style.width = `${Math.max(40, cropWidthPx)}px`;
  overlay.style.height = `${Math.max(40, cropHeightPx)}px`;
  overlay.style.left = `${cropLeftPx}px`;
  overlay.style.top = `${cropTopPx}px`;
  
  console.log('Crop overlay shown:', cropData);
}

function initCropOverlay() {
  const overlay = dom.cropOverlay;
  if (!overlay) return;

  let isDragging = false;
  let isResizing = false;
  let currentHandle = null;
  let startX, startY, startLeft, startTop, startWidth, startHeight;

  overlay.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('crop-overlay__handle')) {
      isResizing = true;
      currentHandle = e.target;
    } else {
      isDragging = true;
    }

    startX = e.clientX;
    startY = e.clientY;
    const rect = overlay.getBoundingClientRect();
    const parentRect = dom.playerScreen.getBoundingClientRect();
    startLeft = rect.left - parentRect.left;
    startTop = rect.top - parentRect.top;
    startWidth = rect.width;
    startHeight = rect.height;
    
    e.stopPropagation();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging && !isResizing) return;
    if (!selectedClip) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const parentRect = dom.playerScreen.getBoundingClientRect();

    if (isDragging) {
      let newLeft = startLeft + dx;
      let newTop = startTop + dy;
      
      newLeft = Math.max(0, Math.min(newLeft, parentRect.width - startWidth));
      newTop = Math.max(0, Math.min(newTop, parentRect.height - startHeight));
      
      overlay.style.left = `${newLeft}px`;
      overlay.style.top = `${newTop}px`;
    } else if (isResizing) {
      const h = currentHandle;
      let newLeft = startLeft;
      let newTop = startTop;
      let newWidth = startWidth;
      let newHeight = startHeight;

      if (h.classList.contains('crop-overlay__handle--tl')) {
        newLeft = Math.max(0, Math.min(startLeft + dx, startLeft + startWidth - 20));
        newTop = Math.max(0, Math.min(startTop + dy, startTop + startHeight - 20));
        newWidth = startWidth - (newLeft - startLeft);
        newHeight = startHeight - (newTop - startTop);
      } else if (h.classList.contains('crop-overlay__handle--tr')) {
        newTop = Math.max(0, Math.min(startTop + dy, startTop + startHeight - 20));
        newWidth = Math.max(20, Math.min(startWidth + dx, parentRect.width - startLeft));
        newHeight = startHeight - (newTop - startTop);
      } else if (h.classList.contains('crop-overlay__handle--bl')) {
        newLeft = Math.max(0, Math.min(startLeft + dx, startLeft + startWidth - 20));
        newWidth = startWidth - (newLeft - startLeft);
        newHeight = Math.max(20, Math.min(startHeight + dy, parentRect.height - startTop));
      } else if (h.classList.contains('crop-overlay__handle--br')) {
        newWidth = Math.max(20, Math.min(startWidth + dx, parentRect.width - startLeft));
        newHeight = Math.max(20, Math.min(startHeight + dy, parentRect.height - startTop));
      }

      overlay.style.left = `${newLeft}px`;
      overlay.style.top = `${newTop}px`;
      overlay.style.width = `${newWidth}px`;
      overlay.style.height = `${newHeight}px`;
    }

    saveCropData();
    syncPlayerToTimeline(playbackState.currentTime);
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    isResizing = false;
    currentHandle = null;
  });

  function saveCropData() {
    if (!selectedClip) return;
    const parentRect = dom.playerScreen.getBoundingClientRect();
    const rect = overlay.getBoundingClientRect();
    
    const crop = {
      x: ((rect.left - parentRect.left) / parentRect.width) * 100,
      y: ((rect.top - parentRect.top) / parentRect.height) * 100,
      width: (rect.width / parentRect.width) * 100,
      height: (rect.height / parentRect.height) * 100
    };
    
    selectedClip.dataset.crop = JSON.stringify(crop);
  }
}

function hideCropOverlay() {
  if (dom.cropOverlay) {
    dom.cropOverlay.style.display = 'none';
  }
}

// ── Text Tools ──
export function initTextTools() {
  document.querySelectorAll('.text-preset').forEach(preset => {
    preset.addEventListener('click', () => {
      const textType = preset.dataset.textType;
      const defaultTexts = {
        title: 'Your Title',
        subtitle: 'Your Subtitle',
        caption: 'Your Caption',
        outro: 'Thanks for watching!'
      };
      if (dom.customTextInput) {
        dom.customTextInput.value = defaultTexts[textType] || '';
      }
    });
  });
  
  dom.btnAddText?.addEventListener('click', () => {
    const text = dom.customTextInput?.value?.trim();
    if (!text) {
      showToast('Enter some text first', 'warning');
      return;
    }
    
    const fontSize = parseInt(dom.textFontSize?.value) || 48;
    const color = dom.textColor?.value || '#ffffff';
    
    addTextToTimeline(text, fontSize, color);
    showToast('Text added to timeline', 'success');
    if (dom.customTextInput) dom.customTextInput.value = '';
  });
}

function addTextToTimeline(text, fontSize, color) {
  let textTrack = document.querySelector('.track--text');
  if (!textTrack) {
    import('./timeline.js').then(m => textTrack = m.addNewTrack('text'));
  }
  const asset = {
    id: `text-${Date.now()}`,
    type: 'text',
    name: 'Text: ' + text.substring(0,10),
    duration: 5
  };
  import('./timeline.js').then(m => {
    const clip = m.addClipToTrack(asset, textTrack, playbackState.currentTime * m.pxPerSec());
    clip.dataset.text = text;
    clip.dataset.fontSize = fontSize;
    clip.dataset.color = color;
    clip.dataset.animation = 'none';
  });
}

// ── Effect Tools ──
export function initEffectTools() {
  // Transitions
  document.querySelectorAll('[data-transition]').forEach(card => {
    card.addEventListener('click', () => {
      import('./timeline.js').then(m => {
        if (!m.activeTransitionClips) {
          showToast('Click the + button between clips first', 'warning');
          return;
        }
        const transition = card.dataset.transition;
        const { clip1, clip2 } = m.activeTransitionClips;
        clip1.dataset.transitionOut = transition;
        clip2.dataset.transitionIn = transition;
        showToast(`Applied ${transition} transition`, 'success');
        m.refreshTimelineLayout();
      });
    });
  });
  
  // VFX (Effects)
  document.querySelectorAll('[data-effect]').forEach(card => {
    card.addEventListener('click', () => {
      const effect = card.dataset.effect;
      let vfxTrack = document.querySelector('.track--vfx');
      if (!vfxTrack) {
        import('./timeline.js').then(m => vfxTrack = m.addNewTrack('vfx'));
      }
      const asset = {
        id: `vfx-${Date.now()}`,
        type: 'vfx',
        name: 'VFX: ' + effect,
        duration: 5
      };
      import('./timeline.js').then(m => {
        const clip = m.addClipToTrack(asset, vfxTrack, playbackState.currentTime * m.pxPerSec());
        clip.dataset.effect = effect;
        clip.dataset.intensity = 50;
        clip.dataset.blendMode = 'normal';
        showToast(`Added ${effect} to VFX track`, 'success');
      });
    });
  });
  
  // Filters (these apply directly to selected video clip)
  document.querySelectorAll('[data-filter]').forEach(card => {
    card.addEventListener('click', () => {
      if (!selectedClip) {
        showToast('Select a video clip first', 'warning');
        return;
      }
      const filter = card.dataset.filter;
      selectedClip.dataset.filter = filter;
      showToast(`Applied ${filter} filter`, 'success');
      syncPlayerToTimeline(playbackState.currentTime);
    });
  });
}

// ── Export Modal ──
export function initExportModal() {
  dom.btnExport?.addEventListener('click', () => {
    if (dom.exportModal) {
      dom.exportModal.classList.add('active');
    }
  });
  
  dom.btnExportCancel?.addEventListener('click', () => {
    if (dom.exportModal) {
      dom.exportModal.classList.remove('active');
    }
  });
  
  dom.btnExportCancelProgress?.addEventListener('click', () => {
    exportState.cancelRequested = true;
    if (exportState.mediaRecorder && exportState.mediaRecorder.state !== 'inactive') {
      exportState.mediaRecorder.stop();
    }
  });
  
  document.querySelectorAll('#exportModal .modal-option').forEach(option => {
    option.addEventListener('click', () => {
      document.querySelectorAll('#exportModal .modal-option').forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
      exportState.resolution = option.dataset.resolution;
    });
  });
  
  dom.btnExportStart?.addEventListener('click', startExport);
}

// ── Start Export ──
export async function startExport() {
  const format = dom.exportFormat?.value || 'mp4';
  const fps = parseInt(dom.exportFps?.value) || 30;
  
  const videoClips = Array.from(dom.videoTrack?.querySelectorAll('.clip') || []);
  const audioClips = Array.from(dom.audioTrack?.querySelectorAll('.clip') || []);
  
  if (videoClips.length === 0 && audioClips.length === 0) {
    showToast('No clips to export', 'error');
    return;
  }
  
  exportState.format = format;
  exportState.fps = fps;
  exportState.isExporting = true;
  exportState.progress = 0;
  exportState.cancelRequested = false;
  
  if (dom.exportProgress) dom.exportProgress.style.display = 'block';
  if (dom.exportActions) dom.exportActions.style.display = 'none';
  
  let audioContext = null;

  try {
    const { width, height } = projectSettings.resolution || { width: 1920, height: 1080 };
    
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = width;
    exportCanvas.height = height;
    const ctx = exportCanvas.getContext('2d', { alpha: false });
    
    // Get total duration
    let totalDuration = 0;
    [...videoClips, ...audioClips].forEach(clip => {
      const clipEnd = (getClipLeft(clip) + getClipWidth(clip)) / pxPerSec();
      if (clipEnd > totalDuration) totalDuration = clipEnd;
    });
    if (totalDuration === 0) totalDuration = 5;

    // Setup MediaRecorder
    const stream = exportCanvas.captureStream(fps);
    
    // Audio integration
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const dest = audioContext.createMediaStreamDestination();
      
      for (const clip of audioClips) {
        const assetId = clip.dataset.assetId;
        const audioEl = audioElementCache.get(assetId) || videoElementCache.get(assetId);
        if (audioEl) {
          const source = audioContext.createMediaElementSource(audioEl);
          const gain = audioContext.createGain();
          gain.gain.value = parseFloat(clip.dataset.volume || 100) / 100;
          source.connect(gain).connect(dest);
        }
      }
      
      if (dest.stream.getAudioTracks().length > 0) {
        stream.addTrack(dest.stream.getAudioTracks()[0]);
      }
    } catch (e) { console.warn('Audio export setup failed:', e); }

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8000000 });
    const chunks = [];
    
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    
    mediaRecorder.onstop = async () => {
      if (chunks.length === 0) {
        showToast('Export failed: No data', 'error');
        resetExportUI();
        return;
      }
      
      const webmBlob = new Blob(chunks, { type: mimeType });
      
      try {
        if (exportState.format === 'mp4') {
          updateExportStatus('Finalizing MP4 (FFmpeg)...');
          const mp4Blob = await transcodeToMP4(webmBlob, fps, (p) => {
            updateExportProgress(p);
            updateExportStatus(`Converting: ${Math.round(p * 100)}%`);
          });
          downloadBlob(mp4Blob, `vidforge_${Date.now()}.mp4`);
          showToast('MP4 Export successful!', 'success');
        } else {
          downloadBlob(webmBlob, `vidforge_${Date.now()}.webm`);
          showToast('WebM Export successful!', 'success');
        }
      } catch (err) {
        console.error('Transcode error:', err);
        showToast('MP4 error, downloading WebM fallback', 'warning');
        downloadBlob(webmBlob, `vidforge_${Date.now()}.webm`);
      }
      resetExportUI();
    };

    mediaRecorder.start();

    // Rendering Loop
    const frameDuration = 1 / fps;
    let currentTime = 0;
    const totalFrames = Math.ceil(totalDuration * fps);

    for (let i = 0; i < totalFrames; i++) {
      if (exportState.cancelRequested) break;
      
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      
      const activeClip = videoClips.find(clip => {
        const start = getClipLeft(clip) / pxPerSec();
        const end = start + (getClipWidth(clip) / pxPerSec());
        return currentTime >= start && currentTime < end;
      });

      if (activeClip) {
        const assetId = activeClip.dataset.assetId;
        const asset = uploadedAssets.find(a => a.id === assetId);
        if (asset) {
          const clipStart = getClipLeft(activeClip) / pxPerSec();
          const trimStart = parseFloat(activeClip.dataset.trimStart || 0);
          const speed = parseFloat(activeClip.dataset.speed || 1);
          const localTime = trimStart + (currentTime - clipStart) * speed;
          
          if (asset.type === 'video') {
            const video = videoElementCache.get(assetId);
            if (video) {
              video.currentTime = localTime;
              // Simple wait for frame
              await new Promise(r => setTimeout(r, 40));
              ctx.drawImage(video, 0, 0, width, height);
            }
          } else if (asset.type === 'image') {
            const img = imageElementCache.get(assetId);
            if (img) ctx.drawImage(img, 0, 0, width, height);
          }
        }
      }

      // Overlays
      textOverlays.forEach(o => {
        if (currentTime >= o.startTime && currentTime < o.endTime) {
          ctx.fillStyle = o.color || '#fff';
          ctx.font = `${o.fontSize || 40}px Arial`;
          ctx.textAlign = 'center';
          ctx.fillText(o.text, (o.x/100)*width, (o.y/100)*height);
        }
      });

      updateExportProgress(i / totalFrames);
      updateExportStatus(`Capturing: ${Math.round((i/totalFrames)*100)}%`);
      
      currentTime += frameDuration;
      // Let browser breathe
      await new Promise(r => requestAnimationFrame(r));
    }

    mediaRecorder.stop();
    if (audioContext) audioContext.close();

  } catch (err) {
    console.error('Export error:', err);
    showToast('Export failed', 'error');
    resetExportUI();
    if (audioContext) audioContext.close();
  }
}

function updateExportProgress(p) {
  if (dom.exportProgressFill) dom.exportProgressFill.style.width = `${p * 100}%`;
}
function updateExportStatus(msg) {
  if (dom.exportProgressText) dom.exportProgressText.textContent = msg;
}
function resetExportUI() {
  exportState.isExporting = false;
  if (dom.exportModal) dom.exportModal.classList.remove('active');
  if (dom.exportProgress) dom.exportProgress.style.display = 'none';
  if (dom.exportActions) dom.exportActions.style.display = 'flex';
}

// ── Project Settings ──
export function initProjectSettings() {
  dom.btnProjectSettings?.addEventListener('click', () => {
    if (dom.projectSettingsModal) {
      dom.projectSettingsModal.classList.add('active');
    }
  });
  
  dom.btnSettingsCancel?.addEventListener('click', () => {
    if (dom.projectSettingsModal) {
      dom.projectSettingsModal.classList.remove('active');
    }
  });
  
  dom.btnSettingsSave?.addEventListener('click', () => {
    const resolution = dom.projectResolution?.value || '1920x1080';
    const [width, height] = resolution.split('x').map(Number);
    const fps = parseInt(dom.projectFps?.value) || 30;
    const duration = parseInt(dom.projectDuration?.value) || 120;
    
    updateProjectSettings({
      resolution: { width, height },
      fps,
      duration,
      aspectRatio: width / height
    });
    
    if (dom.projectSettingsModal) {
      dom.projectSettingsModal.classList.remove('active');
    }
    
    showToast('Project settings saved', 'success');
  });
}

// ── Custom Confirm Modal ──
export function showCustomConfirm(title, message, okText, cancelText, onConfirm) {
  if (!dom.customConfirmModal) {
    if (confirm(`${title}\n${message}`)) {
      onConfirm(true);
    } else {
      onConfirm(false);
    }
    return;
  }
  
  dom.confirmTitle.textContent = title;
  dom.confirmMessage.textContent = message;
  dom.confirmOk.textContent = okText;
  dom.confirmCancel.textContent = cancelText;
  
  dom.customConfirmModal.classList.add('active');
  
  const handleOk = () => { cleanup(); onConfirm(true); };
  const handleCancel = () => { cleanup(); onConfirm(false); };
  
  const cleanup = () => {
    dom.customConfirmModal.classList.remove('active');
    dom.confirmOk.removeEventListener('click', handleOk);
    dom.confirmCancel.removeEventListener('click', handleCancel);
  };
  
  dom.confirmOk.addEventListener('click', handleOk);
  dom.confirmCancel.addEventListener('click', handleCancel);
}

// ── Save/Load API Integration ──
export function initSaveLoad() {
  dom.btnSaveProject?.addEventListener('click', () => {
    if (dom.projectNameInput) {
      projectSettings.name = dom.projectNameInput.value || 'Untitled Project';
    }
    saveProject(projectSettings.name);
  });
  
  // Replace old file load with Project Manager Modal
  dom.btnLoadProject?.addEventListener('click', () => {
    if (dom.projectManagerModal) {
      fetchProjects();
      dom.projectManagerModal.classList.add('active');
    } else {
      loadProjectFile(); // Fallback
    }
  });
  
  dom.btnProjectManagerClose?.addEventListener('click', () => {
    dom.projectManagerModal?.classList.remove('active');
  });
}

export async function saveProject(name = 'Untitled Project') {
  const project = {
    id: projectSettings.id,
    name: name,
    version: '2.0',
    settings: projectSettings,
    assets: uploadedAssets.map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      duration: a.duration,
      thumbnail: a.thumbnail
    })),
    timeline: {
      video: Array.from(dom.videoTrack?.querySelectorAll('.clip') || []).map(clip => ({
        assetId: clip.dataset.assetId,
        startTime: clip.dataset.startTime,
        width: clip.style.width,
        trimStart: clip.dataset.trimStart,
        trimEnd: clip.dataset.trimEnd,
        speed: clip.dataset.speed,
        volume: clip.dataset.volume,
        filter: clip.dataset.filter,
        effect: clip.dataset.effect,
        transition: clip.dataset.transition,
        crop: clip.dataset.crop
      })),
      audio: Array.from(dom.audioTrack?.querySelectorAll('.clip') || []).map(clip => ({
        assetId: clip.dataset.assetId,
        startTime: clip.dataset.startTime,
        width: clip.style.width,
        trimStart: clip.dataset.trimStart,
        trimEnd: clip.dataset.trimEnd,
        speed: clip.dataset.speed,
        volume: clip.dataset.volume
      }))
    },
    textOverlays,
    savedAt: Date.now()
  };
  
  try {
    const isNew = !project.id;
    const url = isNew ? '/api/projects' : `/api/projects/${project.id}`;
    const method = isNew ? 'POST' : 'PUT';
    
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project)
    });
    
    const data = await res.json();
    if (data.success) {
      projectSettings.id = data.id;
      showToast('Project saved successfully', 'success');
    } else {
      showToast('Failed to save project', 'error');
    }
  } catch (err) {
    console.error('Save error:', err);
    // Fallback to local download if server fails
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `vidforge_project_${Date.now()}.json`);
    showToast('Project downloaded locally', 'info');
  }
}

async function fetchProjects() {
  const list = dom.projectList;
  if (!list) return;
  list.innerHTML = '<div class="loading">Loading projects...</div>';
  
  try {
    const res = await fetch('/api/projects');
    const data = await res.json();
    
    if (data.projects && data.projects.length > 0) {
      list.innerHTML = '';
      data.projects.forEach(p => {
        const item = document.createElement('div');
        item.className = 'project-item';
        item.innerHTML = `
          <div class="project-info">
            <h4>${p.name}</h4>
            <span>${new Date(p.savedAt).toLocaleString()}</span>
          </div>
          <button class="btn btn--primary btn-load-proj" data-id="${p.id}">Load</button>
        `;
        list.appendChild(item);
        
        item.querySelector('.btn-load-proj').addEventListener('click', () => loadProjectFromServer(p.id));
      });
    } else {
      list.innerHTML = '<div class="empty-state">No saved projects found.</div>';
    }
  } catch (err) {
    list.innerHTML = '<div class="error">Failed to fetch projects. Server might be offline.</div>';
  }
}

async function loadProjectFromServer(id) {
  try {
    const res = await fetch(`/api/projects/${id}`);
    const data = await res.json();
    
    if (data.success && data.project) {
      dom.projectManagerModal?.classList.remove('active');
      restoreProject(data.project);
    } else {
      showToast('Failed to load project', 'error');
    }
  } catch (err) {
    console.error('Load error:', err);
    showToast('Error connecting to server', 'error');
  }
}

// ── Legacy File Load Fallback ──
function loadProjectFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const project = JSON.parse(event.target.result);
        restoreProject(project);
      } catch (error) {
        showToast('Failed to parse project file', 'error');
      }
    };
    reader.readAsText(file);
  };
  
  input.click();
}

// BUG-02 Fix: Full project restore
function restoreProject(project) {
  if (project.settings) {
    updateProjectSettings(project.settings);
    if (dom.projectNameInput) dom.projectNameInput.value = project.settings.name || '';
  }
  
  // Clear current timeline
  if (dom.videoTrack) dom.videoTrack.innerHTML = '';
  if (dom.audioTrack) dom.audioTrack.innerHTML = '';
  textOverlays.length = 0;
  clearHistory();
  
  showToast('Project metadata loaded. Please re-import missing assets.', 'warning', 5000);
  
  // Text Overlays
  if (project.textOverlays) {
    project.textOverlays.forEach(o => textOverlays.push(o));
  }
  
  // Assuming user will re-import assets (or we can implement a drag-drop asset re-mapper later)
  // For now, reconstruct timeline UI structure
  ['video', 'audio'].forEach(type => {
    if (project.timeline && project.timeline[type]) {
      project.timeline[type].forEach(clipData => {
        // We need the asset to recreate clip properly. If not present, we create a ghost clip.
        const track = type === 'video' ? dom.videoTrack : dom.audioTrack;
        const pps = pxPerSec();
        const left = parseFloat(clipData.startTime || 0) * pps;
        
        const clip = document.createElement('div');
        clip.className = 'clip';
        clip.dataset.assetId = clipData.assetId;
        clip.dataset.type = type;
        clip.dataset.trimStart = clipData.trimStart || 0;
        clip.dataset.trimEnd = clipData.trimEnd || 5;
        clip.dataset.speed = clipData.speed || 1;
        clip.dataset.volume = clipData.volume || 100;
        if (clipData.filter) clip.dataset.filter = clipData.filter;
        if (clipData.transition) clip.dataset.transition = clipData.transition;
        if (clipData.crop) clip.dataset.crop = clipData.crop;
        
        clip.style.left = `${left}px`;
        clip.style.width = clipData.width;
        
        clip.innerHTML = `
          <div class="clip__handle clip__handle--left"></div>
          <div class="clip__content" style="background: rgba(255, 60, 60, 0.2); border: 1px dashed red; align-items: center; justify-content: center; display: flex;">
             Missing Asset
          </div>
          <div class="clip__handle clip__handle--right"></div>
        `;
        
        track.appendChild(clip);
        makeClipDraggable(clip);
        makeClipResizable(clip);
      });
    }
  });
  
  syncPlayerToTimeline(0);
}

// ── Copy / Paste ──
export function handleCopy() {
  if (!selectedClip) return;
  const clipData = {
    type: selectedClip.dataset.type,
    assetId: selectedClip.dataset.assetId,
    trimStart: parseFloat(selectedClip.dataset.trimStart || 0),
    trimEnd: parseFloat(selectedClip.dataset.trimEnd || 5),
    speed: parseFloat(selectedClip.dataset.speed || 1),
    volume: parseFloat(selectedClip.dataset.volume || 100),
    filter: selectedClip.dataset.filter,
    effect: selectedClip.dataset.effect,
    transition: selectedClip.dataset.transition,
    crop: selectedClip.dataset.crop,
    baseDur: selectedClip.dataset.baseDur
  };
  setClipboardData(clipData);
  showToast('Clip copied', 'info');
}

export function handlePaste() {
  if (!clipboardData) {
    showToast('Nothing to paste', 'info');
    return;
  }
  
  const trackType = clipboardData.type;
  const trackEl = selectedTrack || dom[`${trackType}Track`];
  if (!trackEl || trackEl.dataset.track !== trackType) {
    showToast(`Select a ${trackType} track first`, 'warning');
    return;
  }
  
  const asset = uploadedAssets.find(a => a.id === clipboardData.assetId);
  if (!asset) {
    showToast('Asset not found', 'error');
    return;
  }
  
  const playheadPx = parseFloat(dom.playheadEl?.style.left) || 0;
  addClipToTrack(asset, trackEl, playheadPx);
  showToast('Clip pasted', 'success');
}

// ── In/Out Points ──
export function handleMarkIn() {
  setInPoint(playbackState.currentTime);
  showToast('Mark In set', 'info');
  updateInOutMarker();
}

export function handleMarkOut() {
  setOutPoint(playbackState.currentTime);
  showToast('Mark Out set', 'info');
  updateInOutMarker();
}

function updateInOutMarker() {
  if (!dom.inOutMarker || !dom.timeRuler) {
    // Create marker if it doesn't exist
    if (dom.timeRuler && !dom.inOutMarker) {
      const marker = document.createElement('div');
      marker.id = 'inOutMarker';
      marker.className = 'in-out-marker';
      dom.timeRuler.appendChild(marker);
      dom.inOutMarker = marker;
    } else return;
  }
  
  if (inOutPoints.active) {
    const startPx = inOutPoints.inPoint * pxPerSec();
    const endPx = inOutPoints.outPoint * pxPerSec();
    dom.inOutMarker.style.display = 'block';
    dom.inOutMarker.style.left = `${Math.min(startPx, endPx)}px`;
    dom.inOutMarker.style.width = `${Math.abs(endPx - startPx)}px`;
  } else {
    dom.inOutMarker.style.display = 'none';
  }
}

// ── Context Menu ──
export function initContextMenu() {
  if (!dom.contextMenu) return;
  
  document.addEventListener('contextmenu', (e) => {
    const clip = e.target.closest('.clip');
    if (clip) {
      e.preventDefault();
      selectClip(clip);
      
      dom.contextMenu.style.display = 'block';
      dom.contextMenu.style.left = `${e.clientX}px`;
      dom.contextMenu.style.top = `${e.clientY}px`;
    } else {
      dom.contextMenu.style.display = 'none';
    }
  });
  
  document.addEventListener('click', () => {
    if (dom.contextMenu) dom.contextMenu.style.display = 'none';
  });
  
  const cmSplit = document.getElementById('cmSplit');
  const cmCopy = document.getElementById('cmCopy');
  const cmPaste = document.getElementById('cmPaste');
  const cmDelete = document.getElementById('cmDelete');
  const cmProperties = document.getElementById('cmProperties');
  
  cmSplit?.addEventListener('click', handleSplit);
  cmCopy?.addEventListener('click', handleCopy);
  cmPaste?.addEventListener('click', handlePaste);
  cmDelete?.addEventListener('click', handleDelete);
  cmProperties?.addEventListener('click', () => {
    if (dom.clipInspector) dom.clipInspector.classList.add('active');
  });
}

// ── Inspector Panel ──
export function initInspector() {
  const btnClose = document.getElementById('btnCloseInspector');
  const inspector = document.getElementById('clipInspector');
  
  btnClose?.addEventListener('click', () => {
    inspector?.classList.remove('active');
  });

  const propSpeed = document.getElementById('propSpeed');
  const propVolume = document.getElementById('propVolume');
  const propVolumeVal = document.getElementById('propVolumeVal');
  const propFilter = document.getElementById('propFilter');
  
  propSpeed?.addEventListener('input', (e) => {
    if (!selectedClip) return;
    const speed = clamp(parseFloat(e.target.value) || 1, 0.1, 4.0);
    applySpeedToClip(selectedClip, speed);
  });
  
  propVolume?.addEventListener('input', (e) => {
    if (!selectedClip) return;
    const vol = e.target.value;
    selectedClip.dataset.volume = vol;
    if (propVolumeVal) propVolumeVal.textContent = `${vol}%`;
    
    // Update live volume if playing
    videoElementCache.forEach(v => {
      if (!v.paused && v.dataset.id === selectedClip.dataset.assetId) {
        v.volume = vol / 100;
      }
    });
    audioElementCache.forEach(a => {
      if (!a.paused && a.dataset.id === selectedClip.dataset.assetId) {
        a.volume = vol / 100;
      }
    });
  });
  
  propFilter?.addEventListener('change', (e) => {
    if (!selectedClip) return;
    selectedClip.dataset.filter = e.target.value;
  });
}

// Ensure updateTrimInputs updates Inspector
export function updateInspectorFields(clip) {
  const empty = document.getElementById('inspectorEmpty');
  const props = document.getElementById('inspectorProps');
  
  if (!clip) {
    if (empty) empty.style.display = 'block';
    if (props) props.style.display = 'none';
    return;
  }
  
  if (empty) empty.style.display = 'none';
  if (props) props.style.display = 'block';
  
  const propStartTime = document.getElementById('propStartTime');
  const propDuration = document.getElementById('propDuration');
  const propSpeed = document.getElementById('propSpeed');
  const propVolume = document.getElementById('propVolume');
  const propVolumeVal = document.getElementById('propVolumeVal');
  const propFilter = document.getElementById('propFilter');
  
  if (propStartTime) propStartTime.value = parseFloat(clip.dataset.startTime || 0).toFixed(2);
  if (propDuration) {
    const start = parseFloat(clip.dataset.trimStart || 0);
    const end = parseFloat(clip.dataset.trimEnd || clip.dataset.baseDur || 0);
    const speed = parseFloat(clip.dataset.speed || 1);
    propDuration.value = ((end - start) / speed).toFixed(2);
  }
  if (propSpeed) propSpeed.value = parseFloat(clip.dataset.speed || 1).toFixed(2);
  
  const vol = clip.dataset.volume || 100;
  if (propVolume) propVolume.value = vol;
  if (propVolumeVal) propVolumeVal.textContent = `${vol}%`;
  
  if (propFilter) propFilter.value = clip.dataset.filter || '';
}