/**
 * File System Helpers — 文件操作工具函数
 *
 * 提供带写入策略的文件操作，以及 GAPA 标记追加/替换逻辑。
 *
 * 写入策略：
 * - create          — 仅在文件不存在时创建
 * - overwrite       — 始终覆盖
 * - append-with-markers — 使用 GAPA 标记追加（保留原内容）
 * - skip-if-exists  — 文件存在则跳过
 *
 * @module lib/utils/fs-helpers
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

/** GAPA 标记 */
export const GAPA_START_MARKER = '<!-- GAPA:START -->'
export const GAPA_END_MARKER = '<!-- GAPA:END -->'

/**
 * 按策略写入文件。
 *
 * @param {string} filePath — 绝对文件路径
 * @param {string} content — 文件内容
 * @param {'create' | 'overwrite' | 'append-with-markers' | 'skip-if-exists'} strategy
 * @param {object} [options]
 * @param {string} [options.version] — gapa-kit 版本号（用于标记注释）
 * @returns {{ action: 'created' | 'overwritten' | 'appended' | 'replaced' | 'skipped', path: string }}
 */
export function writeWithStrategy(filePath, content, strategy, options = {}) {
  ensureDir(dirname(filePath))

  switch (strategy) {
    case 'create': {
      if (existsSync(filePath)) {
        return { action: 'skipped', path: filePath }
      }
      writeFileSync(filePath, content, 'utf-8')
      return { action: 'created', path: filePath }
    }

    case 'overwrite': {
      const action = existsSync(filePath) ? 'overwritten' : 'created'
      writeFileSync(filePath, content, 'utf-8')
      return { action, path: filePath }
    }

    case 'append-with-markers': {
      const version = options.version || '0.0.0'
      const markedContent = wrapWithMarkers(content, version)

      if (existsSync(filePath)) {
        const existing = readFileSync(filePath, 'utf-8')

        if (hasGapaMarkers(existing)) {
          // 已有标记 → 替换标记区域内容
          const result = replaceMarkerContent(existing, content, version)
          writeFileSync(filePath, result, 'utf-8')
          return { action: 'replaced', path: filePath }
        }

        // 无标记 → 追加到末尾
        const separator = existing.endsWith('\n') ? '\n' : '\n\n'
        writeFileSync(filePath, existing + separator + markedContent, 'utf-8')
        return { action: 'appended', path: filePath }
      }

      // 文件不存在 → 创建
      writeFileSync(filePath, markedContent, 'utf-8')
      return { action: 'created', path: filePath }
    }

    case 'skip-if-exists': {
      if (existsSync(filePath)) {
        return { action: 'skipped', path: filePath }
      }
      writeFileSync(filePath, content, 'utf-8')
      return { action: 'created', path: filePath }
    }

    default:
      throw new Error(`Unknown write strategy: "${strategy}"`)
  }
}

/**
 * 用 GAPA 标记包裹内容。
 *
 * @param {string} content — GAPA 内容
 * @param {string} version — gapa-kit 版本号
 * @returns {string}
 */
export function wrapWithMarkers(content, version) {
  const comment = `<!-- 由 gapa-kit v${version} 生成，请勿手动编辑此区域 -->`
  return [
    GAPA_START_MARKER,
    comment,
    '',
    content,
    '',
    GAPA_END_MARKER,
  ].join('\n')
}

/**
 * 检查内容是否包含完整的 GAPA 标记对。
 *
 * @param {string} content
 * @returns {boolean}
 */
export function hasGapaMarkers(content) {
  return content.includes(GAPA_START_MARKER) && content.includes(GAPA_END_MARKER)
}

/**
 * 检查内容是否包含不完整的 GAPA 标记（只有 START 没有 END，或反之）。
 *
 * @param {string} content
 * @returns {boolean}
 */
export function hasIncompleteMarkers(content) {
  const hasStart = content.includes(GAPA_START_MARKER)
  const hasEnd = content.includes(GAPA_END_MARKER)
  return (hasStart && !hasEnd) || (!hasStart && hasEnd)
}

/**
 * 替换 GAPA 标记区域内的内容（幂等操作）。
 *
 * 保留标记外的用户内容不变，仅替换标记之间的 GAPA 内容。
 *
 * @param {string} fileContent — 完整文件内容
 * @param {string} newGapaContent — 新的 GAPA 内容（不含标记）
 * @param {string} version — gapa-kit 版本号
 * @returns {string} — 替换后的完整文件内容
 */
export function replaceMarkerContent(fileContent, newGapaContent, version) {
  const startIdx = fileContent.indexOf(GAPA_START_MARKER)
  const endIdx = fileContent.indexOf(GAPA_END_MARKER)

  if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
    // 标记不完整或顺序错误，返回原内容
    return fileContent
  }

  const before = fileContent.substring(0, startIdx)
  const after = fileContent.substring(endIdx + GAPA_END_MARKER.length)
  const comment = `<!-- 由 gapa-kit v${version} 生成，请勿手动编辑此区域 -->`

  return (
    before +
    GAPA_START_MARKER + '\n' +
    comment + '\n' +
    '\n' +
    newGapaContent + '\n' +
    '\n' +
    GAPA_END_MARKER +
    after
  )
}

/**
 * 确保目录存在（递归创建）。
 *
 * @param {string} dirPath — 目录路径
 */
export function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true })
  }
}
