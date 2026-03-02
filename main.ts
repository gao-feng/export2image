import { App, Notice, PluginSettingTab, Modal, MarkdownView, Plugin } from 'obsidian';
import html2canvas from 'html2canvas';
import { saveAs } from 'file-saver';
import { marked } from 'marked';

// 手机屏幕尺寸配置
const PHONE_SIZES = {
	'iPhone SE': { width: 375, height: 667 },
	'iPhone 14': { width: 390, height: 844 },
	'iPhone 14 Pro Max': { width: 430, height: 932 },
	'iPhone 15': { width: 393, height: 852 },
	'iPhone 15 Pro Max': { width: 430, height: 932 },
	'Android Small': { width: 360, height: 640 },
	'Android Medium': { width: 360, height: 800 },
	'Android Large': { width: 412, height: 915 },
	'Custom': { width: 375, height: 812 }
};

interface ExportSettings {
	phoneModel: string;
	customWidth: number;
	customHeight: number;
	imageFormat: 'png' | 'jpeg';
	imageQuality: number;
	showLineNumbers: boolean;
	padding: number;
	fontSize: number;
	theme: 'light' | 'dark' | 'auto';
}

export default class Export2ImagePlugin extends Plugin {
	settings: ExportSettings = {
		phoneModel: 'iPhone 14',
		customWidth: 375,
		customHeight: 812,
		imageFormat: 'png',
		imageQuality: 1,
		showLineNumbers: false,
		padding: 16,
		fontSize: 14,
		theme: 'auto'
	};

	async onload() {
		await this.loadSettings();

		// 添加ribbon图标
		this.addRibbonIcon('image-plus', '导出为图片', async () => {
			await this.exportCurrentNote();
		});

		// 添加命令
		this.addCommand({
			id: 'export-current-note-to-image',
			name: '导出当前笔记为图片',
			callback: async () => {
				await this.exportCurrentNote();
			}
		});

		// 添加设置界面
		this.addSettingTab(new ExportSettingTab(this.app, this));
	}

