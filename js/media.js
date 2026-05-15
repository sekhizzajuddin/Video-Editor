// ===================================================
// js/media.js — File Management & Media Pool UI
// ===================================================
import { 
  uploadedAssets, getNextAssetId, videoElementCache, audioElementCache, 
  imageElementCache, dom, playbackState 
} from './state.js';
import { 
  getAudioDuration, getVideoDuration, captureVideoThumbnail, 
  captureImageThumbnail, extractVideoMetadata, extractImageMetadata,
  adaptPlayerCanvas, showToast, formatDuration, formatFileSize,
  isVideoFile, isAudioFile, isImageFile, getFileExtension
} from './utils.js';
import { stopPlayback, showPreviewEl, stopPreview, syncPlayerToTimeline } from './engine.js';
import { addClipToTrack } from './timeline.js';
import { generateWaveformData } from './codec.js';

export function updateEmptyStates() {
  const hasMedia = uploadedAssets.length > 0;
  const hasAudio = uploadedAssets.some(a => a.type === 'audio');

  if (dom.assetPoolEmpty) {
    dom.assetPoolEmpty.style.display = hasMedia ? 'none' : 'flex';
  }
  if (dom.audioListEmpty) {
    dom.audioListEmpty.style.display = hasAudio ? 'none' : 'flex';
  }
}

export function createMediaCard(asset) {
  const card = document.createElement('div');
  card.className = 'asset-card';
  card.dataset.type = asset.type;
  card.dataset.id = asset.id;
  card.draggable = true;

  const thumb = document.createElement('div');
  thumb.className = `asset-thumb asset-thumb--${asset.type}`;

  if (asset.thumbnail) {
    const img = document.createElement('img');
    img.src = asset.thumbnail;
    img.className = 'asset-thumb__img';
    img.alt = asset.name;
    img.loading = 'lazy';
    thumb.appendChild(img);
  } else {
    const icon = document.createElement('span');
    icon.className = 'asset-thumb__icon';
    icon.textContent = asset.type === 'video' ? '🎬' : asset.type === 'audio' ? '🎵' : '🖼️';
    thumb.appendChild(icon);
  }

  const durBadge = document.createElement('span');
  durBadge.className = 'asset-thumb__duration';
  durBadge.textContent = formatDuration(asset.duration);
  thumb.appendChild(durBadge);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'asset-card__delete';
  deleteBtn.innerHTML = '×';
  deleteBtn.title = 'Remove from pool';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    removeAsset(asset.id);
  });
  card.appendChild(deleteBtn);

  const name = document.createElement('p');
  name.className = 'asset-name';
  name.textContent = asset.name;
  name.title = asset.name;

  card.appendChild(thumb);
  card.appendChild(name);

  card.addEventListener('dragstart', (e) => {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', asset.id);
    }
    card.classList.add('asset-card--dragging');
    window.__currentDragId = asset.id;
    window.__currentDragType = asset.type;
  });
  
  card.addEventListener('dragend', () => {
    card.classList.remove('asset-card--dragging');
  });

  card.addEventListener('dblclick', () => previewAsset(asset));

  if (dom.assetGrid) {
    if (dom.assetPoolEmpty) {
      dom.assetGrid.insertBefore(card, dom.assetPoolEmpty);
    } else {
      dom.assetGrid.appendChild(card);
    }
  }
  
  return card;
}

export function createAudioRow(asset) {
  const ext = getFileExtension(asset.name).toUpperCase();
  const item = document.createElement('div');
  item.className = 'audio-item';
  item.dataset.id = asset.id;
  item.dataset.type = asset.type;
  item.draggable = true;

  item.innerHTML = `
    <span class="audio-item__icon">${ext === 'WAV' ? '🎤' : '🎵'}</span>
    <div class="audio-item__info">
      <p class="audio-item__name" title="${asset.name}">${asset.name}</p>
      <p class="audio-item__meta">${ext} · ${formatDuration(asset.duration)} · ${formatFileSize(asset.file?.size || 0)}</p>
    </div>
    <button class="audio-item__play" title="Preview">▶</button>
  `;

  item.addEventListener('dragstart', (e) => {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', asset.id);
    }
    window.__currentDragId = asset.id;
    window.__currentDragType = asset.type;
  });

  let previewAudio = null;
  item.querySelector('.audio-item__play').addEventListener('click', (e) => {
    e.stopPropagation();
    const btn = e.currentTarget;
    
    if (previewAudio && !previewAudio.paused) {
      previewAudio.pause();
      previewAudio.currentTime = 0;
      btn.textContent = '▶';
      return;
    }
    
    previewAudio = previewAudio || new Audio(asset.objectURL);
    previewAudio.volume = 0.5;
    
    previewAudio.play().catch(err => {
      console.error('Audio preview error:', err);
      showToast('Failed to preview audio', 'error');
    });
    
    btn.textContent = '⏹';
    previewAudio.addEventListener('ended', () => {
      btn.textContent = '▶';
    }, { once: true });
  });

  if (dom.audioList && dom.audioListEmpty) {
    dom.audioList.insertBefore(item, dom.audioListEmpty);
  }
  
  return item;
}

