#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { marked } from 'marked';
import puppeteer, { Browser, Page } from 'puppeteer';

// 手机屏幕尺寸配置
const PHONE_SIZES: { [key: string]: { width: number; height: number } } = {
	'iPhone SE': { width: 375, height: 667 },
	'iPhone 14': { width: 390, height: 844 },
	'iPhone 14 Pro Max': { width: 430, height: 932 },
	'iPhone 15': { width: 393, height: 852 },
	'iPhone 15 Pro Max': { width: 430, height: 932 },
	'Android Small': { width: 360, height: 640 },
	'Android Medium': { width: 360, height: 800 },
	'Android Large': { width: 412, height: 915 },
	'iPhone 14 Crop': { width: 390, height: 844 }
};

interface CLIOptions {
	input: string;
	output: string;
	phoneModel: string;
	theme: 'light' | 'dark';
	padding: number;
	fontSize: number;
}

// 解析命令行参数
function parseArgs(): CLIOptions {
	const args = process.argv.slice(2);
	const options: CLIOptions = {
		input: '',
		output: '',
		phoneModel: 'iPhone 14',
		theme: 'light',
		padding: 16,
		fontSize: 14
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		switch (arg) {
			case '-i':
			case '--input':
				options.input = args[++i];
				break;
			case '-o':
			case '--output':
				options.output = args[++i];
				break;
			case '-p':
			case '--phone':
				options.phoneModel = args[++i];
				break;
			case '-t':
			case '--theme':
				options.theme = args[++i] as 'light' | 'dark';
				break;
			case '--padding':
				options.padding = parseInt(args[++i]);
				break;
			case '--font-size':
				options.fontSize = parseInt(args[++i]);
				break;
			case '-h':
			case '--help':
				printHelp();
				process.exit(0);
		}
	}

	if (!options.input || !options.output) {
		console.error('错误: 请提供输入文件和输出路径');
		printHelp();
		process.exit(1);
	}

	return options;
}

function printHelp() {
	console.log(`
用法: export2image [选项]

选项:
  -i, --input <path>      输入的 Markdown 文件路径 (必需)
  -o, --output <path>     输出图片路径 (必需)
  -p, --phone <model>     手机型号 (默认: iPhone 14)
  -t, --theme <theme>     主题: light 或 dark (默认: light)
  --padding <number>      内边距 (默认: 16)
  --font-size <number>    字体大小 (默认: 14)
  -h, --help              显示帮助信息

支持的手机型号:
${Object.keys(PHONE_SIZES).join(', ')}

示例:
  export2image -i note.md -o output.png
  export2image -i note.md -o output.png -p "iPhone 15" -t dark
  export2image -i note.md -o output.png --padding 20 --font-size 16
`);
}

// 解析 #e2i 标签标记的内容块
function parseE2iBlocks(content: string): string[] | null {
	const e2iPattern = /#e2i(?::\d+)?\s*\n?([\s\S]*?)(?=#e2i(?::\d+)?|$)/gi;
	
	const blocks: string[] = [];
	let match;
	let hasE2iTag = false;

	while ((match = e2iPattern.exec(content)) !== null) {
		hasE2iTag = true;
		const blockContent = match[1].trim();
		if (blockContent) {
			blocks.push(blockContent);
		}
	}

	return hasE2iTag ? blocks : null;
}

