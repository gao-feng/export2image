const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// 编译 Obsidian 插件
async function buildPlugin() {
	await esbuild.build({
		entryPoints: ['main.ts'],
		bundle: true,
		platform: 'browser',
		target: 'es2020',
		format: 'cjs',
		outfile: 'main.js',
		sourcemap: false,
		minify: true,
		external: ['obsidian'],
		loader: {
			'.ts': 'ts'
		}
	});

	// 添加导出 - 找到继承自 nA.Plugin 的类
	let code = fs.readFileSync('main.js', 'utf8');
	const classMatch = code.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)=class extends [a-zA-Z_$][a-zA-Z0-9_$]*\.Plugin/);
	
	if (classMatch) {
		const className = classMatch[1];
		const exportCode = `\nmodule.exports = exports.default = ${className};\n`;
		code = code.replace(/\nmodule\.exports = exports\.default = [a-zA-Z_$][a-zA-Z0-9_$]*;\n/g, '');
		fs.writeFileSync('main.js', code + exportCode);
		console.log('Found class:', className);
	} else {
		console.log('Warning: Class not found');
	}
	
	console.log('Plugin build complete!');
}

// 编译 CLI 工具
async function buildCLI() {
	await esbuild.build({
		entryPoints: ['cli.ts'],
		bundle: true,
		platform: 'node',
		target: 'node18',
		format: 'cjs',
		outfile: 'export2image',
		sourcemap: false,
		minify: false,
		external: [],
		loader: {
			'.ts': 'ts'
		}
	});
	
	// 添加可执行权限
	fs.chmodSync('export2image', '755');
	
	console.log('CLI build complete!');
}

// 主构建流程
async function main() {
	const args = process.argv.slice(2);
	
	if (args.includes('--cli')) {
		await buildCLI();
	} else if (args.includes('--watch')) {
		// 开发模式监视
		const ctx = await esbuild.context({
			entryPoints: ['main.ts'],
			bundle: true,
			platform: 'browser',
			target: 'es2020',
			format: 'cjs',
			outfile: 'main.js',
			sourcemap: true,
			external: ['obsidian'],
			loader: { '.ts': 'ts' }
		});
		await ctx.watch();
		console.log('Watching for changes...');
	} else {
		// 默认构建插件
		await buildPlugin();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
