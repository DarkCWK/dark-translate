import * as vscode from "vscode";

import { Translator } from "dark-translate-api";

export async function activate(context: vscode.ExtensionContext) {
    await commandHandler(context);

    await configurationHandler(context);

    await loadExtension();
}

export function deactivate() {}

async function commandHandler(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand("DarkCWK.dark-translate.changeTranslator", async () => {
            let translator = await vscode.window.showQuickPick(
                vscode.extensions.all
                    .filter((extension) => extension.packageJSON.contributes["dark-translate"])
                    .map((translator) => ({
                        id: translator.id,
                        label: translator.packageJSON.contributes["dark-translate"],
                        description: translator.packageJSON.displayName,
                    })),
                { ignoreFocusOut: true }
            );

            if (translator) {
                vscode.workspace.getConfiguration("DarkCWK.dark-translate").update("translator", translator.id, true);
            }
        })
    );
}

async function configurationHandler(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration("DarkCWK.dark-translate")) await loadExtension();
        })
    );
}

let translateCache: { text: string; result: string }[] = [];
let extensionDisposables: vscode.Disposable[] = [];

async function loadExtension() {
    translateCache = [];
    disposeExtension();

    let translatorId = vscode.workspace.getConfiguration("DarkCWK.dark-translate").get<string>("translator");
    if (!translatorId) return showTranslatorNotFoundMessage();

    let translator = await vscode.extensions.getExtension<Translator>(translatorId)?.activate();
    if (!translator) return showTranslatorErrorMessage();

    let linkMarkdown = await translator.getLinkMarkdown();

    extensionDisposables.push(
        vscode.languages.registerHoverProvider([{ scheme: "file" }, { scheme: "untitled" }], {
            async provideHover(document, position, token) {
                let text = await getText(document, position);
                if (!text) return null;

                let result = translateCache.find(({ text: cacheText }) => cacheText === text)?.result;

                if (!result) {
                    result = await translator!.translate(text, /** TODO: 翻译选项 */ { from: "auto", to: "auto" });

                    if (!result) {
                        return new vscode.Hover([
                            new vscode.MarkdownString(`[Dark Translate] $(sync) ${linkMarkdown}`, true),
                            "获取翻译失败! 请查看翻译源输出",
                        ]);
                    }

                    if (translateCache.length > 100) translateCache.shift();
                    translateCache.push({ text, result });
                }

                return new vscode.Hover([
                    new vscode.MarkdownString(`[Dark Translate] $(sync) ${linkMarkdown}`, true),
                    result,
                ]);
            },
        })
    );
}

async function disposeExtension() {
    for (const extensionDisposable of extensionDisposables) {
        extensionDisposable.dispose();
        extensionDisposables = [];
    }
}

async function showTranslatorNotFoundMessage() {
    if (await vscode.window.showErrorMessage("未设置翻译源!", "设置翻译源")) {
        await vscode.commands.executeCommand("DarkCWK.dark-translate.changeTranslator");
    }
}

async function showTranslatorErrorMessage() {
    if (await vscode.window.showErrorMessage("加载翻译源异常!", "设置翻译源")) {
        await vscode.commands.executeCommand("DarkCWK.dark-translate.changeTranslator");
    }
}

async function getText(document: vscode.TextDocument, position: vscode.Position) {
    let editor = vscode.window.activeTextEditor;
    if (editor && editor.document.uri == document.uri) {
        let selection = editor.selections.find((selection) => !selection.isEmpty && selection.contains(position));
        if (selection) return editor.document.getText(selection);
        else return document.getText(document.getWordRangeAtPosition(position));
    }
}
