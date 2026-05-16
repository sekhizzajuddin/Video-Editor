// ===================================================
// js/main.js — Entrypoint & UI Bindings
// ===================================================
import { 
  dom, zoomFactor, setZoomFactor, playbackState, refreshDomReferences,
  projectSettings, updateProjectSettings
} from './state.js';
import { handleFilesSelected, searchAssets, sortAssets, updateEmptyStates } from './media.js';
import { 
  startPlayback, stopPlayback, togglePlayback, jumpToStart, jumpToEnd,
  rewind, fastForward, setPlayheadX, syncPlayerToTimeline, seekToTime
} from './engine.js';
import { 
  buildRuler, deselectAll, initTrackDropZones, initTrackControls,
  selectClip, addNewTrack, initPlayheadDrag, refreshTimelineLayout,
  initTransitionMenu, initClipRightClickMenus, updateTimelineDuration
} from './timeline.js';
import { pxPerSec, pxToTimecode, formatTimecode, showToast, loadAutoSave } from './utils.js';
import { 
  handleUndo, handleRedo, handleSplit, handleDelete, initTools,
  initTextTools, initEffectTools, initExportModal, initProjectSettings,
  initSaveLoad, initContextMenu, initInspector, handleCopy, handlePaste,
  handleMarkIn, handleMarkOut
} from './tools.js';

// ── Initialize Application ──
function init() {
  refreshDomReferences();
  initTabs();
  initFileImport();
  initPlaybackControls();
  initZoom();
  initRulerScrubbing();
  initKeyboardShortcuts();
  initTrackDropZones();
  initTrackControls();
  initPlayheadDrag();
  // BUG-20: Removed initRulerScrubbing() — initPlayheadDrag() already handles ruler clicks
  initTools();
  initTextTools();
  initEffectTools();
  initExportModal();
  initProjectSettings();
  initSaveLoad();
  initMobileControls();
  initSearchAndSort();
  initVolumeControl();
  initShortcutsModal();
  initContextMenu();
  initTransitionMenu();
  initInspector();
  initClipRightClickMenus();
  initProjectName();
  initTimelineResizer();
  initAddTrackButton();
  initDragOverlay();
  
  buildRuler();
  updateTimelineDuration();
  updateEmptyStates();
  
  // Check for auto-save
  const autoSave = loadAutoSave();
  if (autoSave) {
    showToast('Auto-save found — load from Save menu', 'info');
  }
  
  showToast('VidForge Pro Editor Ready!', 'success');
  console.log('🎬 VidForge Pro Editor initialized');
  
  // Initial layout refresh to set dynamic duration
  setTimeout(() => {
    refreshTimelineLayout();
  }, 100);
}

// ── Tab Switching ──
function initTabs() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  sidebar.addEventListener('click', (e) => {
    const item = e.target.closest('.sidebar__item');
    if (!item) return;

    const tabName = item.dataset.tab;
    console.log('Tab selected:', tabName);

    // Remove active class from all items in this sidebar
    sidebar.querySelectorAll('.sidebar__item').forEach(i => {
      i.classList.remove('sidebar__item--active');
    });

    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(c => {
      c.classList.remove('tab-content--active');
    });

    // Add active class to clicked item
    item.classList.add('sidebar__item--active');

    // Show target content
    const target = document.getElementById(`content-${tabName}`);
    if (target) {
      target.classList.add('tab-content--active');
    }
  });
}

// ── File Import ──
function initFileImport() {
  // Ensure file input exists and is accessible
  const fileInput = document.getElementById('fileInput');
  const importBtn = document.getElementById('importBtn');
  const importAudioBtn = document.getElementById('importAudioBtn');
  
  // Main import button - click file input
  importBtn?.addEventListener('click', () => {
    fileInput?.click();
  });
  
  // Audio tab import button
  importAudioBtn?.addEventListener('click', () => {
    fileInput?.click();
  });
  
  // File input change handler
  fileInput?.addEventListener('change', (e) => {
    console.log('File input changed, files:', e.target.files?.length);
    if (e.target.files && e.target.files.length > 0) {
      handleFilesSelected(e.target.files).then(() => {
        // Reset file input after processing
        fileInput.value = '';
      }).catch(err => {
        console.error('Error handling files:', err);
        fileInput.value = '';
      });
    }
  });
  
  // Drag and drop on document
  document.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  });
  
  document.addEventListener('drop', (e) => {
    if (e.dataTransfer?.files?.length > 0) {
      if (!e.target.closest('.track')) {
        e.preventDefault();
        console.log('Files dropped on document');
        handleFilesSelected(e.dataTransfer.files);
      }
    }
  });
}

