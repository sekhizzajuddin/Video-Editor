// ===================================================
// js/utils.js — Mathematics, Formatting, & Helpers
// ===================================================
import { BASE_PX_PER_SEC, zoomFactor, dom, projectSettings } from './state.js';

// ── Time & Position Conversions ──
export const pxPerSec = () => BASE_PX_PER_SEC * zoomFactor;

export function pxToTimecode(px) {
  const secs = Math.max(0, px / pxPerSec());
  return formatTimecode(secs);
}

export function timecodeToPx(timecode) {
  const parts = timecode.split(':').map(Number);
  let seconds = 0;
  if (parts.length === 3) {
    seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    seconds = parts[0] * 60 + parts[1];
  }
  return seconds * pxPerSec();
}

export function secondsToPx(seconds) {
  return seconds * pxPerSec();
}

export function pxToSeconds(px) {
  return px / pxPerSec();
}

// ── Time Formatting ──
export function formatTimecode(s) {
  if (!isFinite(s) || s < 0) return '00:00:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 100);

  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

export function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function formatDuration(secs) {
  if (!isFinite(secs) || secs < 0) return '00:00';
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function formatDurationDetailed(secs) {
  if (!isFinite(secs) || secs <= 0) return '0s';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ── Promise Utilities ──
export function promiseTimeout(promise, ms, timeoutValue) {
  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(timeoutValue), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

// ── Media Duration Extraction ──
export function getAudioDuration(objectURL) {
  const p = new Promise((resolve) => {
    const a = new Audio();
    a.preload = 'metadata';
    a.addEventListener('loadedmetadata', () => {
      resolve(isFinite(a.duration) ? a.duration : 0);
    }, { once: true });
    a.addEventListener('error', () => resolve(0), { once: true });
    a.src = objectURL;
    a.load();
  });
  return promiseTimeout(p, 3000, 0);
}

export function getVideoDuration(objectURL) {
  const p = new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.addEventListener('loadedmetadata', () => {
      const d = isFinite(v.duration) ? v.duration : 0;
      resolve(d);
      v.remove();
    }, { once: true });
    v.addEventListener('error', () => {
      resolve(0);
      v.remove();
    }, { once: true });
    v.src = objectURL;
    v.load();
  });
  return promiseTimeout(p, 4000, 0);
}

// ── Thumbnail Generation ──
export function captureVideoThumbnail(objectURL, time = 0.5) {
  const p = new Promise((resolve) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    video.muted = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    
    let isResolved = false;

    video.addEventListener('loadedmetadata', () => {
      canvas.width = Math.min(video.videoWidth || 320, 640);
      canvas.height = Math.min(video.videoHeight || 180, 360);
      video.currentTime = Math.min(time, video.duration * 0.1 || 1);
    }, { once: true });

    video.addEventListener('seeked', () => {
      if (isResolved) return;
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        isResolved = true;
        resolve(dataUrl);
      } catch (e) {
        isResolved = true;
        resolve('');
      }
      video.src = '';
      video.remove();
    }, { once: true });

    video.addEventListener('error', () => {
      if (isResolved) return;
      isResolved = true;
      resolve('');
      video.remove();
    }, { once: true });

    video.src = objectURL;
    video.load();
  });
  return promiseTimeout(p, 5000, '');
}

export function captureImageThumbnail(objectURL, maxWidth = 320, maxHeight = 180) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ratio = Math.min(maxWidth / img.naturalWidth, maxHeight / img.naturalHeight, 1);
      canvas.width = img.naturalWidth * ratio;
      canvas.height = img.naturalHeight * ratio;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      try {
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } catch (e) {
        resolve(objectURL);
      }
    };
    
    img.onerror = () => resolve(objectURL);
    img.src = objectURL;
  });
}

