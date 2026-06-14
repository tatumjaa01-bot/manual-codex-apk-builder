(function(){
  window.Capacitor = window.Capacitor || {};
  Capacitor.Plugins = Capacitor.Plugins || {};

  function saveNative(opts){
    opts = opts || {};
    return new Promise(function(resolve, reject){
      try{
        var data = opts.image || opts.data || opts.base64 || "";
        var filename = opts.filename || opts.name || ("winner-export-" + Date.now() + ".png");

        if(window.AndroidBridge && AndroidBridge.saveBase64Image){
          var raw = AndroidBridge.saveBase64Image(data, filename);
          var res = {};
          try{ res = JSON.parse(raw || "{}"); }catch(e){ res = {ok:false, error:String(raw)}; }
          if(res.ok) resolve(res);
          else reject(res);
          return;
        }

        reject({ok:false, error:"AndroidBridge.saveBase64Image missing"});
      }catch(e){
        reject({ok:false, error:String(e)});
      }
    });
  }

  Capacitor.Plugins.SaveImagePlugin = Capacitor.Plugins.SaveImagePlugin || {};
  Capacitor.Plugins.SaveImagePlugin.savePng = saveNative;

  Capacitor.Plugins.SaveImage = Capacitor.Plugins.SaveImage || {};
  Capacitor.Plugins.SaveImage.saveBase64 = saveNative;

  var ocrSeq = 1;
  var ocrPending = {};

  window.__DEVIL_NATIVE_OCR_RESOLVE = function(id, payload){
    var p = ocrPending[id];
    if(!p) return;
    delete ocrPending[id];

    try{
      if(typeof payload === "string") payload = JSON.parse(payload);
    }catch(e){}

    p.resolve(payload || {ok:false, text:"", lines:[]});
  };

  Capacitor.Plugins.OcrPlugin = Capacitor.Plugins.OcrPlugin || {};
  Capacitor.Plugins.OcrPlugin.scanImage = function(opts){
    opts = opts || {};
    return new Promise(function(resolve){
      try{
        var image = opts.image || opts.data || opts.base64 || "";
        var id = "ocr_" + (ocrSeq++);

        ocrPending[id] = {resolve: resolve};

        setTimeout(function(){
          if(ocrPending[id]){
            delete ocrPending[id];
            resolve({ok:false, engine:"timeout", text:"", lines:[]});
          }
        }, 45000);

        if(window.AndroidBridge && AndroidBridge.ocrScanImage){
          AndroidBridge.ocrScanImage(id, image);
        }else{
          delete ocrPending[id];
          resolve({ok:false, engine:"missing_bridge", text:"", lines:[]});
        }
      }catch(e){
        resolve({ok:false, engine:"error", text:"", lines:[], error:String(e)});
      }
    });
  };
})();
