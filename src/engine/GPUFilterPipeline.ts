/**
 * GPU-accelerated video filter pipeline using WebGL shaders.
 * Replaces CPU-bound getImageData/putImageData with GPU fragment shaders.
 * Supports: B&W, Sepia, Warm, Cool, Contrast, Invert, Chroma Key, Vignette, Blur
 */

export interface GPUFilterConfig {
  preset: 'none' | 'bw' | 'sepia' | 'warm' | 'cool' | 'contrast' | 'invert';
  brightness: number;
  contrast: number;
  saturation: number;
  chromaKey?: { enabled: boolean; color: string; similarity: number; smoothness: number };
  vignette?: { enabled: boolean; intensity: number };
  blur?: number;
}

const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const FRAGMENT_SHADER_BASE = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  uniform float u_brightness;
  uniform float u_contrast;
  uniform float u_saturation;
  uniform int u_preset;
  
  // Chroma key uniforms
  uniform int u_chromaKeyEnabled;
  uniform vec3 u_chromaKeyColor;
  uniform float u_chromaKeySimilarity;
  uniform float u_chromaKeySmoothness;
  
  // Vignette uniforms
  uniform int u_vignetteEnabled;
  uniform float u_vignetteIntensity;
  
  vec3 adjustBrightness(vec3 color, float brightness) {
    return color + brightness;
  }
  
  vec3 adjustContrast(vec3 color, float contrast) {
    float factor = (259.0 * (contrast + 255.0)) / (255.0 * (259.0 - contrast));
    return factor * (color - 0.5) + 0.5;
  }
  
  vec3 adjustSaturation(vec3 color, float saturation) {
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    return mix(vec3(gray), color, saturation + 1.0);
  }
  
  vec3 applyPreset(vec3 color, int preset) {
    if (preset == 1) { // B&W
      float gray = dot(color, vec3(0.299, 0.587, 0.114));
      return vec3(gray);
    }
    if (preset == 2) { // Sepia
      float r = dot(color, vec3(0.393, 0.769, 0.189));
      float g = dot(color, vec3(0.349, 0.686, 0.168));
      float b = dot(color, vec3(0.272, 0.534, 0.131));
      return vec3(r, g, b);
    }
    if (preset == 3) { // Warm
      return color + vec3(0.1, 0.05, -0.05);
    }
    if (preset == 4) { // Cool
      return color + vec3(-0.05, 0.05, 0.1);
    }
    if (preset == 5) { // Contrast boost
      return adjustContrast(color, 50.0);
    }
    if (preset == 6) { // Invert
      return 1.0 - color;
    }
    return color;
  }
  
  vec4 applyChromaKey(vec4 texColor) {
    if (u_chromaKeyEnabled == 0) return texColor;
    float dist = distance(texColor.rgb, u_chromaKeyColor);
    float alpha = smoothstep(u_chromaKeySimilarity, u_chromaKeySimilarity + u_chromaKeySmoothness, dist);
    return vec4(texColor.rgb * alpha, texColor.a * alpha);
  }
  
  vec3 applyVignette(vec3 color, vec2 uv) {
    if (u_vignetteEnabled == 0) return color;
    vec2 center = uv - 0.5;
    float dist = length(center);
    float vignette = 1.0 - dist * u_vignetteIntensity * 1.5;
    return color * vignette;
  }
  
  void main() {
    vec4 texColor = texture2D(u_texture, v_texCoord);
    
    // Apply chroma key first to compute correct alpha channel
    texColor = applyChromaKey(texColor);
    vec3 color = texColor.rgb;
    
    // Apply adjustments
    color = adjustBrightness(color, u_brightness);
    color = adjustContrast(color, u_contrast);
    color = adjustSaturation(color, u_saturation);
    color = applyPreset(color, u_preset);
    color = applyVignette(color, v_texCoord);
    
    gl_FragColor = vec4(color, texColor.a);
  }
`;

// Blur shader (separable Gaussian)
const FRAGMENT_SHADER_BLUR = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  uniform vec2 u_direction;
  uniform float u_blurAmount;
  uniform vec2 u_resolution;
  
  void main() {
    vec2 texOffset = 1.0 / u_resolution;
    vec3 result = vec3(0.0);
    float totalWeight = 0.0;
    
    for (int i = -4; i <= 4; i++) {
      float weight = exp(-float(i * i) / (2.0 * u_blurAmount * u_blurAmount));
      result += texture2D(u_texture, v_texCoord + u_direction * texOffset * float(i)).rgb * weight;
      totalWeight += weight;
    }
    
    gl_FragColor = vec4(result / totalWeight, 1.0);
  }
`;

