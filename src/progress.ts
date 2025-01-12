import * as vscode from 'vscode';

export class ProgressManager {
    private static instance: ProgressManager;
    private currentProgress?: vscode.Progress<{ message?: string; increment?: number }>;
    private totalFiles: number = 0;
    private completedFiles: number = 0;

    static getInstance(): ProgressManager {
        if (!ProgressManager.instance) {
            ProgressManager.instance = new ProgressManager();
        }
        return ProgressManager.instance;
    }

    async showProgress<T>(
        title: string,
        task: (
            progress: vscode.Progress<{ message?: string; increment?: number }>,
            token: vscode.CancellationToken
        ) => Thenable<T>
    ): Promise<T> {
        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title,
                cancellable: true
            },
            async (progress, token) => {
                this.currentProgress = progress;
                return await task(progress, token);
            }
        );
    }

    updateProgress(filename: string, increment: number) {
        this.currentProgress?.report({
            message: `正在上传: ${filename}`,
            increment
        });
    }
}