// ── Video Metadata Extraction ──
export async function extractVideoMetadata(objectURL) {
  const p = new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous';
    
    video.onloadedmetadata = () => {
      const width = video.videoWidth || 1920;
      const height = video.videoHeight || 1080;
      const aspectRatio = width / height;
      const duration = video.duration || 0;
      
      let aspectRatioStr;
      if (Math.abs(aspectRatio - 16/9) < 0.1) aspectRatioStr = '16:9';
      else if (Math.abs(aspectRatio - 9/16) < 0.1) aspectRatioStr = '9:16';
      else if (Math.abs(aspectRatio - 1) < 0.1) aspectRatioStr = '1:1';
      else if (Math.abs(aspectRatio - 4/3) < 0.1) aspectRatioStr = '4:3';
      else if (Math.abs(aspectRatio - 21/9) < 0.1) aspectRatioStr = '21:9';
      else aspectRatioStr = `${width}:${height}`;
      
      resolve({ width, height, aspectRatio, aspectRatioStr, duration, frameRate: 30 });
      video.remove();
    };
    
    video.onerror = () => {
      resolve({ width: 1920, height: 1080, aspectRatio: 16/9, aspectRatioStr: '16:9', duration: 0, frameRate: 30 });
      video.remove();
    };
    
    video.src = objectURL;
    video.load();
  });
  return promiseTimeout(p, 5000, {
    width: 1920, height: 1080, aspectRatio: 16/9, aspectRatioStr: '16:9', duration: 0, frameRate: 30
  });
}

export async function extractImageMetadata(objectURL) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      const aspectRatio = width / height;
      resolve({ width, height, aspectRatio, aspectRatioStr: `${width}:${height}` });
    };
    
    img.onerror = () => {
      resolve({ width: 1920, height: 1080, aspectRatio: 16/9, aspectRatioStr: '16:9' });
    };
    
    img.src = objectURL;
  });
}

// ── Player Canvas Adaptation ──
export function adaptPlayerCanvas(aspectRatio) {
  const playerScreen = dom.playerScreen;
  if (!playerScreen || !aspectRatio) return;
  
  const container = playerScreen.parentElement;
  if (!container) return;
  
  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;
  const padding = 32;
  
  const maxWidth = containerWidth - padding;
  const maxHeight = containerHeight - padding;
  
  let width = maxWidth;
  let height = width / aspectRatio;
  
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }
  
  playerScreen.style.width = `${width}px`;
  playerScreen.style.height = `${height}px`;
}

// ── Toast Notifications ──
export function showToast(message, type = 'info', duration = 3000) {
  const container = dom.toastContainer || document.getElementById('toast-container');
  if (!container) {
    console.log(`[${type.toUpperCase()}] ${message}`);
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  
  const icons = { success: '✓', error: '✖', warning: '⚠', info: 'ℹ' };
  
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
  `;
  
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── File Utilities ──
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function getFileExtension(filename) {
  return filename.split('.').pop().toLowerCase();
}

export function isVideoFile(filename) {
  const ext = getFileExtension(filename);
  return ['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi', 'flv', 'wmv', 'm4v'].includes(ext);
}

export function isAudioFile(filename) {
  const ext = getFileExtension(filename);
  return ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'wma'].includes(ext);
}

export function isImageFile(filename) {
  const ext = getFileExtension(filename);
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
}

// ── Debounce & Throttle ──
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// ── Color Utilities ──
export function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 255, g: 255, b: 255 };
}

export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = Math.max(0, Math.min(255, x)).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

// ── Math Utilities ──
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(start, end, t) {
  return start + (end - start) * t;
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ── Download Utilities ──
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── Canvas Utilities ──
export function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function canvasToBlob(canvas, type = 'image/png', quality = 0.9) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

// ── Async Video Seek Helper ──
export function seekVideo(video, time) {
  return new Promise((resolve, reject) => {
    if (!video) {
      reject(new Error('No video element'));
      return;
    }
    
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      resolve();
    };
    
    const onError = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      reject(new Error('Video seek error'));
    };
    
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = time;
  });
}

// ── Auto-save ──
export function autoSaveProject(projectData) {
  try {
    localStorage.setItem('vidforge_autosave', JSON.stringify(projectData));
  } catch (e) {
    console.warn('Auto-save failed:', e);
  }
}

export function loadAutoSave() {
  try {
    const data = localStorage.getItem('vidforge_autosave');
    return data ? JSON.parse(data) : null;
// ── Waveform Drawing ──
export function drawEnhancedWaveform(ctx, canvas, data) {
  if (!ctx || !canvas || !data) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  
  const step = Math.ceil(data.length / w);
  const amp = h / 2;
  
  ctx.beginPath();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  
  for (let i = 0; i < w; i++) {
    const start = i * step;
    const chunk = data.slice(start, start + step);
    const min = Math.min(...chunk) || 0;
    const max = Math.max(...chunk) || 0;
    
    ctx.moveTo(i, amp - (max * amp));
    ctx.lineTo(i, amp - (min * amp));
  }
  ctx.stroke();
}