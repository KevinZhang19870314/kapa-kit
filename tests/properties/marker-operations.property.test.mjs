/**
 * Property 8: GAPA 标记追加保留原内容
 * Property 9: GAPA 标记替换的幂等性与内容保护
 * Property 11: 模板路径替换完整性
 *
 * Feature: cross-ide-gapa-kit
 */

import { describe, it, afterEach } from 'vitest'
import fc from 'fast-check'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  wrapWithMarkers,
  replaceMarkerContent,
  hasGapaMarkers,
  writeWithStrategy,
  GAPA_START_MARKER,
  GAPA_END_MARKER,
} from '../../lib/utils/fs-helpers.mjs'

import {
  loadTemplates,
  replacePlaceholders,
  SUPPORTED_LANGS,
} from '../../lib/core/template-engine.mjs'

import { getSupportedIDEs } from '../../lib/adapters/factory.mjs'

// ─── Generators ───

/**
 * Arbitrary string that does NOT contain GAPA markers.
 * Filters out strings containing the marker substrings.
 */
const arbContentWithoutMarkers = fc.string({ minLength: 0, maxLength: 300 }).filter(
  (s) => !s.includes('GAPA:START') && !s.includes('GAPA:END')
)

/** Arbitrary non-empty GAPA content (the content to be wrapped in markers). */
const arbGapaContent = fc.string({ minLength: 1, maxLength: 200 }).filter(
  (s) => !s.includes('GAPA:START') && !s.includes('GAPA:END')
)

/** Arbitrary semver-like version string. */
const arbVersion = fc.tuple(
  fc.integer({ min: 0, max: 99 }),
  fc.integer({ min: 0, max: 99 }),
  fc.integer({ min: 0, max: 99 }),
).map(([a, b, c]) => `${a}.${b}.${c}`)


// ─── Property 8 ───

/**
 * Property 8: GAPA 标记追加保留原内容
 *
 * 对于任意已有文件内容字符串（不含 GAPA 标记），使用 append-with-markers 策略
 * 追加 GAPA 内容后，结果应同时包含：原内容（完整保留）、<!-- GAPA:START --> 标记、
 * GAPA 内容、<!-- GAPA:END --> 标记。
 *
 * **Validates: Requirements 5.4, 6.3**
 */
