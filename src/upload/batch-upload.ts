import { Client } from 'ssh2';
import * as fs from 'fs';
import * as path from 'path';
import { ProgressManager } from '../progress';

interface UploadTask {
    localPath: string;
    remotePath: string;
    size: number;
}



export class BatchUploader {
    private readonly MAX_CONCURRENT = 3;
    private readonly progressManager = ProgressManager.getInstance();
    
    constructor(private readonly client: Client) {}

    async uploadFiles(tasks: UploadTask[]): Promise<void> {
        const chunks = this.chunkTasks(tasks, this.MAX_CONCURRENT);
        
        for (const chunk of chunks) {
            await Promise.all(
                chunk.map(task => this.uploadWithProgress(task))
            );
        }
    }

    private chunkTasks(tasks: UploadTask[], size: number): UploadTask[][] {
        const chunks: UploadTask[][] = [];
        for (let i = 0; i < tasks.length; i += size) {
            chunks.push(tasks.slice(i, i + size));
        }
        return chunks;
    }

    private async uploadWithProgress(task: UploadTask): Promise<void> {
        const { localPath, remotePath, size } = task;
        
        return new Promise((resolve, reject) => {
            let uploaded = 0;
            
            const stream = this.client.sftp((err, sftp) => {
                if (err) {
                    reject(err);
                    return;
                }

                const writeStream = sftp.createWriteStream(remotePath);
                const readStream = fs.createReadStream(localPath);

                readStream.on('data', (chunk: Buffer) => {
                    uploaded += chunk.length;
                    const percentage = (uploaded / size) * 100;
                    this.progressManager.updateProgress(
                        path.basename(localPath),
                        percentage
                    );
                });

                writeStream.on('close', resolve);
                writeStream.on('error', reject);

                readStream.pipe(writeStream);
            });
        });
    }
} 