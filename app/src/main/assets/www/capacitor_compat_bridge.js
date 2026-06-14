(function(){
  if (window.__CAPACITOR_COMPAT_BRIDGE_DEVIL__) return;
  window.__CAPACITOR_COMPAT_BRIDGE_DEVIL__ = true;

  window.Capacitor = window.Capacitor || {};
  window.Capacitor.Plugins = window.Capacitor.Plugins || {};

  const pendingOcr = {};

  function toast(msg){
    try{
      let t = document.getElementById('__capCompatToast');
      if(!t){
        t = document.createElement('div');
        t.id = '__capCompatToast';
        t.style.cssText = 'position:fixed;left:12px;right:12px;bottom:88px;z-index:2147483647;background:#111;color:#fff;border:1px solid #333;border-radius:16px;padding:12px;font:800 14px system-ui;text-align:center;box-shadow:0 8px 28px #0009';
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.style.display = 'block';
      clearTimeout(t.__timer);
      t.__timer = setTimeout(()=>t.style.display='none',2600);
    }catch(e){}
  }

  window.__DEVIL_NATIVE_OCR_RESOLVE = function(id, payload){
    const p = pendingOcr[id];
    if(!p) return;

    delete pendingOcr[id];

    try{
      const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
      p.resolve(data);
    }catch(e){
      p.reject(e);
    }
  };

  window.Capacitor.Plugins.SaveImagePlugin = window.Capacitor.Plugins.SaveImagePlugin || {};
  window.Capacitor.Plugins.SaveImagePlugin.savePng = function(opts){
    opts = opts || {};
    const image = opts.image || opts.data || '';
    const filename = opts.filename || ('devil-export-' + Date.now() + '.png');

    return new Promise(function(resolve, reject){
      try{
        if(window.AndroidBridge && typeof window.AndroidBridge.saveBase64Image === 'function'){
          const res = window.AndroidBridge.saveBase64Image(image, filename);
          if(String(res || '').startsWith('SAVE_ERROR')){
            reject(new Error(res));
            return;
          }
          toast('บันทึกรูปแล้ว');
          resolve({ uri:String(res || '') });
          return;
        }

        const a = document.createElement('a');
        a.href = image;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        resolve({ uri:filename });
      }catch(e){
        reject(e);
      }
    });
  };

  window.Capacitor.Plugins.SaveImage = window.Capacitor.Plugins.SaveImage || {};
  window.Capacitor.Plugins.SaveImage.saveBase64 = function(opts){
    opts = opts || {};
    return window.Capacitor.Plugins.SaveImagePlugin.savePng({
      image: opts.data || opts.image || '',
      filename: opts.filename || ('devil-export-' + Date.now() + '.png')
    });
  };

  window.Capacitor.Plugins.OcrPlugin = window.Capacitor.Plugins.OcrPlugin || {};
  window.Capacitor.Plugins.OcrPlugin.scanImage = function(opts){
    opts = opts || {};
    const image = opts.image || opts.data || '';

    return new Promise(function(resolve, reject){
      try{
        if(!window.AndroidBridge || typeof window.AndroidBridge.ocrScanImage !== 'function'){
          reject(new Error('AndroidBridge.ocrScanImage not available'));
          return;
        }

        const id = 'ocr_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        pendingOcr[id] = { resolve, reject };

        toast('กำลัง OCR...');
        window.AndroidBridge.ocrScanImage(id, image);

        setTimeout(function(){
          if(pendingOcr[id]){
            delete pendingOcr[id];
            reject(new Error('OCR timeout'));
          }
        }, 45000);
      }catch(e){
        reject(e);
      }
    });
  };

  console.log('[DEVIL Capacitor Compat Bridge] ready');
})();
