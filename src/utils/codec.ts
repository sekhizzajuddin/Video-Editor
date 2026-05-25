export interface RenderDimensions {
  offsetX: number;
  offsetY: number;
  renderWidth: number;
  renderHeight: number;
}

export interface TextOverlayOptions {
  x?: number;
  y?: number;
  fontSize?: number;
  fontFamily?: string;
  color?: string | CanvasGradient | CanvasPattern;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  shadow?: boolean;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  maxWidth?: number;
  outlineColor?: string;
  outlineWidth?: number;
  backgroundColor?: string;
  backgroundOpacity?: number;
  animation?: 'none' | 'fadeIn' | 'typewriter' | 'slideUp' | 'slideDown' | 'scalePop' | 'bounce' | 'glitch' | 'wave';
  localTime?: number;
  duration?: number;
}

export interface WaveformOptions {
  color?: string | CanvasGradient | CanvasPattern;
  barWidth?: number;
  barGap?: number;
  centerLine?: boolean;
}

export type FilterName = 'bw' | 'sepia' | 'invert' | 'warm' | 'cool' | 'contrast';
export type CSSFilterName = FilterName | 'vintage' | 'matte' | 'lemon' | 'blur' | 'brightness' | 'saturate';
export type TransitionType = 'fade' | 'wipe' | 'slide' | 'zoom';

export function calculateAspectRatioFit(
  srcWidth: number,
  srcHeight: number,
  maxWidth: number,
  maxHeight: number
): RenderDimensions {
  const srcRatio = srcWidth / srcHeight;
  const maxRatio = maxWidth / maxHeight;
  let renderWidth: number, renderHeight: number, offsetX: number, offsetY: number;
  if (srcRatio > maxRatio) {
    renderWidth = maxWidth;
    renderHeight = maxWidth / srcRatio;
    offsetX = 0;
    offsetY = (maxHeight - renderHeight) / 2;
  } else {
    renderHeight = maxHeight;
    renderWidth = maxHeight * srcRatio;
    offsetX = (maxWidth - renderWidth) / 2;
    offsetY = 0;
  }
  return { offsetX, offsetY, renderWidth, renderHeight };
}

export function renderVideoFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  crop?: { x: number; y: number; width: number; height: number }
): RenderDimensions | undefined {
  if (!video || !video.videoWidth) return;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  const sx = crop ? crop.x * video.videoWidth : 0;
  const sy = crop ? crop.y * video.videoHeight : 0;
  const sw = crop ? crop.width * video.videoWidth : video.videoWidth;
  const sh = crop ? crop.height * video.videoHeight : video.videoHeight;
  
  const dims = calculateAspectRatioFit(sw, sh, canvas.width, canvas.height);
  ctx.drawImage(video, sx, sy, sw, sh, dims.offsetX, dims.offsetY, dims.renderWidth, dims.renderHeight);
  return dims;
}

export function renderImageFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  crop?: { x: number; y: number; width: number; height: number }
): RenderDimensions | undefined {
  if (!img || !img.complete || !img.naturalWidth) return;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  const sx = crop ? crop.x * img.naturalWidth : 0;
  const sy = crop ? crop.y * img.naturalHeight : 0;
  const sw = crop ? crop.width * img.naturalWidth : img.naturalWidth;
  const sh = crop ? crop.height * img.naturalHeight : img.naturalHeight;
  
  const dims = calculateAspectRatioFit(sw, sh, canvas.width, canvas.height);
  ctx.drawImage(img, sx, sy, sw, sh, dims.offsetX, dims.offsetY, dims.renderWidth, dims.renderHeight);
  return dims;
}

