import * as os from "os";

import {
  ExtensionContext, Uri,
} from "vscode"
import { LanguageServerClient } from "../lsp";
import { Executable, VersionedTextDocumentIdentifier } from "vscode-languageclient/node";

export class SwiftMesonLspLanguageClient extends LanguageServerClient {
  private static artifacts: { [key: string]: { name: string, hash: string } } = {
    "win32-x64": { name: "Swift-MesonLSP-win64.zip", hash: "093ab6be0f78c255454ad0e14151db61f4e515be7e0c2315373359ea05439471" },
    "darwin-x64": { name: "Swift-MesonLSP-macos12.zip", hash: "5642fdcc6205f18f83b140fb6b03fc8eb5f6e3513e04e4545ad4882bc34438ad" },
  };

  repoURL: string = "https://github.com/JCWasmx86/Swift-MesonLSP";
  setupURI: Uri = Uri.parse("https://github.com/JCWasmx86/Swift-MesonLSP/tree/main/Docs");
  get runExe(): Executable {
    return {
      command: this.languageServerPath || this.executableName,
      args: ["--lsp"]
    }
  }
  get debugExe(): Executable {
    return {
      command: this.languageServerPath || this.executableName,
      args: ["--lsp"]
    }
  }

  constructor(ctx: ExtensionContext) {
    super("Swift-MesonLSP", ctx);
  }

  get downloadInfo(): [url: string, hash: string] | null {
    const platform = os.platform();
    const arch = os.arch();
    if (!this.supportsSystem(platform, arch))
      return null
    const artifact = SwiftMesonLspLanguageClient.artifacts[`${platform}-${arch}`];
    return [`${this.repoURL}/releases/download/v2.1/${artifact.name}`, artifact.hash];
  }

  get requiresManualSetup(): boolean {
    return os.platform() != "darwin" && os.platform() != "win32";
  }

  supportsSystem(os: string, arch: string): boolean {
    if (arch != "x64")
      return false;
    return os == "win32" || os == "darwin";
  }
}
