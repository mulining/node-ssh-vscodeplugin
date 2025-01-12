// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
// @ts-nocheck
import * as vscode from 'vscode';
// import ssh2Utils from './ssh2Utils.js';
import ssh2Utils from './ssh2-sftp-utils.js';
import fs from 'fs';
import path from 'path';
import { convertDriveLetterToUppercase, mergePath  } from "./utils";
import { Progress, ProgressLocation } from 'vscode';

// 配置文件路径

// 获取服务器配置信息
function getConfigs() {
    return vscode.workspace.getConfiguration('ssh2UploadPlugin') || null;
}

// 获取指定目录对应的编译后目录路径（假设编译后的文件存放在原项目目录同级的'dist'目录下，可根据实际情况调整）
function getCompiledDirPath(localDirPath) {
    const projectDir = vscode.workspace.workspaceFolders[0].uri.fsPath; // 当前工程更目录
    let relativeDir = path.relative(projectDir, localDirPath);    // 当前工程相对目录
    const config = getConfigs();
    let compiledDir = '';
    if(config.localCompliePath) { // 该值存在则标识需要部署编译后的文件
        compiledDir = path.join(projectDir, config.localCompliePath);
        console.log('编译后的目录：', compiledDir);
        const ext = path.extname(relativeDir);
        if(['.css', '.scss', '.less'].includes(ext) && config.cssFilePath) {
            return path.join(projectDir, config.cssFilePath);
        } else {
            relativeDir = relativeDir.replace('.vue', '.vue.js').replace('.ts', '.js').replace('.scss', '.css').replace('.less', '.css');
        }
    } else {
        compiledDir = path.join(projectDir);
        console.log('原始目录：', compiledDir);
    }
    return path.join(compiledDir, relativeDir);
}

async function getFileList(localDirPath) {
    const localFiles = await vscode.workspace.fs.readDirectory(vscode.Uri.file(localDirPath));
    const filePaths = [];
    console.log('这里是选中目录的所有文件列表：', localFiles);
    for (const [name, fileType] of localFiles) {
        const currentPath = vscode.Uri.joinPath(vscode.Uri.file(localDirPath), name);
        if (fileType === vscode.FileType.File) {
            filePaths.push(currentPath.fsPath);
        } else if (fileType === vscode.FileType.Directory) {
            const subDirectoryFilePaths = await getFileList(currentPath.fsPath);
            filePaths.push(...subDirectoryFilePaths);
        }
    }
    return filePaths;
}

async function handleFileList(localDirPath) {
    const list = await getFileList(localDirPath);
    const newFileList = list.map(item => getCompiledDirPath(item));
    console.log('生成编译后文件的路径：', newFileList);
    return newFileList;
}

// 上传指定文件到多个服务器
async function uploadFileToServerWithContext(localFilePath: string, config) {
    const localBasePath = config.localBasePath;
    // vscode.window
    for (let i = 0; i < config.serverConfigs.length; i++) {
        const serverConfig = config.serverConfigs[i];
        const conn = await ssh2Utils.connectSSH(serverConfig);
        console.log("服务器已经连接成功！");
        try {
            const handleRemoteDirPaths = mergePath(localFilePath, localBasePath, serverConfig.remoteDirPaths);
            console.log('生成的远程的路径：', handleRemoteDirPaths);
            const uploadPromise = await ssh2Utils.uploadFileToServer(conn, localFilePath, handleRemoteDirPaths);
            vscode.window.showInformationMessage(`文件 ${localFilePath} 已成功上传到服务器 ${serverConfig.host}`);
        } catch (err) {
            vscode.window.showErrorMessage(`上传文件 ${localFilePath} 到服务器 ${serverConfig.host} 时出错：${err.message}`);
        } finally {
            await ssh2Utils.closeSSHConnection(conn);
        }
    }
}

/**
 * 上传指定目录下所有文件到多个服务器
 * @param localDirPath 指定的目录
 * @param serverConfigIndices 指定的服务器索引列表
 * @returns 
 */
async function uploadDirectoryContentsToServerWithContext(localDirPath, config) {
    const localBasePath = config.localBasePath;
    for (let configItem of config.serverConfigs) {
        const serverConfig = configItem;
        const conn = await ssh2Utils.connectSSH(serverConfig);
        console.log("服务连接成功！");
        try {
            const localFiles = await vscode.workspace.fs.readDirectory(vscode.Uri.file(localDirPath));
            const uploadPromises = [];

            const handleRemoteDirPaths = mergePath(localDirPath, localBasePath, serverConfig.remoteDirPaths);
            await ssh2Utils.uploadDir(conn, localDirPath, handleRemoteDirPaths);
            vscode.window.showInformationMessage(`目录 ${localDirPath} 已成功上传到服务器 ${serverConfig.host}`);
        } catch (err) {
            vscode.window.showErrorMessage(`上传目录 ${localDirPath} 到服务器 ${serverConfig.host} 时出错：${err.message}`);
        } finally {
            await ssh2Utils.closeSSHConnection(conn);
        }
    }
}