export function renderTextOverlay(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  text: string,
  options: TextOverlayOptions = {}
): void {
  const {
    x = canvas.width / 2, y = canvas.height / 2, fontSize = 48,
    fontFamily = 'Inter, sans-serif', color = '#ffffff',
    align = 'center', baseline = 'middle', shadow = true,
    shadowColor = 'rgba(0,0,0,0.5)', shadowBlur = 4,
    shadowOffsetX = 2, shadowOffsetY = 2, maxWidth = canvas.width - 40,
    outlineColor, outlineWidth = 0, backgroundColor, backgroundOpacity = 0.5,
    animation = 'none', localTime = 0,
  } = options;

  // Apply Typewriter character slice first before line splitting or measuring
  let animatedText = text;
  if (animation === 'typewriter') {
    const progress = Math.min(1, localTime / 1.5);
    const visibleChars = Math.floor(text.length * progress);
    animatedText = text.substring(0, visibleChars);
  }

  ctx.save();
  ctx.font = `bold ${fontSize}px ${fontFamily}`;

  // Calculate maximum line width to center the bounding box correctly
  const lines = animatedText.split('\n');
  let maxLineWidth = 0;
  lines.forEach(line => {
    const widthMeasure = ctx.measureText(line).width;
    if (widthMeasure > maxLineWidth) maxLineWidth = widthMeasure;
  });

  // Mathematically align the text block correctly relative to the anchor x
  let drawX = x;
  let drawAlign = align;
  if (align === 'left') {
    drawX = x - maxLineWidth / 2;
    drawAlign = 'left';
  } else if (align === 'right') {
    drawX = x + maxLineWidth / 2;
    drawAlign = 'right';
  } else {
    drawX = x;
    drawAlign = 'center';
  }

  ctx.textAlign = drawAlign;
  ctx.textBaseline = baseline;

  let drawY = y;

  // Apply other coordinate/transform animations (like slide, bounce, scale, fade)
  if (animation === 'fadeIn') {
    const progress = Math.min(1, localTime / 1.0);
    ctx.globalAlpha = progress;
  } else if (animation === 'slideUp') {
    const progress = Math.min(1, localTime / 0.8);
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const offsetY = (1 - easeProgress) * 80;
    drawY += offsetY;
  } else if (animation === 'slideDown') {
    const progress = Math.min(1, localTime / 0.8);
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const offsetY = -(1 - easeProgress) * 80;
    drawY += offsetY;
  } else if (animation === 'scalePop') {
    const progress = Math.min(1, localTime / 0.6);
    let scaleVal = 1;
    if (progress < 1) {
      scaleVal = progress < 0.7 
        ? (progress / 0.7) * 1.15
        : 1.15 - ((progress - 0.7) / 0.3) * 0.15;
    }
    ctx.translate(drawX, drawY);
    ctx.scale(scaleVal, scaleVal);
    ctx.translate(-drawX, -drawY);
  } else if (animation === 'bounce') {
    const progress = Math.min(1, localTime / 1.2);
    const bounceOffset = Math.abs(Math.sin(progress * Math.PI * 3.5)) * (1 - progress) * 60;
    drawY -= bounceOffset;
  } else if (animation === 'glitch') {
    const glitchFrame = Math.floor(localTime * 15) % 8 === 0;
    if (glitchFrame) {
      const shiftX = (Math.random() - 0.5) * 12;
      const shiftY = (Math.random() - 0.5) * 4;
      drawX += shiftX;
      drawY += shiftY;
      
      // Flickering chromatic aberration background drawing
      ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
      const glitchLines = animatedText.split('\n');
      const gLineHeight = fontSize * 1.2;
      const gStartY = glitchLines.length === 1 ? drawY : drawY - ((glitchLines.length - 1) * gLineHeight) / 2;
      glitchLines.forEach((line, idx) => {
        ctx.fillText(line, drawX - 4, gStartY + idx * gLineHeight, maxWidth);
      });
      ctx.fillStyle = 'rgba(0, 0, 255, 0.7)';
      glitchLines.forEach((line, idx) => {
        ctx.fillText(line, drawX + 4, gStartY + idx * gLineHeight, maxWidth);
      });
    }
  } else if (animation === 'wave') {
    const waveOffset = Math.sin(localTime * 3.5) * 12;
    drawY += waveOffset;
  }

  // Draw background
  if (backgroundColor) {
    const padding = 8;
    const bgX = drawAlign === 'center' ? drawX - maxLineWidth / 2 - padding : drawAlign === 'left' ? drawX - padding : drawX - maxLineWidth - padding;
    const bgY = baseline === 'middle' ? drawY - fontSize / 2 - padding / 2 : drawY - padding;
    ctx.fillStyle = backgroundColor;
    const originalAlpha = ctx.globalAlpha;
    ctx.globalAlpha = originalAlpha * backgroundOpacity;
    ctx.fillRect(bgX, bgY, maxLineWidth + padding * 2, fontSize + padding);
    ctx.globalAlpha = originalAlpha;
  }

  ctx.fillStyle = color;
  if (shadow) {
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = shadowBlur;
    ctx.shadowOffsetX = shadowOffsetX;
    ctx.shadowOffsetY = shadowOffsetY;
  }
  if (outlineColor && outlineWidth > 0) {
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = outlineWidth;
    ctx.lineJoin = 'round';
  }

  const lineHeight = fontSize * 1.2;
  const startY = lines.length === 1 ? drawY : drawY - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, idx) => {
    if (outlineColor && outlineWidth > 0) ctx.strokeText(line, drawX, startY + idx * lineHeight, maxWidth);
    ctx.fillText(line, drawX, startY + idx * lineHeight, maxWidth);
  });
  ctx.restore();
}

