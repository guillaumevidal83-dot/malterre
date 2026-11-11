/* Malterre — petit moteur 3D WebGL (low-poly, ombrage plat, brouillard). */
'use strict';
const M4 = {
  create() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  mul(out, a, b) {
    const o = M4._t;
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    out.set(o); return out;
  },
  persp(out, fov, asp, n, f) { const t = 1 / Math.tan(fov / 2); out.fill(0); out[0] = t / asp; out[5] = t; out[10] = (f + n) / (n - f); out[11] = -1; out[14] = 2 * f * n / (n - f); return out; },
  lookAt(out, e, c, up) {
    let fx = c[0] - e[0], fy = c[1] - e[1], fz = c[2] - e[2], l = Math.hypot(fx, fy, fz); fx /= l; fy /= l; fz /= l;
    let sx = fy * up[2] - fz * up[1], sy = fz * up[0] - fx * up[2], sz = fx * up[1] - fy * up[0]; l = Math.hypot(sx, sy, sz); sx /= l; sy /= l; sz /= l;
    const ux = sy * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy * fx;
    out[0] = sx; out[1] = ux; out[2] = -fx; out[3] = 0; out[4] = sy; out[5] = uy; out[6] = -fy; out[7] = 0; out[8] = sz; out[9] = uz; out[10] = -fz; out[11] = 0;
    out[12] = -(sx * e[0] + sy * e[1] + sz * e[2]); out[13] = -(ux * e[0] + uy * e[1] + uz * e[2]); out[14] = fx * e[0] + fy * e[1] + fz * e[2]; out[15] = 1;
    return out;
  },
  // Translation + rotation Y + échelle.
  trs(out, x, y, z, ry, sx, sy, sz) {
    const c = Math.cos(ry), s = Math.sin(ry);
    out[0] = c * sx; out[1] = 0; out[2] = -s * sx; out[3] = 0; out[4] = 0; out[5] = sy; out[6] = 0; out[7] = 0;
    out[8] = s * sz; out[9] = 0; out[10] = c * sz; out[11] = 0; out[12] = x; out[13] = y; out[14] = z; out[15] = 1; return out;
  },
  // Translation puis rotation autour d'un axe ('x', 'y' ou 'z').
  pivot(out, px, py, pz, ax, a) {
    const c = Math.cos(a), s = Math.sin(a);
    out.fill(0); out[0] = out[5] = out[10] = out[15] = 1;
    if (ax === 'x') { out[5] = c; out[6] = s; out[9] = -s; out[10] = c; }
    else if (ax === 'y') { out[0] = c; out[2] = -s; out[8] = s; out[10] = c; }
    else { out[0] = c; out[1] = s; out[4] = -s; out[5] = c; }
    out[12] = px; out[13] = py; out[14] = pz; return out;
  },
  _t: new Float32Array(16),
};

function hex(h, k) { const n = parseInt(h.slice(1), 16); k = k || 1; return [(n >> 16 & 255) / 255 * k, (n >> 8 & 255) / 255 * k, (n & 255) / 255 * k]; }

