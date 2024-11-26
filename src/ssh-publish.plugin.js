// import vscode from 'vscode';
// import ssh2Utils from '../ssh2Utils';
// import fs from 'fs';
// import path from 'path';
const vscode = require('vscode');
const ssh2Utils = require('../ssh2Utils');
const fs = require('fs');
const path = require('path');

// 配置文件路径
const CONFIG_FILE_PATH = path.join(__dirname, '..', 'config', 'file_config.json');

// 读取配置文件
function readConfigFile() {
    try {
        const configData = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
        return JSON.parse(configData);
    } catch (err) {
        vscode.window.showErrorMessage(`读取配置文件时出错：${err}`);
        return null;
    }
}

// 上传指定文件到多个服务器
async function uploadFileToServerWithContext(localFilePath, serverConfigIndices) {
    const config = readConfigFile();
    if (!config) {
        return;
    }

    const uploadPromises = [];

    for (let i = 0; i < serverConfigIndices.length; i++) {
        const serverConfig = config.serverConfigs[serverConfigIndices[i]];
        const conn = await ssh2Utils.connectSSH(serverConfig);

        try {
            await ssh2Utils.createRemoteDirIfNotExists(conn, localFilePath, serverConfig.remoteDirPaths);
            const uploadPromise = ssh2Utils.uploadFileToServer(conn, localFilePath, serverConfig.remoteDirPaths)
              .then(() => {
                    vscode.window.showInformationMessage(`文件 ${localFilePath} 已成功上传到服务器 ${serverConfig.host}`);
                })
              .catch((err) => {
                    vscode.window.showErrorMessage(`上传文件 ${localFilePath} 到服务器 ${serverConfig.host} 时出错：${err.message}`);
                });

            uploadPromises.push(uploadPromise);
        } catch (err) {
            vscode.window.showErrorMessage(`上传文件 ${localFilePath} 到服务器 ${serverConfig.host} 时出错：${err.message}`);
        } finally {
            await ssh2Utils.closeSSHConnection(conn);
        }
    }

    await Promise.all(uploadPromises);
}

// 上传指定目录下所有文件到服务器
async function uploadDirectoryContentsToServerWithContext(localDirPath, selectedServerConfigIndex) {
    const config = readConfigFile();
    if (!config) {
        return;
    }

    const serverConfig = config.serverConfigs[selectedServerConfigIndex];
    const conn = await ssh2Utils.connectSSH(serverConfig);
    try {
        const localFiles = await vscode.workspace.fs.readDirectory(vscode.Uri.file(localDirPath));
        for (let i = 0; i < localFiles.length; i++) {
            const [fileName, fileType] = localFiles[i];
            const localFilePath = path.join(localDirPath, fileName);
            if (fileType === vscode.FileType.File) {
                await ssh2Utils.createRemoteDirIfNotExists(conn, localFilePath, serverConfig.remoteDirPaths);
                await ssh2Utils.uploadFileToServer(conn, localFilePath, serverConfig.remoteDirPaths);
            }
        }
        vscode.window.showInformationMessage(`目录 ${localDirPath} 下的所有文件已成功上传到服务器 ${serverConfig.host}`);
    } catch (err) {
        vscode.window.showErrorMessage(`上传目录 ${localDirPath} 下的文件时出错：${err.message}`);
    } finally {
        await ssh2Utils.closeSSHConnection(conn);
    }
}

// 注册右键菜单命令
function registerContextMenuCommands() {
    vscode.commands.registerCommand('ssh2-upload-plugin.uploadFile', async function () {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const localFilePath = editor.document.filePath;
            const config = readConfigFile();
            if (!config) {
                return;
            }

            const serverConfigs = config.serverConfigs;
            const quickPickItems = serverConfigs.map((config, index) => ({
                label: config.name,
                description: `(${config.host}:${config.port})`,
                index,
                picked: false
            }));

            const selectedServerConfigs = await vscode.window.quickPick(quickPickItems, {
                placeHolder: '请选择要上传的服务器配置（可多选）',
                canPickMany: true
            });

            if (selectedServerConfigs) {
                const serverConfigIndices = selectedServerConfigs.map((config) => config.index);
                await uploadFileToServerWithContext(localFilePath, serverConfigIndices);
            }
        }
    });

    vscode.commands.registerCommand('ssh2-upload-plugin.uploadDirectory', async function () {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const localDirPath = editor.document.filePath;
            const config = readConfigFile();
            if (!config) {
                return;
            }

            const serverConfigs = config.serverConfigs;
            const quickPickItems = serverConfigs.map((config, index) => ({
                label: config.name,
                description: `(${config.host}:${config.port})`,
                index
            }));

            const selectedServerConfig = await vscode.window.quickPick(quickPickItems, {
                placeHolder: '请选择要上传的服务器配置'
            });

            if (selectedServerConfig) {
                await uploadDirectoryContentsToServerWithContext(localDirPath, selectedServerConfig.index);
            }
        }
    });

    vscode.commands.registerCommand('ssh2-upload-plugin.editConfig', async function () {
        const configFilePath = vscode.workspace.getConfiguration('ssh2-upload-plugin').get('configFile');
        const document = await vscode.workspace.openTextDocument(configFilePath);
        const editor = await vscode.window.showTextDocument(document);
        // 这里可以添加更多针对编辑配置文件的交互逻辑，比如保存时的验证等
    });
}

// 插件激活函数
function activate(context) {
    registerContextMenuCommands();
}

// 插件失活函数
function deactivate() {
    // 这里可添加清理操作，比如关闭可能未关闭的SSH连接等
}

module.exports = {
    activate,
    deactivate
};