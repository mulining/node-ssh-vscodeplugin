import * as assert from 'assert';
import { getCompiledDirPath } from '../utils';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

// 添加测试配置
const testConfig = {
	serverConfigs: [],
	localBasePath: '/项目根目录',
	localCompliePath: '/编译输出目录',
	directUploadFiles: ['*.html', '*.jpg', '*.png']
};

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	// test('Sample test', () => {
	// 	assert.strictEqual(-1, [1, 2, 3].indexOf(5));
	// 	assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	// });

	// 测试场景1：编译目录下存在的文件
	test('编译目录下存在的文件', () => {
		const jsFile = "/项目根目录/src/main.js";
		console.log(getCompiledDirPath(jsFile));
		// 应该返回: "/编译输出目录/src/main.js"
	});

	// 测试场景2：白名单中的文件
	test('白名单中的文件', () => {
		const htmlFile = "/项目根目录/index.html";
		console.log(getCompiledDirPath(htmlFile));
		// 应该返回: "/项目根目录/index.html"
	});

	// 测试场景3：assets目录下的文件
	test('assets目录下的文件', () => {
		const assetFile = "/项目根目录/assets/logo.png";
		console.log(getCompiledDirPath(assetFile));
		// 应该返回: "/项目根目录/assets/logo.png"
	});

	// 测试场景4：不存在且不在白名单中的文件
	test('不存在且不在白名单中的文件', () => {
		try {
			const notExistFile = "/项目根目录/src/notexist.css";
			getCompiledDirPath(notExistFile);
		} catch (error) {
			console.error('预期的错误:', error.message);
		}
	});
});
