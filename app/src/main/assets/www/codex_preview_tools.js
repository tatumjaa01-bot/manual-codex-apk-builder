(function(){
  if (window.__CODEX_PREVIEW_TOOLS_V2_FIXED__) return;
  window.__CODEX_PREVIEW_TOOLS_V2_FIXED__ = true;

  function toast(msg){
    let t = document.getElementById('__codexToast');
    if (!t) {
      t = document.createElement('div');
      t.id = '__codexToast';
      t.style.cssText = 'position:fixed;left:12px;right:12px;bottom:84px;z-index:2147483647;background:#111;color:#fff;border:1px solid #333;border-radius:16px;padding:12px 14px;font:800 14px system-ui;text-align:center;box-shadow:0 8px 30px #0009';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(t.__timer);
    t.__timer = setTimeout(()=>t.style.display='none',2500);
  }

  async function applyPosterSrc(src, fileName){
    window.posterSrc = src;
    window.importedPosterSrc = src;
    window.currentPosterSrc = src;

    try {
      if (typeof window.manualSetPosterSrc === 'function') {
        await window.manualSetPosterSrc(src);
        toast('นำเข้าโปสเตอร์แล้ว: ' + (fileName || 'image'));
        return;
      }
    } catch(e) {}

    try {
      if (typeof window.loadImg === 'function') {
        const img = await window.loadImg(src);
        window.poster = img;
        window.posterImg = img;
        window.posterImage = img;
        window.basePoster = img;
      }
    } catch(e) {}

    ['draw','render','renderPoster','redraw','updateCanvas','refresh','paint','drawBoard','renderBoard'].forEach(function(fn){
      try { if (typeof window[fn] === 'function') window[fn](); } catch(e){}
    });

    toast('นำเข้าโปสเตอร์แบบ fallback แล้ว');
  }

  function openPicker(){
    let input = document.getElementById('__codexPosterPicker');
    if (!input) {
      input = document.createElement('input');
      input.id = '__codexPosterPicker';
      input.type = 'file';
      input.accept = 'image/*';
      input.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
      input.addEventListener('change', function(){
        const file = input.files && input.files[0];
        if (!file) return;
        const src = URL.createObjectURL(file);
        applyPosterSrc(src, file.name || '');
        input.value = '';
      });
      document.body.appendChild(input);
    }
    input.click();
  }

  function goBack(){
    if (location.protocol === 'file:') location.href = 'index.html';
    else location.href = '/';
  }

  function mount(){
    if (document.getElementById('__codexPreviewTools')) return;

    const bar = document.createElement('div');
    bar.id = '__codexPreviewTools';
    bar.style.cssText = 'position:fixed;left:10px;right:10px;bottom:12px;z-index:2147483647;display:flex;gap:8px;justify-content:center;pointer-events:auto';

    const back = document.createElement('button');
    back.textContent = '← กลับ Codex';
    back.style.cssText = 'border:0;border-radius:999px;padding:12px 16px;background:#39ff00;color:#050505;font:900 15px system-ui;box-shadow:0 8px 28px #0008';
    back.onclick = goBack;

    const pick = document.createElement('button');
    pick.textContent = 'นำเข้าโปสเตอร์';
    pick.style.cssText = 'border:0;border-radius:999px;padding:12px 16px;background:#ff8500;color:#050505;font:900 15px system-ui;box-shadow:0 8px 28px #0008';
    pick.onclick = openPicker;

    bar.appendChild(back);
    bar.appendChild(pick);
    document.body.appendChild(bar);
  }

  window.manualImportPoster = openPicker;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
