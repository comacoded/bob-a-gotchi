import * as vscode from "vscode";
import { PetSnapshot } from "./pet";

/** Messages the webview can send back to the extension host. */
export type InboundMessage =
  | { type: "feed" }
  | { type: "wake" }
  | { type: "reset" }
  | { type: "ready" }
  | { type: "acceptPlay" }
  | { type: "declinePlay" }
  | { type: "playResult"; outcome: "win" | "lose" | "draw" }
  | { type: "endPlay" };

/**
 * Hosts Bob inside the sidebar webview view. The view is purely presentational:
 * it renders snapshots pushed from the host and forwards user actions back.
 */
export class BobViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "bob.petView";

  private view?: vscode.WebviewView;
  private lastSnapshot?: PetSnapshot;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onMessage: (msg: InboundMessage) => void
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
    };
    view.webview.html = this.getHtml(view.webview);
    view.webview.onDidReceiveMessage((msg: InboundMessage) => {
      if (msg.type === "ready" && this.lastSnapshot) {
        this.post(this.lastSnapshot);
      }
      this.onMessage(msg);
    });
  }

  /** Push a fresh snapshot to the webview (no-op if the view is hidden). */
  post(snapshot: PetSnapshot): void {
    this.lastSnapshot = snapshot;
    this.view?.webview.postMessage({ type: "state", snapshot });
  }

  private getHtml(webview: vscode.Webview): string {
    const media = (file: string) =>
      webview.asWebviewUri(
        vscode.Uri.joinPath(this.extensionUri, "media", file)
      );
    const spritesBase = webview
      .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "sprites"))
      .toString();

    const nonce = getNonce();
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
      `connect-src ${webview.cspSource}`,
    ].join("; ");

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${media("main.css")}" rel="stylesheet" />
  <title>Bob</title>
</head>
<body>
  <div class="stage">
    <canvas id="bob" width="120" height="120" aria-label="Bob the build buddy"></canvas>
    <div id="speech" class="speech" hidden></div>
  </div>

  <div class="nameplate">
    <span id="name">Bob</span>
    <span id="age" class="age"></span>
    <button id="playNow" class="play-now" title="Play tic-tac-toe" aria-label="Play tic-tac-toe"><span>🕹️</span></button>
  </div>

  <div class="actions" id="actions" hidden>
    <button id="feed" class="pix-btn">
      <img class="pix" src="${media("food.svg")}" alt="" /> Feed Bob
    </button>
  </div>

  <div class="invite" id="invite" hidden>
    <button id="playYes" class="pix-btn">Let's play! ❌⭕</button>
    <button id="playNo" class="pix-btn ghost">Not now</button>
  </div>

  <div class="game" id="game" hidden>
    <div class="ttt" id="ttt" role="grid" aria-label="Tic-tac-toe board"></div>
    <div class="ttt-status" id="tttStatus">Your turn — you're ❌</div>
    <div class="ttt-controls">
      <button id="tttAgain" class="pix-btn" hidden>Play again</button>
      <button id="tttDone" class="pix-btn ghost">Done</button>
    </div>
  </div>

  <script nonce="${nonce}">window.__SPRITES_BASE__ = "${spritesBase}";</script>
  <script nonce="${nonce}" src="${media("main.js")}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