export async function previewAsset(asset) {
  stopPlayback();
  
  try {
    switch (asset.type) {
      case 'video':
        await previewVideo(asset);
        break;
      case 'audio':
        await previewAudio(asset);
        break;
      case 'image':
        await previewImage(asset);
        break;
      default:
        showToast('Unknown asset type', 'error');
    }
  } catch (error) {
    console.error('Preview error:', error);
    showToast('Failed to preview asset', 'error');
    stopPreview();
  }
}

async function previewVideo(asset) {
  const canvas = dom.previewCanvas;
  if (!canvas) return;
  
  let hiddenVideo = videoElementCache.get(asset.id);
  
  if (!hiddenVideo) {
    hiddenVideo = document.createElement('video');
    hiddenVideo.src = asset.objectURL;
    hiddenVideo.preload = 'auto';
    hiddenVideo.muted = false;
    hiddenVideo.playsInline = true;
    hiddenVideo.crossOrigin = 'anonymous';
    hiddenVideo.dataset.id = asset.id;
    videoElementCache.set(asset.id, hiddenVideo);
  }
  
  hiddenVideo.currentTime = 0;
  hiddenVideo.loop = true;
  hiddenVideo.playbackRate = 1;
  hiddenVideo.muted = false;
  
  showPreviewEl('video');
  
  if (window.__previewRaf) {
    cancelAnimationFrame(window.__previewRaf);
    window.__previewRaf = null;
  }
  
  function renderPreview() {
    if (!hiddenVideo || hiddenVideo.paused) return;
    
    const parent = canvas.parentElement;
    if (!parent) return;
    
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const hRatio = canvas.width / (hiddenVideo.videoWidth || 1);
    const vRatio = canvas.height / (hiddenVideo.videoHeight || 1);
    const ratio = Math.min(hRatio, vRatio);
    
    const centerShiftX = (canvas.width - hiddenVideo.videoWidth * ratio) / 2;
    const centerShiftY = (canvas.height - hiddenVideo.videoHeight * ratio) / 2;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      hiddenVideo,
      0, 0, hiddenVideo.videoWidth, hiddenVideo.videoHeight,
      centerShiftX, centerShiftY,
      hiddenVideo.videoWidth * ratio, hiddenVideo.videoHeight * ratio
    );
    
    window.__previewRaf = requestAnimationFrame(renderPreview);
  }
  
  hiddenVideo.play().then(() => {
    renderPreview();
  }).catch(err => {
    console.error('Video play error:', err);
    showToast('Failed to play video', 'error');
  });
}

async function previewAudio(asset) {
  const pa = dom.previewAudio;
  if (!pa) return;
  
  pa.pause();
  pa.removeAttribute('src');
  pa.load();
  
  pa.src = asset.objectURL;
  pa.loop = true;
  pa.playbackRate = 1;
  pa.volume = 0.5;
  
  pa.onerror = () => {
    showToast('Failed to load audio', 'error');
    stopPreview();
  };
  
  pa.onloadedmetadata = () => {
    showPreviewEl('audio');
    pa.play().catch(err => {
      console.error('Audio play error:', err);
      showToast('Failed to play audio', 'error');
    });
  };
}