	onunload() {
		console.log('Export2Image plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, this.settings, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// 解析 #e2i 标签标记的内容块
	parseE2iBlocks(content: string): string[] | null {
		// 使用正则表达式匹配 #e2i 标记的内容
		// 支持 #e2i 或 #e2i:数字 格式
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

		// 如果找到 #e2i 标签，返回解析后的内容块
		// 否则返回 null 表示使用默认的自动分割逻辑
		return hasE2iTag ? blocks : null;
	}

	// 分析文档内容
	analyzeContent(content: string): { length: number; headingCount: number; paragraphs: string[] } {
		const lines = content.split('\n');
		const paragraphs: string[] = [];
		let currentParagraph = '';
		let headingCount = 0;

		lines.forEach(line => {
			if (line.match(/^#{1,6}\s/)) {
				headingCount++;
				// 先保存之前的段落
				if (currentParagraph.trim()) {
					paragraphs.push(currentParagraph.trim());
				}
				// 将标题也作为一个段落保存
				paragraphs.push(line);
				currentParagraph = '';
			} else if (line.trim()) {
				currentParagraph += line + '\n';
			} else {
				if (currentParagraph.trim()) {
					paragraphs.push(currentParagraph.trim());
				}
				currentParagraph = '';
			}
		});

		if (currentParagraph.trim()) {
			paragraphs.push(currentParagraph.trim());
		}

		return {
			length: content.length,
			headingCount,
			paragraphs
		};
	}

	// 计算图片参数
	calculateImageParams(analysis: { length: number; headingCount: number; paragraphs: string[] }): {
		imageCount: number;
		imageWidth: number;
		imageHeight: number;
		chunkSize: number;
	} {
		// 获取屏幕尺寸
		let width: number, height: number;
		if (this.settings.phoneModel === 'Custom') {
			width = this.settings.customWidth;
			height = this.settings.customHeight;
		} else {
			const size = PHONE_SIZES[this.settings.phoneModel as keyof typeof PHONE_SIZES];
			width = size.width;
			height = size.height;
		}

		// 根据文档长度计算需要的图片数量
		// 假设每1000字符大约需要400px高度
		const estimatedContentHeight = Math.ceil(analysis.length / 1000) * 400 + analysis.headingCount * 60;
		
		// 根据标题数量调整（标题之间需要更多空间）
		const titleBonus = analysis.headingCount * 30;
		const totalHeight = estimatedContentHeight + titleBonus;

		// 计算需要的图片数量
		const availableHeight = height - 80; // 留出一些边距
		let imageCount = Math.max(1, Math.ceil(totalHeight / availableHeight));

		// 限制最大图片数量
		imageCount = Math.min(imageCount, 10);

		// 计算每张图片应该显示多少内容
		const chunkSize = Math.ceil(analysis.paragraphs.length / imageCount);

		return {
			imageCount,
			imageWidth: width,
			imageHeight: height,
			chunkSize
		};
	}

	// 导出当前笔记
	async exportCurrentNote() {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) {
			new Notice('请先打开一个笔记文件');
			return;
		}

		const content = activeView.editor.getValue();
		if (!content.trim()) {
			new Notice('笔记内容为空');
			return;
		}

		new Notice('开始生成图片...');

		try {
			// 先检查是否有 #e2i 标签
			const e2iBlocks = this.parseE2iBlocks(content);
			
			if (e2iBlocks && e2iBlocks.length > 0) {
				// 使用 #e2i 标签标记的内容
				new Notice(`发现 ${e2iBlocks.length} 个 #e2i 标记的内容块`);
				
				// 计算图片参数
				const combinedContent = e2iBlocks.join('\n\n');
				const analysis = this.analyzeContent(combinedContent);
				const params = {
					imageCount: e2iBlocks.length,
					imageWidth: 0, // 稍后设置
					imageHeight: 0,
					chunkSize: 1
				};
				
				// 显示预览对话框，传入 e2iBlocks
				const modal = new ExportPreviewModal(this.app, this, content, analysis, params, e2iBlocks);
				modal.open();
			} else {
				// 使用默认的自动分割逻辑
				const analysis = this.analyzeContent(content);
				const params = this.calculateImageParams(analysis);
				
				// 显示设置对话框
				const modal = new ExportPreviewModal(this.app, this, content, analysis, params);
				modal.open();
			}
			
		} catch (error) {
			console.error('Export error:', error);
			new Notice('导出失败: ' + (error as Error).message);
		}
	}

	// 生成单张图片
	async generateImage(content: string, width: number, height: number, index: number, total: number): Promise<Blob> {
		// 创建临时容器
		const container = document.createElement('div');
		container.style.position = 'absolute';
		container.style.left = '-9999px';
		container.style.top = '0';
		container.style.width = `${width}px`;
		container.style.minHeight = `${height}px`;
		container.style.padding = `${this.settings.padding}px`;
		container.style.fontSize = `${this.settings.fontSize}px`;
		container.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
		container.style.backgroundColor = this.settings.theme === 'dark' ? '#1e1e1e' : '#ffffff';
		container.style.color = this.settings.theme === 'dark' ? '#d4d4d4' : '#333333';
		container.style.lineHeight = '1.6';
		container.style.overflow = 'hidden';
		
		// 转换Markdown内容为HTML
		const htmlContent = this.markdownToHtml(content);
		container.innerHTML = htmlContent;
		
		document.body.appendChild(container);

		try {
			const canvas = await html2canvas(container, {
				width,
				height: Math.max(height, container.scrollHeight),
				scale: 2,
				useCORS: true,
				allowTaint: true,
				backgroundColor: this.settings.theme === 'dark' ? '#1e1e1e' : '#ffffff',
				logging: false
			});

			return new Promise((resolve, reject) => {
				canvas.toBlob((blob) => {
					if (blob) {
						resolve(blob);
					} else {
						reject(new Error('Failed to create blob'));
					}
				}, `image/${this.settings.imageFormat}`, this.settings.imageQuality);
			});
		} finally {
			document.body.removeChild(container);
		}
	}

	// 使用marked库转换Markdown为HTML
	markdownToHtml(markdown: string): string {
		if (!markdown || !markdown.trim()) {
			return '<div style="word-wrap: break-word; line-height: 1.6;">无内容</div>';
		}
		
		try {
			// 配置marked选项
			marked.setOptions({
				breaks: true,  // 允许换行
				gfm: true      // GitHub风格Markdown
			});
			
			// 解析Markdown
			const html = marked.parse(markdown);
			
			// 包装并添加基础样式
			return `<div style="word-wrap: break-word; line-height: 1.6; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: ${this.settings.fontSize}px;">
				${html}
			</div>`;
		} catch (error) {
			console.error('Markdown parse error:', error);
			return `<div style="word-wrap: break-word;">${markdown}</div>`;
		}
	}

	// 导出所有图片
	async exportImages(contents: string[], baseName: string) {
		const params = this.calculateImageParams(this.analyzeContent(contents.join('\n')));
		
		for (let i = 0; i < contents.length; i++) {
			const blob = await this.generateImage(
				contents[i],
				params.imageWidth,
				params.imageHeight,
				i + 1,
				contents.length
			);
			
			const fileName = contents.length > 1 
				? `${baseName}_${i + 1}.${this.settings.imageFormat}`
				: `${baseName}.${this.settings.imageFormat}`;
			
			saveAs(blob, fileName);
			new Notice(`已导出: ${fileName}`);
		}
	}
}

// 设置界面
class ExportSettingTab extends PluginSettingTab {
	plugin: Export2ImagePlugin;

	constructor(app: App, plugin: Export2ImagePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: '导出图片设置' });

		// 手机型号选择
		containerEl.createEl('h3', { text: '手机型号' });
		const phoneSelect = containerEl.createEl('select');
		Object.keys(PHONE_SIZES).forEach(model => {
			const option = document.createElement('option');
			option.value = model;
			option.text = model;
			if (model === this.plugin.settings.phoneModel) {
				option.selected = true;
			}
			phoneSelect.appendChild(option);
		});

		// 自定义尺寸
		containerEl.createEl('h3', { text: '自定义尺寸' });
		const widthInput = containerEl.createEl('input', { type: 'number', placeholder: '宽度' });
		widthInput.value = String(this.plugin.settings.customWidth);
		const heightInput = containerEl.createEl('input', { type: 'number', placeholder: '高度' });
		heightInput.value = String(this.plugin.settings.customHeight);

		// 图片格式
		containerEl.createEl('h3', { text: '图片格式' });
		const formatSelect = containerEl.createEl('select');
		['png', 'jpeg'].forEach(format => {
			const option = document.createElement('option');
			option.value = format;
			option.text = format.toUpperCase();
			if (format === this.plugin.settings.imageFormat) {
				option.selected = true;
			}
			formatSelect.appendChild(option);
		});

		// 字体大小
		containerEl.createEl('h3', { text: '字体大小' });
		const fontSizeInput = containerEl.createEl('input', { type: 'number' });
		fontSizeInput.value = String(this.plugin.settings.fontSize);

		// 边距
		containerEl.createEl('h3', { text: '边距' });
		const paddingInput = containerEl.createEl('input', { type: 'number' });
		paddingInput.value = String(this.plugin.settings.padding);

		// 主题
		containerEl.createEl('h3', { text: '主题' });
		const themeSelect = containerEl.createEl('select');
		['auto', 'light', 'dark'].forEach(theme => {
			const option = document.createElement('option');
			option.value = theme;
			option.text = theme === 'auto' ? '跟随系统' : theme === 'light' ? '浅色' : '深色';
			if (theme === this.plugin.settings.theme) {
				option.selected = true;
			}
			themeSelect.appendChild(option);
		});

		// 保存按钮
		const saveBtn = containerEl.createEl('button', { text: '保存设置' });
		saveBtn.addEventListener('click', async () => {
			this.plugin.settings.phoneModel = phoneSelect.value;
			this.plugin.settings.customWidth = parseInt(widthInput.value) || 375;
			this.plugin.settings.customHeight = parseInt(heightInput.value) || 812;
			this.plugin.settings.imageFormat = formatSelect.value as 'png' | 'jpeg';
			this.plugin.settings.fontSize = parseInt(fontSizeInput.value) || 14;
			this.plugin.settings.padding = parseInt(paddingInput.value) || 16;
			this.plugin.settings.theme = themeSelect.value as 'light' | 'dark' | 'auto';
			await this.plugin.saveSettings();
			new Notice('设置已保存');
		});
	}
}

