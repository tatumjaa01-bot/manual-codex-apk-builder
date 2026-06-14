(function(){
  if (window.__MANUAL_IMPORT_POSTER_FIX__) return;
  window.__MANUAL_IMPORT_POSTER_FIX__ = true;

  let picker = null;

  function ensurePicker(){
    if (picker) return picker;

    picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/*';
    picker.style.position = 'fixed';
    picker.style.left = '-9999px';
    picker.style.top = '-9999px';
    picker.style.opacity = '0';

    picker.addEventListener('change', async function(){
      const file = picker.files && picker.files[0];
      if (!file) return;

      const src = URL.createObjectURL(file);

      window.posterSrc = src;
      window.importedPosterSrc = src;
      window.currentPosterSrc = src;

      try {
        if (typeof window.loadImg === 'function') {
          const img = await window.loadImg(src);
          window.poster = img;
          window.posterImg = img;
          window.posterImage = img;
          window.basePoster = img;
        } else {
          const img = new Image();
          img.onload = function(){
            window.poster = img;
            window.posterImg = img;
            window.posterImage = img;
            window.basePoster = img;
            redrawAll();
          };
          img.src = src;
        }
      } catch(e) {
        console.error(e);
        alert('นำเข้าโปสเตอร์ไม่สำเร็จ: ' + e.message);
      }

      redrawAll();
      picker.value = '';
    });

    document.documentElement.appendChild(picker);
    return picker;
  }

  function redrawAll(){
    ['draw','render','renderPoster','redraw','updateCanvas','refresh','paint'].forEach(function(name){
      try {
        if (typeof window[name] === 'function') window[name]();
      } catch(e){}
    });

    try {
      window.dispatchEvent(new CustomEvent('manual-poster-imported', {
        detail:{ src:window.posterSrc }
      }));
    } catch(e){}
  }

  function textOf(el){
    if (!el) return '';
    return [
      el.id || '',
      el.className || '',
      el.name || '',
      el.title || '',
      el.getAttribute && el.getAttribute('aria-label') || '',
      el.getAttribute && el.getAttribute('data-action') || '',
      el.textContent || ''
    ].join(' ').toLowerCase();
  }

  function shouldHandle(el){
    const t = textOf(el);
    const hasPoster = /poster|โปสเตอร์|บอร์ด|ประกาศ/.test(t);
    const hasImport = /import|upload|choose|select|open|file|image|photo|นำเข้า|อัพ|อัป|เลือก|รูป|ภาพ/.test(t);

    if (hasPoster && hasImport) return true;
    if (/importposter|posterimport|uploadposter|posterupload|pickposter|posterfile/.test(t)) return true;

    return false;
  }

  document.addEventListener('click', function(ev){
    const el = ev.target && ev.target.closest
      ? ev.target.closest('button,a,label,div,span,input')
      : ev.target;

    if (!el) return;
    if (el.tagName === 'INPUT' && el.type === 'file') return;

    if (shouldHandle(el)) {
      ev.preventDefault();
      ev.stopPropagation();
      ensurePicker().click();
      return false;
    }
  }, true);

  window.manualImportPoster = function(){
    ensurePicker().click();
  };

  setTimeout(ensurePicker, 500);
})();
