import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import { exec } from 'child_process';

// 获取当前模块的路径信息（用于替代__dirname）
const currentModuleUrl = import.meta.url;
const currentDirPath = path.dirname(new URL(currentModuleUrl).pathname);

// 用于文件选择操作的工具对象
const fileSelectorUtils = {
    // 检查配置文件是否存在
    checkConfigFileExists: function () {
        const configFilePath = path.join(currentDirPath, 'file_config.json');
        return fs.existsSync(configFilePath);
    },

    // 从配置文件中读取文件列表
    readFileListFromConfig: function () {
        const configFilePath = path.join(currentDirPath, 'file_config.json');
        try {
            const fileConfig = fs.readFileSync(configFilePath, 'utf8');
            return JSON.parse(fileConfig).fileList;
        } catch (err) {
            console.error('读取配置文件时出错:', err);
            return [];
        }
    },

    // 将文件列表保存到配置文件
    saveFileListToConfig: function (fileList) {
        const configFilePath = path.join(currentDirPath, 'file_config.json');
        const configData = {
            fileList: fileList
        };
        try {
            fs.writeFileSync(configFilePath, JSON.stringify(configData), 'utf8');
            console.log('文件列表已成功保存到配置文件。');
        } catch (err) {
            console.error('保存配置文件时出错:', err);
        }
    },

    // 使用CMD命令打开文件选择窗口获取单个文件路径
    getSingleFilePathWithCMD: async function () {
        return new Promise((resolve, reject) => {
            const command = 'powershell.exe -Command "(New-Object -ComObject Shell.Application).OpenDialog(0).Items() | Select-Object -ExpandProperty Path"';
            exec(command, (err, stdout, stderr) => {
                if (err) {
                    reject(err);
                } else if (stderr) {
                    reject(new Error(stderr));
                } else {
                    const file = stdout.trim();
                    resolve(file);
                }
            });
        });
    },

    // 使用CMD命令打开文件选择窗口获取多个文件路径
    getMultipleFilePathsWithCMD: async function () {
        return new Promise((resolve, reject) => {
            const command = 'powershell.exe -Command "(New-Object -ComObject Shell.Application).OpenDialog(1).Items() | Select-Object -ExpandProperty Path"';
            exec(command, (err, stdout, stderr) => {
                if (err) {
                    reject(err);
                } else if (stderr) {
                    reject(new Error(stderr));
                } else {
                    const files = stdout.trim().split('\r\n');
                    resolve(files);
                }
            });
        });
    },

    // 根据配置文件情况获取文件列表，若配置文件不存在则通过相应方式获取并保存
    getFileList: async function () {
        let localFilesList;

        if (this.checkConfigFileExists()) {
            localFilesList = this.readFileListFromConfig();
        } else {
            // 这里可以根据需求选择不同的获取文件列表方式，比如先尝试使用CMD获取文件，若失败则使用原始的输入目录方式获取文件
            try {
                localFilesList = await this.getMultipleFilePathsWithCMD();
            } catch (err) {
                console.error('使用CMD获取文件列表失败，将尝试通过输入目录方式获取文件。', err);
                localFilesList = await this.getFileListFromDirectory();
            }
            this.saveFileListToConfig(localFilesList);
        }

        return localFilesList;
    }
};

// 以ES6模块格式导出文件选择操作工具对象
export default fileSelectorUtils;