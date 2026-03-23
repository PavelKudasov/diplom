// main.js — GeoDraw (исправленная версия)
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('plane');
  if (!canvas) {
    console.error('main.js: <canvas id="plane"> не найден.');
    return;
  }
  (function app(canvasEl) {
    const ctx = canvasEl.getContext('2d');
    const planeContainer = document.querySelector('.coordinate-plane') || canvasEl.parentElement;
    canvasEl.style.touchAction = canvasEl.style.touchAction || 'none';

    /* ====== Настройки ====== */
    const GRID_STEP = 25;
    const LINE_CELLS = 6;
    const MIN_CANVAS = 120;
    const MAX_CANVAS = 900;
    
    // Динамические пороги — больше на мобильных
    function getVertexPickThreshold() {
      const isMobile = window.innerWidth <= 1023;
      return isMobile ? 40 : 28; // на телефонах ещё больше
    }
    function getEdgePickThreshold() {
      const isMobile = window.innerWidth <= 1023;
      return isMobile ? 45 : 32; // на телефонах ещё больше
    }

    /* ====== Canvas sizing ====== */
    function getCanvasDiag() {
      const w = canvasEl.clientWidth || 800;
      const h = canvasEl.clientHeight || 800;
      return Math.hypot(w, h);
    }
    function setCanvasSize() {
      try {
        const dpr = (window || globalThis).devicePixelRatio || 1;
        const isMobile = (window || globalThis).innerWidth <= 1023;
        // На мобильных: высота 900px, ширина авто. На ПК: квадрат 900x900
        const targetHeight = isMobile ? 900 : MAX_CANVAS;
        const containerWidth = Math.max(MIN_CANVAS, Math.min(planeContainer.clientWidth || 350, (window || globalThis).innerWidth, MAX_CANVAS));
        const cssW = containerWidth;
        const cssH = targetHeight;
        canvasEl.style.width = cssW + 'px';
        canvasEl.style.height = cssH + 'px';
        canvasEl.width = Math.round(cssW * dpr);
        canvasEl.height = Math.round(cssH * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // обновляем глобальную диагональ после ресайза
        if (typeof getCanvasDiag === 'function') {
          const diag = getCanvasDiag();
          rayBound = diag * 2;
        }
      } catch (e) {
        console.error('Ошибка при настройке размера канваса:', e);
      }
    }
    setCanvasSize();
    window.addEventListener('resize', setCanvasSize);

    /* ====== Coordinate transforms ====== */
    function screenToCanvas(x, y) {
      const rect = canvasEl.getBoundingClientRect();
      return { x: x - rect.left, y: y - rect.top };
    }
    function screenToWorld(x, y) {
      const c = screenToCanvas(x, y);
      const cx = canvasEl.clientWidth / 2;
      const cy = canvasEl.clientHeight / 2;
      return { x: c.x - cx, y: cy - c.y };
    }
    function worldToScreen(wx, wy) {
      const cx = canvasEl.clientWidth / 2;
      const cy = canvasEl.clientHeight / 2;
      return { x: wx + cx, y: cy - wy };
    }

    /* ====== Grid & axes ====== */
    function drawGrid() {
      const step = GRID_STEP;
      const w = canvasEl.clientWidth;
      const h = canvasEl.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.strokeStyle = "#e6e6e6";
      ctx.lineWidth = 1;
      for (let x = 0; x <= w; x += step) {
        ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
      }
      for (let y = 0; y <= h; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
      }
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 2;
      const cx = w / 2, cy = h / 2;
      ctx.beginPath(); ctx.moveTo(cx + 0.5, 0); ctx.lineTo(cx + 0.5, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, cy + 0.5); ctx.lineTo(w, cy + 0.5); ctx.stroke();
      ctx.restore();
    }

    /* ====== Utility geometry ====== */
    function uid(prefix = 'id') { return prefix + '_' + Math.random().toString(36).slice(2, 9); }
    function add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
    function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
    function mul(v, k) { return { x: v.x * k, y: v.y * k }; }
    function len(v) { return Math.hypot(v.x, v.y); }
    function norm(v) { const L = len(v) || 1; return { x: v.x / L, y: v.y / L }; }
    function perp(v) { return { x: -v.y, y: v.x }; }
    function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
    function pointInTriangle(p, a, b, c) {
      const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (Math.abs(area) < 1e-6) return false;
      const s = ((a.y - c.y) * (p.x - c.x) + (c.x - a.x) * (p.y - c.y)) / area;
      const t = ((a.x - b.x) * (p.y - a.y) + (a.y - b.y) * (p.x - a.x)) / area;
      return s >= 0 && t >= 0 && s + t <= 1;
    }
    function pointInPolygon(p, poly) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        if (((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)) {
          inside = !inside;
        }
      }
      return inside;
    }

    /* ====== Base shape ====== */
    class Shape {
      constructor(x = 0, y = 0) {
        this.x = x; this.y = y;
        this.rotation = 0;
        this.scale = 1;
        this.selected = false;
        this.isDragging = false;
        this.vertexNames = null;
        this.constructions = [];
      }
      applyTransform(ctx, drawFn) {
        const p = worldToScreen(this.x, this.y);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(this.rotation);
        ctx.scale(this.scale, this.scale);
        drawFn();
        ctx.restore();
      }
      draw(ctx) {}
      hitTest(wx, wy) { return false; }
      getBoundingBox() { return { x: this.x - 50, y: this.y - 50, w: 100, h: 100 }; }
      drawSelection(ctx) {}
      localToWorld(p) {
        const cos = Math.cos(this.rotation), sin = Math.sin(this.rotation);
        const rx = p.x * this.scale, ry = p.y * this.scale;
        return { x: this.x + rx * cos - ry * sin, y: this.y - rx * sin - ry * cos };
      }
      worldToLocal(p) {
        const dx = p.x - this.x, dy = p.y - this.y;
        const cos = Math.cos(this.rotation), sin = Math.sin(this.rotation);
        return { x: (dx * cos - dy * sin) / this.scale, y: (-dx * sin - dy * cos) / this.scale };
      }
    }

    /* ====== Geometry utilities for sections ====== */
    function planeFromPoints(p1, p2, p3) {
      const a1 = { x: p1.x, y: p1.y, z: p1.y };
      const a2 = { x: p2.x, y: p2.y, z: p2.y };
      const a3 = { x: p3.x, y: p3.y, z: p3.y };
      const v1 = { x: a2.x - a1.x, y: a2.y - a1.y, z: a2.z - a1.z };
      const v2 = { x: a3.x - a1.x, y: a3.y - a1.y, z: a3.z - a1.z };
      const normal = {
        x: v1.y * v2.z - v1.z * v2.y,
        y: v1.z * v2.x - v1.x * v2.z,
        z: v1.x * v2.y - v1.y * v2.x
      };
      const d = -(normal.x * a1.x + normal.y * a1.y + normal.z * a1.z);
      return { a: normal.x, b: normal.y, c: normal.z, d };
    }
    function intersectConeWithPlane(plane, apex, radius, height, resolution = 50) {
      const { a, b, c, d } = plane;
      const points = [];
      const apex3d = { x: apex.x, y: apex.y, z: apex.y };
      for (let i = 0; i < resolution; i++) {
        const theta = (i / resolution) * 2 * Math.PI;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        const coeff = a * radius * cosT + (b + c) * height;
        const constTerm = a * apex3d.x + b * apex3d.y + c * apex3d.z + d;
        if (Math.abs(coeff) > 1e-6) {
          const t = -constTerm / coeff;
          if (t >= 0 && t <= 1) {
            const x = apex3d.x + t * radius * cosT;
            const y = apex3d.y + t * height;
            const z = apex3d.z + t * height;
            points.push({ x, y, z });
          }
        }
      }
      return points;
    }
    function intersectCylinderWithPlane(plane, center, radius, height, resolution = 50) {
      const { a, b, c, d } = plane;
      const points = [];
      for (let i = 0; i < resolution; i++) {
        const theta = (i / resolution) * 2 * Math.PI;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        if (Math.abs(b) > 1e-6) {
          const y = (-a * (center.x + radius * cosT) - c * (center.z + radius * sinT) - d) / b;
          if (y >= center.y - height/2 && y <= center.y + height/2) {
            const x = center.x + radius * cosT;
            const z = center.z + radius * sinT;
            points.push({ x, y, z });
          }
        }
      }
      return points;
    }
    function intersectLineWithPlane(p1, p2, plane) {
      const { a, b, c, d } = plane;
      const d1 = a * p1.x + b * p1.y + c * p1.z + d;
      const d2 = a * p2.x + b * p2.y + c * p2.z + d;
      if (d1 * d2 > 0) return null;
      const t = d1 / (d1 - d2);
      return {
        x: p1.x + t * (p2.x - p1.x),
        y: p1.y + t * (p2.y - p1.y),
        z: p1.z + t * (p2.z - p1.z)
      };
    }
    function intersectPolygonWithPlane(edges, plane) {
      const points = [];
      for (const edge of edges) {
        const p = intersectLineWithPlane(edge[0], edge[1], plane);
        if (p) points.push(p);
      }
      const unique = [];
      const threshold = 1e-6;
      for (const p of points) {
        if (!unique.some(up => Math.hypot(p.x - up.x, p.y - up.y, p.z - up.z) < threshold)) {
          unique.push(p);
        }
      }
      if (unique.length > 2) {
        const cx = unique.reduce((s, p) => s + p.x, 0) / unique.length;
        const cy = unique.reduce((s, p) => s + p.y, 0) / unique.length;
        unique.sort((p1, p2) => {
          const a1 = Math.atan2(p1.y - cy, p1.x - cx);
          const a2 = Math.atan2(p2.y - cy, p2.x - cx);
          return a1 - a2;
        });
      }
      return unique;
    }

    /* ====== Point ====== */
    class PointShape extends Shape {
      constructor(x, y, r = 6) { super(x, y); this.r = r; this.vertexNames = ['A']; }
      getVerticesWorld() { return [{ x: this.x, y: this.y }]; }
      draw(ctx) {
        this.applyTransform(ctx, () => {
          ctx.fillStyle = '#ff4d4f';
          ctx.beginPath(); ctx.arc(0, 0, this.r, 0, Math.PI * 2); ctx.fill();
          drawConstructionsForShape(ctx, this);
        });
        if (this.vertexNames) {
          const verts = this.getVerticesWorld();
          ctx.save();
          ctx.fillStyle = '#111';
          ctx.font = '14px Arial';
          verts.forEach((p, i) => {
            const s = worldToScreen(p.x, p.y);
            ctx.fillText(this.vertexNames[i] || '', s.x + 6, s.y - 6);
          });
          ctx.restore();
        }
        if (this.selected) this.drawSelection(ctx);
      }
      hitTest(wx, wy) { return Math.hypot(wx - this.x, wy - this.y) <= this.r + 8; }
      getBoundingBox() {
        return { x: this.x - this.r - 8, y: this.y - this.r - 8, w: (this.r + 8) * 2, h: (this.r + 8) * 2 };
      }
      drawSelection(ctx) {
        const p = worldToScreen(this.x, this.y);
        ctx.save();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, this.r + 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    /* ====== Circle ====== */
    class CircleShape extends Shape {
      constructor(x, y, r = 60) { super(x, y); this.r = r; this.vertexNames = ['O', 'A', 'B', 'C', 'D']; }
      getVerticesWorld() {
        const verts = [
          { x: this.x, y: this.y },
          { x: this.x + this.r * this.scale, y: this.y },
          { x: this.x, y: this.y + this.r * this.scale },
          { x: this.x - this.r * this.scale, y: this.y },
          { x: this.x, y: this.y - this.r * this.scale }
        ];
        return verts;
      }
      draw(ctx) {
        this.applyTransform(ctx, () => {
          ctx.strokeStyle = '#1e90ff';
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, 0, this.r, 0, Math.PI * 2); ctx.stroke();
          drawConstructionsForShape(ctx, this);
        });
        if (this.vertexNames) {
          const verts = this.getVerticesWorld();
          ctx.save();
          ctx.fillStyle = '#111';
          ctx.font = '14px Arial';
          verts.forEach((p, i) => {
            const s = worldToScreen(p.x, p.y);
            ctx.fillText(this.vertexNames[i] || '', s.x + 6, s.y - 6);
          });
          ctx.restore();
        }
        if (this.selected) this.drawSelection(ctx);
      }
      hitTest(wx, wy) { return Math.hypot(wx - this.x, wy - this.y) <= this.r * this.scale + 8; }
      getBoundingBox() { const R = this.r * this.scale; return { x: this.x - R, y: this.y - R, w: 2 * R, h: 2 * R }; }
      drawSelection(ctx) {
        const p = worldToScreen(this.x, this.y);
        ctx.save();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, this.r * this.scale + 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    /* ====== Rect / Square ====== */
    class RectShape extends Shape {
      constructor(x, y, w = 180, h = 120) {
        super(x, y);
        this.w = w; this.h = h;
        this.vertexNames = ['A', 'B', 'C', 'D'];
      }
      getVerticesLocal() {
        return [
          { x: -this.w / 2, y: -this.h / 2 },
          { x:  this.w / 2, y: -this.h / 2 },
          { x:  this.w / 2, y:  this.h / 2 },
          { x: -this.w / 2, y:  this.h / 2 }
        ];
      }
      getVerticesWorld() {
        const v = this.getVerticesLocal();
        const cos = Math.cos(this.rotation), sin = Math.sin(this.rotation);
        return v.map(p => {
          const rx = p.x * this.scale, ry = p.y * this.scale;
          return { x: this.x + rx * cos - ry * sin, y: this.y - rx * sin - ry * cos };
        });
      }
      draw(ctx) {
        this.applyTransform(ctx, () => {
          ctx.strokeStyle = '#0ea5a4';
          ctx.lineWidth = 3;
          ctx.strokeRect(-this.w / 2, -this.h / 2, this.w, this.h);
          drawConstructionsForShape(ctx, this);
        });
        if (this.vertexNames) {
          const verts = this.getVerticesWorld();
          ctx.save();
          ctx.fillStyle = '#111';
          ctx.font = '14px Arial';
          verts.forEach((p, i) => {
            const s = worldToScreen(p.x, p.y);
            ctx.fillText(this.vertexNames[i] || '', s.x + 6, s.y - 6);
          });
          ctx.restore();
        }
        if (this.selected) this.drawSelection(ctx);
      }
      hitTest(wx, wy) {
        const v = this.getVerticesWorld();
        let inside = false;
        for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
          const xi = v[i].x, yi = v[i].y;
          const xj = v[j].x, yj = v[j].y;
          const intersect = ((yi > wy) !== (yj > wy)) && (wx < (xj - xi) * (wy - yi) / (yj - yi) + xi);
          if (intersect) inside = !inside;
        }
        return inside;
      }
      getBoundingBox() {
        const v = this.getVerticesWorld();
        const xs = v.map(p => p.x), ys = v.map(p => p.y);
        return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      }
      drawSelection(ctx) {
        const box = this.getBoundingBox();
        const p1 = worldToScreen(box.x, box.y);
        const p2 = worldToScreen(box.x + box.w, box.y + box.h);
        ctx.save();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(p1.x - 4, p1.y - 4, (p2.x - p1.x) + 8, (p2.y - p1.y) + 8);
        ctx.restore();
      }
    }
    class SquareShape extends RectShape {
      constructor(x, y, size = 140) { super(x, y, size, size); }
    }

    /* ====== Triangle ====== */
    class TriangleShape extends Shape {
      constructor(x, y, side = 140) {
        super(x, y);
        this.side = side;
        this.vertexNames = ['A', 'B', 'C'];
      }
      getVerticesLocal() {
        const h = Math.sqrt(3) / 2 * this.side;
        return [
          { x: 0, y: (2 / 3) * h },
          { x: -this.side / 2, y: -(1 / 3) * h },
          { x:  this.side / 2, y: -(1 / 3) * h }
        ];
      }
      getVerticesWorld() {
        const v = this.getVerticesLocal();
        const cos = Math.cos(this.rotation), sin = Math.sin(this.rotation);
        return v.map(p => {
          const rx = p.x * this.scale, ry = p.y * this.scale;
          return { x: this.x + rx * cos - ry * sin, y: this.y - rx * sin - ry * cos };
        });
      }
      draw(ctx) {
        this.applyTransform(ctx, () => {
          const v = this.getVerticesLocal();
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(v[0].x, v[0].y);
          ctx.lineTo(v[1].x, v[1].y);
          ctx.lineTo(v[2].x, v[2].y);
          ctx.closePath();
          ctx.stroke();
          drawConstructionsForShape(ctx, this);
        });
        const verts = this.getVerticesWorld();
        ctx.save();
        ctx.fillStyle = '#111';
        ctx.font = '14px Arial';
        verts.forEach((p, i) => {
          const s = worldToScreen(p.x, p.y);
          ctx.fillText(this.vertexNames[i] || '', s.x + 6, s.y - 6);
        });
        ctx.restore();
        if (this.selected) this.drawSelection(ctx);
      }
      hitTest(wx, wy) {
        const v = this.getVerticesWorld();
        const area = (p, q, r) => Math.abs((q.x - p.x) * (r.y - p.y) - (r.x - p.x) * (q.y - p.y)) / 2;
        const A = area(v[0], v[1], v[2]);
        const A1 = area({ x: wx, y: wy }, v[1], v[2]);
        const A2 = area(v[0], { x: wx, y: wy }, v[2]);
        const A3 = area(v[0], v[1], { x: wx, y: wy });
        return Math.abs((A1 + A2 + A3) - A) < 0.5;
      }
      getBoundingBox() {
        const v = this.getVerticesWorld();
        const xs = v.map(p => p.x), ys = v.map(p => p.y);
        return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      }
      drawSelection(ctx) {
        const v = this.getVerticesWorld().map(p => worldToScreen(p.x, p.y));
        ctx.save();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(v[0].x, v[0].y);
        ctx.lineTo(v[1].x, v[1].y);
        ctx.lineTo(v[2].x, v[2].y);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    }

    /* ====== Rhombus ====== */
    class RhombusShape extends Shape {
      constructor(x, y, d1 = 160, d2 = 100) {
        super(x, y);
        this.d1 = d1; this.d2 = d2;
        this.vertexNames = ['A', 'B', 'C', 'D'];
      }
      getVerticesLocal() {
        return [
          { x: -this.d1 / 2, y: 0 },
          { x: 0, y: this.d2 / 2 },
          { x: this.d1 / 2, y: 0 },
          { x: 0, y: -this.d2 / 2 }
        ];
      }
      getVerticesWorld() {
        const v = this.getVerticesLocal();
        const cos = Math.cos(this.rotation), sin = Math.sin(this.rotation);
        return v.map(p => {
          const rx = p.x * this.scale, ry = p.y * this.scale;
          return { x: this.x + rx * cos - ry * sin, y: this.y - rx * sin - ry * cos };
        });
      }
      draw(ctx) {
        this.applyTransform(ctx, () => {
          const v = this.getVerticesLocal();
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(v[0].x, v[0].y);
          for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
          ctx.closePath();
          ctx.stroke();
          drawConstructionsForShape(ctx, this);
        });
        if (this.vertexNames) {
          const verts = this.getVerticesWorld();
          ctx.save();
          ctx.fillStyle = '#111';
          ctx.font = '14px Arial';
          verts.forEach((p, i) => {
            const s = worldToScreen(p.x, p.y);
            ctx.fillText(this.vertexNames[i] || '', s.x + 6, s.y - 6);
          });
          ctx.restore();
        }
        if (this.selected) this.drawSelection(ctx);
      }
      hitTest(wx, wy) {
        const v = this.getVerticesWorld();
        let inside = true;
        for (let i = 0; i < v.length; i++) {
          const a = v[i], b = v[(i + 1) % v.length];
          if ((b.x - a.x) * (wy - a.y) - (b.y - a.y) * (wx - a.x) < 0) {
            inside = false; break;
          }
        }
        return inside;
      }
      getBoundingBox() {
        const v = this.getVerticesWorld();
        const xs = v.map(p => p.x), ys = v.map(p => p.y);
        return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      }
      drawSelection(ctx) {
        const v = this.getVerticesWorld().map(p => worldToScreen(p.x, p.y));
        ctx.save();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(v[0].x, v[0].y);
        for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    }

    /* ====== Parallelogram ====== */
    class ParallelogramShape extends Shape {
      constructor(x, y, base = 160, side = 100, skew = 40) {
        super(x, y);
        this.base = base;
        this.side = side;
        this.skew = skew;
        this.vertexNames = ['A', 'B', 'C', 'D'];
      }
      getVerticesLocal() {
        const halfBase = this.base / 2;
        const halfSide = this.side / 2;
        return [
          { x: -halfBase, y: -halfSide },
          { x:  halfBase, y: -halfSide + this.skew },
          { x:  halfBase, y:  halfSide + this.skew },
          { x: -halfBase, y:  halfSide }
        ];
      }
      getVerticesWorld() {
        const v = this.getVerticesLocal();
        const cos = Math.cos(this.rotation), sin = Math.sin(this.rotation);
        return v.map(p => {
          const rx = p.x * this.scale, ry = p.y * this.scale;
          return { x: this.x + rx * cos - ry * sin, y: this.y - rx * sin - ry * cos };
        });
      }
      draw(ctx) {
        this.applyTransform(ctx, () => {
          const v = this.getVerticesLocal();
          ctx.strokeStyle = '#0ea5a4';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(v[0].x, v[0].y);
          for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
          ctx.closePath();
          ctx.stroke();
          drawConstructionsForShape(ctx, this);
        });
        if (this.vertexNames) {
          const verts = this.getVerticesWorld();
          ctx.save();
          ctx.fillStyle = '#111';
          ctx.font = '14px Arial';
          verts.forEach((p, i) => {
            const s = worldToScreen(p.x, p.y);
            ctx.fillText(this.vertexNames[i] || '', s.x + 6, s.y - 6);
          });
          ctx.restore();
        }
        if (this.selected) this.drawSelection(ctx);
      }
      hitTest(wx, wy) {
        const v = this.getVerticesWorld();
        let inside = true;
        for (let i = 0; i < v.length; i++) {
          const a = v[i], b = v[(i + 1) % v.length];
          if ((b.x - a.x) * (wy - a.y) - (b.y - a.y) * (wx - a.x) < 0) {
            inside = false; break;
          }
        }
        return inside;
      }
      getBoundingBox() {
        const v = this.getVerticesWorld();
        const xs = v.map(p => p.x), ys = v.map(p => p.y);
        return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      }
      drawSelection(ctx) {
        const v = this.getVerticesWorld().map(p => worldToScreen(p.x, p.y));
        ctx.save();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(v[0].x, v[0].y);
        for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    }

    /* ====== Trapezoid ====== */
    class TrapezoidShape extends Shape {
      constructor(x, y, top = 100, bottom = 180, height = 100) {
        super(x, y);
        this.top = top;
        this.bottom = bottom;
        this.height = height;
        this.vertexNames = ['A', 'B', 'C', 'D'];
      }
      getVerticesLocal() {
        const halfH = this.height / 2;
        return [
          { x: -this.bottom / 2, y:  halfH },
          { x:  this.bottom / 2, y:  halfH },
          { x:  this.top / 2,    y: -halfH },
          { x: -this.top / 2,    y: -halfH }
        ];
      }
      getVerticesWorld() {
        const v = this.getVerticesLocal();
        const cos = Math.cos(this.rotation), sin = Math.sin(this.rotation);
        return v.map(p => {
          const rx = p.x * this.scale, ry = p.y * this.scale;
          return { x: this.x + rx * cos - ry * sin, y: this.y - rx * sin - ry * cos };
        });
      }
      draw(ctx) {
        this.applyTransform(ctx, () => {
          const v = this.getVerticesLocal();
          ctx.strokeStyle = '#8b5cf6';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(v[0].x, v[0].y);
          for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
          ctx.closePath();
          ctx.stroke();
          drawConstructionsForShape(ctx, this);
        });
        if (this.vertexNames) {
          const verts = this.getVerticesWorld();
          ctx.save();
          ctx.fillStyle = '#111';
          ctx.font = '14px Arial';
          verts.forEach((p, i) => {
            const s = worldToScreen(p.x, p.y);
            ctx.fillText(this.vertexNames[i] || '', s.x + 6, s.y - 6);
          });
          ctx.restore();
        }
        if (this.selected) this.drawSelection(ctx);
      }
      hitTest(wx, wy) {
        const v = this.getVerticesWorld();
        let inside = true;
        for (let i = 0; i < v.length; i++) {
          const a = v[i], b = v[(i + 1) % v.length];
          if ((b.x - a.x) * (wy - a.y) - (b.y - a.y) * (wx - a.x) < 0) {
            inside = false; break;
          }
        }
        return inside;
      }
      getBoundingBox() {
        const v = this.getVerticesWorld();
        const xs = v.map(p => p.x), ys = v.map(p => p.y);
        return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      }
      drawSelection(ctx) {
        const v = this.getVerticesWorld().map(p => worldToScreen(p.x, p.y));
        ctx.save();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(v[0].x, v[0].y);
        for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    }

    /* ====== Polygon ====== */
    class PolygonShape extends Shape {
      constructor(x, y, radius = 80, sides = 5) {
        super(x, y);
        this.radius = radius;
        this.sides = Math.max(3, sides | 0);
        this.vertexNames = Array.from({ length: this.sides }, (_, i) => String.fromCharCode(65 + i));
      }
      getVerticesLocal() {
        const v = [];
        for (let i = 0; i < this.sides; i++) {
          const a = -Math.PI / 2 + i * 2 * Math.PI / this.sides;
          v.push({ x: this.radius * Math.cos(a), y: this.radius * Math.sin(a) });
        }
        return v;
      }
      getVerticesWorld() {
        const v = this.getVerticesLocal();
        const cos = Math.cos(this.rotation), sin = Math.sin(this.rotation);
        return v.map(p => {
          const rx = p.x * this.scale, ry = p.y * this.scale;
          return { x: this.x + rx * cos - ry * sin, y: this.y - rx * sin - ry * cos };
        });
      }
      draw(ctx) {
        this.applyTransform(ctx, () => {
          const v = this.getVerticesLocal();
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(v[0].x, v[0].y);
          for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
          ctx.closePath();
          ctx.stroke();
          drawConstructionsForShape(ctx, this);
        });
        if (this.vertexNames) {
          const verts = this.getVerticesWorld();
          ctx.save();
          ctx.fillStyle = '#111';
          ctx.font = '14px Arial';
          verts.forEach((p, i) => {
            const s = worldToScreen(p.x, p.y);
            ctx.fillText(this.vertexNames[i] || '', s.x + 6, s.y - 6);
          });
          ctx.restore();
        }
        if (this.selected) this.drawSelection(ctx);
      }
      hitTest(wx, wy) {
        const v = this.getVerticesWorld();
        let inside = false;
        for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
          const xi = v[i].x, yi = v[i].y;
          const xj = v[j].x, yj = v[j].y;
          const intersect = ((yi > wy) !== (yj > wy)) && (wx < (xj - xi) * (wy - yi) / (yj - yi) + xi);
          if (intersect) inside = !inside;
        }
        return inside;
      }
      getBoundingBox() {
        const v = this.getVerticesWorld();
        const xs = v.map(p => p.x), ys = v.map(p => p.y);
        return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      }
      drawSelection(ctx) {
        const box = this.getBoundingBox();
        const p1 = worldToScreen(box.x, box.y);
        const p2 = worldToScreen(box.x + box.w, box.y + box.h);
        ctx.save();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(p1.x - 4, p1.y - 4, (p2.x - p1.x) + 8, (p2.y - p1.y) + 8);
        ctx.restore();
      }
    }

    /* ====== Arrow head helper ====== */
    function drawArrowHead(ctx, x1, y1, x2, y2) {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const size = 10;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle || '#000';
      ctx.fill();
    }

    /* ====== Line ====== */
    class LineShape extends Shape {
      constructor(x, y, angle = -Math.PI / 2, cells = LINE_CELLS) {
        super(x, y);
        this.angle = angle;
        this.cells = cells;
      }
      draw(ctx) {
        this.applyTransform(ctx, () => {
          const len = this.cells * GRID_STEP * 4; // делаем прямую длинной через всё поле
          const ang = this.angle;
          const dx = Math.cos(ang) * len / 2;
          const dy = Math.sin(ang) * len / 2;
          ctx.strokeStyle = '#6b7280';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-dx, -dy);
          ctx.lineTo(dx, dy);
          ctx.stroke();
          drawConstructionsForShape(ctx, this);
        });
        if (this.selected) this.drawSelection(ctx);
      }
      hitTest(wx, wy) {
        const lenWorld = this.cells * GRID_STEP * 4 * this.scale;
        const ang = this.angle + (this.rotation || 0);
        const dx = Math.cos(ang), dy = Math.sin(ang);
        const ax = this.x - dx * lenWorld / 2, ay = this.y - dy * lenWorld / 2;
        const bx = this.x + dx * lenWorld / 2, by = this.y + dy * lenWorld / 2;
        const vx = bx - ax, vy = by - ay;
        const t = ((wx - ax) * vx + (wy - ay) * vy) / (vx * vx + vy * vy);
        const tt = Math.max(0, Math.min(1, t));
        const cx = ax + vx * tt, cy = ay + vy * tt;
        const threshold = Math.max(8, 12 * this.scale);
        return Math.hypot(wx - cx, wy - cy) <= threshold;
      }
      drawSelection(ctx) {
        const lenWorld = this.cells * GRID_STEP * this.scale;
        const ang = this.angle + (this.rotation || 0);
        const dx = Math.cos(ang) * lenWorld / 2, dy = Math.sin(ang) * lenWorld / 2;
        const p1 = worldToScreen(this.x - dx, this.y - dy);
        const p2 = worldToScreen(this.x + dx, this.y + dy);
        ctx.save();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.restore();
      }
      getBoundingBox() {
        const lenWorld = this.cells * GRID_STEP * this.scale;
        const ang = this.angle + (this.rotation || 0);
        const dx = Math.cos(ang) * lenWorld / 2, dy = Math.sin(ang) * lenWorld / 2;
        const p1 = { x: this.x - dx, y: this.y - dy };
        const p2 = { x: this.x + dx, y: this.y + dy };
        return { x: Math.min(p1.x, p2.x) - 12, y: Math.min(p1.y, p2.y) - 12, w: Math.abs(p2.x - p1.x) + 24, h: Math.abs(p2.y - p1.y) + 24 };
      }
    }

    /* ====== Ray ====== */
    class RayShape extends Shape {
      constructor(x, y, angle = -Math.PI / 2, cells = LINE_CELLS) {
        super(x, y);
        this.angle = angle;
        this.cells = cells;
      }
      draw(ctx) {
        this.applyTransform(ctx, () => {
          const len = this.cells * GRID_STEP * 4; // длинный луч для наглядного построения
          const ang = this.angle;
          const dx = Math.cos(ang) * len;
          const dy = Math.sin(ang) * len;
          ctx.strokeStyle = '#6b7280';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(dx, dy);
          ctx.stroke();
          drawArrowHead(ctx, 0, 0, dx, dy);
          drawConstructionsForShape(ctx, this);
        });
        if (this.selected) this.drawSelection(ctx);
      }
      hitTest(wx, wy) {
        const lenWorld = this.cells * GRID_STEP * 4 * this.scale;
        const ang = this.angle + (this.rotation || 0);
        const dx = Math.cos(ang), dy = Math.sin(ang);
        const vx = wx - this.x, vy = wy - this.y;
        const along = vx * dx + vy * dy;
        const perp = Math.abs(vx * (-dy) + vy * dx);
        const threshold = Math.max(10, 14 * this.scale);
        return along >= -threshold && along <= lenWorld + threshold && perp <= threshold;
      }
      drawSelection(ctx) {
        const lenWorld = this.cells * GRID_STEP * this.scale;
        const ang = this.angle + (this.rotation || 0);
        const p1 = worldToScreen(this.x, this.y);
        const p2 = worldToScreen(this.x + Math.cos(ang) * lenWorld, this.y + Math.sin(ang) * lenWorld);
        ctx.save();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.restore();
      }
      getBoundingBox() {
        const lenWorld = this.cells * GRID_STEP * this.scale;
        const ang = this.angle + (this.rotation || 0);
        const p1 = { x: this.x, y: this.y };
        const p2 = { x: this.x + Math.cos(ang) * lenWorld, y: this.y + Math.sin(ang) * lenWorld };
        return { x: Math.min(p1.x, p2.x) - 12, y: Math.min(p1.y, p2.y) - 12, w: Math.abs(p2.x - p1.x) + 24, h: Math.abs(p2.y - p1.y) + 24 };
      }
    }

    /* ====== Segment ====== */
    class SegmentShape extends Shape {
      constructor(x, y, length = GRID_STEP * LINE_CELLS * 1.2, angle = 0) {
        super(x, y);
        this.length = length;
        this.rotation = angle;
      }
      draw(ctx) {
        this.applyTransform(ctx, () => {
          const half = this.length / 2;
          ctx.strokeStyle = '#6b7280';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(-half, 0);
          ctx.lineTo(half, 0);
          ctx.stroke();
          drawConstructionsForShape(ctx, this);
        });
        if (this.selected) this.drawSelection(ctx);
      }
      hitTest(wx, wy) {
        const cos = Math.cos(this.rotation), sin = Math.sin(this.rotation);
        const half = (this.length * this.scale) / 2;
        const ax = this.x - half * cos, ay = this.y - half * sin;
        const bx = this.x + half * cos, by = this.y + half * sin;
        const vx = bx - ax, vy = by - ay;
        const t = ((wx - ax) * vx + (wy - ay) * vy) / (vx * vx + vy * vy);
        const tt = Math.max(0, Math.min(1, t));
        const cx = ax + vx * tt, cy = ay + vy * tt;
        const threshold = Math.max(10, 12 * this.scale);
        return Math.hypot(wx - cx, wy - cy) <= threshold;
      }
      getBoundingBox() {
        const cos = Math.cos(this.rotation), sin = Math.sin(this.rotation);
        const half = (this.length * this.scale) / 2;
        const p1 = { x: this.x - half * cos, y: this.y - half * sin };
        const p2 = { x: this.x + half * cos, y: this.y + half * sin };
        return { x: Math.min(p1.x, p2.x) - 12, y: Math.min(p1.y, p2.y) - 12, w: Math.abs(p2.x - p1.x) + 24, h: Math.abs(p2.y - p1.y) + 24 };
      }
      drawSelection(ctx) {
        this.applyTransform(ctx, () => {
          const half = (this.length * this.scale) / 2;
          ctx.save();
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.moveTo(-half, 0);
          ctx.lineTo(half, 0);
          ctx.stroke();
          ctx.restore();
        });
      }
    }

    /* ====== Angle ====== */
    class AngleShape extends Shape {
      constructor(x, y, angleDeg = 60, baseAngle = 0) {
        super(x, y);
        this.angle = angleDeg * Math.PI / 180;
        this.base = baseAngle; // начальный луч (угол в математической системе, Y вверх)
        this.len = 140;
      }
      getVerticesWorld() {
        // Удлиняем лучи для уверенного выбора/построений (не влияя на отрисовку)
        const lenPick = this.len * this.scale * 3;
        const mathA1 = this.base;
        const mathA2 = this.base + this.angle;
        const local = [
          { x: 0, y: 0 },
          { x: Math.cos(mathA1) * lenPick, y: -Math.sin(mathA1) * lenPick },
          { x: Math.cos(mathA2) * lenPick, y: -Math.sin(mathA2) * lenPick }
        ];
        const cosR = Math.cos(this.rotation), sinR = Math.sin(this.rotation);
        return local.map(p => ({
          x: this.x + p.x * cosR - p.y * sinR,
          y: this.y - (p.x * sinR + p.y * cosR)
        }));
      }
      draw(ctx) {
        this.applyTransform(ctx, () => {
          const len = this.len;
          const mathA1 = this.base;
          const mathA2 = this.base + this.angle;
          const p1x = Math.cos(mathA1) * len;
          const p1y = -Math.sin(mathA1) * len;
          const p2x = Math.cos(mathA2) * len;
          const p2y = -Math.sin(mathA2) * len;
          ctx.strokeStyle = '#7c3aed';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(p1x, p1y);
          ctx.moveTo(0, 0);
          ctx.lineTo(p2x, p2y);
          ctx.stroke();
          const arcR = Math.min(40, len * 0.3);
          const canvasA1 = -mathA1;
          const canvasA2 = -mathA2;
          ctx.beginPath();
          ctx.arc(0, 0, arcR, canvasA1, canvasA2, true);
          ctx.stroke();
          const midMathAngle = mathA1 + this.angle / 2;
          const labelR = arcR + 12;
          ctx.fillStyle = '#7c3aed';
          ctx.font = 'italic 14px Arial';
          ctx.fillText('α', Math.cos(midMathAngle) * labelR - 5, -Math.sin(midMathAngle) * labelR + 5);
          drawConstructionsForShape(ctx, this);
        });
        if (this.selected) this.drawSelection(ctx);
      }
      hitTest(wx, wy) {
        const local = this.worldToLocal({ x: wx, y: wy });
        const lx = local.x, ly = local.y;
        const r = Math.hypot(lx, ly);
        if (r > this.len * this.scale + 20) return false;
        const ang = Math.atan2(ly, lx);
        const mathAng = -ang;
        const base = this.base;
        const angle = this.angle;
        let normAng = mathAng;
        while (normAng < base) normAng += 2 * Math.PI;
        while (normAng >= base + 2 * Math.PI) normAng -= 2 * Math.PI;
        return normAng >= base - 1e-6 && normAng <= base + angle + 1e-6;
      }
      drawSelection(ctx) {
        const verts = this.getVerticesWorld().map(p => worldToScreen(p.x, p.y));
        ctx.save();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(verts[0].x, verts[0].y);
        ctx.lineTo(verts[1].x, verts[1].y);
        ctx.lineTo(verts[2].x, verts[2].y);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
      getBoundingBox() {
        const v = this.getVerticesWorld();
        const xs = v.map(p => p.x), ys = v.map(p => p.y);
        return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      }
    }

    /* ====== Vector ====== */
    class VectorShape extends Shape {
      constructor(x, y, vx = 80, vy = 40) {
        super(x, y);
        this.vx = vx;
        this.vy = vy;
      }
      draw(ctx) {
        this.applyTransform(ctx, () => {
          ctx.strokeStyle = '#0ea5a4';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(this.vx, this.vy);
          ctx.stroke();
          drawArrowHead(ctx, 0, 0, this.vx, this.vy);
          drawConstructionsForShape(ctx, this);
        });
        if (this.selected) this.drawSelection(ctx);
      }
      hitTest(wx, wy) {
        const ax = this.x, ay = this.y;
        const bx = this.x + this.vx * this.scale, by = this.y + this.vy * this.scale;
        const vx = bx - ax, vy = by - ay;
        const t = ((wx - ax) * vx + (wy - ay) * vy) / (vx * vx + vy * vy);
        const tt = Math.max(0, Math.min(1, t));
        const cx = ax + vx * tt, cy = ay + vy * tt;
        return Math.hypot(wx - cx, wy - cy) <= 10;
      }
      drawSelection(ctx) {
        const p1 = worldToScreen(this.x, this.y);
        const p2 = worldToScreen(this.x + this.vx * this.scale, this.y + this.vy * this.scale);
        ctx.save();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.restore();
      }
      getBoundingBox() {
        const p1 = { x: this.x, y: this.y };
        const p2 = { x: this.x + this.vx * this.scale, y: this.y + this.vy * this.scale };
        return { x: Math.min(p1.x, p2.x) - 12, y: Math.min(p1.y, p2.y) - 12, w: Math.abs(p2.x - p1.x) + 24, h: Math.abs(p2.y - p1.y) + 24 };
      }
    }

    /* ====== 3D placeholder shapes ====== */
    class CylinderShape extends Shape {
      constructor(x, y, radius = 50, height = 80) {
        super(x, y);
        this.radius = radius;
        this.height = height;
        this.vertexNames = ['A', 'B'];
      }
      getVerticesWorld() {
        return [
          { x: this.x, y: this.y - this.height * this.scale / 2 },
          { x: this.x, y: this.y + this.height * this.scale / 2 }
        ];
      }
      draw(ctx) {
        this.applyTransform(ctx, () => {
          const r = this.radius;
          const h = this.height;
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 2/this.scale;
          ctx.beginPath();
          ctx.ellipse(0, -h/2, r, r/3, 0, 0, Math.PI*2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-r, -h/2);
          ctx.lineTo(-r, h/2);
          ctx.lineTo(r, h/2);
          ctx.lineTo(r, -h/2);
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(0, h/2, r, r/3, 0, 0, Math.PI*2);
          ctx.stroke();
          drawConstructionsForShape(ctx, this);
        });
        if (this.vertexNames) {
          const verts = this.getVerticesWorld();
          ctx.save();
          ctx.fillStyle = '#111';
          ctx.font = '14px Arial';
          verts.forEach((p, i) => {
            const s = worldToScreen(p.x, p.y);
            ctx.fillText(this.vertexNames[i] || '', s.x + 6, s.y - 6);
          });
          ctx.restore();
        }
        if (this.selected) this.drawSelection(ctx);
      }
      hitTest(wx, wy) {
        const local = this.worldToLocal({x: wx, y: wy});
        const r = this.radius;
        const h = this.height;
        const lx = local.x, ly = local.y;
        const topY = h/2;
        const baseRy = r / 3;
        if (Math.abs(ly - topY) <= baseRy) {
          const distX = Math.abs(lx) / r;
          const distY = Math.abs(ly - topY) / baseRy;
          if (distX*distX + distY*distY <= 1) return true;
        }
        const bottomY = -h/2;
        if (Math.abs(ly - bottomY) <= baseRy) {
          const distX = Math.abs(lx) / r;
          const distY = Math.abs(ly - bottomY) / baseRy;
          if (distX*distX + distY*distY <= 1) return true;
        }
        if (ly >= -h/2 && ly <= h/2 && Math.abs(lx) <= r) return true;
        return false;
      }
      projectToSurface(wx, wy) {
        const local = this.worldToLocal({x: wx, y: wy});
        let lx = local.x, ly = local.y;
        const r = this.radius;
        const h = this.height;
        ly = Math.max(-h/2, Math.min(h/2, ly));
        const dist = Math.abs(lx);
        if (dist > r) { lx = (lx / dist) * r; }
        return this.localToWorld({x: lx, y: ly});
      }
      getBoundingBox() {
        const r = this.radius * this.scale;
        const h = this.height * this.scale;
        return { x: this.x - r - 10, y: this.y - h/2 - 10, w: 2*r + 20, h: h + 20 };
      }
      drawSelection(ctx) {
        const box = this.getBoundingBox();
        const p1 = worldToScreen(box.x, box.y);
        const p2 = worldToScreen(box.x + box.w, box.y + box.h);
        ctx.save();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(p1.x - 4, p1.y - 4, (p2.x - p1.x) + 8, (p2.y - p1.y) + 8);
        ctx.restore();
      }
    }

    class PyramidShape extends Shape {
      constructor(x, y, size = 120) {
        super(x, y);
        this.size = size;
        this.vertexNames = ['A', 'B'];
      }
      getVerticesWorld() {
        return [
          { x: this.x, y: this.y - this.size * this.scale / 2 },
          { x: this.x, y: this.y + this.size * this.scale / 4 }
        ];
      }
      draw(ctx) {
        this.applyTransform(ctx, () => {
          const s = this.size;
          const baseY = s / 2;
          const apexY = -s / 2;
          const halfBase = s / 2;
          const depth = halfBase / 2;
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 3 / this.scale;
          ctx.beginPath();
          ctx.moveTo(-halfBase, baseY);
          ctx.lineTo(halfBase, baseY);
          ctx.lineTo(halfBase + depth, baseY + depth);
          ctx.lineTo(-halfBase + depth, baseY + depth);
          ctx.closePath();
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, apexY);
          ctx.lineTo(-halfBase, baseY);
          ctx.moveTo(0, apexY);
          ctx.lineTo(halfBase, baseY);
          ctx.moveTo(0, apexY);
          ctx.lineTo(halfBase + depth, baseY + depth);
          ctx.moveTo(0, apexY);
          ctx.lineTo(-halfBase + depth, baseY + depth);
          ctx.stroke();
          drawConstructionsForShape(ctx, this);
        });
        if (this.vertexNames) {
          const verts = this.getVerticesWorld();
          ctx.save();
          ctx.fillStyle = '#111';
          ctx.font = '14px Arial';
          verts.forEach((p, i) => {
            const s = worldToScreen(p.x, p.y);
            ctx.fillText(this.vertexNames[i] || '', s.x + 6, s.y - 6);
          });
          ctx.restore();
        }
        if (this.selected) this.drawSelection(ctx);
      }
      hitTest(wx, wy) {
        const local = this.worldToLocal({x: wx, y: wy});
        const s = this.size;
        const apexY = -s/2;
        const baseY = s/4;
        const halfBase = s/4;
        const depth = halfBase / 2;
        const basePoints = [
          {x: -halfBase, y: baseY},
          {x: halfBase, y: baseY},
          {x: halfBase + depth, y: baseY + depth},
          {x: -halfBase + depth, y: baseY + depth}
        ];
        if (pointInPolygon(local, basePoints)) return true;
        const apex = {x: 0, y: apexY};
        for (let i = 0; i < 4; i++) {
          const p1 = basePoints[i];
          const p2 = basePoints[(i+1)%4];
          if (pointInTriangle(local, apex, p1, p2)) return true;
        }
        return false;
      }
      projectToSurface(wx, wy) {
        const local = this.worldToLocal({x: wx, y: wy});
        let lx = local.x, ly = local.y;
        const s = this.size;
        const dist = Math.hypot(lx, ly);
        if (dist > s/2) { lx = (lx / dist) * (s/2); ly = (ly / dist) * (s/2); }
        return this.localToWorld({x: lx, y: ly});
      }
      getBoundingBox() {
        const s = this.size * this.scale;
        const extra = s * 0.6;
        return { x: this.x - s/2 - extra, y: this.y - s/2 - extra, w: s + 2*extra, h: s + 2*extra };
      }
      drawSelection(ctx) {
        const box = this.getBoundingBox();
        const p1 = worldToScreen(box.x, box.y);
        const p2 = worldToScreen(box.x + box.w, box.y + box.h);
        ctx.save();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(p1.x - 4, p1.y - 4, (p2.x - p1.x) + 8, (p2.y - p1.y) + 8);
        ctx.restore();
      }
    }

    class ConeShape extends Shape {
      constructor(x, y, radius = 50, height = 90) {
        super(x, y);
        this.radius = radius;
        this.height = height;
        this.vertexNames = ['A', 'B'];
      }
      getVerticesWorld() {
        return [
          { x: this.x, y: this.y - this.height * this.scale / 2 },
          { x: this.x, y: this.y + this.height * this.scale / 4 }
        ];
      }
      draw(ctx) {
        this.applyTransform(ctx, () => {
          const r = this.radius;
          const h = this.height;
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 3 / this.scale;
          ctx.beginPath();
          ctx.ellipse(0, h/2, r, r/3, 0, 0, Math.PI*2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, -h/2);
          ctx.lineTo(-r, h/2);
          ctx.moveTo(0, -h/2);
          ctx.lineTo(r, h/2);
          ctx.stroke();
          drawConstructionsForShape(ctx, this);
        });
        if (this.vertexNames) {
          const verts = this.getVerticesWorld();
          ctx.save();
          ctx.fillStyle = '#111';
          ctx.font = '14px Arial';
          verts.forEach((p, i) => {
            const s = worldToScreen(p.x, p.y);
            ctx.fillText(this.vertexNames[i] || '', s.x + 6, s.y - 6);
          });
          ctx.restore();
        }
        if (this.selected) this.drawSelection(ctx);
      }
      hitTest(wx, wy) {
        const local = this.worldToLocal({x: wx, y: wy});
        const r = this.radius;
        const h = this.height;
        const lx = local.x, ly = local.y;
        const baseY = h/2;
        const baseRy = r / 3;
        if (Math.abs(ly - baseY) <= baseRy) {
          const distX = Math.abs(lx) / r;
          const distY = Math.abs(ly - baseY) / baseRy;
          if (distX*distX + distY*distY <= 1) return true;
        }
        if (ly <= h/2 && ly >= -h/2) {
          const radiusAtY = r * (h/2 - ly) / h;
          if (Math.abs(lx) <= radiusAtY + 2) return true;
        }
        if (Math.hypot(lx, ly + h/2) <= 5) return true;
        return false;
      }
      projectToSurface(wx, wy) {
        const local = this.worldToLocal({x: wx, y: wy});
        let lx = local.x, ly = local.y;
        const r = this.radius;
        const h = this.height;
        ly = Math.max(-h/2, Math.min(h/2, ly));
        const maxR = r * (ly + h/2) / h;
        const dist = Math.abs(lx);
        if (dist > maxR) { lx = (lx / dist) * maxR; }
        return this.localToWorld({x: lx, y: ly});
      }
      getBoundingBox() {
        const r = this.radius * this.scale;
        const h = this.height * this.scale;
        return { x: this.x - r - 10, y: this.y - h/2 - 10, w: 2*r + 20, h: h + 20 };
      }
      drawSelection(ctx) {
        const box = this.getBoundingBox();
        const p1 = worldToScreen(box.x, box.y);
        const p2 = worldToScreen(box.x + box.w, box.y + box.h);
        ctx.save();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(p1.x - 4, p1.y - 4, (p2.x - p1.x) + 8, (p2.y - p1.y) + 8);
        ctx.restore();
      }
    }

    class TriangularPrismShape extends Shape {
      constructor(x, y, size = 120) {
        super(x, y);
        this.size = size;
        this.vertexNames = ['A', 'B'];
      }
      getVerticesWorld() {
        return [
          { x: this.x, y: this.y - this.size * this.scale / 4 },
          { x: this.x, y: this.y + this.size * this.scale / 4 }
        ];
      }
      draw(ctx) {
        this.applyTransform(ctx, () => {
          const s = this.size;
          ctx.strokeStyle = '#8b5cf6';
          ctx.lineWidth = 3/this.scale;
          const offset = s * 0.3;
          const p2 = { x: offset, y: -offset };
          ctx.beginPath();
          ctx.moveTo(0, -s/2);
          ctx.lineTo(-s/2, s/2);
          ctx.lineTo(s/2, s/2);
          ctx.closePath();
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(p2.x, p2.y - s/2);
          ctx.lineTo(p2.x - s/2, p2.y + s/2);
          ctx.lineTo(p2.x + s/2, p2.y + s/2);
          ctx.closePath();
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, -s/2);
          ctx.lineTo(p2.x, p2.y - s/2);
          ctx.moveTo(-s/2, s/2);
          ctx.lineTo(p2.x - s/2, p2.y + s/2);
          ctx.moveTo(s/2, s/2);
          ctx.lineTo(p2.x + s/2, p2.y + s/2);
          ctx.stroke();
          drawConstructionsForShape(ctx, this);
        });
        if (this.vertexNames) {
          const verts = this.getVerticesWorld();
          ctx.save();
          ctx.fillStyle = '#111';
          ctx.font = '14px Arial';
          verts.forEach((p, i) => {
            const s = worldToScreen(p.x, p.y);
            ctx.fillText(this.vertexNames[i] || '', s.x + 6, s.y - 6);
          });
          ctx.restore();
        }
        if (this.selected) this.drawSelection(ctx);
      }
      hitTest(wx, wy) {
        const local = this.worldToLocal({x: wx, y: wy});
        const s = this.size;
        const offset = s * 0.3;
        const p2 = { x: offset, y: -offset };
        const frontBase = [{x: 0, y: -s/2}, {x: -s/2, y: s/2}, {x: s/2, y: s/2}];
        if (pointInTriangle(local, frontBase[0], frontBase[1], frontBase[2])) return true;
        const backBase = [{x: p2.x, y: p2.y - s/2}, {x: p2.x - s/2, y: p2.y + s/2}, {x: p2.x + s/2, y: p2.y + s/2}];
        if (pointInTriangle(local, backBase[0], backBase[1], backBase[2])) return true;
        if (Math.abs(local.x) <= s/2 + offset && Math.abs(local.y) <= s/2 + offset) return true;
        return false;
      }
      projectToSurface(wx, wy) {
        const local = this.worldToLocal({x: wx, y: wy});
        let lx = local.x, ly = local.y;
        const s = this.size;
        lx = Math.max(-s/2, Math.min(s/2, lx));
        ly = Math.max(-s/2, Math.min(s/2, ly));
        return this.localToWorld({x: lx, y: ly});
      }
      getBoundingBox() {
        const s = this.size*this.scale;
        const extra = s*0.35;
        return { x: this.x - s/2 - 10, y: this.y - s/2 - extra - 10, w: s + 20 + extra, h: s + 20 + extra };
      }
      drawSelection(ctx) {
        const box = this.getBoundingBox();
        const p1 = worldToScreen(box.x, box.y);
        const p2 = worldToScreen(box.x + box.w, box.y + box.h);
        ctx.save();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(p1.x - 4, p1.y - 4, (p2.x - p1.x) + 8, (p2.y - p1.y) + 8);
        ctx.restore();
      }
    }

    class InclinedParallelogramShape extends ParallelogramShape {
      constructor(x, y, base = 160, side = 100, skew = 40) {
        super(x, y, base, side, skew);
      }
      draw(ctx) {
        ctx.save();
        this.rotation += Math.PI / 20;
        super.draw(ctx);
        this.rotation -= Math.PI / 20;
      }
    }

    /* ====== Construction helpers ====== */

    /**
     * Находит пересечение луча (от точки p в направлении dir) с отрезком [a, b].
     * Возвращает параметр t (расстояние вдоль луча) и точку пересечения.
     */
    function raySegmentIntersect(p, dir, a, b) {
      // Параметрическое уравнение: p + t*dir = a + s*(b-a)
      const dx = b.x - a.x, dy = b.y - a.y;
      const denom = dir.x * dy - dir.y * dx;
      if (Math.abs(denom) < 1e-10) return null; // параллельны
      const s = ((p.x - a.x) * dir.y - (p.y - a.y) * dir.x) / denom;
      const t = ((p.x - a.x) * dy - (p.y - a.y) * dx) / denom;
      if (s < -1e-9 || s > 1 + 1e-9) return null; // вне отрезка
      // Разрешаем отрицательные t (для обратного направления)
      // if (t < 1e-9) return null; // позади начала луча
      return { t, point: { x: p.x + t * dir.x, y: p.y + t * dir.y } };
    }

    /**
     * Находит точку пересечения прямой, заданной точкой p и направлением dir,
     * с границей полигона (вершины verts - мировые координаты).
     * Ищет ближайшее пересечение в направлении dir (t > 0) и -dir (t < 0).
     * Возвращает { forward, backward } - точки пересечения.
     */
    function linePolyIntersections(p, dir, verts) {
      const results = [];
      const n = verts.length;
      for (let i = 0; i < n; i++) {
        const a = verts[i], b = verts[(i + 1) % n];
        const res = raySegmentIntersect(p, dir, a, b);
        if (res) results.push(res);
        const res2 = raySegmentIntersect(p, { x: -dir.x, y: -dir.y }, a, b);
        if (res2) results.push({ t: -res2.t, point: res2.point });
      }
      // фильтруем почти дубликаты
      results.sort((a, b) => a.t - b.t);
      // Убираем дубли
      const unique = [];
      for (const r of results) {
        if (!unique.some(u => Math.hypot(u.point.x - r.point.x, u.point.y - r.point.y) < 1e-6)) {
          unique.push(r);
        }
      }
      return unique;
    }

    /**
     * Медиана треугольника или полигона: из вершины i до середины противоположной стороны.
     * Для треугольника: из verts[i] до середины отрезка [verts[(i+1)%3], verts[(i+2)%3]].
     * Для полигона: из verts[i] до середины противоположной стороны (i + n/2).
     * Для окружности: из точки на окружности до центра.
     */
    function buildMedian(shape, anchorIndex) {
      // Для окружности — медиана от точки на окружности до центра
      if (shape instanceof CircleShape) {
        const verts = shape.getVerticesWorld();
        const i = anchorIndex !== undefined ? ((anchorIndex % verts.length) + verts.length) % verts.length : 1;
        const pointOnCircle = verts[i];
        const center = { x: shape.x, y: shape.y };
        return { 
          type: 'median', 
          from: shape.worldToLocal(pointOnCircle), 
          to: shape.worldToLocal(center),
          meta: { description: 'От точки на окружности до центра' }
        };
      }
      
      const verts = shape.getVerticesWorld();
      const n = verts.length;
      if (n < 2) return null;
      
      const i = ((anchorIndex % n) + n) % n;
      const vertex = verts[i];

      let mid = null;
      
      if (shape instanceof AngleShape && n >= 3) {
        // Для угла — медиана к середине между концами лучей
        mid = midpoint(verts[1], verts[2]);
      } else if (n === 3) {
        // Треугольник — классическая медиана
        const j = (i + 1) % 3;
        const k = (i + 2) % 3;
        mid = midpoint(verts[j], verts[k]);
      } else if (n >= 4) {
        // Многоугольник — к середине противоположной стороны
        const oppIdx = (i + Math.floor(n / 2)) % n;
        const oppNext = (oppIdx + 1) % n;
        mid = midpoint(verts[oppIdx], verts[oppNext]);
      }
      
      if (!mid) return null;
      return { 
        type: 'median', 
        from: shape.worldToLocal(vertex), 
        to: shape.worldToLocal(mid),
        meta: { 
          vertexIndex: i,
          description: `Из вершины ${i + 1}`
        }
      };
    }

    /**
     * Биссектриса: из вершины i. По теореме о биссектрисе, биссектриса из B делит
     * противоположную сторону AC в отношении AB:BC. Нам нужно найти точку пересечения
     * биссектрисы с противоположной стороной.
     *
     * Для полигона: биссектриса угла при вершине i пересекает фигуру - находим пересечение
     * биссекторного луча с границей фигуры.
     * 
     * Для окружности: биссектриса из точки на окружности проходит через центр.
     */
    function buildBisector(shape, anchorIndex) {
      // Для окружности — биссектриса из точки через центр
      if (shape instanceof CircleShape) {
        const verts = shape.getVerticesWorld();
        const i = anchorIndex !== undefined ? ((anchorIndex % verts.length) + verts.length) % verts.length : 1;
        const pointOnCircle = verts[i];
        const center = { x: shape.x, y: shape.y };
        
        // Направление от точки через центр
        const dir = norm(sub(center, pointOnCircle));
        const endPoint = add(pointOnCircle, mul(dir, shape.r * shape.scale * 2));
        
        return { 
          type: 'bisector', 
          from: shape.worldToLocal(pointOnCircle), 
          to: shape.worldToLocal(endPoint),
          meta: { description: 'Биссектриса из точки на окружности', passesThroughCenter: true }
        };
      }
      
      const verts = shape.getVerticesWorld();
      const n = verts.length;
      if (n < 2) return null;
      
      const i = ((anchorIndex % n) + n) % n;
      const B = verts[i];
      const A = verts[(i - 1 + n) % n];
      const C = verts[(i + 1) % n];

      // Векторы лучей угла
      const v1 = norm({ x: A.x - B.x, y: A.y - B.y });
      const v2 = norm({ x: C.x - B.x, y: C.y - B.y });
      
      if (!isFinite(v1.x) || !isFinite(v1.y) || !isFinite(v2.x) || !isFinite(v2.y)) {
        // Вырожденный случай — точки совпадают
        return null;
      }

      // Направление биссектрисы
      let bisDir = norm({ x: v1.x + v2.x, y: v1.y + v2.y });
      if (Math.hypot(bisDir.x, bisDir.y) < 1e-9) {
        // Лучи антипараллельны: берём перпендикуляр к v1
        bisDir = perp(v1);
      }

      let endPoint = null;
      
      // Ищем пересечение биссектрисного луча с границей фигуры
      if (n >= 3) {
        const intersections = linePolyIntersections(B, bisDir, verts);
        for (const inter of intersections) {
          if (inter.t > 1e-6 && Math.hypot(inter.point.x - B.x, inter.point.y - B.y) > 1e-4) {
            endPoint = inter.point;
            break;
          }
        }
      }

      // Fallback: теорема о биссектрисе для треугольника или прямое усечение луча
      if (!endPoint) {
        if (n === 3) {
          // Для треугольника используем теорему о биссектрисе
          const AB = Math.hypot(A.x - B.x, A.y - B.y);
          const BC = Math.hypot(C.x - B.x, C.y - B.y);
          const t = AB / (AB + BC);
          if (isFinite(t) && t >= 0 && t <= 1) {
            endPoint = { x: A.x + t * (C.x - A.x), y: A.y + t * (C.y - A.y) };
          }
        }
        
        // Если всё ещё нет точки — ограничиваем длиной диагонали канваса
        if (!endPoint) {
          const clampLen = getCanvasDiag() * 0.8;
          endPoint = { x: B.x + bisDir.x * clampLen, y: B.y + bisDir.y * clampLen };
        }
      }

      return { 
        type: 'bisector', 
        from: shape.worldToLocal(B), 
        to: shape.worldToLocal(endPoint),
        meta: {
          vertexIndex: i,
          description: `Из вершины ${i + 1}`,
          angleDeg: (Math.acos(Math.max(-1, Math.min(1, v1.x * v2.x + v1.y * v2.y))) * 180 / Math.PI).toFixed(1)
        }
      };
    }

    /**
     * Серединный перпендикуляр к стороне [pA, pB].
     * Проходит через середину отрезка, перпендикулярен ему.
     * Ограничивается границей фигуры (если есть), иначе длиной отрезка * 1.5.
     */
    function buildPerpBisector(pA, pB, shape) {
      const midP = midpoint(pA, pB);
      const d = sub(pB, pA);
      const sideLen = Math.hypot(d.x, d.y);
      const dir = norm(perp(d));

      let from, to;

      // Если у фигуры есть вершины, ограничиваем перпендикуляр границей фигуры
      if (shape && typeof shape.getVerticesWorld === 'function') {
        const verts = shape.getVerticesWorld();
        const intersections = linePolyIntersections(midP, dir, verts);
        // Берём ближайшую точку вперёд и назад
        const forward = intersections.filter(r => r.t > 1e-6).sort((a, b) => a.t - b.t)[0];
        const backward = intersections.filter(r => r.t < -1e-6).sort((a, b) => b.t - a.t)[0];

        if (forward && backward) {
          from = backward.point;
          to = forward.point;
        } else {
          // fallback: длина = длина стороны
          from = add(midP, mul(dir, -sideLen / 2));
          to = add(midP, mul(dir, sideLen / 2));
        }
      } else {
        from = add(midP, mul(dir, -sideLen / 2));
        to = add(midP, mul(dir, sideLen / 2));
      }

      return {
        type: 'perpBisector',
        from: shape.worldToLocal(from),
        to: shape.worldToLocal(to),
        meta: { a: shape.worldToLocal(pA), b: shape.worldToLocal(pB), mid: shape.worldToLocal(midP) }
      };
    }

    /**
     * Прямая через 2 точки, ограниченная границей фигуры.
     */
    function buildLineThrough(pA, pB, shape) {
      const d = sub(pB, pA);
      const dir = norm(d);

      let from, to;

      if (shape && typeof shape.getVerticesWorld === 'function') {
        // особый случай: если shape — CircleShape, ограничиваем прямую диаметром окружности
        if (shape instanceof CircleShape) {
          const center = { x: shape.x, y: shape.y };
          const radius = shape.r * shape.scale;
          const bbLen = Math.max(radius * 2, getCanvasDiag());
          from = add(center, mul(dir, -bbLen));
          to = add(center, mul(dir, bbLen));
          return {
            type: 'line',
            from: shape.worldToLocal(from),
            to: shape.worldToLocal(to),
            meta: { a: shape.worldToLocal(pA), b: shape.worldToLocal(pB) }
          };
        }
        const verts = shape.getVerticesWorld();
        // Находим все пересечения прямой (бесконечной) с полигоном
        const intersections = [];
        const n = verts.length;
        for (let i = 0; i < n; i++) {
          const a = verts[i], b = verts[(i + 1) % n];
          // Параметрическое уравнение: pA + t*dir = a + s*(b-a)
          const dx = b.x - a.x, dy = b.y - a.y;
          const denom = dir.x * dy - dir.y * dx;
          if (Math.abs(denom) < 1e-10) continue; // параллельны
          const s = ((pA.x - a.x) * dir.y - (pA.y - a.y) * dir.x) / denom;
          const t = ((pA.x - a.x) * dy - (pA.y - a.y) * dx) / denom;
          if (s < -1e-9 || s > 1 + 1e-9) continue; // вне отрезка
          intersections.push({ t, point: { x: pA.x + t * dir.x, y: pA.y + t * dir.y } });
        }
        // Убираем дубли
        const unique = [];
        for (const inter of intersections) {
          if (!unique.some(u => Math.hypot(u.point.x - inter.point.x, u.point.y - inter.point.y) < 1e-6)) {
            unique.push(inter);
          }
        }
        // Если есть хотя бы два пересечения, берём минимальное и максимальное t
        if (unique.length >= 2) {
          unique.sort((a, b) => a.t - b.t);
          from = unique[0].point;
          to = unique[unique.length - 1].point;
        } else if (unique.length === 1) {
          // Одно пересечение (касание) - используем точку pA как вторую
          from = pA;
          to = unique[0].point;
        } else {
          // Нет пересечений (прямая не пересекает полигон) - строим через две точки с удлинением по диагонали канвы
          const bb = shape.getBoundingBox();
          const bbLen = Math.max(Math.hypot(bb.w, bb.h), getCanvasDiag());
          from = add(pA, mul(dir, -bbLen));
          to = add(pA, mul(dir, bbLen));
        }
        // дополнительно ограничиваем итоговую линию диагональю канвы, чтобы не «съезжало» на больших масштабах
        const clampLen = getCanvasDiag();
        const center = midpoint(from, to);
        const dirClamp = norm(sub(to, from));
        from = add(center, mul(dirClamp, -clampLen));
        to = add(center, mul(dirClamp, clampLen));
      } else {
        // Нет вершин: строим через два известных конца
        from = pA;
        to = pB;
      }

      return {
        type: 'line',
        from: shape.worldToLocal(from),
        to: shape.worldToLocal(to),
        meta: { a: shape.worldToLocal(pA), b: shape.worldToLocal(pB) }
      };
    }

    /**
     * Параллельная прямая к ребру [edgeA, edgeB] через точку throughPoint,
     * ограниченная границей фигуры.
     */
    function buildParallelToEdge(edgeA, edgeB, throughPoint, shape) {
      const d = sub(edgeB, edgeA);
      const dir = norm(d);

      let from, to;

      if (shape && typeof shape.getVerticesWorld === 'function') {
        const verts = shape.getVerticesWorld();
        const intersections = linePolyIntersections(throughPoint, dir, verts);
        const forward = intersections.filter(r => r.t > 1e-6).sort((a, b) => a.t - b.t)[0];
        const backward = intersections.filter(r => r.t < -1e-6).sort((a, b) => b.t - a.t)[0];

        if (forward && backward) {
          from = backward.point;
          to = forward.point;
        } else {
          const sideLen = Math.max(Math.hypot(d.x, d.y), getCanvasDiag());
          from = add(throughPoint, mul(dir, -sideLen / 2));
          to = add(throughPoint, mul(dir, sideLen / 2));
        }
      } else {
        const sideLen = Math.hypot(d.x, d.y);
        from = add(throughPoint, mul(dir, -sideLen / 2));
        to = add(throughPoint, mul(dir, sideLen / 2));
      }

      return {
        type: 'parallel',
        from: shape.worldToLocal(from),
        to: shape.worldToLocal(to),
        meta: { edgeA: shape.worldToLocal(edgeA), edgeB: shape.worldToLocal(edgeB), through: shape.worldToLocal(throughPoint) }
      };
    }

    function buildSection(points, shape) {
      if (points.length < 3) return null;
      // Просто сохраняем точки как есть
      return [{ type: 'section', points: points, meta: {} }];
    }

    function drawConstruction(ctx, cons) {
      ctx.save();
      ctx.strokeStyle = '#e63946';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      if (cons.type === 'section' && cons.points) {
        ctx.beginPath();
        ctx.moveTo(cons.points[0].x, cons.points[0].y);
        for (let i = 1; i < cons.points.length; i++) { ctx.lineTo(cons.points[i].x, cons.points[i].y); }
        ctx.closePath();
        ctx.fillStyle = 'rgba(230, 57, 70, 0.18)';
        ctx.fill();
        ctx.stroke();
        // Точки сечения
        ctx.setLineDash([]);
        ctx.fillStyle = '#e63946';
        cons.points.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); });
      } else if (cons.from && cons.to) {
        ctx.beginPath();
        ctx.moveTo(cons.from.x, cons.from.y);
        ctx.lineTo(cons.to.x, cons.to.y);
        ctx.stroke();
        // Маленькие квадратики на концах (как в учебнике)
        ctx.setLineDash([]);
        ctx.fillStyle = '#e63946';
        [cons.from, cons.to].forEach(p => {
          ctx.beginPath();
          ctx.rect(p.x - 3, p.y - 3, 6, 6);
          ctx.fill();
        });
        // Если есть метаданные средней точки (для серединного перпендикуляра), рисуем знак |
        if (cons.meta && cons.meta.mid) {
          const mx = cons.meta.mid.x, my = cons.meta.mid.y;
          ctx.strokeStyle = '#e63946';
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }
    function drawConstructionsForShape(ctx, shape) {
      if (!shape.constructions) return;
      for (const c of shape.constructions) { try { drawConstruction(ctx, c); } catch (e) {} }
    }
    function ensureConstructions(shape) { if (!shape.constructions) shape.constructions = []; }

    /* ====== State ====== */
    const shapes = [];
    let activeShape = null;
    let dragOffset = { x: 0, y: 0 };
    let rayBound = getCanvasDiag() * 2;
    let activeHandle = null;
    let isMouseDown = false;
    let constructionMode = false;
    let constructionType = null;
    let constructionTemp = { points: [] };
    let is3DMode = false;
    let hoveredVertex = null; // { shape, vertexIndex, screenPos } для hover-подсветки
    let hoveredEdge = null; // { shape, edgeIndex, points: [a, b] } для hover-подсветки рёбер
    let currentMousePos = { x: 0, y: 0 }; // текущая позиция мыши в мировых координатах
    const figuresWithVertices = [TriangleShape, RectShape, SquareShape, RhombusShape, ParallelogramShape, TrapezoidShape, PolygonShape, AngleShape];

    /* ====== UI log (toast) ====== */
    const logPanel = document.createElement('div');
    Object.assign(logPanel.style, {
      position: 'fixed', right: '12px', top: '12px',
      maxWidth: '320px', background: 'rgba(0,0,0,0.78)', color: '#fff',
      padding: '10px 12px', borderRadius: '10px',
      fontSize: '12px', lineHeight: '1.4', zIndex: 9999,
      pointerEvents: 'none', maxHeight: '44vh', overflow: 'hidden'
    });
    const logList = document.createElement('div');
    logPanel.appendChild(logList);
    document.body.appendChild(logPanel);
    function uiLog(msg) {
      const row = document.createElement('div');
      row.textContent = msg;
      row.style.marginBottom = '4px';
      row.style.opacity = '0';
      row.style.transition = 'opacity 0.2s ease';
      logList.prepend(row);
      requestAnimationFrame(() => { row.style.opacity = '1'; });
      while (logList.children.length > 7) logList.removeChild(logList.lastChild);
      setTimeout(() => {
        row.style.opacity = '0';
        setTimeout(() => row.remove(), 200);
      }, 4000);
    }
    const origInfo = console.info.bind(console);
    console.info = (...args) => { origInfo(...args); uiLog(args.join(' ')); };
    const origError = console.error.bind(console);
    console.error = (...args) => { origError(...args); uiLog('Ошибка: ' + args.join(' ')); };

    /* ====== Update menus based on mode ====== */
    function updateFigureMenu() {
      const figureMenu = document.getElementById('figureMenu');
      if (!figureMenu) return;
      const items2D = [
        { type: 'point', label: 'Точка' }, { type: 'line', label: 'Прямая' }, { type: 'ray', label: 'Луч' },
        { type: 'segment', label: 'Отрезок' }, { type: 'angle', label: 'Угол' }, { type: 'triangle', label: 'Треугольник' },
        { type: 'rect', label: 'Прямоугольник' }, { type: 'square', label: 'Квадрат' }, { type: 'rhombus', label: 'Ромб' },
        { type: 'circle', label: 'Окружность' }, { type: 'parallelogram', label: 'Параллелограмм' },
        { type: 'trapezoid', label: 'Трапеция' }, { type: 'polygon', label: 'Многоугольник' }, { type: 'vector', label: 'Вектор' }
      ];
      const items3D = [
        { type: 'cylinder', label: 'Цилиндр' }, { type: 'pyramid', label: 'Пирамида' },
        { type: 'cone', label: 'Конус' }, { type: 'triangularPrism', label: 'Треугольная призма' }
      ];
      const items = is3DMode ? items3D : items2D;
      figureMenu.innerHTML = items.map(item => `<button class="figure-item" data-type="${item.type}" type="button">${item.label}</button>`).join('');
    }
    function updateToolsMenu() {
      const toolsMenu = document.getElementById('toolsMenu');
      if (!toolsMenu) return;
      const items2D = [
        { type: 'median', label: 'Медиана' }, { type: 'bisector', label: 'Биссектриса (из вершины)' },
        { type: 'perpBisector', label: 'Перпендикулярный биссектор (по 2 точкам)' },
        { type: 'line', label: 'Прямая (по 2 точкам)' }, { type: 'parallel', label: 'Параллельная (ребро + точка)' }
      ];
      const items3D = [{ type: 'section', label: 'Сечение' }];
      const items = is3DMode ? items3D : items2D;
      toolsMenu.innerHTML = items.map(item => `<button class="tool-item" data-construction="${item.type}" type="button">${item.label}</button>`).join('');
    }

    /* ====== Helpers: find vertex or edge point ====== */
    function findVertexOrEdgePoint(clientX, clientY, shape) {
      if (!shape) return null;
      const sc = screenToCanvas(clientX, clientY);
      const w = screenToWorld(clientX, clientY);

      // Для сечения — возвращаем ТОЧНО место клика!
      if (constructionType === 'section') {
        // Для 3D фигур — ищем вершины/рёбра но возвращаем место клика если не нашли
        if (shape instanceof CylinderShape || shape instanceof PyramidShape || 
            shape instanceof ConeShape || shape instanceof TriangularPrismShape) {
          const verts = shape.getVerticesWorld();
          let best = { d: Infinity, point: null };
          
          // На телефоне увеличенные пороги
          const isMobile = window.innerWidth <= 1023;
          const vertexThreshold = isMobile ? 80 : 60;
          const edgeThreshold = isMobile ? 60 : 40;

          // Ищем ближайшую вершину
          for (let i = 0; i < verts.length; i++) {
            const s = worldToScreen(verts[i].x, verts[i].y);
            const d = Math.hypot(sc.x - s.x, sc.y - s.y);
            if (d < best.d && d <= vertexThreshold) {
              best = { d, point: verts[i], isVertex: true };
            }
          }

          // Ищем ближайшее ребро
          if (shape.edges) {
            for (const edge of shape.edges) {
              const v1 = verts[edge[0]], v2 = verts[edge[1]];
              const s1 = worldToScreen(v1.x, v1.y), s2 = worldToScreen(v2.x, v2.y);
              const dist = pointToSegmentDistance(sc.x, sc.y, s1, s2);
              if (dist < best.d && dist <= edgeThreshold) {
                const dx = v2.x - v1.x, dy = v2.y - v1.y;
                const len2 = dx * dx + dy * dy;
                let t = ((sc.x - s1.x) * dx + (sc.y - s1.y) * dy) / len2;
                t = Math.max(0, Math.min(1, t));
                best = { d: dist, point: { x: v1.x + t * dx, y: v1.y + t * dy }, isEdge: true };
              }
            }
          }

          // Если нашли вершину или ребро — возвращаем их
          if (best.point) {
            return { point: best.point, vertexIndex: null, edge: null };
          }
          // Если не нашли — возвращаем ТОЧНО место клика в мире
          return { point: w, vertexIndex: null, edge: null };
        }
        // Для 2D — просто место клика
        return { point: w, vertexIndex: null, edge: null };
      }

      // Для 2D фигур
      if (typeof shape.getVerticesWorld === 'function') {
        const verts = shape.getVerticesWorld();
        let bestV = { d: Infinity, idx: -1 };
        for (let i = 0; i < verts.length; i++) {
          const s = worldToScreen(verts[i].x, verts[i].y);
          const d = Math.hypot(sc.x - s.x, sc.y - s.y);
          if (d < bestV.d) bestV = { d, idx: i };
        }
        if (bestV.d <= getVertexPickThreshold() * 1.2) {
          return { point: verts[bestV.idx], vertexIndex: bestV.idx, edge: null };
        }
        let bestEdge = { d: Infinity, aIdx: -1, bIdx: -1, proj: null };
        for (let i = 0; i < verts.length; i++) {
          const a = verts[i], b = verts[(i + 1) % verts.length];
          const sa = worldToScreen(a.x, a.y), sb = worldToScreen(b.x, b.y);
          const vx = sb.x - sa.x, vy = sb.y - sa.y;
          const denom = (vx * vx + vy * vy) || 1;
          const t = ((sc.x - sa.x) * vx + (sc.y - sa.y) * vy) / denom;
          const tt = Math.max(0, Math.min(1, t));
          const px = sa.x + vx * tt, py = sa.y + vy * tt;
          const d = Math.hypot(sc.x - px, sc.y - py);
          if (d < bestEdge.d) {
            bestEdge = { d, aIdx: i, bIdx: (i + 1) % verts.length, proj: { x: a.x + (b.x - a.x) * tt, y: a.y + (b.y - a.y) * tt } };
          }
        }
        if (bestEdge.proj && bestEdge.d <= getEdgePickThreshold() * 1.2) {
          return { point: bestEdge.proj, vertexIndex: null, edge: { aIdx: bestEdge.aIdx, bIdx: bestEdge.bIdx } };
        }
        if (constructionMode && bestV.idx >= 0) {
          return { point: verts[bestV.idx], vertexIndex: bestV.idx, edge: null };
        }
      }
      return { point: w, vertexIndex: null, edge: null };
    }
    
    /**
     * Найти ближайшую вершину фигуры к точке клика
     * @returns { shape, vertexIndex, point, distance } или null
     */
    function findNearestVertex(clientX, clientY, shape) {
      if (!shape || typeof shape.getVerticesWorld !== 'function') return null;
      const sc = screenToCanvas(clientX, clientY);
      const verts = shape.getVerticesWorld();
      let best = { d: Infinity, idx: -1 };
      
      for (let i = 0; i < verts.length; i++) {
        const s = worldToScreen(verts[i].x, verts[i].y);
        const d = Math.hypot(sc.x - s.x, sc.y - s.y);
        if (d < best.d) best = { d, idx: i };
      }
      
      if (best.idx >= 0) {
        return {
          shape,
          vertexIndex: best.idx,
          point: verts[best.idx],
          distance: best.d
        };
      }
      return null;
    }

    /* ====== Create shapes by type ====== */
    function createShapeByType(type) {
      switch (type) {
        case 'point': return new PointShape(0, 0);
        case 'circle': return new CircleShape(0, 0, 60);
        case 'rect': return new RectShape(0, 0, 180, 120);
        case 'square': return new SquareShape(0, 0, 140);
        case 'triangle': return new TriangleShape(0, 0, 140);
        case 'rhombus': return new RhombusShape(0, 0, 160, 100);
        case 'parallelogram': return new ParallelogramShape(0, 0, 160, 100, 40);
        case 'trapezoid': return new TrapezoidShape(0, 0, 100, 180, 100);
        case 'polygon': return new PolygonShape(0, 0, 80, 5);
        case 'square3d': return new SquareShape(0, 0, 120);
        case 'circle3d': return new CircleShape(0, 0, 60);
        case 'cylinder': return new CylinderShape(0, 0, 50, 80);
        case 'parallelogram3d': return new InclinedParallelogramShape(0, 0, 160, 100, 60);
        case 'pyramid': return new PyramidShape(0, 0, 120);
        case 'cone': return new ConeShape(0, 0, 50, 90);
        case 'triangularPrism': return new TriangularPrismShape(0, 0, 110);
        case 'line': return new LineShape(0, 0, -Math.PI / 2, LINE_CELLS);
        case 'ray': return new RayShape(0, 0, -Math.PI / 2, LINE_CELLS);
        case 'segment': return new SegmentShape(0, 0, GRID_STEP * LINE_CELLS, 0);
        case 'angle': return new AngleShape(0, 0, 60, -Math.PI / 2);
        case 'vector': return new VectorShape(0, 0, 80, 40);
        default:
          console.warn('Неизвестный тип фигуры:', type);
          return new PointShape(0, 0);
      }
    }

    /* ====== Render loop ====== */
    function drawHandles(shape) {
      const box = shape.getBoundingBox();
      const p1 = worldToScreen(box.x, box.y);
      const p2 = worldToScreen(box.x + box.w, box.y + box.h);
      const handles = [
        { x: p1.x, y: p1.y, type: 'scale-nw' },
        { x: p2.x, y: p1.y, type: 'scale-ne' },
        { x: p2.x, y: p2.y, type: 'scale-se' },
        { x: p1.x, y: p2.y, type: 'scale-sw' }
      ];
      const midTop = { x: (p1.x + p2.x) / 2, y: p1.y - 30 };
      handles.push({ x: midTop.x, y: midTop.y, type: 'rotate' });
      ctx.save();
      ctx.fillStyle = '#1e90ff';
      handles.forEach(h => { ctx.beginPath(); ctx.arc(h.x, h.y, 8, 0, Math.PI * 2); ctx.fill(); });
      ctx.restore();
      shape._handles = handles;
    }
    function render() {
      drawGrid();
      
      // Отрисовка всех фигур
      for (const s of shapes) { try { s.draw(ctx); } catch (e) {} }
      
      // Hover-подсветка рёбер (когда курсор над ребром)
      if (hoveredEdge && !constructionMode) {
        ctx.save();
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.9)'; // зелёный для hover
        ctx.lineWidth = 4;
        const { screenA, screenB } = hoveredEdge;
        ctx.beginPath();
        ctx.moveTo(screenA.x, screenA.y);
        ctx.lineTo(screenB.x, screenB.y);
        ctx.stroke();
        ctx.restore();
      }
      
      // Hover-подсветка вершин (когда курсор над вершиной)
      if (hoveredVertex && !constructionMode) {
        ctx.save();
        ctx.fillStyle = 'rgba(34, 197, 94, 0.9)'; // зелёный для hover
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        const { screenPos } = hoveredVertex;
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      
      // Подсветка вершин активной фигуры (для удобства выбора)
      if (activeShape && typeof activeShape.getVerticesWorld === 'function') {
        const verts = activeShape.getVerticesWorld();
        ctx.save();
        ctx.fillStyle = 'rgba(30, 144, 255, 0.7)';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        for (const v of verts) {
          const s = worldToScreen(v.x, v.y);
          ctx.beginPath();
          ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }
      
      // Ручки трансформации
      if (activeShape) drawHandles(activeShape);
      
      // Точки построений в режиме construction + линии между ними
      if (constructionMode && constructionTemp.points.length > 0) {
        ctx.save();
        ctx.fillStyle = '#ff0000';
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        
        // Рисуем линии между точками построений
        if (constructionTemp.points.length >= 2) {
          ctx.setLineDash([8, 4]);
          ctx.beginPath();
          const first = worldToScreen(constructionTemp.points[0].point.x, constructionTemp.points[0].point.y);
          ctx.moveTo(first.x, first.y);
          for (let i = 1; i < constructionTemp.points.length; i++) {
            const p = worldToScreen(constructionTemp.points[i].point.x, constructionTemp.points[i].point.y);
            ctx.lineTo(p.x, p.y);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }
        
        // Рисуем линию от последней точки до курсора (призрак)
        if (constructionTemp.points.length >= 1) {
          const last = constructionTemp.points[constructionTemp.points.length - 1];
          const lastScreen = worldToScreen(last.point.x, last.point.y);
          const cursorScreen = worldToScreen(currentMousePos.x, currentMousePos.y);
          
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(lastScreen.x, lastScreen.y);
          ctx.lineTo(cursorScreen.x, cursorScreen.y);
          ctx.stroke();
          ctx.restore();
          
          // Подсказка рядом с курсором
          ctx.save();
          ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
          ctx.font = '12px Arial';
          const nextNum = constructionTemp.points.length + 1;
          let hintText = '';
          if (constructionType === 'median' || constructionType === 'bisector') {
            hintText = '✓ Вершина';
          } else if (constructionType === 'perpBisector' || constructionType === 'line') {
            hintText = `Точка ${nextNum}`;
          } else if (constructionType === 'parallel') {
            hintText = constructionTemp.points[0].edge ? 'Точка на фигуре' : 'Ребро';
          } else if (constructionType === 'section') {
            hintText = `Точка ${nextNum} на поверхности`;
          }
          ctx.fillText(hintText, cursorScreen.x + 15, cursorScreen.y - 15);
          ctx.restore();
        }
        
        // Рисуем точки
        constructionTemp.points.forEach((p, idx) => {
          const s = worldToScreen(p.point.x, p.point.y);
          
          // Если это вершина — рисуем больший круг
          const isVertex = p.vertexIndex !== null && p.vertexIndex !== undefined;
          const radius = isVertex ? 11 : 8;
          
          ctx.beginPath();
          ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
          ctx.fillStyle = isVertex ? 'rgba(239, 68, 68, 0.9)' : 'rgba(255, 0, 0, 0.7)';
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();
          
          // Номер точки
          ctx.fillStyle = '#000';
          ctx.font = 'bold 13px Arial';
          ctx.fillText((idx + 1).toString(), s.x + 14, s.y - 14);
        });
        ctx.restore();
        
        // Подсветка вершины, если выбрана для построения
        if (constructionType === 'median' || constructionType === 'bisector') {
          const last = constructionTemp.points[constructionTemp.points.length - 1];
          if (last.vertexIndex !== null && last.vertexIndex !== undefined) {
            const s = worldToScreen(last.point.x, last.point.y);
            ctx.save();
            ctx.strokeStyle = 'rgba(34, 197, 94, 0.9)';
            ctx.lineWidth = 3;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.arc(s.x, s.y, 16, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
      
      requestAnimationFrame(render);
    }

    /* ====== Pointer events ====== */
    canvasEl.addEventListener('pointerdown', (e) => {
      // Не блокируем событие по умолчанию для мобильных — это мешает скроллу
      const isMobile = window.innerWidth <= 1023;
      if (!isMobile) {
        e.preventDefault();
      }
      try { canvasEl.setPointerCapture(e.pointerId); } catch (_) {}
      isMouseDown = true;
      const w = screenToWorld(e.clientX, e.clientY);
      const sc = screenToCanvas(e.clientX, e.clientY);
      
      // 1) Сначала проверяем ручки трансформации
      if (activeShape && activeShape._handles) {
        for (const h of activeShape._handles) {
          if (Math.hypot(sc.x - h.x, sc.y - h.y) < 14) { 
            activeHandle = h; 
            return; 
          }
        }
      }
      
      // 2) Режим построений
      if (constructionMode) {
        if (!activeShape) {
          console.info('Сначала выберите фигуру для построения.');
          return;
        }
        ensureConstructions(activeShape);
        const found = findVertexOrEdgePoint(e.clientX, e.clientY, activeShape);

        // Для сечений — просто добавляем точки
        if (constructionType === 'section') {
          if (found && found.point) {
            constructionTemp.points.push(found);
            console.info(`Точка ${constructionTemp.points.length}/3 поставлена`);
            
            // Если 3 точки — строим сечение
            if (constructionTemp.points.length >= 3) {
              const points = constructionTemp.points.map(p => p.point);
              const cons = buildSection(points, activeShape);
              if (cons) {
                cons.forEach(c => { c.id = uid('cons'); activeShape.constructions.push(c); });
                constructionTemp.points = [];
                constructionMode = false;
                constructionType = null;
                updatePropsPanel && updatePropsPanel(activeShape);
                console.info('Сечение построено!');
              }
            }
          } else {
            console.info('Кликните по 3D фигуре!');
          }
          return;
        }

        // Для медианы/биссектрисы — привязка к вершине
        if (found && found.vertexIndex === null && typeof activeShape.getVerticesWorld === 'function') {
          const verts = activeShape.getVerticesWorld();
          let best = { d: Infinity, idx: -1 };
          verts.forEach((v, i) => {
            const s = worldToScreen(v.x, v.y);
            const d = Math.hypot(sc.x - s.x, sc.y - s.y);
            if (d < best.d) best = { d, idx: i };
          });
          if (best.d <= getVertexPickThreshold()) {
            found.vertexIndex = best.idx;
            found.point = verts[best.idx];
            found.edge = null;
          }
        }

        if (!found) return;
        constructionTemp.points.push(found);

        // Для медианы/биссектрисы — принудительно ищем вершину (даже если клик далеко)
        if ((constructionType === 'median' || constructionType === 'bisector') && typeof activeShape.getVerticesWorld === 'function') {
          const verts = activeShape.getVerticesWorld();
          const last = constructionTemp.points[constructionTemp.points.length - 1];
          
          // Всегда привязываемся к ближайшей вершине для медианы/биссектрисы
          let best = { d: Infinity, idx: 0 };
          verts.forEach((v, i) => {
            const d = Math.hypot(last.point.x - v.x, last.point.y - v.y);
            if (d < best.d) best = { d, idx: i };
          });
          
          // Для мобильных — ещё более щедрая привязка
          const maxDist = window.innerWidth <= 1023 ? getVertexPickThreshold() * 2 : getVertexPickThreshold() * 1.5;
          if (best.d < maxDist) {
            last.vertexIndex = best.idx;
            last.point = verts[best.idx];
            last.edge = null;
          } else {
            // Если всё равно далеко — всё равно берём ближайшую вершину (для удобства)
            last.vertexIndex = best.idx;
            last.point = verts[best.idx];
            last.edge = null;
            console.info(`Привязка к вершине ${best.idx + 1}`);
          }
        }

        // Разрешаем построения для всех фигур с вершинами
        const okForBuild = typeof activeShape.getVerticesWorld === 'function';
        if (!okForBuild) {
          console.info('Построения доступны для фигур с вершинами (треугольник, многоугольник, угол и т.д.).');
          constructionTemp.points = [];
          constructionMode = false;
          constructionType = null;
          return;
        }

        // Если выбрано "прямая" или "луч" как фигура, запрещаем строить на них построения
        if (activeShape instanceof LineShape || activeShape instanceof RayShape) {
          console.info('Построения на бесконечных линиях/лучах отключены. Выберите многоугольную фигуру или угол.');
          constructionTemp.points = [];
          constructionMode = false;
          constructionType = null;
          return;
        }

        // Для угла — особая логика
        if (activeShape instanceof AngleShape) {
          const rep = findVertexOrEdgePoint(e.clientX, e.clientY, activeShape);
          if (rep) {
            constructionTemp.points.pop();
            constructionTemp.points.push(rep);
          }
          if (constructionTemp.points.length === 1) {
            console.info('Выберите вторую точку на луче для построения.');
          }
          if (constructionTemp.points.length === 2 && (constructionType === 'median' || constructionType === 'bisector')) {
            console.info('Для угла медиана/биссектриса: кликните по вершине (основание угла).');
          }
        }

        // Обработка по типу построения
        if (constructionType === 'median') {
          const last = constructionTemp.points[constructionTemp.points.length - 1];
          // Теперь медиана строится из любой вершины
          if (last.vertexIndex != null || (last.point && typeof activeShape.getVerticesWorld === 'function')) {
            // Если vertexIndex не установлен, но есть точка — используем ближайшую вершину
            let vertexIdx = last.vertexIndex;
            if (vertexIdx === null) {
              const verts = activeShape.getVerticesWorld();
              let best = { d: Infinity, idx: 0 };
              verts.forEach((v, i) => {
                const d = Math.hypot(last.point.x - v.x, last.point.y - v.y);
                if (d < best.d) best = { d, idx: i };
              });
              vertexIdx = best.idx;
            }
            
            const cons = buildMedian(activeShape, vertexIdx);
            if (cons) {
              cons.id = uid('cons');
              activeShape.constructions.push(cons);
              constructionTemp.points = [];
              constructionMode = false;
              constructionType = null;
              if (typeof updatePropsPanel === 'function') updatePropsPanel(activeShape);
              console.info('Медиана добавлена.');
            } else {
              console.info('Не удалось построить медиану.');
              constructionTemp.points.pop();
            }
          } else {
            console.info('Кликните по фигуре для построения медианы.');
            constructionTemp.points.pop();
          }
          return;
        }

        if (constructionType === 'bisector') {
          const last = constructionTemp.points[constructionTemp.points.length - 1];
          // Биссектриса из любой вершины
          if (last.vertexIndex != null || (last.point && typeof activeShape.getVerticesWorld === 'function')) {
            let vertexIdx = last.vertexIndex;
            if (vertexIdx === null) {
              const verts = activeShape.getVerticesWorld();
              let best = { d: Infinity, idx: 0 };
              verts.forEach((v, i) => {
                const d = Math.hypot(last.point.x - v.x, last.point.y - v.y);
                if (d < best.d) best = { d, idx: i };
              });
              vertexIdx = best.idx;
            }
            
            const cons = buildBisector(activeShape, vertexIdx);
            if (cons) {
              cons.id = uid('cons');
              activeShape.constructions.push(cons);
              constructionTemp.points = [];
              constructionMode = false;
              constructionType = null;
              if (typeof updatePropsPanel === 'function') updatePropsPanel(activeShape);
              console.info('Биссектриса добавлена.');
            } else {
              console.info('Не удалось построить биссектрису.');
              constructionTemp.points.pop();
            }
          } else {
            console.info('Кликните по фигуре для построения биссектрисы.');
            constructionTemp.points.pop();
          }
          return;
        }
        if (constructionType === 'perpBisector') {
          if (constructionTemp.points.length >= 2) {
            const pA = constructionTemp.points[0].point;
            const pB = constructionTemp.points[1].point;
            const cons = buildPerpBisector(pA, pB, activeShape);
            if (cons) {
              cons.id = uid('cons');
              activeShape.constructions.push(cons);
              constructionTemp.points = [];
              constructionMode = false;
              constructionType = null;
              if (typeof updatePropsPanel === 'function') updatePropsPanel(activeShape);
              console.info('Перпендикулярный биссектор добавлен.');
            } else {
              console.info('Не удалось построить перпендикулярный биссектор.');
              constructionTemp.points = [];
              constructionMode = false;
              constructionType = null;
            }
          } else { 
            console.info('Выберите вторую точку для перпендикулярного биссектора (кликните по двум точкам на фигуре).'); 
          }
          return;
        }
        if (constructionType === 'line') {
          if (constructionTemp.points.length >= 2) {
            const pA = constructionTemp.points[0].point;
            const pB = constructionTemp.points[1].point;
            const cons = buildLineThrough(pA, pB, activeShape);
            if (cons) {
              cons.id = uid('cons');
              activeShape.constructions.push(cons);
              constructionTemp.points = [];
              constructionMode = false;
              constructionType = null;
              if (typeof updatePropsPanel === 'function') updatePropsPanel(activeShape);
              console.info('Прямая добавлена.');
            } else {
              console.info('Не удалось построить прямую по двум точкам.');
              constructionTemp.points = [];
              constructionMode = false;
              constructionType = null;
            }
          } else { 
            console.info('Выберите вторую точку для прямой (кликните по двум точкам на фигуре).'); 
          }
          return;
        }
        if (constructionType === 'parallel') {
          if (constructionTemp.points.length === 1) {
            const first = constructionTemp.points[0];
            if (first.edge) { 
              console.info('Теперь кликните точку, через которую провести параллельную прямую.'); 
              return; 
            }
            else { 
              console.info('Для параллельной прямой сначала кликните по ребру (или рядом с ним).'); 
              constructionTemp.points = []; 
              return; 
            }
          } else if (constructionTemp.points.length >= 2) {
            const first = constructionTemp.points[0];
            const second = constructionTemp.points[1];
            if (first.edge) {
              const verts = activeShape.getVerticesWorld();
              const a = verts[first.edge.aIdx];
              const b = verts[first.edge.bIdx];
              const through = second.point;
              const cons = buildParallelToEdge(a, b, through, activeShape);
              if (cons) {
                cons.id = uid('cons');
                activeShape.constructions.push(cons);
                constructionTemp.points = [];
                constructionMode = false;
                constructionType = null;
                if (typeof updatePropsPanel === 'function') updatePropsPanel(activeShape);
                console.info('Параллельная прямая добавлена.');
              } else {
                console.info('Не удалось построить параллельную: проверьте выбор точек.');
                constructionTemp.points = [];
                constructionMode = false;
                constructionType = null;
              }
            } else { 
              console.info('Первый клик должен быть по ребру.'); 
              constructionTemp.points = []; 
            }
          }
          return;
        }
        if (constructionType === 'section') {
          if (constructionTemp.points.length >= 3) {
            const points = constructionTemp.points.map(p => p.point);
            const cons = buildSection(points, activeShape);
            if (cons) {
              cons.forEach(c => c.id = uid('cons'));
              activeShape.constructions.push(...cons);
              constructionTemp.points = [];
              constructionMode = false;
              constructionType = null;
              if (typeof updatePropsPanel === 'function') updatePropsPanel(activeShape);
              console.info('Сечение добавлено.');
            } else {
              console.info('Не удалось построить сечение: выберите три точки на поверхности фигуры.');
              constructionTemp.points = [];
              constructionMode = false;
              constructionType = null;
            }
          } else { console.info('Выберите третью точку для сечения.'); }
          return;
        }
        return;
      }
      // 3) Обычный выбор фигуры
      let hit = null;
      for (let i = shapes.length - 1; i >= 0; i--) {
        const s = shapes[i];
        let hitted = false;

        // hitTest
        try { if (typeof s.hitTest === 'function') hitted = !!s.hitTest(w.x, w.y); } catch (err) {}

        // Bounding box с большим padding (40px)
        if (!hitted) {
          try {
            if (typeof s.getBoundingBox === 'function') {
              const bb = s.getBoundingBox();
              const pad = 40;
              if (bb && !Number.isNaN(bb.x)) {
                if (w.x >= bb.x - pad && w.x <= bb.x + bb.w + pad &&
                    w.y >= bb.y - pad && w.y <= bb.y + bb.h + pad) {
                  hitted = true;
                }
              }
            }
          } catch (err) {}
        }

        // Вершины (50px)
        if (!hitted && typeof s.getVerticesWorld === 'function') {
          const verts = s.getVerticesWorld();
          for (const v of verts) {
            if (Math.hypot(w.x - v.x, w.y - v.y) <= 50) {
              hitted = true;
              break;
            }
          }
        }

        if (hitted) { hit = s; break; }
      }

      if (hit) {
        activeShape = hit;
        shapes.forEach(s => s.selected = false);
        activeShape.selected = true;
        activeShape.isDragging = true;
        dragOffset.x = w.x - activeShape.x;
        dragOffset.y = w.y - activeShape.y;
        const idx = shapes.indexOf(activeShape);
        if (idx >= 0) { shapes.splice(idx, 1); shapes.push(activeShape); }
        if (typeof updatePropsPanel === 'function') updatePropsPanel(activeShape);
      } else {
        shapes.forEach(s => s.selected = false);
        activeShape = null;
        if (typeof updatePropsPanel === 'function') updatePropsPanel(null);
      }
    });

    canvasEl.addEventListener('pointermove', (e) => {
      const w = screenToWorld(e.clientX, e.clientY);
      const sc = screenToCanvas(e.clientX, e.clientY);
      
      // Сохраняем текущую позицию мыши
      currentMousePos = w;
      
      // Обновляем hover-состояние вершин и рёбер (только когда не перетаскиваем)
      if (!isMouseDown && !constructionMode) {
        hoveredVertex = null;
        hoveredEdge = null;
        
        // Проверяем с конца (верхние фигуры приоритетнее)
        for (let i = shapes.length - 1; i >= 0; i--) {
          const s = shapes[i];
          if (typeof s.getVerticesWorld === 'function') {
            const verts = s.getVerticesWorld();
            
            // Проверяем вершины
            for (let j = 0; j < verts.length; j++) {
              const v = verts[j];
              const screenPos = worldToScreen(v.x, v.y);
              const dist = Math.hypot(sc.x - screenPos.x, sc.y - screenPos.y);
              if (dist <= getVertexPickThreshold()) {
                hoveredVertex = { shape: s, vertexIndex: j, screenPos };
                break;
              }
            }
            if (hoveredVertex) break;
            
            // Проверяем рёбра
            for (let j = 0; j < verts.length; j++) {
              const a = verts[j], b = verts[(j + 1) % verts.length];
              const sa = worldToScreen(a.x, a.y);
              const sb = worldToScreen(b.x, b.y);
              const vx = sb.x - sa.x, vy = sb.y - sa.y;
              const denom = (vx * vx + vy * vy) || 1;
              const t = ((sc.x - sa.x) * vx + (sc.y - sa.y) * vy) / denom;
              const tt = Math.max(0, Math.min(1, t));
              const px = sa.x + vx * tt, py = sa.y + vy * tt;
              const dist = Math.hypot(sc.x - px, sc.y - py);
              if (dist <= getEdgePickThreshold()) {
                hoveredEdge = { shape: s, edgeIndex: j, points: [a, b], screenA: sa, screenB: sb };
                break;
              }
            }
            if (hoveredEdge) break;
          }
        }
      }
      
      if (!isMouseDown) return;
      
      // Перетаскивание и трансформация
      if (activeHandle && activeShape) {
        if (activeHandle.type === 'rotate') {
          const ang = Math.atan2(w.y - activeShape.y, w.x - activeShape.x);
          activeShape.rotation = ang;
        } else {
          const dx = w.x - activeShape.x;
          const dy = w.y - activeShape.y;
          const dist = Math.hypot(dx, dy);
          activeShape.scale = Math.max(0.1, dist / 150);
        }
        if (typeof updatePropsPanel === 'function') updatePropsPanel(activeShape);
        return;
      }
      if (activeShape && activeShape.isDragging) {
        activeShape.x = w.x - dragOffset.x;
        activeShape.y = w.y - dragOffset.y;
        if (typeof updatePropsPanel === 'function') updatePropsPanel(activeShape);
      }
    });

    function endPointerInteraction(e) {
      try { canvasEl.releasePointerCapture && canvasEl.releasePointerCapture(e.pointerId); } catch (_) {}
      isMouseDown = false;
      if (activeShape) activeShape.isDragging = false;
      activeHandle = null;
      hoveredVertex = null;
      hoveredEdge = null;
    }
    canvasEl.addEventListener('pointerup', endPointerInteraction);
    canvasEl.addEventListener('pointercancel', endPointerInteraction);
    canvasEl.addEventListener('pointerleave', () => { 
      isMouseDown = false; 
      hoveredVertex = null; 
      hoveredEdge = null;
      if (activeShape) activeShape.isDragging = false;
    });

    /* ====== Menu wiring: create shapes ====== */
    // Подсказка для луча при создании
    function showRayHint() {
      const id = 'ray-hint-toast';
      if (document.getElementById(id)) return;
      const div = document.createElement('div');
      div.id = id;
      div.textContent = 'Луч меняется за основание: нажмите у начала луча и тяните, чтобы повернуть или изменить длину.';
      Object.assign(div.style, {
        position: 'fixed',
        right: '16px',
        bottom: '16px',
        background: '#111',
        color: '#fff',
        padding: '12px 14px',
        borderRadius: '8px',
        boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
        fontSize: '13px',
        lineHeight: '1.4',
        maxWidth: '320px',
        zIndex: 9999,
        opacity: 0,
        transition: 'opacity 0.25s ease'
      });
      document.body.appendChild(div);
      requestAnimationFrame(() => { div.style.opacity = '1'; });
      setTimeout(() => {
        div.style.opacity = '0';
        setTimeout(() => div.remove(), 350);
      }, 3400);
    }

    const figureMenu = document.getElementById('figureMenu');
    if (figureMenu) {
      figureMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        const btn = e.target.closest('.figure-item');
        if (!btn) return;
        const type = btn.dataset.type;
        const shape = createShapeByType(type);
        shape.x = 0; shape.y = 0;
        shapes.push(shape);
        shapes.forEach(s => s.selected = false);
        shape.selected = true;
        activeShape = shape;
        if (type === 'ray') showRayHint();
        if (typeof updatePropsPanel === 'function') updatePropsPanel(activeShape);
      });
    }

    /* ====== Tools wiring (toggle) ====== */
    const toolsMenu = document.getElementById('toolsMenu');
    if (toolsMenu) {
      toolsMenu.addEventListener('click', (e) => {
        const btn = e.target.closest('.tool-item');
        if (!btn) return;
        const type = btn.dataset.construction;
        if (constructionMode && constructionType === type) {
          constructionMode = false;
          constructionType = null;
          constructionTemp = { points: [] };
          console.info('Режим построения отменён:', type);
        } else {
          constructionMode = true;
          constructionType = type;
          constructionTemp = { points: [] };
          if (type === 'section') {
            alert('Для построения сечения выберите 3 точки на 3D фигуре. Сечение будет построено как линия через первую и третью точки.');
          }
          console.info('Режим построения включён:', type);
        }
      });
    }

    /* ====== Mode switch wiring ====== */
    const switchBtns = document.querySelectorAll('.switch-btn');
    switchBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        switchBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        is3DMode = btn.textContent.trim() === '3D';
        updateFigureMenu();
        updateToolsMenu();
        shapes.forEach(s => { s.constructions = []; });
        if (activeShape && typeof updatePropsPanel === 'function') updatePropsPanel(activeShape);
      });
    });

    // Initialize menus
    updateFigureMenu();
    updateToolsMenu();

    document.addEventListener('click', (e) => {
      const fm = document.getElementById('figureMenu');
      const tm = document.getElementById('toolsMenu');
      const fb = document.querySelector('.figure-btn');
      const tb = document.querySelector('.tools-btn');
      if (fm && !fm.contains(e.target) && fb && !fb.contains(e.target)) fm.classList.add('hidden');
      if (tm && !tm.contains(e.target) && tb && !tb.contains(e.target)) tm.classList.add('hidden');
    });

    /* ====== Keyboard ====== */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        if (constructionMode) {
          constructionMode = false;
          constructionType = null;
          constructionTemp = { points: [] };
          console.info('Режим построения отменён.');
          e.preventDefault();
          return;
        }
      }
      if (!activeShape) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const idx = shapes.indexOf(activeShape);
        if (idx >= 0) { shapes.splice(idx, 1); activeShape = null; if (typeof updatePropsPanel === 'function') updatePropsPanel(null); }
      } else if (e.key === 'r') {
        activeShape.rotation = 0;
        activeShape.scale = 1;
        if (typeof updatePropsPanel === 'function') updatePropsPanel(activeShape);
      } else if (e.key === 'ArrowUp') {
        activeShape.y += 5;
        if (typeof updatePropsPanel === 'function') updatePropsPanel(activeShape);
      } else if (e.key === 'ArrowDown') {
        activeShape.y -= 5;
        if (typeof updatePropsPanel === 'function') updatePropsPanel(activeShape);
      } else if (e.key === 'ArrowLeft') {
        activeShape.x -= 5;
        if (typeof updatePropsPanel === 'function') updatePropsPanel(activeShape);
      } else if (e.key === 'ArrowRight') {
        activeShape.x += 5;
        if (typeof updatePropsPanel === 'function') updatePropsPanel(activeShape);
      }
    });

    /* ====== Props panel ====== */
    (function propsModule() {
      const propsPanel = document.querySelector('.props-panel');
      if (!propsPanel) { window.updatePropsPanel = function () {}; return; }
      
      // Современный дизайн панели
      propsPanel.innerHTML = `
        <div class="props-header">
          <span class="props-title">📐 Свойства фигуры</span>
          <span class="props-shape-type" id="props-shape-type">—</span>
        </div>
        
        <!-- Быстрые действия -->
        <div class="props-actions">
          <div class="action-group">
            <span class="action-label">Масштаб</span>
            <div class="action-buttons">
              <button id="btn-scale-dec" class="prop-btn" type="button" title="Уменьшить">➖</button>
              <span id="prop-scale-value" class="prop-value">100%</span>
              <button id="btn-scale-inc" class="prop-btn" type="button" title="Увеличить">➕</button>
            </div>
          </div>
          <div class="action-group">
            <span class="action-label">Поворот</span>
            <div class="action-buttons">
              <button id="btn-rot-dec" class="prop-btn" type="button" title="Повернуть влево">⟲</button>
              <span id="prop-rot-value" class="prop-value">0°</span>
              <button id="btn-rot-inc" class="prop-btn" type="button" title="Повернуть вправо">⟳</button>
            </div>
          </div>
          <button id="prop-reset" class="prop-btn prop-btn-reset" type="button" title="Сбросить трансформацию">↺ Сброс</button>
        </div>
        
        <!-- Основная информация -->
        <div class="props-section">
          <div class="section-title">📊 Информация</div>
          <div id="prop-info" class="prop-info-grid"></div>
        </div>
        
        <!-- Построения -->
        <div class="props-section" id="constructions-section" style="display:none">
          <div class="section-title">⚙️ Построения <span id="constructions-count" class="badge">0</span></div>
          <div id="constructions-list" class="constructions-list"></div>
        </div>
        
        <!-- Специфичные настройки -->
        <div class="props-section" id="shape-specific-section" style="display:none">
          <div class="section-title">⚙️ Настройки</div>
          <div id="shape-specific" class="shape-specific"></div>
        </div>
        
        <!-- Подсказка -->
        <div class="props-hint">
          💡 <span id="prop-hint-text">Выберите фигуру на холсте</span>
        </div>
      `;
      
      const btnScaleDec = propsPanel.querySelector('#btn-scale-dec');
      const btnScaleInc = propsPanel.querySelector('#btn-scale-inc');
      const btnRotDec = propsPanel.querySelector('#btn-rot-dec');
      const btnRotInc = propsPanel.querySelector('#btn-rot-inc');
      const btnReset = propsPanel.querySelector('#prop-reset');
      const propScaleValue = propsPanel.querySelector('#prop-scale-value');
      const propRotValue = propsPanel.querySelector('#prop-rot-value');
      const propInfo = propsPanel.querySelector('#prop-info');
      const constructionsSection = propsPanel.querySelector('#constructions-section');
      const constructionsList = propsPanel.querySelector('#constructions-list');
      const constructionsCount = propsPanel.querySelector('#constructions-count');
      const shapeSpecificSection = propsPanel.querySelector('#shape-specific-section');
      const shapeSpecific = propsPanel.querySelector('#shape-specific');
      const propsShapeType = propsPanel.querySelector('#props-shape-type');
      const propHintText = propsPanel.querySelector('#prop-hint-text');

      function updatePropsPanel(shape) {
        if (!shape) {
          propsShapeType.textContent = '—';
          propScaleValue.textContent = '100%';
          propRotValue.textContent = '0°';
          propInfo.innerHTML = '<div class="prop-empty">Фигура не выбрана</div>';
          constructionsSection.style.display = 'none';
          shapeSpecificSection.style.display = 'none';
          propHintText.textContent = 'Выберите фигуру на холсте или создайте новую через меню';
          return;
        }
        
        const scalePercent = Math.round((shape.scale || 1) * 100);
        const rotDeg = Math.round((shape.rotation || 0) * 180 / Math.PI) % 360;
        const normalizedRot = ((rotDeg % 360) + 360) % 360;
        
        propsShapeType.textContent = shape.constructor.name.replace('Shape', '');
        propScaleValue.textContent = `${scalePercent}%`;
        propRotValue.textContent = `${normalizedRot}°`;
        
        // Основная информация
        const infoItems = [];
        
        infoItems.push({ label: '📍 Координаты', value: `X: ${shape.x.toFixed(1)}, Y: ${shape.y.toFixed(1)}` });
        infoItems.push({ label: '📏 Масштаб', value: `${scalePercent}%` });
        infoItems.push({ label: '🔄 Поворот', value: `${normalizedRot}°` });
        
        // Специфичные данные для разных фигур
        if (shape instanceof LineShape || shape instanceof RayShape) {
          const globalAngle = (shape.angle + (shape.rotation || 0)) * 180 / Math.PI;
          infoItems.push({ label: '📐 Угол линии', value: `${((globalAngle % 360) + 360) % 360 .toFixed(1)}°` });
          infoItems.push({ label: '📏 Длина', value: `${shape.cells} ячеек` });
        }
        
        if (shape instanceof SegmentShape) {
          infoItems.push({ label: '📏 Длина', value: `${shape.length.toFixed(1)}` });
          const segAngle = (shape.rotation || 0) * 180 / Math.PI;
          infoItems.push({ label: '📐 Угол', value: `${((segAngle % 360) + 360) % 360 .toFixed(1)}°` });
        }
        
        if (shape instanceof AngleShape) {
          infoItems.push({ label: '📐 Величина угла', value: `${(shape.angle * 180 / Math.PI).toFixed(1)}°` });
          infoItems.push({ label: '🧭 Базовый угол', value: `${(shape.base * 180 / Math.PI).toFixed(1)}°` });
          infoItems.push({ label: '📏 Длина лучей', value: `${shape.len}` });
        }
        
        if (shape instanceof CircleShape) {
          infoItems.push({ label: '⭕ Радиус', value: `${shape.r.toFixed(1)}` });
          infoItems.push({ label: '📐 Диаметр', value: `${(shape.r * 2).toFixed(1)}` });
          infoItems.push({ label: '📏 Длина окружности', value: `${(2 * Math.PI * shape.r * shape.scale).toFixed(1)}` });
          infoItems.push({ label: '🔵 Площадь', value: `${(Math.PI * Math.pow(shape.r * shape.scale, 2)).toFixed(1)}` });
        }
        
        if (shape instanceof RectShape) {
          infoItems.push({ label: '↔️ Ширина', value: `${shape.w.toFixed(1)}` });
          infoItems.push({ label: '↕️ Высота', value: `${shape.h.toFixed(1)}` });
          infoItems.push({ label: '📐 Периметр', value: `${((shape.w + shape.h) * 2 * shape.scale).toFixed(1)}` });
          infoItems.push({ label: '🔲 Площадь', value: `${(shape.w * shape.h * shape.scale * shape.scale).toFixed(1)}` });
        }
        
        if (shape instanceof SquareShape) {
          infoItems.push({ label: '↔️ Сторона', value: `${shape.w.toFixed(1)}` });
          infoItems.push({ label: '📐 Периметр', value: `${(shape.w * 4 * shape.scale).toFixed(1)}` });
          infoItems.push({ label: '🔲 Площадь', value: `${(shape.w * shape.w * shape.scale * shape.scale).toFixed(1)}` });
        }
        
        if (shape instanceof TriangleShape) {
          infoItems.push({ label: '↔️ Сторона', value: `${shape.side.toFixed(1)}` });
          const height = Math.sqrt(3) / 2 * shape.side * shape.scale;
          infoItems.push({ label: '↕️ Высота', value: `${height.toFixed(1)}` });
          infoItems.push({ label: '📐 Периметр', value: `${(shape.side * 3 * shape.scale).toFixed(1)}` });
          infoItems.push({ label: '🔺 Площадь', value: `${(shape.side * height / 2).toFixed(1)}` });
        }
        
        if (shape instanceof PolygonShape) {
          infoItems.push({ label: '⬡ Сторон', value: `${shape.sides}` });
          infoItems.push({ label: '📏 Радиус', value: `${shape.radius.toFixed(1)}` });
          const perimeter = 2 * shape.sides * shape.radius * Math.sin(Math.PI / shape.sides) * shape.scale;
          infoItems.push({ label: '📐 Периметр ≈', value: `${perimeter.toFixed(1)}` });
        }
        
        if (shape instanceof RhombusShape) {
          infoItems.push({ label: '↔️ Диагональ 1', value: `${shape.d1.toFixed(1)}` });
          infoItems.push({ label: '↕️ Диагональ 2', value: `${shape.d2.toFixed(1)}` });
          const side = Math.sqrt(Math.pow(shape.d1/2, 2) + Math.pow(shape.d2/2, 2)) * shape.scale;
          infoItems.push({ label: '📏 Сторона ≈', value: `${side.toFixed(1)}` });
          infoItems.push({ label: '🔲 Площадь', value: `${(shape.d1 * shape.d2 / 2 * shape.scale * shape.scale).toFixed(1)}` });
        }
        
        if (shape instanceof ParallelogramShape) {
          infoItems.push({ label: '↔️ Основание', value: `${shape.base.toFixed(1)}` });
          infoItems.push({ label: '📏 Боковая сторона', value: `${shape.side.toFixed(1)}` });
          infoItems.push({ label: '↕️ Смещение', value: `${shape.skew.toFixed(1)}` });
        }
        
        if (shape instanceof TrapezoidShape) {
          infoItems.push({ label: '↔️ Верхнее основание', value: `${shape.top.toFixed(1)}` });
          infoItems.push({ label: '↔️ Нижнее основание', value: `${shape.bottom.toFixed(1)}` });
          infoItems.push({ label: '↕️ Высота', value: `${shape.height.toFixed(1)}` });
        }
        
        // Отрисовка информации
        propInfo.innerHTML = infoItems.map(item => `
          <div class="prop-info-item">
            <span class="prop-info-label">${item.label}</span>
            <span class="prop-info-value">${item.value}</span>
          </div>
        `).join('');
        
        // Построения
        if (shape.constructions && shape.constructions.length > 0) {
          constructionsSection.style.display = 'block';
          constructionsCount.textContent = shape.constructions.length;
          
          constructionsList.innerHTML = shape.constructions.map((c, idx) => {
            const type = c.type || 'unknown';
            const typeNames = {
              'median': 'Медиана',
              'bisector': 'Биссектриса',
              'perpBisector': 'Перпендикуляр',
              'line': 'Прямая',
              'parallel': 'Параллельная',
              'section': 'Сечение'
            };
            
            let extra = '';
            if (c.from && c.to) {
              const dx = c.to.x - c.from.x;
              const dy = c.to.y - c.from.y;
              const len = Math.hypot(dx, dy);
              const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
              extra = `<span class="construction-extra">📏 ${len.toFixed(1)} · 📐 ${((angleDeg % 360) + 360) % 360 .toFixed(1)}°</span>`;
            }
            
            if (c.type === 'section' && c.points && c.points.length >= 3) {
              const [p1, p2, p3] = c.points;
              const area = Math.abs((p2.x - p1.x) * (p3.y - p1.y) - (p3.x - p1.x) * (p2.y - p1.y)) / 2;
              extra = `<span class="construction-extra">🔲 Площадь ≈ ${area.toFixed(1)}</span>`;
            }
            
            return `
              <div class="construction-item">
                <div class="construction-header">
                  <span class="construction-num">${idx + 1}</span>
                  <span class="construction-name">${typeNames[type] || type}</span>
                  <button class="construction-delete" data-idx="${idx}" title="Удалить построение">✕</button>
                </div>
                ${extra ? `<div class="construction-details">${extra}</div>` : ''}
              </div>
            `;
          }).join('');
          
          // Обработчики удаления построений
          constructionsList.querySelectorAll('.construction-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              const idx = parseInt(btn.dataset.idx);
              if (idx >= 0 && shape.constructions[idx]) {
                shape.constructions.splice(idx, 1);
                updatePropsPanel(shape);
                console.info('Построение удалено.');
              }
            });
          });
        } else {
          constructionsSection.style.display = 'none';
        }
        
        // Специфичные настройки
        shapeSpecific.innerHTML = '';
        let hasSpecific = false;
        
        if (shape instanceof RectShape) {
          hasSpecific = true;
          shapeSpecific.innerHTML = `
            <div class="prop-input-group">
              <label>↔️ Ширина</label>
              <input id="prop-w" class="prop-input" type="number" value="${shape.w.toFixed(1)}" step="1" min="10">
            </div>
            <div class="prop-input-group">
              <label>↕️ Высота</label>
              <input id="prop-h" class="prop-input" type="number" value="${shape.h.toFixed(1)}" step="1" min="10">
            </div>
          `;
          shapeSpecific.querySelector('#prop-w').addEventListener('change', (e) => { 
            const val = parseFloat(e.target.value);
            if (!isNaN(val) && val > 0) shape.w = val; 
            updatePropsPanel(shape);
          });
          shapeSpecific.querySelector('#prop-h').addEventListener('change', (e) => { 
            const val = parseFloat(e.target.value);
            if (!isNaN(val) && val > 0) shape.h = val; 
            updatePropsPanel(shape);
          });
        } else if (shape instanceof CircleShape) {
          hasSpecific = true;
          shapeSpecific.innerHTML = `
            <div class="prop-input-group">
              <label>⭕ Радиус</label>
              <input id="prop-r" class="prop-input" type="number" value="${shape.r.toFixed(1)}" step="1" min="5">
            </div>
          `;
          shapeSpecific.querySelector('#prop-r').addEventListener('change', (e) => { 
            const val = parseFloat(e.target.value);
            if (!isNaN(val) && val > 0) shape.r = val; 
            updatePropsPanel(shape);
          });
        } else if (shape instanceof PolygonShape) {
          hasSpecific = true;
          shapeSpecific.innerHTML = `
            <div class="prop-input-group">
              <label>⬡ Количество сторон</label>
              <input id="prop-sides" class="prop-input" type="number" min="3" max="20" value="${shape.sides}" step="1">
            </div>
          `;
          shapeSpecific.querySelector('#prop-sides').addEventListener('change', (e) => {
            const n = parseInt(e.target.value);
            if (!isNaN(n) && n >= 3 && n <= 20) {
              shape.sides = n;
              shape.vertexNames = Array.from({ length: shape.sides }, (_, i) => String.fromCharCode(65 + i));
              updatePropsPanel(shape);
            }
          });
        } else if (shape instanceof AngleShape) {
          hasSpecific = true;
          shapeSpecific.innerHTML = `
            <div class="prop-input-group">
              <label>📐 Величина (°)</label>
              <input id="prop-angle" class="prop-input" type="number" min="1" max="359" value="${(shape.angle * 180/Math.PI).toFixed(1)}" step="1">
            </div>
            <div class="prop-input-group">
              <label>🧭 Базовый угол (°)</label>
              <input id="prop-base" class="prop-input" type="number" min="-360" max="360" value="${(shape.base * 180/Math.PI).toFixed(1)}" step="1">
            </div>
            <div class="prop-input-group">
              <label>📏 Длина лучей</label>
              <input id="prop-len" class="prop-input" type="number" min="20" max="400" value="${shape.len}" step="5">
            </div>
          `;
          shapeSpecific.querySelector('#prop-angle').addEventListener('change', (e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) {
              shape.angle = Math.max(1, Math.min(359, v)) * Math.PI / 180;
              updatePropsPanel(shape);
            }
          });
          shapeSpecific.querySelector('#prop-base').addEventListener('change', (e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) {
              shape.base = v * Math.PI / 180;
              updatePropsPanel(shape);
            }
          });
          shapeSpecific.querySelector('#prop-len').addEventListener('change', (e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) {
              shape.len = Math.max(20, Math.min(400, v));
              updatePropsPanel(shape);
            }
          });
        } else if (shape instanceof TriangleShape) {
          hasSpecific = true;
          shapeSpecific.innerHTML = `
            <div class="prop-input-group">
              <label>↔️ Сторона</label>
              <input id="prop-side" class="prop-input" type="number" value="${shape.side.toFixed(1)}" step="1" min="20">
            </div>
          `;
          shapeSpecific.querySelector('#prop-side').addEventListener('change', (e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v > 0) {
              shape.side = v;
              updatePropsPanel(shape);
            }
          });
        }
        
        shapeSpecificSection.style.display = hasSpecific ? 'block' : 'none';
        
        // Подсказка
        const hints = {
          'PointShape': 'Точка — базовый элемент для построений',
          'LineShape': 'Прямая бесконечна в обе стороны',
          'RayShape': 'Луч имеет начало, но не имеет конца',
          'SegmentShape': 'Отрезок ограничен двумя точками',
          'AngleShape': 'Угол образован двумя лучами из одной точки',
          'CircleShape': 'Окружность — множество точек, равноудалённых от центра',
          'TriangleShape': 'Треугольник имеет 3 вершины и 3 стороны',
          'RectShape': 'Прямоугольник имеет 4 прямых угла',
          'SquareShape': 'Квадрат — прямоугольник с равными сторонами',
          'RhombusShape': 'Ромб — параллелограмм с равными сторонами',
          'ParallelogramShape': 'Параллелограмм имеет параллельные противоположные стороны',
          'TrapezoidShape': 'Трапеция имеет одну пару параллельных сторон',
          'PolygonShape': 'Многоугольник с равными сторонами и углами',
          'VectorShape': 'Вектор имеет направление и длину'
        };
        propHintText.textContent = hints[shape.constructor.name] || 'Используйте панель для изменения параметров фигуры';
      }

      // Обработчики кнопок
      btnScaleDec.addEventListener('click', () => { 
        if (!activeShape) return; 
        activeShape.scale = Math.max(0.1, activeShape.scale - 0.05); 
        updatePropsPanel(activeShape); 
      });
      btnScaleInc.addEventListener('click', () => { 
        if (!activeShape) return; 
        activeShape.scale = (activeShape.scale || 1) + 0.05; 
        updatePropsPanel(activeShape); 
      });
      btnRotDec.addEventListener('click', () => { 
        if (!activeShape) return; 
        activeShape.rotation = (activeShape.rotation || 0) - Math.PI / 36; 
        updatePropsPanel(activeShape); 
      });
      btnRotInc.addEventListener('click', () => { 
        if (!activeShape) return; 
        activeShape.rotation = (activeShape.rotation || 0) + Math.PI / 36; 
        updatePropsPanel(activeShape); 
      });
      btnReset.addEventListener('click', () => { 
        if (!activeShape) return; 
        activeShape.scale = 1; 
        activeShape.rotation = 0; 
        updatePropsPanel(activeShape); 
      });

      window.updatePropsPanel = updatePropsPanel;
    })();

    /* ====== Help popup ====== */
    const helpBtn = document.querySelector('.quest-btn');
    const helpPopup = document.getElementById('helpPopup');
    const helpClose = document.getElementById('helpClose');
    if (helpBtn && helpPopup && helpClose) {
      helpBtn.addEventListener('click', () => { helpPopup.classList.remove('hidden'); });
      helpClose.addEventListener('click', () => { helpPopup.classList.add('hidden'); });
      helpPopup.addEventListener('click', (e) => { if (e.target === helpPopup) helpPopup.classList.add('hidden'); });
    }

    /* ====== Touch events (multitouch zoom/rotate) ====== */
    let touchMode = null;
    let touchStartDist = 0;
    let touchStartAngle = 0;
    let startScale = 1;
    let startRot = 0;

    canvasEl.addEventListener('touchstart', (e) => {
      // Блокируем стандартный скролл/зум только если 2 пальца (трансформация фигуры)
      if (e.touches.length === 2 && activeShape) {
        touchMode = 'transform';
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dx = t2.clientX - t1.clientX;
        const dy = t2.clientY - t1.clientY;
        touchStartDist = Math.hypot(dx, dy);
        touchStartAngle = Math.atan2(dy, dx);
        startScale = activeShape.scale || 1;
        startRot = activeShape.rotation || 0;
        e.preventDefault(); // Блокируем только для 2 пальцев
      }
    }, { passive: true });

    canvasEl.addEventListener('touchmove', (e) => {
      if (touchMode === 'transform' && e.touches.length === 2 && activeShape) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dx = t2.clientX - t1.clientX;
        const dy = t2.clientY - t1.clientY;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        activeShape.scale = Math.max(0.1, startScale * (dist / touchStartDist));
        activeShape.rotation = startRot + (angle - touchStartAngle);
        if (typeof updatePropsPanel === 'function') updatePropsPanel(activeShape);
        e.preventDefault(); // Блокируем только для трансформации
      }
      // Для 1 пальца — разрешаем скролл страницы (не вызываем preventDefault)
    }, { passive: true });

    canvasEl.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) {
        touchMode = null;
      }
    });

    // старт рендера
    render();
  })(canvas);
});