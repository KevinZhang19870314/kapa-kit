/**
 * Property 1: 适配器工厂的完备性与错误处理
 *
 * 对于任意字符串 name，createAdapter(name) 要么返回一个 adapter.name === name
 * 的 IDEAdapter 实例（当 name 在支持列表中时），要么抛出一个包含所有支持 IDE
 * 名称的错误（当 name 不在支持列表中时）。
 *
 * Feature: cross-ide-gapa-kit, Property 1: 适配器工厂的完备性与错误处理
 *
 * **Validates: Requirements 1.3, 1.4**
 */

import { describe, it, beforeEach } from 'vitest'
import fc from 'fast-check'
import {
  createAdapter,
  getSupportedIDEs,
  clearAdapterCache,
} from '../../lib/adapters/factory.mjs'
import { IDEAdapter } from '../../lib/adapters/base-adapter.mjs'

const SUPPORTED = getSupportedIDEs()

describe('Property 1: 适配器工厂的完备性与错误处理', () => {
  beforeEach(() => {
    clearAdapterCache()
  })

  it('对于任意支持的 IDE 名称，createAdapter 返回 adapter.name === ideName 的 IDEAdapter 实例', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...SUPPORTED),
        async (ideName) => {
          const adapter = await createAdapter(ideName)

          // adapter 是 IDEAdapter 实例
          if (!(adapter instanceof IDEAdapter)) {
            throw new Error(`Expected IDEAdapter instance, got ${typeof adapter}`)
          }

          // adapter.name 与请求的 ideName 一致
          if (adapter.name !== ideName) {
            throw new Error(
              `Expected adapter.name === "${ideName}", got "${adapter.name}"`
            )
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('对于任意不在支持列表中的字符串，createAdapter 抛出包含所有支持 IDE 名称的错误', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string().filter((s) => !SUPPORTED.includes(s)),
        async (name) => {
          let threw = false
          try {
            await createAdapter(name)
          } catch (err) {
            threw = true
            const message = err.message

            // 错误信息应包含每个支持的 IDE 名称
            for (const ide of SUPPORTED) {
              if (!message.includes(ide)) {
                throw new Error(
                  `Error message missing supported IDE "${ide}". Got: ${message}`
                )
              }
            }
          }

          if (!threw) {
            throw new Error(
              `createAdapter("${name}") should have thrown for unsupported IDE`
            )
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})


/**
 * Property 3: CLI 参数解析的正确性
 *
 * 对于任意支持的 --target 值和 --lang 值的组合，CLI 参数解析应正确提取
 * target 和 lang 值；对于不支持的 --lang 值，应抛出包含所有支持语言选项的错误。
 *
 * Feature: cross-ide-gapa-kit, Property 3: CLI 参数解析的正确性
 *
 * **Validates: Requirements 2.1, 11.1, 11.9**
 */

import {
  parseArgs,
  SUPPORTED_LANGS,
  DEFAULT_LANG,
} from '../../lib/utils/cli-parser.mjs'

describe('Property 3: CLI 参数解析的正确性', () => {
  it('对于任意支持的 --target 和 --lang 组合，解析应正确提取 target 和 lang 值', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SUPPORTED),
        fc.constantFrom(...SUPPORTED_LANGS),
        (target, lang) => {
          const result = parseArgs(['init', '--target', target, '--lang', lang])

          if (result.command !== 'init') {
            throw new Error(
              `Expected command "init", got "${result.command}"`
            )
          }

          if (!result.targets.includes(target)) {
            throw new Error(
              `Expected targets to include "${target}", got [${result.targets.join(', ')}]`
            )
          }

          if (result.lang !== lang) {
            throw new Error(
              `Expected lang "${lang}", got "${result.lang}"`
            )
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('对于任意多个支持的 --target 值，解析应正确提取所有 target', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom(...SUPPORTED), { minLength: 1, maxLength: SUPPORTED.length }),
        (targets) => {
          const argv = ['init']
          for (const t of targets) {
            argv.push('--target', t)
          }

          const result = parseArgs(argv)

          if (result.targets.length !== targets.length) {
            throw new Error(
              `Expected ${targets.length} targets, got ${result.targets.length}`
            )
          }

          for (const t of targets) {
            if (!result.targets.includes(t)) {
              throw new Error(
                `Expected targets to include "${t}", got [${result.targets.join(', ')}]`
              )
            }
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('未指定 --lang 时，默认使用 DEFAULT_LANG', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SUPPORTED),
        (target) => {
          const result = parseArgs(['init', '--target', target])

          if (result.lang !== DEFAULT_LANG) {
            throw new Error(
              `Expected default lang "${DEFAULT_LANG}", got "${result.lang}"`
            )
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('对于任意不支持的 --lang 值，解析应抛出包含所有支持语言选项的错误', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => !SUPPORTED_LANGS.includes(s)),
        (badLang) => {
          let threw = false
          try {
            parseArgs(['init', '--lang', badLang])
          } catch (err) {
            threw = true
            const message = err.message

            // 错误信息应包含每个支持的语言
            for (const lang of SUPPORTED_LANGS) {
              if (!message.includes(lang)) {
                throw new Error(
                  `Error message missing supported lang "${lang}". Got: ${message}`
                )
              }
            }
          }

          if (!threw) {
            throw new Error(
              `parseArgs with --lang "${badLang}" should have thrown for unsupported language`
            )
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
