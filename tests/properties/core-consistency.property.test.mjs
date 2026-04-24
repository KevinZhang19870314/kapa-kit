/**
 * Property 10: 跨适配器核心内容一致性
 *
 * 对于任意两个不同的 IDE 适配器和相同的语言设置，从生成的文件中提取核心 GAPA 规则文本
 * （去除 IDE 特定的格式包装后），两者应完全一致。
 *
 * Feature: cross-ide-gapa-kit, Property 10: 跨适配器核心内容一致性
 *
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
 */

import { describe, it } from 'vitest'
import fc from 'fast-check'
import { loadTemplates, replacePlaceholders } from '../../lib/core/template-engine.mjs'
import { createAdapter, getSupportedIDEs } from '../../lib/adapters/factory.mjs'

const SUPPORTED_IDES = getSupportedIDEs()

/**
 * Find the file containing the full GAPA rules from an adapter's output.
 *
 * For adapters that produce multiple files (e.g. vscode v2.0 with split instructions),
 * the core rules may be in a dedicated file rather than the first one.
 * Heuristic: prefer a file whose path contains 'gapa-rules', otherwise use the first file.
 */
function findCoreRulesFile(files) {
  const rulesFile = files.find(f => f.relativePath.includes('gapa-rules'))
  return rulesFile || files[0]
}

/**
 * Extract the core GAPA rules text from an adapter's generated steering output.
 *
 * Strips IDE-specific wrappers:
 * - YAML/MDC front-matter (--- ... ---)
 * - GAPA markers (<!-- GAPA:START --> / <!-- GAPA:END -->)
 * - Template comment lines (<!-- 由 gapa-kit ... -->)
 * - "# GAPA Framework" heading (added by wrapper templates)
 * - "## 自动行为指引" section and everything after it (fallback steering)
 *
 * Returns the core GAPA rules portion, trimmed and normalized.
 */
function extractCoreRules(content) {
  let text = content

  // 0. Normalize line endings
  text = text.replace(/\r\n/g, '\n')

  // 1. Strip GAPA markers
  text = text.replace(/<!-- GAPA:START -->/g, '')
  text = text.replace(/<!-- GAPA:END -->/g, '')
  text = text.replace(/<!-- 由 gapa-kit[^>]*-->/g, '')

  // 2. Strip YAML/MDC front-matter (--- ... ---)
  const fmMatch = text.match(/^\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  if (fmMatch) {
    text = text.substring(fmMatch[0].length)
  }

  // 3. Strip "# GAPA Framework" heading line
  text = text.replace(/^#\s+GAPA Framework\s*\n?/m, '')

  // 4. Remove "## 自动行为指引" section and everything after it
  const fallbackIdx = text.indexOf('## 自动行为指引')
  if (fallbackIdx !== -1) {
    text = text.substring(0, fallbackIdx)
  }

  // 5. Normalize whitespace: trim and collapse multiple blank lines
  text = text.trim()
  text = text.replace(/\n{3,}/g, '\n\n')

  return text
}


/**
 * Generate a pair of distinct IDE names for comparison.
 */
const arbIdePair = fc
  .tuple(
    fc.constantFrom(...SUPPORTED_IDES),
    fc.constantFrom(...SUPPORTED_IDES),
  )
  .filter(([a, b]) => a !== b)

describe('Property 10: 跨适配器核心内容一致性', () => {
  it('对于任意两个不同的 IDE 适配器和相同的语言设置，核心 GAPA 规则文本应完全一致', async () => {
    // Pre-load all adapters to avoid async issues inside fc.assert
    const adapterMap = {}
    for (const ide of SUPPORTED_IDES) {
      adapterMap[ide] = await createAdapter(ide)
    }

    fc.assert(
      fc.property(
        fc.constantFrom('zh', 'en'),
        arbIdePair,
        (lang, [ideA, ideB]) => {
          const templates = loadTemplates(lang)
          const ctx = {
            projectRoot: '/tmp/test',
            lang,
            gapaDir: '.gapa',
            templates,
            isUpdate: false,
          }

          const adapterA = adapterMap[ideA]
          const adapterB = adapterMap[ideB]

          // Get steering files from both adapters
          const filesA = adapterA.generateSteering(ctx)
          const filesB = adapterB.generateSteering(ctx)

          if (!Array.isArray(filesA) || filesA.length === 0) {
            throw new Error(`${ideA} generateSteering() returned empty array`)
          }
          if (!Array.isArray(filesB) || filesB.length === 0) {
            throw new Error(`${ideB} generateSteering() returned empty array`)
          }

          // Extract core rules from the main steering file of each adapter.
          // For adapters that split into multiple files (e.g. vscode v2.0),
          // find the file containing the full GAPA rules (not the overview).
          const mainFileA = findCoreRulesFile(filesA)
          const mainFileB = findCoreRulesFile(filesB)
          const coreA = extractCoreRules(mainFileA.content)
          const coreB = extractCoreRules(mainFileB.content)

          if (!coreA) {
            throw new Error(`${ideA} produced empty core rules after stripping wrapper`)
          }
          if (!coreB) {
            throw new Error(`${ideB} produced empty core rules after stripping wrapper`)
          }

          if (coreA !== coreB) {
            // Find first difference for debugging
            const maxLen = Math.max(coreA.length, coreB.length)
            let diffIdx = 0
            for (let i = 0; i < maxLen; i++) {
              if (coreA[i] !== coreB[i]) { diffIdx = i; break }
            }
            const snippet = (s, idx) => {
              const start = Math.max(0, idx - 20)
              const end = Math.min(s.length, idx + 20)
              return s.substring(start, end)
            }
            throw new Error(
              `Core GAPA rules differ between ${ideA} and ${ideB} (lang=${lang}).\n` +
              `First difference at index ${diffIdx}:\n` +
              `  ${ideA}: ...${JSON.stringify(snippet(coreA, diffIdx))}...\n` +
              `  ${ideB}: ...${JSON.stringify(snippet(coreB, diffIdx))}...`
            )
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
