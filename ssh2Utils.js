import { Client } from 'ssh2';
import path from 'path';

// 创建一个包含所有SSH相关工具方法的对象
const ssh2Utils = {
    // 连接到SSH服务器并返回连接对象（支持async/await）
    connectSSH: async function (serverConfig) {
        const conn = new Client();

        return new Promise((resolve, reject) => {
            conn.on('ready', () => {
                console.log('- ssh 链接成功...');
                resolve(conn);
            });
            conn.on('error', (err) => {
                reject(err);
            });
            conn.connect(serverConfig);
        });
    },

    // 获取SFTP对象（支持async/await）
    getSFTP: async function (conn) {
        return new Promise((resolve, reject) => {
            conn.sftp((err, sftp) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(sftp);
                }
            });
        });
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
                                            rejectStat(new Error(`- 在服务器 ${conn.config.host} 上创建文件夹 ${currentDir} 时权限不足，请检查相关权限设置。`));
                                        } else if (err.code === 'ENOENT' || err.code == 2) {
                                            rejectStat(new Error(`- 创建文件夹 ${currentDir} 时，上级目录不存在，请检查目标路径是否正确。`));
                                        } else {
                                            rejectStat(err);
                                        }
                                    } else {
                                        console.log(`- 在服务器 ${conn.config.host} 上创建文件夹 ${currentDir}`);
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
    uploadFileToServer: async function (conn, localFilePath, remoteDirPaths) {
        const sftp = await this.getSFTP(conn);
        // 创建一个数组来存储所有上传任务的Promise
        const uploadPromises = [];

        for (let i = 0; i < remoteDirPaths.length; i++) {
            const remoteDirPath = remoteDirPaths[i];
            const remoteFilePath = `${remoteDirPath}${localFilePath}`;
            const localFileP = `${process.env.LOCAL_PATH}/${localFilePath}`;
            
            const uploadPromise = new Promise((resolve, reject) => {
                sftp.fastPut(localFileP, remoteFilePath, (err) => {
                    if (err) {
                        console.log(err)
                        if (err.code === 'ENOENT' || err.code == 2) {
                            reject(new Error(`- 文件 ${localFileP} 在本地不存在，请检查路径是否正确。`));
                        } else if (err.code === 'EPERM') {
                            reject(new Error(`- 上传文件 ${localFileP} 到服务器 ${conn.config.host} 时权限不足，请检查相关权限设置。`));
                        } else {
                            reject(err);
                        }
                    } else {
                        console.log(`- 文件 ${localFileP} 已成功上传到服务器 ${conn.config.host}${remoteFilePath}`);
                        resolve();
                    }
                });
            });

            uploadPromises.push(uploadPromise);
        }

        // 使用Promise.all来并行等待所有上传任务完成
        return await Promise.all(uploadPromises);
    },

    // 关闭SSH连接，支持async/await）
    closeSSHConnection: async function (conn) {
        await new Promise((resolve, reject) => {
            conn.end((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    },

    // 处理传入路径，若最后是文件则去掉文件名只保留文件夹层级
    processPath: function (inputPath) {
        return path.dirname(inputPath);
    },
};

// 以ES6模块格式导出这个包含所有工具方法的对象
export default ssh2Utils;