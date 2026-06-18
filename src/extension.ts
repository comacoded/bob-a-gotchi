import * as vscode from "vscode";
import { PetEngine, PetConfig } from "./pet";
import { BobViewProvider, InboundMessage } from "./panel";

const STATE_KEY = "bob.petData.v1";
const TICK_MS = 5_000;

let engine: PetEngine;
let provider: BobViewProvider;
let saveTimer: NodeJS.Timeout | undefined;

// Treat a run of edits with < CODING_STOP_MS gaps as one "coding burst". Bob
// types while it is happening; when it stops, if enough lines landed we fire
// the celebration ("the coding is done").
const CODING_STOP_MS = 1200;

function readConfig(): PetConfig {
  const c = vscode.workspace.getConfiguration("bob");
  return {
    idleSleepMinutes: c.get<number>("idleSleepMinutes", 4),
    statDecayMinutes: c.get<number>("statDecayMinutes", 30),
    permadeath: c.get<boolean>("permadeath", false),
  };
}

export function activate(context: vscode.ExtensionContext): void {
  const now = Date.now();
  const saved = context.globalState.get<any>(STATE_KEY);
  engine = new PetEngine(saved, readConfig(), now);
  // Boot ready: no catch-up decay for the time the editor was closed, and
  // not asleep or starving on startup.
  engine.bootReset(now);

  const push = () => provider?.post(engine.snapshot(Date.now()));
  const save = () =>
    context.globalState.update(STATE_KEY, engine.serialize());

  const handleMessage = (msg: InboundMessage) => {
    const t = Date.now();
    switch (msg.type) {
      case "feed":
        engine.feed(t);
        break;
      case "wake":
        engine.wake(t);
        break;
      case "reset":
        engine.reset(t);
        break;
    }
    if (msg.type !== "ready") {
      save();
      push();
    }
  };

  provider = new BobViewProvider(context.extensionUri, handleMessage);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      BobViewProvider.viewType,
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // Commands (also reachable from the command palette).
  context.subscriptions.push(
    vscode.commands.registerCommand("bob.feed", () => {
      engine.feed(Date.now());
      save();
      push();
    }),
    vscode.commands.registerCommand("bob.wake", () => {
      engine.wake(Date.now());
      save();
      push();
    }),
    vscode.commands.registerCommand("bob.reset", async () => {
      const ok = await vscode.window.showWarningMessage(
        "Start over with a brand-new Bob? Your current Bob will be gone.",
        { modal: true },
        "New Bob"
      );
      if (ok === "New Bob") {
        engine.reset(Date.now());
        save();
        push();
      }
    })
  );

  // Coding-activity detection.
  let burstLines = 0;
  let codingStopTimer: NodeJS.Timeout | undefined;

  const endBurst = () => {
    codingStopTimer = undefined;
    const threshold = vscode.workspace
      .getConfiguration("bob")
      .get<number>("aiBlockLineThreshold", 12);
    const lines = burstLines;
    burstLines = 0;
    if (lines >= threshold) {
      // A big block just finished: celebrate.
      engine.registerBigBlock(Date.now());
      save();
      push();
    }
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      const scheme = e.document.uri.scheme;
      if (scheme !== "file" && scheme !== "untitled") {
        return;
      }
      if (e.contentChanges.length === 0) {
        return;
      }

      let insertedLines = 0;
      for (const change of e.contentChanges) {
        if (change.text.length > 0) {
          insertedLines += countLines(change.text);
        }
      }

      // Bob stacks bricks while coding is happening.
      engine.registerCoding(Date.now());
      burstLines += insertedLines;
      if (codingStopTimer) {
        clearTimeout(codingStopTimer);
      }
      codingStopTimer = setTimeout(endBurst, CODING_STOP_MS);
      push();
    })
  );
  context.subscriptions.push({
    dispose: () => codingStopTimer && clearTimeout(codingStopTimer),
  });

  // React to config changes live.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("bob")) {
        engine.updateConfig(readConfig());
        push();
      }
    })
  );

  // Heartbeat: decay, idle-sleep, energy recovery.
  const interval = setInterval(() => {
    engine.tick(Date.now());
    push();
  }, TICK_MS);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });

  // Persist periodically so we don't lose much on a crash.
  saveTimer = setInterval(save, 30_000);
  context.subscriptions.push({
    dispose: () => saveTimer && clearInterval(saveTimer),
  });

  // First render.
  engine.tick(now);
  push();
}

export function deactivate(): void {
  // Final save handled by the host flushing globalState; nothing async here.
}

function countLines(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) {
      n++;
    }
  }
  return n;
}
