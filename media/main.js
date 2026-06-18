// @ts-check
(function () {
  const vscode = acquireVsCodeApi();
  const canvas = /** @type {HTMLCanvasElement} */ (
    document.getElementById("bob")
  );
  const ctx = canvas.getContext("2d");
  const speech = document.getElementById("speech");
  const nameEl = document.getElementById("name");
  const ageEl = document.getElementById("age");

  const actionsEl = document.getElementById("actions");
  const MAX_LEVEL = 8;

  const MOOD_LINES = {
    happy: "Let's build! 🔧",
    content: "All good here.",
    building: "building it up!",
    thrilled: "wow great block!",
    prompt: "what should we build next?",
    fed: "mmm tasty",
    hungry: "my stomach is growling",
    sleepy: "So sleepy…",
    sad: "Feeling a bit down.",
    sleeping: "Zzz…",
    exhausted: "Zzz… (wiped out)",
    gone: "Bob has powered down.",
  };

  let scale = 1.5;
  /** @type {Record<string, {images: HTMLImageElement[], fps: number, ok: boolean}>} */
  const anims = {};
  let manifestReady = false;
  let current = "idle";
  let frame = 0;
  let lastAdvance = 0;
  let confetti = [];
  let buildAccum = 0;

  // ---- Load sprite manifest + frame images (graceful fallback to drawn Bob) ----
  const base = window.__SPRITES_BASE__;
  fetch(base + "/sprites.json")
    .then((r) => r.json())
    .then((manifest) => {
      scale = manifest.scale || 1.5;
      const entries = Object.entries(manifest.animations || {});
      return Promise.all(
        entries.map(([key, def]) => loadAnim(key, def))
      ).then(() => {
        manifestReady = Object.values(anims).some((a) => a.ok && a.images.length);
      });
    })
    .catch(() => {
      manifestReady = false;
    });

  function loadAnim(key, def) {
    const dir = def.dir || key;
    const count = def.frames || 1;
    const images = [];
    const loads = [];
    for (let i = 0; i < count; i++) {
      const img = new Image();
      images.push(img);
      loads.push(
        new Promise((res) => {
          img.onload = () => res(true);
          img.onerror = () => res(false);
          img.src = base + "/" + dir + "/" + i + ".png";
        })
      );
    }
    anims[key] = { images, fps: def.fps || 6, scale: def.scale || scale, ok: false };
    return Promise.all(loads).then((results) => {
      // Keep only frames that actually loaded.
      anims[key].images = images.filter((_, i) => results[i]);
      anims[key].ok = anims[key].images.length > 0;
    });
  }

  // ---- Render loop ----
  function loop(ts) {
    const anim = anims[current] && anims[current].ok ? anims[current] : null;
    if (manifestReady && anim) {
      drawSprite(anim, ts);
    } else {
      drawPlaceholder(ts);
    }
    if (current === "building") {
      buildAccum = Math.min(MAX_LEVEL, buildAccum + 0.05);
    }
    if ((current === "building" || current === "celebrate") && buildAccum > 0.5) {
      drawBuilding(Math.floor(buildAccum));
    }
    drawConfetti();
    requestAnimationFrame(loop);
  }

  function drawSprite(anim, ts) {
    if (ts - lastAdvance > 1000 / anim.fps) {
      frame = (frame + 1) % anim.images.length;
      lastAdvance = ts;
    }
    if (frame >= anim.images.length) {
      frame = 0;
    }
    const img = anim.images[frame];
    sizeCanvas(img.width, img.height);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    if (current === "sleeping") {
      drawSleepScene(img, ts);
      return;
    }
    ctx.drawImage(img, 0, 0);
  }

  // A moonlit scene behind Bob tucked into bed. Coords are in the 120x120 frame.
  const STARS = [
    [10, 6, 1], [24, 3, 1], [38, 7, 1], [48, 4, 1], [66, 11, 1], [14, 12, 1],
  ];

  function drawSleepScene(img, ts) {
    // gentle breathing: the bed bobs slightly up and down (±1px)
    const bob = Math.round(Math.sin(ts / 1100));

    // No background fill (no gradient) — just a moon and a few stars in the sky.

    // crescent moon: draw a disc, then carve a bite out of it to transparent
    circle(58, 9, 4, "#f5eeb4");
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(55, 7, 3.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // a few twinkling stars
    STARS.forEach((s, i) => {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(ts / 320 + i);
      ctx.fillStyle = "#dfe6ff";
      ctx.fillRect(s[0], s[1], s[2], s[2]);
    });
    ctx.globalAlpha = 1;

    // the full 3/4 bed image, gently bobbing
    ctx.drawImage(img, 0, bob);
  }

  function ellipse(cx, cy, rx, ry, fill) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function pathRoundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // A growing pixel brick tower next to Bob while he codes. `level` rows rise
  // from the ground as a coding burst continues. Coords are in the 56x56 frame.
  function drawBuilding(level) {
    const x = 44;
    const bw = 11;
    const rowH = 3;
    const groundY = 54;
    for (let r = 0; r < level; r++) {
      const y = groundY - (r + 1) * rowH;
      ctx.fillStyle = r % 2 ? "#b5512f" : "#c45a34";
      ctx.fillRect(x, y, bw, rowH - 1);
      // mortar: vertical joints, offset every other row for a brick pattern
      ctx.fillStyle = "#7d3a22";
      const off = r % 2 ? 0 : 3;
      for (let k = off; k < bw; k += 5) {
        ctx.fillRect(x + k, y, 1, rowH - 1);
      }
    }
    // a tiny flag once the building tops out
    if (level >= MAX_LEVEL) {
      const topY = groundY - MAX_LEVEL * rowH;
      ctx.fillStyle = "#9aa6c8";
      ctx.fillRect(x + Math.floor(bw / 2), topY - 4, 1, 4);
      ctx.fillStyle = "#5ee06b";
      ctx.fillRect(x + Math.floor(bw / 2) + 1, topY - 4, 4, 2);
    }
  }

  function spawnConfetti() {
    const colors = ["#5d7bff", "#ffd34d", "#ff6b8a", "#5ee06b", "#ffffff", "#46d6ff"];
    const cw = canvas.width || 120;
    const ch = canvas.height || 120;
    confetti = [];
    for (let i = 0; i < 34; i++) {
      confetti.push({
        x: cw / 2 + (Math.random() - 0.5) * cw * 0.55,
        y: ch * 0.18 + Math.random() * ch * 0.12,
        vx: (Math.random() - 0.5) * 2.4,
        vy: -1.6 - Math.random() * 1.9,
        g: 0.12 + Math.random() * 0.06,
        c: colors[(Math.random() * colors.length) | 0],
        s: 1 + ((Math.random() * 2) | 0),
      });
    }
  }

  function drawConfetti() {
    if (!confetti.length) {
      return;
    }
    ctx.imageSmoothingEnabled = false;
    for (const p of confetti) {
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      ctx.fillStyle = p.c;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
    }
    confetti = confetti.filter((p) => p.y < (canvas.height || 120) + 6);
  }

  function sizeCanvas(fw, fh) {
    const s = (anims[current] && anims[current].scale) || scale;
    if (canvas.width !== fw) canvas.width = fw;
    if (canvas.height !== fh) canvas.height = fh;
    canvas.style.width = fw * s + "px";
    canvas.style.height = fh * s + "px";
  }

  // ---- Fallback Bob drawn with primitives (used until PNG sprites exist) ----
  function drawPlaceholder(ts) {
    const W = 96;
    sizeCanvas(W, W);
    ctx.clearRect(0, 0, W, W);
    ctx.imageSmoothingEnabled = false;

    const bob = Math.sin(ts / 400) * 2;
    const asleep = current === "sleeping";
    const cheer = current === "celebrate";
    const y = (cheer ? Math.abs(Math.sin(ts / 120)) * -6 : 0) + bob;

    ctx.save();
    ctx.translate(0, y);

    // body
    roundRect(30, 52, 36, 30, 8, "#eef1f6");
    // feet
    roundRect(34, 78, 11, 8, 3, "#3b5bff");
    roundRect(51, 78, 11, 8, 3, "#3b5bff");
    // head
    roundRect(28, 26, 40, 32, 10, "#f4f6fb");
    // hard hat
    roundRect(26, 16, 44, 16, 8, "#5360f0");
    roundRect(24, 30, 48, 6, 3, "#3f49c8");
    // eyes
    if (asleep) {
      ctx.strokeStyle = "#1c2230";
      ctx.lineWidth = 2;
      arc(40, 42, 4); arc(56, 42, 4);
    } else {
      circle(40, 42, 4, "#1c2230");
      circle(56, 42, 4, "#1c2230");
    }
    // mouth / chest mark
    ctx.fillStyle = "#3b5bff";
    ctx.font = "8px monospace";
    ctx.textAlign = "center";
    ctx.fillText("</>", 48, 70);

    ctx.restore();

    if (asleep) {
      ctx.fillStyle = "#9fb0ff";
      ctx.font = "10px monospace";
      const z = 1 + Math.floor((ts / 500) % 3);
      ctx.fillText("z".repeat(z), 74, 26 + y);
    }
  }

  function roundRect(x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  function circle(x, y, r, fill) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }
  function arc(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }

  // ---- State from the extension host ----
  let speechTimer;
  // While Date.now() < speechLock, a scripted line (greeting / dad joke) owns
  // the bubble and mood lines won't override it.
  let speechLock = 0;

  function showLockedSpeech(text, ms) {
    speech.textContent = text;
    speech.hidden = false;
    clearTimeout(speechTimer);
    speechLock = Date.now() + ms;
    speechTimer = setTimeout(() => {
      speech.hidden = true;
    }, ms);
  }

  function applySnapshot(s) {
    if (s.activity !== current) {
      if (s.activity === "celebrate") {
        spawnConfetti();
      }
      // Reset the brick tower whenever we leave the build/celebrate flow.
      if (s.activity !== "building" && s.activity !== "celebrate") {
        buildAccum = 0;
      }
      current = s.activity;
      frame = 0;
    }
    nameEl.textContent = s.name;
    ageEl.textContent =
      s.ageDays > 0 ? `${s.ageDays} day${s.ageDays === 1 ? "" : "s"} old` : "";

    // The burger button only appears while Bob is hungry.
    actionsEl.hidden = s.activity !== "hungry";

    // A scripted greeting or dad joke is holding the bubble; leave it be.
    if (Date.now() < speechLock) {
      return;
    }

    const line = MOOD_LINES[s.mood] || "";
    if (line) {
      speech.textContent = line;
      speech.hidden = false;
      clearTimeout(speechTimer);
      // Keep the bubble up the whole time he's hungry (growl) or asleep (Zzz).
      if (s.activity !== "hungry" && s.activity !== "sleeping") {
        speechTimer = setTimeout(() => (speech.hidden = true), 3200);
      }
    } else {
      clearTimeout(speechTimer);
      speech.hidden = true;
    }
  }

  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (msg && msg.type === "state") {
      applySnapshot(msg.snapshot);
    }
  });

  document.getElementById("feed").addEventListener("click", () =>
    vscode.postMessage({ type: "feed" })
  );

  requestAnimationFrame(loop);
  vscode.postMessage({ type: "ready" });

  // ---- Startup greeting ----
  showLockedSpeech("hello!", 2200);
  setTimeout(
    () => showLockedSpeech("I'm Bob! I'm ready to build when you are!", 4200),
    2400
  );

  // ---- Programming dad jokes while idling ----
  const JOKES = [
    "I told my code to behave. It threw a tantrum instead.",
    "My functions have abandonment issues. They hate being called.",
    "I'm not stuck, I'm just deeply nested.",
    "It works on my machine. Maybe we ship my machine?",
    "I don't write bugs. I write undocumented features.",
    "Coffee is just a dependency I haven't cached yet.",
    "My loops and I agree: we stop when something breaks.",
    "I keep my promises... unless they reject.",
    "I named a bug 'Steve'. We've been together for weeks now.",
    "Tabs or spaces? I just want us all to merge in peace.",
    "Why fix it today? Future me loves a challenge.",
    "I renamed a variable 'patience'. It's always running low.",
    "My rubber duck has heard things no duck should hear.",
    "I'd explain recursion, but first let me explain recursion.",
    "Pushed to main on a Friday. Living dangerously.",
  ];
  setInterval(() => {
    if (current === "idle" && Date.now() >= speechLock) {
      showLockedSpeech(JOKES[(Math.random() * JOKES.length) | 0], 6000);
    }
  }, 28000);
})();
