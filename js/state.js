// ===================================================
// js/state.js — Global State & DOM References v2.0
// ===================================================

// ── Asset Management ──
export const uploadedAssets = [];
export let assetIdCounter = 0;
export const getNextAssetId = () => ++assetIdCounter;

// ── Video Element Cache ──
export const videoElementCache = new Map();
export const audioElementCache = new Map();
export const imageElementCache = new Map();

// ── Timeline Constants ──
export const BASE_PX_PER_SEC = 50;
export let TOTAL_DURATION = 120;
export let TOTAL_SECONDS = 120;

export function setTotalDuration(newDuration) {
  TOTAL_DURATION = newDuration;
  TOTAL_SECONDS = newDuration;
}

// ── Project Settings ──
export const projectSettings = {
  resolution: { width: 1920, height: 1080 },
  fps: 30,
  duration: 120,
  aspectRatio: 16/9,
  name: 'Untitled Project',
  id: null
};

export function updateProjectSettings(settings) {
  Object.assign(projectSettings, settings);
  if (settings.duration) {
    TOTAL_DURATION = settings.duration;
    TOTAL_SECONDS = settings.duration;
  }
  if (settings.resolution) {
    projectSettings.aspectRatio = settings.resolution.width / settings.resolution.height;
  }
}

// ── Zoom & Timeline ──
export let zoomFactor = 2.0;
export const setZoomFactor = (z) => { zoomFactor = Math.max(0.5, Math.min(10, z)); };

// ── Playback State ──
export const playbackState = {
  isPlaying: false,
  currentTime: 0,
  lastTickTime: 0,
  rafId: null,
  activeVideoClip: null,
  activeAudioClip: null,
  mode: 'timeline',
  loop: false,
  loopStart: 0,
  loopEnd: 0
};

// ── Selection State ──
export let selectedClip = null;
export const setSelectedClip = (clip) => { selectedClip = clip; };

export let selectedTrack = null;
export const setSelectedTrack = (track) => { selectedTrack = track; };

// Multi-select support
export const selectedClips = new Set();
export function addSelectedClip(clip) {
  selectedClips.add(clip);
  clip.classList.add('clip--selected');
}
export function clearSelectedClips() {
  selectedClips.forEach(c => c.classList.remove('clip--selected'));
  selectedClips.clear();
}

// ── Drag States ──
export const clipDrag = {
  active: false,
  clip: null,
  startMouseX: 0,
  startLeft: 0,
  trackEl: null,
  ghost: null
};

// ── Resize State ──
export const resizeDrag = {
  active: false,
  clip: null,
  handle: null,
  startX: 0,
  startLeft: 0,
  startWidth: 0,
  isLeft: false,
  startTrimStart: 0,
  startTrimEnd: 0,
  baseDur: 0,
};

// ── Crop State ──
export const cropState = {
  active: false,
  clip: null,
  startX: 0,
  startY: 0,
  cropX: 0,
  cropY: 0,
  cropWidth: 100,
  cropHeight: 100
};

// ── History / Undo-Redo ──
export const historyStack = [];
export let historyIdx = -1;

export function pushHistory(action) {
  if (historyIdx < historyStack.length - 1) {
    historyStack.splice(historyIdx + 1);
  }
  historyStack.push({ ...action, timestamp: Date.now() });
  historyIdx++;
  if (historyStack.length > 100) {
    historyStack.shift();
    historyIdx--;
  }
}

export function setHistoryIdx(idx) {
  historyIdx = Math.max(-1, Math.min(historyStack.length - 1, idx));
}

export function clearHistory() {
  historyStack.length = 0;
  historyIdx = -1;
}

// ── Tool States ──
export let isSpeedModeActive = false;
export function setSpeedMode(val) { isSpeedModeActive = val; }

export let activeTool = null;
export function setActiveTool(toolName) {
  activeTool = toolName;
  isSpeedModeActive = (toolName === 'speed');
}

// ── Text Overlay State ──
export const textOverlays = [];
export let textOverlayIdCounter = 0;
export const getNextTextOverlayId = () => ++textOverlayIdCounter;

// ── Filter/Effect State ──
export const activeFilters = new Map();
export const activeTransitions = new Map();