// 将 Markdown 转换为 HTML
function markdownToHtml(markdown: string, theme: 'light' | 'dark', fontSize: number): string {
	if (!markdown || !markdown.trim()) {
		return '<div style="word-wrap: break-word; line-height: 1.6;">无内容</div>';
	}
	
	marked.setOptions({
		breaks: true,
		gfm: true
	});
	
	const html = marked.parse(markdown);
	const bgColor = theme === 'dark' ? '#1e1e1e' : '#ffffff';
	const textColor = theme === 'dark' ? '#d4d4d4' : '#333333';
	
	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<style>
		body {
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
			font-size: ${fontSize}px;
			line-height: 1.6;
			padding: ${16}px;
			background-color: ${bgColor};
			color: ${textColor};
			word-wrap: break-word;
		}
		pre {
			background-color: ${theme === 'dark' ? '#2d2d2d' : '#f5f5f5'};
			padding: 10px;
			border-radius: 4px;
			overflow-x: auto;
		}
		code {
			font-family: "SF Mono", Monaco, Consolas, monospace;
			font-size: 0.9em;
		}
		blockquote {
			border-left: 3px solid ${theme === 'dark' ? '#4a9eff' : '#0066cc'};
			margin-left: 0;
			padding-left: 16px;
			color: ${theme === 'dark' ? '#888' : '#666'};
		}
		a {
			color: ${theme === 'dark' ? '#4a9eff' : '#0066cc'};
		}
		img {
			max-width: 100%;
		}
		table {
			border-collapse: collapse;
			width: 100%;
		}
		th, td {
			border: 1px solid ${theme === 'dark' ? '#444' : '#ddd'};
			padding: 8px;
			text-align: left;
		}
		th {
			background-color: ${theme === 'dark' ? '#2d2d2d' : '#f5f5f5'};
		}
	</style>
</head>
<body>
	${html}
</body>
</html>`;
}

// 生成图片
async function generateImage(
	browser: Browser,
	html: string,
	width: number,
	height: number
): Promise<Buffer> {
	const page = await browser.newPage();
	
	// 设置视口大小
	await page.setViewport({
		width: width,
		height: height,
		deviceScaleFactor: 2
	});
	
	// 设置内容
	await page.setContent(html, { waitUntil: 'networkidle0' });
	
	// 等待内容渲染
	await page.waitForSelector('body');
	
	// 获取内容的实际高度
	const bodyHeight = await page.evaluate(() => {
		return document.body.scrollHeight;
	});
	
	// 重新设置视口高度以适应内容
	const actualHeight = Math.max(height, bodyHeight);
	await page.setViewport({
		width: width,
		height: actualHeight,
		deviceScaleFactor: 2
	});
	
	// 截图
	const screenshot = await page.screenshot({
		type: 'png',
		omitBackground: false
	});
	
	await page.close();
	
	return screenshot as Buffer;
}

// 主函数
async function main() {
	const options = parseArgs();
	
	// 读取输入文件
	if (!fs.existsSync(options.input)) {
		console.error(`错误: 输入文件不存在: ${options.input}`);
		process.exit(1);
	}
	
	const content = fs.readFileSync(options.input, 'utf-8');
	
	if (!content.trim()) {
		console.error('错误: 输入文件内容为空');
		process.exit(1);
	}
	
	console.log(`📄 读取文件: ${options.input}`);
	
	// 获取手机尺寸
	const phoneSize = PHONE_SIZES[options.phoneModel] || PHONE_SIZES['iPhone 14'];
	const width = phoneSize.width;
	const height = phoneSize.height;
	
	console.log(`📱 手机型号: ${options.phoneModel} (${width}x${height})`);
	console.log(`🎨 主题: ${options.theme}`);
	
	// 检查是否有 #e2i 标签
	const e2iBlocks = parseE2iBlocks(content);
	
	let blocks: string[];
	if (e2iBlocks && e2iBlocks.length > 0) {
		blocks = e2iBlocks;
		console.log(`🏷️  发现 ${blocks.length} 个 #e2i 标记的内容块`);
	} else {
		// 没有 #e2i 标签，将整个内容作为一个块
		blocks = [content];
		console.log(`📝 使用完整内容生成图片`);
	}
	
	// 启动浏览器
	console.log('🚀 启动浏览器...');
	const browser = await puppeteer.launch({
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox']
	});
	
	try {
		// 处理输出路径
		const outputPath = options.output;
		const ext = path.extname(outputPath).toLowerCase();
		const baseName = path.basename(outputPath, ext);
		const dirName = path.dirname(outputPath);
		
		// 生成图片
		for (let i = 0; i < blocks.length; i++) {
			console.log(`🖼️  生成图片 ${i + 1}/${blocks.length}...`);
			
			const html = markdownToHtml(blocks[i], options.theme, options.fontSize);
			const screenshot = await generateImage(browser, html, width, height);
			
			// 保存图片
			let savePath: string;
			if (blocks.length === 1) {
				savePath = outputPath;
			} else {
				const extName = ext || '.png';
				savePath = path.join(dirName, `${baseName}_${i + 1}${extName}`);
			}
			
			fs.writeFileSync(savePath, screenshot);
			console.log(`✅ 已保存: ${savePath}`);
		}
		
		console.log('✨ 完成!');
		
	} finally {
		await browser.close();
	}
}

main().catch(console.error);
