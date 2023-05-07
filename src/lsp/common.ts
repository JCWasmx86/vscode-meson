import * as vscode from "vscode";
import { LanguageServerClient } from ".";
import { LanguageServer } from "../types";
import { SwiftMesonLspLanguageClient } from "./swift-mesonlsp";

export async function createLanguageServerClient(server: LanguageServer, download: boolean, context: vscode.ExtensionContext): Promise<LanguageServerClient | null> {
    const serverToClass = (server: LanguageServer) => {
      switch (server) {
        case "Swift-MesonLSP":
          return SwiftMesonLspLanguageClient;
      }
    }

    const klass = serverToClass(server);
    if (!klass.supportsSystem()) {
      vscode.window.showErrorMessage("The configured language server does not support the current system.");
      return null;
    }

    let languageServerPath = LanguageServerClient.resolveLanguageServerPath(server, context);
    if (languageServerPath === null) {
      if (download) {
        languageServerPath = await LanguageServerClient.download(server, context);
        if (languageServerPath === null) {
          vscode.window.showErrorMessage("Failed to download the language server.");
          return null;
        }
      } else {
        vscode.window.showErrorMessage("Failed to find a language server on the system.");
        return null;
      }
    }

    return new klass(languageServerPath, context);
  }