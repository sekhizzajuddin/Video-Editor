// ===================================================
// js/codec.js — Media Rendering Codecs & Effects
// ===================================================

export function renderVideoFrame(ctx, canvas, video, crop = null) {
  if (!video || !video.videoWidth) return;
  
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  const videoRatio = video.videoWidth / video.videoHeight;
  const canvasRatio = canvas.width / canvas.height;
  
  let renderWidth, renderHeight, offsetX, offsetY;
  
  if (videoRatio > canvasRatio) {
    renderWidth = canvas.width;
    renderHeight = canvas.width / videoRatio;
    offsetX = 0;
    offsetY = (canvas.height - renderHeight) / 2;
  } else {
    renderHeight = canvas.height;
    renderWidth = canvas.height * videoRatio;
    offsetX = (canvas.width - renderWidth) / 2;
    offsetY = 0;
  }
  
  if (crop) {
    const sx = (crop.x / 100) * video.videoWidth;
    const sy = (crop.y / 100) * video.videoHeight;
    const sw = (crop.width / 100) * video.videoWidth;
    const sh = (crop.height / 100) * video.videoHeight;
    
    ctx.drawImage(
      video,
      sx, sy, sw, sh,
      offsetX, offsetY, renderWidth, renderHeight
    );
  } else {
    ctx.drawImage(
      video,
      0, 0, video.videoWidth, video.videoHeight,
      offsetX, offsetY, renderWidth, renderHeight
    );
  }
  
  return { offsetX, offsetY, renderWidth, renderHeight };
}

export function renderImageFrame(ctx, canvas, img, crop = null) {
  if (!img || !img.complete) return;
  
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const canvasRatio = canvas.width / canvas.height;
  
  let renderWidth, renderHeight, offsetX, offsetY;
  
  if (imgRatio > canvasRatio) {
    renderWidth = canvas.width;
    renderHeight = canvas.width / imgRatio;
    offsetX = 0;
    offsetY = (canvas.height - renderHeight) / 2;
  } else {
    renderHeight = canvas.height;
    renderWidth = canvas.height * imgRatio;
    offsetX = (canvas.width - renderWidth) / 2;
    offsetY = 0;
  }
  
  if (crop) {
    const sx = (crop.x / 100) * img.naturalWidth;
    const sy = (crop.y / 100) * img.naturalHeight;
    const sw = (crop.width / 100) * img.naturalWidth;
    const sh = (crop.height / 100) * img.naturalHeight;
    
    ctx.drawImage(
      img,
      sx, sy, sw, sh,
      offsetX, offsetY, renderWidth, renderHeight
    );
  } else {
    ctx.drawImage(
      img,
      0, 0, img.naturalWidth, img.naturalHeight,
      offsetX, offsetY, renderWidth, renderHeight
    );
  }
  
  return { offsetX, offsetY, renderWidth, renderHeight };
}

export function applyVolumeMultiplier(mediaElement, volumeSliderNode) {
  if (!mediaElement) return;
  mediaElement.muted = false;
  if (volumeSliderNode) {
    const volume = parseInt(volumeSliderNode.value, 10) / 100;
    mediaElement.volume = volume;
  }
}