// ── Playback Controls ──
function initPlaybackControls() {
  dom.btnPlay?.addEventListener('click', togglePlayback);
  
  dom.btnStop?.addEventListener('click', () => {
    stopPlayback();
    jumpToStart();
  });
  
  dom.btnStart?.addEventListener('click', jumpToStart);
  dom.btnEnd?.addEventListener('click', jumpToEnd);
  dom.btnRewind?.addEventListener('click', () => rewind(5));
  dom.btnFastForward?.addEventListener('click', () => fastForward(5));
  
  dom.trackArea?.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.clip') && !e.target.closest('.playhead')) {
      deselectAll();
    }
  });
}

// ── Volume Control ──
function initVolumeControl() {
  dom.volumeSlider?.addEventListener('input', () => {
    const volume = parseInt(dom.volumeSlider.value) || 80;
    
    if (dom.volumeIcon) {
      if (volume === 0) dom.volumeIcon.textContent = '🔇';
      else if (volume < 30) dom.volumeIcon.textContent = '🔈';
      else if (volume < 70) dom.volumeIcon.textContent = '🔉';
      else dom.volumeIcon.textContent = '🔊';
    }
    
    if (dom.previewAudio) {
      dom.previewAudio.volume = volume / 100;
    }
  });
}

// ── Zoom & Scroll ──
function initZoom() {
  dom.zoomSlider?.addEventListener('input', (e) => {
    const z = parseFloat(e.target.value);
    setZoomFactor(z);
    if (dom.zoomValue) dom.zoomValue.textContent = z.toFixed(1) + '×';
    refreshTimelineLayout();
  });

  dom.trackArea?.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      let z = zoomFactor - (e.deltaY * 0.01);
      z = Math.max(0.5, Math.min(z, 10.0));
      setZoomFactor(z);
      if (dom.zoomSlider) dom.zoomSlider.value = z;
      if (dom.zoomValue) dom.zoomValue.textContent = z.toFixed(1) + '×';
      refreshTimelineLayout();
    }
  }, { passive: false });

  dom.trackArea?.addEventListener('scroll', () => {
    // BUG-07: Only sync vertical scroll with track headers. Ruler is position:sticky so it stays fixed.
    if (dom.trackHeaders) {
      dom.trackHeaders.scrollTop = dom.trackArea.scrollTop;
    }
  }, { passive: true });

  // Also sync wheel event from headers to track area
  dom.trackHeaders?.addEventListener('wheel', (e) => {
    if (dom.trackArea) {
      dom.trackArea.scrollTop += e.deltaY;
    }
  }, { passive: true });


// ── Timeline Resizer ──
function initTimelineResizer() {
  if (!dom.timelineResizer || !dom.timeline) return;
  
  let isResizing = false;
  let startY = 0;
  let startHeight = 0;
  
  dom.timelineResizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    startY = e.clientY;
    startHeight = dom.timeline.getBoundingClientRect().height;
    document.body.style.cursor = 'row-resize';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const dy = startY - e.clientY; // drag up increases height
    const newHeight = Math.max(120, Math.min(window.innerHeight * 0.7, startHeight + dy));
    dom.timeline.style.height = `${newHeight}px`;
    refreshTimelineLayout();
  });
  
  document.addEventListener('mouseup', () => {
    isResizing = false;
    document.body.style.cursor = '';
  });
}


// BUG-20: initRulerScrubbing removed - initPlayheadDrag() handles ruler clicks
function initRulerScrubbing() { /* NOOP */ }

// ── Keyboard Shortcuts ──
function initKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        togglePlayback();
        break;
        
      case 'KeyI':
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          handleMarkIn();
        } else {
          e.preventDefault();
          (dom.fileInput || document.getElementById('fileInput'))?.click(); // Ctrl+I for import
        }
        break;
        
      case 'KeyO':
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          handleMarkOut();
        }
        break;
        
      case 'KeyS':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          dom.btnSaveProject?.click(); // Ctrl+S for save
        } else {
          e.preventDefault();
          handleSplit();
        }
        break;
        
      case 'KeyC':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          handleCopy();
        }
        break;
        
      case 'KeyV':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          handlePaste();
        }
        break;
        
      case 'Backspace':
      case 'Delete':
        e.preventDefault();
        handleDelete();
        break;
        
      case 'KeyZ':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (e.shiftKey) handleRedo();
          else handleUndo();
        }
        break;
        
      case 'KeyY':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          handleRedo();
        }
        break;
        
      case 'Home':
        e.preventDefault();
        jumpToStart();
        break;
        
      case 'End':
        e.preventDefault();
        jumpToEnd();
        break;
        
      case 'ArrowLeft':
        e.preventDefault();
        if (e.shiftKey) rewind(1);
        else rewind(0.1);
        break;
        
      case 'ArrowRight':
        e.preventDefault();
        if (e.shiftKey) fastForward(1);
        else fastForward(0.1);
        break;
        
      case 'Slash':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          dom.shortcutsModal?.classList.add('active');
        }
        break;
    }
  });
}

