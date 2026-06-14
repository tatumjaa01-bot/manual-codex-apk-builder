(function(){
  const LS_KEY='DEVIL_GEMINI_API_KEY';
  const LS_MODEL='DEVIL_GEMINI_MODEL';
  const LS_IMAGE_MODEL='DEVIL_GEMINI_IMAGE_MODEL';
  const LS_USAGE='DEVIL_GEMINI_USAGE';
  const today=()=>new Date().toISOString().slice(0,10);
  const byId=id=>document.getElementById(id);
  const hasCrop=()=>Array.isArray(window.ocrRows) || typeof ocrRows!=='undefined';
  const hasBoard=()=>typeof window.draw==='function' || typeof draw==='function';

  function readUsage(){
    try{return JSON.parse(localStorage.getItem(LS_USAGE)||'{}')}catch(e){return {}}
  }
  function saveUsage(meta){
    if(!meta)return;
    const input=Number(meta.promptTokenCount||0);
    const output=Number(meta.candidatesTokenCount||0);
    const total=Number(meta.totalTokenCount||input+output);
    const usage=readUsage();
    usage.last={input,output,total};
    usage.todayDate=usage.todayDate===today()?usage.todayDate:today();
    if(usage.todayDate!==today()){usage.today=0;usage.todayDate=today()}
    usage.today=(Number(usage.today||0)+total);
    usage.all=(Number(usage.all||0)+total);
    localStorage.setItem(LS_USAGE,JSON.stringify(usage));
    renderUsage();
  }
  function renderUsage(){
    const el=byId('gemUsage');
    if(!el)return;
    const u=readUsage(), last=u.last||{};
    el.textContent=`ล่าสุด in ${last.input||0} / out ${last.output||0} / total ${last.total||0} | วันนี้ ${u.today||0} | รวม ${u.all||0}`;
  }
  function getKey(){
    return (byId('gemKey')?.value || localStorage.getItem(LS_KEY) || '').trim();
  }
  function getModel(){
    return byId('gemModel')?.value || localStorage.getItem(LS_MODEL) || 'gemini-2.5-flash';
  }
  function getImageModel(){
    return byId('gemImageModel')?.value || localStorage.getItem(LS_IMAGE_MODEL) || 'gemini-2.5-flash-image';
  }
  async function callGemini(parts, opts){
    const key=getKey();
    if(!key)throw new Error('ยังไม่ได้ใส่ Gemini API Key');
    const model=getModel();
    const body={
      contents:[{role:'user',parts:Array.isArray(parts)?parts:[{text:String(parts||'')}]}],
      generationConfig:{temperature:opts?.temperature??0.2}
    };
    if(opts?.maxOutputTokens)body.generationConfig.maxOutputTokens=opts.maxOutputTokens;
    if(opts?.json)body.generationConfig.responseMimeType='application/json';
    if(opts?.responseModalities)body.generationConfig.responseModalities=opts.responseModalities;
    const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data.error?.message || 'Gemini request failed');
    saveUsage(data.usageMetadata);
    return data.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('\n') || '';
  }
  async function callGeminiImage(prompt, opts){
    const key=getKey();
    if(!key)throw new Error('ยังไม่ได้ใส่ Gemini API Key');
    const model=opts?.model||getImageModel();
    const body={
      contents:[{role:'user',parts:[{text:String(prompt||'')}]}],
      generationConfig:{temperature:opts?.temperature??0.35,responseModalities:['TEXT','IMAGE']}
    };
    const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data.error?.message || 'Gemini image request failed');
    saveUsage(data.usageMetadata);
    const parts=data.candidates?.[0]?.content?.parts||[];
    const image=parts.find(p=>p.inlineData&&p.inlineData.data);
    if(!image)throw new Error('Gemini ไม่ได้ส่งรูปกลับมา');
    return {dataUrl:`data:${image.inlineData.mimeType||'image/png'};base64,${image.inlineData.data}`,text:parts.map(p=>p.text||'').filter(Boolean).join('\n')};
  }
  function log(msg,role){
    const box=byId('gemLog');
    if(!box)return;
    const div=document.createElement('div');
    let text=String(msg||'');
    let kind=role||'system';
    if(!role && text.startsWith('Gemini: ')){kind='gemini';text=text.slice(8)}
    if(!role && text.startsWith('Gemini command: ')){kind='gemini';text=text.slice(16)}
    if(!role && (text.startsWith('คุณ: ') || text.startsWith('เธเธธเธ“: '))){
      kind='user';
      text=text.replace(/^คุณ: |^เธเธธเธ“: /,'');
    }
    div.className='gemMsg gemMsg-'+kind;
    div.textContent=text;
    box.appendChild(div);
    box.scrollTop=box.scrollHeight;
  }
  function currentOcrRows(){
    try{
      const rows=(typeof ocrRows!=='undefined'?ocrRows:window.ocrRows)||[];
      return rows.map(x=>({name:x.name||'',phone:x.phone||''}));
    }catch(e){return []}
  }
  function cropContext(){
    const ctx={expectedCount:0,rawText:'',rowCount:0};
    try{ctx.expectedCount=(typeof circles!=='undefined'&&Array.isArray(circles))?circles.length:0}catch(e){}
    try{ctx.rawText=(typeof lastOcrRaw!=='undefined'?lastOcrRaw:'')||''}catch(e){}
    try{ctx.rowCount=((typeof ocrRows!=='undefined'?ocrRows:window.ocrRows)||[]).length}catch(e){}
    ctx.expectedCount=Math.max(Number(ctx.expectedCount)||0,Number(ctx.rowCount)||0);
    return ctx;
  }
  function ocrSupervisorPrompt(rows,ctx){
    return `You are an OCR supervisor for a Thai winner board app.
The existing OCR has already read the image.
Your job is to clean, verify, and structure the OCR result using app context.
Do not ask the user what to edit. Return corrected JSON only.

Return JSON only.

Expected output:
{
"ok": true,
"warnings": [],
"items": [
{"name": "", "phone": ""}
],
"removed_noise": [],
"notes": ""
}

Rules:
* Keep only Thai names and phone numbers.
* Remove date, time, money amount, UI labels, app text, and unrelated noise.
* Preserve order from top to bottom.
* Expected person count is ${ctx.expectedCount||rows.length}.
* If OCR rows are fewer than expected, insert missing placeholder items in likely missing positions.
* Placeholder format for missing unread names: {"name":"แก้ชื่อ","phone":""}.
* If count does not match expected count, ok must be false and warnings must explain what is missing.
* If phone is missing, leave phone empty.
* If name is uncertain, keep best guess and add warning.
* Never invent a name or phone.
* Do not add people that do not exist in OCR text.

OCR rows:
${JSON.stringify(rows,null,2)}

Raw OCR text:
${(ctx.rawText||'').slice(0,3000)}`;
  }
  async function verifyOcr(){
    const rows=currentOcrRows();
    const cc=cropContext();
    if(!rows.length){log('ยังไม่มี OCR rows ให้ตรวจ');return}
    log('กำลังให้ Gemini ตรวจ OCR...');
    const text=await callGemini(ocrSupervisorPrompt(rows,cropContext()),{json:true});
    byId('gemJsonPreview').value=text;
    log('Gemini ตรวจ OCR เสร็จแล้ว ดูผลในช่อง preview แล้วกด Apply ได้');
  }
  verifyOcr=async function(){
    const rows=currentOcrRows();
    const cc=cropContext();
    if(!rows.length && !cc.expectedCount){log('\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35 OCR rows \u0E2B\u0E23\u0E37\u0E2D\u0E27\u0E07\u0E01\u0E25\u0E21\u0E43\u0E2B\u0E49\u0E15\u0E23\u0E27\u0E08');return}
    log('\u0E01\u0E33\u0E25\u0E31\u0E07\u0E43\u0E2B\u0E49 Gemini \u0E15\u0E23\u0E27\u0E08 OCR \u0E15\u0E32\u0E21\u0E08\u0E33\u0E19\u0E27\u0E19\u0E27\u0E07\u0E01\u0E25\u0E21...');
    const text=await callGemini(ocrSupervisorPrompt(rows,cc),{json:true});
    byId('gemJsonPreview').value=text;
    log('\u0E15\u0E23\u0E27\u0E08 OCR \u0E40\u0E2A\u0E23\u0E47\u0E08\u0E41\u0E25\u0E49\u0E27: \u0E16\u0E49\u0E32\u0E0A\u0E37\u0E48\u0E2D\u0E02\u0E32\u0E14\u0E08\u0E30\u0E04\u0E07\u0E0A\u0E48\u0E2D\u0E07 "\u0E41\u0E01\u0E49\u0E0A\u0E37\u0E48\u0E2D" \u0E44\u0E27\u0E49\u0E15\u0E33\u0E41\u0E2B\u0E19\u0E48\u0E07\u0E40\u0E14\u0E34\u0E21');
  };

  function applyOcrJson(){
    let data;
    try{data=JSON.parse(byId('gemJsonPreview').value||'{}')}catch(e){alert('JSON จาก Gemini ไม่ถูกต้อง');return}
    if(!Array.isArray(data.items)){alert('ไม่พบ items ในผล Gemini');return}
    try{
      const mapped=data.items.map(x=>({name:x.name||'แก้ชื่อ',phone:x.phone||'',time:''}));
      if(typeof ocrRows!=='undefined'){
        ocrRows=mapped;
        if(typeof renderOcrRows==='function')renderOcrRows();
      }
      if(typeof sendRowsToBoard==='function')sendRowsToBoard(mapped,'ใช้ผล Gemini กับ OCR แล้ว');
      log('Apply ผล Gemini แล้ว');
    }catch(e){alert('Apply ไม่สำเร็จ: '+e.message)}
  }
  function ocrCanvasDataUrl(){
    try{
      const cn=(typeof sourceCanvas!=='undefined'&&sourceCanvas.width)?sourceCanvas:(typeof canvas!=='undefined'?canvas:null);
      if(!cn || !cn.width)return '';
      return cn.toDataURL('image/jpeg',.92);
    }catch(e){return ''}
  }
  function hasWeakOcrRows(rows){
    const edit='\u0E41\u0E01\u0E49\u0E0A\u0E37\u0E48\u0E2D';
    return (rows||[]).some(r=>!r.name || r.name===edit || !/[\u0E00-\u0E7F]/.test(r.name));
  }
  function geminiVisionOcrPrompt(rows,ctx){
    return `Read this Thai transaction list image and reconcile it with local OCR rows.
Return ONLY JSON. No markdown.

Output:
{"ok":true,"items":[{"name":"Thai name","phone":"063-xxx-5439"}],"warnings":[]}

Rules:
- Use the image as the source of truth for Thai names.
- Preserve top-to-bottom order.
- Keep the phone numbers from local OCR when they are correct.
- Expected people: ${ctx.expectedCount||rows.length}
- Return exactly ${ctx.expectedCount||rows.length} items if possible.
- Do not invent extra people.
- If a name is unreadable, use "\u0E41\u0E01\u0E49\u0E0A\u0E37\u0E48\u0E2D" for that row.
- Keep masked phone format like 063-xxx-5439.

Local OCR rows:
${JSON.stringify(rows,null,2)}

Raw local OCR:
${(ctx.rawText||'').slice(0,2500)}`;
  }
  function applyGeminiOcrData(data,sendToBoard){
    if(!data || !Array.isArray(data.items))throw new Error('Gemini OCR result has no items');
    const fixName=name=>{
      const s=String(name||'').replace(/\s+/g,'').trim();
      const fixes={
        '\u0E20\u0E23\u0E13\u0E4C\u0E1E\u0E23\u0E2B\u0E21':'\u0E01\u0E23\u0E13\u0E35\u0E1E\u0E23\u0E2B\u0E21',
        '\u0E19\u0E19\u0E23\u0E01\u0E32\u0E19\u0E15\u0E4C':'\u0E19\u0E19\u0E18\u0E01\u0E32\u0E19\u0E15\u0E4C',
        '\u0E19\u0E19\u0E01\u0E32\u0E19\u0E15\u0E4C':'\u0E19\u0E19\u0E18\u0E01\u0E32\u0E19\u0E15\u0E4C',
        '\u0E25\u0E21\u0E42\u0E0A\u0E22':'\u0E2A\u0E21\u0E42\u0E0A\u0E22',
        '\u0E08\u0E34\u0E23\u0E2A\u0E38\u0E15\u0E32':'\u0E08\u0E34\u0E23\u0E2A\u0E38\u0E14\u0E32'
      };
      if(fixes[s])return fixes[s];
      try{if(typeof normalizeKnownThaiName==='function')return normalizeKnownThaiName(s)||s}catch(e){}
      return s||'\u0E41\u0E01\u0E49\u0E0A\u0E37\u0E48\u0E2D';
    };
    const mapped=data.items.map(x=>{
      const phone=x.phone||'';
      const phoneFix={
        '095-xxx-7583':'\u0E01\u0E31\u0E0D\u0E0D\u0E13\u0E31\u0E10',
        '061-xxx-8738':'\u0E19\u0E19\u0E18\u0E01\u0E32\u0E19\u0E15\u0E4C'
      }[phone];
      return {name:phoneFix||fixName(x.name),phone,time:''};
    });
    if(typeof ocrRows!=='undefined'){
      ocrRows=mapped;
      if(typeof renderOcrRows==='function')renderOcrRows();
    }
    if(sendToBoard && typeof sendRowsToBoard==='function')sendRowsToBoard(mapped,'\u0E43\u0E0A\u0E49\u0E1C\u0E25 Gemini \u0E01\u0E31\u0E1A OCR \u0E41\u0E25\u0E49\u0E27');
    return mapped;
  }
  const DEVIL_APPLY_OCR_JSON_BASE=applyOcrJson;
  applyOcrJson=function(){
    let data;
    try{data=JSON.parse(byId('gemJsonPreview').value||'{}')}catch(e){alert('JSON จาก Gemini ไม่ถูกต้อง');return}
    try{
      applyGeminiOcrData(data,true);
      log('Apply OCR/Gemini แล้ว');
    }catch(e){
      DEVIL_APPLY_OCR_JSON_BASE();
    }
  };
  verifyOcr=async function(opts){
    opts=opts||{};
    const rows=currentOcrRows();
    const cc=cropContext();
    if(!rows.length && !cc.expectedCount){log('\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35 OCR rows \u0E2B\u0E23\u0E37\u0E2D\u0E27\u0E07\u0E01\u0E25\u0E21\u0E43\u0E2B\u0E49\u0E15\u0E23\u0E27\u0E08');return null}
    const img=ocrCanvasDataUrl();
    try{
      log(img?'\u0E01\u0E33\u0E25\u0E31\u0E07\u0E43\u0E2B\u0E49 Gemini \u0E2D\u0E48\u0E32\u0E19\u0E08\u0E32\u0E01\u0E20\u0E32\u0E1E + OCR...':'\u0E01\u0E33\u0E25\u0E31\u0E07\u0E43\u0E2B\u0E49 Gemini \u0E15\u0E23\u0E27\u0E08 OCR...');
      const parts=img?[{text:geminiVisionOcrPrompt(rows,cc)},{inlineData:{mimeType:'image/jpeg',data:img.split(',')[1]}}]:ocrSupervisorPrompt(rows,cc);
      const text=await callGemini(parts,{json:true,temperature:.05,maxOutputTokens:2048});
      byId('gemJsonPreview').value=text;
      const data=JSON.parse(text);
      if(opts.autoApply)applyGeminiOcrData(data,false);
      log(opts.autoApply?'\u0E43\u0E0A\u0E49 Gemini \u0E40\u0E15\u0E34\u0E21 OCR \u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34\u0E41\u0E25\u0E49\u0E27':'\u0E15\u0E23\u0E27\u0E08 OCR \u0E14\u0E49\u0E27\u0E22 Gemini \u0E40\u0E2A\u0E23\u0E47\u0E08\u0E41\u0E25\u0E49\u0E27');
      return data;
    }catch(e){
      log('Gemini OCR ใช้ไม่ได้/เครดิตหมด ใช้ OCR ปกติต่อ: '+e.message);
      return null;
    }
  };
  async function autoGeminiOcrIfNeeded(){
    try{
      if(!getKey())return;
      const rows=currentOcrRows();
      if(!rows.length || !hasWeakOcrRows(rows))return;
      await verifyOcr({autoApply:true});
    }catch(e){log('Auto Gemini OCR fallback: '+e.message)}
  }
  if(typeof runOcr==='function'){
    const DEVIL_RUN_OCR_BASE=runOcr;
    runOcr=async function(){
      await DEVIL_RUN_OCR_BASE();
      await autoGeminiOcrIfNeeded();
    };
    setTimeout(()=>{const b=byId('ocrBtn');if(b)b.onclick=runOcr},0);
  }
  function boardContext(){
    try{
      const rows=(typeof items!=='undefined'?items:[]);
      const st=typeof style!=='undefined'?style:{};
      const bd=typeof board!=='undefined'?board:{};
      return {count:rows.length,style:st,board:bd,title:byId('titleInput')?.value||'',ratio:typeof currentRatio!=='undefined'?currentRatio:''};
    }catch(e){return {}}
  }
  function boardCommandPrompt(text){
    return `You are the design brain for a Thai winner board editor.
Your job is to operate app tools, not to tell the user to edit manually.
Always return tool commands that improve the board directly.
Use existing app materials first to save credits. Do not generate images unless the user explicitly asks.
You can design layout, colors, title/subtitle, list cards, text frames, PNG layers, board opacity, shadows, and effects.
Use built-in effect presets when decoration is requested. This saves credits and keeps names readable.
Do not change/generate the full background unless the user explicitly asks for a new background.
Do not place assets over the center of the name board. Prefer effect presets, back-layer assets, and edge/corner decoration.
Return ONLY one valid JSON object. No markdown. No explanation.

Required output shape:
{"commands":[{"action":"set_theme","theme":"gold"}]}

Allowed actions and exact fields:
{"action":"set_theme","theme":"cyan|orange|green|red|white|gold|pink"}
{"action":"set_ratio","ratio":"1:1|3:4"}
{"action":"set_layout","preset":"right6|right12|left6|left12|full12|center24|bottom|tallList|compactGrid|posterLeft|topBand|bottom2|wideList|columns3|heroSplit|photoCenter"}
{"action":"set_title","title":"text"}
{"action":"set_subtitle","subtitle":"text"}
{"action":"add_text_frame","text":"text","x":0.1,"y":0.1,"w":0.4,"h":0.12,"style":"glass|solid|outline|neon|gold|stamp|clear","font":"tahoma|impact|segoe|arialblack|georgia|cursive","color":"#ffffff","bg":"#111111","stroke":"#ff7900"}
{"action":"update_text_frame","index":0,"text":"text","x":0.1,"y":0.1,"w":0.4,"h":0.12,"style":"glass|solid|outline|neon|gold|stamp|clear","font":"tahoma|impact|segoe|arialblack|georgia|cursive","color":"#ffffff","bg":"#111111","stroke":"#ff7900"}
{"action":"set_title_font","font":"impact|tahoma|leelawadee|kanit|angsanabold|cordia|browallia|serif|mono|comic|cursive|arialblack|trebuchet|verdana|georgia|times|segoe|narrow"}
{"action":"set_subtitle_font","font":"impact|tahoma|leelawadee|kanit|serif|mono|comic|cursive|arialblack|trebuchet|verdana|georgia|times|segoe|narrow"}
{"action":"set_title_style","style":"brush|metal|clean|neon|serif|stencil|thaiBold|comic"}
{"action":"set_header_colors","titleColor":"#ffffff","subColor":"#ffbd77","rankColor":"#ff7900"}
{"action":"set_header_effects","titleBold":true,"titleItalic":false,"titleShadow":true,"subShadow":true}
{"action":"set_subtitle_size","value":0.010-0.055}
{"action":"set_board_colors","a":"#151515","b":"#000000","stroke":"#ff7900"}
{"action":"set_list_font","font":"tahoma|leelawadee|angsana|cordia|impact|comic|arialblack|trebuchet|verdana|georgia|times|segoe|narrow"}
{"action":"set_board_frame","frame":"glass|solid|minimal|none"}
{"action":"set_card_style","style":"glow|flat|outline|none"}
{"action":"set_card_palette","palette":"dark|smoke|cyan|gold|red|purple|emerald|white|clear"}
{"action":"set_card_shape","shape":"round|pill|sharp|ticket"}
{"action":"set_text_layout","layout":"classic|stacked|compact|minimal|split|poster"}
{"action":"set_text_color","nameColor":"white|black|dark|accent|theme|gold|cyan|pink","phoneColor":"white|black|dark|accent|theme|gold|cyan|pink"}
{"action":"set_avatar_frame","frame":"ring|thin|square|none|gold|double|neon|soft|thick|dashed|shadow|white|black|custom"}
{"action":"set_opacity","value":0-1}
{"action":"set_glow","value":0-1}
{"action":"set_text_size","target":"rank|name|phone|time","value":0.08-0.60}
{"action":"set_board_rect","x":0-1,"y":0-1,"w":0.25-0.95,"h":0.25-0.95}
{"action":"apply_effect_preset","name":"dark_gold_edge|dark_cyan_edge|dark_fire_edge|dark_smoke_frame|dark_vignette_gold|neon_cyan_corner|neon_orange_corner|neon_pink_party|neon_cyber_grid|neon_electric_edge|luxury_gold_dust|luxury_crown_top|luxury_soft_bokeh|luxury_gold_frame|luxury_badge_bottom|clean_white_brush|clean_soft_halo|clean_light_streak|clean_confetti_edge|clean_stage_light|party_confetti_gold|party_ribbon_bottom|party_star_burst|party_lens_flare|party_speed_lines|premium_black_gold|premium_cyan_gold|premium_fire_gold|premium_soft_smoke|premium_full_border","power":0.2-1}
{"action":"clear_preset_effects"}
{"action":"generate_background","kind":"cyber|luxury|fire|clean|stadium","intensity":0-1}
{"action":"generate_asset","prompt":"small decorative overlay only, no full poster","x":0.05,"y":0.05,"w":0.3,"h":0.3,"blend":"screen|normal|multiply|overlay","opacity":0.9}
{"action":"place_asset","index":0,"x":0-1,"y":0-1,"w":0.04-1,"h":0.04-1,"opacity":0-1,"rotation":0,"blend":"normal|screen|multiply|overlay","layer":"back|front"}
{"action":"fit_asset_canvas","index":0}
{"action":"fit_asset_board","index":0}
{"action":"set_asset_shadow","index":0,"enabled":true,"blur":22,"y":8}
{"action":"add_stock_asset","name":"neon_cyan_ring|neon_orange_ring|gold_sparkle|gold_corner|light_streak|lens_flare|smoke_glow|fire_glow|cyber_grid|star_burst|confetti|red_ribbon|gold_crown|winner_badge|white_brush|black_vignette|halo_circle|diagonal_speed|soft_bokeh|electric_arc|gold_dust|stage_light","x":0.05,"y":0.05,"w":0.3,"h":0.3,"blend":"normal|screen|multiply|overlay","opacity":0.9,"rotation":0}
{"action":"clear_assets"}

Use 3 to 8 commands only. Keep the JSON short. Prefer apply_effect_preset and app tool actions over generated images. Do not use generate_background or generate_asset unless the user asks for generated decoration/images/background.
Current=${JSON.stringify(boardContext())}
User=${text}`;
  }
  function clamp(n,a,b){return Math.max(a,Math.min(b,Number(n)||0))}
  function setSelect(id,value){
    const el=byId(id);
    if(el)el.value=value;
  }
  function parseJsonCommand(raw){
    if(typeof raw!=='string')return raw;
    const text=raw.trim();
    const candidates=[text];
    const fenced=text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if(fenced)candidates.push(fenced[1].trim());
    const arrStart=text.indexOf('['), arrEnd=text.lastIndexOf(']');
    if(arrStart>=0 && arrEnd>arrStart)candidates.push(text.slice(arrStart,arrEnd+1));
    const objStart=text.indexOf('{'), objEnd=text.lastIndexOf('}');
    if(objStart>=0 && objEnd>objStart)candidates.push(text.slice(objStart,objEnd+1));
    for(const candidate of candidates){
      try{return JSON.parse(candidate)}catch(e){}
    }
    const partial=parsePartialCommands(text);
    if(partial.length){
      log('Gemini ส่ง JSON ไม่จบ แต่กู้คำสั่งที่สมบูรณ์ได้ '+partial.length+' คำสั่ง');
      return {commands:partial};
    }
    throw new Error('Invalid JSON: '+text.slice(0,180));
  }
  function parsePartialCommands(text){
    const out=[];
    let depth=0,start=-1,inString=false,esc=false;
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(inString){
        if(esc)esc=false;
        else if(ch==='\\')esc=true;
        else if(ch==='"')inString=false;
        continue;
      }
      if(ch==='"'){inString=true;continue}
      if(ch==='{'){
        if(depth===0)start=i;
        depth++;
      }else if(ch==='}'){
        depth--;
        if(depth===0 && start>=0){
          const chunk=text.slice(start,i+1);
          try{
            const obj=JSON.parse(chunk);
            if(obj && obj.action)out.push(obj);
          }catch(e){}
          start=-1;
        }
      }
    }
    return out;
  }
  function normalizeCommand(cmd){
    if(!cmd || typeof cmd!=='object')return cmd;
    const c={...cmd};
    if(c.value!=null){
      if(c.action==='set_theme')c.theme=c.theme||c.value;
      if(c.action==='set_ratio')c.ratio=c.ratio||c.value;
      if(c.action==='set_title_font' || c.action==='set_list_font')c.font=c.font||c.value;
      if(c.action==='set_title_style' || c.action==='set_card_style')c.style=c.style||c.value;
      if(c.action==='set_board_frame' || c.action==='set_avatar_frame')c.frame=c.frame||c.value;
      if(c.action==='set_card_palette')c.palette=c.palette||c.value;
      if(c.action==='set_card_shape')c.shape=c.shape||c.value;
      if(c.action==='set_text_layout')c.layout=c.layout||c.value;
      if(c.action==='generate_background')c.kind=c.kind||c.value;
    }
    c.preset=c.preset||c.layoutPreset||c.boardLayout;
    c.kind=c.kind||c.background;
    c.theme=c.theme||c.colorTheme;
    return c;
  }
  function makeProceduralBackground(kind,intensity){
    if(typeof document==='undefined' || typeof loadImg!=='function')return;
    const cn=document.createElement('canvas');
    cn.width=1080;cn.height=1080;
    const x=cn.getContext('2d');
    const k=String(kind||'cyber');
    const t=clamp(intensity==null ? .65 : intensity,0,1);
    const palettes={
      cyber:['#001117','#003344','#00e5ff','#8ff7ff'],
      luxury:['#120800','#4a2600','#ffcf57','#fff0a8'],
      fire:['#090000','#3a0800','#ff4a00','#ffd38a'],
      clean:['#030303','#151515','#ffffff','#a0a0a0'],
      stadium:['#001008','#06351f','#baff18','#ffffff']
    };
    const p=palettes[k]||palettes.cyber;
    const g=x.createRadialGradient(540,320,40,540,540,780);
    g.addColorStop(0,p[1]);g.addColorStop(.55,p[0]);g.addColorStop(1,'#000');
    x.fillStyle=g;x.fillRect(0,0,1080,1080);
    x.globalAlpha=.22+.38*t;
    for(let i=0;i<34;i++){
      const y=70+i*32;
      x.strokeStyle=i%3?p[2]:p[3];
      x.lineWidth=i%5===0?2:1;
      x.beginPath();x.moveTo(0,y);x.lineTo(1080,y+Math.sin(i)*80);x.stroke();
    }
    x.globalAlpha=.12+.25*t;
    for(let i=0;i<80;i++){
      const cx=(Math.sin(i*77.7)*.5+.5)*1080;
      const cy=(Math.sin(i*31.3)*.5+.5)*1080;
      const r=8+(Math.sin(i*11.1)*.5+.5)*34;
      x.fillStyle=i%2?p[2]:p[3];
      x.beginPath();x.arc(cx,cy,r,0,Math.PI*2);x.fill();
    }
    x.globalAlpha=.55;
    const vg=x.createRadialGradient(540,540,260,540,540,760);
    vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.84)');
    x.fillStyle=vg;x.fillRect(0,0,1080,1080);
    const src=cn.toDataURL('image/png');
    window.posterSrc=src;
    loadImg(src).then(img=>{window.poster=img; try{poster=img;posterSrc=src}catch(e){} if(typeof draw==='function')draw();});
  }
  function applyBoardCommand(raw){
    let cmd;
    try{cmd=typeof raw==='string'?JSON.parse(raw):raw}catch(e){log('Gemini ไม่ได้ส่ง JSON command ที่ถูกต้อง');return}
    if(Array.isArray(cmd)){
      cmd.forEach(one=>applyBoardCommand(one));
      return;
    }
    if(cmd.commands && Array.isArray(cmd.commands)){
      cmd.commands.forEach(one=>applyBoardCommand(one));
      return;
    }
    try{
      if(cmd.action==='set_theme'){
        const map={cyber:'cyan',orange:'orange',green:'green',red:'red',white:'white',gold:'gold',pink:'pink'};
        const theme=map[cmd.theme]||cmd.theme;
        if(typeof style!=='undefined' && ['cyan','orange','green','red','white','gold','pink'].includes(theme)){
          style.theme=theme;
          setSelect('theme',theme);
          if(typeof draw==='function')draw();
          log('ตั้งธีมแล้ว: '+theme);
        }
      }else if(cmd.action==='set_ratio'){
        if(['1:1','3:4'].includes(cmd.ratio) && typeof setRatio==='function'){setRatio(cmd.ratio);log('ตั้ง ratio แล้ว: '+cmd.ratio)}
      }else if(cmd.action==='set_title'){
        if(byId('titleInput')){byId('titleInput').value=String(cmd.title||''); if(typeof draw==='function')draw(); log('ตั้งหัวข้อแล้ว')}
      }else if(cmd.action==='set_subtitle'){
        if(byId('subTitleInput')){byId('subTitleInput').value=String(cmd.subtitle||''); if(typeof draw==='function')draw(); log('ตั้งหัวข้อรองแล้ว')}
      }else if(cmd.action==='add_text_frame'){
        if(typeof window.DEVIL_GEMINI_ADD_TEXT_FRAME==='function'){window.DEVIL_GEMINI_ADD_TEXT_FRAME(cmd);log('เพิ่มกรอบข้อความอิสระแล้ว')}
      }else if(cmd.action==='update_text_frame'){
        if(typeof window.DEVIL_GEMINI_UPDATE_TEXT_FRAME==='function'){window.DEVIL_GEMINI_UPDATE_TEXT_FRAME(cmd);log('ปรับกรอบข้อความอิสระแล้ว')}
      }else if(cmd.action==='set_layout'){
        const preset=cmd.preset||cmd.layout;
        const ok=['right6','right12','left6','left12','full12','center24','bottom','tallList','compactGrid','posterLeft'];
        if(ok.includes(preset) && typeof board!=='undefined'){
          const btn=document.querySelector(`.boardPreset[data-preset="${preset}"]`);
          if(btn)btn.click();else{board.preset=preset;if(typeof draw==='function')draw();}
          log('ตั้ง layout แล้ว: '+preset);
        }
      }else if(cmd.action==='set_title_font'){
        const ok=['impact','tahoma','leelawadee','kanit','angsanabold','cordia','browallia','serif','mono','comic','cursive','arialblack','trebuchet','verdana','georgia','times','segoe','narrow'];
        if(ok.includes(cmd.font) && typeof style!=='undefined'){style.titleFont=cmd.font;setSelect('titleFont',cmd.font);if(typeof draw==='function')draw();log('ตั้งฟอนต์หัวข้อแล้ว')}
      }else if(cmd.action==='set_subtitle_font'){
        const ok=['impact','tahoma','leelawadee','kanit','serif','mono','comic','cursive','arialblack','trebuchet','verdana','georgia','times','segoe','narrow'];
        if(ok.includes(cmd.font) && typeof style!=='undefined'){style.subTitleFont=cmd.font;setSelect('subTitleFont',cmd.font);if(typeof draw==='function')draw();log('ตั้งฟอนต์หัวข้อรองแล้ว')}
      }else if(cmd.action==='set_title_style'){
        const ok=['brush','metal','clean','neon','serif','stencil','thaiBold','comic'];
        if(ok.includes(cmd.style) && typeof style!=='undefined'){style.font=cmd.style;setSelect('fontStyle',cmd.style);if(typeof draw==='function')draw();log('ตั้งสไตล์หัวข้อแล้ว')}
      }else if(cmd.action==='set_list_font'){
        const ok=['tahoma','leelawadee','angsana','cordia','impact','comic','arialblack','trebuchet','verdana','georgia','times','segoe'];
        if(ok.includes(cmd.font) && typeof style!=='undefined'){style.listFont=cmd.font;setSelect('listFont',cmd.font);if(typeof draw==='function')draw();log('ตั้งฟอนต์รายชื่อแล้ว')}
      }else if(cmd.action==='set_board_frame'){
        const ok=['glass','solid','minimal','none'];
        if(ok.includes(cmd.frame) && typeof style!=='undefined'){style.boardFrame=cmd.frame;setSelect('boardFrame',cmd.frame);if(typeof draw==='function')draw();log('ตั้งกรอบบอร์ดแล้ว')}
      }else if(cmd.action==='set_card_style'){
        const ok=['glow','flat','outline','none'];
        if(ok.includes(cmd.style) && typeof style!=='undefined'){style.cardStyle=cmd.style;setSelect('cardStyle',cmd.style);if(typeof draw==='function')draw();log('ตั้งกรอบรายชื่อแล้ว')}
      }else if(cmd.action==='set_card_palette'){
        const ok=['dark','smoke','cyan','gold','red','purple','emerald','white','clear'];
        if(ok.includes(cmd.palette) && typeof style!=='undefined'){style.cardPalette=cmd.palette;if(typeof draw==='function')draw();log('ตั้งสีการ์ดแล้ว: '+cmd.palette)}
      }else if(cmd.action==='set_card_shape'){
        const ok=['round','pill','sharp','ticket'];
        if(ok.includes(cmd.shape) && typeof style!=='undefined'){style.cardShape=cmd.shape;if(typeof draw==='function')draw();log('ตั้งทรงการ์ดแล้ว: '+cmd.shape)}
      }else if(cmd.action==='set_text_layout'){
        const ok=['classic','stacked','compact','minimal','split','poster'];
        if(ok.includes(cmd.layout) && typeof style!=='undefined'){style.textLayout=cmd.layout;if(typeof draw==='function')draw();log('ตั้ง layout ข้อความแล้ว: '+cmd.layout)}
      }else if(cmd.action==='set_text_color'){
        const ok=['white','black','dark','accent','theme','gold','cyan','pink'];
        if(ok.includes(cmd.nameColor||''))style.nameColor=cmd.nameColor;
        if(ok.includes(cmd.phoneColor||''))style.phoneColor=cmd.phoneColor;
        if(typeof draw==='function')draw();
        log('ตั้งสีตัวอักษรแล้ว');
      }else if(cmd.action==='set_header_colors'){
        if(typeof style!=='undefined'){
          if(cmd.titleColor)style.titleColor=cmd.titleColor;
          if(cmd.subColor)style.subColor=cmd.subColor;
          if(cmd.rankColor)style.rankColor=cmd.rankColor;
          ['titleColor','subColor','rankColor'].forEach(id=>{if(byId(id)&&style[id])byId(id).value=style[id]});
          if(typeof draw==='function')draw();
          log('ตั้งสีหัวข้อ/ลำดับแล้ว');
        }
      }else if(cmd.action==='set_header_effects'){
        if(typeof style!=='undefined'){
          ['titleBold','titleItalic','titleShadow','subShadow'].forEach(k=>{if(cmd[k]!=null)style[k]=!!cmd[k]});
          if(typeof draw==='function')draw();
          log('ตั้งเอฟเฟคหัวข้อแล้ว');
        }
      }else if(cmd.action==='set_subtitle_size'){
        if(typeof board!=='undefined'){
          board.subSize=clamp(cmd.value,.010,.055);
          if(byId('subSizeRange'))byId('subSizeRange').value=Math.round(board.subSize*1000);
          if(typeof draw==='function')draw();
          log('ตั้งขนาดหัวข้อรองแล้ว');
        }
      }else if(cmd.action==='set_board_colors'){
        if(typeof style!=='undefined'){
          if(cmd.a)style.boardColorA=cmd.a;
          if(cmd.b)style.boardColorB=cmd.b;
          if(cmd.stroke)style.boardStroke=cmd.stroke;
          if(byId('boardColorA')&&style.boardColorA)byId('boardColorA').value=style.boardColorA;
          if(byId('boardColorB')&&style.boardColorB)byId('boardColorB').value=style.boardColorB;
          if(byId('boardStrokeColor')&&style.boardStroke)byId('boardStrokeColor').value=style.boardStroke;
          if(typeof draw==='function')draw();
          log('ตั้งจานสีบอร์ดแล้ว');
        }
      }else if(cmd.action==='set_avatar_frame'){
        const ok=['ring','thin','square','thick','double','neon','gold','badge','hex','soft','shadow','none'];
        if(ok.includes(cmd.frame) && typeof style!=='undefined'){style.avatarFrame=cmd.frame;setSelect('avatarFrame',cmd.frame);if(typeof draw==='function')draw();log('ตั้งกรอบรูปแล้ว')}
      }else if(cmd.action==='set_custom_frame_shadow'){
        if(typeof style!=='undefined'){style.customFrameShadow=clamp(cmd.value,0,1);if(byId('customFrameShadow'))byId('customFrameShadow').value=Math.round(style.customFrameShadow*100);if(typeof draw==='function')draw();log('ตั้งเงากรอบวงกลม PNG แล้ว')}
      }else if(cmd.action==='clear_assets'){
        if(typeof window.DEVIL_GEMINI_CLEAR_ASSETS==='function'){window.DEVIL_GEMINI_CLEAR_ASSETS();log('ล้างภาพเสริมแล้ว')}
      }else if(cmd.action==='place_asset'){
        if(typeof window.DEVIL_GEMINI_MOVE_ASSET==='function'){window.DEVIL_GEMINI_MOVE_ASSET(cmd);log('จัดตำแหน่งภาพเสริมแล้ว')}
      }else if(cmd.action==='fit_asset_canvas'){
        if(typeof window.DEVIL_GEMINI_FIT_ASSET==='function'){window.DEVIL_GEMINI_FIT_ASSET('canvas',cmd.index||0);log('ขยาย PNG เต็มภาพแล้ว')}
      }else if(cmd.action==='fit_asset_board'){
        if(typeof window.DEVIL_GEMINI_FIT_ASSET==='function'){window.DEVIL_GEMINI_FIT_ASSET('board',cmd.index||0);log('ขยาย PNG เต็มบอร์ดแล้ว')}
      }else if(cmd.action==='set_asset_shadow'){
        if(typeof window.DEVIL_GEMINI_MOVE_ASSET==='function'){window.DEVIL_GEMINI_MOVE_ASSET({index:cmd.index||0,shadow:cmd.enabled!==false,shadowBlur:cmd.blur??22,shadowY:cmd.y??8});log('ตั้งเงา PNG แล้ว')}
      }else if(cmd.action==='generate_asset'){
        generateAssetFromPrompt(cmd.prompt||byId('gemPrompt')?.value||'decorative winner board light overlay',cmd);
      }else if(cmd.action==='set_opacity'){
        if(typeof style!=='undefined'){style.opacity=clamp(cmd.value,0,1);if(byId('boardOpacity'))byId('boardOpacity').value=Math.round(style.opacity*100);if(typeof draw==='function')draw();log('ตั้ง opacity แล้ว')}
      }else if(cmd.action==='set_glow'){
        if(typeof style!=='undefined'){style.glow=clamp(cmd.value,0,1);if(byId('glowPower'))byId('glowPower').value=Math.round(style.glow*100);if(typeof draw==='function')draw();log('ตั้ง glow แล้ว')}
      }else if(cmd.action==='set_text_size'){
        const target=cmd.target;
        if(typeof textStyle!=='undefined' && ['rank','name','phone','time'].includes(target)){
          textStyle[target]=clamp(cmd.value,.08,.60);
          const range={rank:'rankSizeRange',name:'nameSizeRange',phone:'phoneSizeRange',time:'timeSizeRange'}[target];
          if(byId(range))byId(range).value=Math.round(textStyle[target]*100);
          if(typeof draw==='function')draw();
          log('ตั้งขนาดตัวอักษร '+target+' แล้ว');
        }
      }else if(cmd.action==='set_board_rect'){
        if(typeof board!=='undefined'){
          const w=clamp(cmd.w,.25,.95), h=clamp(cmd.h,.25,.95);
          board.w=w;board.h=h;board.x=clamp(cmd.x,0,1-w);board.y=clamp(cmd.y,0,1-h);
          if(typeof draw==='function')draw();
          log('ตั้งตำแหน่งบอร์ดแล้ว');
        }
      }else if(cmd.action==='generate_background'){
        makeProceduralBackground(cmd.kind,cmd.intensity);
        log('เจนพื้นหลังในเครื่องแล้ว: '+(cmd.kind||'cyber'));
      }else if(cmd.action==='suggest_layout'){
        log(`แนะนำ layout: ${cmd.layout||''} - ${cmd.reason||''}`);
      }else{
        log('action นี้ไม่อยู่ใน whitelist');
      }
    }catch(e){log('Apply command ไม่สำเร็จ: '+e.message)}
  }
  const applyBoardCommandCore=applyBoardCommand;
  applyBoardCommand=function(raw){
    let cmd;
    try{cmd=parseJsonCommand(raw)}catch(e){log('Gemini command JSON error: '+e.message);return}
    if(Array.isArray(cmd)){
      cmd.forEach(one=>applyBoardCommand(one));
      return;
    }
    if(cmd && Array.isArray(cmd.commands)){
      cmd.commands.forEach(one=>applyBoardCommand(one));
      return;
    }
    const normalized=normalizeCommand(cmd);
    if(normalized && normalized.action==='add_stock_asset'){
      if(typeof window.DEVIL_GEMINI_ADD_STOCK_ASSET==='function'){
        window.DEVIL_GEMINI_ADD_STOCK_ASSET(normalized.name||normalized.asset||'gold_sparkle',normalized);
        log('\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E27\u0E31\u0E15\u0E16\u0E38\u0E14\u0E34\u0E1A PNG/effect \u0E41\u0E25\u0E49\u0E27');
      }
      return;
    }
    if(normalized && normalized.action==='apply_effect_preset'){
      if(typeof window.DEVIL_GEMINI_APPLY_EFFECT_PRESET==='function'){
        window.DEVIL_GEMINI_APPLY_EFFECT_PRESET(normalized.name||normalized.preset||'dark_gold_edge',clamp(normalized.power??normalized.value??.55,.05,1));
        log('\u0E43\u0E2A\u0E48 preset effect \u0E41\u0E25\u0E49\u0E27');
      }
      return;
    }
    if(normalized && normalized.action==='clear_preset_effects'){
      if(typeof window.DEVIL_GEMINI_CLEAR_PRESET_EFFECTS==='function'){
        window.DEVIL_GEMINI_CLEAR_PRESET_EFFECTS();
        log('\u0E25\u0E49\u0E32\u0E07 preset effect \u0E41\u0E25\u0E49\u0E27');
      }
      return;
    }
    applyBoardCommandCore(normalized);
  };
  async function sendChat(mode){
    const text=(byId('gemPrompt')?.value||'').trim();
    if(!text)return;
    byId('gemPrompt').value='';
    log('คุณ: '+text);
    try{
      if(mode==='board'){
        const raw=await callGemini(boardCommandPrompt(text),{json:true,maxOutputTokens:2048});
        byId('gemJsonPreview').value=raw;
        log('Gemini command: '+raw);
        applyBoardCommand(raw);
      }else if(mode==='dev'){
        const raw=await callGemini(`Return JSON patch plan only. Do not edit files.
Expected:
{"type":"patch_plan","summary":"","changes":[{"file":"","description":""}],"risk":"low|medium|high"}
User request: ${text}`,{json:true});
        byId('gemJsonPreview').value=raw;
        log('Patch plan พร้อมแล้ว');
      }else{
        const reply=await callGemini(`You are Gemini Assistant inside a Thai winner board app. Answer briefly and practically.
Current OCR rows: ${JSON.stringify(currentOcrRows())}
Current board: ${JSON.stringify(boardContext())}
User: ${text}`,{temperature:.4});
        log('Gemini: '+reply);
      }
    }catch(e){log('Error: '+e.message)}
  }
  function wantsBoardAction(text){
    return /(ออกแบบ|บอร์ด|ตกแต่ง|จัดวาง|layout|สี|ฟอนต์|font|กรอบ|png|เอฟเฟค|effect|เงา|หัวข้อ|รายชื่อ|วงกลม|opacity|โปร่ง|สวย)/i.test(text||'');
  }
  function wantsOcrAction(text){
    return /(ocr|อ่าน|ชื่อ|เบอร์|ขาด|ผิด|ตรวจ|แก้ให้ถูก|ลำดับ|สลับ|หาย|ครบ)/i.test(text||'');
  }
  async function runBoardCommandFromText(text,label){
    const raw=await callGemini(boardCommandPrompt(text),{json:true,maxOutputTokens:2048});
    byId('gemJsonPreview').value=raw;
    log((label||'Gemini command')+': '+raw);
    applyBoardCommand(raw);
  }
  sendChat=async function(mode){
    const text=(byId('gemPrompt')?.value||'').trim();
    if(!text)return;
    byId('gemPrompt').value='';
    log('\u0E04\u0E38\u0E13: '+text);
    try{
      if(mode==='board'){
        await runBoardCommandFromText(text,'Gemini command');
      }else if(mode==='dev'){
        const raw=await callGemini(`Return JSON patch plan only. Do not edit files.
Expected:
{"type":"patch_plan","summary":"","changes":[{"file":"","description":""}],"risk":"low|medium|high"}
User request: ${text}`,{json:true});
        byId('gemJsonPreview').value=raw;
        log('Patch plan ready');
      }else{
        if(wantsBoardAction(text) && hasBoard()){
          await runBoardCommandFromText(text,'\u0E43\u0E0A\u0E49\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E21\u0E37\u0E2D\u0E1A\u0E2D\u0E23\u0E4C\u0E14');
          return;
        }
        if(wantsOcrAction(text) && hasCrop()){
          await verifyOcr();
          if(/(แก้|ถูก|apply|ใช้ผล|ส่ง|บอร์ด)/i.test(text||''))applyOcrJson();
          return;
        }
        const reply=await callGemini(`You are Gemini Assistant inside a Thai winner board app. Answer briefly and practically.
If the user asks to design the board, inspect OCR, fix order, or apply app changes, do not answer with instructions. Tell them you will use the app tool, or return short guidance only when the relevant tool/page is unavailable.
Current OCR rows: ${JSON.stringify(currentOcrRows())}
Current board: ${JSON.stringify(boardContext())}
User: ${text}`,{temperature:.4});
        log('Gemini: '+reply);
      }
    }catch(e){log('Error: '+e.message)}
  };

  async function autoDesignBoard(){
    const text=(byId('gemPrompt')?.value||'').trim() || 'ออกแบบบอร์ดให้สวย เข้ากับจำนวนรายชื่อและพื้นหลัง ใช้เครื่องมือในแอพ ลดการเจนภาพทั้งใบ';
    log('กำลังให้ Gemini ออกแบบบอร์ดโดยตรง...');
    try{
      const raw=await callGemini(boardCommandPrompt(text),{json:true,maxOutputTokens:2048});
      byId('gemJsonPreview').value=raw;
      log('Gemini design commands: '+raw);
      applyBoardCommand(raw);
    }catch(e){log('Design error: '+e.message)}
  }
  function assetPrompt(text){
    return `Create one small PNG image asset for a Thai winner announcement board app.
This must be a reusable overlay/material, not a complete poster and not a full board.
Prefer transparent background when possible.
Do not include names, phone numbers, dates, money, or long text unless the user explicitly asks.
Good assets: neon frame, gold corner ornament, light streak, trophy sparkle, ribbon, badge, smoke glow, border accent, circular avatar frame.
Keep edges clean and make it easy to place over an existing board.

Board context:
${JSON.stringify(boardContext())}

User request:
${text || 'decorative premium winner board overlay'}`;
  }
  async function generateAssetFromPrompt(text, placement){
    if(typeof window.DEVIL_GEMINI_ADD_ASSET!=='function'){
      log('ฟังก์ชันนี้ใช้ได้ที่หน้าบอร์ดเท่านั้น');
      return;
    }
    log('กำลังให้ Gemini เจนภาพเสริม...');
    try{
      const out=await callGeminiImage(assetPrompt(text),{temperature:.55});
      const asset={
        src:out.dataUrl,
        prompt:String(text||''),
        x:clamp(placement?.x ?? .06,0,.95),
        y:clamp(placement?.y ?? .06,0,.95),
        w:clamp(placement?.w ?? .28,.04,1),
        h:clamp(placement?.h ?? .22,.04,1),
        opacity:clamp(placement?.opacity ?? .9,0,1),
        rotation:Number(placement?.rotation||0),
        blend:placement?.blend || 'normal'
      };
      const id=window.DEVIL_GEMINI_ADD_ASSET(asset);
      log('เพิ่มภาพเสริมลงบอร์ดแล้ว: '+id);
      if(out.text)log('Gemini note: '+out.text);
    }catch(e){log('Generate asset error: '+e.message)}
  }
  async function analyzeBoardImage(){
    try{
      if(typeof c==='undefined'){log('หน้านี้ไม่มี canvas บอร์ด');return}
      if(typeof draw==='function')draw();
      const data=c.toDataURL('image/png').split(',')[1];
      log('กำลังส่งภาพบอร์ดให้ Gemini วิเคราะห์...');
      const prompt=`Analyze this Thai winner board image. Return practical suggestions only. Check readability, spacing, duplicated layout, small names, avatar crop problems, and repetitive design. Do not auto-apply changes.`;
      const reply=await callGemini([{text:prompt},{inlineData:{mimeType:'image/png',data}}],{temperature:.3});
      log('Gemini: '+reply);
    }catch(e){log('Image analysis error: '+e.message)}
  }
  function buildPanel(){
    if(byId('gemPanel'))return;
    const css=document.createElement('style');
    css.textContent=`
#gemToggle{position:fixed;right:10px;bottom:10px;z-index:999998;width:auto;padding:10px 14px;border:0;border-radius:14px;background:#00e5ff;color:#001014;font-weight:1000;box-shadow:0 6px 18px #0008}
#gemPanel{position:fixed;left:8px;right:8px;bottom:58px;z-index:999997;max-height:74vh;overflow:auto;background:#080808;border:1px solid #24606a;border-radius:16px;padding:10px;color:#fff;box-shadow:0 12px 34px #000d;display:none}
#gemPanel.open{display:block}
#gemPanel h3{margin:8px 0;color:#8ff7ff}
#gemPanel input,#gemPanel select,#gemPanel textarea,#gemPanel button{width:100%;margin:4px 0;padding:9px;border-radius:10px;border:1px solid #333;background:#111;color:#fff;font:inherit}
#gemPanel button{font-weight:900;background:#19333a}
#gemPanel .gemGrid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
#gemLog{height:180px;overflow:auto;background:#050505;border:1px solid #222;border-radius:14px;padding:8px;font-size:13px;white-space:pre-wrap;display:flex;flex-direction:column;gap:7px}
#gemLog .gemMsg{max-width:86%;padding:8px 10px;border-radius:14px;line-height:1.35;word-break:break-word}
#gemLog .gemMsg-user{align-self:flex-end;background:#00e5ff;color:#001014;border-bottom-right-radius:4px;font-weight:700}
#gemLog .gemMsg-gemini{align-self:flex-start;background:#171b20;color:#f5fbff;border:1px solid #263847;border-bottom-left-radius:4px}
#gemLog .gemMsg-system{align-self:center;max-width:96%;background:#101010;color:#aebcc4;border:1px dashed #333;font-size:11px}
#gemUsage{font-size:12px;color:#b6f8ff;margin:5px 0}
#gemJsonPreview{height:96px;font-family:ui-monospace,Consolas,monospace;font-size:11px}
`;
    document.head.appendChild(css);
    const btn=document.createElement('button');
    btn.id='gemToggle';
    btn.textContent='Gemini';
    document.body.appendChild(btn);
    const panel=document.createElement('div');
    panel.id='gemPanel';
    panel.innerHTML=`
<h3>Gemini Assistant</h3>
<input id="gemKey" type="password" placeholder="Gemini API Key">
<div class="gemGrid">
  <select id="gemModel"><option value="gemini-2.5-flash">gemini-2.5-flash</option><option value="gemini-2.0-flash">gemini-2.0-flash</option></select>
  <button id="gemShowKey" type="button">โชว์/ซ่อน Key</button>
</div>
<select id="gemImageModel"><option value="gemini-2.5-flash-image">image: gemini-2.5-flash-image</option><option value="gemini-2.0-flash-preview-image-generation">image: gemini-2.0-flash-preview-image-generation</option></select>
<div class="gemGrid"><button id="gemSave" type="button">Save Key</button><button id="gemTest" type="button">Test</button></div>
<div id="gemUsage"></div>
<textarea id="gemPrompt" placeholder="พิมพ์คำสั่ง เช่น ตรวจ OCR ให้หน่อย / เปลี่ยนธีมเป็น cyber / วิเคราะห์บอร์ดนี้"></textarea>
<div class="gemGrid"><button id="gemChat" type="button">Chat</button><button id="gemBoardCmd" type="button">คำสั่งบอร์ด</button></div>
<button id="gemAutoDesign" type="button">Gemini ออกแบบบอร์ดให้เลย</button>
<div class="gemGrid"><button id="gemGenerateAsset" type="button">เจนภาพเสริมใส่บอร์ด</button><button id="gemClearAssets" type="button">ล้างภาพเสริม</button></div>
<div class="gemGrid"><button id="gemVerifyOcr" type="button">Gemini ตรวจ OCR</button><button id="gemApplyOcr" type="button">Apply OCR</button></div>
<div class="gemGrid"><button id="gemAnalyzeImage" type="button">ส่งภาพบอร์ดให้ Gemini วิเคราะห์</button><button id="gemDev" type="button">Developer Plan</button></div>
<textarea id="gemJsonPreview" placeholder="Gemini JSON preview"></textarea>
<div id="gemLog"></div>`;
    document.body.appendChild(panel);
    btn.onclick=()=>panel.classList.toggle('open');
    byId('gemKey').value=localStorage.getItem(LS_KEY)||'';
    byId('gemModel').value=localStorage.getItem(LS_MODEL)||'gemini-2.5-flash';
    byId('gemImageModel').value=localStorage.getItem(LS_IMAGE_MODEL)||'gemini-2.5-flash-image';
    byId('gemSave').onclick=()=>{localStorage.setItem(LS_KEY,getKey());localStorage.setItem(LS_MODEL,getModel());localStorage.setItem(LS_IMAGE_MODEL,getImageModel());log('บันทึก Gemini settings แล้ว')};
    byId('gemShowKey').onclick=()=>{const k=byId('gemKey');k.type=k.type==='password'?'text':'password'};
    byId('gemTest').onclick=async()=>{try{log(await callGemini('Reply OK only',{temperature:0}))}catch(e){log('Test error: '+e.message)}};
    byId('gemPrompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat('chat')}});
    byId('gemChat').onclick=()=>sendChat('chat');
    byId('gemBoardCmd').onclick=()=>sendChat('board');
    byId('gemAutoDesign').onclick=autoDesignBoard;
    byId('gemGenerateAsset').onclick=()=>generateAssetFromPrompt((byId('gemPrompt')?.value||'premium decorative winner board overlay'),{});
    byId('gemClearAssets').onclick=()=>{if(typeof window.DEVIL_GEMINI_CLEAR_ASSETS==='function'){window.DEVIL_GEMINI_CLEAR_ASSETS();log('ล้างภาพเสริมแล้ว')}else log('ฟังก์ชันนี้ใช้ได้ที่หน้าบอร์ดเท่านั้น')};
    byId('gemDev').onclick=()=>sendChat('dev');
    byId('gemVerifyOcr').onclick=verifyOcr;
    byId('gemApplyOcr').onclick=applyOcrJson;
    byId('gemAnalyzeImage').onclick=analyzeBoardImage;
    if(!hasCrop())byId('gemVerifyOcr').disabled=byId('gemApplyOcr').disabled=true;
    if(typeof c==='undefined')byId('gemAnalyzeImage').disabled=true;
    renderUsage();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',buildPanel);else buildPanel();
})();

