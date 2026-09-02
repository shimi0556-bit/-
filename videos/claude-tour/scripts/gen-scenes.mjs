#!/usr/bin/env node
// Generates compositions/<id>.html for each scene, plus index.html, from one
// shared shell (mascot, ambient background, typography, motion helpers).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PAD = 1.2; // local seconds before narration audio starts

const SCENES = [
  {
    id: "s1",
    eyebrow: "A QUICK INTRO",
    headline: "Claude is <em>not</em> just another chatbot",
    body: "It's an AI assistant from Anthropic that writes, codes, reads images, uses real tools — and was built from the ground up around one question: how do you do that safely.",
    narration: "Hi, I'm Claude. In the next minute or so, let's look at what's actually happening under the hood.",
    audio: "s1", audioDur: 5.333, total: 7.5,
    art: (id) => `
      <svg class="hero-spark" viewBox="0 0 120 120">
        <circle class="glow-core" id="${id}-glow" cx="60" cy="60" r="30"/>
        <g class="orbit-rev" id="${id}-orbit-rev"><circle class="orbit" cx="60" cy="60" r="54"/></g>
        <g class="orbit-fwd" id="${id}-orbit-fwd"><circle class="orbit" cx="60" cy="60" r="42"/></g>
        <g class="spark-rays" id="${id}-rays">
          <line class="ray" x1="60" y1="60" x2="106" y2="60"/>
          <line class="ray" x1="60" y1="60" x2="83" y2="99.8"/>
          <line class="ray" x1="60" y1="60" x2="37" y2="99.8"/>
          <line class="ray" x1="60" y1="60" x2="14" y2="60"/>
          <line class="ray" x1="60" y1="60" x2="37" y2="20.2"/>
          <line class="ray" x1="60" y1="60" x2="83" y2="20.2"/>
          <line class="ray ray-short" x1="60" y1="60" x2="80.8" y2="72"/>
          <line class="ray ray-short" x1="60" y1="60" x2="60" y2="84"/>
          <line class="ray ray-short" x1="60" y1="60" x2="39.2" y2="72"/>
          <line class="ray ray-short" x1="60" y1="60" x2="39.2" y2="48"/>
          <line class="ray ray-short" x1="60" y1="60" x2="60" y2="36"/>
          <line class="ray ray-short" x1="60" y1="60" x2="80.8" y2="48"/>
          <circle class="tip" cx="106" cy="60" r="3"/><circle class="tip" cx="83" cy="99.8" r="3"/>
          <circle class="tip" cx="37" cy="99.8" r="3"/><circle class="tip" cx="14" cy="60" r="3"/>
          <circle class="tip" cx="37" cy="20.2" r="3"/><circle class="tip" cx="83" cy="20.2" r="3"/>
          <circle class="tip tip-short" cx="80.8" cy="72" r="2"/><circle class="tip tip-short" cx="60" cy="84" r="2"/>
          <circle class="tip tip-short" cx="39.2" cy="72" r="2"/><circle class="tip tip-short" cx="39.2" cy="48" r="2"/>
          <circle class="tip tip-short" cx="60" cy="36" r="2"/><circle class="tip tip-short" cx="80.8" cy="48" r="2"/>
        </g>
      </svg>`,
    artAnim: (id, total) => `
      tl.fromTo("#${id}-art", { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: "back.out(1.6)" }, 0.5);
      tl.to("#${id}-rays", { rotation: 40, duration: ${total}, ease: "none", transformOrigin: "60px 60px" }, 0);
      tl.to("#${id}-orbit-fwd", { rotation: 90, duration: ${total}, ease: "none", transformOrigin: "60px 60px" }, 0);
      tl.to("#${id}-orbit-rev", { rotation: -70, duration: ${total}, ease: "none", transformOrigin: "60px 60px" }, 0);
      tl.to("#${id}-glow", { scale: 1.15, opacity: 0.75, duration: 1.7, repeat: ${Math.max(0, Math.floor(total / 1.7) - 1)}, yoyo: true, ease: "sine.inOut", transformOrigin: "60px 60px" }, 0);`,
  },
  {
    id: "s2",
    eyebrow: "WHO BUILT ME",
    headline: "Built by <em>Anthropic</em>",
    body: "An AI safety research company — its mission is making sure transformative AI actually benefits humanity, not just gets smarter.",
    narration: "Anthropic built me around three ideas: be helpful, be honest, and don't cause harm, all three together, not just one.",
    audio: "s2", audioDur: 6.997, total: 9.0,
    art: (id) => `
      <div class="chip-col">
        <div class="pillar-chip" id="${id}-p1"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><path d="M12 3l2.4 5.5L20 10l-4.6 3.6L16.5 20 12 16.8 7.5 20l1.1-6.4L4 10l5.6-1.5L12 3z"/></svg><span>Helpful</span></div>
        <div class="pillar-chip" id="${id}-p2"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></svg><span>Honest</span></div>
        <div class="pillar-chip" id="${id}-p3"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><path d="M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6l7-3z"/></svg><span>Harmless</span></div>
      </div>`,
    artAnim: (id) => `
      tl.fromTo("#${id}-p1", { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, 0.55);
      tl.fromTo("#${id}-p2", { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, 0.72);
      tl.fromTo("#${id}-p3", { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, 0.89);`,
  },
  {
    id: "s3",
    eyebrow: "CORE CAPABILITY 01",
    headline: "Writes, edits, and <em>thinks out loud</em>",
    body: "From a first draft to a careful edit, unpacking a dense argument, or summarizing a long document — and on hard problems, laying out its reasoning before the final answer.",
    narration: "I can write, edit, and reason through complicated arguments, and on hard problems I can even think out loud before I answer.",
    audio: "s3", audioDur: 7.787, total: 9.8,
    art: (id) => `
      <svg width="260" height="230" viewBox="0 0 220 200">
        <g stroke="#3a3648" stroke-width="1.6">
          <line id="${id}-l1" x1="40" y1="55" x2="170" y2="55"/>
          <line id="${id}-l2" x1="40" y1="82" x2="170" y2="82"/>
          <line id="${id}-l3" x1="40" y1="109" x2="135" y2="109"/>
        </g>
        <path id="${id}-pen" d="M50 150 l90 -90 14 14 -90 90 -20 6z" fill="none" stroke="#FF6B4A" stroke-width="3.4" stroke-linejoin="round"/>
      </svg>`,
    artAnim: (id) => `
      tl.fromTo("#${id}-l1", { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 0.4, ease: "power2.out" }, 0.55);
      tl.fromTo("#${id}-l2", { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 0.4, ease: "power2.out" }, 0.7);
      tl.fromTo("#${id}-l3", { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 0.4, ease: "power2.out" }, 0.85);
      tl.fromTo("#${id}-pen", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.7)", transformOrigin: "50% 50%" }, 1.0);`,
  },
  {
    id: "s4",
    eyebrow: "CORE CAPABILITY 02",
    headline: "Writes code, <em>runs it</em>, and fixes it",
    body: "Claude Code reads files, edits code, runs terminal commands, and carries a multi-step engineering task through to the end — not just autocompleting one line.",
    narration: "By the way, earlier in this very conversation we built two real MCP servers together, code, tests, and all. That's the kind of work I love most.",
    audio: "s4", audioDur: 9.472, total: 11.5,
    art: (id) => `
      <div class="code-card" id="${id}-code">
        <div class="code-topbar"><span class="dot d1"></span><span class="dot d2"></span><span class="dot d3"></span></div>
        <div class="code-line"><span class="kw">const</span> server</div>
        <div class="code-line dim">.registerTool(</div>
        <div class="code-line accent">&nbsp;&nbsp;"trigger_clip"</div>
        <div class="code-line dim">)</div>
      </div>
      <div class="stat-panel" id="${id}-stat">
        <div class="stat-num">2</div>
        <div class="stat-label">MCP servers built, tested, and pushed to GitHub — in this very conversation.</div>
      </div>`,
    artAnim: (id) => `
      tl.fromTo("#${id}-code", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, 0.5);
      tl.fromTo("#${id}-stat", { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, 0.9);`,
  },
  {
    id: "s5",
    eyebrow: "CORE CAPABILITY 03",
    headline: "Sees, and <em>understands</em>",
    body: "A photo, a chart, a scanned table, or a screenshot — they all enter the same conversation as the text, and get interpreted together: writing, code, sound and vision meeting in one place.",
    narration: "I don't just read text. I can look at images, charts, and screenshots, and understand what's actually in them.",
    audio: "s5", audioDur: 6.229, total: 8.2,
    art: (id) => `
      <svg width="280" height="240" viewBox="0 0 260 220">
        <path id="${id}-l1" class="mm-line" d="M130,110 C90,90 60,70 40,40"/>
        <path id="${id}-l2" class="mm-line" d="M130,110 C170,90 200,70 220,40"/>
        <path id="${id}-l3" class="mm-line" d="M130,110 C90,130 60,150 40,180"/>
        <path id="${id}-l4" class="mm-line" d="M130,110 C170,130 200,150 220,180"/>
        <circle id="${id}-hub" cx="130" cy="110" r="9" fill="#FF6B4A"/>
        <circle class="mm-node" cx="40" cy="40" r="20"/>
        <path fill="none" stroke="#4FD8C4" stroke-width="1.6" d="M32,48 l10,-16 6,10 4,-6 6,10z"/>
        <circle class="mm-node" cx="220" cy="40" r="20"/>
        <text x="220" y="46" class="mono-label" text-anchor="middle">&lt;/&gt;</text>
        <circle class="mm-node" cx="40" cy="180" r="20"/>
        <path fill="none" stroke="#4FD8C4" stroke-width="1.6" d="M30,180 q4,-14 5,0 q4,-20 5,0 q4,-10 5,0 q4,-16 5,0"/>
        <circle class="mm-node" cx="220" cy="180" r="20"/>
        <rect x="209" y="169" width="22" height="22" rx="2" fill="none" stroke="#4FD8C4" stroke-width="1.6"/>
      </svg>`,
    artAnim: (id, total) => `
      ["l1","l2","l3","l4"].forEach((k,i)=>{
        const el = document.getElementById("${id}-"+k);
        const len = el.getTotalLength();
        gsap.set(el, { strokeDasharray: len, strokeDashoffset: len });
        tl.to(el, { strokeDashoffset: 0, duration: 0.55, ease: "power2.out" }, 0.5 + i*0.12);
      });
      tl.fromTo("#${id}-hub", { scale: 0 }, { scale: 1, duration: 0.4, ease: "back.out(2)", transformOrigin: "50% 50%" }, 0.5);
      tl.to("#${id}-hub", { scale: 1.3, duration: 1.3, repeat: ${Math.max(0, Math.floor(total / 1.3) - 1)}, yoyo: true, ease: "sine.inOut", transformOrigin: "50% 50%" }, 1.0);`,
  },
  {
    id: "s6",
    eyebrow: "CORE CAPABILITY 04",
    headline: "Remembers the <em>whole conversation</em>",
    body: "A huge context window means loading an entire book or a massive codebase and working with it for the whole conversation. For longer projects, Projects and Artifacts keep the live version around.",
    narration: "I can hold an entire book, or a huge codebase, in my head, all in the same conversation, without losing the thread.",
    audio: "s6", audioDur: 6.869, total: 8.9,
    art: (id) => `
      <div class="stat-panel wide" id="${id}-stat">
        <div class="stat-row"><span class="stat-num mono" id="${id}-counter">0</span><span class="stat-unit">tokens</span></div>
        <div class="stat-label">a typical single context window — enough for a whole book, in one stretch</div>
      </div>`,
    artAnim: (id) => `
      tl.fromTo("#${id}-stat", { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, 0.5);
      (function(){
        const counter = { v: 0 };
        const el = document.getElementById("${id}-counter");
        tl.to(counter, { v: 200000, duration: 1.4, ease: "power2.out", onUpdate: function(){ el.textContent = Math.floor(counter.v).toLocaleString("en-US"); } }, 0.7);
      })();`,
  },
  {
    id: "s7",
    eyebrow: "CORE CAPABILITY 05",
    headline: "Connects to <em>real tools</em>",
    body: "Web search, running code, or wiring up to any external service through the Model Context Protocol (MCP) — an open standard Anthropic created that turns “answering questions” into “getting things done.”",
    narration: "M C P is an open standard Anthropic created. It lets me connect to real tools, just like the two servers we built a minute ago.",
    audio: "s7", audioDur: 8.469, total: 10.5,
    art: (id) => `
      <svg width="260" height="230" viewBox="0 0 240 220">
        <circle id="${id}-hub" cx="120" cy="110" r="26" fill="none" stroke="#FF6B4A" stroke-width="2.4"/>
        <text x="120" y="116" text-anchor="middle" class="mono-label accent">MCP</text>
        <g stroke="#3a3648" stroke-width="1.6" stroke-dasharray="3 6">
          <line x1="120" y1="84" x2="120" y2="30"/><line x1="146" y1="110" x2="205" y2="110"/>
          <line x1="120" y1="136" x2="120" y2="190"/><line x1="94" y1="110" x2="35" y2="110"/>
        </g>
        <circle class="mm-node" cx="120" cy="20" r="16"/><circle class="mm-node" cx="215" cy="110" r="16"/>
        <circle class="mm-node" cx="120" cy="200" r="16"/><circle class="mm-node" cx="25" cy="110" r="16"/>
      </svg>
      <div class="chips" id="${id}-chips">
        <span class="chip">Slack</span><span class="chip">GitHub</span><span class="chip">Resolume MCP</span><span class="chip">DALL·E MCP</span>
      </div>`,
    artAnim: (id, total) => `
      tl.fromTo("#${id}-hub", { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(1.8)", transformOrigin: "50% 50%" }, 0.5);
      tl.to("#${id}-hub", { rotation: 12, duration: 1.6, repeat: ${Math.max(0, Math.floor(total / 1.6) - 1)}, yoyo: true, ease: "sine.inOut", transformOrigin: "50% 50%" }, 1.0);
      tl.fromTo("#${id}-chips .chip", { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power3.out", stagger: 0.1 }, 0.85);`,
  },
  {
    id: "s8",
    eyebrow: "CORE CAPABILITY 06",
    headline: "Safety is <em>not an add-on</em>",
    body: "Trained with Constitutional AI, alignment research, and red teams that deliberately try to break it — so the answer is both useful and responsible, and honest about the limits of what it knows.",
    narration: "I'm trained to say I'm not sure when that's true, and to gently decline anything harmful without derailing the conversation.",
    audio: "s8", audioDur: 6.827, total: 8.8,
    art: (id) => `
      <div class="chip-col" id="${id}-chips">
        <div class="pillar-chip"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><path d="M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg><span>Constitutional AI</span></div>
        <div class="pillar-chip"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg><span>Red-teaming</span></div>
        <div class="pillar-chip"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><path d="M4 12h16M12 4v16"/></svg><span>Alignment research</span></div>
      </div>`,
    artAnim: (id) => `
      tl.fromTo("#${id}-chips .pillar-chip", { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out", stagger: 0.16 }, 0.55);`,
  },
  {
    id: "s9",
    eyebrow: "TO SUM UP",
    headline: "And that's <em>not even all</em>",
    body: "Writing, code, vision, long memory, real tools, and safety built in from the start — all in one conversation. Start at claude.ai, or straight from the terminal with Claude Code.",
    narration: "That's just the surface. Thanks for watching, now let's go build something together.",
    audio: "s9", audioDur: 4.736, total: 7.5,
    art: (id) => `
      <div class="chips" id="${id}-chips">
        <span class="chip mono">claude.ai</span><span class="chip mono">claude.com/code</span>
      </div>`,
    artAnim: (id) => `
      tl.fromTo("#${id}-chips .chip", { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power3.out", stagger: 0.12 }, 0.6);`,
  },
];