// ── Mobile Controls ──
function initMobileControls() {
  dom.mobileMediaToggle?.addEventListener('click', () => {
    dom.mediaPool?.classList.add('is-open');
  });
  
  dom.mobileCloseBtn?.addEventListener('click', () => {
    dom.mediaPool?.classList.remove('is-open');
  });
  
  document.addEventListener('click', (e) => {
    if (dom.mediaPool?.classList.contains('is-open')) {
      if (!e.target.closest('.panel--media') && !e.target.closest('.fab-media-toggle')) {
        dom.mediaPool.classList.remove('is-open');
      }
    }
  });
}

// ── Search and Sort ──
function initSearchAndSort() {
  dom.searchInput?.addEventListener('input', (e) => {
    searchAssets(e.target.value);
  });
  
  dom.sortSelect?.addEventListener('change', (e) => {
    sortAssets(e.target.value);
  });
}

// ── Shortcuts Modal ──
function initShortcutsModal() {
  dom.btnShortcutsClose?.addEventListener('click', () => {
    dom.shortcutsModal?.classList.remove('active');
  });
  
  dom.shortcutsModal?.addEventListener('click', (e) => {
    if (e.target === dom.shortcutsModal) {
      dom.shortcutsModal.classList.remove('active');
    }
  });
}

// ── Project Name ──
function initProjectName() {
  if (dom.projectNameInput) {
    dom.projectNameInput.value = projectSettings.name || 'Untitled Project';
    dom.projectNameInput.addEventListener('input', (e) => {
      updateProjectSettings({ name: e.target.value });
    });
  }
}

// ── Add Track Button ──
function initAddTrackButton() {
  dom.addTrackBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const existing = document.getElementById('addTrackMenu');
    if (existing) { existing.remove(); return; }
    const menu = document.createElement('div');
    menu.id = 'addTrackMenu';
    menu.className = 'context-menu';
    menu.style.cssText = 'display:block;position:fixed;z-index:9999;';
    const rect = dom.addTrackBtn.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 4}px`;
    menu.innerHTML = `
      <div class="context-menu__item" data-type="video">🎬 Video Track</div>
      <div class="context-menu__item" data-type="audio">🎵 Audio Track</div>
      <div class="context-menu__item" data-type="text">T&nbsp; Text Track</div>
      <div class="context-menu__item" data-type="vfx">✨ VFX Track</div>
    `;
    document.body.appendChild(menu);
    menu.querySelectorAll('.context-menu__item').forEach(item => {
      item.addEventListener('click', () => {
        import('./timeline.js').then(m => m.addNewTrack(item.dataset.type));
        menu.remove();
      });
    });
    setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 50);
  });
}

// ── Drag Overlay ──
function initDragOverlay() {
  const timeline = document.getElementById('timeline');
  if (!timeline) return;
  timeline.addEventListener('dragenter', () => timeline.classList.add('timeline--drag-active'));
  timeline.addEventListener('dragleave', (e) => {
    if (!timeline.contains(e.relatedTarget)) timeline.classList.remove('timeline--drag-active');
  });
  timeline.addEventListener('drop', () => timeline.classList.remove('timeline--drag-active'));
}

// ── Window Resize Handler ──
window.addEventListener('resize', () => {
  refreshTimelineLayout();
  
  const playerScreen = dom.playerScreen;
  if (playerScreen && projectSettings.aspectRatio) {
    const parent = playerScreen.parentElement;
    if (parent) {
      const maxWidth = parent.clientWidth - 32;
      const maxHeight = parent.clientHeight - 32;
      const targetHeight = maxWidth / projectSettings.aspectRatio;
      
      if (targetHeight > maxHeight) {
        playerScreen.style.height = `${maxHeight}px`;
        playerScreen.style.width = `${maxHeight * projectSettings.aspectRatio}px`;
      } else {
        playerScreen.style.width = `${maxWidth}px`;
        playerScreen.style.height = `${targetHeight}px`;
      }
    }
  }
});

// ── Initialize on DOM Ready ──
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ── Handle Before Unload ──
window.addEventListener('beforeunload', (e) => {
  const hasClips = document.querySelectorAll('.clip').length > 0;
  if (hasClips) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ── Export for debugging ──
window.vidforge = {
  state: { dom, playbackState, projectSettings },
  seekToTime,
  togglePlayback,
  jumpToStart,
  jumpToEnd
};