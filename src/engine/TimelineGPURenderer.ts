/**
 * GPU-accelerated timeline rendering using WebGL.
 * Renders filmstrip thumbnails and audio waveforms on GPU instead of DOM elements.
 */

export interface TimelineGPUConfig {
  width: number;
  height: number;
  devicePixelRatio: number;
}

const TIMELINE_VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

// Filmstrip shader - renders repeating video thumbnails
const FILMSTRIP_FRAGMENT_SHADER = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  uniform float u_frameCount;
  uniform float u_clipProgress;
  
  void main() {
    float frameU = fract(v_texCoord.x * u_frameCount);
    vec2 uv = vec2(frameU, v_texCoord.y);
    gl_FragColor = texture2D(u_texture, uv);
  }
`;

// Waveform shader - renders audio waveform bars
const WAVEFORM_FRAGMENT_SHADER = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_waveformData;
  uniform float u_barCount;
  uniform vec3 u_colorLow;
  uniform vec3 u_colorMid;
  uniform vec3 u_colorHigh;
  uniform vec3 u_colorVocal;
  
  void main() {
    float barIndex = floor(v_texCoord.x * u_barCount);
    float barProgress = fract(v_texCoord.x * u_barCount);
    vec4 waveData = texture2D(u_waveformData, vec2((barIndex + 0.5) / u_barCount, 0.5));
    float amplitude = waveData.r;
    float isVocal = waveData.a;
    float barHeight = amplitude * 0.92;
    float yThreshold = 1.0 - barHeight;
    if (v_texCoord.y < yThreshold) {
      discard;
    }
    vec3 color;
    if (isVocal > 0.5) {
      color = u_colorVocal;
    } else if (amplitude > 0.72) {
      color = u_colorHigh;
    } else if (amplitude > 0.42) {
      color = u_colorMid;
    } else {
      color = u_colorLow;
    }
    float edgeSmooth = smoothstep(yThreshold, yThreshold + 0.02, v_texCoord.y);
    gl_FragColor = vec4(color * edgeSmooth, edgeSmooth);
  }
`;

// Clip background shader with gradient
const CLIP_BG_FRAGMENT_SHADER = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform vec3 u_colorStart;
  uniform vec3 u_colorEnd;
  uniform float u_opacity;
  uniform float u_selected;
  
  void main() {
    vec3 color = mix(u_colorStart, u_colorEnd, v_texCoord.x);
    float alpha = u_opacity;
    if (u_selected > 0.5) {
      color = mix(color, vec3(1.0), 0.15);
    }
    gl_FragColor = vec4(color, alpha);
  }
