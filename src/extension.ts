import * as vscode from 'vscode';
import Client from 'ssh2-sftp-client';
import fs from 'fs';
import path from 'path';
import { convertDriveLetterToUppercase, mergePath, handleFileList, getCompiledDirPath, getConfigs, updateConfigs } from "./utils";
import { ServerConfig, SSH2Config, UploadResult, UploadSummary } from "./types";

class SSH2Uploader {
    private progress?: vscode.Progress<{ message?: string; increment?: number }>;
    private clients: Map<string, Client> = new Map();

    constructor(private config: SSH2Config) {}

    // 连接到服务器
    private async connectToServer(serverConfig: ServerConfig): Promise<Client> {
        const key = `${serverConfig.host}:${serverConfig.port}`;
        if (this.clients.has(key)) {
            return this.clients.get(key)!;
        }

        const client = new Client();
        try {
            await client.connect(serverConfig);
            this.clients.set(key, client);
            return client;
        } catch (error) {
            throw new Error(`连接服务器 ${serverConfig.host} 失败: ${error.message}`);
        }
    }

    // 上传单个文件
    private async uploadFile(
        client: Client,
        localPath: string,
        remotePaths: string[],
        totalFiles: number,
        currentFile: number
    ): Promise<void> {
        const fileName = path.basename(localPath);
        const fileSize = fs.statSync(localPath).size;

        for (const remotePath of remotePaths) {
            try {
                // 确保远程目录存在
                const remoteDir = path.dirname(remotePath);
                await client.mkdir(remoteDir, true);

                // 上传文件并显示进度
                await client.put(localPath, remotePath, {
                    step: (transferred: number) => {
                        if (this.progress) {
                            const fileProgress = Math.round((transferred / fileSize) * 100);
                            const totalProgress = Math.round(((currentFile - 1) * 100 + fileProgress) / totalFiles);
                            this.progress.report({
                                message: `[${currentFile}/${totalFiles}] ${fileName}: ${fileProgress}%`,
                                increment: totalProgress
                            });
                        }
                    }
                });
            } catch (error) {
                throw new Error(`上传文件 ${fileName} 到 ${remotePath} 失败: ${error.message}`);
            }
        }
    }