export function applyFilter(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, filterName: FilterName): void {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  switch (filterName) {
    case 'bw':
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        data[i] = data[i + 1] = data[i + 2] = gray;
      }
      break;
    case 'sepia':
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        data[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
        data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
        data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
      }
      break;
    case 'invert':
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i]; data[i + 1] = 255 - data[i + 1]; data[i + 2] = 255 - data[i + 2];
      }
      break;
    case 'warm':
      for (let i = 0; i < data.length; i += 4) { data[i] = Math.min(255, data[i] * 1.1); data[i + 2] = Math.min(255, data[i + 2] * 0.9); }
      break;
    case 'cool':
      for (let i = 0; i < data.length; i += 4) { data[i] = Math.min(255, data[i] * 0.9); data[i + 2] = Math.min(255, data[i + 2] * 1.1); }
      break;
    case 'contrast': {
      const factor = (259 * (1.5 * 255 + 255)) / (255 * (259 - 1.5));
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128));
        data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128));
        data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128));
      }
      break;
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

export function applyChromaKey(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, color: string, similarity: number, smoothness: number): void {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const keyR = parseInt(color.slice(1, 3), 16);
  const keyG = parseInt(color.slice(3, 5), 16);
  const keyB = parseInt(color.slice(5, 7), 16);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const diff = Math.sqrt((r - keyR) ** 2 + (g - keyG) ** 2 + (b - keyB) ** 2);
    const maxDiff = similarity * 441.67;
    if (diff < maxDiff) {
      const alpha = Math.max(0, (diff - maxDiff * (1 - smoothness)) / (maxDiff * smoothness));
      data[i + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

export function applyVignette(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, intensity: number): void {
  const w = canvas.width, h = canvas.height;
  const cx = w / 2, cy = h / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  const gradient = ctx.createRadialGradient(cx, cy, maxDist * (1 - intensity), cx, cy, maxDist);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, `rgba(0,0,0,${intensity})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

export function getFilterString(filterName: CSSFilterName, intensity: number = 1): string {
  const filters: Record<CSSFilterName, string> = {
    bw: `grayscale(${100 * intensity}%)`,
    sepia: `sepia(${100 * intensity}%)`,
    invert: `invert(${100 * intensity}%)`,
    warm: `sepia(${30 * intensity}%) saturate(${150 * intensity}%)`,
    cool: `hue-rotate(${180 * intensity}deg) saturate(${80 * intensity}%)`,
    vintage: `sepia(${50 * intensity}%) contrast(${120 * intensity}%)`,
    matte: `contrast(${90 * intensity}%) brightness(${110 * intensity}%)`,
    lemon: `hue-rotate(${-30 * intensity}deg) saturate(${150 * intensity}%)`,
    blur: `blur(${5 * intensity}px)`,
    brightness: `brightness(${100 + 50 * intensity}%)`,
    contrast: `contrast(${100 + 50 * intensity}%)`,
    saturate: `saturate(${100 + 50 * intensity}%)`,
  };
  return filters[filterName] || '';
}

export function renderTransition(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  fromFrame: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement,
  toFrame: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement,
  progress: number,
  type: TransitionType = 'fade'
): void {
  progress = Math.max(0, Math.min(1, progress));
  switch (type) {
    case 'fade':
      ctx.globalAlpha = 1 - progress;
      ctx.drawImage(fromFrame, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = progress;
      ctx.drawImage(toFrame, 0, 0, canvas.width, canvas.height);
      break;
    case 'wipe': {
      ctx.drawImage(fromFrame, 0, 0, canvas.width, canvas.height);
      const wipeWidth = canvas.width * progress;
      if (wipeWidth > 0) ctx.drawImage(toFrame, 0, 0, wipeWidth, canvas.height, 0, 0, wipeWidth, canvas.height);
      break;
    }
    case 'slide': {
      const slideOffset = canvas.width * progress;
      ctx.drawImage(fromFrame, 0, 0, canvas.width, canvas.height, -slideOffset, 0, canvas.width, canvas.height);
      ctx.drawImage(toFrame, 0, 0, canvas.width, canvas.height, canvas.width - slideOffset, 0, canvas.width, canvas.height);
      break;
    }
    case 'zoom': {
      const zoomScale = 1 + progress * 0.5;
      const zoomOffX = (canvas.width * (zoomScale - 1)) / 2;
      const zoomOffY = (canvas.height * (zoomScale - 1)) / 2;
      ctx.globalAlpha = 1 - progress;
      ctx.drawImage(fromFrame, -zoomOffX, -zoomOffY, canvas.width * zoomScale, canvas.height * zoomScale);
      ctx.globalAlpha = progress;
      ctx.drawImage(toFrame, 0, 0, canvas.width, canvas.height);
      break;
    }
    default:
      ctx.globalAlpha = 1 - progress;
      ctx.drawImage(fromFrame, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = progress;
      ctx.drawImage(toFrame, 0, 0, canvas.width, canvas.height);
  }
  ctx.globalAlpha = 1;
}

export function generateWaveformData(audioBuffer: AudioBuffer, samples: number = 100): number[] {
  if (audioBuffer.numberOfChannels === 0) return [];
  const channelData = audioBuffer.getChannelData(0);
  const blockSize = Math.floor(channelData.length / samples);
  const waveform: number[] = [];
  for (let i = 0; i < samples; i++) {
    let sum = 0;
    for (let j = 0; j < blockSize; j++) sum += Math.abs(channelData[i * blockSize + j]);
    waveform.push(sum / blockSize);
  }
  return waveform;
}

export function drawWaveform(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, waveformData: number[], options: WaveformOptions = {}): void {
  const { color = '#5b6ef5', barWidth = 2, barGap = 1, centerLine = true } = options;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!waveformData || waveformData.length === 0) return;
  const barCount = Math.floor(canvas.width / (barWidth + barGap));
  const step = Math.ceil(waveformData.length / barCount);
  const amp = canvas.height / 2;
  ctx.fillStyle = color;
  for (let i = 0; i < barCount; i++) {
    const value = waveformData[i * step] || 0;
    const h = value * amp * 2;
    ctx.fillRect(i * (barWidth + barGap), (canvas.height - h) / 2, barWidth, h);
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

export async function captureFrame(video: HTMLVideoElement, time: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) return reject(new Error('No ctx'));
    const cleanup = () => { video.removeEventListener('seeked', onSeeked); video.removeEventListener('error', onError); };
    const onSeeked = () => {
      try { ctx.drawImage(video, 0, 0, canvas.width, canvas.height); cleanup(); resolve(canvas); }
      catch (err) { cleanup(); reject(err); }
    };
    const onError = () => { cleanup(); reject(new Error('Video seek error')); };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = time;
  });
}

export function compositeCanvases(targetCanvas: HTMLCanvasElement, ...sourceCanvases: (HTMLCanvasElement | null)[]): void {
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  for (const source of sourceCanvases) {
    if (source && source.width > 0 && source.height > 0) ctx.drawImage(source, 0, 0, targetCanvas.width, targetCanvas.height);
  }
}

export function createOffscreenCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, width);
  c.height = Math.max(1, height);
  return c;
}

export function scaleCanvas(sourceCanvas: HTMLCanvasElement, targetWidth: number, targetHeight: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, targetWidth);
  c.height = Math.max(1, targetHeight);
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
  }
  return c;
}
