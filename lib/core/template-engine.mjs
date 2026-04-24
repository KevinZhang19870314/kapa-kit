/**
 * Template Engine — 模板引擎
 *
 * 负责：
 * 1. 按语言加载 templates/core/<lang>/ 下的核心模板
 * 2. 路径占位符替换（{{gapaDir}}、{{configDir}} 等）
 * 3. 将核心模板内容注入到适配器包装模板
 *
 * @module lib/core/template-engine
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_ROOT = resolve(__dirname, '..', '..', 'templates')

/** 支持的语言列表 */
export const SUPPORTED_LANGS = ['zh', 'en']

/** 默认语言 */
export const DEFAULT_LANG = 'zh'

/**
 * 按语言加载 templates/core/<lang>/ 下所有核心模板。
 *
 * @param {string} lang — 目标语言 ('zh' | 'en')
 * @returns {import('./types.mjs').CoreTemplates}
 */
export function loadTemplates(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) {
    throw new Error(
      `Unsupported language "${lang}". Supported: ${SUPPORTED_LANGS.join(', ')}`
    )
  }

  const coreDir = resolve(TEMPLATES_ROOT, 'core', lang)
  if (!existsSync(coreDir)) {
    throw new Error(
      `Template directory not found: ${coreDir}. The gapa-kit installation may be incomplete.`
    )
  }

  return {
    gapaRules: readTemplate(coreDir, 'gapa-rules.md'),
    contextLoadPrompt: readTemplate(coreDir, 'prompts/context-load.md'),
    evaluationPrompt: readTemplate(coreDir, 'prompts/evaluation.md'),
    memoryTemplate: readTemplate(coreDir, 'memory-template.md'),
    preferencesTemplate: readTemplate(coreDir, 'preferences-template.md'),
    skillExampleTemplate: readTemplate(coreDir, 'skill-example.md'),
    copilotOverview: readTemplateOptional(coreDir, 'copilot-overview.md'),
  }
}

/**
 * 替换模板内容中的路径占位符。
 *
 * 支持的占位符：
 * - {{gapaDir}}   — 共享数据目录（默认 .gapa）
 * - {{configDir}} — IDE 配置目录（如 .kiro、.cursor 等）
 * - {{version}}   — gapa-kit 版本号
 *
 * @param {string} content — 模板内容
 * @param {Record<string, string>} vars — 占位符变量映射
 * @returns {string}
 */
export function replacePlaceholders(content, vars) {
  let result = content
  for (const [key, value] of Object.entries(vars)) {
    // 匹配 {{key}} 形式的占位符（允许空格）
    const pattern = new RegExp(`\\{\\{\\s*${escapeRegExp(key)}\\s*\\}\\}`, 'g')
    result = result.replace(pattern, value)
  }
  return result
}

/**
 * 将核心模板内容注入到适配器包装模板中。
 *
 * 适配器模板使用 {{slot:slotName}} 标记注入点，
 * 其中 slotName 对应 CoreTemplates 的字段名。
 *
 * @param {string} wrapperTemplate — 适配器包装模板内容
 * @param {Record<string, string>} slots — 插槽名 → 内容映射
 * @returns {string}
 */
export function injectIntoWrapper(wrapperTemplate, slots) {
  let result = wrapperTemplate
  for (const [slotName, content] of Object.entries(slots)) {
    const pattern = new RegExp(
      `\\{\\{\\s*slot:\\s*${escapeRegExp(slotName)}\\s*\\}\\}`,
      'g'
    )
    result = result.replace(pattern, content)
  }
  return result
}

/**
 * 加载适配器包装模板。
 *
 * @param {string} ideName — IDE 名称（如 'kiro'、'cursor'）
 * @param {string} templateFile — 模板文件名（如 'steering-wrapper.tpl'）
 * @returns {string}
 */
export function loadAdapterTemplate(ideName, templateFile) {
  const filePath = resolve(TEMPLATES_ROOT, 'adapters', ideName, templateFile)
  if (!existsSync(filePath)) {
    throw new Error(
      `Adapter template not found: ${filePath}. The gapa-kit installation may be incomplete.`
    )
  }
  return readFileSync(filePath, 'utf-8')
}

// ─── Internal helpers ───

/**
 * 读取单个模板文件。
 * @param {string} baseDir
 * @param {string} relativePath
 * @returns {string}
 */
function readTemplate(baseDir, relativePath) {
  const filePath = resolve(baseDir, relativePath)
  if (!existsSync(filePath)) {
    throw new Error(
      `Template file not found: ${filePath}. The gapa-kit installation may be incomplete.`
    )
  }
  return readFileSync(filePath, 'utf-8')
}

/**
 * 读取可选的模板文件，不存在时返回空字符串。
 * @param {string} baseDir
 * @param {string} relativePath
 * @returns {string}
 */
function readTemplateOptional(baseDir, relativePath) {
  const filePath = resolve(baseDir, relativePath)
  if (!existsSync(filePath)) {
    return ''
  }
  return readFileSync(filePath, 'utf-8')
}

/**
 * 转义正则特殊字符。
 * @param {string} str
 * @returns {string}
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