function sharedStyle() {
  return `
    #root { position:absolute; inset:0; background:#14121B; color:#F4F1EC; font-family:'Montserrat',sans-serif; overflow:hidden; }
    .ambient{position:absolute; inset:0; overflow:hidden; pointer-events:none;}
    .orb{position:absolute; border-radius:50%; filter:blur(70px); opacity:.28;}
    .orb1{width:640px; height:640px; background:#FF6B4A; top:-80px; right:-80px;}
    .orb2{width:520px; height:520px; background:#4FD8C4; bottom:-180px; left:-140px; opacity:.18;}
    .content{position:absolute; inset:0; display:flex; align-items:center; padding:0 120px;}
    .body-row{display:flex; align-items:center; gap:100px; width:100%;}
    .text-col.split{max-width:620px; flex:0 0 auto;}
    .art-col{flex:1; display:flex; align-items:center; justify-content:center; min-width:0;}
    .eyebrow{font-family:'IBM Plex Mono',monospace; font-size:22px; letter-spacing:.14em; color:#FF6B4A; margin-bottom:22px; display:flex; align-items:center; gap:14px;}
    .eyebrow::before{content:""; width:34px; height:2px; background:#FF6B4A; display:inline-block;}
    h1{font-family:'League Gothic',sans-serif; font-weight:400; font-size:92px; line-height:1.02; margin:0 0 30px 0; letter-spacing:.005em;}
    h1 em{font-style:normal; color:#FF6B4A;}
    .body-text{font-size:30px; line-height:1.5; color:#C9C4D6; font-weight:350; max-width:640px;}
    .chip-col{display:flex; flex-direction:column; gap:20px;}
    .pillar-chip{display:flex; align-items:center; gap:18px; background:#1D1B25; border:1px solid #332F3D; border-radius:8px; padding:18px 28px; font-size:26px; font-weight:500;}
    .pillar-chip svg{width:34px; height:34px; stroke:#4FD8C4; flex-shrink:0;}
    .chips{display:flex; flex-wrap:wrap; gap:16px; margin-top:36px;}
    .chip{display:inline-flex; align-items:center; padding:14px 26px; border-radius:999px; border:1px solid #332F3D; background:#1D1B25; font-size:24px;}
    .chip.mono{font-family:'IBM Plex Mono',monospace;}
    .stat-panel{margin-top:20px; padding:32px 36px; background:#1D1B25; border-right:5px solid #FF6B4A; max-width:640px;}
    .stat-panel.wide{max-width:720px;}
    .stat-row{display:flex; align-items:baseline; gap:16px;}
    .stat-num{font-family:'IBM Plex Mono',monospace; font-size:64px; font-weight:700; color:#FF6B4A; font-variant-numeric:tabular-nums;}
    .stat-unit{font-family:'IBM Plex Mono',monospace; font-size:28px; color:#C9C4D6;}
    .stat-label{color:#A9A4B5; font-size:22px; margin-top:10px; line-height:1.4;}
    .code-card{background:#1D1B25; border:1px solid #332F3D; border-radius:10px; padding:20px 26px; width:440px;}
    .code-topbar{display:flex; gap:8px; margin-bottom:16px;}
    .code-topbar .dot{width:12px; height:12px; border-radius:50%; display:inline-block;}
    .code-topbar .d1{background:#FF6B4A;} .code-topbar .d2{background:#5A2E22;} .code-topbar .d3{background:#4FD8C4;}
    .code-line{font-family:'IBM Plex Mono',monospace; font-size:22px; color:#F4F1EC; padding:3px 0;}
    .code-line.dim{color:#7A7488;} .code-line.accent{color:#FF6B4A;} .kw{color:#4FD8C4;}
    .hero-spark{width:420px; height:420px;}
    .glow-core{fill:#FF6B4A; filter:blur(16px); opacity:.5;}
    .orbit{fill:none; stroke:#332F3D; stroke-dasharray:2 9;}
    .ray{stroke:#FF6B4A; stroke-width:4; stroke-linecap:round;}
    .ray-short{stroke:#4FD8C4; stroke-width:2.6; opacity:.85;}
    .tip{fill:#FF6B4A;} .tip-short{fill:#4FD8C4;}
    .mm-line{fill:none; stroke:#332F3D; stroke-width:1.6;}
    .mm-node{fill:#1D1B25; stroke:#7A7488; stroke-width:1.4;}
    .mono-label{font-family:'IBM Plex Mono',monospace; font-size:15px; fill:#4FD8C4;}
    .mono-label.accent{fill:#FF6B4A; font-size:17px;}
    .narrator{position:absolute; left:70px; bottom:64px; display:flex; align-items:flex-end; gap:22px; max-width:900px;}
    .spark-avatar{width:120px; height:120px; flex-shrink:0;}
    .avatar-glow{fill:#FF6B4A; filter:blur(14px); opacity:.5;}
    .avatar-body{fill:#FF6B4A;}
    .avatar-eye{fill:#14121B;}
    .avatar-mouth{fill:#14121B;}
    .speech-bubble{position:relative; background:#1D1B25; border:1px solid #332F3D; border-radius:6px; padding:22px 28px; font-size:25px; line-height:1.5; color:#F4F1EC; max-width:760px;}
    .speech-bubble::after{content:""; position:absolute; bottom:22px; left:-9px; width:16px; height:16px; background:#1D1B25; border-left:1px solid #332F3D; border-bottom:1px solid #332F3D; transform:rotate(45deg);}
  `;
}