`;

class TimelineGPURenderer {
  private gl: WebGLRenderingContext | null = null;
  private programs: Map<string, WebGLProgram> = new Map();
  private buffers: Map<string, WebGLBuffer> = new Map();
  private textures: Map<string, WebGLTexture> = new Map();
  private initialized = false;

  init(canvas: HTMLCanvasElement, _config: TimelineGPUConfig): boolean {
    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) return false;

    this.gl = gl;

    this.compileProgram('filmstrip', TIMELINE_VERTEX_SHADER, FILMSTRIP_FRAGMENT_SHADER);
    this.compileProgram('waveform', TIMELINE_VERTEX_SHADER, WAVEFORM_FRAGMENT_SHADER);
    this.compileProgram('clipBg', TIMELINE_VERTEX_SHADER, CLIP_BG_FRAGMENT_SHADER);

    const vertices = new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
       1,  1, 1, 1,
    ]);
    const buffer = gl.createBuffer();
    if (!buffer) return false;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    this.buffers.set('quad', buffer);

    this.initialized = true;
    return true;
  }

  private compileProgram(name: string, vertexSrc: string, fragmentSrc: string): void {
    if (!this.gl) return;
    const gl = this.gl;

    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, vertexSrc);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fragmentSrc);
    gl.compileShader(fs);

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Shader link failed:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return;
    }

    this.programs.set(name, program);
  }

  private useProgram(name: string): WebGLProgram | null {
    if (!this.gl) return null;
    const program = this.programs.get(name);
    if (program) this.gl.useProgram(program);
    return program || null;
  }

  private bindQuad(): void {
    if (!this.gl) return;
    const gl = this.gl;
    const buffer = this.buffers.get('quad');
    if (!buffer) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

    const program = gl.getParameter(gl.CURRENT_PROGRAM);
    if (!program) return;

    const posLoc = gl.getAttribLocation(program, 'a_position');
    const texLoc = gl.getAttribLocation(program, 'a_texCoord');

    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);

    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);
  }

  private drawQuad(): void {
    if (!this.gl) return;
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Render filmstrip thumbnails for a video clip */
  renderFilmstrip(
    canvas: HTMLCanvasElement,
    thumbnails: string[],
    clipWidth: number,
    clipHeight: number
  ): void {
    if (!this.gl || !this.initialized || thumbnails.length === 0) return;

    const thumbCanvas = document.createElement('canvas');
    const thumbCtx = thumbCanvas.getContext('2d');
    if (!thumbCtx) return;

    const thumbW = 80;
    thumbCanvas.width = thumbW * thumbnails.length;
    thumbCanvas.height = clipHeight;

    let loaded = 0;
    const drawThumbnails = () => {
      for (let i = 0; i < thumbnails.length; i++) {
        const img = new Image();
        img.onload = () => {
          thumbCtx.drawImage(img, i * thumbW, 0, thumbW, clipHeight);
          loaded++;
          if (loaded === thumbnails.length) {
            this.uploadAndRenderFilmstrip(canvas, thumbCanvas, thumbnails.length, clipWidth, clipHeight);
          }
        };
        img.src = thumbnails[i];
      }
    };
    drawThumbnails();
  }

  private uploadAndRenderFilmstrip(
    outputCanvas: HTMLCanvasElement,
    sourceCanvas: HTMLCanvasElement,
    frameCount: number,
    clipWidth: number,
    clipHeight: number
  ): void {
    if (!this.gl) return;
    const gl = this.gl;

    outputCanvas.width = clipWidth;
    outputCanvas.height = clipHeight;
    gl.viewport(0, 0, clipWidth, clipHeight);

    let tex = this.textures.get('filmstrip');
    if (!tex) {
      tex = gl.createTexture() || undefined;
      if (!tex) return;
      this.textures.set('filmstrip', tex);
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const program = this.useProgram('filmstrip');
    if (!program) return;
    this.bindQuad();

    gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'u_frameCount'), frameCount);
    gl.uniform1f(gl.getUniformLocation(program, 'u_clipProgress'), 1.0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    this.drawQuad();

    const ctx = outputCanvas.getContext('2d');
    if (ctx) {
      const pixels = new Uint8Array(clipWidth * clipHeight * 4);
      gl.readPixels(0, 0, clipWidth, clipHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      const imageData = ctx.createImageData(clipWidth, clipHeight);
      for (let y = 0; y < clipHeight; y++) {
        for (let x = 0; x < clipWidth; x++) {
          const srcIdx = ((clipHeight - 1 - y) * clipWidth + x) * 4;
          const dstIdx = (y * clipWidth + x) * 4;
          imageData.data[dstIdx] = pixels[srcIdx];
          imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
          imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
          imageData.data[dstIdx + 3] = pixels[srcIdx + 3];
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }
  }

  /** Render audio waveform bars */
  renderWaveform(
    canvas: HTMLCanvasElement,
    waveform: number[],
    clipWidth: number,
    clipHeight: number
  ): void {
    if (!this.gl || !this.initialized || waveform.length === 0) return;
    const gl = this.gl;

    canvas.width = clipWidth;
    canvas.height = clipHeight;
    gl.viewport(0, 0, clipWidth, clipHeight);

    const dataTexture = this.createWaveformTexture(waveform);
    if (!dataTexture) return;

    const program = this.useProgram('waveform');
    if (!program) return;
    this.bindQuad();

    gl.uniform1i(gl.getUniformLocation(program, 'u_waveformData'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'u_barCount'), waveform.length);
    gl.uniform3f(gl.getUniformLocation(program, 'u_colorLow'), 96 / 255, 165 / 255, 250 / 255);
    gl.uniform3f(gl.getUniformLocation(program, 'u_colorMid'), 96 / 255, 165 / 255, 250 / 255);
    gl.uniform3f(gl.getUniformLocation(program, 'u_colorHigh'), 245 / 255, 158 / 255, 11 / 255);
    gl.uniform3f(gl.getUniformLocation(program, 'u_colorVocal'), 244 / 255, 63 / 255, 94 / 255);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dataTexture);
    this.drawQuad();

    const ctx = canvas.getContext('2d');
    if (ctx) {
      const pixels = new Uint8Array(clipWidth * clipHeight * 4);
      gl.readPixels(0, 0, clipWidth, clipHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      const imageData = ctx.createImageData(clipWidth, clipHeight);
      for (let y = 0; y < clipHeight; y++) {
        for (let x = 0; x < clipWidth; x++) {
          const srcIdx = ((clipHeight - 1 - y) * clipWidth + x) * 4;
          const dstIdx = (y * clipWidth + x) * 4;
          imageData.data[dstIdx] = pixels[srcIdx];
          imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
          imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
          imageData.data[dstIdx + 3] = pixels[srcIdx + 3];
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }
  }

  private createWaveformTexture(waveform: number[]): WebGLTexture | null {
    if (!this.gl) return null;
    const gl = this.gl;

    const data = new Uint8Array(waveform.length * 4);
    for (let i = 0; i < waveform.length; i++) {
      const val = waveform[i];
      data[i * 4] = Math.abs(val) * 255;
      data[i * 4 + 1] = 0;
      data[i * 4 + 2] = 0;
      data[i * 4 + 3] = val < 0 ? 255 : 0;
    }

    let tex = this.textures.get('waveform');
    if (!tex) {
      tex = gl.createTexture() || undefined;
      if (!tex) return null;
      this.textures.set('waveform', tex);
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, waveform.length, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return tex;
  }

  /** Render clip background gradient */
  renderClipBackground(
    canvas: HTMLCanvasElement,
    colorStart: string,
    colorEnd: string,
    opacity: number,
    selected: boolean,
    clipWidth: number,
    clipHeight: number
  ): void {
    if (!this.gl || !this.initialized) return;
    const gl = this.gl;

    canvas.width = clipWidth;
    canvas.height = clipHeight;
    gl.viewport(0, 0, clipWidth, clipHeight);

    const program = this.useProgram('clipBg');
    if (!program) return;
    this.bindQuad();

    const parseColor = (hex: string): [number, number, number] => [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255,
    ];

    const [r1, g1, b1] = parseColor(colorStart);
    const [r2, g2, b2] = parseColor(colorEnd);

    gl.uniform3f(gl.getUniformLocation(program, 'u_colorStart'), r1, g1, b1);
    gl.uniform3f(gl.getUniformLocation(program, 'u_colorEnd'), r2, g2, b2);
    gl.uniform1f(gl.getUniformLocation(program, 'u_opacity'), opacity);
    gl.uniform1f(gl.getUniformLocation(program, 'u_selected'), selected ? 1 : 0);

    this.drawQuad();

    const ctx = canvas.getContext('2d');
    if (ctx) {
      const pixels = new Uint8Array(clipWidth * clipHeight * 4);
      gl.readPixels(0, 0, clipWidth, clipHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      const imageData = ctx.createImageData(clipWidth, clipHeight);
      for (let y = 0; y < clipHeight; y++) {
        for (let x = 0; x < clipWidth; x++) {
          const srcIdx = ((clipHeight - 1 - y) * clipWidth + x) * 4;
          const dstIdx = (y * clipWidth + x) * 4;
          imageData.data[dstIdx] = pixels[srcIdx];
          imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
          imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
          imageData.data[dstIdx + 3] = pixels[srcIdx + 3];
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }
  }

  resize(_width: number, _height: number): void {
    // Reserved for future GPU resize optimizations
  }

  destroy(): void {
    if (!this.gl) return;
    const gl = this.gl;

    for (const [, tex] of this.textures) gl.deleteTexture(tex);
    for (const [, prog] of this.programs) gl.deleteProgram(prog);
    for (const [, buf] of this.buffers) gl.deleteBuffer(buf);

    this.textures.clear();
    this.programs.clear();
    this.buffers.clear();
    this.initialized = false;
  }
}

export default TimelineGPURenderer;
