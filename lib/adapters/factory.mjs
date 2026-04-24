/**
 * Adapter Factory — 适配器工厂
 *
 * 提供：
 * - createAdapter(ideName)    — 根据 IDE 名称返回对应适配器实例
 * - getSupportedIDEs()        — 获取所有支持的 IDE 名称列表
 * - detectIDEs(projectRoot)   — 自动检测项目中已存在的 IDE
 *
 * @module lib/adapters/factory
 */

/**
 * 支持的 IDE 名称列表。
 * 新增 IDE 时在此注册。
 */
const SUPPORTED_IDES = [
  'kiro',
  'cursor',
  'claude-code',
  'vscode',
  'windsurf',
  'trae',
]

/**
 * 适配器模块的懒加载映射。
 * key: IDE 名称, value: () => import() 返回适配器类的 Promise
 *
 * 使用懒加载避免一次性加载所有适配器模块。
 * 注意：适配器模块尚未实现，此处预留 import 路径。
 *
 * @type {Record<string, () => Promise<{ default: typeof import('./base-adapter.mjs').IDEAdapter }>>}
 */
const adapterLoaders = {
  'kiro': () => import('./kiro-adapter.mjs'),
  'cursor': () => import('./cursor-adapter.mjs'),
  'claude-code': () => import('./claude-code-adapter.mjs'),
  'vscode': () => import('./vscode-adapter.mjs'),
  'windsurf': () => import('./windsurf-adapter.mjs'),
  'trae': () => import('./trae-adapter.mjs'),
}

/**
 * 已实例化的适配器缓存。
 * @type {Map<string, import('./base-adapter.mjs').IDEAdapter>}
 */
const adapterCache = new Map()

/**
 * 根据 IDE 名称返回对应的适配器实例。
 *
 * @param {string} ideName — IDE 名称（如 'kiro'、'cursor'）
 * @returns {Promise<import('./base-adapter.mjs').IDEAdapter>}
 * @throws {Error} 当 ideName 不在支持列表中时
 */
export async function createAdapter(ideName) {
  if (!SUPPORTED_IDES.includes(ideName)) {
    throw new Error(
      `Unsupported IDE "${ideName}". Supported IDEs: ${SUPPORTED_IDES.join(', ')}`
    )
  }

  // 返回缓存的实例
  if (adapterCache.has(ideName)) {
    return adapterCache.get(ideName)
  }

  const loader = adapterLoaders[ideName]
  if (!loader) {
    throw new Error(
      `No adapter loader registered for "${ideName}". This is a bug in gapa-kit.`
    )
  }

  const module = await loader()
  const AdapterClass = module.default
  const adapter = new AdapterClass()

  // 验证适配器名称一致性
  if (adapter.name !== ideName) {
    throw new Error(
      `Adapter name mismatch: expected "${ideName}", got "${adapter.name}". This is a bug in gapa-kit.`
    )
  }

  adapterCache.set(ideName, adapter)
  return adapter
}

/**
 * 获取所有支持的 IDE 名称列表。
 *
 * @returns {string[]}
 */
export function getSupportedIDEs() {
  return [...SUPPORTED_IDES]
}

/**
 * 自动检测项目中已存在的 IDE 配置。
 *
 * 使用精确路径检测（参见设计文档 IDE 自动检测精确性）：
 * - Kiro:       .kiro/steering/ 或 .kiro/hooks/
 * - Cursor:     .cursor/rules/
 * - Claude Code: CLAUDE.md 或 .claude/
 * - VS Code:    .github/copilot-instructions.md 或 .github/instructions/
 * - Windsurf:   .windsurfrules 或 .windsurf/rules/
 * - TRAE:       .trae/rules/ 或 .trae/skills/
 *
 * @param {string} projectRoot — 项目根目录绝对路径
 * @returns {Promise<string[]>} — 检测到的 IDE 名称列表
 */
export async function detectIDEs(projectRoot) {
  const detected = []

  for (const ideName of SUPPORTED_IDES) {
    try {
      const adapter = await createAdapter(ideName)
      if (adapter.detect(projectRoot)) {
        detected.push(ideName)
      }
    } catch {
      // 适配器加载失败时跳过（模块尚未实现等）
    }
  }

  return detected
}

/**
 * 清除适配器缓存（用于测试）。
 */
export function clearAdapterCache() {
  adapterCache.clear()
}