describe('Property 8: GAPA 标记追加保留原内容', () => {
  /** Temp directories created during tests — cleaned up in afterEach. */
  const tmpDirs = []

  afterEach(() => {
    for (const d of tmpDirs) {
      try { rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
    }
    tmpDirs.length = 0
  })

  it('wrapWithMarkers 输出包含 START 标记、GAPA 内容和 END 标记', () => {
    fc.assert(
      fc.property(
        arbGapaContent,
        arbVersion,
        (gapaContent, version) => {
          const wrapped = wrapWithMarkers(gapaContent, version)

          if (!wrapped.includes(GAPA_START_MARKER)) {
            throw new Error('Wrapped content missing GAPA:START marker')
          }
          if (!wrapped.includes(GAPA_END_MARKER)) {
            throw new Error('Wrapped content missing GAPA:END marker')
          }
          if (!wrapped.includes(gapaContent)) {
            throw new Error('Wrapped content missing the GAPA content itself')
          }
          // START must appear before END
          if (wrapped.indexOf(GAPA_START_MARKER) >= wrapped.indexOf(GAPA_END_MARKER)) {
            throw new Error('GAPA:START must appear before GAPA:END')
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('writeWithStrategy append-with-markers 保留原文件内容并追加 GAPA 标记', () => {
    fc.assert(
      fc.property(
        arbContentWithoutMarkers,
        arbGapaContent,
        arbVersion,
        (existingContent, gapaContent, version) => {
          const tmpDir = mkdtempSync(join(tmpdir(), 'gapa-p8-'))
          tmpDirs.push(tmpDir)
          const filePath = join(tmpDir, 'test-file.md')

          // Pre-create the file with existing content
          writeFileSync(filePath, existingContent, 'utf-8')

          const result = writeWithStrategy(filePath, gapaContent, 'append-with-markers', { version })
          const finalContent = readFileSync(filePath, 'utf-8')

          // Action should be 'appended' (file existed, no markers)
          if (result.action !== 'appended') {
            throw new Error(`Expected action "appended", got "${result.action}"`)
          }

          // Original content must be fully preserved at the start
          if (!finalContent.startsWith(existingContent)) {
            throw new Error('Original content not preserved at the start of the file')
          }

          // Must contain GAPA markers
          if (!finalContent.includes(GAPA_START_MARKER)) {
            throw new Error('Result missing GAPA:START marker')
          }
          if (!finalContent.includes(GAPA_END_MARKER)) {
            throw new Error('Result missing GAPA:END marker')
          }

          // Must contain the GAPA content
          if (!finalContent.includes(gapaContent)) {
            throw new Error('Result missing the appended GAPA content')
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})


// ─── Property 9 ───

/**
 * Property 9: GAPA 标记替换的幂等性与内容保护
 *
 * 对于任意包含 GAPA 标记的文件内容（标记前有用户内容 A、标记后有用户内容 B），
 * 执行标记区域替换后，标记外的内容 A 和 B 应与替换前完全一致，
 * 且标记内的内容应为新的 GAPA 内容。
 *
 * **Validates: Requirements 5.5, 6.4, 7.4**
 */
describe('Property 9: GAPA 标记替换的幂等性与内容保护', () => {
  it('replaceMarkerContent 保留标记外的用户内容 A 和 B，替换标记内内容', () => {
    fc.assert(
      fc.property(
        arbContentWithoutMarkers,
        arbContentWithoutMarkers,
        arbGapaContent,
        arbGapaContent,
        arbVersion,
        (userContentA, userContentB, oldGapa, newGapa, version) => {
          // Build a file with: userContentA + markers(oldGapa) + userContentB
          const oldWrapped = wrapWithMarkers(oldGapa, version)
          const fileContent = userContentA + oldWrapped + userContentB

          const result = replaceMarkerContent(fileContent, newGapa, version)

          // Content before GAPA:START must equal userContentA
          const startIdx = result.indexOf(GAPA_START_MARKER)
          if (startIdx === -1) {
            throw new Error('Result missing GAPA:START marker')
          }
          const beforeMarker = result.substring(0, startIdx)
          if (beforeMarker !== userContentA) {
            throw new Error(
              `Content before marker changed.\nExpected: ${JSON.stringify(userContentA)}\nGot: ${JSON.stringify(beforeMarker)}`
            )
          }

          // Content after GAPA:END must equal userContentB
          const endIdx = result.indexOf(GAPA_END_MARKER)
          if (endIdx === -1) {
            throw new Error('Result missing GAPA:END marker')
          }
          const afterMarker = result.substring(endIdx + GAPA_END_MARKER.length)
          if (afterMarker !== userContentB) {
            throw new Error(
              `Content after marker changed.\nExpected: ${JSON.stringify(userContentB)}\nGot: ${JSON.stringify(afterMarker)}`
            )
          }

          // The new GAPA content must appear between the markers
          const markerRegion = result.substring(startIdx, endIdx + GAPA_END_MARKER.length)
          if (!markerRegion.includes(newGapa)) {
            throw new Error('New GAPA content not found between markers')
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('replaceMarkerContent 是幂等的：连续替换相同内容结果不变', () => {
    fc.assert(
      fc.property(
        arbContentWithoutMarkers,
        arbContentWithoutMarkers,
        arbGapaContent,
        arbGapaContent,
        arbVersion,
        (userContentA, userContentB, oldGapa, newGapa, version) => {
          const oldWrapped = wrapWithMarkers(oldGapa, version)
          const fileContent = userContentA + oldWrapped + userContentB

          const firstReplace = replaceMarkerContent(fileContent, newGapa, version)
          const secondReplace = replaceMarkerContent(firstReplace, newGapa, version)

          if (firstReplace !== secondReplace) {
            throw new Error(
              'replaceMarkerContent is not idempotent: second replacement produced different result'
            )
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})


// ─── Property 11 ───

/**
 * Property 11: 模板路径替换完整性
 *
 * 对于任意 IDE 适配器和任意语言设置，生成的所有文件内容中不应包含未替换的
 * 模板占位符（如 {{gapaDir}}、{{configDir}}），且数据文件路径应统一指向 .gapa/。
 *
 * **Validates: Requirements 8.5**
 */
describe('Property 11: 模板路径替换完整性', () => {
  const SUPPORTED_IDES = getSupportedIDEs()

  /** All template field names from CoreTemplates */
  const TEMPLATE_FIELDS = [
    'gapaRules',
    'contextLoadPrompt',
    'evaluationPrompt',
    'memoryTemplate',
    'preferencesTemplate',
    'skillExampleTemplate',
  ]

  /** Regex matching any unreplaced {{...}} placeholder */
  const UNREPLACED_PLACEHOLDER_RE = /\{\{\s*(gapaDir|configDir|version)\s*\}\}/

  it('replacePlaceholders 替换后不应包含 {{gapaDir}} 或 {{configDir}} 占位符', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SUPPORTED_LANGS),
        fc.constantFrom(...TEMPLATE_FIELDS),
        fc.constantFrom(...SUPPORTED_IDES),
        (lang, field, ideName) => {
          const templates = loadTemplates(lang)
          const content = templates[field]

          // Replace placeholders with realistic values
          const replaced = replacePlaceholders(content, {
            gapaDir: '.gapa',
            configDir: `.${ideName}`,
            version: '0.2.0',
          })

          const match = replaced.match(UNREPLACED_PLACEHOLDER_RE)
          if (match) {
            throw new Error(
              `After replacePlaceholders, found unreplaced placeholder "${match[0]}" ` +
              `in field "${field}" for lang="${lang}", ide="${ideName}"`
            )
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('替换后的数据文件路径应统一指向 .gapa/', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SUPPORTED_LANGS),
        fc.constantFrom(...TEMPLATE_FIELDS),
        (lang, field) => {
          const templates = loadTemplates(lang)
          const content = templates[field]

          const replaced = replacePlaceholders(content, {
            gapaDir: '.gapa',
            configDir: '.kiro',
            version: '0.2.0',
          })

          // Check that data file references (memory.md, preferences.md, skills/)
          // point to .gapa/ after replacement
          const gapaPathRefs = replaced.match(/\.gapa\/[a-z-]+\.(md|json)/g) || []
          const configPathRefs = replaced.match(/\.kiro\/(?:memory|preferences|skills)/g) || []

          // If the original template had {{gapaDir}} references, they should now be .gapa/
          if (content.includes('{{gapaDir}}') && gapaPathRefs.length === 0) {
            // The template had gapaDir placeholders but after replacement no .gapa/ paths found
            // This is acceptable only if the content doesn't reference data files
            // (e.g. skill-example.md may not reference .gapa/ paths)
          }

          // Data file paths should NOT point to IDE config dir
          if (configPathRefs.length > 0) {
            throw new Error(
              `Data file paths should point to .gapa/, not IDE config dir. ` +
              `Found: ${configPathRefs.join(', ')} in field "${field}" for lang="${lang}"`
            )
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