// 预览和导出Modal
class ExportPreviewModal extends Modal {
	plugin: Export2ImagePlugin;
	content: string;
	analysis: { length: number; headingCount: number; paragraphs: string[] };
	params: { imageCount: number; imageWidth: number; imageHeight: number; chunkSize: number };
	e2iBlocks?: string[];

	constructor(app: App, plugin: Export2ImagePlugin, content: string, analysis: any, params: any, e2iBlocks?: string[]) {
		super(app);
		this.plugin = plugin;
		this.content = content;
		this.analysis = analysis;
		this.params = params;
		this.e2iBlocks = e2iBlocks;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		
		contentEl.createEl('h2', { text: '导出预览' });
		
		// 显示分析结果
		const statsDiv = contentEl.createDiv();
		
		if (this.e2iBlocks && this.e2iBlocks.length > 0) {
			// 使用 #e2i 标签模式
			statsDiv.innerHTML = `
				<p><strong>模式:</strong> #e2i 标签标记</p>
				<p><strong>生成图片数量:</strong> ${this.e2iBlocks.length}</p>
				<hr>
				<h3>内容块预览:</h3>
			`;
			
			// 显示每个内容块的预览
			this.e2iBlocks.forEach((block, index) => {
				const blockPreview = contentEl.createDiv();
				blockPreview.style.marginBottom = '10px';
				blockPreview.style.padding = '8px';
				blockPreview.style.backgroundColor = 'var(--background-secondary)';
				blockPreview.style.borderRadius = '4px';
				
				const previewText = block.length > 100 ? block.substring(0, 100) + '...' : block;
				blockPreview.innerHTML = `<strong>图片 ${index + 1}:</strong><br><pre style="white-space: pre-wrap; margin: 4px 0;">${previewText}</pre>`;
			});
		} else {
			// 使用自动分割模式
			statsDiv.innerHTML = `
				<p><strong>模式:</strong> 自动分割</p>
				<p><strong>文档长度:</strong> ${this.analysis.length} 字符</p>
				<p><strong>标题个数:</strong> ${this.analysis.headingCount}</p>
				<p><strong>生成图片数量:</strong> ${this.params.imageCount}</p>
				<p><strong>图片尺寸:</strong> ${this.params.imageWidth} x ${this.params.imageHeight}px</p>
				<hr>
			`;
		}
		
		// 导出按钮
		const exportBtn = contentEl.createEl('button', { text: '导出图片' });
		exportBtn.style.marginRight = '10px';
		exportBtn.addEventListener('click', async () => {
			this.close();
			await this.doExport();
		});

		// 取消按钮
		const cancelBtn = contentEl.createEl('button', { text: '取消' });
		cancelBtn.addEventListener('click', () => {
			this.close();
		});
	}

	async doExport() {
		try {
			let contents: string[];
			
			// 如果有 e2iBlocks，使用它们；否则按默认逻辑分段
			if (this.e2iBlocks && this.e2iBlocks.length > 0) {
				contents = this.e2iBlocks;
			} else {
				// 将内容分段
				contents = [];
				for (let i = 0; i < this.analysis.paragraphs.length; i += this.params.chunkSize) {
					contents.push(this.analysis.paragraphs.slice(i, i + this.params.chunkSize).join('\n\n'));
				}
			}

			// 获取当前文件名
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			const baseName = activeView?.file?.basename || 'export';

			// 导出所有图片
			await this.plugin.exportImages(contents, baseName);
			new Notice('导出完成！');
		} catch (error) {
			console.error('Export error:', error);
			new Notice('导出失败: ' + (error as Error).message);
		}
	}
}
