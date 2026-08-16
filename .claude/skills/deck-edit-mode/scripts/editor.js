/* ===== BRAIN DECK · EDIT MODE v2 (additive, self-contained) =====
   v2 adds: clipboard image paste (Cmd+V) + file drag-drop, internal element
   copy/paste (Cmd+C/Cmd+V), brand color swatches (whole element OR selected
   word while editing), center snap-guides while dragging, arrow-key nudge,
   z-order, center buttons, redo, autosave to localStorage with restore bar,
   blur intensity/opaque controls, proportional image resize, Cmd+S save. */
(function(){
  if(window.__brainEdInit) return; window.__brainEdInit=true;
  var deck=document.getElementById('deck');
  if(!deck) return;
  var edOn=false, selected=null, undoStack=[], redoStack=[], editState=null;
  var clipInternal=null, pasteCount=0, zTop=60, lastNudge={el:null,t:0};
  var touched={}, persistTimer=null, persistWarned=false;
  var LS_KEY='brainEd:'+(location.pathname.split('/').pop()||'deck');
  var MARKER='__brain-ed-copy__';

  var ADDED='.ed-img,.ed-blur,.ed-shape,.ed-textbox,.ed-clone';
  /* DENY = full-bleed backgrounds, slide-filling wrappers, deck chrome, editor UI */
  var DENY='#deck,.slide,.bg-img,.foot,.pg,#nav,.nav-btn,#slide-counter,#btn-fs,#progress-bar,#ed-toolbar,#ed-fab,#ed-hint,#ed-toast,#ed-ctx,#ed-restore,#ed-guide-v,#ed-guide-h,.wrap,.div-wrap,.show-wrap,.bs-wrap,.applayer,.hero-image-content,.hero-image-vignette,.lay-side,.lay-wrap,.tower,.tower-inner,.hero-image,.hero-ring,.hero-ring2,.loop-wrap,.loop-content';
  /* TEXTY = elements that may be inline-edited on double-click */
  var TEXTY='h1,h2,h3,h4,h5,h6,p,li,span,.div-word,.s-title,.eyebrow,.bp-text,.bs-context,.hero-title,.hero-sub,.div-sub,.div-eyebrow,.ed-textbox,.vl-name,.vl-val,.lay-tx,.pl-tx,.card,.chip,.engine,.step-name,.price-num,.vt-num,.hbar-lbl,.hbar-val,.vs-name,.vs-item,.bs-number,.bs-label';

  function scale(){ var r=deck.getBoundingClientRect(); return (r.width/1920)||1; }
  function activeSlide(){ return document.querySelector('.slide.active')||document.querySelector('.slide'); }
  function slideIndex(s){ return [].slice.call(document.querySelectorAll('.slide')).indexOf(s); }
  function matches(el,sel){ return el && el.matches && el.matches(sel); }
  function deckXY(cx,cy){ var d=deck.getBoundingClientRect(), s=scale(); return {x:(cx-d.left)/s, y:(cy-d.top)/s}; }

  /* Permissive: deepest element under the cursor that is NOT a denied wrapper.
     Clicking inside an ADDED element (image/clone/...) grabs the whole unit. */
  function eligible(el){
    if(el && el.closest){ var ad=el.closest(ADDED); if(ad) return ad; }
    var cur=el;
    while(cur && cur!==deck){
      if(matches(cur,ADDED)) return cur;
      if(cur.classList && cur.classList.contains('slide')) return null;
      if(matches(cur,DENY)){ cur=cur.parentElement; continue; }
      if(cur.closest && cur.closest('.slide')) return cur;
      cur=cur.parentElement;
    }
    return null;
  }
  /* For double-click text editing: deepest texty element (also inside clones) */
  function eligibleText(el){
    var cur=el;
    while(cur && cur!==deck){
      if(matches(cur,'.ed-textbox')) return cur;
      if(cur.classList && cur.classList.contains('slide')) return null;
      if(!matches(cur,DENY) && matches(cur,TEXTY) && cur.closest && cur.closest('.slide')) return cur;
      cur=cur.parentElement;
    }
    return null;
  }
  function selectParent(){
    if(!selected){ toast('בחר אלמנט קודם'); return; }
    var p=selected.parentElement;
    while(p && p!==deck){
      if(p.classList && p.classList.contains('slide')) break;
      if(!matches(p,DENY) && p.closest('.slide')){ select(p); toast('נבחרה המסגרת'); return; }
      p=p.parentElement;
    }
    toast('אין מסגרת אב');
  }

  /* ---------- undo / redo (per-slide innerHTML snapshots) ---------- */
  function snap(){
    var s=activeSlide(); if(!s) return;
    var idx=slideIndex(s);
    undoStack.push({slide:s, idx:idx, html:s.innerHTML});
    if(undoStack.length>80) undoStack.shift();
    redoStack.length=0;
    touched[idx]=1; schedulePersist();
    toast('');
  }
  function undo(){
    var last=undoStack.pop(); if(!last){ toast('אין מה לבטל'); return; }
    deselect();
    if(last.slide!==activeSlide() && last.idx>=0 && typeof show==='function'){ show(last.idx); }
    redoStack.push({slide:last.slide, idx:last.idx, html:last.slide.innerHTML});
    last.slide.innerHTML=last.html;
    touched[last.idx]=1; schedulePersist();
    toast('בוטל');
  }
  function redo(){
    var nx=redoStack.pop(); if(!nx){ toast('אין מה להחזיר'); return; }
    deselect();
    if(nx.slide!==activeSlide() && nx.idx>=0 && typeof show==='function'){ show(nx.idx); }
    undoStack.push({slide:nx.slide, idx:nx.idx, html:nx.slide.innerHTML});
    nx.slide.innerHTML=nx.html;
    touched[nx.idx]=1; schedulePersist();
    toast('הוחזר');
  }

  /* ---------- autosave (localStorage, debounced, normalized compare) ---------- */
  function cleanSlideHTML(slide){
    var c=slide.cloneNode(true), i, n;
    n=c.querySelectorAll('.ed-runtime,.ed-handle,.ed-del'); for(i=0;i<n.length;i++) n[i].remove();
    n=c.querySelectorAll('.ed-hover,.ed-selected'); for(i=0;i<n.length;i++){ n[i].classList.remove('ed-hover'); n[i].classList.remove('ed-selected'); }
    n=c.querySelectorAll('[contenteditable]'); for(i=0;i<n.length;i++) n[i].removeAttribute('contenteditable');
    n=c.querySelectorAll('.on'); for(i=0;i<n.length;i++) n[i].classList.remove('on');
    n=c.querySelectorAll('.anim'); for(i=0;i<n.length;i++) n[i].style.animationDelay='';
    n=c.querySelectorAll('[data-w]'); for(i=0;i<n.length;i++) n[i].style.width='';
    var fmt; try{ fmt=new Intl.NumberFormat('he-IL'); }catch(e){ fmt=null; }
    n=c.querySelectorAll('[data-count]');
    for(i=0;i<n.length;i++){ var v=parseInt(n[i].getAttribute('data-count'),10); if(isNaN(v)) continue;
      var out=n[i].querySelector('.cval')||n[i]; out.textContent= fmt?fmt.format(v):(''+v); }
    n=c.querySelectorAll('[style=""]'); for(i=0;i<n.length;i++) n[i].removeAttribute('style');
    return c.innerHTML;
  }
  function persist(){
    try{
      var data; try{ data=JSON.parse(localStorage.getItem(LS_KEY)||'{}'); }catch(e){ data={}; }
      data.ts=Date.now(); data.slides=data.slides||{};
      var list=document.querySelectorAll('.slide');
      for(var k in touched){ if(list[k]) data.slides[k]=cleanSlideHTML(list[k]); }
      localStorage.setItem(LS_KEY,JSON.stringify(data));
    }catch(err){
      if(!persistWarned){ persistWarned=true; toast('גיבוי אוטומטי נכשל - הקובץ גדול, שמור ידנית'); }
    }
  }
  function schedulePersist(){ clearTimeout(persistTimer); persistTimer=setTimeout(persist,800); }
  function checkRestore(){
    var data; try{ data=JSON.parse(localStorage.getItem(LS_KEY)||'null'); }catch(e){ return; }
    if(!data || !data.slides) return;
    var list=document.querySelectorAll('.slide'), diff=[];
    for(var k in data.slides){ var i=+k; if(list[i] && cleanSlideHTML(list[i])!==data.slides[k]) diff.push(i); }
    if(!diff.length) return;
    var bar=document.createElement('div'); bar.id='ed-restore';
    var when=new Date(data.ts||Date.now());
    var hh=('0'+when.getHours()).slice(-2)+':'+('0'+when.getMinutes()).slice(-2);
    var lbl=document.createElement('span'); lbl.textContent='🕘 נמצאו שינויים לא שמורים ('+hh+') - '+diff.length+' שקפים';
    var b1=document.createElement('button'); b1.className='ed-btn primary'; b1.textContent='שחזר';
    var b2=document.createElement('button'); b2.className='ed-btn'; b2.textContent='התעלם ומחק';
    b1.onclick=function(){
      for(var j=0;j<diff.length;j++){ list[diff[j]].innerHTML=data.slides[diff[j]]; touched[diff[j]]=1; }
      var cur=slideIndex(activeSlide());
      if(typeof activate==='function' && cur>=0) activate(cur);
      bar.remove(); toast('שוחזר ✓');
    };
    b2.onclick=function(){ try{ localStorage.removeItem(LS_KEY); }catch(e){} bar.remove(); };
    bar.appendChild(lbl); bar.appendChild(b1); bar.appendChild(b2);
    document.body.appendChild(bar);
  }

  /* ---------- selection + handles ---------- */
  function deselect(){
    if(selected){
      selected.classList.remove('ed-selected');
      if(selected.__edRel && !selected.style.zIndex){ selected.style.position=''; selected.__edRel=false; }
    }
    var rt=document.querySelectorAll('.ed-runtime'); for(var i=0;i<rt.length;i++) rt[i].remove();
    selected=null; refreshTb();
  }
  function select(el){
    deselect();
    selected=el; el.classList.add('ed-selected');
    if(!matches(el,ADDED) && getComputedStyle(el).position==='static'){ el.style.position='relative'; el.__edRel=true; }
    var del=document.createElement('div'); del.className='ed-del ed-runtime'; del.textContent='×';
    del.addEventListener('mousedown',function(e){ e.stopPropagation(); e.preventDefault(); });
    del.addEventListener('click',function(e){ e.stopPropagation(); snap(); var t=selected; deselect(); if(t) t.remove(); schedulePersist(); });
    el.appendChild(del);
    if(matches(el,ADDED)){
      var h=document.createElement('div'); h.className='ed-handle br ed-runtime';
      h.addEventListener('mousedown',function(e){ startResize(e,el); });
      el.appendChild(h);
    }
    refreshTb();
  }

  /* ---------- generic move helper (nudge/center share it) ---------- */
  function moveBy(el,dx,dy){
    if(matches(el,ADDED)){
      el.style.left=((parseFloat(el.style.left)||el.offsetLeft)+dx)+'px';
      el.style.top=((parseFloat(el.style.top)||el.offsetTop)+dy)+'px';
    }else{
      el.style.animation='none';
      var m=(el.style.transform||'').match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
      var tx=m?parseFloat(m[1]):0, ty=m?parseFloat(m[2]):0;
      var base=(el.style.transform||'').replace(/translate\([^)]*\)/,'').trim();
      el.style.transform=(base+' translate('+(tx+dx)+'px,'+(ty+dy)+'px)').trim();
    }
  }

  /* ---------- drag move with center snap-guides ---------- */
  var drag=null, gV=null, gH=null;
  function hideGuides(){ if(gV) gV.style.display='none'; if(gH) gH.style.display='none'; }
  function onDown(e){
    if(!edOn) return;
    if(e.target.closest && e.target.closest('#ed-toolbar,#ed-fab,#ed-hint,#ed-toast,#ed-restore')) return;
    if(e.target.classList && (e.target.classList.contains('ed-handle')||e.target.classList.contains('ed-del'))) return;
    var el;
    if(selected && selected.contains(e.target)){
      /* clicking within the current selection drags THAT element (e.g. a group
         you escalated to with "⤴ מסגרת"), instead of re-grabbing a child */
      el=selected;
    } else {
      el=eligible(e.target);
      if(!el){ deselect(); return; }
      if(el.isContentEditable) return;
      select(el);
    }
    var s=scale(), d=deck.getBoundingClientRect();
    drag={el:el,x:e.clientX,y:e.clientY,moved:false,added:matches(el,ADDED),s:s};
    var r0=el.getBoundingClientRect();
    if(drag.added){
      drag.l=parseFloat(el.style.left)||el.offsetLeft; drag.t=parseFloat(el.style.top)||el.offsetTop;
      drag.w2=el.offsetWidth/2; drag.h2=el.offsetHeight/2;
    }else{
      var m=(el.style.transform||'').match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
      drag.tx=m?parseFloat(m[1]):0; drag.ty=m?parseFloat(m[2]):0;
      drag.base=(el.style.transform||'').replace(/translate\([^)]*\)/,'').trim();
      /* element center in deck coords EXCLUDING current translate (for snapping) */
      drag.cx0=((r0.left-d.left)+r0.width/2)/s - drag.tx;
      drag.cy0=((r0.top-d.top)+r0.height/2)/s - drag.ty;
    }
    e.preventDefault();
    window.addEventListener('mousemove',onMove);
    window.addEventListener('mouseup',onUp);
  }
  function onMove(e){
    if(!drag) return;
    var dx=(e.clientX-drag.x)/drag.s, dy=(e.clientY-drag.y)/drag.s;
    if(!drag.moved){ if((Math.abs(dx)+Math.abs(dy))>2){ drag.moved=true; snap();
        /* neutralise the entry animation (fadeUp, fill:both) which otherwise
           pins `transform` and blocks our inline translate */
        if(!drag.added) drag.el.style.animation='none';
      } else return; }
    var SN=7, offX=null, offY=null;
    if(drag.added){
      var lx=drag.l+dx, ty=drag.t+dy;
      if(!e.altKey){
        var cx=lx+drag.w2, cy=ty+drag.h2;
        if(Math.abs(960-cx)<SN){ lx+=(960-cx); offX=true; }
        if(Math.abs(540-cy)<SN){ ty+=(540-cy); offY=true; }
      }
      drag.el.style.left=lx+'px'; drag.el.style.top=ty+'px';
    }else{
      var txr=drag.tx+dx, tyr=drag.ty+dy;
      if(!e.altKey){
        var ecx=drag.cx0+txr, ecy=drag.cy0+tyr;
        if(Math.abs(960-ecx)<SN){ txr+=(960-ecx); offX=true; }
        if(Math.abs(540-ecy)<SN){ tyr+=(540-ecy); offY=true; }
      }
      drag.el.style.transform=(drag.base+' translate('+txr+'px,'+tyr+'px)').trim();
    }
    if(gV) gV.style.display=offX?'block':'none';
    if(gH) gH.style.display=offY?'block':'none';
  }
  function onUp(){
    window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp);
    hideGuides(); if(drag&&drag.moved) schedulePersist(); drag=null;
  }

  /* ---------- resize (images keep aspect ratio; Shift = free) ---------- */
  function startResize(e,el){
    e.preventDefault(); e.stopPropagation();
    var s=scale(), w=el.offsetWidth, h=el.offsetHeight, x=e.clientX, y=e.clientY, moved=false;
    var isImg=matches(el,'.ed-img'), ratio=(h/w)||1;
    function mv(ev){ var dx=(ev.clientX-x)/s, dy=(ev.clientY-y)/s; if(!moved){moved=true;snap();}
      var nw=Math.max(40,w+dx), nh=Math.max(28,h+dy);
      if(isImg && !ev.shiftKey) nh=Math.max(28,Math.round(nw*ratio));
      el.style.width=nw+'px'; el.style.height=nh+'px'; }
    function up(){ window.removeEventListener('mousemove',mv); window.removeEventListener('mouseup',up); schedulePersist(); }
    window.addEventListener('mousemove',mv); window.addEventListener('mouseup',up);
  }

  /* ---------- inline text edit ---------- */
  /* if an edited element drives a [data-count] counter, sync the attribute so the
     deck's re-animation (activate()) lands on the NEW number instead of reverting */
  function bakeCountFromEdit(el){
    var dc=el.closest ? el.closest('[data-count]') : null;
    if(!dc) return;
    var cv=dc.querySelector('.cval')||dc;
    var n=parseInt((cv.textContent||'').replace(/[^0-9]/g,''),10);
    if(!isNaN(n)) dc.setAttribute('data-count', n);
  }
  function onDbl(e){
    if(!edOn) return;
    var el=eligibleText(e.target)||eligible(e.target);
    if(!el) return;
    if(matches(el,ADDED) && !matches(el,'.ed-textbox')) return;
    if(!matches(el,TEXTY)){ toast('האלמנט הזה לא טקסט לעריכה'); return; }
    deselect(); snap();
    editState={el:el, orig:el.innerHTML, cancelled:false};
    refreshTb();
    el.setAttribute('contenteditable','true'); el.focus();
    el.addEventListener('blur',function h(){
      el.removeAttribute('contenteditable'); el.removeEventListener('blur',h);
      if(!(editState && editState.cancelled)) bakeCountFromEdit(el);
      if(editState && editState.el===el) editState=null;
      refreshTb(); schedulePersist();
    });
    e.preventDefault();
  }

  /* ---------- add elements ---------- */
  function insertImageFile(f, pos){
    if(!f || !/^image\//.test(f.type)) return;
    var rd=new FileReader();
    rd.onload=function(){ var im=new Image(); im.onload=function(){
      snap(); var s=activeSlide();
      var w=560, h=Math.round(560*im.naturalHeight/im.naturalWidth);
      if(h>820){ h=820; w=Math.round(820*im.naturalWidth/im.naturalHeight); }
      var box=document.createElement('div'); box.className='ed-img';
      var lx=pos? Math.round(pos.x-w/2) : Math.round(960-w/2);
      var ly=pos? Math.round(pos.y-h/2) : Math.round(540-h/2);
      box.style.left=lx+'px'; box.style.top=ly+'px'; box.style.width=w+'px'; box.style.height=h+'px';
      var img=document.createElement('img'); img.src=rd.result; box.appendChild(img);
      s.appendChild(box); select(box); toast('תמונה נוספה'); schedulePersist();
    }; im.src=rd.result; };
    rd.readAsDataURL(f);
  }
  function addImage(){
    var inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
    inp.onchange=function(){ insertImageFile(inp.files[0], null); };
    inp.click();
  }
  function addBlur(){ snap(); var s=activeSlide(); var b=document.createElement('div'); b.className='ed-blur'; b.style.cssText='left:760px;top:460px;width:400px;height:150px;'; s.appendChild(b); select(b); toast('טשטוש - גרור מעל נתון'); schedulePersist(); }
  function addShape(){ snap(); var s=activeSlide(); var b=document.createElement('div'); b.className='ed-shape'; b.style.cssText='left:760px;top:450px;width:420px;height:200px;'; s.appendChild(b); select(b); schedulePersist(); }
  function mkTextbox(text,x,y){
    var s=activeSlide(); var t=document.createElement('div'); t.className='ed-textbox';
    t.style.left=(x!=null?x:720)+'px'; t.style.top=(y!=null?y:480)+'px';
    t.textContent=text||'טקסט חדש'; s.appendChild(t); select(t); return t;
  }
  function addText(){ snap(); mkTextbox('טקסט חדש'); toast('לחץ פעמיים לעריכה'); schedulePersist(); }

  /* ---------- copy / paste (Cmd+C / Cmd+V) ---------- */
  function cleanOuter(el){
    var c=el.cloneNode(true), i, n;
    n=c.querySelectorAll('.ed-runtime,.ed-handle,.ed-del'); for(i=0;i<n.length;i++) n[i].remove();
    c.classList.remove('ed-selected'); c.classList.remove('ed-hover');
    c.removeAttribute('contenteditable');
    n=c.querySelectorAll('[contenteditable]'); for(i=0;i<n.length;i++) n[i].removeAttribute('contenteditable');
    /* strip our positioning so the stored copy is pristine */
    if(c.style && c.style.transform) c.style.transform=c.style.transform.replace(/translate\([^)]*\)/,'').trim()||'';
    if(el.__edRel) c.style.position='';
    return c.outerHTML;
  }
  function copySel(){
    if(!selected) return false;
    var d=deck.getBoundingClientRect(), s=scale(), r=selected.getBoundingClientRect();
    clipInternal={
      html:cleanOuter(selected),
      added:matches(selected,ADDED),
      left:(r.left-d.left)/s, top:(r.top-d.top)/s, width:r.width/s
    };
    pasteCount=0;
    try{ navigator.clipboard.writeText(MARKER).catch(function(){}); }catch(e){}
    toast('הועתק ✓ (Cmd+V להדבקה)');
    return true;
  }
  function pasteInternal(){
    if(!clipInternal) return;
    snap(); pasteCount++;
    var off=24*pasteCount, s=activeSlide(), el;
    var tmp=document.createElement('div'); tmp.innerHTML=clipInternal.html;
    var src=tmp.firstElementChild; if(!src) return;
    if(clipInternal.added){
      el=src;
      el.style.left=Math.round((parseFloat(el.style.left)||clipInternal.left)+off)+'px';
      el.style.top=Math.round((parseFloat(el.style.top)||clipInternal.top)+off)+'px';
    }else{
      el=document.createElement('div'); el.className='ed-clone';
      el.style.left=Math.round(clipInternal.left+off)+'px';
      el.style.top=Math.round(clipInternal.top+off)+'px';
      el.style.width=Math.round(clipInternal.width)+'px';
      el.appendChild(src);
    }
    s.appendChild(el); select(el); toast('הודבק'); schedulePersist();
  }
  document.addEventListener('paste',function(e){
    if(!edOn) return;
    var ae=document.activeElement;
    if(ae && ae.isContentEditable) return; /* normal paste inside a text edit */
    var items=(e.clipboardData&&e.clipboardData.items)||[];
    for(var i=0;i<items.length;i++){
      if(items[i].type && items[i].type.indexOf('image')===0){
        var f=items[i].getAsFile();
        if(f){ e.preventDefault(); insertImageFile(f,null); return; }
      }
    }
    var txt=''; try{ txt=e.clipboardData.getData('text/plain')||''; }catch(err){}
    if(clipInternal && (txt===MARKER || txt==='')){ e.preventDefault(); pasteInternal(); return; }
    if(txt){ e.preventDefault(); snap(); mkTextbox(txt); toast('טקסט הודבק כתיבה חדשה'); schedulePersist(); }
  });
  /* drag & drop image files from Finder/desktop */
  deck.addEventListener('dragover',function(e){ if(edOn){ e.preventDefault(); } });
  deck.addEventListener('drop',function(e){
    if(!edOn) return; e.preventDefault();
    var fs=e.dataTransfer && e.dataTransfer.files;
    if(!fs || !fs.length) return;
    for(var i=0;i<fs.length;i++){
      if(/^image\//.test(fs[i].type)){ insertImageFile(fs[i], deckXY(e.clientX,e.clientY)); return; }
    }
  });

  /* ---------- colors (whole element, or selected word while editing) ---------- */
  var GRAD='linear-gradient(135deg,#71b9c3,#549cbc,#2d70aa,#6556d0,#9c4ed7)';
  var COLORS=[['לבן','#ffffff'],['טורקיז','#62aabf'],['סגול','#8f4fd7'],['אדום','#ef4444'],['ירוק','#22c55e'],['אפור','#8f8f9b']];
  function applyColor(c){
    var ae=document.activeElement, sel=window.getSelection();
    if(ae && ae.isContentEditable && sel && !sel.isCollapsed){
      document.execCommand('styleWithCSS',false,true);
      document.execCommand('foreColor',false,c);
      return;
    }
    if(!selected){ toast('בחר אלמנט או סמן מילה'); return; }
    snap();
    if(matches(selected,'.ed-shape')){
      selected.style.background=c+'33'; selected.style.borderColor=c; schedulePersist(); return;
    }
    selected.style.background='none';
    selected.style.webkitBackgroundClip=''; selected.style.backgroundClip='';
    selected.style.webkitTextFillColor=c; selected.style.color=c;
    schedulePersist();
  }
  function applyGradient(){
    var ae=document.activeElement, sel=window.getSelection();
    if(ae && ae.isContentEditable && sel && !sel.isCollapsed){
      var t=sel.toString();
      document.execCommand('insertHTML',false,'<span class="grad">'+t.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</span>');
      return;
    }
    if(!selected){ toast('בחר אלמנט או סמן מילה'); return; }
    snap();
    selected.style.background=GRAD;
    selected.style.webkitBackgroundClip='text'; selected.style.backgroundClip='text';
    selected.style.webkitTextFillColor='transparent'; selected.style.color='';
    schedulePersist();
  }

  /* ---------- z-order / center / nudge / blur controls ---------- */
  function zOrder(front){
    if(!selected){ toast('בחר אלמנט קודם'); return; }
    snap();
    if(getComputedStyle(selected).position==='static'){ selected.style.position='relative'; selected.__edRel=true; }
    selected.style.zIndex= front? (++zTop) : 0;
    toast(front?'הובא לקדמה':'נשלח לאחור'); schedulePersist();
  }
  function centerSel(axis){
    if(!selected){ toast('בחר אלמנט קודם'); return; }
    snap();
    var d=deck.getBoundingClientRect(), s=scale(), r=selected.getBoundingClientRect();
    var cx=((r.left-d.left)+r.width/2)/s, cy=((r.top-d.top)+r.height/2)/s;
    if(axis==='h') moveBy(selected, 960-cx, 0); else moveBy(selected, 0, 540-cy);
    schedulePersist();
  }
  function nudge(dx,dy){
    if(!selected) return false;
    var now=Date.now();
    if(lastNudge.el!==selected || now-lastNudge.t>1200) snap();
    lastNudge={el:selected,t:now};
    moveBy(selected,dx,dy); schedulePersist();
    return true;
  }
  function blurDelta(d){
    if(!selected || !matches(selected,'.ed-blur')) return;
    snap();
    var cur=parseFloat(((selected.style.backdropFilter||'').match(/[\d.]+/)||[15])[0])||15;
    var v=Math.min(40,Math.max(2,cur+d));
    selected.style.backdropFilter='blur('+v+'px)'; selected.style.webkitBackdropFilter='blur('+v+'px)';
    toast('עוצמת טשטוש: '+v); schedulePersist();
  }
  function toggleOpaque(){
    if(!selected || !matches(selected,'.ed-blur')) return;
    snap(); selected.classList.toggle('ed-opaque');
    toast(selected.classList.contains('ed-opaque')?'אטום (מסתיר לגמרי)':'טשטוש שקוף'); schedulePersist();
  }
  function imgCorners(){
    if(!selected || !matches(selected,'.ed-img')) return;
    snap(); var img=selected.querySelector('img'); if(!img) return;
    img.style.borderRadius=(img.style.borderRadius==='18px')?'0px':'18px'; schedulePersist();
  }
  function cycleOpacity(){
    if(!selected){ toast('בחר אלמנט קודם'); return; }
    snap();
    var cur=parseFloat(selected.style.opacity||'1');
    var next= cur>0.85?0.75 : cur>0.6?0.5 : cur>0.35?0.25 : 1;
    selected.style.opacity=(next===1)?'':String(next);
    toast('שקיפות: '+Math.round(next*100)+'%'); schedulePersist();
  }

  function fontDelta(d){ if(!selected){ toast('בחר טקסט קודם'); return; } snap();
    var cs=parseFloat(getComputedStyle(selected).fontSize)||30; selected.style.fontSize=Math.max(10,cs+d)+'px'; schedulePersist(); }
  function deleteSel(){ if(!selected){ toast('בחר אלמנט קודם'); return; } snap(); var el=selected; deselect(); el.remove(); schedulePersist(); }

  /* ---------- navigation (reuse deck) ---------- */
  function go(dir){
    deselect();
    var list=[].slice.call(document.querySelectorAll('.slide'));
    var i=list.indexOf(activeSlide());
    var n=Math.max(0,Math.min(list.length-1,i+dir));
    if(typeof show==='function') show(n);
    else { list[i].classList.remove('active'); list[n].classList.add('active'); }
  }

  /* ---------- export ---------- */
  /* rewrite every relative url (img src, font/href, css url()) to an absolute
     file:// path so the saved file keeps its background + fonts from any folder */
  function absolutizeURLs(root){
    var base=location.href, keep=/^(data:|https?:|file:|blob:|#)/i;
    function abs(u){ try{ return new URL(u, base).href; }catch(e){ return u; } }
    function fixCss(t){ return t.replace(/url\((['"]?)([^'")]+)\1\)/g,function(m,q,u){ return keep.test(u)?m:('url('+q+abs(u)+q+')'); }); }
    var s=root.querySelectorAll('[src]'); for(var i=0;i<s.length;i++){ var v=s[i].getAttribute('src'); if(v&&!keep.test(v)) s[i].setAttribute('src',abs(v)); }
    var h=root.querySelectorAll('[href]'); for(var j=0;j<h.length;j++){ var w=h[j].getAttribute('href'); if(w&&!keep.test(w)) h[j].setAttribute('href',abs(w)); }
    var st=root.querySelectorAll('style'); for(var k=0;k<st.length;k++){ st[k].textContent=fixCss(st[k].textContent); }
    var il=root.querySelectorAll('[style]'); for(var l=0;l<il.length;l++){ var sv=il[l].getAttribute('style'); if(sv&&sv.indexOf('url(')>-1) il[l].setAttribute('style',fixCss(sv)); }
  }
  /* bake every [data-count] to its final formatted number so un-visited stat
     slides aren't frozen at 0 in the saved file */
  function bakeCounters(root){
    var fmt; try{ fmt=new Intl.NumberFormat('he-IL'); }catch(e){ fmt=null; }
    var n=root.querySelectorAll('[data-count]');
    for(var i=0;i<n.length;i++){ var v=parseInt(n[i].getAttribute('data-count'),10); if(isNaN(v)) continue;
      var out=n[i].querySelector('.cval')||n[i]; out.textContent= fmt?fmt.format(v):(''+v); }
  }
  function exportHTML(){
    deselect(); var was=edOn; setEdit(false);
    var clone=document.documentElement.cloneNode(true);
    var kill=clone.querySelectorAll('#ed-toolbar,#ed-fab,#ed-hint,#ed-toast,#ed-restore,#ed-guide-v,#ed-guide-h,.ed-runtime,.ed-handle,.ed-del');
    for(var i=0;i<kill.length;i++) kill[i].remove();
    var cl=clone.querySelectorAll('.ed-hover,.ed-selected'); for(var j=0;j<cl.length;j++){ cl[j].classList.remove('ed-hover'); cl[j].classList.remove('ed-selected'); }
    var ce=clone.querySelectorAll('[contenteditable]'); for(var k=0;k<ce.length;k++) ce[k].removeAttribute('contenteditable');
    var sl=clone.querySelectorAll('.slide'); for(var m=0;m<sl.length;m++){ if(m===0) sl[m].classList.add('active'); else sl[m].classList.remove('active'); }
    var b=clone.querySelector('body'); if(b) b.classList.remove('ed-on');
    absolutizeURLs(clone);
    bakeCounters(clone);
    var html='<!DOCTYPE html>\n'+clone.outerHTML;
    var blob=new Blob([html],{type:'text/html;charset=utf-8'});
    var a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    var fname=(location.pathname.split('/').pop()||'deck.html').replace(/\.html?$/i,'');
    try{ fname=decodeURIComponent(fname); }catch(e){}
    a.download=fname+'-edited.html'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(a.href); },3000);
    if(was) setEdit(true);
    toast('נשמר! החלף את הקובץ המקורי בקובץ שירד');
  }

  /* ---------- toolbar UI ---------- */
  var fab=document.createElement('button'); fab.id='ed-fab'; fab.type='button'; fab.textContent='✏️ עריכה';
  fab.addEventListener('click',function(){ setEdit(true); });
  document.body.appendChild(fab);

  var tb=document.createElement('div'); tb.id='ed-toolbar';
  var toast_el, ctx;
  function mkBtn(label,fn,cls){ var b=document.createElement('button'); b.type='button'; b.className='ed-btn'+(cls?(' '+cls):''); b.textContent=label;
    b.addEventListener('mousedown',function(e){e.preventDefault();}); b.addEventListener('click',function(e){e.stopPropagation();fn();}); return b; }
  function mkSep(){ var s=document.createElement('span'); s.className='ed-sep'; return s; }
  function mkDot(name,color){ var d=document.createElement('button'); d.type='button'; d.className='ed-dot'; d.title=name; d.style.background=color;
    d.addEventListener('mousedown',function(e){e.preventDefault();}); d.addEventListener('click',function(e){e.stopPropagation();applyColor(color);}); return d; }

  var row=document.createElement('div'); row.id='ed-row';
  row.appendChild(mkBtn('› הקודם',function(){go(-1);}));
  row.appendChild(mkBtn('הבא ‹',function(){go(1);}));
  row.appendChild(mkSep());
  row.appendChild(mkBtn('🖼️ תמונה',addImage));
  row.appendChild(mkBtn('🌫️ טשטוש',addBlur));
  row.appendChild(mkBtn('▭ צורה',addShape));
  row.appendChild(mkBtn('🔤 טקסט',addText));
  row.appendChild(mkSep());
  row.appendChild(mkBtn('⤴ מסגרת',selectParent));
  row.appendChild(mkBtn('⬆ קדימה',function(){zOrder(true);}));
  row.appendChild(mkBtn('⬇ אחורה',function(){zOrder(false);}));
  row.appendChild(mkBtn('↔ מרכז',function(){centerSel('h');}));
  row.appendChild(mkBtn('↕ מרכז',function(){centerSel('v');}));
  row.appendChild(mkSep());
  row.appendChild(mkBtn('A+',function(){fontDelta(4);}));
  row.appendChild(mkBtn('A−',function(){fontDelta(-4);}));
  row.appendChild(mkBtn('🗑️ מחק',deleteSel,'danger'));
  row.appendChild(mkBtn('↶ ביטול',undo));
  row.appendChild(mkBtn('↷ חזרה',redo));
  row.appendChild(mkSep());
  row.appendChild(mkBtn('💾 שמור',exportHTML,'primary'));
  row.appendChild(mkBtn('✖ סגור',function(){ setEdit(false); }));
  tb.appendChild(row);

  ctx=document.createElement('div'); ctx.id='ed-ctx'; tb.appendChild(ctx);
  document.body.appendChild(tb);

  function buildColors(forShape){
    var lbl=document.createElement('span'); lbl.className='ed-ctx-lbl'; lbl.textContent= forShape?'צבע צורה:':'צבע:';
    ctx.appendChild(lbl);
    if(!forShape){
      var g=document.createElement('button'); g.type='button'; g.className='ed-dot grad-dot'; g.title='גרדיאנט';
      g.addEventListener('mousedown',function(e){e.preventDefault();});
      g.addEventListener('click',function(e){e.stopPropagation();applyGradient();});
      ctx.appendChild(g);
    }
    for(var i=0;i<COLORS.length;i++) ctx.appendChild(mkDot(COLORS[i][0],COLORS[i][1]));
    if(!forShape && editState){
      var tip=document.createElement('span'); tip.className='ed-ctx-lbl'; tip.textContent='(סמן מילה כדי לצבוע רק אותה)';
      ctx.appendChild(tip);
    }
  }
  function refreshTb(){
    if(!ctx) return;
    ctx.innerHTML='';
    var show=false;
    if(editState){ buildColors(); show=true; }
    else if(selected){
      if(matches(selected,'.ed-blur')){
        ctx.appendChild(mkBtn('עוצמה −',function(){blurDelta(-5);}));
        ctx.appendChild(mkBtn('עוצמה +',function(){blurDelta(5);}));
        ctx.appendChild(mkBtn('אטום ◼',toggleOpaque));
        show=true;
      } else if(matches(selected,'.ed-img')){
        ctx.appendChild(mkBtn('פינות ◰',imgCorners));
        ctx.appendChild(mkBtn('שקיפות 👻',cycleOpacity));
        show=true;
      } else if(matches(selected,'.ed-shape')){
        buildColors(true);
        ctx.appendChild(mkBtn('שקיפות 👻',cycleOpacity));
        show=true;
      } else {
        buildColors();
        show=true;
      }
    }
    ctx.style.display=show?'flex':'none';
  }

  var hint=document.createElement('div'); hint.id='ed-hint';
  hint.innerHTML='לחיצה = בחירה · גרירה = הזזה (Alt = בלי הצמדה) · לחיצה כפולה = עריכת טקסט · חצים = הזזה עדינה (Shift=10) · Cmd+C/V = העתק/הדבק · Cmd+S = שמור';
  document.body.appendChild(hint);

  toast_el=document.createElement('div'); toast_el.id='ed-toast'; document.body.appendChild(toast_el);
  var toastTimer;
  function toast(msg){ if(!toast_el) return; toast_el.textContent=msg||''; toast_el.classList.toggle('on',!!msg);
    clearTimeout(toastTimer); if(msg) toastTimer=setTimeout(function(){ toast_el.classList.remove('on'); },2600); }

  /* center snap guide lines (live inside #deck so they scale with it) */
  gV=document.createElement('div'); gV.id='ed-guide-v'; deck.appendChild(gV);
  gH=document.createElement('div'); gH.id='ed-guide-h'; deck.appendChild(gH);

  function setEdit(on){
    edOn=on; document.body.classList.toggle('ed-on',on);
    tb.classList.toggle('on',on); fab.style.display=on?'none':'block';
    hideGuides();
    if(!on){ deselect(); toast(''); }
    else toast('מצב עריכה פעיל');
  }

  /* ---------- hover outline ---------- */
  document.addEventListener('mouseover',function(e){ if(!edOn) return; var el=eligible(e.target);
    var hv=document.querySelectorAll('.ed-hover'); for(var i=0;i<hv.length;i++){ if(hv[i]!==el) hv[i].classList.remove('ed-hover'); }
    if(el && el!==selected) el.classList.add('ed-hover'); });
  document.addEventListener('mouseout',function(e){ if(!edOn) return; var el=eligible(e.target); if(el) el.classList.remove('ed-hover'); });

  /* ---------- bind ---------- */
  deck.addEventListener('mousedown',onDown);
  deck.addEventListener('dblclick',onDbl);

  document.addEventListener('keydown',function(e){
    if(!edOn) return;
    var editing=document.activeElement && document.activeElement.isContentEditable;
    var meta=e.metaKey||e.ctrlKey;
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'||e.key==='ArrowUp'||e.key==='ArrowDown'){
      if(!editing && selected){
        e.preventDefault();
        var st=e.shiftKey?10:1;
        nudge(e.key==='ArrowLeft'?-st:e.key==='ArrowRight'?st:0, e.key==='ArrowUp'?-st:e.key==='ArrowDown'?st:0);
      }
      e.stopImmediatePropagation(); return;
    }
    if(meta && (e.key==='z'||e.key==='Z')){
      e.preventDefault(); e.stopImmediatePropagation();
      if(e.shiftKey) redo(); else undo();
      return;
    }
    if(meta && (e.key==='s'||e.key==='S')){ e.preventDefault(); e.stopImmediatePropagation(); exportHTML(); return; }
    if(meta && (e.key==='c'||e.key==='C') && !editing && selected){ copySel(); return; }
    if(meta && (e.key==='d'||e.key==='D') && !editing && selected){ e.preventDefault(); e.stopImmediatePropagation(); if(copySel()) pasteInternal(); return; }
    if((e.key==='Delete'||e.key==='Backspace') && !editing){
      if(selected){ e.preventDefault(); deleteSel(); }
      return;
    }
    if(e.key==='Escape'){
      if(editing){
        if(editState && editState.el){ editState.cancelled=true; editState.el.innerHTML=editState.orig; if(undoStack.length) undoStack.pop(); editState.el.blur(); }
        else document.activeElement.blur();
      } else deselect();
    }
  },true);

  /* optional: auto-enter for screenshot testing via ?edtest */
  if(location.search.indexOf('edtest')>-1){ setEdit(true); }
  /* offer to restore unsaved work (after deck init settles) */
  setTimeout(checkRestore,400);
})();
