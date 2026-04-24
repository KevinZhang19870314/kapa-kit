/**
 * i18n — 多语言模块
 *
 * 提供 CLI 消息的中英文映射和模板语言切换。
 * 默认语言为 zh（中文）。
 *
 * @module lib/core/i18n
 */

import { SUPPORTED_LANGS, DEFAULT_LANG } from './template-engine.mjs'

export { SUPPORTED_LANGS, DEFAULT_LANG }

/**
 * CLI 消息映射表。
 * 按 key 索引，每个 key 包含 zh / en 两个版本。
 */
const messages = {
  // ─── init 命令 ───
  'init.start': {
    zh: (v, dir) => `\n🧠 GAPA Kit v${v} — 正在初始化 ${dir}\n`,
    en: (v, dir) => `\n🧠 GAPA Kit v${v} — Initializing in ${dir}\n`,
  },
  'init.alreadyInstalled': {
    zh: '⚠️  GAPA 已安装。是否覆盖？(y/N) ',
    en: '⚠️  GAPA is already installed. Overwrite? (y/N) ',
  },
  'init.cancelled': {
    zh: '❌ 已取消。\n',
    en: '❌ Cancelled.\n',
  },
  'init.done': {
    zh: '✅ GAPA 安装完成。',
    en: '✅ GAPA installation complete.',
  },
  'init.nextSteps': {
    zh: [
      '后续步骤：',
      '  1. 编辑偏好文件 — 添加你的偏好设置',
      '  2. （可选）自定义评估规则',
      '  3. 开始使用 — GAPA 会从每次交互中学习',
    ].join('\n'),
    en: [
      'Next steps:',
      '  1. Edit preferences file — add your preferences',
      '  2. (Optional) Customize evaluation rules',
      '  3. Start using — GAPA learns from every interaction',
    ].join('\n'),
  },

  // ─── update 命令 ───
  'update.start': {
    zh: (v, dir) => `\n🧠 GAPA Kit v${v} — 正在更新 ${dir}\n`,
    en: (v, dir) => `\n🧠 GAPA Kit v${v} — Updating in ${dir}\n`,
  },
  'update.notInstalled': {
    zh: '❌ GAPA 尚未安装。请先运行 `gapa init`。\n',
    en: '❌ GAPA is not installed. Run `gapa init` first.\n',
  },
  'update.done': {
    zh: '✅ 框架文件已更新。记忆和偏好已保留。\n',
    en: '✅ Framework files updated. Memory and preferences preserved.\n',
  },

  // ─── status 命令 ───
  'status.title': {
    zh: (v) => `\n🧠 GAPA Kit v${v} — 状态\n`,
    en: (v) => `\n🧠 GAPA Kit v${v} — Status\n`,
  },
  'status.installed': {
    zh: '✅ GAPA 已完整安装。\n',
    en: '✅ GAPA is fully installed.\n',
  },
  'status.incomplete': {
    zh: '⚠️  部分文件缺失。运行 `gapa init` 修复。\n',
    en: '⚠️  Some files are missing. Run `gapa init` to fix.\n',
  },
  'status.skills': {
    zh: (n) => `  📚 Skills: ${n} 个文件`,
    en: (n) => `  📚 Skills: ${n} file(s)`,
  },
  'status.memoryEntries': {
    zh: (n) => `  🧠 记忆条目: ${n}`,
    en: (n) => `  🧠 Memory entries: ${n}`,
  },

  // ─── 文件操作 ───
  'file.created': {
    zh: (path) => `  ✅ ${path}`,
    en: (path) => `  ✅ ${path}`,
  },
  'file.overwritten': {
    zh: (path) => `  🔄 ${path}`,
    en: (path) => `  🔄 ${path}`,
  },
  'file.skipped': {
    zh: (name) => `  ⏭  已跳过（保留）: ${name}`,
    en: (name) => `  ⏭  Skipped (preserved): ${name}`,
  },

  // ─── IDE 选择 ───
  'ide.selectPrompt': {
    zh: '请选择目标 IDE：',
    en: 'Select target IDE:',
  },
  'ide.detected': {
    zh: (names) => `检测到已安装的 IDE: ${names.join(', ')}`,
    en: (names) => `Detected installed IDEs: ${names.join(', ')}`,
  },
  'ide.noneDetected': {
    zh: '未检测到已安装的 IDE 配置。',
    en: 'No IDE configuration detected.',
  },

  // ─── 错误 ───
  'error.unsupportedTarget': {
    zh: (name, supported) =>
      `错误：不支持的目标 IDE "${name}"。支持的 IDE: ${supported.join(', ')}`,
    en: (name, supported) =>
      `Error: Unsupported target IDE "${name}". Supported: ${supported.join(', ')}`,
  },
  'error.unsupportedLang': {
    zh: (lang, supported) =>
      `错误：不支持的语言 "${lang}"。支持的语言: ${supported.join(', ')}`,
    en: (lang, supported) =>
      `Error: Unsupported language "${lang}". Supported: ${supported.join(', ')}`,
  },
  'error.targetRequired': {
    zh: '错误：非交互式终端必须指定 --target 参数。',
    en: 'Error: --target is required in non-interactive terminals.',
  },
  'error.gaparcCorrupt': {
    zh: '⚠️  .gaparc.json 格式损坏。请删除后重新运行 `gapa init`。',
    en: '⚠️  .gaparc.json is corrupted. Delete it and run `gapa init` again.',
  },

  // ─── 迁移 ───
  'migration.detected': {
    zh: '检测到旧版 GAPA 安装。是否迁移到新格式？(y/N) ',
    en: 'Legacy GAPA installation detected. Migrate to new format? (y/N) ',
  },
  'migration.done': {
    zh: '✅ 迁移完成。',
    en: '✅ Migration complete.',
  },
  'migration.skipped': {
    zh: '⏭  跳过迁移。',
    en: '⏭  Migration skipped.',
  },
}

/**
 * 获取指定语言的消息。
 *
 * @param {string} key — 消息 key（如 'init.start'）
 * @param {string} [lang] — 目标语言，默认 DEFAULT_LANG
 * @returns {string | Function} — 静态字符串或接受参数的函数
 */
export function t(key, lang = DEFAULT_LANG) {
  const entry = messages[key]
  if (!entry) {
    return key // fallback: 返回 key 本身
  }
  return entry[lang] || entry[DEFAULT_LANG] || key
}

/**
 * 创建绑定了特定语言的翻译函数。
 *
 * @param {string} lang — 目标语言
 * @returns {(key: string, ...args: any[]) => string}
 */
export function createTranslator(lang = DEFAULT_LANG) {
  const effectiveLang = SUPPORTED_LANGS.includes(lang) ? lang : DEFAULT_LANG

  return (key, ...args) => {
    const msg = t(key, effectiveLang)
    if (typeof msg === 'function') {
      return msg(...args)
    }
    return msg
  }
}
