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
  // 添加导出 - 找到Ct类定义并在文件末尾添加正确的导出
  let code = fs.readFileSync('main.js', 'utf8');
  
  // 在文件末尾添加正确的导出语句
  const exportCode = '\nmodule.exports = exports.default = Ct;\n';
  
  // 移除之前可能添加的错误的导出语句
  code = code.replace(/\nmodule\.exports = exports\.default = Ct;\n/g, '');
  
  // 在文件末尾添加导出
  fs.writeFileSync('main.js', code + exportCode);
  
  console.log('Build complete!');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