async function previewImage(asset) {
  const canvas = dom.previewCanvas;
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  let img = imageElementCache.get(asset.id);
  
  if (!img) {
    img = new Image();
    img.crossOrigin = 'anonymous';
    imageElementCache.set(asset.id, img);
  }
  
  img.onload = () => {
    const parent = canvas.parentElement;
    if (!parent) return;
    
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
    
    const hRatio = canvas.width / img.naturalWidth;
    const vRatio = canvas.height / img.naturalHeight;
    const ratio = Math.min(hRatio, vRatio);
    
    const centerShiftX = (canvas.width - img.naturalWidth * ratio) / 2;
    const centerShiftY = (canvas.height - img.naturalHeight * ratio) / 2;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      img,
      0, 0, img.naturalWidth, img.naturalHeight,
      centerShiftX, centerShiftY,
      img.naturalWidth * ratio, img.naturalHeight * ratio
    );
    
    showPreviewEl('video');
  };
  
  img.onerror = () => {
    showToast('Failed to load image', 'error');
  };
  
  img.src = asset.objectURL;
}

export async function handleFilesSelected(files) {
  const filesArray = Array.from(files);
  let successCount = 0;
  let skippedCount = 0;
  
  for (const file of filesArray) {
    const isVideo = file.type.startsWith('video/') || isVideoFile(file.name);
    const isAudio = file.type.startsWith('audio/') || isAudioFile(file.name);
    const isImage = file.type.startsWith('image/') || isImageFile(file.name);
    
    if (!isVideo && !isAudio && !isImage) {
      showToast(`Skipped "${file.name}" — unsupported file type`, 'warning');
      skippedCount++;
      continue;
    }

    const isDuplicate = uploadedAssets.some(a => 
      a.name === file.name && a.file?.size === file.size
    );
    
    if (isDuplicate) {
      showToast(`"${file.name}" is already in your media pool`, 'info');
      skippedCount++;
      continue;
    }

    const id = `asset-${getNextAssetId()}`;
    const objectURL = URL.createObjectURL(file);
    const type = isVideo ? 'video' : (isAudio ? 'audio' : 'image');

    const asset = {
      id,
      file,
      objectURL,
      name: file.name,
      type,
      size: file.size,
      duration: 0,
      width: 0,
      height: 0,
      thumbnail: '',
      addedAt: Date.now()
    };

    try {
      if (isVideo) {
        await processVideoAsset(asset);
      } else if (isAudio) {
        await processAudioAsset(asset);
      } else if (isImage) {
        await processImageAsset(asset);
      }

      uploadedAssets.push(asset);
      createMediaCard(asset);
      if (type === 'audio') createAudioRow(asset);
      
      const trackEl = (type === 'audio') ? dom.audioTrack : dom.videoTrack;
      if (trackEl && asset.duration > 0) {
        const playheadLeft = parseFloat(dom.playheadEl?.style?.left) || 0;
        addClipToTrack(asset, trackEl, playheadLeft);
        syncPlayerToTimeline(playbackState?.currentTime || 0);
      }
      
      successCount++;
    } catch (err) {
      console.error(`Error processing file ${file.name}:`, err);
      showToast(`Error processing "${file.name}"`, 'error');
      URL.revokeObjectURL(objectURL);
    }
  }

  updateEmptyStates();
  
  if (successCount > 0) {
    showToast(`Successfully imported ${successCount} files`, 'success');
  }
  if (skippedCount > 0) {
    showToast(`⚠ Skipped ${skippedCount} file${skippedCount > 1 ? 's' : ''}`, 'warning');
  }

  if (dom.fileInput) dom.fileInput.value = '';
}

async function processVideoAsset(asset) {
  try {
    const [metadata, thumbnail] = await Promise.all([
      extractVideoMetadata(asset.objectURL),
      captureVideoThumbnail(asset.objectURL, 0.5)
    ]);

    asset.width = metadata.width;
    asset.height = metadata.height;
    asset.aspectRatio = metadata.aspectRatio;
    asset.aspectRatioStr = metadata.aspectRatioStr;
    asset.thumbnail = thumbnail;
    asset.duration = metadata.duration || 0;
    
    adaptPlayerCanvas(metadata.aspectRatio);

    const hiddenVid = document.createElement('video');
    hiddenVid.src = asset.objectURL;
    hiddenVid.preload = 'auto';
    hiddenVid.muted = true;
    hiddenVid.playsInline = true;
    hiddenVid.crossOrigin = 'anonymous';
    hiddenVid.dataset.id = asset.id;
    hiddenVid.load();
    videoElementCache.set(asset.id, hiddenVid);
    
  } catch (err) {
    console.error("Video processing error:", err);
    throw err;
  }
}