// ── Track States ──
export const trackStates = new Map();

export function initTrackState(trackId) {
  if (!trackStates.has(trackId)) {
    trackStates.set(trackId, {
      muted: false,
      visible: true,
      locked: false,
      volume: 100
    });
  }
}

export function toggleTrackMute(trackId) {
  const state = trackStates.get(trackId);
  if (state) {
    state.muted = !state.muted;
    return state.muted;
  }
  return false;
}

export function toggleTrackVisibility(trackId) {
  const state = trackStates.get(trackId);
  if (state) {
    state.visible = !state.visible;
    return state.visible;
  }
  return true;
}

export function toggleTrackLock(trackId) {
  const state = trackStates.get(trackId);
  if (state) {
    state.locked = !state.locked;
    return state.locked;
  }
  return false;
}

// ── Export State ──
export const exportState = {
  isExporting: false,
  progress: 0,
  cancelRequested: false,
  resolution: '1080p',
  format: 'webm',
  fps: 30,
  mediaRecorder: null
};

// ── Clipboard State (Copy/Paste) ──
export let clipboardData = null;
export function setClipboardData(data) { clipboardData = data ? { ...data } : null; }

// ── In/Out Points ──
export const inOutPoints = {
  inPoint: null,    // seconds
  outPoint: null,   // seconds
  active: false
};
export function setInPoint(t) { inOutPoints.inPoint = t; inOutPoints.active = inOutPoints.inPoint !== null && inOutPoints.outPoint !== null; }
export function setOutPoint(t) { inOutPoints.outPoint = t; inOutPoints.active = inOutPoints.inPoint !== null && inOutPoints.outPoint !== null; }
export function clearInOutPoints() { inOutPoints.inPoint = null; inOutPoints.outPoint = null; inOutPoints.active = false; }

// ── Audio Context (Web Audio API) ──
export const audioMixer = {
  context: null,
  masterGain: null,
  nodes: new Map(),    // assetId → { source, gain }
  destination: null,
  initialized: false
};

export function initAudioMixer() {
  if (audioMixer.initialized) return audioMixer;
  try {
    audioMixer.context = new (window.AudioContext || window.webkitAudioContext)();
    audioMixer.masterGain = audioMixer.context.createGain();
    audioMixer.masterGain.gain.value = 0.8;
    audioMixer.masterGain.connect(audioMixer.context.destination);
    audioMixer.initialized = true;
  } catch(e) {
    console.warn('AudioContext not available:', e);
  }
  return audioMixer;
}