// Composite shader for layer blending
const FRAGMENT_SHADER_COMPOSITE = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_bgTexture;
  uniform sampler2D u_fgTexture;
  uniform float u_opacity;
  uniform int u_blendMode;
  
  vec3 blendMultiply(vec3 bg, vec3 fg) { return bg * fg; }
  vec3 blendScreen(vec3 bg, vec3 fg) { return 1.0 - (1.0 - bg) * (1.0 - fg); }
  vec3 blendOverlay(vec3 bg, vec3 fg) {
    return mix(
      2.0 * bg * fg,
      1.0 - 2.0 * (1.0 - bg) * (1.0 - fg),
      step(0.5, bg)
    );
  }
  vec3 blendDarken(vec3 bg, vec3 fg) { return min(bg, fg); }
  vec3 blendLighten(vec3 bg, vec3 fg) { return max(bg, fg); }
  vec3 blendHardLight(vec3 bg, vec3 fg) { return blendOverlay(fg, bg); }
  vec3 blendSoftLight(vec3 bg, vec3 fg) {
    return mix(
      bg - (1.0 - 2.0 * fg) * bg * (1.0 - bg),
      bg + (2.0 * fg - 1.0) * (sqrt(bg) - bg),
      step(0.5, fg)
    );
  }
  vec3 blendDifference(vec3 bg, vec3 fg) { return abs(bg - fg); }
  
  void main() {
    vec4 bg = texture2D(u_bgTexture, v_texCoord);
    vec4 fg = texture2D(u_fgTexture, v_texCoord);
    
    vec3 blended;
    if (u_blendMode == 1) blended = blendMultiply(bg.rgb, fg.rgb);
    else if (u_blendMode == 2) blended = blendScreen(bg.rgb, fg.rgb);
    else if (u_blendMode == 3) blended = blendOverlay(bg.rgb, fg.rgb);
    else if (u_blendMode == 4) blended = blendDarken(bg.rgb, fg.rgb);
    else if (u_blendMode == 5) blended = blendLighten(bg.rgb, fg.rgb);
    else if (u_blendMode == 6) blended = blendHardLight(bg.rgb, fg.rgb);
    else if (u_blendMode == 7) blended = blendSoftLight(bg.rgb, fg.rgb);
    else if (u_blendMode == 8) blended = blendDifference(bg.rgb, fg.rgb);
    else blended = fg.rgb;
    
    vec3 result = mix(bg.rgb, blended, u_opacity);
    gl_FragColor = vec4(result, 1.0);
  }
