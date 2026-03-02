const esbuild = require('esbuild');
const fs = require('fs');

esbuild.build({
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
}).then(() => {
  // 添加导出 - 找到继承自 nA.Plugin 的类 (nA 是压缩后的 obsidian)
  let code = fs.readFileSync('main.js', 'utf8');
  
  // 查找继承自 nA.Plugin 的类 (压缩后的格式: XX=class extends nA.Plugin)
  const classMatch = code.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)=class extends [a-zA-Z_$][a-zA-Z0-9_$]*\.Plugin/);
  
  if (classMatch) {
    const className = classMatch[1];
    const exportCode = `\nmodule.exports = exports.default = ${className};\n`;
    
    // 移除之前可能添加的错误的导出语句
    code = code.replace(/\nmodule\.exports = exports\.default = [a-zA-Z_$][a-zA-Z0-9_$]*;\n/g, '');
    
    // 在文件末尾添加导出
    fs.writeFileSync('main.js', code + exportCode);
    console.log('Found class:', className);
  } else {
    console.log('Warning: Class not found');
  }
  
  console.log('Build complete!');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