function mascotSVG(id) {
  return `
    <svg class="spark-avatar" id="${id}-avatar" viewBox="0 0 120 120">
      <circle class="avatar-glow" cx="60" cy="66" r="30"/>
      <path class="avatar-body" d="M60 20c22 0 34 16 34 36 0 22-15 38-34 38S26 78 26 56c0-20 12-36 34-36z"/>
      <ellipse class="avatar-eye" id="${id}-eye-l" cx="49" cy="58" rx="4.4" ry="6"/>
      <ellipse class="avatar-eye" id="${id}-eye-r" cx="71" cy="58" rx="4.4" ry="6"/>
      <rect class="avatar-mouth" id="${id}-mouth" x="51" y="75" width="18" height="5.5" rx="2.75"/>
    </svg>`;
}

function sceneTemplate(cfg) {
  const { id, eyebrow, headline, body, narration, audio, audioDur, total } = cfg;
  const talkEnd = PAD + audioDur;
  const mouthCycle = 0.16;
  const mouthRepeat = Math.max(0, Math.floor(audioDur / mouthCycle) - 1);
  const blinkRepeat = Math.max(0, Math.floor(total / 3.4) - 1);
  const bobRepeat = Math.max(0, Math.floor(total / 1.6) - 1);
  const artAnim = cfg.artAnim(id, total);
  const artHtml = cfg.art(id);

  return `<!doctype html>
<html>
  <head><meta charset="UTF-8" /></head>
  <body>
    <template>
      <style>
        ${sharedStyle()}
      </style>
      <div id="root" data-composition-id="${id}" data-width="1920" data-height="1080" data-duration="${total}">
        <div class="ambient"><div class="orb orb1" data-layout-allow-overflow></div><div class="orb orb2" data-layout-allow-overflow></div></div>

        <div class="content">
          <div class="body-row">
            <div class="text-col split" id="${id}-text">
              <div class="eyebrow" id="${id}-eyebrow">${eyebrow}</div>
              <h1 id="${id}-headline">${headline}</h1>
              <div class="body-text" id="${id}-body">${body}</div>
            </div>
            <div class="art-col" id="${id}-art">
              ${artHtml}
            </div>
          </div>
        </div>

        <div class="narrator">
          ${mascotSVG(id)}
          <div class="speech-bubble" id="${id}-speech">${narration}</div>
        </div>

        <audio id="${id}-audio" src="assets/audio/${audio}.wav" data-start="${PAD}" data-duration="${audioDur.toFixed(3)}" data-track-index="${10 + cfg.trackOffset}" data-volume="1"></audio>
      </div>

      <script>
        window.__timelines = window.__timelines || {};
        const tl = gsap.timeline({ paused: true });

        tl.fromTo("#${id}-eyebrow", { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power2.out" }, 0.15);
        tl.fromTo("#${id}-headline", { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, 0.28);
        tl.fromTo("#${id}-body", { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, 0.45);

        ${artAnim}

        tl.fromTo("#${id}-avatar", { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(1.8)", transformOrigin: "50% 100%" }, 0.05);
        tl.to("#${id}-avatar", { y: -8, duration: 1.6, repeat: ${bobRepeat}, yoyo: true, ease: "sine.inOut" }, 0.5);
        tl.fromTo("#${id}-speech", { x: -16, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, 0.75);

        tl.to(["#${id}-eye-l", "#${id}-eye-r"], { scaleY: 0.1, duration: 0.06, repeat: ${blinkRepeat}, repeatDelay: 3.3, yoyo: true, transformOrigin: "50% 50%" }, 0.9);

        tl.to("#${id}-mouth", { scaleY: 2.6, duration: ${(mouthCycle / 2).toFixed(3)}, repeat: ${mouthRepeat}, yoyo: true, ease: "sine.inOut", transformOrigin: "50% 50%" }, ${PAD});
        tl.set("#${id}-mouth", { scaleY: 1 }, ${talkEnd.toFixed(3)});

        window.__timelines["${id}"] = tl;
      </script>
    </template>
  </body>
</html>
`;
}

