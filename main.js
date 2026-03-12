const canvas = document.getElementById('plane');
const ctx = canvas.getContext('2d');

canvas.width = canvas.offsetWidth;
canvas.height = canvas.offsetHeight;

function drawGrid() {
    const step = 25;

    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 1;

    for (let x = 0; x < canvas.width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    for (let y = 0; y < canvas.height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, canvas.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX - 6, 12);
    ctx.lineTo(centerX + 6, 12);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(centerX, canvas.height);
    ctx.lineTo(centerX - 6, canvas.height - 12);
    ctx.lineTo(centerX + 6, canvas.height - 12);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(canvas.width, centerY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(canvas.width, centerY);
    ctx.lineTo(canvas.width - 12, centerY - 6);
    ctx.lineTo(canvas.width - 12, centerY + 6);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(12, centerY - 6);
    ctx.lineTo(12, centerY + 6);
    ctx.fill();
}

drawGrid();