/* Constructeur de géométrie : on empile des formes simples, colorées par sommet. */
class Geo {
  constructor() { this.v = []; this.m = M4.create(); }
  at(x, y, z, ry, rx, rz) {
    const m = this.m, a = Geo._a;
    M4.pivot(m, x || 0, y || 0, z || 0, 'y', ry || 0);
    if (rx) M4.mul(m, m, M4.pivot(a, 0, 0, 0, 'x', rx));
    if (rz) M4.mul(m, m, M4.pivot(a, 0, 0, 0, 'z', rz));
    return this;
  }
  _p(p) { const m = this.m; return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }
  _tri(a, b, c, col, ctr) {
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const l = Math.hypot(nx, ny, nz); if (l < 1e-9) return; nx /= l; ny /= l; nz /= l;
    if (ctr && nx * (a[0] + b[0] + c[0] - 3 * ctr[0]) + ny * (a[1] + b[1] + c[1] - 3 * ctr[1]) + nz * (a[2] + b[2] + c[2] - 3 * ctr[2]) < 0) { nx = -nx; ny = -ny; nz = -nz; }
    for (const p of [a, b, c]) this.v.push(p[0], p[1], p[2], nx, ny, nz, col[0], col[1], col[2]);
  }
  tris(pts, idx, col, ctr) { const P = pts.map(p => this._p(p)), C = this._p(ctr); for (let i = 0; i < idx.length; i += 3) this._tri(P[idx[i]], P[idx[i + 1]], P[idx[i + 2]], col, C); return this; }
  box(w, h, d, col) {
    const x = w / 2, y = h / 2, z = d / 2;
    return this.tris([[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]],
      [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 0, 4, 7, 0, 7, 3, 1, 5, 6, 1, 6, 2, 3, 2, 6, 3, 6, 7, 0, 1, 5, 0, 5, 4], col, [0, 0, 0]);
  }
  // Cylindre ou cône, base posée en y = 0.
  cyl(rb, rt, h, seg, col) {
    const pts = [], idx = [];
    for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); pts.push([c * rb, 0, s * rb], [c * rt, h, s * rt]); }
    pts.push([0, 0, 0], [0, h, 0]);
    const B = seg * 2, T = B + 1;
    for (let i = 0; i < seg; i++) {
      const a = i * 2, b = (i + 1) % seg * 2;
      idx.push(a, b, b + 1, a, b + 1, a + 1, B, a, b);
      if (rt > 0) idx.push(T, a + 1, b + 1);
    }
    return this.tris(pts, idx, col, [0, h / 2, 0]);
  }
  ball(rx, ry, rz, col, seg, rings) {
    seg = seg || 6; rings = rings || 4;
    const pts = [], idx = [];
    for (let j = 0; j <= rings; j++) { const v = j / rings * Math.PI, y = Math.cos(v), r = Math.sin(v); for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2; pts.push([Math.cos(a) * r * rx, y * ry, Math.sin(a) * r * rz]); } }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const a = j * seg + i, b = j * seg + (i + 1) % seg, c = a + seg, d = b + seg; idx.push(a, b, d, a, d, c); }
    return this.tris(pts, idx, col, [0, 0, 0]);
  }
  // Disque horizontal (normale vers le haut).
  disc(r, seg, col) {
    for (let i = 0; i < seg; i++) {
      const a = i / seg * Math.PI * 2, b = (i + 1) / seg * Math.PI * 2;
      const P = [this._p([0, 0, 0]), this._p([Math.cos(a) * r, 0, Math.sin(a) * r]), this._p([Math.cos(b) * r, 0, Math.sin(b) * r])];
      for (const p of P) this.v.push(p[0], p[1], p[2], 0, 1, 0, col[0], col[1], col[2]);
    }
    return this;
  }
}
Geo._a = M4.create();