// 注册右键菜单命令
function registerContextMenuCommands() {
    vscode.commands.registerCommand('ssh2-upload-plugin.uploadFile', async function (uri) {
        console.log('已注册右键菜单：上传指定的目录', uri);
        if (uri && uri.fsPath) {
            let localFilePath = uri.fsPath; // e:\\aaa\\bbb\\ccc
            // 格式要求： E://aaa/bbb/ccc
            localFilePath = convertDriveLetterToUppercase(localFilePath).replaceAll('\\', '/');
            const config = getConfigs();
            if(!config) {
                vscode.window.showErrorMessage("缺少配置文件！");
                return;
            }

            if (!config.serverConfigs.length) {
                vscode.window.showErrorMessage('没有可用的服务器配置，请先在设置中添加服务器配置信息。');
                return;
            }
            
            await uploadFileToServerWithContext(localFilePath, config);
        }
    });

    vscode.commands.registerCommand('ssh2-upload-plugin.uploadDirectory', async function (uri) {
        console.log('已注册右键菜单：上传指定的目录', uri);
        if (uri && uri.fsPath) {
            try {
                
                let localDirPath = uri.fsPath;
                localDirPath = convertDriveLetterToUppercase(localDirPath).replaceAll('\\', '/');
                const config = getConfigs();
                if(!config) {
                    vscode.window.showErrorMessage("缺少配置文件！");
                    return;
                }
                if (!config.serverConfigs.length) {
                    vscode.window.showErrorMessage('没有可用的服务器配置，请先在设置中添加服务器配置信息。');
                    return;
                }
    
                if(!localDirPath) {
                    vscode.window.showErrorMessage('请指定要上传的目录或文件！');
                    return;
                }
                
                await uploadDirectoryContentsToServerWithContext(localDirPath, config);
            } catch (error) {
                console.log(error);
            }
        }
    });

    vscode.commands.registerCommand('ssh2-upload-plugin.upload', async function(uri) {
        console.log('ssh 插件 - 注册文件上传菜单');
        if (uri && uri.fsPath) {
            let localFilePath = uri.fsPath; // e:\\aaa\\bbb\\ccc
            // 格式要求： E://aaa/bbb/ccc
            localFilePath = convertDriveLetterToUppercase(localFilePath).replaceAll('\\', '/');
            const config = getConfigs();
            if(!config) {
                vscode.window.showErrorMessage("缺少配置文件！");
                return;
            }

            if (!config.serverConfigs.length) {
                vscode.window.showErrorMessage('没有可用的服务器配置，请先在设置中添加服务器配置信息。');
                return;
            }

            // 创建状态栏项
            try {
                const taskFun = async (progress: Progress<{ message?: string; increment?: number }>) => {
                    const fsStat = fs.lstatSync(localFilePath);
                    if(fsStat.isFile()) {
                        await uploadFileToServerWithContext(localFilePath, config);
                    } else {
                        const localFilePaths = await handleFileList(localFilePath);
                        console.log(localFilePaths);
                        await uploadDirectoryContentsToServerWithContext(localFilePath, config);
                    }
                };

                vscode.window.withProgress({
                    location: ProgressLocation.Notification,
                    title: "ssh2正在执行上传任务, 请稍等..."
                }, taskFun);
            } catch (error) {
                console.log(error);
            }
        }
    });

    vscode.commands.registerCommand('ssh2-upload-plugin.editConfig', async function () {
        console.log('已注册右键菜单：配置读取');
        const configFilePath: string | undefined = vscode.workspace.getConfiguration('ssh2-upload-plugin').get('configFile');
		if(!configFilePath) {
			return;
		}
        const document = await vscode.workspace.openTextDocument(configFilePath);
        const editor = await vscode.window.showTextDocument(document);
        // 这里可以添加更多针对编辑配置文件的交互逻辑，比如保存时的验证等
    });
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	registerContextMenuCommands();
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "ssh-publish" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	// const disposable = vscode.commands.registerCommand('ssh-publish.helloWorld', () => {
	// 	// The code you place here will be executed every time your command is executed
	// 	// Display a message box to the user
	// 	const message = "Hello vscode!";
	// 	vscode.window.showInformationMessage(message);
	// });

	// context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
