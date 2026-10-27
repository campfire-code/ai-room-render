// 截图与预览用的示例：程序绘制的示意房间（不是真实照片），画面里标明「示例」。只在开发预览里用到。
function room(w: number, h: number, done: boolean): string {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const hz = h * 0.58;
  g.fillStyle = done ? '#E9E4DC' : '#B9B6B0'; g.fillRect(0, 0, w, hz);
  g.fillStyle = done ? '#C9A77C' : '#8E8A84'; g.fillRect(0, hz, w, h - hz);
  if (!done) {
    g.strokeStyle = 'rgba(0,0,0,.18)';
    for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo((w / 9) * i, 0); g.lineTo((w / 9) * i + 6, hz); g.stroke(); }
  }
  // 窗
  g.fillStyle = done ? '#F7FBFF' : '#DCE6EE'; g.fillRect(w * 0.08, h * 0.12, w * 0.2, h * 0.3);
  g.strokeStyle = done ? '#FFFFFF' : '#8D979F'; g.lineWidth = 6; g.strokeRect(w * 0.08, h * 0.12, w * 0.2, h * 0.3);
  g.beginPath(); g.moveTo(w * 0.18, h * 0.12); g.lineTo(w * 0.18, h * 0.42); g.stroke();
  // 门
  g.fillStyle = done ? '#8B5E3C' : '#6E5B49'; g.fillRect(w * 0.86, h * 0.14, w * 0.1, hz - h * 0.14);
  if (done) {
    // 石材背景墙（程序画的云纹）
    const x0 = w * 0.36, y0 = h * 0.1, ww = w * 0.42, hh = hz - y0;
    const gr = g.createLinearGradient(x0, y0, x0 + ww, y0 + hh);
    gr.addColorStop(0, '#F2F1EE'); gr.addColorStop(1, '#DAD8D3');
    g.fillStyle = gr; g.fillRect(x0, y0, ww, hh);
    g.strokeStyle = 'rgba(95,100,108,.55)'; g.lineWidth = 2;
    for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(x0, y0 + hh * (0.1 + k * 0.16)); g.bezierCurveTo(x0 + ww * 0.3, y0 + hh * (0.0 + k * 0.17), x0 + ww * 0.6, y0 + hh * (0.3 + k * 0.12), x0 + ww, y0 + hh * (0.15 + k * 0.15)); g.stroke(); }
    // 沙发、地毯、落地灯
    g.fillStyle = '#EDE6DA'; g.beginPath(); g.ellipse(w * 0.55, h * 0.84, w * 0.3, h * 0.07, 0, 0, 7); g.fill();
    g.fillStyle = '#7D8F96'; g.fillRect(w * 0.36, h * 0.52, w * 0.38, h * 0.2);
    g.fillStyle = '#6A7B82'; g.fillRect(w * 0.34, h * 0.58, w * 0.04, h * 0.14); g.fillRect(w * 0.72, h * 0.58, w * 0.04, h * 0.14);
    g.fillStyle = '#B8694A'; g.fillRect(w * 0.42, h * 0.54, w * 0.07, h * 0.08);
    g.strokeStyle = '#3A3A3A'; g.lineWidth = 4; g.beginPath(); g.moveTo(w * 0.82, hz + 6); g.lineTo(w * 0.82, h * 0.34); g.stroke();
    g.fillStyle = '#F5E3B3'; g.beginPath(); g.moveTo(w * 0.79, h * 0.34); g.lineTo(w * 0.85, h * 0.34); g.lineTo(w * 0.84, h * 0.27); g.lineTo(w * 0.80, h * 0.27); g.fill();
  } else {
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(w * 0.45, hz - 28, 120, 10);
  }
  g.fillStyle = 'rgba(20,20,20,.72)'; g.font = `600 ${Math.round(h * 0.045)}px sans-serif`;
  g.fillText(done ? '示例效果图（程序绘制）' : '示例房间图（程序绘制）', 18, h - 18);
  return c.toDataURL('image/png');
}

export const demoRoom = (w = 900, h = 600) => room(w, h, false);
export const demoRender = (w = 900, h = 600) => room(w, h, true);
