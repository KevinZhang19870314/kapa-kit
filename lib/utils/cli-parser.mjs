/**
 * CLI Parser — CLI 参数解析模块
 *
 * 负责：
 * 1. 解析 --target <ide> 参数（支持多次指定）
 * 2. 解析 --lang <zh|en> 参数（默认 zh）
 * 3. 解析位置参数中的命令（init / update / status）
 * 4. 验证 target 和 lang 值的合法性
 *
 * @module lib/utils/cli-parser
 */

import { getSupportedIDEs } from '../adapters/factory.mjs'
import { SUPPORTED_LANGS, DEFAULT_LANG } from '../core/template-engine.mjs'

export { SUPPORTED_LANGS, DEFAULT_LANG }

/**
 * @typedef {Object} ParsedArgs
 * @property {string|null} command — 命令名（init / update / status / help / version），null 表示未指定
 * @property {string[]} targets — 目标 IDE 列表
 * @property {string} lang — 目标语言
 */

/**
 * 已知的命令列表。
 */
const KNOWN_COMMANDS = ['init', 'update', 'status', 'help', 'version']

/**
 * 解析 CLI 参数数组。
 *
 * @param {string[]} argv — 参数数组（不含 node 和脚本路径，即 process.argv.slice(2)）
 * @returns {ParsedArgs}
 * @throws {Error} 当 --lang 值不在支持列表中时
 * @throws {Error} 当 --target 值不在支持列表中时
 */
export function parseArgs(argv) {
  const targets = []
  let lang = DEFAULT_LANG
  let command = null

  let i = 0
  while (i < argv.length) {
    const arg = argv[i]

    if (arg === '--target') {
      i++
      if (i >= argv.length) {
        throw new Error(
          `Missing value for --target. Supported IDEs: ${getSupportedIDEs().join(', ')}`
        )
      }
      const value = argv[i]
      const supported = getSupportedIDEs()
      if (!supported.includes(value)) {
        throw new Error(
          `Unsupported target IDE "${value}". Supported IDEs: ${supported.join(', ')}`
        )
      }
      targets.push(value)
    } else if (arg === '--lang') {
      i++
      if (i >= argv.length) {
        throw new Error(
          `Missing value for --lang. Supported languages: ${SUPPORTED_LANGS.join(', ')}`
        )
      }
      const value = argv[i]
      if (!SUPPORTED_LANGS.includes(value)) {
        throw new Error(
          `Unsupported language "${value}". Supported languages: ${SUPPORTED_LANGS.join(', ')}`
        )
      }
      lang = value
    } else if (arg === '--help' || arg === '-h') {
      command = 'help'
    } else if (arg === '--version' || arg === '-v') {
      command = 'version'
    } else if (!arg.startsWith('-') && command === null) {
      // 位置参数：第一个非 flag 参数视为命令
      if (KNOWN_COMMANDS.includes(arg)) {
        command = arg
      }
    }

    i++
  }

  return { command, targets, lang }
}
