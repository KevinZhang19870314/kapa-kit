/**
 * Migration — 旧版 GAPA 安装迁移工具
 *
 * 检测旧版 Kiro 专用 GAPA 安装（`.kiro/steering/gapa-*.md`），
 * 并将数据迁移到新的跨 IDE 共享目录 `.gapa/`。
 *
 * 迁移映射：
 * - `.kiro/steering/gapa-memory.md`      → `.gapa/memory.md`（去除 Kiro front-matter）
 * - `.kiro/steering/gapa-preferences.md`  → `.gapa/preferences.md`（去除 Kiro front-matter）
 * - `.kiro/skills/*.md`                   → `.gapa/skills/*.md`
 *
 * 迁移完成后：
 * - `.kiro/steering/gapa-preferences.md` 替换为指针文件（inclusion: auto，指向 .gapa/preferences.md）
 *
 * @module lib/utils/migration
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { ensureDir } from './fs-helpers.mjs'
import { GAPA_DIR, SHARED_FILES } from '../core/shared-data.mjs'

/** Kiro YAML front-matter 正则（匹配 `---\n...\n---\n`） */
const FRONT_MATTER_RE = /^---\s*\n[\s\S]*?\n---\s*\n?/

/**
 * 去除 Kiro steering 文件的 YAML front-matter。
 *
 * @param {string} content — 文件内容
 * @returns {string} — 去除 front-matter 后的内容
 */
export function stripFrontMatter(content) {
  return content.replace(FRONT_MATTER_RE, '').trimStart()
}

/**
 * 生成迁移后的 gapa-preferences.md 指针文件内容。
 *
 * @param {string} gapaDir — 共享数据目录（默认 '.gapa'）
 * @returns {string}
 */
export function createPointerFile(gapaDir = GAPA_DIR) {
  return [
    '---',
    'inclusion: auto',
    '---',
    '',
    `用户的沟通偏好、代码风格和项目习惯。在所有交互中提供个性化上下文。`,
    '',
    `请读取 \`${gapaDir}/preferences.md\` 获取用户偏好信息，并在后续交互中应用这些偏好。`,
    '',
  ].join('\n')
}

/**
 * 检测是否存在旧版 GAPA 安装。
 *
 * 条件：`.kiro/steering/gapa-*.md` 文件存在 且 `.gapa/` 目录不存在。
 *
 * @param {string} projectRoot — 项目根目录绝对路径
 * @returns {boolean}
 */
export function detectLegacyInstall(projectRoot) {
  const gapaDir = resolve(projectRoot, GAPA_DIR)
  if (existsSync(gapaDir)) {
    return false
  }

  const steeringDir = resolve(projectRoot, '.kiro', 'steering')
  if (!existsSync(steeringDir)) {
    return false
  }

  // 检查是否存在 gapa-*.md 文件
  try {
    const files = readdirSync(steeringDir)
    return files.some((f) => f.startsWith('gapa-') && f.endsWith('.md'))
  } catch {
    return false
  }
}

/**
 * 执行旧版 GAPA 安装迁移。
 *
 * @param {string} projectRoot — 项目根目录绝对路径
 * @returns {{ migrated: string[], skipped: string[] }} — 迁移结果
 */
export function migrateLegacy(projectRoot) {
  const migrated = []
  const skipped = []

  const gapaAbsDir = resolve(projectRoot, GAPA_DIR)
  const steeringDir = resolve(projectRoot, '.kiro', 'steering')
  const skillsSrcDir = resolve(projectRoot, '.kiro', 'skills')

  // 确保 .gapa/ 目录存在
  ensureDir(gapaAbsDir)

  // 1. 迁移 gapa-memory.md → .gapa/memory.md
  const memorySrc = resolve(steeringDir, 'gapa-memory.md')
  const memoryDest = resolve(gapaAbsDir, SHARED_FILES.memory)
  if (existsSync(memorySrc)) {
    const content = readFileSync(memorySrc, 'utf-8')
    const stripped = stripFrontMatter(content)
    writeFileSync(memoryDest, stripped, 'utf-8')
    migrated.push('.kiro/steering/gapa-memory.md → .gapa/memory.md')
  } else {
    skipped.push('.kiro/steering/gapa-memory.md (not found)')
  }

  // 2. 迁移 gapa-preferences.md → .gapa/preferences.md
  const prefsSrc = resolve(steeringDir, 'gapa-preferences.md')
  const prefsDest = resolve(gapaAbsDir, SHARED_FILES.preferences)
  if (existsSync(prefsSrc)) {
    const content = readFileSync(prefsSrc, 'utf-8')
    const stripped = stripFrontMatter(content)
    writeFileSync(prefsDest, stripped, 'utf-8')
    migrated.push('.kiro/steering/gapa-preferences.md → .gapa/preferences.md')

    // 替换原文件为指针文件
    writeFileSync(prefsSrc, createPointerFile(GAPA_DIR), 'utf-8')
    migrated.push('.kiro/steering/gapa-preferences.md → pointer file')
  } else {
    skipped.push('.kiro/steering/gapa-preferences.md (not found)')
  }

  // 3. 迁移 .kiro/skills/*.md → .gapa/skills/*.md
  if (existsSync(skillsSrcDir)) {
    const skillsDestDir = resolve(gapaAbsDir, SHARED_FILES.skillsDir)
    ensureDir(skillsDestDir)

    try {
      const skillFiles = readdirSync(skillsSrcDir).filter((f) => f.endsWith('.md'))
      for (const file of skillFiles) {
        const src = resolve(skillsSrcDir, file)
        const dest = resolve(skillsDestDir, file)
        copyFileSync(src, dest)
        migrated.push(`.kiro/skills/${file} → .gapa/skills/${file}`)
      }
    } catch {
      skipped.push('.kiro/skills/ (read error)')
    }
  } else {
    skipped.push('.kiro/skills/ (not found)')
  }

  return { migrated, skipped }
}
