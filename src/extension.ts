import * as vscode from 'vscode';
import { WavEditorProvider } from './wavEditorProvider';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(WavEditorProvider.register(context));
}

export function deactivate(): void {}