`;

// Transition shaders
const TRANSITION_SHADERS: Record<string, string> = {
  fade: `
    precision mediump float;
    varying vec2 v_texCoord;
    uniform sampler2D u_textureA;
    uniform sampler2D u_textureB;
    uniform float u_progress;
    void main() {
      vec4 a = texture2D(u_textureA, v_texCoord);
      vec4 b = texture2D(u_textureB, v_texCoord);
      gl_FragColor = mix(a, b, u_progress);
    }
  `,
  dissolve: `
    precision mediump float;
    varying vec2 v_texCoord;
    uniform sampler2D u_textureA;
    uniform sampler2D u_textureB;
    uniform float u_progress;
    uniform float u_time;
    void main() {
      vec4 a = texture2D(u_textureA, v_texCoord);
      vec4 b = texture2D(u_textureB, v_texCoord);
      float noise = fract(sin(dot(v_texCoord * u_time, vec2(12.9898, 78.233))) * 43758.5453);
      float threshold = smoothstep(u_progress - 0.1, u_progress + 0.1, noise);
      gl_FragColor = mix(a, b, threshold);
    }
  `,
  'wipe-left': `
    precision mediump float;
    varying vec2 v_texCoord;
    uniform sampler2D u_textureA;
    uniform sampler2D u_textureB;
    uniform float u_progress;
    void main() {
      vec4 a = texture2D(u_textureA, v_texCoord);
      vec4 b = texture2D(u_textureB, v_texCoord);
      gl_FragColor = v_texCoord.x < (1.0 - u_progress) ? a : b;
    }
  `,
  'wipe-right': `
    precision mediump float;
    varying vec2 v_texCoord;
    uniform sampler2D u_textureA;
    uniform sampler2D u_textureB;
    uniform float u_progress;
    void main() {
      vec4 a = texture2D(u_textureA, v_texCoord);
      vec4 b = texture2D(u_textureB, v_texCoord);
      gl_FragColor = v_texCoord.x < u_progress ? b : a;
    }
  `,
  'slide-left': `
    precision mediump float;
    varying vec2 v_texCoord;
    uniform sampler2D u_textureA;
    uniform sampler2D u_textureB;
    uniform float u_progress;
    void main() {
      vec2 offset = vec2(-u_progress, 0.0);
      vec4 a = texture2D(u_textureA, v_texCoord + offset);
      vec4 b = texture2D(u_textureB, v_texCoord + offset + vec2(1.0, 0.0));
      gl_FragColor = mix(a, b, step(v_texCoord.x, u_progress));
    }
  `,
  'slide-right': `
    precision mediump float;
    varying vec2 v_texCoord;
    uniform sampler2D u_textureA;
    uniform sampler2D u_textureB;
    uniform float u_progress;
    void main() {
      vec2 offset = vec2(u_progress, 0.0);
      vec4 a = texture2D(u_textureA, v_texCoord + offset);
      vec4 b = texture2D(u_textureB, v_texCoord + offset - vec2(1.0, 0.0));
      gl_FragColor = mix(a, b, step(1.0 - v_texCoord.x, u_progress));
    }
  `,
  zoom: `
    precision mediump float;
    varying vec2 v_texCoord;
    uniform sampler2D u_textureA;
    uniform sampler2D u_textureB;
    uniform float u_progress;
    void main() {
      vec2 center = vec2(0.5);
      vec2 uv = v_texCoord - center;
      float scaleA = 1.0 + u_progress * 0.5;
      float scaleB = 0.5 + u_progress * 0.5;
      vec4 a = texture2D(u_textureA, center + uv / scaleA);
      vec4 b = texture2D(u_textureB, center + uv / scaleB);
      gl_FragColor = mix(a, b, u_progress);
    }
  `,
  spin: `
    precision mediump float;
    varying vec2 v_texCoord;
    uniform sampler2D u_textureA;
    uniform sampler2D u_textureB;
    uniform float u_progress;
    void main() {
      vec2 center = vec2(0.5);
      vec2 uv = v_texCoord - center;
      float angle = u_progress * 3.14159;
      float cosA = cos(angle), sinA = sin(angle);
      mat2 rot = mat2(cosA, -sinA, sinA, cosA);
      vec4 a = texture2D(u_textureA, center + rot * uv * (1.0 - u_progress));
      vec4 b = texture2D(u_textureB, center + rot * uv * u_progress);
      gl_FragColor = mix(a, b, u_progress);
    }
  `,
  blur: `
    precision mediump float;
    varying vec2 v_texCoord;
    uniform sampler2D u_textureA;
    uniform sampler2D u_textureB;
    uniform float u_progress;
    void main() {
      vec4 a = texture2D(u_textureA, v_texCoord);
      vec4 b = texture2D(u_textureB, v_texCoord);
      float blurAmount = sin(u_progress * 3.14159) * 0.02;
      vec2 offset = vec2(blurAmount);
      vec4 blurredA = (a + texture2D(u_textureA, v_texCoord + offset) + texture2D(u_textureA, v_texCoord - offset)) / 3.0;
      vec4 blurredB = (b + texture2D(u_textureB, v_texCoord + offset) + texture2D(u_textureB, v_texCoord - offset)) / 3.0;
      gl_FragColor = mix(blurredA, blurredB, u_progress);
    }
  `,
  flash: `
    precision mediump float;
    varying vec2 v_texCoord;
    uniform sampler2D u_textureA;
    uniform sampler2D u_textureB;
    uniform float u_progress;
    void main() {
      vec4 a = texture2D(u_textureA, v_texCoord);
      vec4 b = texture2D(u_textureB, v_texCoord);
      vec4 result = mix(a, b, u_progress);
      float flash = sin(u_progress * 3.14159);
      result.rgb += vec3(flash * 0.5);
      gl_FragColor = result;
    }
  `,
};

class WebGLFilterPipeline {
  private gl: WebGLRenderingContext | null = null;
  private programs: Map<string, WebGLProgram> = new Map();
  private framebuffers: Map<string, WebGLFramebuffer> = new Map();
  private textures: Map<string, WebGLTexture> = new Map();
  private quadBuffer: WebGLBuffer | null = null;
  private width = 0;
  private height = 0;
  private initialized = false;

  init(canvas: HTMLCanvasElement): boolean {
    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    if (!gl) return false;

    this.gl = gl;
    this.width = canvas.width;
    this.height = canvas.height;

    // Create quad buffer
    const vertices = new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
       1,  1, 1, 1,
    ]);
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // Compile shaders
    this.compileProgram('filter', VERTEX_SHADER, FRAGMENT_SHADER_BASE);
    this.compileProgram('blur', VERTEX_SHADER, FRAGMENT_SHADER_BLUR);
    this.compileProgram('composite', VERTEX_SHADER, FRAGMENT_SHADER_COMPOSITE);

    // Compile transition shaders
    for (const [name, fragShader] of Object.entries(TRANSITION_SHADERS)) {
      this.compileProgram(`transition_${name}`, VERTEX_SHADER, fragShader);
    }

    // Create framebuffers for ping-pong rendering
    this.createFramebuffer('fb_a', this.width, this.height);
    this.createFramebuffer('fb_b', this.width, this.height);

    // Create textures
    this.createTexture('tex_a', this.width, this.height);
    this.createTexture('tex_b', this.width, this.height);
    this.createTexture('tex_video', this.width, this.height);

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
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    this.programs.set(name, program);
  }

  private createFramebuffer(name: string, width: number, height: number): void {
    if (!this.gl) return;
    const gl = this.gl;

    const fb = gl.createFramebuffer();
    if (!fb) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);

    const tex = gl.createTexture();
    if (!tex) return;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.framebuffers.set(name, fb);
    this.textures.set(name, tex);
  }

  private createTexture(name: string, width: number, height: number): void {
    if (!this.gl) return;
    const gl = this.gl;

    const tex = gl.createTexture();
    if (!tex) return;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.textures.set(name, tex);
  }

  private useProgram(name: string): WebGLProgram | null {
    if (!this.gl) return null;
    const program = this.programs.get(name);
    if (program) this.gl.useProgram(program);
    return program || null;
  }

  private bindQuad(): void {
    if (!this.gl || !this.quadBuffer) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);

    const program = gl.getParameter(gl.CURRENT_PROGRAM);
    if (!program) return;

    const posLoc = gl.getAttribLocation(program, 'a_position');
    const texLoc = gl.getAttribLocation(program, 'a_texCoord');

    if (posLoc >= 0) {
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    }
    if (texLoc >= 0) {
      gl.enableVertexAttribArray(texLoc);
      gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);
    }
  }

  private drawQuad(): void {
    if (!this.gl) return;
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }

  private hexToRgb(hex: string): [number, number, number] {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b];
  }

  /** Apply filters to a video or canvas element and render to framebuffer or screen */
  applyFilters(
    video: TexImageSource,
    config: GPUFilterConfig,
    targetFb: string = 'fb_a'
  ): void {
    if (!this.gl || !this.initialized) return;
    const gl = this.gl;

    const isScreenTarget = targetFb === 'screen';
    const actualTargetFb = isScreenTarget ? 'fb_a' : targetFb;

    // Upload video/canvas frame to texture
    const tex = this.textures.get('tex_video');
    if (!tex) return;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    // Clear target buffer with transparent pixels
    const fb = this.framebuffers.get(actualTargetFb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb || null);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(0, 0, this.width, this.height);

    // Use filter program
    const program = this.useProgram('filter');
    if (!program) return;
    this.bindQuad();

    // Set uniforms
    gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
    gl.uniform1f(gl.getUniformLocation(program, 'u_brightness'), config.brightness / 100);
    gl.uniform1f(gl.getUniformLocation(program, 'u_contrast'), config.contrast);
    gl.uniform1f(gl.getUniformLocation(program, 'u_saturation'), config.saturation / 100);

    const presetMap: Record<string, number> = {
      none: 0, bw: 1, sepia: 2, warm: 3, cool: 4, contrast: 5, invert: 6,
    };
    gl.uniform1i(gl.getUniformLocation(program, 'u_preset'), presetMap[config.preset] || 0);

    // Chroma key
    const ck = config.chromaKey;
    gl.uniform1i(gl.getUniformLocation(program, 'u_chromaKeyEnabled'), ck?.enabled ? 1 : 0);
    if (ck?.enabled) {
      const [r, g, b] = this.hexToRgb(ck.color);
      gl.uniform3f(gl.getUniformLocation(program, 'u_chromaKeyColor'), r, g, b);
      gl.uniform1f(gl.getUniformLocation(program, 'u_chromaKeySimilarity'), ck.similarity);
      gl.uniform1f(gl.getUniformLocation(program, 'u_chromaKeySmoothness'), ck.smoothness);
    }

    // Vignette
    const vig = config.vignette;
    gl.uniform1i(gl.getUniformLocation(program, 'u_vignetteEnabled'), vig?.enabled ? 1 : 0);
    if (vig?.enabled) {
      gl.uniform1f(gl.getUniformLocation(program, 'u_vignetteIntensity'), vig.intensity);
    }

    // Bind texture and draw
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    this.drawQuad();

    // Apply blur if needed (separable Gaussian)
    if (config.blur && config.blur > 0) {
      this.applyBlur(actualTargetFb, 'fb_b', config.blur);
      // Copy back
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb || null);
      this.useProgram('filter');
      this.bindQuad();
      gl.uniform1i(gl.getUniformLocation(program, 'u_preset'), 0);
      gl.uniform1f(gl.getUniformLocation(program, 'u_brightness'), 0);
      gl.uniform1f(gl.getUniformLocation(program, 'u_contrast'), 0);
      gl.uniform1f(gl.getUniformLocation(program, 'u_saturation'), 0);
      gl.uniform1i(gl.getUniformLocation(program, 'u_chromaKeyEnabled'), 0);
      gl.uniform1i(gl.getUniformLocation(program, 'u_vignetteEnabled'), 0);
      const blurredTex = this.textures.get('fb_b');
      if (!blurredTex) return;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, blurredTex);
      this.drawQuad();
    }

    if (isScreenTarget) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0.0, 0.0, 0.0, 0.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.viewport(0, 0, this.width, this.height);
      this.useProgram('filter');
      this.bindQuad();
      gl.uniform1i(gl.getUniformLocation(program, 'u_preset'), 0);
      gl.uniform1f(gl.getUniformLocation(program, 'u_brightness'), 0);
      gl.uniform1f(gl.getUniformLocation(program, 'u_contrast'), 0);
      gl.uniform1f(gl.getUniformLocation(program, 'u_saturation'), 0);
      gl.uniform1i(gl.getUniformLocation(program, 'u_chromaKeyEnabled'), 0);
      gl.uniform1i(gl.getUniformLocation(program, 'u_vignetteEnabled'), 0);
      const resultTex = this.textures.get('fb_a');
      if (!resultTex) return;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, resultTex);
      this.drawQuad();
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }

  private applyBlur(sourceFb: string, targetFb: string, amount: number): void {
    if (!this.gl) return;
    const gl = this.gl;

    const program = this.useProgram('blur');
    if (!program) return;
    this.bindQuad();

    const sourceTex = this.textures.get(sourceFb);
    if (!sourceTex) return;
    const targetFbObj = this.framebuffers.get(targetFb);

    // Horizontal pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbObj || null);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(0, 0, this.width, this.height);
    gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
    gl.uniform2f(gl.getUniformLocation(program, 'u_direction'), 1, 0);
    gl.uniform1f(gl.getUniformLocation(program, 'u_blurAmount'), amount);
    gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), this.width, this.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTex);
    this.drawQuad();

    // Vertical pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers.get(sourceFb) || null);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(gl.getUniformLocation(program, 'u_direction'), 0, 1);
    const intermediateTex = this.textures.get(targetFb);
    if (!intermediateTex) return;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, intermediateTex);
    this.drawQuad();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Composite two textures with blend mode and opacity */
  composite(
    bgTexture: WebGLTexture,
    fgTexture: WebGLTexture,
    opacity: number,
    blendMode: string,
    targetFb: string = 'fb_a'
  ): void {
    if (!this.gl) return;
    const gl = this.gl;

    const program = this.useProgram('composite');
    if (!program) return;
    this.bindQuad();

    const blendModeMap: Record<string, number> = {
      normal: 0, multiply: 1, screen: 2, overlay: 3,
      darken: 4, lighten: 5, 'hard-light': 6, 'soft-light': 7, difference: 8,
    };

    gl.uniform1i(gl.getUniformLocation(program, 'u_bgTexture'), 0);
    gl.uniform1i(gl.getUniformLocation(program, 'u_fgTexture'), 1);
    gl.uniform1f(gl.getUniformLocation(program, 'u_opacity'), opacity);
    gl.uniform1i(gl.getUniformLocation(program, 'u_blendMode'), blendModeMap[blendMode] || 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, bgTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fgTexture);

    const fb = this.framebuffers.get(targetFb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb || null);
    gl.viewport(0, 0, this.width, this.height);

    this.drawQuad();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Apply transition between two textures */
  applyTransition(
    texA: WebGLTexture,
    texB: WebGLTexture,
    type: string,
    progress: number,
    targetFb: string = 'fb_a'
  ): void {
    if (!this.gl) return;
    const gl = this.gl;

    const program = this.useProgram(`transition_${type}`);
    if (!program) return;
    this.bindQuad();

    gl.uniform1i(gl.getUniformLocation(program, 'u_textureA'), 0);
    gl.uniform1i(gl.getUniformLocation(program, 'u_textureB'), 1);
    gl.uniform1f(gl.getUniformLocation(program, 'u_progress'), progress);
    if (type === 'dissolve') {
      gl.uniform1f(gl.getUniformLocation(program, 'u_time'), performance.now() / 1000);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texA);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texB);

    const fb = this.framebuffers.get(targetFb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb || null);
    gl.viewport(0, 0, this.width, this.height);

    this.drawQuad();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Read framebuffer to output canvas */
  readToCanvas(canvas: HTMLCanvasElement, sourceFb: string = 'fb_a'): void {
    if (!this.gl) return;
    const gl = this.gl;

    const tex = this.textures.get(sourceFb);
    if (!tex) return;

    // Create temp canvas to read pixels
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.width;
    tempCanvas.height = this.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    // Read pixels from framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers.get(sourceFb) || null);
    const pixels = new Uint8Array(this.width * this.height * 4);
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Flip vertically (WebGL origin is bottom-left)
    const imageData = tempCtx.createImageData(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const srcIdx = ((this.height - 1 - y) * this.width + x) * 4;
        const dstIdx = (y * this.width + x) * 4;
        imageData.data[dstIdx] = pixels[srcIdx];
        imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
        imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
        imageData.data[dstIdx + 3] = pixels[srcIdx + 3];
      }
    }
    tempCtx.putImageData(imageData, 0, 0);

    // Draw to output canvas
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(tempCanvas, 0, 0);
    }
  }

  get canvas(): HTMLCanvasElement | null {
    return this.gl ? this.gl.canvas as HTMLCanvasElement : null;
  }

  uploadTexture(name: string, source: TexImageSource): void {
    if (!this.gl) return;
    const gl = this.gl;
    let tex = this.textures.get(name);
    if (!tex) {
      tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.textures.set(name, tex);
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  /** Get a texture for direct use (e.g., as background for compositing) */
  getTexture(name: string): WebGLTexture | undefined {
    return this.textures.get(name);
  }

  resize(width: number, height: number): void {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;

    const gl = this.gl;
    if (gl) {
      for (const [, fb] of this.framebuffers) gl.deleteFramebuffer(fb);
      for (const [, tex] of this.textures) gl.deleteTexture(tex);
    }

    // Recreate framebuffers and textures
    this.framebuffers.clear();
    this.textures.clear();
    this.createFramebuffer('fb_a', width, height);
    this.createFramebuffer('fb_b', width, height);
    this.createTexture('tex_a', width, height);
    this.createTexture('tex_b', width, height);
    this.createTexture('tex_video', width, height);
  }

  destroy(): void {
    if (!this.gl) return;
    const gl = this.gl;

    for (const [, fb] of this.framebuffers) gl.deleteFramebuffer(fb);
    for (const [, tex] of this.textures) gl.deleteTexture(tex);
    for (const [, prog] of this.programs) gl.deleteProgram(prog);
    if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer);

    this.framebuffers.clear();
    this.textures.clear();
    this.programs.clear();
    this.initialized = false;
  }
}

export default WebGLFilterPipeline;
