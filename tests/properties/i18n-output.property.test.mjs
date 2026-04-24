/**
 * Property 13: 语言切换的输出差异性
 *
 * 对于任意 IDE 适配器，使用 lang=zh 和 lang=en 分别生成的 steering 文件内容应不同；
 * zh 版本应包含中文字符，en 版本不应包含中文字符（代码和标识符除外）。
 *
 * Feature: cross-ide-gapa-kit, Property 13: 语言切换的输出差异性
 *
 * **Validates: Requirements 11.3, 11.4, 11.5, 11.6**
 */

import { describe, it } from 'vitest'
import fc from 'fast-check'
import { loadTemplates, SUPPORTED_LANGS } from '../../lib/core/template-engine.mjs'

/**
 * Matches CJK Unified Ideographs (common Chinese characters).
 */
const CHINESE_CHAR_RE = /[\u4e00-\u9fff]/

/**
 * Strip content inside fenced code blocks (``` ... ```) and inline code (` ... `).
 * Also strip well-known identifiers / proper nouns that may appear in English templates
 * (e.g. "GAPA", template placeholders like {{gapaDir}}).
 *
 * @param {string} text
 * @returns {string} text with code blocks and known identifiers removed
 */
function stripCodeAndIdentifiers(text) {
  // Remove fenced code blocks
  let cleaned = text.replace(/```[\s\S]*?```/g, '')
  // Remove inline code
  cleaned = cleaned.replace(/`[^`]*`/g, '')
  // Remove template placeholders like {{gapaDir}}, {{configDir}}, etc.
  cleaned = cleaned.replace(/\{\{[^}]*\}\}/g, '')
  return cleaned
}

/** All template field names from CoreTemplates */
const TEMPLATE_FIELDS = [
  'gapaRules',
  'contextLoadPrompt',
  'evaluationPrompt',
  'memoryTemplate',
  'preferencesTemplate',
  'skillExampleTemplate',
]

describe('Property 13: 语言切换的输出差异性', () => {
  it('对于任意模板字段，zh 和 en 版本的内容应不同', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TEMPLATE_FIELDS),
        (field) => {
          const zhTemplates = loadTemplates('zh')
          const enTemplates = loadTemplates('en')

          const zhContent = zhTemplates[field]
          const enContent = enTemplates[field]

          if (zhContent === enContent) {
            throw new Error(
              `Template field "${field}" has identical content for zh and en`
            )
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('zh 版本的模板应包含中文字符', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TEMPLATE_FIELDS),
        (field) => {
          const zhTemplates = loadTemplates('zh')
          const content = zhTemplates[field]

          if (!CHINESE_CHAR_RE.test(content)) {
            throw new Error(
              `zh template field "${field}" does not contain any Chinese characters`
            )
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('en 版本的模板不应包含中文字符（代码块和标识符除外）', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TEMPLATE_FIELDS),
        (field) => {
          const enTemplates = loadTemplates('en')
          const content = enTemplates[field]
          const cleaned = stripCodeAndIdentifiers(content)

          if (CHINESE_CHAR_RE.test(cleaned)) {
            // Find the offending character for a useful error message
            const match = cleaned.match(CHINESE_CHAR_RE)
            const idx = cleaned.indexOf(match[0])
            const context = cleaned.substring(
              Math.max(0, idx - 20),
              Math.min(cleaned.length, idx + 20)
            )
            throw new Error(
              `en template field "${field}" contains Chinese character "${match[0]}" ` +
              `outside code blocks. Context: "...${context}..."`
            )
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
