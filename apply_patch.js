// apply_patch.js
// Запускается: node apply_patch.js
// Делает: резервную копию main.js -> main.js.bak, создаёт main.js.patched с заменами

const fs = require('fs');
const path = require('path');

const FNAME = 'main.js';
const BAK = FNAME + '.bak';
const OUT = FNAME + '.patched';

if (!fs.existsSync(FNAME)) {
  console.error('Не найден файл', FNAME);
  process.exit(1);
}

const src = fs.readFileSync(FNAME, 'utf8');
fs.writeFileSync(BAK, src, 'utf8');
console.log('Создана резервная копия:', BAK);

let out = src;

// 1) Вставляем/заменяем функцию drawHandles(shape)
const drawHandlesCode = `
// ===== drawHandles(shape) =====
function drawHandles(shape) {
  if (!shape || typeof shape.getBoundingBox !== 'function') return;

  const box = shape.getBoundingBox(); // {x,y,w,h} в мировых координатах
  const p1 = worldToScreen(box.x, box.y);
  const p2 = worldToScreen(box.x + box.w, box.y + box.h);

  const handles = [
    { x: p1.x, y: p1.y, type: 'scale-nw' },
    { x: p2.x, y: p1.y, type: 'scale-ne' },
    { x: p2.x, y: p2.y, type: 'scale-se' },
    { x: p1.x, y: p2.y, type: 'scale-sw' }
  ];

  // верхняя центральная ручка для поворота
  const midTop = { x: (p1.x + p2.x) / 2, y: p1.y - 30 };
  handles.push({ x: midTop.x, y: midTop.y, type: 'rotate' });

  // отрисовка ручек
  ctx.save();
  ctx.fillStyle = '#1e90ff';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  handles.forEach(h => {
    ctx.beginPath();
    ctx.arc(h.x, h.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();

  // сохраняем в объекте фигуры (в экранных координатах)
  shape._handles = handles;
}
`.trim();

