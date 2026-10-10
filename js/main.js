/* =========================================================
   LILA — main.js
   Shared shell (nav/footer), Lenis smooth scroll, GSAP reveals,
   torn-paper intro, tape cursor, scroll-spy, counters.
   ========================================================= */
(function(){
  'use strict';
  const REVEAL = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* =========================================================
     I18N ENGINE — global language state (en | zh)
     - English lives in the DOM (EN source + no-JS fallback).
     - Each translatable node carries data-zh (plain text),
       data-zh-html (rich HTML) or data-zh-attr="attr:value".
     - State persisted in localStorage; switching never reloads,
       so the current page + scroll position are preserved.
     ========================================================= */
  const I18N_KEY = 'lila-lang';
  const _orig = new WeakMap();
  function _cap(){
    document.querySelectorAll('[data-zh],[data-zh-html],[data-zh-attr]').forEach(el=>{
      if(_orig.has(el)) return;
      const attrs = {};
      (el.getAttribute('data-zh-attr')||'').split(';').forEach(p=>{
        const i = p.indexOf(':'); if(i<0) return;
        const a = p.slice(0,i).trim(); if(a) attrs[a] = el.getAttribute(a);
      });
      _orig.set(el, {t: el.textContent, h: el.innerHTML, a: attrs});
    });
  }
  function getLang(){ return localStorage.getItem(I18N_KEY) || 'en'; }
  function applyLang(lang){
    _cap();
    document.documentElement.setAttribute('lang', lang==='zh' ? 'zh-CN' : 'en');
    document.querySelectorAll('[data-zh]').forEach(el=>{
      if(lang==='zh') el.textContent = el.getAttribute('data-zh');
      else { const o=_orig.get(el); if(o) el.textContent = o.t; }
    });
    document.querySelectorAll('[data-zh-html]').forEach(el=>{
      if(lang==='zh') el.innerHTML = el.getAttribute('data-zh-html');
      else { const o=_orig.get(el); if(o) el.innerHTML = o.h; }
    });
    document.querySelectorAll('[data-zh-attr]').forEach(el=>{
      (el.getAttribute('data-zh-attr')||'').split(';').forEach(p=>{
        const i = p.indexOf(':'); if(i<0) return;
        const a = p.slice(0,i).trim(); const v = p.slice(i+1).trim();
        if(!a) return;
        if(lang==='zh') el.setAttribute(a, v);
        else { const o=_orig.get(el); const ov = o && o.a[a];
          if(ov!=null) el.setAttribute(a, ov); else el.removeAttribute(a); }
      });
    });
    document.querySelectorAll('[data-lang-btn]').forEach(b=>
      b.classList.toggle('active', b.getAttribute('data-lang-btn')===lang));
    window.dispatchEvent(new CustomEvent('lila:lang', {detail:{lang}}));
  }
  function setLang(l){ try{ localStorage.setItem(I18N_KEY, l); }catch(e){} applyLang(l); }
  // global switcher handler (works on every page; never navigates)
  document.addEventListener('click', e=>{
    const b = e.target.closest('[data-lang-btn]');
    if(b){ e.preventDefault(); setLang(b.getAttribute('data-lang-btn')); }
  });

  /* ---------- NAV HTML ---------- */
  const NAV = `
  <nav class="nav" id="nav">
    <a class="brand" href="index.html">
      <img src="assets/LILA_logo图.jpeg" alt="LILA">
      <span>LILA</span>
    </a>
    <button class="burger" id="burger" aria-label="menu"><span></span><span></span><span></span></button>
    <ul id="nav-links">
      <li><a href="experience.html" data-page="experience">Experience</a></li>
      <li><a href="cases.html" data-page="cases">Cases</a></li>
      <li><a href="content.html" data-page="content">Content</a></li>
      <li><a href="archive.html" data-page="archive">Archive</a></li>
      <li><a href="about.html" data-page="about">About</a></li>
      <li><a class="resume-link" href="resume.html" data-page="resume">Resume ↗</a></li>
      <li class="lang"><button type="button" data-lang-btn="zh">CN</button><i class="lang-sep">/</i><button type="button" data-lang-btn="en">EN</button></li>
    </ul>
  </nav>`;

  /* ---------- FOOTER HTML (with torn-paper divider above) ---------- */
  const TORN = `<div class="torn" aria-hidden="true"><svg viewBox="0 0 1200 46" preserveAspectRatio="none"><path d="M0,30 C60,18 120,40 180,26 C240,14 300,38 360,24 C420,12 480,36 540,22 C600,10 660,34 720,20 C780,8 840,32 900,18 C960,6 1020,30 1080,16 C1140,4 1180,28 1200,20 L1200,46 L0,46 Z" fill="#F4EFE6"/></svg></div>`;
  const FOOTER = `
  ${TORN}
  <footer class="site">
    <div class="wrap">
      <div class="cols">
        <div>
          <div class="f-brand">LILA</div>
          <p class="muted" style="color:rgba(251,248,242,.6);max-width:32ch;margin-top:.6rem" data-zh-html="内容 · 运营 · 研究 · 国际化。<br>把证据变成会传播的故事。">Content · Operations · Research · International.<br>Turning evidence into stories that travel.</p>
        </div>
        <div class="links">
          <a href="experience.html" data-zh="经历">Experience</a>
          <a href="cases.html" data-zh="案例">Cases</a>
          <a href="content.html" data-zh="内容">Content</a>
          <a href="archive.html" data-zh="档案">Archive</a>
          <a href="about.html" data-zh="关于">About</a>
          <a href="resume.html" data-zh="简历">Resume</a>
        </div>
        <div class="social">
          <a href="mailto:glimmerflow@163.com" data-zh="邮箱">Email</a>
          <a href="#" onclick="return false" data-zh="微信 · lt_ttkx77">WeChat · lt_ttkx77</a>
          <a href="#" onclick="return false">LinkedIn</a>
        </div>
      </div>
      <div class="copy">
        <span data-zh="© 2026 LILA · 用真实素材搭建，无 AI 冒充。">© 2026 LILA · Built with real materials, no AI impersonation.</span>
        <span><a href="index.html" data-zh="回到顶部 ↑">Back to top ↑</a></span>
      </div>
    </div>
  </footer>`;

  function inject(){
    const nr = document.getElementById('nav-root');
    const fr = document.getElementById('footer-root');
    if(nr) nr.outerHTML = NAV;
    if(fr) fr.outerHTML = FOOTER;
    // active link
    const page = document.body.dataset.page;
    if(page){
      document.querySelectorAll('#nav-links a').forEach(a=>{
        if(a.dataset.page===page) a.classList.add('active');
      });
    }
    // burger
    const burger = document.getElementById('burger');
    const links = document.getElementById('nav-links');
    if(burger && links){
      burger.addEventListener('click',()=>links.classList.toggle('open'));
      links.addEventListener('click',e=>{ if(e.target.tagName==='A') links.classList.remove('open'); });
    }
    // nav solid on scroll
    const nav = document.getElementById('nav');
    const onScroll=()=>{ if(nav) nav.classList.toggle('solid', window.scrollY>40); };
    window.addEventListener('scroll',onScroll,{passive:true}); onScroll();
  }

  /* ---------- LIBS (load GSAP + Lenis locally) ---------- */
  function loadScript(src){
    return new Promise((res,rej)=>{
      const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s);
    });
  }

  async function boot(){
    inject();
    applyLang(getLang());
    try{
      await loadScript('vendor/gsap.min.js');
      await loadScript('vendor/lenis.min.js');
    }catch(e){ /* fall back to no-anim */ }

    const hasGSAP = typeof window.gsap !== 'undefined';
    const hasLenis = typeof window.Lenis !== 'undefined';

    // Lenis
    let lenis=null;
    if(hasLenis && REVEAL){
      lenis = new Lenis({duration:1.05, smoothWheel:true, wheelMultiplier:.9});
      if(hasGSAP && window.ScrollTrigger){
        lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.add(t=>lenis.raf(t*1000));
        gsap.ticker.lagSmoothing(0);
      } else {
        function raf(t){ lenis.raf(t); requestAnimationFrame(raf); }
        requestAnimationFrame(raf);
      }
    }

    // Reveals + bar fills via IntersectionObserver (robust, decoupled from GSAP)
    if('IntersectionObserver' in window){
      const io=new IntersectionObserver((es)=>es.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target);} }),{threshold:.12,rootMargin:'0px 0px -8% 0px'});
      document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
      const bio=new IntersectionObserver((es)=>es.forEach(e=>{ if(e.isIntersecting){ e.target.style.width=e.target.dataset.w||e.target.style.width; bio.unobserve(e.target);} }),{threshold:.3});
      document.querySelectorAll('.bar-fill').forEach(b=>bio.observe(b));
    } else {
      document.querySelectorAll('.reveal').forEach(el=>el.classList.add('in'));
      document.querySelectorAll('.bar-fill').forEach(b=>b.style.width=b.dataset.w||b.style.width);
    }

    // counters
    document.querySelectorAll('.counter').forEach(el=>{
      const target=+el.dataset.target, dur=1400, t0=performance.now();
      const step=now=>{ const p=Math.min(1,(now-t0)/dur); const v=Math.round(target*(1-Math.pow(1-p,3))); el.textContent=v.toLocaleString(); if(p<1) requestAnimationFrame(step); };
      if(REVEAL){ const io=new IntersectionObserver((es)=>es.forEach(e=>{if(e.isIntersecting){requestAnimationFrame(step);io.disconnect();}}),{threshold:.4}); io.observe(el);} else el.textContent=target.toLocaleString();
    });

    // side-nav scroll spy
    const snLinks=[...document.querySelectorAll('.side-nav a')];
    if(snLinks.length){
      const blocks=snLinks.map(a=>document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
      const spy=()=>{ let cur=blocks[0]; const y=window.scrollY+140;
        blocks.forEach(b=>{ if(b.offsetTop<=y) cur=b; });
        snLinks.forEach(a=>a.classList.toggle('active', a.getAttribute('href')==='#'+cur.id));
      };
      window.addEventListener('scroll',spy,{passive:true}); spy();
    }

    // tape cursor (archive/cases)
    if(document.body.classList.contains('tape')) initTape();

    // intro (home)
    // The torn-paper opening was removed from index.html (ROUND 2H). It now
    // runs only where an #intro element is actually present AND the page has
    // not opted out with <body data-no-intro>; other pages keep the behaviour.
    if(document.body.classList.contains('home')
       && !document.body.hasAttribute('data-no-intro')) initIntro(hasGSAP);

    // brush-trail cursor (home)
    if(document.body.classList.contains('home')) initTrail();
  }

  /* ---------- TAPE CURSOR ---------- */
  function initTape(){
    const tape=document.getElementById('tape');
    if(!tape) return;
    const img=tape.querySelector('.tp-img'), txt=tape.querySelector('.tp-txt');
    let tx=window.innerWidth/2, ty=window.innerHeight/2, cx=tx, cy=ty, on=false;
    document.body.classList.add('tape-on');
    window.addEventListener('mousemove',e=>{ tx=e.clientX; ty=e.clientY; if(!on){on=true;} });
    const loop=()=>{ cx+=(tx-cx)*0.16; cy+=(ty-cy)*0.16; tape.style.transform=`translate(${cx}px,${cy}px) translate(-50%,-50%) rotate(-8deg)`; requestAnimationFrame(loop); };
    loop();
    document.querySelectorAll('[data-tape]').forEach(el=>{
      el.addEventListener('mouseenter',()=>{
        const src=el.dataset.tape;
        if(src){ img.src=src; img.style.opacity=1; txt.style.display='none'; }
        else { img.style.opacity=0; txt.style.display='block'; txt.textContent=el.dataset.tapeLabel||'LILA'; }
      });
      el.addEventListener('mouseleave',()=>{ img.style.opacity=0; txt.style.display='block'; txt.textContent=el.dataset.tapeLabel||'LILA'; });
    });
  }

  /* ---------- BRUSH-TRAIL CURSOR (home only) ---------- */
  function initTrail(){
    if(!REVEAL) return;                                          // respects prefers-reduced-motion
    if(window.matchMedia('(hover: none)').matches) return;        // touch devices
    if(window.innerWidth < 900) return;                           // small screens

    const cv = document.createElement('canvas');
    cv.id = 'trail';
    cv.setAttribute('aria-hidden','true');
    document.body.appendChild(cv);
    const ctx = cv.getContext('2d');
    if(!ctx){ cv.remove(); return; }

    // refined green palette: one related ramp, deep → light.
    // Ordered so the sequential stroke cycle (ci advances each new stroke)
    // reads as a smooth tonal gradient. The palest reference tone (#DCEFE1)
    // is left out: it sits too close to the cream paper (#F4EFE6) to stay visible.
    const PALETTE = ['#174A38','#2F7657','#68A982','#A8CDB1'];
    const MAX_STROKES = 40, MAX_PTS = 8, MIN_DIST = 7;

    let W = 0, H = 0, dpr = 1;
    function resize(){
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr);
      cv.style.width = W+'px'; cv.style.height = H+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    resize();

    const strokes = [];
    let ci = Math.floor(Math.random()*PALETTE.length);
    let last = null, raf = 0, running = false;

    function newStroke(x,y){
      ci = (ci + 1 + (Math.random() < 0.22 ? 1 : 0)) % PALETTE.length;
      strokes.push({
        pts:[{x:x,y:y}],
        color: PALETTE[ci],
        born: performance.now(),
        life: 620 + Math.random()*540,          // ~0.62s – 1.16s
        w: 10 + Math.random()*6
      });
      if(strokes.length > MAX_STROKES) strokes.shift();
    }

    function quad(p0,p1,w0,w1){
      const dx=p1.x-p0.x, dy=p1.y-p0.y;
      const len=Math.hypot(dx,dy) || 1;
      const nx=-dy/len, ny=dx/len;
      ctx.beginPath();
      ctx.moveTo(p0.x+nx*w0/2, p0.y+ny*w0/2);
      ctx.lineTo(p1.x+nx*w1/2, p1.y+ny*w1/2);
      ctx.lineTo(p1.x-nx*w1/2, p1.y-ny*w1/2);
      ctx.lineTo(p0.x-nx*w0/2, p0.y-ny*w0/2);
      ctx.closePath();
      ctx.fill();
    }

    function drawStroke(s, a){
      const pts = s.pts;
      ctx.globalAlpha = a;
      ctx.fillStyle = s.color;
      if(pts.length < 2){
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, Math.max(0.6, s.w*0.35*a), 0, Math.PI*2);
        ctx.fill();
        return;
      }
      const n = pts.length;
      for(let i=0;i<n-1;i++){
        const t0 = i/(n-1), t1 = (i+1)/(n-1);
        // brush taper: thin tail → full width at the head, thinning again as it fades
        const k = 0.5 + 0.5*a;
        const w0 = s.w * (0.28 + 0.72*t0) * k;
        const w1 = s.w * (0.28 + 0.72*t1) * k;
        quad(pts[i], pts[i+1], w0, w1);
        ctx.beginPath();                       // smooth the joint
        ctx.arc(pts[i+1].x, pts[i+1].y, Math.max(0.6, w1/2), 0, Math.PI*2);
        ctx.fill();
      }
    }

    function frame(){
      const now = performance.now();
      ctx.clearRect(0,0,W,H);
      for(let i=strokes.length-1;i>=0;i--){
        const s = strokes[i];
        const age = (now - s.born) / s.life;
        if(age >= 1){ strokes.splice(i,1); continue; }
        drawStroke(s, 1-age);
      }
      ctx.globalAlpha = 1;
      if(strokes.length){ raf = requestAnimationFrame(frame); }
      else { running = false; raf = 0; }
    }

    function start(){ if(!running){ running = true; raf = requestAnimationFrame(frame); } }

    window.addEventListener('mousemove', e=>{
      const x = e.clientX, y = e.clientY;
      if(!last){ last = {x:x,y:y}; newStroke(x,y); start(); return; }
      const dx = x-last.x, dy = y-last.y;
      if(Math.hypot(dx,dy) < MIN_DIST) return;
      const cur = strokes[strokes.length-1];
      const fresh = cur && cur.pts.length < MAX_PTS && (performance.now()-cur.born) < 240;
      if(fresh) cur.pts.push({x:x,y:y});
      else { newStroke(last.x, last.y); strokes[strokes.length-1].pts.push({x:x,y:y}); }
      last = {x:x,y:y};
      start();
    }, {passive:true});

    let rt;
    window.addEventListener('resize', ()=>{
      clearTimeout(rt);
      rt = setTimeout(()=>{
        if(window.innerWidth < 900){                 // stop cleanly on small viewports
          if(raf) cancelAnimationFrame(raf);
          running = false; strokes.length = 0;
          ctx.clearRect(0,0,W,H);
          return;
        }
        resize();
      }, 160);
    }, {passive:true});
  }

  /* ---------- TORN-PAPER INTRO ---------- */
  function initIntro(hasGSAP){
    const intro=document.getElementById('intro');
    if(!intro){ return; }
    const open=()=>{
      if(intro.dataset.done) return; intro.dataset.done='1';
      if(hasGSAP && REVEAL){
        const tl=gsap.timeline({onComplete:()=>{ intro.style.display='none'; window.scrollTo(0,0); }});
        tl.to('.intro-text',{opacity:0,duration:.4})
          .to('.leaf-l',{xPercent:-105,rotation:-4,duration:1.0,ease:'power3.inOut'},0)
          .to('.leaf-r',{xPercent:105,rotation:4,duration:1.0,ease:'power3.inOut'},0)
          .to(intro,{opacity:0,duration:.5},'+=.15');
      } else {
        intro.style.display='none';
      }
    };
    intro.addEventListener('click',open);
    const skip=intro.querySelector('.skip'); if(skip) skip.addEventListener('click',e=>{e.stopPropagation();open();});
    // auto-open after a while if user doesn't click
    setTimeout(()=>{ if(!intro.dataset.done) open(); }, 4200);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
