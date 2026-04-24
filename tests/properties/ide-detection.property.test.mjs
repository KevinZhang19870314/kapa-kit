/**
 * Property 2: IDE 自动检测的正确性
 *
 * 对于任意 IDE 配置目录存在/不存在的组合（6 个 IDE 的布尔组合），
 * detectIDEs(projectRoot) 返回的 IDE 列表应精确匹配实际存在配置目录的 IDE 集合
 * ——不多检测、不漏检测。
 *
 * Feature: cross-ide-gapa-kit, Property 2: IDE 自动检测的正确性
 *
 * **Validates: Requirements 2.2**
 */

import { describe, it, afterEach } from 'vitest'
import fc from 'fast-check'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { detectIDEs, clearAdapterCache } from '../../lib/adapters/factory.mjs'

/**
 * IDE detection paths — each IDE has one or more paths that trigger detection.
 * We pick one primary path per IDE to create when the boolean flag is true.
 */
const IDE_DETECTION_PATHS = {
  kiro: '.kiro/steering/',
  cursor: '.cursor/rules/',
  'claude-code': 'CLAUDE.md',
  vscode: '.github/copilot-instructions.md',
  windsurf: '.windsurf/rules/',
  trae: '.trae/rules/',
}

/**
 * Alternative detection paths — second detection condition for each IDE.
 */
const IDE_ALT_DETECTION_PATHS = {
  kiro: '.kiro/hooks/',
  'claude-code': '.claude/',
  vscode: '.github/instructions/',
  windsurf: '.windsurfrules',
  trae: '.trae/skills/',
}

const ALL_IDES = Object.keys(IDE_DETECTION_PATHS)
const IDES_WITH_ALT = Object.keys(IDE_ALT_DETECTION_PATHS)

/**
 * Create the detection path in the temp directory.
 * If the path ends with '/', create a directory; otherwise create a file.
 */
function createDetectionPath(root, relativePath) {
  const fullPath = join(root, relativePath)
  if (relativePath.endsWith('/')) {
    mkdirSync(fullPath, { recursive: true })
  } else {
    const parentDir = join(fullPath, '..')
    mkdirSync(parentDir, { recursive: true })
    writeFileSync(fullPath, '', 'utf-8')
  }
}

describe('Property 2: IDE 自动检测的正确性', () => {
  /** Collect temp dirs for cleanup */
  const tmpDirs = []

  afterEach(() => {
    for (const d of tmpDirs) {
      rmSync(d, { recursive: true, force: true })
    }
    tmpDirs.length = 0
  })

  it('对于任意 IDE 配置目录存在/不存在的布尔组合，detectIDEs 返回精确匹配的 IDE 集合', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        async (hasKiro, hasCursor, hasClaude, hasVscode, hasWindsurf, hasTrae) => {
          clearAdapterCache()
          const tmpDir = mkdtempSync(join(tmpdir(), 'gapa-detect-'))
          tmpDirs.push(tmpDir)

          const flags = [hasKiro, hasCursor, hasClaude, hasVscode, hasWindsurf, hasTrae]
          const expected = []

          for (let i = 0; i < ALL_IDES.length; i++) {
            if (flags[i]) {
              const ide = ALL_IDES[i]
              createDetectionPath(tmpDir, IDE_DETECTION_PATHS[ide])
              expected.push(ide)
            }
          }

          const detected = await detectIDEs(tmpDir)
          const detectedSorted = [...detected].sort()
          const expectedSorted = [...expected].sort()

          if (detectedSorted.length !== expectedSorted.length ||
              detectedSorted.some((v, i) => v !== expectedSorted[i])) {
            throw new Error(
              `Expected [${expectedSorted}], got [${detectedSorted}]`
            )
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('对于任意 IDE 使用备选检测路径，detectIDEs 同样能正确检测', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.subarray(IDES_WITH_ALT, { minLength: 0, maxLength: IDES_WITH_ALT.length }),
        async (selectedIDEs) => {
          clearAdapterCache()
          const tmpDir = mkdtempSync(join(tmpdir(), 'gapa-detect-alt-'))
          tmpDirs.push(tmpDir)

          for (const ide of selectedIDEs) {
            createDetectionPath(tmpDir, IDE_ALT_DETECTION_PATHS[ide])
          }

          const detected = await detectIDEs(tmpDir)
          const detectedSorted = [...detected].sort()
          const expectedSorted = [...selectedIDEs].sort()

          if (detectedSorted.length !== expectedSorted.length ||
              detectedSorted.some((v, i) => v !== expectedSorted[i])) {
            throw new Error(
              `Expected [${expectedSorted}], got [${detectedSorted}]`
            )
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
