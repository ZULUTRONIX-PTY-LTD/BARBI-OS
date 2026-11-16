import * as THREE from 'three';

type ThreeNamespace = typeof THREE & {
  CopyShader?: Record<string, unknown>;
  LuminosityHighPassShader?: Record<string, unknown>;
  EffectComposer?: unknown;
  FullScreenQuad?: unknown;
  Pass?: unknown;
  RenderPass?: unknown;
  ShaderPass?: unknown;
  UnrealBloomPass?: unknown;
};

let initialized = false;

export function ensureBarbiThreePostProcessing(): void {
  const existing = (window as unknown as { THREE?: ThreeNamespace }).THREE;
  if (initialized && existing?.EffectComposer) return;
  initialized = true;
  const T: ThreeNamespace = { ...THREE };
  (window as unknown as { THREE: ThreeNamespace }).THREE = T;

  const CopyShader = {
    uniforms: {
      tDiffuse: { value: null },
      opacity: { value: 1.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }`,
    fragmentShader: `
      uniform float opacity;
      uniform sampler2D tDiffuse;
      varying vec2 vUv;
      void main() {
        vec4 texel = texture2D( tDiffuse, vUv );
        gl_FragColor = opacity * texel;
      }`,
  };
  T.CopyShader = CopyShader;

  const LuminosityHighPassShader = {
    shaderID: 'luminosityHighPass',
    uniforms: {
      tDiffuse: { value: null },
      luminosityThreshold: { value: 1.0 },
      smoothWidth: { value: 1.0 },
      defaultColor: { value: new THREE.Color(0x000000) },
      defaultOpacity: { value: 0.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }`,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform vec3 defaultColor;
      uniform float defaultOpacity;
      uniform float luminosityThreshold;
      uniform float smoothWidth;
      varying vec2 vUv;
      void main() {
        vec4 texel = texture2D( tDiffuse, vUv );
        vec3 luma = vec3( 0.299, 0.587, 0.114 );
        float v = dot( texel.xyz, luma );
        vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );
        float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );
        gl_FragColor = mix( outputColor, texel, alpha );
      }`,
  };
  T.LuminosityHighPassShader = LuminosityHighPassShader;

  class Pass {
    enabled = true;
    needsSwap = true;
    clear = false;
    renderToScreen = false;
    setSize(_width: number, _height: number) {}
    render(
      _renderer: THREE.WebGLRenderer,
      _writeBuffer: THREE.WebGLRenderTarget,
      _readBuffer: THREE.WebGLRenderTarget,
      _deltaTime?: number,
      _maskActive?: boolean
    ) {}
  }

  const _camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const _geometry = new THREE.BufferGeometry();
  _geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
  _geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));

  class FullScreenQuad {
    private _mesh: THREE.Mesh;
    constructor(material: THREE.Material | null) {
      this._mesh = new THREE.Mesh(_geometry, material as THREE.Material);
    }
    dispose() {
      this._mesh.geometry.dispose();
    }
    render(renderer: THREE.WebGLRenderer) {
      renderer.render(this._mesh, _camera);
    }
    get material() {
      return this._mesh.material;
    }
    set material(value: THREE.Material | THREE.Material[]) {
      this._mesh.material = value;
    }
  }

  class RenderPass extends Pass {
    scene: THREE.Scene;
    camera: THREE.Camera;
    overrideMaterial?: THREE.Material;
    clearColor?: THREE.Color;
    clearAlpha: number;
    _oldClearColor = new THREE.Color();
    constructor(
      scene: THREE.Scene,
      camera: THREE.Camera,
      overrideMaterial?: THREE.Material,
      clearColor?: THREE.Color,
      clearAlpha?: number
    ) {
      super();
      this.scene = scene;
      this.camera = camera;
      this.overrideMaterial = overrideMaterial;
      this.clearColor = clearColor;
      this.clearAlpha = clearAlpha !== undefined ? clearAlpha : 0;
      this.clear = true;
      this.needsSwap = false;
    }
    render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
      const oldAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      let oldClearAlpha = 1;
      let oldOverrideMaterial: THREE.Material | null = null;
      if (this.overrideMaterial !== undefined) {
        oldOverrideMaterial = this.scene.overrideMaterial;
        this.scene.overrideMaterial = this.overrideMaterial;
      }
      if (this.clearColor) {
        renderer.getClearColor(this._oldClearColor);
        oldClearAlpha = renderer.getClearAlpha();
        renderer.setClearColor(this.clearColor, this.clearAlpha);
      }
      renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
      if (this.clear) renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
      renderer.render(this.scene, this.camera);
      if (this.clearColor) {
        renderer.setClearColor(this._oldClearColor, oldClearAlpha);
      }
      if (this.overrideMaterial !== undefined) {
        this.scene.overrideMaterial = oldOverrideMaterial;
      }
      renderer.autoClear = oldAutoClear;
    }
  }

  class ShaderPass extends Pass {
    textureID: string;
    uniforms: Record<string, THREE.IUniform>;
    material: THREE.ShaderMaterial;
    fsQuad: FullScreenQuad;
    constructor(shader: typeof CopyShader | THREE.ShaderMaterial, textureID = 'tDiffuse') {
      super();
      this.textureID = textureID;
      if (shader instanceof THREE.ShaderMaterial) {
        this.uniforms = shader.uniforms;
        this.material = shader;
      } else {
        this.uniforms = THREE.UniformsUtils.clone(shader.uniforms);
        this.material = new THREE.ShaderMaterial({
          uniforms: this.uniforms,
          vertexShader: shader.vertexShader,
          fragmentShader: shader.fragmentShader,
        });
      }
      this.fsQuad = new FullScreenQuad(this.material);
    }
    render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
      if (this.uniforms[this.textureID]) {
        this.uniforms[this.textureID].value = readBuffer.texture;
      }
      this.fsQuad.material = this.material;
      if (this.renderToScreen) {
        renderer.setRenderTarget(null);
        this.fsQuad.render(renderer);
      } else {
        renderer.setRenderTarget(writeBuffer);
        if (this.clear) renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
        this.fsQuad.render(renderer);
      }
    }
  }

  class EffectComposer {
    renderer: THREE.WebGLRenderer;
    _pixelRatio: number;
    _width: number;
    _height: number;
    renderTarget1: THREE.WebGLRenderTarget;
    renderTarget2: THREE.WebGLRenderTarget;
    writeBuffer: THREE.WebGLRenderTarget;
    readBuffer: THREE.WebGLRenderTarget;
    renderToScreen = true;
    passes: Pass[] = [];
    copyPass: ShaderPass;
    clock = new THREE.Clock();

    constructor(renderer: THREE.WebGLRenderer, renderTarget?: THREE.WebGLRenderTarget) {
      this.renderer = renderer;
      const size = renderer.getSize(new THREE.Vector2());
      this._pixelRatio = renderer.getPixelRatio();
      this._width = size.width;
      this._height = size.height;
      const rt =
        renderTarget ||
        new THREE.WebGLRenderTarget(this._width * this._pixelRatio, this._height * this._pixelRatio, {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
        });
      this.renderTarget1 = rt;
      this.renderTarget2 = rt.clone();
      this.writeBuffer = this.renderTarget1;
      this.readBuffer = this.renderTarget2;
      this.copyPass = new ShaderPass(CopyShader);
    }
    swapBuffers() {
      const tmp = this.readBuffer;
      this.readBuffer = this.writeBuffer;
      this.writeBuffer = tmp;
    }
    addPass(pass: Pass) {
      this.passes.push(pass);
      pass.setSize(this._width * this._pixelRatio, this._height * this._pixelRatio);
    }
    render(deltaTime?: number) {
      const dt = deltaTime === undefined ? this.clock.getDelta() : deltaTime;
      const currentTarget = this.renderer.getRenderTarget();
      for (let i = 0; i < this.passes.length; i++) {
        const pass = this.passes[i];
        if (!pass.enabled) continue;
        pass.renderToScreen = this.renderToScreen && i === this.passes.length - 1;
        pass.render(this.renderer, this.writeBuffer, this.readBuffer, dt, false);
        if (pass.needsSwap) this.swapBuffers();
      }
      this.renderer.setRenderTarget(currentTarget);
    }
    setSize(width: number, height: number) {
      this._width = width;
      this._height = height;
      const ew = width * this._pixelRatio;
      const eh = height * this._pixelRatio;
      this.renderTarget1.setSize(ew, eh);
      this.renderTarget2.setSize(ew, eh);
      for (const p of this.passes) p.setSize(ew, eh);
    }
  }

  class UnrealBloomPass extends Pass {
    static BlurDirectionX = new THREE.Vector2(1.0, 0.0);
    static BlurDirectionY = new THREE.Vector2(0.0, 1.0);
    strength: number;
    radius: number;
    threshold: number;
    resolution: THREE.Vector2;
    clearColor = new THREE.Color(0, 0, 0);
    renderTargetsHorizontal: THREE.WebGLRenderTarget[] = [];
    renderTargetsVertical: THREE.WebGLRenderTarget[] = [];
    nMips = 5;
    renderTargetBright: THREE.WebGLRenderTarget;
    highPassUniforms: Record<string, THREE.IUniform>;
    materialHighPassFilter: THREE.ShaderMaterial;
    separableBlurMaterials: THREE.ShaderMaterial[] = [];
    compositeMaterial: THREE.ShaderMaterial;
    bloomTintColors: THREE.Vector3[];
    copyUniforms: Record<string, THREE.IUniform>;
    materialCopy: THREE.ShaderMaterial;
    _oldClearColor = new THREE.Color();
    oldClearAlpha = 1;
    basic = new THREE.MeshBasicMaterial();
    fsQuad = new FullScreenQuad(null);

    constructor(resolution?: THREE.Vector2, strength = 1, radius = 0.4, threshold = 0.85) {
      super();
      this.strength = strength;
      this.radius = radius;
      this.threshold = threshold;
      this.resolution = resolution ? resolution.clone() : new THREE.Vector2(256, 256);
      const pars = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat };
      let rx = Math.round(this.resolution.x / 2);
      let ry = Math.round(this.resolution.y / 2);
      this.renderTargetBright = new THREE.WebGLRenderTarget(rx, ry, pars);
      for (let i = 0; i < this.nMips; i++) {
        this.renderTargetsHorizontal.push(new THREE.WebGLRenderTarget(rx, ry, pars));
        this.renderTargetsVertical.push(new THREE.WebGLRenderTarget(rx, ry, pars));
        rx = Math.max(1, Math.round(rx / 2));
        ry = Math.max(1, Math.round(ry / 2));
      }
      this.highPassUniforms = THREE.UniformsUtils.clone(LuminosityHighPassShader.uniforms);
      this.highPassUniforms.luminosityThreshold.value = threshold;
      this.highPassUniforms.smoothWidth.value = 0.01;
      this.materialHighPassFilter = new THREE.ShaderMaterial({
        uniforms: this.highPassUniforms,
        vertexShader: LuminosityHighPassShader.vertexShader,
        fragmentShader: LuminosityHighPassShader.fragmentShader,
      });

      const kernels = [3, 5, 7, 9, 11];
      rx = Math.round(this.resolution.x / 2);
      ry = Math.round(this.resolution.y / 2);
      for (let i = 0; i < this.nMips; i++) {
        this.separableBlurMaterials.push(this.getSeperableBlurMaterial(kernels[i]));
        this.separableBlurMaterials[i].uniforms.texSize.value = new THREE.Vector2(rx, ry);
        rx = Math.max(1, Math.round(rx / 2));
        ry = Math.max(1, Math.round(ry / 2));
      }

      this.bloomTintColors = Array.from({ length: 5 }, () => new THREE.Vector3(1, 1, 1));
      this.compositeMaterial = this.getCompositeMaterial(this.nMips);
      this.compositeMaterial.uniforms.blurTexture1.value = this.renderTargetsVertical[0].texture;
      this.compositeMaterial.uniforms.blurTexture2.value = this.renderTargetsVertical[1].texture;
      this.compositeMaterial.uniforms.blurTexture3.value = this.renderTargetsVertical[2].texture;
      this.compositeMaterial.uniforms.blurTexture4.value = this.renderTargetsVertical[3].texture;
      this.compositeMaterial.uniforms.blurTexture5.value = this.renderTargetsVertical[4].texture;
      this.compositeMaterial.uniforms.bloomStrength.value = strength;
      this.compositeMaterial.uniforms.bloomRadius.value = radius;
      this.compositeMaterial.uniforms.bloomFactors.value = [1.0, 0.8, 0.6, 0.4, 0.2];
      this.compositeMaterial.uniforms.bloomTintColors.value = this.bloomTintColors;

      this.copyUniforms = THREE.UniformsUtils.clone(CopyShader.uniforms);
      this.copyUniforms.opacity.value = 1.0;
      this.materialCopy = new THREE.ShaderMaterial({
        uniforms: this.copyUniforms,
        vertexShader: CopyShader.vertexShader,
        fragmentShader: CopyShader.fragmentShader,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      });
      this.needsSwap = false;
    }

    setSize(width: number, height: number) {
      let rx = Math.max(1, Math.round(width / 2));
      let ry = Math.max(1, Math.round(height / 2));
      this.renderTargetBright.setSize(rx, ry);
      for (let i = 0; i < this.nMips; i++) {
        this.renderTargetsHorizontal[i].setSize(rx, ry);
        this.renderTargetsVertical[i].setSize(rx, ry);
        this.separableBlurMaterials[i].uniforms.texSize.value = new THREE.Vector2(rx, ry);
        rx = Math.max(1, Math.round(rx / 2));
        ry = Math.max(1, Math.round(ry / 2));
      }
    }

    render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
      renderer.getClearColor(this._oldClearColor);
      this.oldClearAlpha = renderer.getClearAlpha();
      const oldAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setClearColor(this.clearColor, 0);

      if (this.renderToScreen) {
        this.fsQuad.material = this.basic;
        this.basic.map = readBuffer.texture;
        renderer.setRenderTarget(null);
        renderer.clear();
        this.fsQuad.render(renderer);
      }

      this.highPassUniforms.tDiffuse.value = readBuffer.texture;
      this.highPassUniforms.luminosityThreshold.value = this.threshold;
      this.fsQuad.material = this.materialHighPassFilter;
      renderer.setRenderTarget(this.renderTargetBright);
      renderer.clear();
      this.fsQuad.render(renderer);

      let inputTarget = this.renderTargetBright;
      for (let i = 0; i < this.nMips; i++) {
        this.fsQuad.material = this.separableBlurMaterials[i];
        this.separableBlurMaterials[i].uniforms.colorTexture.value = inputTarget.texture;
        this.separableBlurMaterials[i].uniforms.direction.value = UnrealBloomPass.BlurDirectionX;
        renderer.setRenderTarget(this.renderTargetsHorizontal[i]);
        renderer.clear();
        this.fsQuad.render(renderer);

        this.separableBlurMaterials[i].uniforms.colorTexture.value = this.renderTargetsHorizontal[i].texture;
        this.separableBlurMaterials[i].uniforms.direction.value = UnrealBloomPass.BlurDirectionY;
        renderer.setRenderTarget(this.renderTargetsVertical[i]);
        renderer.clear();
        this.fsQuad.render(renderer);
        inputTarget = this.renderTargetsVertical[i];
      }

      this.fsQuad.material = this.compositeMaterial;
      this.compositeMaterial.uniforms.bloomStrength.value = this.strength;
      this.compositeMaterial.uniforms.bloomRadius.value = this.radius;
      renderer.setRenderTarget(this.renderTargetsHorizontal[0]);
      renderer.clear();
      this.fsQuad.render(renderer);

      this.fsQuad.material = this.materialCopy;
      this.copyUniforms.tDiffuse.value = this.renderTargetsHorizontal[0].texture;
      renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
      this.fsQuad.render(renderer);

      renderer.setClearColor(this._oldClearColor, this.oldClearAlpha);
      renderer.autoClear = oldAutoClear;
    }

    getSeperableBlurMaterial(kernelRadius: number) {
      return new THREE.ShaderMaterial({
        defines: { KERNEL_RADIUS: kernelRadius, SIGMA: kernelRadius },
        uniforms: {
          colorTexture: { value: null },
          texSize: { value: new THREE.Vector2(0.5, 0.5) },
          direction: { value: new THREE.Vector2(0.5, 0.5) },
        },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `#include <common>
          varying vec2 vUv;
          uniform sampler2D colorTexture;
          uniform vec2 texSize;
          uniform vec2 direction;
          float gaussianPdf(in float x, in float sigma) { return 0.39894 * exp(-0.5 * x * x / (sigma * sigma)) / sigma; }
          void main() {
            vec2 invSize = 1.0 / texSize;
            float fSigma = float(SIGMA);
            float weightSum = gaussianPdf(0.0, fSigma);
            vec3 diffuseSum = texture2D(colorTexture, vUv).rgb * weightSum;
            for (int i = 1; i < KERNEL_RADIUS; i++) {
              float x = float(i);
              float w = gaussianPdf(x, fSigma);
              vec2 uvOffset = direction * invSize * x;
              diffuseSum += (texture2D(colorTexture, vUv + uvOffset).rgb + texture2D(colorTexture, vUv - uvOffset).rgb) * w;
              weightSum += 2.0 * w;
            }
            gl_FragColor = vec4(diffuseSum / weightSum, 1.0);
          }`,
      });
    }

    getCompositeMaterial(nMips: number) {
      return new THREE.ShaderMaterial({
        defines: { NUM_MIPS: nMips },
        uniforms: {
          blurTexture1: { value: null },
          blurTexture2: { value: null },
          blurTexture3: { value: null },
          blurTexture4: { value: null },
          blurTexture5: { value: null },
          bloomStrength: { value: 1.0 },
          bloomRadius: { value: 0.0 },
          bloomFactors: { value: null },
          bloomTintColors: { value: null },
        },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `varying vec2 vUv;
          uniform sampler2D blurTexture1;
          uniform sampler2D blurTexture2;
          uniform sampler2D blurTexture3;
          uniform sampler2D blurTexture4;
          uniform sampler2D blurTexture5;
          uniform float bloomStrength;
          uniform float bloomRadius;
          uniform float bloomFactors[NUM_MIPS];
          uniform vec3 bloomTintColors[NUM_MIPS];
          float lerpBloomFactor(const in float factor) { return mix(factor, 1.2 - factor, bloomRadius); }
          void main() {
            gl_FragColor = bloomStrength * (
              lerpBloomFactor(bloomFactors[0]) * vec4(bloomTintColors[0], 1.0) * texture2D(blurTexture1, vUv) +
              lerpBloomFactor(bloomFactors[1]) * vec4(bloomTintColors[1], 1.0) * texture2D(blurTexture2, vUv) +
              lerpBloomFactor(bloomFactors[2]) * vec4(bloomTintColors[2], 1.0) * texture2D(blurTexture3, vUv) +
              lerpBloomFactor(bloomFactors[3]) * vec4(bloomTintColors[3], 1.0) * texture2D(blurTexture4, vUv) +
              lerpBloomFactor(bloomFactors[4]) * vec4(bloomTintColors[4], 1.0) * texture2D(blurTexture5, vUv)
            );
          }`,
      });
    }
  }

  T.Pass = Pass;
  T.FullScreenQuad = FullScreenQuad;
  T.RenderPass = RenderPass;
  T.ShaderPass = ShaderPass;
  T.EffectComposer = EffectComposer;
  T.UnrealBloomPass = UnrealBloomPass;
}