// MANUAL_CODEX_POSTER_IMPORT_BRIDGE_V2
(function(){
  if (window.__MANUAL_CODEX_POSTER_IMPORT_BRIDGE_V2__) return;
  window.__MANUAL_CODEX_POSTER_IMPORT_BRIDGE_V2__ = true;

  window.manualSetPosterSrc = async function(src){
    window.posterSrc = src;
    window.importedPosterSrc = src;
    window.currentPosterSrc = src;

    try {
      if (typeof loadImg === 'function') {
        const img = await loadImg(src);

        window.poster = img;
        window.posterImg = img;
        window.posterImage = img;
        window.basePoster = img;

        try { poster = img; } catch(e){}
        try { posterSrc = src; } catch(e){}
      }
    } catch(e) {
      console.error('manualSetPosterSrc loadImg error', e);
    }

    ['draw','render','renderPoster','redraw','updateCanvas','refresh','paint'].forEach(function(name){
      try {
        if (typeof window[name] === 'function') window[name]();
        if (typeof eval(name) === 'function') eval(name)();
      } catch(e){}
    });

    try {
      window.dispatchEvent(new CustomEvent('manual-poster-imported', { detail:{src} }));
    } catch(e){}

    return true;
  };
})();

// MANUAL_CODEX_POSTER_IMPORT_BRIDGE_RUNNER_V1
(function(){
  if (window.__MANUAL_CODEX_POSTER_IMPORT_BRIDGE_RUNNER_V1__) return;
  window.__MANUAL_CODEX_POSTER_IMPORT_BRIDGE_RUNNER_V1__ = true;

  window.manualSetPosterSrc = async function(src){
    window.posterSrc = src;
    window.importedPosterSrc = src;
    window.currentPosterSrc = src;

    try {
      if (typeof loadImg === 'function') {
        const img = await loadImg(src);
        window.poster = img;
        window.posterImg = img;
        window.posterImage = img;
        window.basePoster = img;
        try { poster = img; } catch(e){}
        try { posterSrc = src; } catch(e){}
      }
    } catch(e) {
      console.error('manualSetPosterSrc error', e);
    }

    ['draw','render','renderPoster','redraw','updateCanvas','refresh','paint','drawBoard','renderBoard'].forEach(function(fn){
      try { if (typeof window[fn] === 'function') window[fn](); } catch(e){}
    });

    try {
      window.dispatchEvent(new CustomEvent('manual-poster-imported', { detail:{src} }));
    } catch(e){}

    return true;
  };
})();

// MANUAL_CODEX_POSTER_IMPORT_BRIDGE_V2_FIXED
(function(){
  if (window.__MANUAL_CODEX_POSTER_IMPORT_BRIDGE_V2_FIXED__) return;
  window.__MANUAL_CODEX_POSTER_IMPORT_BRIDGE_V2_FIXED__ = true;

  window.manualSetPosterSrc = async function(src){
    window.posterSrc = src;
    window.importedPosterSrc = src;
    window.currentPosterSrc = src;

    try {
      if (typeof loadImg === 'function') {
        const img = await loadImg(src);
        window.poster = img;
        window.posterImg = img;
        window.posterImage = img;
        window.basePoster = img;
        try { poster = img; } catch(e){}
        try { posterSrc = src; } catch(e){}
      }
    } catch(e) {}

    ['draw','render','renderPoster','redraw','updateCanvas','refresh','paint','drawBoard','renderBoard'].forEach(function(fn){
      try { if (typeof window[fn] === 'function') window[fn](); } catch(e){}
    });

    try {
      window.dispatchEvent(new CustomEvent('manual-poster-imported', { detail:{src} }));
    } catch(e){}

    return true;
  };
})();