    // 上传文件或目录
    async upload(files: string[]): Promise<void> {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "正在上传文件",
            cancellable: true
        }, async (progress, token) => {
            this.progress = progress;

            try {
                console.log(`本次计划上传的文件列表有 ${files.length} 个`);
                await this.uploadMultiple(files);
                vscode.window.showInformationMessage(`上传完成!`);
            } catch (error) {
                vscode.window.showErrorMessage(`上传失败: ${error.message}`);
                throw error;
            } finally {
                // 清理进度条
                this.progress = undefined;
                
                // 关闭所有连接
                for (const client of this.clients.values()) {
                    try {
                        await client.end();
                    } catch (error) {
                        console.error('关闭连接失败:', error);
                    }
                }
                this.clients.clear();
            }
        });
    }

    // 上传单个文件
    private async uploadSingle(localPath: string): Promise<void> {
        for (const serverConfig of this.config.serverConfigs) {
            const client = await this.connectToServer(serverConfig);
            // 计算远程路径：
            // 1. 获取文件相对于项目根目录的路径
            // 2. 将相对路径与每个远程目录合并，支持同时上传到多个远程目录
            // 例如：本地文件"/project/src/file.js"，基础路径"/project"，远程路径["/site1", "/site2"]
            // 最终生成["/site1/src/file.js", "/site2/src/file.js"]
            const remotePaths = mergePath(localPath, this.config.localBasePath, this.config.localCompliePath, serverConfig.remoteDirPaths);
            if (!(remotePaths && remotePaths.length)) {
                continue;
            }
            await this.uploadFile(client, localPath, remotePaths, 1, 1);
        }
    }

    // 上传多个文件
    private async uploadMultiple(files: string[]): Promise<void> {
        const total = files.length;
        let current = 0;

        for (const file of files) {
            current++;
            await this.uploadSingle(file);
        }
    }

    // 获取编译后的文件路径
    private getCompiledPath(localPath: string): string | null {
        // 保留原有的编译路径处理逻辑
        return getCompiledDirPath(localPath);
    }

    // 获取目录下的所有文件，并处理编译路径和白名单逻辑
    async getFileList(paths: string[], config: SSH2Config): Promise<string[]> {
        const allFiles: string[] = [];
        for (const path of paths) {
            try {
                // 检查是否为目录
                const stats = fs.statSync(path);
                if (stats.isDirectory()) {
                    // 如果是目录，使用 handleFileList 获取目录下所有文件
                    const filesInDir = await handleFileList(path);
                    allFiles.push(...filesInDir);
                } else {
                    // 如果是文件，直接添加到列表
                    allFiles.push(path);
                }
            } catch (error) {
                console.error(`处理路径失败 ${path}:`, error);
                throw new Error(`处理路径失败 ${path}: ${error.message}`);
            }
        }

        const processedFiles: string[] = [];
        for (const localPath of allFiles) {
            let compiledPath = localPath;
            if (!config.localCompliePath) { // 没有配置编译目录，直接上传原文件
                compiledPath = localPath;
                console.log(`直接上传源文件：${compiledPath}`);
            } else {
                // 检查是否在白名单中（直接上传原文件的列表）
                const directUploadFiles = config.directUploadFiles || [];
                const isWhiteList = directUploadFiles.some(pattern => {
                    // 支持通配符匹配，如 *.html, *.jpg
                    const regex = new RegExp(
                        pattern
                            .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // 转义正则特殊字符
                            .replace(/\*/g, '.*')                   // 将 * 转换为 .*
                    );
                    return regex.test(localPath);
                });

                if (!isWhiteList) { // 不在白名单中，则上传编译后的文件
                    compiledPath = getCompiledDirPath(localPath);
                }

                if (!compiledPath) {
                    // throw new Error('上传失败：无法获取编译后的文件路径！');
                    console.warn('上传失败：无法获取编译后的文件路径！');
                    continue;
                }
                console.log(`上传编译后的文件：${compiledPath}`);
            }

            // 检查该路径的文件是否存在
            const absolutePath = path.isAbsolute(compiledPath) ? compiledPath : path.resolve(config.localBasePath, compiledPath);
            if (!fs.existsSync(absolutePath)) {
                // throw new Error(`上传失败：计划上传的文件不存在，请确认文件存在或先编译！${absolutePath}`);
                console.warn(`上传失败：计划上传的文件不存在，请确认文件存在或先编译！${absolutePath}`);
                continue;
            }

            processedFiles.push(convertDriveLetterToUppercase(absolutePath).replaceAll('\\', '/'));
        }

        // 去重
        const uniqueFiles = [...new Set(processedFiles)];
        console.log(`获取到需要上传的列表`, uniqueFiles);
        return uniqueFiles;
    }
}

// 注册命令
function registerCommands(context: vscode.ExtensionContext) {
    const disposables = [
        vscode.commands.registerCommand('ssh2-upload-plugin.upload', async (uri, uris) => {
            let localPaths: string[] = [];

            // 处理多选的情况
            if (uris && uris.length > 0) {
                localPaths = uris.map(u => convertDriveLetterToUppercase(u.fsPath).replaceAll('\\', '/'));
            } else if (uri?.fsPath) {
                localPaths = [convertDriveLetterToUppercase(uri.fsPath).replaceAll('\\', '/')];
            }
            // 如果没有通过右键菜单选择，尝试获取当前活动编辑器的文件
            else {
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor?.document.uri) {
                    localPaths = [convertDriveLetterToUppercase(activeEditor.document.uri.fsPath).replaceAll('\\', '/')];
                }
            }

            if (localPaths.length === 0) {
                vscode.window.showErrorMessage('请选择要上传的文件或目录');
                return;
            }

            const config = getConfigs();
            

            if (!config.serverConfigs?.length || !config.localBasePath) {
                vscode.window.showErrorMessage('请先配置服务器信息');
                return;
            }
            config.serverConfigs[0].host = '172.24.112.117';
            const uploader = new SSH2Uploader(config);
            
            // // 遍历所有选中的路径进行上传
            // for (const localPath of localPaths) {
            //     await uploader.upload(localPath);
            // }
            // 使用新的 uploadFiles 函数替代原来的上传逻辑
            const files = await uploader.getFileList(localPaths, config);
            console.log(`获取到需要上传的列表`, files);
            await uploader.upload(files);
            // await uploadFiles(localPaths, config);
        }),

        vscode.commands.registerCommand('ssh2-upload-plugin.editConfig', async function () {
            console.log('已注册右键菜单：配置读取');
               // 获取当前配置
            const config = getConfigs();
            // 创建配置文件内容
            const configContent = JSON.stringify(config, null, 2);
            
            const document = await vscode.workspace.openTextDocument({
                content: configContent,
                language: 'json'
            });
            const editor = await vscode.window.showTextDocument(document);
            // 这里可以添加更多针对编辑配置文件的交互逻辑，比如保存时的验证等
            // 注册保存时的事件处理
            const disposable = vscode.workspace.onDidSaveTextDocument(async (doc) => {
                if (doc === document) {
                    try {
                        // 解析编辑后的内容
                        const newConfig = JSON.parse(doc.getText());
                        // 更新配置
                        await updateConfigs('serverConfigs', newConfig.serverConfigs);
                        await updateConfigs('localBasePath', newConfig.localBasePath);
                        await updateConfigs('localCompliePath', newConfig.localCompliePath);
                        await updateConfigs('cssFilePath', newConfig.cssFilePath);
                        await updateConfigs('directUploadFiles', newConfig.directUploadFiles);

                        vscode.window.showInformationMessage('配置已更新');
                    } catch (error) {
                        vscode.window.showErrorMessage(`配置更新失败: ${error.message}`);
                    }
                }
            });

            // 当编辑器关闭时，清理事件监听
            const closeDisposable = vscode.window.onDidChangeVisibleTextEditors((editors) => {
                if (!editors.some(e => e.document === document)) {
                    disposable.dispose();
                    closeDisposable.dispose();
                }
            });
        })
    ];

    context.subscriptions.push(...disposables);
}

