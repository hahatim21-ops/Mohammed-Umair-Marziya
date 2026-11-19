// "Living image": one WebGL canvas per portrait page that draws the clean plate
// through a fragment shader. The RGB motion mask drives UV offsets:
//   R = breeze (foliage), G = water (page 5), B = fabric / sky.
// Page 2 also swings its chandelier like a pendulum hung from the ceiling.
import { dpr } from './core.js';

const VS = `
attribute vec2 a;
varying vec2 vUv;
void main() {
  vUv = vec2(a.x * 0.5 + 0.5, 0.5 - a.y * 0.5);
  gl_Position = vec4(a, 0.0, 1.0);
}`;

const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uPlate;
uniform sampler2D uMask;
uniform vec2 uImg;
uniform float uTime;
uniform float uGust;
uniform float uFabric;
uniform float uOpen;
uniform float uWater;
uniform float uDrift;
uniform vec4 uBasin;
uniform vec4 uChand;   // chandelier box (uv): x0, y0(pivot), x1, y1
uniform float uSwing;  // pendulum angle, radians

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec2 uv = vUv;
  float alpha = 1.0;
  float shade = 1.0;

  // ---- curtain opening (page 1 only): two halves gather toward the outer edges
  if (uOpen > 0.0) {
    float t = uOpen;
    bool left = vUv.x < 0.5;
    float xo = left ? vUv.x : 1.0 - vUv.x;           // distance from the outer edge
    float L = 0.5 * (1.0 - 0.85 * t);                // remaining width of each half
    if (xo > L + 0.003) {
      // soft shadow the gathered fabric casts onto the page behind
      float sh = (1.0 - smoothstep(L, L + 0.06, xo)) * 0.32 * smoothstep(0.0, 0.25, t) * (1.0 - smoothstep(0.85, 1.0, t));
      gl_FragColor = vec4(0.0, 0.0, 0.0, sh);
      return;
    }
    float s = clamp(xo / L, 0.0, 1.0);               // 0 outer .. 1 inner edge
    float k = 0.62 * t;
    float u = 0.5 * mix(s, 1.0 - pow(1.0 - s, 2.4), k); // compress toward the outer edge
    uv.x = left ? u : 1.0 - u;
    float sy = 1.0 + 0.07 * t * s;                   // perspective: inner edge swings toward us
    uv.y = 0.5 + (vUv.y - 0.5) / sy;
    if (uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0); return; }
    float folds = 0.5 + 0.5 * sin(u * 6.2831 * 17.0 + t * 3.0);
    shade = 1.0 - t * (0.32 * folds * folds + 0.20 * (1.0 - s));
    shade *= 1.0 - 0.28 * t * smoothstep(0.86, 1.0, s);   // the leading edge turns into shadow
    alpha = 1.0 - smoothstep(L - 0.004, L + 0.003, xo);
  }

  vec3 m = texture2D(uMask, uv).rgb;
  vec2 off = vec2(0.0);
  float t = uTime;

  if (m.r > 0.004) {                                   // breeze: leaves + flowers sway
    float ph = noise(uv * vec2(3.5, 2.5) + 3.1) * 6.2831;
    float s = sin(t * 1.15 + ph) * 0.55
            + sin(t * 0.52 + ph * 1.9) * 0.35
            + (noise(uv * 3.0 + vec2(t * 0.34, -t * 0.19)) - 0.5) * 0.9;
    s *= 1.0 + uGust * 1.2;
    // a quicker flutter on top of the slow sway, finer in scale (individual leaves)
    float fl = sin(t * 3.1 + noise(uv * 18.0) * 6.2831) * 0.35;
    off.x += (s * 5.0 + fl * 1.6) * m.r;
    off.y += ((noise(uv * 4.0 + vec2(-t * 0.28, t * 0.22)) - 0.5) * 2.6 + fl * 0.8) * m.r;
  }
  if (uSwing != 0.0) {                                 // chandelier pendulum
    float hw = (uChand.z - uChand.x) * 0.5;
    float qx = abs(uv.x - (uChand.x + hw)) / hw;
    float qy = (uv.y - uChand.y) / (uChand.w - uChand.y);
    float w = (1.0 - smoothstep(1.0, 1.3, qx)) * (1.0 - smoothstep(1.0, 1.15, qy)) * smoothstep(-0.6, 0.0, qy);
    if (w > 0.0) {
      vec2 px = uv * uImg;
      vec2 piv = vec2(uChand.x + hw, uChand.y) * uImg;
      vec2 d = px - piv;
      float cs = cos(-uSwing);
      float sn = sin(-uSwing);
      vec2 src = piv + vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y);
      off += (px - src) * w;
    }
  }
  if (m.b > 0.004) {                                   // fabric: slow wide wave, 6-9 s periods
    float w = sin(uv.x * 22.0 + uv.y * 3.0 + t * 0.81) * 0.6
            + sin(uv.x * 9.0 - t * 0.70 + uv.y * 1.5) * 0.4;
    off.x += w * 1.05 * m.b * uFabric;
    off.y += sin(uv.x * 15.0 + t * 0.9) * 0.3 * m.b * uFabric;
    off.x += sin(t * 0.13) * 7.0 * m.b * uDrift;       // page 4 clouds drift
  }
  if (uWater > 0.5 && m.g > 0.004) {                   // water
    float fl = noise(vec2(uv.x * 160.0, uv.y * 70.0 - t * 6.0));
    off.x += (fl - 0.5) * 1.6 * m.g;
    off.y += (fl - 0.5) * 2.6 * m.g;
    vec2 d = (uv - uBasin.xy) / uBasin.zw;
    float r = length(d);
    if (r < 1.25) {
      float rip = sin(r * 24.0 - t * 3.0) * (1.0 - smoothstep(0.55, 1.25, r));
      off += normalize(d + 1e-4) * rip * 1.3 * m.g * vec2(1.0, 0.4);
    }
  }

  vec4 c = texture2D(uPlate, uv - off / uImg);

  if (uWater > 0.5 && m.g > 0.02) {                    // moving specular glints
    float g = noise(vec2(uv.x * 260.0 + t * 1.5, uv.y * 140.0 - t * 7.0));
    c.rgb += pow(g, 14.0) * m.g * 1.5;
  }
  c.rgb *= shade;
  gl_FragColor = vec4(c.rgb * alpha, alpha);
}`;

// gentle pendulum: ~2 degrees, two incommensurate periods so it never looks mechanical
export function swingAngle(t) {
  return 0.03 * Math.sin(t * 1.2) + 0.008 * Math.sin(t * 2.17 + 0.7);
}

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
  return s;
}

export class Living {
  constructor(canvas, plate, mask, opts = {}) {
    this.canvas = canvas;
    this.opts = opts;
    const attrs = { alpha: !!opts.transparent, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' };
    const gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
    if (!gl) throw new Error('webgl unavailable');
    this.gl = gl;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const n of ['uPlate', 'uMask', 'uImg', 'uTime', 'uGust', 'uFabric', 'uOpen', 'uWater', 'uDrift', 'uBasin', 'uChand', 'uSwing']) this.u[n] = gl.getUniformLocation(prog, n);
    this.tex(0, plate);
    this.tex(1, mask);
    gl.uniform1i(this.u.uPlate, 0);
    gl.uniform1i(this.u.uMask, 1);
    gl.uniform2f(this.u.uImg, opts.imgW || 1080, opts.imgH || 1920);
    gl.uniform1f(this.u.uWater, opts.water ? 1 : 0);
    gl.uniform1f(this.u.uDrift, opts.drift ? 1 : 0);
    const b = opts.basin || [0.5, 0.5, 1, 1];
    gl.uniform4f(this.u.uBasin, b[0], b[1], b[2], b[3]);
    const ch = opts.chandelier || [0, 0, 1, 1];
    gl.uniform4f(this.u.uChand, ch[0], ch[1], ch[2], ch[3]);
    gl.uniform1f(this.u.uSwing, 0);
    gl.disable(gl.DEPTH_TEST);
    this.open = 0;
    this.fabric = 1;
    this.lost = false;
    this.gust = 0;
    this.nextGust = 4 + Math.random() * 4;
    this.gustStart = -10;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
      opts.onLost && opts.onLost();
    });
  }

  tex(unit, img) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  resize(w, h) {
    const d = dpr(2);
    const W = Math.max(2, Math.round(w * d));
    const H = Math.max(2, Math.round(h * d));
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    this.gl.viewport(0, 0, W, H);
  }

  // soft gust every 6-10 s
  updateGust(t) {
    if (t > this.nextGust) {
      this.gustStart = t;
      this.nextGust = t + 6 + Math.random() * 4;
    }
    const g = (t - this.gustStart) / 2.6;
    this.gust = g >= 0 && g <= 1 ? Math.sin(Math.PI * g) ** 2 : 0;
  }

  render(t) {
    if (this.lost) return;
    const gl = this.gl;
    this.updateGust(t);
    gl.uniform1f(this.u.uTime, t % 1000);
    gl.uniform1f(this.u.uGust, this.gust);
    gl.uniform1f(this.u.uFabric, this.fabric);
    gl.uniform1f(this.u.uOpen, this.open);
    if (this.opts.chandelier) gl.uniform1f(this.u.uSwing, swingAngle(t));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  destroy() {
    try {
      this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    } catch (e) {
      /* ignore */
    }
  }
}
