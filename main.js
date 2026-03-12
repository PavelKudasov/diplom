// main.js — стабильный, безопасный, адаптивный
document.addEventListener('DOMContentLoaded', () => {
  try {
    const canvas = document.getElementById('plane');
    if (!canvas) {
      console.error('main.js: <canvas id="plane"> не найден. Проверь index.html.');
      return;
    }

    (function app(canvasEl) {
      try {
        const ctx = canvasEl.getContext('2d');
        const planeContainer = document.querySelector('.coordinate-plane') || canvasEl.parentElement;

        /* ========== Настройки ========== */
        const GRID_STEP = 25;       // размер клетки в CSS px
        const LINE_CELLS = 6;       // длина прямой/луча в клетках
        const MIN_CANVAS = 120;     // минимальная ширина canvas в px
        const MAX_CANVAS = 900;     // максимальная ширина (для десктопа)

        /* ========== Размер canvas ========== */
        function setCanvasSize() {
          const dpr = window.devicePixelRatio || 1;
          // ширина контейнера, ограничиваем для мобильных и десктопа
          const containerWidth = Math.max(MIN_CANVAS, Math.min(planeContainer.clientWidth || 350, window.innerWidth, MAX_CANVAS));
          const cssW = containerWidth;
          const cssH = cssW; // квадратный canvas

          canvasEl.style.width = cssW + 'px';
          canvasEl.style.height = cssH + 'px';

          // внутренние пиксели с учётом DPR
          canvasEl.width = Math.round(cssW * dpr);
          canvasEl.height = Math.round(cssH * dpr);

          // рисуем в CSS-пикселях
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        // Устанавливаем размер сразу и при ресайзе
        setCanvasSize();
        window.addEventListener('resize', () => {
          try { setCanvasSize(); } catch (e) { console.error(e); }
        });

        /* ========== Координатные преобразования ========== */
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

        /* ========== Рисуем сетку и оси ========== */
        function drawGrid() {
          const step = GRID_STEP;
          const w = canvasEl.clientWidth;
          const h = canvasEl.clientHeight;
          ctx.clearRect(0, 0, w, h);

          ctx.save();
          ctx.strokeStyle = "#e6e6e6";
          ctx.lineWidth = 1;
          for (let x = 0; x <= w; x += step) {
            ctx.beginPath();
            ctx.moveTo(x + 0.5, 0);
            ctx.lineTo(x + 0.5, h);
            ctx.stroke();
          }
          for (let y = 0; y <= h; y += step) {
            ctx.beginPath();
            ctx.moveTo(0, y + 0.5);
            ctx.lineTo(w, y + 0.5);
            ctx.stroke();
          }
          ctx.restore();

          ctx.save();
          ctx.strokeStyle = "#333";
          ctx.lineWidth = 2;
          const cx = w / 2;
          const cy = h / 2;
          ctx.beginPath();
          ctx.moveTo(cx + 0.5, 0);
          ctx.lineTo(cx + 0.5, h);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, cy + 0.5);
          ctx.lineTo(w, cy + 0.5);
          ctx.stroke();
          ctx.restore();
        }

        /* ========== Классы фигур ========== */
        class Shape {
          constructor(x = 0, y = 0) {
            this.x = x;
            this.y = y;
            this.selected = false;
            this.isDragging = false;
          }
          draw(ctx) {}
          hitTest(wx, wy) { return false; }
          drawSelection(ctx) {}
        }

        class PointShape extends Shape {
          constructor(x, y, r = 6) { super(x, y); this.r = r; }
          draw(ctx) {
            const p = worldToScreen(this.x, this.y);
            ctx.save();
            ctx.fillStyle = '#ff4d4f';
            ctx.beginPath();
            ctx.arc(p.x, p.y, this.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            if (this.selected) this.drawSelection(ctx);
          }
          hitTest(wx, wy) { return Math.hypot(wx - this.x, wy - this.y) <= this.r + 8; }
          drawSelection(ctx) {
            const p = worldToScreen(this.x, this.y);
            ctx.save();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.setLineDash([6,6]);
            ctx.beginPath();
            ctx.arc(p.x, p.y, this.r + 8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }

        class CircleShape extends Shape {
          constructor(x, y, r = 60) { super(x, y); this.r = r; }
          draw(ctx) {
            const p = worldToScreen(this.x, this.y);
            ctx.save();
            ctx.strokeStyle = '#1e90ff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(p.x, p.y, this.r, 0, Math.PI*2);
            ctx.stroke();
            ctx.restore();
            if (this.selected) this.drawSelection(ctx);
          }
          hitTest(wx, wy) { return Math.hypot(wx - this.x, wy - this.y) <= this.r + 8; }
          drawSelection(ctx) {
            const p = worldToScreen(this.x, this.y);
            ctx.save();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.setLineDash([8,6]);
            ctx.beginPath();
            ctx.arc(p.x, p.y, this.r + 6, 0, Math.PI*2);
            ctx.stroke();
            ctx.restore();
          }
        }

        class RectShape extends Shape {
          constructor(x, y, w = 180, h = 120) { super(x, y); this.w = w; this.h = h; }
          draw(ctx) {
            const tl = worldToScreen(this.x - this.w/2, this.y + this.h/2);
            ctx.save();
            ctx.strokeStyle = '#0ea5a4';
            ctx.lineWidth = 3;
            ctx.strokeRect(tl.x, tl.y, this.w, this.h);
            ctx.restore();
            if (this.selected) this.drawSelection(ctx);
          }
          hitTest(wx, wy) {
            return wx >= this.x - this.w/2 && wx <= this.x + this.w/2 && wy >= this.y - this.h/2 && wy <= this.y + this.h/2;
          }
          drawSelection(ctx) {
            const tl = worldToScreen(this.x - this.w/2, this.y + this.h/2);
            ctx.save();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.setLineDash([6,6]);
            ctx.strokeRect(tl.x - 6, tl.y - 6, this.w + 12, this.h + 12);
            ctx.restore();
          }
        }

        class SquareShape extends RectShape {
          constructor(x, y, size = 140) { super(x, y, size, size); }
        }

        class TriangleShape extends Shape {
          constructor(x, y, side = 140) { super(x, y); this.side = side; }
          getVertices() {
            const h = Math.sqrt(3) / 2 * this.side;
            return [
              { x: this.x, y: this.y + (2/3)*h },
              { x: this.x - this.side/2, y: this.y - (1/3)*h },
              { x: this.x + this.side/2, y: this.y - (1/3)*h }
            ];
          }
          draw(ctx) {
            const v = this.getVertices().map(p => worldToScreen(p.x, p.y));
            ctx.save();
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(v[0].x, v[0].y);
            ctx.lineTo(v[1].x, v[1].y);
            ctx.lineTo(v[2].x, v[2].y);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
            if (this.selected) this.drawSelection(ctx);
          }
          hitTest(wx, wy) {
            const v = this.getVertices();
            const area = (p,q,r) => Math.abs((q.x - p.x)*(r.y - p.y) - (r.x - p.x)*(q.y - p.y)) / 2;
            const A = area(v[0], v[1], v[2]);
            const A1 = area({x:wx,y:wy}, v[1], v[2]);
            const A2 = area(v[0], {x:wx,y:wy}, v[2]);
            const A3 = area(v[0], v[1], {x:wx,y:wy});
            return Math.abs((A1 + A2 + A3) - A) < 0.5;
          }
          drawSelection(ctx) {
            const v = this.getVertices().map(p => worldToScreen(p.x, p.y));
            ctx.save();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.setLineDash([6,6]);
            ctx.beginPath();
            ctx.moveTo(v[0].x, v[0].y);
            ctx.lineTo(v[1].x, v[1].y);
            ctx.lineTo(v[2].x, v[2].y);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
          }
        }

        class RhombusShape extends Shape {
          constructor(x, y, d1 = 160, d2 = 100) { super(x, y); this.d1 = d1; this.d2 = d2; }
          getVertices() {
            return [
              { x: this.x - this.d1/2, y: this.y },
              { x: this.x, y: this.y + this.d2/2 },
              { x: this.x + this.d1/2, y: this.y },
              { x: this.x, y: this.y - this.d2/2 }
            ];
          }
          draw(ctx) {
            const v = this.getVertices().map(p => worldToScreen(p.x, p.y));
            ctx.save();
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(v[0].x, v[0].y);
            for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
            if (this.selected) this.drawSelection(ctx);
          }
          hitTest(wx, wy) {
            const v = this.getVertices();
            let inside = true;
            for (let i = 0; i < v.length; i++) {
              const a = v[i], b = v[(i+1)%v.length];
              if ((b.x - a.x)*(wy - a.y) - (b.y - a.y)*(wx - a.x) < 0) { inside = false; break; }
            }
            return inside;
          }
          drawSelection(ctx) {
            const v = this.getVertices().map(p => worldToScreen(p.x, p.y));
            ctx.save();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.setLineDash([6,6]);
            ctx.beginPath();
            ctx.moveTo(v[0].x, v[0].y);
            for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
          }
        }

        class ParallelogramShape extends Shape {
          constructor(x, y, base = 160, side = 100, skew = 40) { super(x, y); this.base = base; this.side = side; this.skew = skew; }
          getVertices() {
            const halfBase = this.base / 2;
            const halfSide = this.side / 2;
            return [
              { x: this.x - halfBase, y: this.y - halfSide },
              { x: this.x + halfBase, y: this.y - halfSide + this.skew },
              { x: this.x + halfBase, y: this.y + halfSide + this.skew },
              { x: this.x - halfBase, y: this.y + halfSide }
            ];
          }
          draw(ctx) {
            const v = this.getVertices().map(p => worldToScreen(p.x, p.y));
            ctx.save();
            ctx.strokeStyle = '#0ea5a4';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(v[0].x, v[0].y);
            for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
            if (this.selected) this.drawSelection(ctx);
          }
          hitTest(wx, wy) {
            const v = this.getVertices();
            let inside = true;
            for (let i = 0; i < v.length; i++) {
              const a = v[i], b = v[(i+1)%v.length];
              if ((b.x - a.x)*(wy - a.y) - (b.y - a.y)*(wx - a.x) < 0) { inside = false; break; }
            }
            return inside;
          }
          drawSelection(ctx) {
            const v = this.getVertices().map(p => worldToScreen(p.x, p.y));
            ctx.save();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.setLineDash([6,6]);
            ctx.beginPath();
            ctx.moveTo(v[0].x, v[0].y);
            for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
          }
        }

        class TrapezoidShape extends Shape {
          constructor(x, y, top = 100, bottom = 180, height = 100) { super(x, y); this.top = top; this.bottom = bottom; this.height = height; }
          getVertices() {
            const halfH = this.height / 2;
            return [
              { x: this.x - this.bottom/2, y: this.y + halfH },
              { x: this.x + this.bottom/2, y: this.y + halfH },
              { x: this.x + this.top/2, y: this.y - halfH },
              { x: this.x - this.top/2, y: this.y - halfH }
            ];
          }
          draw(ctx) {
            const v = this.getVertices().map(p => worldToScreen(p.x, p.y));
            ctx.save();
            ctx.strokeStyle = '#8b5cf6';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(v[0].x, v[0].y);
            for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
            if (this.selected) this.drawSelection(ctx);
          }
          hitTest(wx, wy) {
            const v = this.getVertices();
            let inside = true;
            for (let i = 0; i < v.length; i++) {
              const a = v[i], b = v[(i+1)%v.length];
              if ((b.x - a.x)*(wy - a.y) - (b.y - a.y)*(wx - a.x) < 0) { inside = false; break; }
            }
            return inside;
          }
          drawSelection(ctx) {
            const v = this.getVertices().map(p => worldToScreen(p.x, p.y));
            ctx.save();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.setLineDash([6,6]);
            ctx.beginPath();
            ctx.moveTo(v[0].x, v[0].y);
            for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
          }
        }

        // Вспомогательная стрелка
        function drawArrowHead(ctx, x1, y1, x2, y2) {
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const size = 10;
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x2 - size * Math.cos(angle - Math.PI/6), y2 - size * Math.sin(angle - Math.PI/6));
          ctx.lineTo(x2 - size * Math.cos(angle + Math.PI/6), y2 - size * Math.sin(angle + Math.PI/6));
          ctx.closePath();
          ctx.fillStyle = ctx.strokeStyle || '#000';
          ctx.fill();
        }

        class LineShape extends Shape {
          constructor(x, y, angle = 0, cells = LINE_CELLS) { super(x, y); this.angle = angle; this.cells = cells; }
          draw(ctx) {
            const len = this.cells * GRID_STEP;
            const dx = Math.cos(this.angle) * len / 2;
            const dy = Math.sin(this.angle) * len / 2;
            const p1 = worldToScreen(this.x - dx, this.y - dy);
            const p2 = worldToScreen(this.x + dx, this.y + dy);
            ctx.save();
            ctx.strokeStyle = '#6b7280';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            ctx.restore();
            if (this.selected) this.drawSelection(ctx);
          }
          hitTest(wx, wy) {
            const len = this.cells * GRID_STEP;
            const dx = Math.cos(this.angle);
            const dy = Math.sin(this.angle);
            const ax = this.x - dx * len / 2;
            const ay = this.y - dy * len / 2;
            const bx = this.x + dx * len / 2;
            const by = this.y + dy * len / 2;
            const px = wx, py = wy;
            const vx = bx - ax, vy = by - ay;
            const t = ((px - ax) * vx + (py - ay) * vy) / (vx*vx + vy*vy);
            const tt = Math.max(0, Math.min(1, t));
            const cx = ax + vx * tt, cy = ay + vy * tt;
            return Math.hypot(px - cx, py - cy) <= 8;
          }
          drawSelection(ctx) {
            const len = this.cells * GRID_STEP;
            const dx = Math.cos(this.angle) * len / 2;
            const dy = Math.sin(this.angle) * len / 2;
            const p1 = worldToScreen(this.x - dx, this.y - dy);
            const p2 = worldToScreen(this.x + dx, this.y + dy);
            ctx.save();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.setLineDash([6,6]);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            ctx.restore();
          }
        }

        class RayShape extends Shape {
          constructor(x, y, angle = 0, cells = LINE_CELLS) { super(x, y); this.angle = angle; this.cells = cells; }
          draw(ctx) {
            const len = this.cells * GRID_STEP;
            const p1 = worldToScreen(this.x, this.y);
            const p2 = worldToScreen(this.x + Math.cos(this.angle) * len, this.y + Math.sin(this.angle) * len);
            ctx.save();
            ctx.strokeStyle = '#6b7280';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            drawArrowHead(ctx, p1.x, p1.y, p2.x, p2.y);
            ctx.restore();
            if (this.selected) this.drawSelection(ctx);
          }
          hitTest(wx, wy) {
            const len = this.cells * GRID_STEP;
            const dx = Math.cos(this.angle);
            const dy = Math.sin(this.angle);
            const vx = wx - this.x;
            const vy = wy - this.y;
            const along = vx * dx + vy * dy;
            const perp = Math.abs(vx * (-dy) + vy * dx);
            return along >= -8 && along <= len + 8 && perp <= 8;
          }
          drawSelection(ctx) {
            const len = this.cells * GRID_STEP;
            const p1 = worldToScreen(this.x, this.y);
            const p2 = worldToScreen(this.x + Math.cos(this.angle) * len, this.y + Math.sin(this.angle) * len);
            ctx.save();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.setLineDash([6,6]);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            ctx.restore();
          }
        }

        class SegmentShape extends Shape {
          constructor(x, y, length = 200, angle = 0) { super(x, y); this.length = length; this.angle = angle; }
          draw(ctx) {
            const half = this.length / 2;
            const dx = Math.cos(this.angle) * half;
            const dy = Math.sin(this.angle) * half;
            const p1 = worldToScreen(this.x - dx, this.y - dy);
            const p2 = worldToScreen(this.x + dx, this.y + dy);
            ctx.save();
            ctx.strokeStyle = '#6b7280';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            ctx.restore();
            if (this.selected) this.drawSelection(ctx);
          }
          hitTest(wx, wy) {
            const half = this.length / 2;
            const dx = Math.cos(this.angle);
            const dy = Math.sin(this.angle);
            const ax = this.x - dx * half;
            const ay = this.y - dy * half;
            const bx = this.x + dx * half;
            const by = this.y + dy * half;
            const px = wx, py = wy;
            const vx = bx - ax, vy = by - ay;
            const t = ((px - ax) * vx + (py - ay) * vy) / (vx*vx + vy*vy);
            const tt = Math.max(0, Math.min(1, t));
            const cx = ax + vx * tt, cy = ay + vy * tt;
            return Math.hypot(px - cx, py - cy) <= 8;
          }
          drawSelection(ctx) {
            const half = this.length / 2;
            const dx = Math.cos(this.angle);
            const dy = Math.sin(this.angle);
            const p1 = worldToScreen(this.x - dx * half, this.y - dy * half);
            const p2 = worldToScreen(this.x + dx * half, this.y + dy * half);
            ctx.save();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.setLineDash([6,6]);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            ctx.restore();
          }
        }

        class AngleShape extends Shape {
          constructor(x, y, angleDeg = 60, baseAngle = -Math.PI/2) { super(x, y); this.angle = angleDeg * Math.PI / 180; this.base = baseAngle; this.len = 140; }
          draw(ctx) {
            const a1 = this.base - this.angle/2;
            const a2 = this.base + this.angle/2;
            const p = worldToScreen(this.x, this.y);
            const p1 = worldToScreen(this.x + Math.cos(a1)*this.len, this.y + Math.sin(a1)*this.len);
            const p2 = worldToScreen(this.x + Math.cos(a2)*this.len, this.y + Math.sin(a2)*this.len);
            ctx.save();
            ctx.strokeStyle = '#7c3aed';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(p.x, p.y, 40, -a2 + Math.PI/2, -a1 + Math.PI/2, false);
            ctx.stroke();
            ctx.restore();
            if (this.selected) this.drawSelection(ctx);
          }
          hitTest(wx, wy) {
            const vx = wx - this.x, vy = wy - this.y;
            const r = Math.hypot(vx, vy);
            if (r > 160) return false;
            const ang = Math.atan2(vy, vx);
            const a1 = this.base - this.angle/2;
            const a2 = this.base + this.angle/2;
            const norm = (a) => {
              let v = a;
              while (v < a1) v += Math.PI*2;
              while (v > a1 + Math.PI*2) v -= Math.PI*2;
              return v;
            };
            const na = norm(ang);
            return na >= a1 && na <= a2;
          }
          drawSelection(ctx) {
            const p = worldToScreen(this.x, this.y);
            ctx.save();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.setLineDash([6,6]);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 44, 0, Math.PI*2);
            ctx.stroke();
            ctx.restore();
          }
        }

        class PolygonShape extends Shape {
          constructor(x, y, n = 5, radius = 80) { super(x, y); this.n = Math.max(3, Math.floor(n)); this.radius = radius; }
          getVertices() {
            const verts = [];
            for (let i = 0; i < this.n; i++) {
              const ang = -Math.PI/2 + i * (2*Math.PI / this.n);
              verts.push({ x: this.x + Math.cos(ang)*this.radius, y: this.y + Math.sin(ang)*this.radius });
            }
            return verts;
          }
          draw(ctx) {
            const v = this.getVertices().map(p => worldToScreen(p.x, p.y));
            ctx.save();
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(v[0].x, v[0].y);
            for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
            if (this.selected) this.drawSelection(ctx);
          }
          hitTest(wx, wy) {
            const v = this.getVertices();
            let inside = false;
            for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
              const xi = v[i].x, yi = v[i].y;
              const xj = v[j].x, yj = v[j].y;
              const intersect = ((yi > wy) !== (yj > wy)) && (wx < (xj - xi) * (wy - yi) / (yj - yi) + xi);
              if (intersect) inside = !inside;
            }
            return inside;
          }
          drawSelection(ctx) {
            const v = this.getVertices().map(p => worldToScreen(p.x, p.y));
            ctx.save();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.setLineDash([6,6]);
            ctx.beginPath();
            ctx.moveTo(v[0].x, v[0].y);
            for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
          }
        }

        class VectorShape extends Shape {
          constructor(x, y, vx = 80, vy = 40) { super(x, y); this.vx = vx; this.vy = vy; }
          draw(ctx) {
            const p1 = worldToScreen(this.x, this.y);
            const p2 = worldToScreen(this.x + this.vx, this.y + this.vy);
            ctx.save();
            ctx.strokeStyle = '#0ea5a4';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            drawArrowHead(ctx, p1.x, p1.y, p2.x, p2.y);
            ctx.restore();
            if (this.selected) this.drawSelection(ctx);
          }
          hitTest(wx, wy) {
            const ax = this.x, ay = this.y;
            const bx = this.x + this.vx, by = this.y + this.vy;
            const px = wx, py = wy;
            const vx = bx - ax, vy = by - ay;
            const t = ((px - ax) * vx + (py - ay) * vy) / (vx*vx + vy*vy);
            const tt = Math.max(0, Math.min(1, t));
            const cx = ax + vx * tt, cy = ay + vy * tt;
            return Math.hypot(px - cx, py - cy) <= 8;
          }
          drawSelection(ctx) {
            const p1 = worldToScreen(this.x, this.y);
            const p2 = worldToScreen(this.x + this.vx, this.y + this.vy);
            ctx.save();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.setLineDash([6,6]);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            ctx.restore();
          }
        }

        /* ========== Состояние и рендер ========== */
        const shapes = [];
        let activeShape = null;
        let dragOffset = { x: 0, y: 0 };

        function render() {
          drawGrid();
          for (const s of shapes) {
            try { s.draw(ctx); } catch (e) { /* защищаем рендер от ошибок в фигурах */ }
          }
          requestAnimationFrame(render);
        }
        requestAnimationFrame(render);

        /* ========== Фабрика фигур ========== */
        function createShapeByType(type) {
          switch (type) {
            case 'point': return new PointShape(0, 0, 6);
            case 'line': return new LineShape(0, 0, -Math.PI/2, LINE_CELLS);
            case 'ray': return new RayShape(0, 0, -Math.PI/2, LINE_CELLS);
            case 'segment': return new SegmentShape(0, 0, GRID_STEP * LINE_CELLS, 0);
            case 'angle': return new AngleShape(0, 0, 60, -Math.PI/2);
            case 'triangle': return new TriangleShape(0, 0, 140);
            case 'rect': return new RectShape(0, 0, 180, 120);
            case 'square': return new SquareShape(0, 0, 140);
            case 'rhombus': return new RhombusShape(0, 0, 160, 100);
            case 'circle': return new CircleShape(0, 0, 70);
            case 'parallelogram': return new ParallelogramShape(0, 0, 160, 100, 30);
            case 'trapezoid': return new TrapezoidShape(0, 0, 100, 180, 100);
            case 'polygon': return new PolygonShape(0, 0, 6, 80);
            case 'vector': return new VectorShape(0, 0, 120, -60);
            default: return new PointShape(0, 0, 6);
          }
        }

        /* ========== Меню: фигуры и инструменты ========== */
        const figureBtn = document.querySelector('.figure-btn');
        const figureMenu = document.getElementById('figureMenu');
        const toolsBtn = document.querySelector('.tools-btn');
        const toolsMenu = document.getElementById('toolsMenu');

        function closeMenus() {
          if (figureMenu) figureMenu.classList.add('hidden');
          if (toolsMenu) toolsMenu.classList.add('hidden');
        }
        function toggleMenu(menu) {
          if (!menu) return;
          if (menu === figureMenu && toolsMenu) toolsMenu.classList.add('hidden');
          if (menu === toolsMenu && figureMenu) figureMenu.classList.add('hidden');
          menu.classList.toggle('hidden');
        }
        if (figureBtn && figureMenu) {
          figureBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(figureMenu); });
        }
        if (toolsBtn && toolsMenu) {
          toolsBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(toolsMenu); });
        }
        document.addEventListener('click', (e) => {
          const t = e.target;
          if (figureMenu && (figureMenu.contains(t) || (figureBtn && figureBtn.contains(t)))) return;
          if (toolsMenu && (toolsMenu.contains(t) || (toolsBtn && toolsBtn.contains(t)))) return;
          closeMenus();
        });
        document.addEventListener('touchstart', (e) => {
          const t = e.target;
          if (figureMenu && (figureMenu.contains(t) || (figureBtn && figureBtn.contains(t)))) return;
          if (toolsMenu && (toolsMenu.contains(t) || (toolsBtn && toolsBtn.contains(t)))) return;
          closeMenus();
        }, { passive: true });

        // Пункты меню фигур
        document.querySelectorAll('.figure-item').forEach(item => {
          item.addEventListener('click', () => {
            const type = item.dataset.type;
            const shape = createShapeByType(type);
            shapes.forEach(s => s.selected = false);
            shape.selected = true;
            shapes.push(shape);
            activeShape = shape;
            shape.isDragging = true;
            dragOffset.x = 0;
            dragOffset.y = 0;
            if (figureMenu) figureMenu.classList.add('hidden');
          });
        });

        // Заглушка для инструментов (пока просто закрываем меню)
        document.querySelectorAll('.tools-item').forEach(item => {
          item.addEventListener('click', () => {
            if (toolsMenu) toolsMenu.classList.add('hidden');
          });
        });

        /* ========== Взаимодействие: выбор, перетаскивание, удаление ========== */
        function getEventWorldPos(e) {
          if (e.touches && e.touches.length) {
            return screenToWorld(e.touches[0].clientX, e.touches[0].clientY);
          } else {
            return screenToWorld(e.clientX, e.clientY);
          }
        }

        canvasEl.addEventListener('mousedown', (e) => {
          const pos = getEventWorldPos(e);
          for (let i = shapes.length - 1; i >= 0; i--) {
            if (shapes[i].hitTest(pos.x, pos.y)) {
              shapes.forEach(s => s.selected = false);
              activeShape = shapes[i];
              activeShape.selected = true;
              activeShape.isDragging = true;
              dragOffset.x = pos.x - activeShape.x;
              dragOffset.y = pos.y - activeShape.y;
              shapes.splice(i, 1);
              shapes.push(activeShape);
              return;
            }
          }
          shapes.forEach(s => s.selected = false);
          activeShape = null;
        });

        window.addEventListener('mousemove', (e) => {
          if (!activeShape || !activeShape.isDragging) return;
          const pos = getEventWorldPos(e);
          activeShape.x = pos.x - dragOffset.x;
          activeShape.y = pos.y - dragOffset.y;
        });

        window.addEventListener('mouseup', () => {
          if (activeShape) activeShape.isDragging = false;
          activeShape = null;
        });

        // Touch
        canvasEl.addEventListener('touchstart', (e) => {
          const pos = getEventWorldPos(e);
          for (let i = shapes.length - 1; i >= 0; i--) {
            if (shapes[i].hitTest(pos.x, pos.y)) {
              shapes.forEach(s => s.selected = false);
              activeShape = shapes[i];
              activeShape.selected = true;
              activeShape.isDragging = true;
              dragOffset.x = pos.x - activeShape.x;
              dragOffset.y = pos.y - activeShape.y;
              shapes.splice(i, 1);
              shapes.push(activeShape);
              e.preventDefault();
              return;
            }
          }
          shapes.forEach(s => s.selected = false);
          activeShape = null;
        }, { passive: false });

        canvasEl.addEventListener('touchmove', (e) => {
          if (!activeShape || !activeShape.isDragging) return;
          const pos = getEventWorldPos(e);
          activeShape.x = pos.x - dragOffset.x;
          activeShape.y = pos.y - dragOffset.y;
          e.preventDefault();
        }, { passive: false });

        canvasEl.addEventListener('touchend', (e) => {
          if (activeShape) activeShape.isDragging = false;
          activeShape = null;
        }, { passive: false });

        // Двойной клик — удалить фигуру под курсором
        canvasEl.addEventListener('dblclick', (e) => {
          const pos = getEventWorldPos(e);
          for (let i = shapes.length - 1; i >= 0; i--) {
            if (shapes[i].hitTest(pos.x, pos.y)) {
              shapes.splice(i, 1);
              activeShape = null;
              return;
            }
          }
        });

        // Клавиши Delete / Backspace — удалить выделенную фигуру
        window.addEventListener('keydown', (e) => {
          if (e.key === 'Delete' || e.key === 'Backspace') {
            for (let i = shapes.length - 1; i >= 0; i--) {
              if (shapes[i].selected) {
                shapes.splice(i, 1);
                activeShape = null;
                break;
              }
            }
          }
        });

      } catch (err) {
        console.error('Ошибка внутри main.js:', err);
      }
    })(canvas);

  } catch (err) {
    console.error('Ошибка при инициализации main.js:', err);
  }
});
