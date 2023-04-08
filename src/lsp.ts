import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    Executable,
    TransportKind
} from "vscode-languageclient/node";

import {
    ExtensionContext,
    workspace,
    WorkspaceConfiguration,
} from "vscode"

import {
    findLanguageServer,
  } from "./utils";

import * as which from "which"

export class MesonLanguageClient {

    config: WorkspaceConfiguration

    ls: LanguageClient | null = null

    constructor(_context: ExtensionContext) {
        this.config = workspace.getConfiguration('vala');
        let serverModule = this.languageServerPath;

        if (serverModule == null)
            return;

        let clientOptions: LanguageClientOptions = {
            documentSelector: ["meson", { "scheme": "file", language: "meson" }]
        };

        let runExe: Executable = {
            command: serverModule,
            args: ["--lsp"],
        };
        let debugExe: Executable = {
            command: serverModule,
            args: ["--lsp"],
        };
        let serverOptions: ServerOptions = {
            run: runExe,
            debug: debugExe,
            transport: TransportKind.stdio
        };

        this.ls = new LanguageClient("Swift-MesonLSP", "Meson Language Server", serverOptions, clientOptions, true);
        this.ls.start();
    }

    get languageServerPath(): string | null {
        return findLanguageServer() || this.config.languageServerPath || which.sync("Swift-MesonLSP", { nothrow: true })
    }

    dispose() {
        if (this.ls) {
            this.ls!.stop()

            this.ls = null
        }
    }
}
