import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { parseWav } from './wavParser';
import { getConfig } from './configProvider';
import { ExtToWebviewMessage, WebviewToExtMessage } from './types';

const CHUNK_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB per chunk

export class WavEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'visAudio.wavEditor';

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      WavEditorProvider.viewType,
      new WavEditorProvider(context),
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      }
    );
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'out'),
      ],
    };

    const disposables: vscode.Disposable[] = [];
    webviewPanel.webview.html = this.buildHtml(webviewPanel.webview);

    webviewPanel.webview.onDidReceiveMessage(
      async (msg: WebviewToExtMessage) => {
        if (msg.type === 'ready') {
          await this.sendAudioData(document.uri, webviewPanel.webview);
        } else if (msg.type === 'error') {
          vscode.window.showErrorMessage(`vis-audio: ${msg.message}`);
        } else if (msg.type === 'update-use-mel') {
          await vscode.workspace
            .getConfiguration('visAudio')
            .update('spectrogram.useMel', msg.value, vscode.ConfigurationTarget.Global);
        } else if (msg.type === 'update-colormap') {
          await vscode.workspace
            .getConfiguration('visAudio')
            .update('spectrogram.colormap', msg.value, vscode.ConfigurationTarget.Global);
        }
      },
      null,
      disposables
    );

    vscode.workspace.onDidChangeConfiguration(
      (e) => {
        if (e.affectsConfiguration('visAudio')) {
          const configMsg: ExtToWebviewMessage = {
            type: 'config-update',
            config: getConfig(document.uri),
          };
          webviewPanel.webview.postMessage(configMsg);
        }
      },
      null,
      disposables
    );

    webviewPanel.onDidDispose(() => {
      disposables.forEach((d) => d.dispose());
    });
  }

  private async sendAudioData(uri: vscode.Uri, webview: vscode.Webview): Promise<void> {
    let fileData: Uint8Array;
    try {
      fileData = await vscode.workspace.fs.readFile(uri);
    } catch (err) {
      const errMsg: ExtToWebviewMessage & { type: 'config-update' } = {
        type: 'config-update',
        config: getConfig(uri),
      };
      void errMsg;
      await webview.postMessage({ type: 'error', message: `Cannot read file: ${err}` });
      return;
    }

    const buf = Buffer.from(fileData);
    const ext = uri.fsPath.split('.').pop()?.toLowerCase() ?? '';
    let metadata;
    if (ext === 'wav') {
      try {
        metadata = parseWav(buf);
      } catch (err) {
        await webview.postMessage({ type: 'error', message: `Cannot parse WAV: ${err}` });
        return;
      }
    } else {
      // For non-WAV formats, provide stub metadata; the webview will update it after decoding.
      metadata = {
        sampleRate: 0,
        numChannels: 0,
        bitsPerSample: 0,
        audioFormat: 0,
        byteRate: 0,
        blockAlign: 0,
        durationSeconds: 0,
        fileSizeBytes: buf.length,
        encoding: ext.toUpperCase(),
        container: ext,
      };
    }

    const config = getConfig(uri);
    const totalBytes = buf.length;

    if (totalBytes <= 50 * 1024 * 1024) {
      // Small file: send in one message
      const initMsg: ExtToWebviewMessage = {
        type: 'init',
        metadata,
        audioBase64: buf.toString('base64'),
        config,
      };
      await webview.postMessage(initMsg);
    } else {
      // Large file: send metadata first, then chunked audio
      const initMsg: ExtToWebviewMessage = {
        type: 'init',
        metadata,
        audioBase64: '',
        config,
      };
      await webview.postMessage(initMsg);

      const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE_BYTES);
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE_BYTES;
        const end = Math.min(start + CHUNK_SIZE_BYTES, totalBytes);
        const chunk = buf.slice(start, end);
        const chunkMsg: ExtToWebviewMessage = {
          type: 'audio-chunk',
          index: i,
          total: totalChunks,
          totalBytes,
          data: chunk.toString('base64'),
        };
        await webview.postMessage(chunkMsg);
      }
    }
  }

  private buildHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview.js')
    );
    const workerUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'out', 'worker.js')
    );
    const nonce = crypto.randomBytes(16).toString('hex');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 script-src 'nonce-${nonce}' ${webview.cspSource};
                 worker-src blob:;
                 connect-src ${webview.cspSource};
                 style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WAV Visualizer</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}">window.WORKER_URL = "${workerUri}";</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
