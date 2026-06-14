(function(){
  if (window.__CODEX_IMAGE_DISPLAY_FIX__) return;
  window.__CODEX_IMAGE_DISPLAY_FIX__ = true;

  function toast(msg){
    let t = document.getElementById('__codexToastImageFix');
    if (!t) {
      t = document.createElement('div');
      t.id = '__codexToastImageFix';
      t.style.cssText = 'position:fixed;left:12px;right:12px;bottom:92px;z-index:2147483647;background:#101010;color:white;border:1px solid #333;border-radius:16px;padding:12px;font:800 14px system-ui;text-align:center';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(t.__timer);
    t.__timer = setTimeout(()=>t.style.display='none',2500);
  }

  function fileToDataURL(file){
    return new Promise((resolve,reject)=>{
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => reject(fr.error || new Error('FileReader failed'));
      fr.readAsDataURL(file);
    });
  }

  function loadImage(src){
    return new Promise(resolve=>{
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function drawContain(ctx,img,w,h){
    const iw = img.naturalWidth || img.width || w;
    const ih = img.naturalHeight || img.height || h;
    const sc = Math.min(w/iw,h/ih);
    const dw = iw*sc, dh = ih*sc;
    const dx = (w-dw)/2, dy = (h-dh)/2;
    ctx.clearRect(0,0,w,h);
    ctx.drawImage(img,dx,dy,dw,dh);
  }

  async function applyImage(src,name){
    const img = await loadImage(src);

    window.posterSrc = src;
    window.importedPosterSrc = src;
    window.currentPosterSrc = src;
    window.sourcePosterSrc = src;
    window.selectedImageSrc = src;
    window.lastImportedImageSrc = src;

    window.poster = img;
    window.posterImg = img;
    window.posterImage = img;
    window.basePoster = img;
    window.sourceImage = img;
    window.importedImage = img;

    try { localStorage.setItem('posterSrc', src); } catch(e){}
    try { localStorage.setItem('importedPosterSrc', src); } catch(e){}
    try { localStorage.setItem('currentPosterSrc', src); } catch(e){}

    try { posterSrc = src; } catch(e){}
    try { poster = img; } catch(e){}
    try { posterImg = img; } catch(e){}
    try { posterImage = img; } catch(e){}
    try { basePoster = img; } catch(e){}

    document.querySelectorAll('img').forEach(el=>{
      const key = ((el.id||'')+' '+(el.className||'')+' '+(el.alt||'')).toLowerCase();
      if (!el.src || /poster|preview|image|photo|board|upload|import|รูป|ภาพ|บอร์ด/.test(key)) {
        el.src = src;
        el.style.display = '';
        el.style.visibility = 'visible';
        el.style.opacity = '1';
      }
    });

    document.querySelectorAll('canvas').forEach(c=>{
      try {
        const r = c.getBoundingClientRect();
        if (!c.width || c.width < 20) c.width = Math.max(300, Math.round(r.width || 1080));
        if (!c.height || c.height < 20) c.height = Math.max(300, Math.round(r.height || 1350));
        const ctx = c.getContext('2d');
        if (ctx && img) drawContain(ctx,img,c.width,c.height);
      } catch(e){}
    });

    [
      'draw','render','renderPoster','redraw','updateCanvas','refresh','paint',
      'drawBoard','renderBoard','updatePoster','showPoster','previewPoster',
      'fitPoster','resetPoster','renderAll'
    ].forEach(fn=>{
      try { if (typeof window[fn] === 'function') window[fn](); } catch(e){}
    });

    setTimeout(()=>{
      document.querySelectorAll('canvas').forEach(c=>{
        try {
          const ctx = c.getContext('2d');
          if (ctx && img) drawContain(ctx,img,c.width,c.height);
        } catch(e){}
      });
    },300);

    showDebugThumb(src);
    toast('เลือกรูปแล้ว: ' + (name || 'image'));
  }

  function showDebugThumb(src){
    let box = document.getElementById('__codexImageDebugThumb');
    if (!box) {
      box = document.createElement('div');
      box.id = '__codexImageDebugThumb';
      box.style.cssText = 'position:fixed;right:12px;top:90px;z-index:2147483647;width:92px;height:120px;background:#000;border:2px solid #39ff00;border-radius:14px;overflow:hidden;box-shadow:0 8px 28px #0009';
      box.innerHTML = '<img style="width:100%;height:100%;object-fit:contain">';
      document.body.appendChild(box);
    }
    box.querySelector('img').src = src;
  }

  async function handleFile(file){
    if (!file) return;
    const src = await fileToDataURL(file);
    await applyImage(src,file.name || 'image');
  }

  document.addEventListener('change', function(ev){
    const el = ev.target;
    if (!el || el.tagName !== 'INPUT' || el.type !== 'file') return;
    const file = el.files && el.files[0];
    if (file) handleFile(file).catch(e=>alert('นำเข้ารูปไม่สำเร็จ: '+e.message));
  }, true);

  window.manualApplyPosterFile = handleFile;
  window.manualApplyPosterSrc = applyImage;

  console.log('[Codex Image Display Fix] ready');
})();