// ── Shared DOM References Mapping ──
const domMapping = {
  trackArea: 'trackArea',
  trackHeaders: 'trackHeaders',
  timeRuler: 'timeRuler',
  videoTrack: 'videoTrack',
  audioTrack: 'audioTrack',
  playheadEl: 'playhead',
  playheadHead: '.playhead__head',
  playheadTooltip: 'playheadTooltip',
  rulerTimeDisplay: 'rulerTimeDisplay',
  snapIndicator: 'snapIndicator',
  timecodeDisplay: 'timecode',
  btnPlay: 'btnPlay',
  btnStart: 'btnStart',
  btnEnd: 'btnEnd',
  btnRewind: 'btnRewind',
  btnFastForward: 'btnFastForward',
  btnStop: 'btnStop',
  volumeSlider: 'volumeSlider',
  volumeIcon: 'volumeIcon',
  zoomSlider: 'zoomSlider',
  zoomValue: 'zoomValue',
  btnUndo: 'btnUndo',
  btnRedo: 'btnRedo',
  btnSplit: 'btnSplit',
  btnTrim: 'btnTrim',
  btnTrimClose: 'btnTrimClose',
  btnTrimApply: 'btnTrimApply',
  btnSpeed: 'btnSpeed',
  btnSpeedClose: 'btnSpeedClose',
  btnCrop: 'btnCrop',
  btnDelete: 'btnDelete',
  btnVolume: 'btnVolume',
  btnVolumeClose: 'btnVolumeClose',
  trimPanel: 'trimPanel',
  speedPanel: 'speedPanel',
  volumePanel: 'volumePanel',
  cropPanel: 'cropPanel',
  btnCropApply: 'btnCropApply',
  btnCropClose: 'btnCropClose',
  trimStartInput: 'trimStart',
  trimEndInput: 'trimEnd',
  speedInput: 'speedInput',
  volumeInput: 'volumeInput',
  volumeValue: 'volumeValue',
  importBtn: 'importBtn',
  importAudioBtn: 'importAudioBtn',
  fileInput: 'fileInput',
  assetGrid: 'assetGrid',
  assetPoolEmpty: 'assetPoolEmpty',
  audioList: 'audioList',
  audioListEmpty: 'audioListEmpty',
  searchInput: 'searchInput',
  sortSelect: 'sortSelect',
  previewCanvas: 'previewCanvas',
  previewAudio: 'previewAudio',
  previewImage: 'previewImage',
  playerPlaceholder: 'playerPlaceholder',
  playerScreen: 'playerScreen',
  playerControls: 'playerControls',
  timeline: 'timeline',
  timelineResizer: 'timelineResizer',
  transitionSelector: 'transitionSelector',
  textOverlayLayer: 'textOverlayLayer',
  cropOverlay: 'cropOverlay',
  customTextInput: 'customTextInput',
  textFontSize: 'textFontSize',
  textColor: 'textColor',
  btnAddText: 'btnAddText',
  addTrackBtn: 'addTrackBtn',
  btnProjectSettings: 'btnProjectSettings',
  btnSaveProject: 'btnSaveProject',
  btnLoadProject: 'btnLoadProject',
  btnExport: 'btnExport',
  exportModal: 'exportModal',
  btnExportCancel: 'btnExportCancel',
  btnExportStart: 'btnExportStart',
  btnExportCancelProgress: 'btnExportCancelProgress',
  exportFormat: 'exportFormat',
  exportFps: 'exportFps',
  exportProgress: 'exportProgress',
  exportProgressFill: 'exportProgressFill',
  exportProgressText: 'exportProgressText',
  exportActions: 'exportActions',
  projectSettingsModal: 'projectSettingsModal',
  btnSettingsCancel: 'btnSettingsCancel',
  btnSettingsSave: 'btnSettingsSave',
  projectResolution: 'projectResolution',
  projectFps: 'projectFps',
  projectDuration: 'projectDuration',
  shortcutsModal: 'shortcutsModal',
  btnShortcutsClose: 'btnShortcutsClose',
  toastContainer: 'toast-container',
  mobileMediaToggle: 'mobileMediaToggle',
  mobileCloseBtn: 'mobileCloseBtn',
  mediaPool: 'mediaPool',
  // New v2.0 DOM refs
  clipInspector: 'clipInspector',
  inspectorNoClip: 'inspectorNoClip',
  inspectorContent: 'inspectorContent',
  inspectorClipName: 'inspectorClipName',
  inspectorStartTime: 'inspectorStartTime',
  inspectorDuration: 'inspectorDuration',
  inspectorSpeed: 'inspectorSpeed',
  inspectorVolume: 'inspectorVolume',
  inspectorFilter: 'inspectorFilter',
  inspectorEffect: 'inspectorEffect',
  inspectorTransition: 'inspectorTransition',
  contextMenu: 'contextMenu',
  projectManagerModal: 'projectManagerModal',
  btnProjectManager: 'btnProjectManager',
  projectList: 'projectList',
  btnProjectManagerClose: 'btnProjectManagerClose',
  inOutMarker: 'inOutMarker',
  customConfirmModal: 'customConfirmModal',
  confirmTitle: 'confirmTitle',
  confirmMessage: 'confirmMessage',
  confirmOk: 'confirmOk',
  confirmCancel: 'confirmCancel',
  projectNameInput: 'projectNameInput',
};

export const dom = {};

export function refreshDomReferences() {
  Object.keys(domMapping).forEach(key => {
    const selector = domMapping[key];
    if (selector.startsWith('.') || selector.startsWith('#')) {
      dom[key] = document.querySelector(selector);
    } else {
      dom[key] = document.getElementById(selector);
    }
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshDomReferences);
  } else {
    refreshDomReferences();
  }
}