export function renderTextOverlay(ctx, canvas, text, options = {}) {
  const {
    x = canvas.width / 2,
    y = canvas.height / 2,
    fontSize = 48,
    fontFamily = 'Inter, sans-serif',
    color = '#ffffff',
    align = 'center',
    baseline = 'middle',
    shadow = true,
    shadowColor = 'rgba(0,0,0,0.5)',
    shadowBlur = 4,
    shadowOffsetX = 2,
    shadowOffsetY = 2,
    maxWidth = canvas.width - 40
  } = options;
  
  ctx.save();
  
  ctx.font = `bold ${fontSize}px ${fontFamily}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillStyle = color;
  
  if (shadow) {
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = shadowBlur;
    ctx.shadowOffsetX = shadowOffsetX;
    ctx.shadowOffsetY = shadowOffsetY;
  }
  
  const lines = text.split('\n');
  const lineHeight = fontSize * 1.2;
  const startY = lines.length === 1 ? y : y - ((lines.length - 1) * lineHeight) / 2;
  
  lines.forEach((line, index) => {
    const lineY = startY + (index * lineHeight);
    ctx.fillText(line, x, lineY, maxWidth);
  });
  
  ctx.restore();
}

export function getFilterString(filterName, intensity = 1) {
  const filters = {
    bw: `grayscale(${100 * intensity}%)`,
    sepia: `sepia(${100 * intensity}%)`,
    invert: `invert(${100 * intensity}%)`,
    warm: `sepia(${30 * intensity}%) saturate(${150 * intensity}%)`,
    cool: `hue-rotate(${180 * intensity}deg) saturate(${80 * intensity}%)`,
    vintage: `sepia(${50 * intensity}%) contrast(${120 * intensity}%)`,
    matte: `contrast(${90 * intensity}%) brightness(${110 * intensity}%)`,
    lemon: `hue-rotate(${-30 * intensity}deg) saturate(${150 * intensity}%)`,
    blur: `blur(${5 * intensity}px)`,
    brightness: `brightness(${100 + (50 * intensity)}%)`,
    contrast: `contrast(${100 + (50 * intensity)}%)`,
    saturate: `saturate(${100 + (50 * intensity)}%)`
  };
  
  return filters[filterName] || '';
}

export function renderTransition(ctx, canvas, fromFrame, toFrame, progress, type = 'fade') {
  switch (type) {
    case 'fade':
      ctx.globalAlpha = 1 - progress;
      ctx.drawImage(fromFrame, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = progress;
      ctx.drawImage(toFrame, 0, 0, canvas.width, canvas.height);
      break;
      
    case 'wipe':
      ctx.drawImage(fromFrame, 0, 0, canvas.width, canvas.height);
      const wipeWidth = canvas.width * progress;
      ctx.drawImage(toFrame, 0, 0, wipeWidth, canvas.height, 0, 0, wipeWidth, canvas.height);
      break;
      
    case 'slide':
      const slideOffset = canvas.width * progress;
      ctx.drawImage(fromFrame, 0, 0, canvas.width, canvas.height, -slideOffset, 0, canvas.width, canvas.height);
      ctx.drawImage(toFrame, 0, 0, canvas.width, canvas.height, canvas.width - slideOffset, 0, canvas.width, canvas.height);
      break;
      
    case 'zoom':
      const zoomScale = 1 + (progress * 0.5);
      const zoomOffsetX = (canvas.width * (zoomScale - 1)) / 2;
      const zoomOffsetY = (canvas.height * (zoomScale - 1)) / 2;
      
      ctx.globalAlpha = 1 - progress;
      ctx.drawImage(fromFrame, -zoomOffsetX, -zoomOffsetY, canvas.width * zoomScale, canvas.height * zoomScale);
      
      ctx.globalAlpha = progress;
      ctx.drawImage(toFrame, 0, 0, canvas.width, canvas.height);
      break;
      
    default:
      ctx.globalAlpha = 1 - progress;
      ctx.drawImage(fromFrame, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = progress;
      ctx.drawImage(toFrame, 0, 0, canvas.width, canvas.height);
  }
  
  ctx.globalAlpha = 1;
}

export function generateWaveformData(audioBuffer, samples = 100) {
  const channelData = audioBuffer.getChannelData(0);
  const blockSize = Math.floor(channelData.length / samples);
  const waveform = [];
  
  for (let i = 0; i < samples; i++) {
    let sum = 0;
    for (let j = 0; j < blockSize; j++) {
      sum += Math.abs(channelData[i * blockSize + j]);
    }
    waveform.push(sum / blockSize);
  }
  
  return waveform;
}

export function drawWaveform(ctx, canvas, waveformData, options = {}) {
  const {
    color = '#5b6ef5',
    barWidth = 2,
    barGap = 1,
    centerLine = true
  } = options;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const barCount = Math.floor(canvas.width / (barWidth + barGap));
  const step = Math.ceil(waveformData.length / barCount);
  const amp = canvas.height / 2;
  
  ctx.fillStyle = color;
  
  for (let i = 0; i < barCount; i++) {
    const value = waveformData[i * step] || 0;
    const height = value * amp * 2;
    const x = i * (barWidth + barGap);
    const y = (canvas.height - height) / 2;
    
    ctx.fillRect(x, y, barWidth, height);
  }
  
  if (centerLine) {
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
  }
}

export async function captureFrame(video, time) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const ctx = canvas.getContext('2d');
    
    const onSeeked = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      resolve(canvas);
      video.removeEventListener('seeked', onSeeked);
    };
    
    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
  });
}

export function compositeCanvases(targetCanvas, ...sourceCanvases) {
  const ctx = targetCanvas.getContext('2d');
  ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  
  sourceCanvases.forEach(source => {
    if (source && source.width > 0) {
      ctx.drawImage(source, 0, 0, targetCanvas.width, targetCanvas.height);
    }
  });
}

export function createOffscreenCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function scaleCanvas(sourceCanvas, targetWidth, targetHeight) {
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  ctx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
  return canvas;
}