class Engine {
  constructor(canvas) {
    const gl = this.gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL indisponible');
    this.canvas = canvas;
    const vs = `attribute vec3 aP; attribute vec3 aN; attribute vec3 aC;
uniform mat4 uVP; uniform mat4 uM; uniform vec3 uCam;
varying vec3 vC; varying vec3 vN; varying float vD;
void main(){ vec4 w = uM * vec4(aP, 1.0); vN = mat3(uM) * aN; vC = aC; vD = length(w.xyz - uCam); gl_Position = uVP * w; }`;
    const fs = `precision mediump float;
uniform vec3 uL; uniform vec3 uAmb; uniform vec3 uSun; uniform vec3 uTint; uniform vec3 uFog; uniform vec2 uFogR; uniform float uFlash; uniform float uA; uniform float uUnlit;
varying vec3 vC; varying vec3 vN; varying float vD;
void main(){ float l = max(dot(normalize(vN), uL), 0.0);
  vec3 c = vC * uTint * mix(uAmb + uSun * l, vec3(1.0), uUnlit) + vec3(uFlash);
  float f = clamp((vD - uFogR.x) / (uFogR.y - uFogR.x), 0.0, 1.0);
  gl_FragColor = vec4(mix(c, uFog, f), uA); }`;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = this.prog = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p);
    this.a = { P: gl.getAttribLocation(p, 'aP'), N: gl.getAttribLocation(p, 'aN'), C: gl.getAttribLocation(p, 'aC') };
    this.u = {}; for (const n of ['uVP', 'uM', 'uCam', 'uL', 'uAmb', 'uSun', 'uTint', 'uFog', 'uFogR', 'uFlash', 'uA', 'uUnlit']) this.u[n] = gl.getUniformLocation(p, n);
    gl.enableVertexAttribArray(this.a.P); gl.enableVertexAttribArray(this.a.N); gl.enableVertexAttribArray(this.a.C);
    gl.enable(gl.DEPTH_TEST); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.proj = M4.create(); this.view = M4.create(); this.vp = M4.create();
    this.cur = null; this.blend = false; this.calls = 0;
  }
  mesh(geo) {
    const gl = this.gl, buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.v), gl.STATIC_DRAW);
    this.cur = null;
    return { buf, n: geo.v.length / 9 };
  }
  resize(scale) {
    const c = this.canvas, w = Math.round(c.clientWidth * scale), h = Math.round(c.clientHeight * scale);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    this.gl.viewport(0, 0, w, h);
  }
  begin(eye, target, fog, fogNear, fogFar, amb, sun) {
    const gl = this.gl, u = this.u;
    M4.persp(this.proj, 1.0, this.canvas.width / this.canvas.height, 0.5, 400);
    M4.lookAt(this.view, eye, target, [0, 1, 0]);
    M4.mul(this.vp, this.proj, this.view);
    gl.clearColor(fog[0], fog[1], fog[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(u.uVP, false, this.vp); gl.uniform3fv(u.uCam, eye);
    gl.uniform3f(u.uL, 0.45, 0.8, 0.4); gl.uniform3fv(u.uAmb, amb); gl.uniform3fv(u.uSun, sun);
    gl.uniform3fv(u.uFog, fog); gl.uniform2f(u.uFogR, fogNear, fogFar);
    this.setBlend(false); this.calls = 0;
  }
  setBlend(on) { if (on === this.blend) return; const gl = this.gl; this.blend = on; if (on) { gl.enable(gl.BLEND); gl.depthMask(false); } else { gl.disable(gl.BLEND); gl.depthMask(true); } }
  draw(mesh, M, tint, flash, alpha, unlit) {
    const gl = this.gl, u = this.u;
    if (this.cur !== mesh) {
      this.cur = mesh; gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buf);
      gl.vertexAttribPointer(this.a.P, 3, gl.FLOAT, false, 36, 0); gl.vertexAttribPointer(this.a.N, 3, gl.FLOAT, false, 36, 12); gl.vertexAttribPointer(this.a.C, 3, gl.FLOAT, false, 36, 24);
    }
    gl.uniformMatrix4fv(u.uM, false, M);
    gl.uniform3fv(u.uTint, tint || Engine.WHITE); gl.uniform1f(u.uFlash, flash || 0); gl.uniform1f(u.uA, alpha === undefined ? 1 : alpha); gl.uniform1f(u.uUnlit, unlit ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.n); this.calls++;
  }
  // Projette un point du monde vers l'écran (pixels CSS). Renvoie null s'il est derrière la caméra.
  project(x, y, z) {
    const m = this.vp, w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w < 0.1) return null;
    const c = this.canvas;
    return [((m[0] * x + m[4] * y + m[8] * z + m[12]) / w * 0.5 + 0.5) * c.clientWidth, (1 - ((m[1] * x + m[5] * y + m[9] * z + m[13]) / w * 0.5 + 0.5)) * c.clientHeight, w];
  }
}
Engine.WHITE = [1, 1, 1];
