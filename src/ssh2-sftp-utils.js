// import { Client } from 'ssh2';
import Client from 'ssh2-sftp-client';
import path from 'path';
// const { Client } = require('ssh2');
// const path = require('path');
// const conn = new Client();
// 创建一个包含所有SSH相关工具方法的对象
const ssh2Utils = {
    // 连接到SSH服务器并返回连接对象（支持async/await）
    connectSSH: async function (serverConfig) {
        console.log("准备连接ssh");
        const conn = new Client();
        console.log("config service", serverConfig);
        await conn.connect(serverConfig);
        console.log("连接成功！");
        return conn;
    },

    // 在服务器上检查远程目录是否存在（支持async/await）
    checkRemoteDirExists: async function (sftp, remoteDirPath) {
        return new Promise((resolve, reject) => {
            sftp.stat(remoteDirPath, (err, stats) => {
                if (err) {
                    if (err.code === 'ENOENT' || err.code == 2) {
                        resolve(false);
                    } else {
                        reject(err);
                    }
                } else {
                    resolve(true);
                }
            });
        });
    },

    // 在服务器上创建远程目录（如果不存在），支持async/await）
    createRemoteDirIfNotExists: async function (conn, localFilePath, remoteDirPaths) {
        const sftp = await this.getSFTP(conn);
        for (let i = 0; i < remoteDirPaths.length; i++) {
            let remoteDirPath = remoteDirPaths[i];
            remoteDirPath = this.processPath(`${remoteDirPath}${localFilePath}`);
            // console.log(remoteDirPath, remoteDirPath, path.dirname(remoteDirPath))
            const dirs = remoteDirPath.split('/').filter(d => d);
            let currentDir = '';
            // console.log(dirs)
            const createDirPromises = [];
            const THAT = this;
            for (let i = 0; i < dirs.length; i++) {
                currentDir += `/${dirs[i]}`;
                // console.log('创建目录', currentDir);
                (function (currentDir) {
                    const statPromise = new Promise((resolveStat, rejectStat) => {
                        THAT.checkRemoteDirExists(sftp, currentDir).then((exists) => {
                            if (!exists) {
                                // console.log('创建：', currentDir);
                                sftp.mkdir(currentDir, (err) => {
                                    if (err) {
                                        if (err.code === 'EACCES') {
                                            rejectStat(new Error(`- 在服务器 "指定服务器ip地址的" 上创建文件夹 ${currentDir} 时权限不足，请检查相关权限设置。`));
                                        } else if (err.code === 'ENOENT' || err.code == 2) {
                                            rejectStat(new Error(`- 创建文件夹 ${currentDir} 时，上级目录不存在，请检查目标路径是否正确。`));
                                        } else {
                                            rejectStat(err);
                                        }
                                    } else {
                                        console.log(`- 在服务器 "指定服务器ip地址的" 上创建文件夹 ${currentDir}`);
                                        resolveStat();
                                    }
                                });
                            } else {
                                resolveStat();
                            }
                        }).catch(rejectStat);
                    });
                    createDirPromises.push(statPromise);
                })(currentDir)
            }
        
            try {
                await Promise.all(createDirPromises);
            } catch (error) {
                reject(error);
            }
        }
    },

    // 通过SFTP上传文件到服务器，支持async/await）
    uploadFileToServer: async function (conn, localFilePath, remoteFilePaths) {        
        // 创建一个数组来存储所有上传任务的Promise
        // const uploadPromises = [];
        for (let i = 0; i < remoteFilePaths.length; i++) {
            const remoteFilePath = remoteFilePaths[i];
            
            try {
                // 分割路径以获取目录部分
                const dirname = path.dirname(remoteFilePath);
                // 检查目录是否存在
                try {
                    console.log('文件路径：', dirname);
                    const status = await conn.stat(dirname);
                    console.log('获取文件是否存在：', status);
                } catch (err) {
                    // 目录不存在，创建目录
                    const res = await conn.mkdir(dirname, true);
                    console.log('目录创建结果：', res);
                }

                await conn.fastPut(localFilePath, remoteFilePath);
                console.log(`- 文件 ${localFilePath} 已成功上传到服务器 ${remoteFilePath}`);
            } catch (err) {
                if (err) {
                    console.log(err);
                    if (err.code === 'ENOENT' || err.code === 2) {
                        throw new Error(`- 文件 ${localFilePath} 在本地不存在，请检查路径是否正确。`);
                    } else if (err.code === 'EPERM') {
                        throw new Error(`- 上传文件 ${localFilePath} 到服务器 "指定服务器ip地址的" 时权限不足，请检查相关权限设置。`);
                    } else {
                        throw err;
                    }
                }
            }
        }

        // 使用Promise.all来并行等待所有上传任务完成
        // return await Promise.all(uploadPromises);
    },

    /**
     * 上传指定目录到服务器
     * @param {*} conn 服务器对象
     * @param {*} localDirPath 本地路径
     * @param {*} remoteDirPath 远程路径
     * @returns 
     */
    uploadDir: async function (conn, localDirPath, remoteDirPaths) {
        for (let i = 0; i < remoteDirPaths.length; i++) {
            const remoteDirPath = remoteDirPaths[i];
            try {
                await conn.uploadDir(localDirPath, remoteDirPath);
            } catch (error) {
                throw error;
            }
        }
    },

    // 关闭SSH连接，支持async/await）
    closeSSHConnection: async function (conn) {
        try {
            conn.end();
            console.log('ssh2 连接已关闭！');
        } catch (error) {
            throw error;
        }
    },

    // 处理传入路径，若最后是文件则去掉文件名只保留文件夹层级
    processPath: function (inputPath) {
        return path.dirname(inputPath);
    },
};

// 以ES6模块格式导出这个包含所有工具方法的对象
export default ssh2Utils;