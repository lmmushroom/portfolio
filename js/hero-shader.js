/* =========================================================================
   LILA — hero-shader.js
   Native WebGL1 interactive typography for the site-entry Hero page
   (site/index.html). No three.js, no new dependency.

   Reference: Codrops "Animating Letters with Shaders" (Paola Demichelis).
   Faithful mechanism:
     · glyph texture generated at runtime from the real <h1>
     · 100x100 subdivided plane, per-vertex Z displacement around the pointer
     · easeInOutCubic falloff inside a fixed radius
     · a second plane with a pre-blurred texture whose ALPHA is remapped by
       the same distance, so the shadow lifts where the letters rise
   Deliberate differences:
     · flat, horizontal composition (site's Swiss grid, no 45° rotation)
     · mild perspective instead of an orthographic camera, because a
       head-on ortho camera cannot show any Z displacement at all
     · the bump decays back to flat on pointer leave (reference freezes it)
     · on-demand rendering instead of a permanent rAF loop

   The script does nothing unless the page contains [data-hero-shader],
   so it can never run on home.html or any other page.
   ========================================================================= */
(function(){
  'use strict';

  var stage = document.querySelector('[data-hero-shader]');
  if(!stage) return;                      // not the hero page — do nothing

  var title    = stage.querySelector('.hero-title');
  var canvas   = stage.querySelector('canvas');
  if(!title || !canvas) return;

  /* ---------------- fixed headline (never translated) ----------------
     Desktop bakes one line ("Hi, I'm Lila"); ≤620px stacks it into three
     lines per the mobile reference. The h1 fallback mirrors this with
     <br> elements toggled in hero.css, and a resize triggers rebuild(). */
  function lines(){
    return (window.innerWidth <= 620)
      ? ['Hi,', "I'm", 'Lila']
      : ["Hi, I'm Lila"];
  }

  /* ---------------- tuning ---------------- */
  var SEG         = 100;    // plane subdivisions (reference uses 100x100)
  var FOV_DEG     = 32;     // mild perspective, only to make Z visible
  var AMP_FRAC    = 0.11;   // max displacement, fraction of camera distance
  var RADIUS_FRAC = 0.22;   // influence radius, fraction of plane width
  var SHADOW_OFF  = 7;      // px: static drop of the shadow plane
  var SHADOW_A    = 0.34;   // shadow opacity at rest
  var BLUR_FRAC   = 0.085;  // blur radius, fraction of font size
  var EASE_POS    = 0.22;   // pointer follow
  var EASE_STR    = 0.16;   // bump rise
  var EASE_REL    = 0.10;   // decay on leave

  var REDUCED  = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var NO_HOVER = window.matchMedia('(hover: none)').matches;
  var DEBUG_READBACK = /[?&]debug=1/.test(location.search);
  var FORCE_FALLBACK = /[?&]nowebgl=1/.test(location.search);

  /* ---------------- language ----------------
     The headline itself is identical in both languages, so the texture never
     changes. The language is still tracked so the page can react (and so a
     future headline change stays in sync with the site engine).
     ------------------------------------------------------------------ */
  function urlLang(){
    var m = /[?&]lang=(zh|en)\b/.exec(location.search);
    return m ? m[1] : null;
  }
  var lang = urlLang()
    || (function(){ try { return localStorage.getItem('lila-lang') === 'zh' ? 'zh' : 'en'; } catch(e){ return 'en'; } })();

  function setLang(l){
    if(l !== 'en' && l !== 'zh') return;
    lang = l;
    document.documentElement.lang = (l === 'zh') ? 'zh-CN' : 'en';
    build();
  }
  window.addEventListener('lila:lang', function(e){
    if(!urlLang() && e && e.detail) setLang(e.detail.lang);
  });
  window.addEventListener('storage', function(e){
    if(e.key === 'lila-lang' && !urlLang()) setLang(e.newValue === 'zh' ? 'zh' : 'en');
  });

  /* ---------------- font metrics -> canvas texture ---------------- */
  function typeStyle(){
    var cs = getComputedStyle(title);
    return {
      family: cs.fontFamily,
      weight: cs.fontWeight || '600',
      style:  cs.fontStyle || 'normal',
      size:   parseFloat(cs.fontSize) || 48,
      lh:     (cs.lineHeight && cs.lineHeight !== 'normal') ? parseFloat(cs.lineHeight) : (parseFloat(cs.fontSize) || 48) * 1.02,
      ls:     cs.letterSpacing || 'normal',
      color:  cs.color || '#1C1A17'
    };
  }

  function supportsCanvasFilter(){
    var c = document.createElement('canvas').getContext('2d');
    if(!('filter' in c)) return false;
    c.filter = 'blur(2px)';
    return c.filter && c.filter !== 'none';
  }
  var HAS_FILTER = supportsCanvasFilter();

  // draws the headline + smiley; opt = {mode:'ink'|'shadow', ox, oy, alpha, keep}
  function drawContent(ctx, t, box, opt){
    opt = opt || {};
    var mode = opt.mode || 'ink';
    var dpr = box.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, (opt.ox || 0) * dpr, (opt.oy || 0) * dpr);
    if(!opt.keep) ctx.clearRect(-Math.abs(opt.ox || 0) - 4, -Math.abs(opt.oy || 0) - 4,
                                box.cssW + 8, box.cssH + 8);
    ctx.font = t.style + ' ' + t.weight + ' ' + t.size + 'px ' + t.family;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    if('letterSpacing' in ctx) ctx.letterSpacing = (t.ls === 'normal') ? '0px' : t.ls;
    if('fontKerning' in ctx) ctx.fontKerning = 'normal';

    var L = lines();
    var m = ctx.measureText('Hg');
    var A  = m.fontBoundingBoxAscent  || t.size * 0.8;
    var Dd = m.fontBoundingBoxDescent || t.size * 0.2;
    var off = (t.lh - (A + Dd)) / 2 + A;   // CSS inline-box baseline centering

    if(mode === 'shadow'){
      ctx.fillStyle = 'rgba(28,26,23,1)';
      ctx.strokeStyle = 'rgba(28,26,23,1)';
      if(HAS_FILTER) ctx.filter = 'blur(' + (t.size * BLUR_FRAC).toFixed(2) + 'px)';
      ctx.globalAlpha = (opt.alpha != null) ? opt.alpha : 0.95;
    } else {
      ctx.fillStyle = t.color;
      ctx.strokeStyle = t.color;
      ctx.globalAlpha = (opt.alpha != null) ? opt.alpha : 1;
    }

    L.forEach(function(ln, i){
      ctx.fillText(ln, box.pad, box.pad + i * t.lh + off);
    });
    /* NOTE: the smiley is no longer baked into the shader texture — in the
       collage redesign it lives at the end of the sub-line (index.html) so it
       can never cover the illustration. */

    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    if('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  /* ---------------- WebGL ---------------- */
  var VERT_TEXT = [
    'attribute vec2 aPos;',
    'uniform mat4 uProj, uView;',
    'uniform vec2 uPlane, uCenter, uDisp;',
    'uniform float uRadius, uAmp;',
    'varying vec2 vUv; varying float vDist;',
    'float easeInOutCubic(float x){ return x < 0.5 ? 4.0*x*x*x : 1.0 - pow(-2.0*x + 2.0, 3.0)/2.0; }',
    'void main(){',
    '  vUv = aPos * 0.5 + 0.5;',
    '  vec3 p = vec3(uCenter + aPos * 0.5 * uPlane, 0.0);',
    '  float d = distance(p.xy, uDisp);',
    '  vDist = d;',
    '  float t = 1.0 - clamp(d / uRadius, 0.0, 1.0);',
    '  p.z += easeInOutCubic(t) * uAmp;',
    '  gl_Position = uProj * uView * vec4(p, 1.0);',
    '}'
  ].join('\n');

  var FRAG_TEXT = [
    'precision mediump float;',
    'uniform sampler2D uTex; uniform float uOpacity;',
    'varying vec2 vUv;',
    'void main(){',
    '  vec4 c = texture2D(uTex, vec2(vUv.x, 1.0 - vUv.y));',
    '  gl_FragColor = vec4(c.rgb, c.a * uOpacity);',
    '}'
  ].join('\n');

  var VERT_SHADOW = [
    'attribute vec2 aPos;',
    'uniform mat4 uProj, uView;',
    'uniform vec2 uPlane, uCenter, uDisp, uOffset;',
    'varying vec2 vUv; varying float vDist;',
    'void main(){',
    '  vUv = aPos * 0.5 + 0.5;',
    '  vec3 p = vec3(uCenter + aPos * 0.5 * uPlane, 0.0);',
    '  vDist = distance(p.xy, uDisp);',
    '  p.xy += uOffset;',
    '  gl_Position = uProj * uView * vec4(p, 1.0);',
    '}'
  ].join('\n');

  var FRAG_SHADOW = [
    'precision mediump float;',
    'uniform sampler2D uTex; uniform float uRadius, uOpacity, uStrength;',
    'varying vec2 vUv; varying float vDist;',
    'void main(){',
    '  vec4 c = texture2D(uTex, vec2(vUv.x, 1.0 - vUv.y));',
    '  float k = mix(1.0, clamp(vDist / uRadius, 0.0, 1.0), uStrength);',
    '  gl_FragColor = vec4(c.rgb, c.a * k * uOpacity);',
    '}'
  ].join('\n');

  var gl = null, progText = null, progShadow = null, buf = null, ibuf = null, idxCount = 0;
  var texInk = null, texShadow = null;
  var box = null;                        // {cssW,cssH,pad,dpr,planeW,planeH}
  var disp = { x: 0, y: 0 };             // current (world px, stage-centre origin)
  var tgt  = { x: 0, y: 0 };
  var str = 0, tgtStr = 0;
  var raf = 0, pendingBuild = false, destroyed = false;
  var baked = null;                      // {lang, lines} actually uploaded

  function compile(type, src){
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader compile failed');
    return s;
  }
  function program(vs, fs){
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if(!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link failed');
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for(var i = 0; i < n; i++){ var info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p: p, u: u };
  }

  function initGL(){
    var opts = { antialias: true, alpha: true, depth: false, preserveDrawingBuffer: DEBUG_READBACK };
    gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    if(!gl) return false;
    progText   = program(VERT_TEXT, FRAG_TEXT);
    progShadow = program(VERT_SHADOW, FRAG_SHADOW);

    var S = SEG, verts = new Float32Array((S + 1) * (S + 1) * 2), k = 0;
    for(var y = 0; y <= S; y++) for(var x = 0; x <= S; x++){
      verts[k++] = (x / S) * 2 - 1; verts[k++] = (y / S) * 2 - 1;
    }
    var idx = new Uint16Array(S * S * 6), m = 0;
    for(var y2 = 0; y2 < S; y2++) for(var x2 = 0; x2 < S; x2++){
      var a = y2 * (S + 1) + x2, b = a + 1, c = a + S + 1, d = c + 1;
      idx[m++] = a; idx[m++] = b; idx[m++] = c;
      idx[m++] = b; idx[m++] = d; idx[m++] = c;
    }
    idxCount = idx.length;
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    ibuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

    texInk = gl.createTexture(); texShadow = gl.createTexture();
    [texInk, texShadow].forEach(function(t){
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    });

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    return true;
  }

  function upload(tex, cv){
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  }

  function perspective(fovyDeg, aspect){
    var f = 1 / Math.tan(fovyDeg * Math.PI / 360), near = 1, far = 20000;
    var nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ]);
  }
  function view(distance){
    return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,-distance,1]);
  }

  /* ---------------- build / rebuild ---------------- */
  function build(){
    if(destroyed) return;
    if(!gl){ pendingBuild = true; return; }
    pendingBuild = false;
    var t = typeStyle();
    var rect = stage.getBoundingClientRect();
    var blur = t.size * BLUR_FRAC;
    var pad = Math.max(t.size * 0.34, blur * 2.6, 22);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    var cssW = Math.max(1, Math.round(rect.width));
    var cssH = Math.max(1, Math.round(rect.height));
    var scale = 1, maxDim = 2048;
    while((cssW + pad * 2) * dpr * scale > maxDim || (cssH + pad * 2) * dpr * scale > maxDim) scale *= 0.9;
    var effDpr = dpr * scale;

    box = { cssW: cssW, cssH: cssH, pad: pad, dpr: effDpr,
            planeW: cssW + pad * 2, planeH: cssH + pad * 2 };

    canvas.width  = Math.max(1, Math.round(cssW * effDpr));
    canvas.height = Math.max(1, Math.round(cssH * effDpr));
    gl.viewport(0, 0, canvas.width, canvas.height);

    var bw = Math.max(1, Math.round(box.planeW * effDpr));
    var bh = Math.max(1, Math.round(box.planeH * effDpr));

    var ink = document.createElement('canvas'); ink.width = bw; ink.height = bh;
    drawContent(ink.getContext('2d'), t, box, 'ink');

    var sh = document.createElement('canvas'); sh.width = bw; sh.height = bh;
    if(HAS_FILTER){
      drawContent(sh.getContext('2d'), t, box, { mode: 'shadow' });
    } else {
      var c = sh.getContext('2d');
      var R = Math.max(2, Math.round(blur * 0.6));
      for(var i = 0; i < 12; i++){
        var a = i / 12 * Math.PI * 2;
        drawContent(c, t, box, { mode: 'shadow', ox: Math.cos(a) * R, oy: Math.sin(a) * R,
                                 alpha: 0.085, keep: true });
      }
    }
    upload(texInk, ink);
    upload(texShadow, sh);
    baked = { lang: lang, lines: lines().slice() };
    // visible in DevTools: what is actually baked into the GPU texture
    stage.setAttribute('data-baked', baked.lines.join(' / '));
    draw();
  }

  /* ---------------- draw ---------------- */
  function draw(){
    if(!gl || !box || destroyed) return;
    var aspect = canvas.width / canvas.height;
    var proj = perspective(FOV_DEG, aspect);
    var f = 1 / Math.tan(FOV_DEG * Math.PI / 360);
    var dist = f * box.cssH / 2;          // z = 0 plane maps 1:1 onto canvas px
    var vw = view(dist);
    var amp = AMP_FRAC * dist * str;
    var radius = Math.max(70, Math.min(260, RADIUS_FRAC * box.planeW));

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibuf);

    // ---- shadow plane (drawn first) ----
    gl.useProgram(progShadow.p);
    var a1 = gl.getAttribLocation(progShadow.p, 'aPos');
    gl.enableVertexAttribArray(a1);
    gl.vertexAttribPointer(a1, 2, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(progShadow.u.uProj, false, proj);
    gl.uniformMatrix4fv(progShadow.u.uView, false, vw);
    gl.uniform2f(progShadow.u.uPlane, box.planeW, box.planeH);
    gl.uniform2f(progShadow.u.uCenter, 0, 0);
    gl.uniform2f(progShadow.u.uDisp, disp.x, disp.y);
    gl.uniform2f(progShadow.u.uOffset, SHADOW_OFF * 0.35, -SHADOW_OFF);
    gl.uniform1f(progShadow.u.uRadius, radius);
    gl.uniform1f(progShadow.u.uOpacity, SHADOW_A);
    gl.uniform1f(progShadow.u.uStrength, str);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texShadow);
    gl.uniform1i(progShadow.u.uTex, 0);
    gl.drawElements(gl.TRIANGLES, idxCount, gl.UNSIGNED_SHORT, 0);

    // ---- glyph plane ----
    gl.useProgram(progText.p);
    var a2 = gl.getAttribLocation(progText.p, 'aPos');
    gl.enableVertexAttribArray(a2);
    gl.vertexAttribPointer(a2, 2, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(progText.u.uProj, false, proj);
    gl.uniformMatrix4fv(progText.u.uView, false, vw);
    gl.uniform2f(progText.u.uPlane, box.planeW, box.planeH);
    gl.uniform2f(progText.u.uCenter, 0, 0);
    gl.uniform2f(progText.u.uDisp, disp.x, disp.y);
    gl.uniform1f(progText.u.uRadius, radius);
    gl.uniform1f(progText.u.uAmp, amp);
    gl.uniform1f(progText.u.uOpacity, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texInk);
    gl.uniform1i(progText.u.uTex, 0);
    gl.drawElements(gl.TRIANGLES, idxCount, gl.UNSIGNED_SHORT, 0);
  }

  /* ---------------- on-demand loop ---------------- */
  function frame(){
    raf = 0;
    disp.x += (tgt.x - disp.x) * EASE_POS;
    disp.y += (tgt.y - disp.y) * EASE_POS;
    str += (tgtStr - str) * (tgtStr > str ? EASE_STR : EASE_REL);
    var settled = Math.abs(tgtStr - str) < 0.002 &&
                  Math.hypot(tgt.x - disp.x, tgt.y - disp.y) < 0.4;
    if(settled){ str = tgtStr; disp.x = tgt.x; disp.y = tgt.y; }
    draw();
    if(!settled) raf = requestAnimationFrame(frame);
  }
  function kick(){ if(!raf && !destroyed) raf = requestAnimationFrame(frame); }

  /* ---------------- pointer ---------------- */
  function point(e){
    var r = canvas.getBoundingClientRect();
    tgt.x = (e.clientX - r.left) - r.width / 2;
    tgt.y = r.height / 2 - (e.clientY - r.top);
    tgtStr = 1;
    kick();
  }
  function release(){ tgtStr = 0; kick(); }

  /* ---------------- teardown ---------------- */
  var cleanups = [];
  function on(target, type, fn, opts){
    target.addEventListener(type, fn, opts);
    cleanups.push(function(){ target.removeEventListener(type, fn, opts); });
  }
  function destroy(){
    if(destroyed) return;
    destroyed = true;
    if(raf) cancelAnimationFrame(raf);
    raf = 0;
    cleanups.forEach(function(f){ f(); });
    cleanups.length = 0;
    if(gl){
      [texInk, texShadow].forEach(function(t){ if(t) gl.deleteTexture(t); });
      if(buf) gl.deleteBuffer(buf);
      if(ibuf) gl.deleteBuffer(ibuf);
      [progText, progShadow].forEach(function(pr){ if(pr){ gl.deleteProgram(pr.p); } });
      var lose = gl.getExtension('WEBGL_lose_context');
      if(lose) lose.loseContext();
    }
    gl = null; texInk = texShadow = buf = ibuf = null;
    stage.classList.remove('gl-on');
    stage.removeAttribute('data-baked');
    stage.setAttribute('data-shader', 'destroyed');
  }

  /* ---------------- boot ---------------- */
  function fallback(msg){
    gl = null;
    canvas.style.display = 'none';
    stage.classList.remove('gl-on');
    stage.setAttribute('data-shader', 'fallback' + (msg ? ' (' + msg + ')' : ''));
    baked = null;
    stage.removeAttribute('data-baked');
  }

  async function boot(){
    // ?lang=zh|en is a test override: keep the whole page (not just the canvas)
    // consistent by persisting it and letting the site engine re-apply it.
    if(urlLang()){
      try{ localStorage.setItem('lila-lang', lang); }catch(e){}
      document.documentElement.lang = (lang === 'zh') ? 'zh-CN' : 'en';
      var want = lang;
      var btn = document.querySelector('[data-lang-btn="' + want + '"]');
      if(btn && !btn.classList.contains('active')) btn.click();
    }
    document.documentElement.lang = (lang === 'zh') ? 'zh-CN' : 'en';

    // wait for the site's real fonts before baking the texture (hard cap 3s)
    var fontsDone = false;
    if(document.fonts && document.fonts.load){
      try{
        await Promise.race([
          Promise.all([document.fonts.load('600 1em Fraunces'), document.fonts.ready])
            .then(function(){ fontsDone = true; }),
          new Promise(function(r){ setTimeout(r, 3000); })
        ]);
      }catch(e){}
    }
    if(!fontsDone && document.fonts && document.fonts.ready){
      document.fonts.ready.then(function(){ if(gl) build(); });
    }

    if(FORCE_FALLBACK){ fallback('forced'); return; }
    if(REDUCED){ fallback('reduced-motion'); return; }

    var ok = false;
    try{ ok = initGL(); }catch(e){ ok = false; }
    if(!ok){ fallback('no webgl'); return; }

    stage.classList.add('gl-on');
    stage.setAttribute('data-shader', 'active');
    build();
    if(pendingBuild) build();

    if(NO_HOVER){
      // touch: displace only while the finger is down so scrolling is untouched
      on(stage, 'pointerdown', function(e){ point(e); }, { passive: true });
      on(stage, 'pointermove', function(e){ if(e.pressure > 0 || e.buttons) point(e); }, { passive: true });
      on(stage, 'pointerup', release, { passive: true });
      on(stage, 'pointercancel', release, { passive: true });
    } else {
      on(stage, 'pointermove', function(e){ if(e.pointerType === 'mouse') point(e); }, { passive: true });
      on(stage, 'pointerleave', release, { passive: true });
    }

    var rt = 0;
    var onResize = function(){
      clearTimeout(rt);
      rt = setTimeout(function(){ build(); }, 140);
    };
    on(window, 'resize', onResize, { passive: true });
    var ro = null;
    if('ResizeObserver' in window){ ro = new ResizeObserver(onResize); ro.observe(stage); }

    // pause the loop when the tab is hidden; never leaks a rAF across pages
    on(document, 'visibilitychange', function(){
      if(document.hidden){ if(raf){ cancelAnimationFrame(raf); raf = 0; } }
      else if(str || tgtStr){ kick(); }
    }, { passive: true });

    on(canvas, 'webglcontextlost', function(e){
      e.preventDefault();
      if(raf){ cancelAnimationFrame(raf); raf = 0; }
      gl = null;
      canvas.style.display = 'none';
      stage.classList.remove('gl-on');
      stage.setAttribute('data-shader', 'fallback (context lost)');
    }, false);

    // small debug handle: lets anyone confirm what is actually baked
    window.__heroShader = {
      get lang(){ return lang; },
      get baked(){ return baked; },
      get state(){ return stage.getAttribute('data-shader'); },
      setLang: setLang,
      rebuild: function(){ build(); },
      destroy: function(){ if(ro) ro.disconnect(); destroy(); }
    };
  }

  boot();
})();
