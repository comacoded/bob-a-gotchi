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
  const playNowEl = document.getElementById("playNow");

  const actionsEl = document.getElementById("actions");
  const inviteEl = document.getElementById("invite");
  const gameEl = document.getElementById("game");
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
    wantsToPlay: "wanna play tic-tac-toe?",
    gone: "Bob has powered down.",
  };

  // States that have no sprites of their own borrow the idle frames.
  const SPRITE_ALIAS = { wantsToPlay: "idle", playing: "idle" };
  const spriteKeyFor = (c) => SPRITE_ALIAS[c] || c;

  let scale = 1.5;
  /** @type {Record<string, {images: HTMLImageElement[], fps: number, ok: boolean}>} */
  const anims = {};
  let manifestReady = false;
  let current = "idle";
  let frame = 0;
  let lastAdvance = 0;
  let confetti = [];
  let buildAccum = 0;
  // While performance.now() < danceUntil, Bob does a victory dance (he won a game).
  let danceUntil = 0;
  let danceStart = 0;
  let wasDancing = false;

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
    const dancing = ts < danceUntil;
    // Restart the frame counter when the dance begins so the moonwalk plays
    // from its first frame, and anchor the glide so it starts centered.
    if (dancing && !wasDancing) {
      frame = 0;
      lastAdvance = ts;
      danceStart = ts;
    }
    wasDancing = dancing;

    // Prefer the real moonwalk sprite; fall back to the procedural jig if those
    // frames aren't present.
    const danceAnim =
      dancing && anims.dancing && anims.dancing.ok ? anims.dancing : null;
    if (danceAnim) {
      drawSprite(danceAnim, ts, "dancing", false);
    } else {
      const animKey = spriteKeyFor(current);
      const anim = anims[animKey] && anims[animKey].ok ? anims[animKey] : null;
      if (manifestReady && anim) {
        drawSprite(anim, ts, animKey, dancing);
      } else {
        drawPlaceholder(ts);
      }
    }

    // Glide the whole sprite left, then right, then back to center to sell the
    // moonwalk. Horizontal only (no vertical), via CSS so it never clips.
    if (dancing && danceAnim) {
      const g = Math.round(-Math.sin((ts - danceStart) / 270) * 12);
      canvas.style.transform = "translateX(" + g + "px)";
    } else if (canvas.style.transform) {
      canvas.style.transform = "";
    }

    if (current === "building") {
      buildAccum = Math.min(MAX_LEVEL, buildAccum + 0.05);
    }
    if ((current === "building" || current === "celebrate") && buildAccum > 0.5) {
      drawBuilding(Math.floor(buildAccum));
    }
    if (dancing) {
      drawDanceNotes(ts);
    }
    drawConfetti();
    requestAnimationFrame(loop);
  }

  function drawSprite(anim, ts, animKey, dancing) {
    if (ts - lastAdvance > 1000 / anim.fps) {
      frame = (frame + 1) % anim.images.length;
      lastAdvance = ts;
    }
    if (frame >= anim.images.length) {
      frame = 0;
    }
    const img = anim.images[frame];
    sizeCanvas(img.width, img.height, animKey);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    if (current === "sleeping") {
      drawSleepScene(img, ts);
      return;
    }
    if (dancing) {
      drawDancingBob(img, ts);
      return;
    }
    ctx.drawImage(img, 0, 0);
  }

  // A victory jig: shuffle side to side with little hops and a tilt that leans
  // into each step. Rotates around the bottom-center so his feet stay grounded.
  function drawDancingBob(img, ts) {
    const sway = Math.sin(ts / 130) * 3;
    const hop = -Math.abs(Math.sin(ts / 165)) * 5;
    const tilt = Math.sin(ts / 130) * 0.14;
    ctx.save();
    ctx.translate(sway, hop);
    ctx.translate(canvas.width / 2, canvas.height);
    ctx.rotate(tilt);
    ctx.translate(-canvas.width / 2, -canvas.height);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  // Two music notes bobbing up beside him while he dances.
  function drawDanceNotes(ts) {
    ctx.imageSmoothingEnabled = false;
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    const glyphs = ["♪", "♫"];
    const tint = ["#5ee06b", "#ffd34d"];
    for (let i = 0; i < 2; i++) {
      const x = canvas.width * (i ? 0.8 : 0.2) + Math.sin(ts / 280 + i) * 3;
      const y = canvas.height * 0.5 - ((ts / 14 + i * 28) % 36);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = tint[i];
      ctx.fillText(glyphs[i], x, y);
    }
    ctx.globalAlpha = 1;
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

  function sizeCanvas(fw, fh, key) {
    const s = (anims[key] && anims[key].scale) || scale;
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
      // Fresh board each time a new game begins.
      if (s.activity === "playing") {
        resetBoard();
      }
      current = s.activity;
      frame = 0;
    }
    nameEl.textContent = s.name;
    ageEl.textContent =
      s.ageDays > 0 ? `${s.ageDays} day${s.ageDays === 1 ? "" : "s"} old` : "";

    // The burger button only appears while Bob is hungry; the invite and the
    // board each own their own state.
    actionsEl.hidden = s.activity !== "hungry";
    inviteEl.hidden = s.activity !== "wantsToPlay";
    gameEl.hidden = s.activity !== "playing";
    // The quick-play joystick is redundant once a game (or its invite) is up.
    playNowEl.hidden =
      s.activity === "playing" ||
      s.activity === "wantsToPlay" ||
      s.activity === "gone";

    // A scripted greeting or dad joke is holding the bubble; leave it be.
    if (Date.now() < speechLock) {
      return;
    }

    const line = MOOD_LINES[s.mood] || "";
    if (line) {
      speech.textContent = line;
      speech.hidden = false;
      clearTimeout(speechTimer);
      // Keep the bubble up while he's hungry (growl), asleep (Zzz), or waiting
      // on an answer to his game invite.
      const persistent =
        s.activity === "hungry" ||
        s.activity === "sleeping" ||
        s.activity === "wantsToPlay";
      if (!persistent) {
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

  // Joystick shortcut: jump straight into a game from any state (no idle wait).
  playNowEl.addEventListener("click", () =>
    vscode.postMessage({ type: "acceptPlay" })
  );

  // ---- Tic-tac-toe mini-game (you are ❌, Bob is ⭕) ----
  const tttEl = document.getElementById("ttt");
  const tttStatus = document.getElementById("tttStatus");
  const tttAgain = document.getElementById("tttAgain");
  const tttDone = document.getElementById("tttDone");
  const WIN_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  const GLYPH = { X: "✕", O: "◯" };
  let board = ["", "", "", "", "", "", "", "", ""];
  let gameOver = false;
  let userTurn = true;
  let bobTimer;

  const cells = [];
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement("div");
    cell.className = "ttt-cell";
    cell.setAttribute("role", "gridcell");
    cell.addEventListener("click", () => onCellClick(i));
    tttEl.appendChild(cell);
    cells.push(cell);
  }

  function resetBoard() {
    clearTimeout(bobTimer);
    danceUntil = 0;
    board = ["", "", "", "", "", "", "", "", ""];
    gameOver = false;
    userTurn = true;
    cells.forEach((c) => {
      c.textContent = "";
      c.classList.remove("taken", "win");
    });
    tttStatus.textContent = "your turn — you're ✕";
    tttAgain.hidden = true;
  }

  function paint(i) {
    cells[i].textContent = GLYPH[board[i]] || "";
    cells[i].classList.toggle("taken", board[i] !== "");
  }

  function winningLine(b, p) {
    return WIN_LINES.find((ln) => ln.every((k) => b[k] === p)) || null;
  }

  // Returns an empty cell that completes a line for player `p`, else null.
  function findWinning(b, p) {
    for (let i = 0; i < 9; i++) {
      if (b[i] !== "") continue;
      const copy = b.slice();
      copy[i] = p;
      if (winningLine(copy, p)) return i;
    }
    return null;
  }

  // Friendly: always take a win, usually block, otherwise wander a bit so the
  // user can actually beat him.
  function chooseBobMove(b) {
    const win = findWinning(b, "O");
    if (win !== null) return win;
    const block = findWinning(b, "X");
    if (block !== null && Math.random() < 0.7) return block;
    const empties = [];
    for (let i = 0; i < 9; i++) if (b[i] === "") empties.push(i);
    if (b[4] === "" && Math.random() < 0.5) return 4;
    return empties[(Math.random() * empties.length) | 0];
  }

  function onCellClick(i) {
    if (gameOver || !userTurn || board[i] !== "") return;
    board[i] = "X";
    paint(i);
    if (finishIfDone("X")) return;
    userTurn = false;
    tttStatus.textContent = "Bob's thinking…";
    bobTimer = setTimeout(bobMove, 420);
  }

  function bobMove() {
    if (gameOver) return;
    const i = chooseBobMove(board);
    if (i === undefined) {
      finishIfDone("O");
      return;
    }
    board[i] = "O";
    paint(i);
    if (finishIfDone("O")) return;
    userTurn = true;
    tttStatus.textContent = "your turn — you're ✕";
  }

  // Ends the game if `justMoved` won or the board filled. Returns true if over.
  function finishIfDone(justMoved) {
    const line = winningLine(board, justMoved);
    if (line) {
      line.forEach((k) => cells[k].classList.add("win"));
      endGame(justMoved === "X" ? "win" : "lose");
      return true;
    }
    if (board.every((v) => v !== "")) {
      endGame("draw");
      return true;
    }
    return false;
  }

  function endGame(outcome) {
    gameOver = true;
    userTurn = false;
    tttStatus.textContent =
      outcome === "win" ? "you win! 🎉" : outcome === "lose" ? "Bob wins! 🕺" : "draw! 🤝";
    if (outcome === "win") {
      // Player won: confetti + a good-sport cheer.
      spawnConfetti();
      showLockedSpeech("you beat me! Huzzah! 🎉", 4000);
    } else if (outcome === "lose") {
      // Bob won: a little victory dance.
      danceUntil = performance.now() + 4500;
      showLockedSpeech("I win! Let's boogie! 🕺", 4000);
    }
    tttAgain.hidden = false;
    vscode.postMessage({ type: "playResult", outcome });
  }

  document.getElementById("playYes").addEventListener("click", () =>
    vscode.postMessage({ type: "acceptPlay" })
  );
  document.getElementById("playNo").addEventListener("click", () =>
    vscode.postMessage({ type: "declinePlay" })
  );
  tttAgain.addEventListener("click", resetBoard);
  tttDone.addEventListener("click", () =>
    vscode.postMessage({ type: "endPlay" })
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