let cursor = 0;
const slots = [];
for (const cfg of SCENES) {
  slots.push({ id: cfg.id, start: cursor, duration: cfg.total });
  cursor += cfg.total;
}
const grandTotal = cursor;

SCENES.forEach((cfg, i) => {
  cfg.trackOffset = i;
  const html = sceneTemplate(cfg);
  writeFileSync(join(ROOT, "compositions", `${cfg.id}.html`), html);
  console.log("wrote compositions/" + cfg.id + ".html");
});

const indexSlots = slots
  .map(
    (s) => `      <div
        id="el-${s.id}"
        class="clip"
        data-composition-id="${s.id}"
        data-composition-src="compositions/${s.id}.html"
        data-start="${s.start.toFixed(3)}"
        data-duration="${s.duration.toFixed(3)}"
        data-track-index="1"
      ></div>`
  )
  .join("\n");

const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>Meet Claude</title>
    <script src="vendor/gsap.min.js"></script>
    <style>
      body { margin: 0; background: #14121B; }
      #root { position: relative; width: 1920px; height: 1080px; overflow: hidden; }
      .clip { position: absolute; inset: 0; }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="root"
      data-width="1920"
      data-height="1080"
      data-duration="${grandTotal.toFixed(3)}"
    >
${indexSlots}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["root"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`;

writeFileSync(join(ROOT, "index.html"), indexHtml);
console.log("wrote index.html, total duration " + grandTotal.toFixed(3) + "s");