async function processAudioAsset(asset) {
  try {
    asset.duration = await getAudioDuration(asset.objectURL);
    
    const hiddenAudio = new Audio(asset.objectURL);
    hiddenAudio.preload = 'auto';
    hiddenAudio.dataset.id = asset.id;
    audioElementCache.set(asset.id, hiddenAudio);
    
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const res = await fetch(asset.objectURL);
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      asset.waveformData = generateWaveformData(audioBuffer, 500);
      if (audioCtx.state !== 'closed') audioCtx.close().catch(() => {});
    } catch (err) {
      console.warn("Waveform gen failed:", err);
    }
  } catch (error) {
    console.error('Audio metadata error:', error);
    asset.duration = 0;
  }
}

async function processImageAsset(asset) {
  try {
    const metadata = await extractImageMetadata(asset.objectURL);
    asset.width = metadata.width;
    asset.height = metadata.height;
    asset.aspectRatio = metadata.aspectRatio;
    asset.aspectRatioStr = metadata.aspectRatioStr;
    asset.duration = 5;
    asset.thumbnail = await captureImageThumbnail(asset.objectURL, 320, 180);
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = asset.objectURL;
    imageElementCache.set(asset.id, img);
    
  } catch (error) {
    console.error('Image metadata error:', error);
    asset.duration = 5;
    asset.thumbnail = asset.objectURL;
  }
}

export function removeAsset(assetId) {
  const index = uploadedAssets.findIndex(a => a.id === assetId);
  if (index === -1) return;
  
  const asset = uploadedAssets[index];
  
  if (asset.objectURL) {
    URL.revokeObjectURL(asset.objectURL);
  }
  
  videoElementCache.delete(assetId);
  audioElementCache.delete(assetId);
  imageElementCache.delete(assetId);
  
  uploadedAssets.splice(index, 1);
  
  const card = document.querySelector(`.asset-card[data-id="${assetId}"]`);
  if (card) card.remove();
  
  const audioRow = document.querySelector(`.audio-item[data-id="${assetId}"]`);
  if (audioRow) audioRow.remove();
  
  updateEmptyStates();
  showToast(`Removed "${asset.name}"`, 'info');
}

export function searchAssets(query) {
  const cards = document.querySelectorAll('.asset-card, .audio-item');
  const lowerQuery = query.toLowerCase();
  
  cards.forEach(card => {
    const assetId = card.dataset.id;
    const asset = uploadedAssets.find(a => a.id === assetId);
    if (asset) {
      const matches = asset.name.toLowerCase().includes(lowerQuery) ||
                      asset.type.toLowerCase().includes(lowerQuery);
      card.style.display = matches ? '' : 'none';
    }
  });
}

export function sortAssets(sortBy) {
  const grid = dom.assetGrid;
  if (!grid) return;
  
  const cards = Array.from(grid.querySelectorAll('.asset-card'));
  
  cards.sort((a, b) => {
    const assetA = uploadedAssets.find(asset => asset.id === a.dataset.id);
    const assetB = uploadedAssets.find(asset => asset.id === b.dataset.id);
    
    if (!assetA || !assetB) return 0;
    
    switch (sortBy) {
      case 'az':
        return assetA.name.localeCompare(assetB.name);
      case 'date':
      default:
        return (assetB.addedAt || 0) - (assetA.addedAt || 0);
    }
  });
  
  cards.forEach(card => grid.appendChild(card));
}

export function clearAllAssets() {
  uploadedAssets.forEach(asset => {
    if (asset.objectURL) {
      URL.revokeObjectURL(asset.objectURL);
    }
  });
  
  videoElementCache.clear();
  audioElementCache.clear();
  imageElementCache.clear();
  
  uploadedAssets.length = 0;
  
  if (dom.assetGrid) {
    const cards = dom.assetGrid.querySelectorAll('.asset-card');
    cards.forEach(card => card.remove());
  }
  
  if (dom.audioList) {
    const items = dom.audioList.querySelectorAll('.audio-item');
    items.forEach(item => item.remove());
  }
  
  updateEmptyStates();
  showToast('Cleared all assets', 'info');
}