// 激活扩展
export function activate(context: vscode.ExtensionContext) {
    registerCommands(context);
    console.log('SSH2 Upload Plugin is now active!');
}

export function deactivate() {
    // 清理资源
}

async function uploadFiles(localPaths: string[], config: SSH2Config) {
    const uploader = new SSH2Uploader(config);
    
    const summary: UploadSummary = {
        total: localPaths.length,
        success: 0,
        failed: 0,
        results: []
    };

    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "正在上传文件",
        cancellable: true
    }, async (progress, token) => {
        for (const [index, localPath] of localPaths.entries()) {
            try {
                const result: UploadResult = {
                    filePath: localPath,
                    status: 'success',
                    timestamp: Date.now(),
                    formattedTime: new Date().toLocaleString('zh-CN', { hour12: false })
                };

                // 获取编译后的文件路径
                const compiledPath = getCompiledDirPath(localPath);
                if (compiledPath) {
                    result.compiledPath = compiledPath;
                }

                // 上传文件
                // await uploader.upload(localPath);
                summary.success++;
                summary.results.push(result);

                // 更新进度
                progress.report({
                    message: `[${index + 1}/${localPaths.length}] ${path.basename(localPath)}`,
                    increment: (100 / localPaths.length)
                });

            } catch (error) {
                summary.failed++;
                summary.results.push({
                    filePath: localPath,
                    status: 'fail',
                    error: error.message,
                    timestamp: Date.now(),
                    formattedTime: new Date().toLocaleString('zh-CN', { hour12: false })
                });
            }
        }

        // 上传完成后显示结果
        showUploadSummary(summary);
    });
}

function showUploadSummary(summary: UploadSummary) {
    // 创建详细的结果消息
    const details = [
        `总计: ${summary.total} 个文件`,
        `成功: ${summary.success} 个`,
        `失败: ${summary.failed} 个\n`
    ];

    // 添加失败文件的详细信息
    const failedFiles = summary.results.filter(r => r.status === 'fail');
    if (failedFiles.length > 0) {
        details.push('失败文件列表:');
        failedFiles.forEach(result => {
            details.push(`- 时间: ${result.formattedTime}`);
            details.push(`- 文件: ${result.filePath}`);
            details.push(`- 原因: ${result.error}`);
        });
    }

    // 显示结果
    const message = details.join('\n');
    
    // 创建可查看详情的通知
    vscode.window.showInformationMessage(
        `上传完成 (成功: ${summary.success}, 失败: ${summary.failed})`,
        { modal: false, detail: '点击查看详情' },
        '查看详情'
    ).then(selection => {
        if (selection === '查看详情') {
            // 在输出面板中显示详细信息
            const outputChannel = vscode.window.createOutputChannel('文件上传结果');
            outputChannel.clear();
            outputChannel.appendLine(message);
            outputChannel.show();
        }
    });
}

