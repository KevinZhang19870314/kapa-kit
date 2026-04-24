/**
 * Shared Data — 共享数据定义
 *
 * 定义 Memory / Preferences / Skill 的统一格式，
 * 以及 .gapa/ 共享目录结构和 .gaparc.json 配置。
 *
 * 这些格式与 IDE 无关，所有适配器共享同一份数据。
 *
 * @module lib/core/shared-data
 */

/** 共享数据目录名（相对于项目根） */
export const GAPA_DIR = '.gapa'

/** 共享数据文件路径（相对于 .gapa/） */
export const SHARED_FILES = {
  memory: 'memory.md',
  preferences: 'preferences.md',
  skillsDir: 'skills',
  skillExample: 'skills/_example.md',
  config: '.gaparc.json',
  gitignore: '.gitignore',
}

/**
 * Memory 文件格式 — 评估记录条目的正则匹配模式。
 * 用于解析和统计 memory.md 中的评估条目数。
 */
export const MEMORY_ENTRY_PATTERN = /^### GAPA-\d+/gm

/**
 * 统计 memory 文件中的评估条目数。
 *
 * @param {string} content — memory.md 文件内容
 * @returns {number}
 */
export function countMemoryEntries(content) {
  const matches = content.match(MEMORY_ENTRY_PATTERN)
  return matches ? matches.length : 0
}

/**
 * 创建默认的 .gaparc.json 配置内容。
 *
 * @param {object} options
 * @param {string} options.version — gapa-kit 版本号
 * @param {string} options.lang — 安装语言
 * @param {Record<string, { formatVersion: string }>} [options.adapters] — 已安装的适配器
 * @returns {object}
 */
export function createGapaConfig({ version, lang, adapters = {} }) {
  const now = new Date().toISOString()
  const installedAdapters = {}

  for (const [name, info] of Object.entries(adapters)) {
    installedAdapters[name] = {
      formatVersion: info.formatVersion,
      installedAt: now,
      updatedAt: now,
    }
  }

  return {
    version,
    lang,
    installedAdapters,
  }
}

/**
 * 创建 .gapa/.gitignore 的默认内容。
 *
 * 排除 memory.md（个人评估数据），
 * 保留 preferences.md 和 skills/（可团队共享）。
 *
 * @returns {string}
 */
export function createGitignore() {
  return [
    '# GAPA — personal data (do not commit)',
    'memory.md',
    '',
    '# Keep these files (team-shareable)',
    '# !preferences.md',
    '# !skills/',
    '# !.gaparc.json',
    '',
  ].join('\n')
}

/**
 * Preferences 文件的分区名称（统一格式）。
 */
export const PREFERENCES_SECTIONS = [
  'communication',  // 沟通偏好
  'codeStyle',      // 代码风格
  'projectHabits',  // 项目特定习惯
]

/**
 * Skill 文件的必需分区名称（统一格式）。
 */
export const SKILL_SECTIONS = [
  'trigger',       // 触发场景
  'workflow',      // 工作流
  'notes',         // 注意事项
]
