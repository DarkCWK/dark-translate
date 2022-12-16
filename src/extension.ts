import * as vscode from "vscode";

import { Translator } from "dark-translate-api";

// 翻译源
let translator: Translator | void;

// 翻译源
let translationCache: { [key: string]: string | undefined } = {};

// 显示未找到翻译源错误
async function showTranslatorIdNotFoundErrorMessage() {
    if (await vscode.window.showErrorMessage("未设置翻译源!", "设置翻译源")) {
        await vscode.commands.executeCommand("DarkCWK.dark-translate.changeTranslator");
    }
}

// 显示加载翻译源错误
async function showLoadTranslatorErrorErrorMessage(translatorId: string) {
    if (await vscode.window.showErrorMessage(`无法加载翻译源: ${translatorId}!`, "设置翻译源")) {
        await vscode.commands.executeCommand("DarkCWK.dark-translate.changeTranslator");
    }
}

async function setTranslator() {
    // 从配置读取翻译源 Id
    let translatorId = vscode.workspace.getConfiguration("DarkCWK.dark-translate").get<string>("translator");
    if (!translatorId) return await showTranslatorIdNotFoundErrorMessage();

    // 使用 translatorId 获取 translator
    translator = await vscode.extensions.getExtension(translatorId)?.activate();
    if (!translator) return await showLoadTranslatorErrorErrorMessage(translatorId);
}

async function getText(document: vscode.TextDocument, position: vscode.Position) {
    let editor = vscode.window.activeTextEditor;
    if (editor && editor.document.uri == document.uri) {
        let selection = editor.selections.find((selection) => !selection.isEmpty && selection.contains(position));
        if (selection) return editor.document.getText(selection);
        else return document.getText(document.getWordRangeAtPosition(position));
    }
}

export async function activate(context: vscode.ExtensionContext) {
    console.log("[Dark Translate] 启动");

    context.subscriptions.push(
        // 修改翻译源命令
        vscode.commands.registerCommand("DarkCWK.dark-translate.changeTranslator", async () => {
            // 显示 QuickPicket
            let translator = await vscode.window.showQuickPick(
                // 数据来源
                vscode.extensions.all
                    // 贡献了 dark-translate 项目的插件
                    .filter((extension) => extension.packageJSON.contributes["dark-translate"])
                    // 转换为 QuickPicket 项目
                    .map((translator) => ({
                        // 插件的 id
                        id: translator.id,
                        // 插件贡献的翻译源的名称
                        label: translator.packageJSON.contributes["dark-translate"],
                        // 插件的名称
                        description: translator.packageJSON.displayName,
                    })),
                // 失焦不取消
                { ignoreFocusOut: true }
            );

            // 如果有选择项目
            if (translator) {
                // 修改翻译源配置
                vscode.workspace.getConfiguration("DarkCWK.dark-translate").update("translator", translator.id, true);
            }
        }),
        // 当修改了配置
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            // 判断是否修改了自己的配置                           // 设置翻译源
            if (e.affectsConfiguration("DarkCWK.dark-translate")) await setTranslator();
        }),
        // 设置悬浮提供者
        vscode.languages.registerHoverProvider([{ scheme: "file" }, { scheme: "untitled" }], {
            async provideHover(document, position, token) {
                if (!translator) return;

                let text = await getText(document, position);

                if (!text) return;
                let linkMarkdown = await translator.getLinkMarkdown();

                let result = translationCache[text];
                console.log(`${text}=>${result}`);
                if (!result) result = await translator.translate(text, { from: "AUTO", to: "AUTO" });
                console.log(`${text}=>${result}`);

                if (!result) {
                    return new vscode.Hover([
                        new vscode.MarkdownString(`[Dark Translate] $(sync) ${linkMarkdown}`, true),
                        "获取翻译失败! 请查看翻译源输出",
                    ]);
                }

                return new vscode.Hover([
                    new vscode.MarkdownString(`[Dark Translate] $(sync) ${linkMarkdown}`, true),
                    result,
                ]);
            },
        })
    );

    // 异步获取翻译源 (使翻译源加载完成)
    setTranslator();
}

export function deactivate() {}
