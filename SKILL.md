---
name: export2image
description: 将 Obsidian Markdown 文档导出为图片。支持 #e2i 标签手动分页、自动根据内容调整图片高度。适用于生成长笔记截图、分享笔记内容等场景。
---

# export2image

将 Obsidian Markdown 文档导出为图片的 CLI 工具。

## 安装

```bash
cd /path/to/export2image
npm install
npm run build:all

# 本地链接（可选）
npm link
```

## 使用方法

### 基本用法

```bash
# 导出单张图片（内容会自动调整高度）
./export2image -i input.md -o output.png

# 指定手机型号和主题
./export2image -i note.md -o output.png -p "iPhone 15" -t dark

# 指定其他选项
./export2image -i note.md -o output.png --padding 20 --font-size 16
```

### 命令行参数

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--input` | `-i` | 输入的 Markdown 文件路径 | (必需) |
| `--output` | `-o` | 输出图片路径 | (必需) |
| `--phone` | `-p` | 手机型号 | iPhone 14 |
| `--theme` | `-t` | 主题: light 或 dark | light |
| `--padding` | | 内边距 | 16 |
| `--font-size` | | 字体大小 | 14 |
| `--help` | `-h` | 显示帮助信息 | |

### 支持的手机型号

- `iPhone SE` (375x667)
- `iPhone 14` (390x844)
- `iPhone 14 Pro Max` (430x932)
- `iPhone 15` (393x852)
- `iPhone 15 Pro Max` (430x932)
- `Android Small` (360x640)
- `Android Medium` (360x800)
- `Android Large` (412x915)

## #e2i 标签用法

使用 `#e2i` 标签手动控制每张图片的内容和数量：

```markdown
#e2i
## 第一张图片的内容

这里是第一张图片要显示的内容。
可以是多行，支持 Markdown 格式。

- 项目列表
- **粗体** *斜体*
#e2i

#e2i
## 第二张图片的内容

这里是第二张图片要显示的内容。

> 引用块
> 多行引用

```
代码块
```
#e2i
```

每个 `#e2i` 到下一个 `#e2i` 之间的内容会生成一张独立的图片。

## 示例

```bash
# 导出到当前目录
./export2image -i mynote.md -o mynote.png

# 导出到指定目录
./export2image -i /path/to/note.md -o /path/to/output.png

# 使用 iPhone 15 尺寸，深色主题
./export2image -i note.md -o note_dark.png -p "iPhone 15" -t dark

# 多个 #e2i 块会自动生成多张图片（_1.png, _2.png, ...）
./export2image -i long_note.md -o long_note.png
```

## Obsidian 插件

同目录下也有 Obsidian 插件版本，插件支持在 Obsidian 内直接导出当前笔记为图片。

安装插件后：
1. 打开要导出的笔记
2. 点击侧边栏的导出图标，或使用命令面板
3. 预览并确认导出设置
4. 图片会自动下载