// Если в файле уже есть функция drawHandles — заменим её, иначе вставим в конец файла перед последней скобкой
if (/function\s+drawHandles\s*\(/.test(out)) {
  out = out.replace(/function\s+drawHandles\s*\([\s\S]*?\}\n\}/m, drawHandlesCode + '\n');
  // fallback: try simpler replace if above fails
  if (!/drawHandles\s*\(/.test(out)) {
    out += '\n' + drawHandlesCode + '\n';
  }
} else {
  out += '\n\n' + drawHandlesCode + '\n';
}
console.log('drawHandles: готово');

// 2) Заменяем pointerdown обработчик
const pointerdownReplacement = `
// ===== pointerdown =====
canvasEl.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  try { canvasEl.setPointerCapture(e.pointerId); } catch (_) {}
  isMouseDown = true;

  const sc = screenToCanvas(e.clientX, e.clientY); // экран->канвас coords
  const w = screenToWorld(e.clientX, e.clientY);  // экран->мир coords

  // 1) Проверяем ручки у фигур сверху вниз (последняя — верхняя)
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (typeof s.getBoundingBox !== 'function') continue;
    const box = s.getBoundingBox();
    const hp1 = worldToScreen(box.x, box.y);
    const hp2 = worldToScreen(box.x + box.w, box.y + box.h);
    const tmpHandles = [
      { x: hp1.x, y: hp1.y, type: 'scale-nw' },
      { x: hp2.x, y: hp1.y, type: 'scale-ne' },
      { x: hp2.x, y: hp2.y, type: 'scale-se' },
      { x: hp1.x, y: hp2.y, type: 'scale-sw' },
      { x: (hp1.x + hp2.x) / 2, y: hp1.y - 30, type: 'rotate' }
    ];
    for (const h of tmpHandles) {
      const dx = sc.x - h.x;
      const dy = sc.y - h.y;
      if (Math.hypot(dx, dy) <= 12) {
        // выбрали ручку этой фигуры
        activeShape = s;
        shapes.forEach(x => x.selected = false);
        activeShape.selected = true;
        activeHandle = h;
        // поднимаем фигуру наверх
        const idx = shapes.indexOf(activeShape);
        if (idx >= 0) { shapes.splice(idx, 1); shapes.push(activeShape); }
        if (typeof updatePropsPanel === 'function') updatePropsPanel(activeShape);
        return;
      }
    }
  }

  // 2) Если ручки не сработали — обычный hitTest/selection/drag
  let found = null;
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (typeof s.hitTest === 'function' && s.hitTest(w.x, w.y)) {
      found = s;
      break;
    }
  }

  if (found) {
    activeShape = found;
    shapes.forEach(x => x.selected = false);
    activeShape.selected = true;
    const idx = shapes.indexOf(activeShape);
    if (idx >= 0) { shapes.splice(idx, 1); shapes.push(activeShape); }
    dragOffset = { x: w.x - (activeShape.x || 0), y: w.y - (activeShape.y || 0) };
    if (typeof updatePropsPanel === 'function') updatePropsPanel(activeShape);
    return;
  }

  // 3) Клик по пустому месту — снимаем выделение
  shapes.forEach(x => x.selected = false);
  activeShape = null;
  activeHandle = null;
  if (typeof updatePropsPanel === 'function') updatePropsPanel(null);
});
`.trim();

// Попробуем найти существующий pointerdown и заменить блок от "canvasEl.addEventListener('pointerdown'" до ближайшей "});"
if (/canvasEl\.addEventListener\(\s*['"]pointerdown['"]/.test(out)) {
  out = out.replace(/canvasEl\.addEventListener\(\s*['"]pointerdown['"][\s\S]*?\}\s*\)\s*;\s*/m, pointerdownReplacement + '\n');
  console.log('pointerdown: заменён');
} else {
  // если не найден — добавим в конец
  out += '\n\n' + pointerdownReplacement + '\n';
  console.log('pointerdown: добавлен в конец файла');
}

// 3) Заменяем pointermove обработчик
const pointermoveReplacement = `
// ===== pointermove =====
canvasEl.addEventListener('pointermove', (e) => {
  const sc = screenToCanvas(e.clientX, e.clientY);
  const w = screenToWorld(e.clientX, e.clientY);

  // если активна ручка — трансформируем фигуру
  if (activeHandle && activeShape) {
    if (activeHandle.type === 'rotate') {
      const cx = activeShape.x || 0;
      const cy = activeShape.y || 0;
      const ang = Math.atan2(w.y - cy, w.x - cx);
      activeShape.rotation = ang;
    } else {
      const box = activeShape.getBoundingBox();
      const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
      const start = worldToScreen(center.x, center.y);
      const cur = { x: sc.x, y: sc.y };
      const startDist = Math.hypot(start.x - activeHandle.x, start.y - activeHandle.y);
      const curDist = Math.hypot(start.x - cur.x, start.y - cur.y);
      const scaleFactor = (startDist > 0) ? (curDist / startDist) : 1;
      activeShape.scale = Math.max(0.05, (activeShape.scale || 1) * scaleFactor);
    }
    if (typeof updatePropsPanel === 'function') updatePropsPanel(activeShape);
    return;
  }

  // если перетаскиваем фигуру
  if (isMouseDown && activeShape && typeof dragOffset !== 'undefined' && !activeHandle) {
    activeShape.x = w.x - (dragOffset.x || 0);
    activeShape.y = w.y - (dragOffset.y || 0);
    if (typeof updatePropsPanel === 'function') updatePropsPanel(activeShape);
    return;
  }

  // иначе — можно реализовать hover подсветку
});
`.trim();

if (/canvasEl\.addEventListener\(\s*['"]pointermove['"]/.test(out)) {
  out = out.replace(/canvasEl\.addEventListener\(\s*['"]pointermove['"][\s\S]*?\}\s*\)\s*;\s*/m, pointermoveReplacement + '\n');
  console.log('pointermove: заменён');
} else {
  out += '\n\n' + pointermoveReplacement + '\n';
  console.log('pointermove: добавлен в конец файла');
}

// 4) Добавляем touch pinch/rotate если не найден
const touchCode = `
// ===== touch pinch/rotate =====
let touchMode = null;
let touchStartDist = 0;
let touchStartAngle = 0;
let startScale = 1;
let startRot = 0;

canvasEl.addEventListener('touchstart', (e) => {
  if (e.touches && e.touches.length === 2 && activeShape) {
    touchMode = 'transform';
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    touchStartDist = Math.hypot(dx, dy);
    touchStartAngle = Math.atan2(dy, dx);
    startScale = activeShape.scale || 1;
    startRot = activeShape.rotation || 0;
    e.preventDefault();
  }
});

canvasEl.addEventListener('touchmove', (e) => {
  if (touchMode === 'transform' && e.touches && e.touches.length === 2 && activeShape) {
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    const dist = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    activeShape.scale = Math.max(0.05, startScale * (dist / touchStartDist));
    activeShape.rotation = startRot + (angle - touchStartAngle);
    if (typeof updatePropsPanel === 'function') updatePropsPanel(activeShape);
    e.preventDefault();
  }
});

canvasEl.addEventListener('touchend', (e) => {
  if (!e.touches || e.touches.length < 2) {
    touchMode = null;
  }
});
`.trim();

if (!/touchstart/.test(out) || !/touchmove/.test(out)) {
  out += '\n\n' + touchCode + '\n';
  console.log('touch handlers: добавлены');
} else {
  console.log('touch handlers: уже присутствуют — не добавляю');
}

// Записываем результат
fs.writeFileSync(OUT, out, 'utf8');
console.log('Готово. Результат в', OUT);
console.log('Если всё ок — замени оригинал main.js на main.js.patched');
