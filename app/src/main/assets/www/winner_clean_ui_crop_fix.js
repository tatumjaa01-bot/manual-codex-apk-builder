(function(){
  function txt(el){ return (el && (el.innerText || el.textContent) || '').trim(); }

  function removeOldFloatingJunk(){
    const killWords = [
      'กลับ Codex',
      'นำเข้าโปสเตอร์',
      'นำเข้ารูป',
      'Preview Winner Studio',
      'โหลดรูปวงกลมจากตัวตัดเพิ่ม'
    ];

    Array.from(document.querySelectorAll('button,a,div,img')).forEach(el=>{
      const t = txt(el);
      const st = getComputedStyle(el);
      const inline = el.getAttribute('style') || '';
      const id = el.id || '';
      const cls = el.className || '';

      const textHit = killWords.some(w => t.includes(w));
      const oldCodexHit = /codexPreview|codex-preview|codexFixed|manualImport|importPoster/i.test(id + ' ' + cls);
      const fixedBottomHit = st.position === 'fixed' && (
        t.includes('กลับ') ||
        t.includes('นำเข้า') ||
        inline.includes('bottom') && inline.includes('z-index:999')
      );

      const greenMiniHit =
        (st.position === 'fixed' || st.position === 'absolute') &&
        (inline.includes('#00ff') || inline.includes('lime') || inline.includes('green')) &&
        (el.tagName === 'IMG' || el.querySelector('img'));

      if(textHit || oldCodexHit || fixedBottomHit || greenMiniHit){
        if(!t.includes('ไปหน้าบอร์ด') && !t.includes('ไปหน้าตัดรูป') && !t.includes('Gemini')){
          el.remove();
        }
      }
    });

    document.documentElement.style.setProperty('--safe-bottom-extra','0px');
  }

  function addCss(){
    if(document.getElementById('winnerCleanUiCss')) return;
    const css = document.createElement('style');
    css.id = 'winnerCleanUiCss';
    css.textContent = `
      #codexPreviewTools,
      #codexFixedNav,
      #codexMiniPreview,
      .codex-preview-tools,
      .codex-floating-bar,
      .codex-mini-preview,
      .manual-import-floating,
      .winner-sticky-import {
        display:none!important;
        pointer-events:none!important;
      }

      #gemToggle{
        right:12px!important;
        bottom:12px!important;
        z-index:2147483647!important;
        display:block!important;
        opacity:1!important;
        transform:none!important;
      }

      #gemPanel{
        bottom:68px!important;
        z-index:2147483646!important;
      }

      body{
        padding-bottom:76px!important;
      }
    `;
    document.head.appendChild(css);
  }

  // แก้ค่า default crop ให้ไม่ซูมจนหลุดหน้า
  window.defaultAdj = function(){
    return {dx:0, dy:0, zoom:1.08};
  };

  // Auto detect ใหม่: จับเฉพาะรูปโปรไฟล์ฝั่งซ้าย ไม่เอาข้อความ/เบอร์
  window.autoDetect = function(){
    if(!window.img || !img.src || !window.canvas || !window.ctx) return;

    try{
      redraw();

      const w = canvas.width;
      const h = canvas.height;
      const id = ctx.getImageData(0,0,w,h);
      const d = id.data;

      const xMin = Math.max(0, Math.floor(w * 0.025));
      const xMax = Math.min(
        Math.floor(w * 0.22),
        Math.max(125, Math.floor(w * 0.18))
      );

      function isAvatarPixel(x,y){
        const i = (y*w+x)*4;
        const r = d[i], g = d[i+1], b = d[i+2];
        const mx = Math.max(r,g,b);
        const mn = Math.min(r,g,b);
        const sat = mx - mn;

        // ตัดพื้นขาว/เทาอ่อนออก แต่เก็บรูปคน/โลโก้/ภาพโปรไฟล์
        if(r > 238 && g > 238 && b > 238) return false;
        if(mx > 226 && sat < 18) return false;

        // เก็บทั้งภาพสีและภาพมืด
        return (sat > 16 || mx < 218);
      }

      const rows = new Array(h).fill(0);
      for(let y=0;y<h;y++){
        let c = 0;
        for(let x=xMin;x<xMax;x+=2){
          if(isAvatarPixel(x,y)) c++;
        }
        rows[y] = c;
      }

      const rowThreshold = Math.max(6, Math.floor((xMax-xMin) * 0.055));
      const minBandH = Math.max(14, Math.floor(h * 0.012));
      const mergeGap = Math.max(8, Math.floor(h * 0.010));

      let bands = [];
      let inBand = false;
      let sy = 0;

      for(let y=0;y<h;y++){
        if(rows[y] > rowThreshold && !inBand){
          sy = y;
          inBand = true;
        }
        if((rows[y] <= rowThreshold || y === h-1) && inBand){
          const ey = y;
          if(ey - sy >= minBandH) bands.push([sy,ey]);
          inBand = false;
        }
      }

      const merged = [];
      bands.forEach(b=>{
        const last = merged[merged.length-1];
        if(last && b[0] - last[1] < mergeGap) last[1] = b[1];
        else merged.push(b.slice());
      });

      const found = [];
      merged.forEach(([by1,by2])=>{
        let minx = xMax, maxx = xMin, miny = by2, maxy = by1;
        let sx = 0, syy = 0, hits = 0;

        for(let y=by1;y<=by2;y++){
          for(let x=xMin;x<xMax;x++){
            if(isAvatarPixel(x,y)){
              if(x < minx) minx = x;
              if(x > maxx) maxx = x;
              if(y < miny) miny = y;
              if(y > maxy) maxy = y;
              sx += x;
              syy += y;
              hits++;
            }
          }
        }

        if(hits < 90) return;

        const bw = maxx - minx + 1;
        const bh = maxy - miny + 1;
        if(bw < 18 || bh < 18) return;
        if(bh > h * 0.16) return;

        let cx = sx / hits;
        let cy = syy / hits;
        let r = Math.max(bw,bh) / 2 + 4;

        const minR = Math.max(18, Math.min(w,h) * 0.028);
        const maxR = Math.min(w,h) * 0.075;

        r = Math.max(minR, Math.min(maxR, r));

        if(cx - r < 0) cx = r + 2;
        if(cx + r > xMax + 8) cx = xMax - r + 4;

        // กันเส้นคั่นแถว/ตัวหนังสือที่โดนจับหลอก
        const shapeRatio = bw / Math.max(1,bh);
        if(shapeRatio < 0.45 || shapeRatio > 1.85) return;

        if(!found.some(c=>Math.abs(c.y-cy) < Math.max(c.r,r) * 1.15)){
          found.push({x:cx,y:cy,r:r,adj:defaultAdj()});
        }
      });

      window.circles = found.sort((a,b)=>a.y-b.y).filter(c=>c.r>14);
      window.selected = circles.length ? 0 : -1;

      redraw();
    }catch(e){
      console.error('avatar autoDetect failed', e);
      try{ alert('จับวงกลมไม่สำเร็จ: ' + e.message); }catch(_){}
    }
  };

  function hookButtons(){
    try{
      if(window.detectBtn) detectBtn.onclick = window.autoDetect;
      if(document.getElementById('detectBtn')) document.getElementById('detectBtn').onclick = window.autoDetect;
    }catch(e){}
  }

  addCss();

  document.addEventListener('DOMContentLoaded', function(){
    addCss();
    removeOldFloatingJunk();
    hookButtons();
    setTimeout(removeOldFloatingJunk, 500);
    setTimeout(hookButtons, 500);
    setTimeout(removeOldFloatingJunk, 1600);
  });

  setTimeout(removeOldFloatingJunk, 800);
  setTimeout(hookButtons, 800);
})();
