/**
 * Property 4: update 命令保留用户数据
 *
 * 对于任意已安装的 IDE 和任意 memory.md / preferences.md 文件内容，
 * 执行 gapa update 后，.gapa/memory.md 和 .gapa/preferences.md 的内容
 * 应与 update 前完全一致。
 *
 * Feature: cross-ide-gapa-kit, Property 4: update 命令保留用户数据
 *
 * **Validates: Requirements 2.6**
 *
 * ---
 *
 * Property 14: update 保留语言设置
 *
 * 对于任意 .gaparc.json 中记录的语言设置，执行 gapa update 后生成的文件
 * 应使用 .gaparc.json 中记录的语言版本，而非默认语言。
 *
 * Feature: cross-ide-gapa-kit, Property 14: update 保留语言设置
 *
 * **Validates: Requirements 11.10**
 */

import { describe, it, afterEach } from 'vitest'
import fc from 'fast-check'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { SUPPORTED_LANGS } from '../../lib/core/template-engine.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const GAPA_BIN = resolve(__dirname, '..', '..', 'bin', 'gapa.mjs')
const NODE = process.execPath

const SUPPORTED_IDES = ['kiro', 'cursor', 'claude-code', 'vscode', 'windsurf', 'trae']

/**
 * Run gapa CLI command in a given directory.
 */
function runGapa(cwd, args) {
  return execFileSync(NODE, [GAPA_BIN, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 30000,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  })
}

/**
 * Get the main steering/rules file paths for a given IDE after init.
 */
function getGeneratedSteeringFiles(projectRoot, ide) {
  const paths = {
    kiro: ['.kiro/steering/gapa.md'],
    cursor: ['.cursor/rules/gapa-rules.mdc'],
    'claude-code': ['CLAUDE.md'],
    vscode: [
      '.github/copilot-instructions.md',
      '.github/instructions/gapa-rules.instructions.md',
    ],
    windsurf: ['.windsurf/rules/gapa-framework.md'],
    trae: ['.trae/rules/gapa-framework.md'],
  }

  return (paths[ide] || [])
    .map((p) => join(projectRoot, p))
    .filter((p) => existsSync(p))
}

describe('Property 4: update 命令保留用户数据', () => {
  const tmpDirs = []

  afterEach(() => {
    for (const d of tmpDirs) {
      rmSync(d, { recursive: true, force: true })
    }
    tmpDirs.length = 0
  })

  it('对于任意 IDE 和任意 memory/preferences 内容，update 后用户数据不变', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SUPPORTED_IDES),
        fc.string({ minLength: 1, maxLength: 500 }),
        fc.string({ minLength: 1, maxLength: 500 }),
        (ide, memoryContent, prefsContent) => {
          const tmpDir = mkdtempSync(join(tmpdir(), 'gapa-update-'))
          tmpDirs.push(tmpDir)

          // Step 1: init
          runGapa(tmpDir, ['init', '--target', ide, '--lang', 'zh'])

          // Step 2: Write custom user data
          const memoryPath = join(tmpDir, '.gapa', 'memory.md')
          const prefsPath = join(tmpDir, '.gapa', 'preferences.md')

          writeFileSync(memoryPath, memoryContent, 'utf-8')
          writeFileSync(prefsPath, prefsContent, 'utf-8')

          // Step 3: Run update
          runGapa(tmpDir, ['update', '--target', ide])

          // Step 4: Verify user data is preserved
          const memoryAfter = readFileSync(memoryPath, 'utf-8')
          const prefsAfter = readFileSync(prefsPath, 'utf-8')

          if (memoryAfter !== memoryContent) {
            throw new Error(
              `memory.md changed after update.\nBefore: ${JSON.stringify(memoryContent)}\nAfter: ${JSON.stringify(memoryAfter)}`
            )
          }

          if (prefsAfter !== prefsContent) {
            throw new Error(
              `preferences.md changed after update.\nBefore: ${JSON.stringify(prefsContent)}\nAfter: ${JSON.stringify(prefsAfter)}`
            )
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})


describe('Property 14: update 保留语言设置', () => {
  const tmpDirs = []

  afterEach(() => {
    for (const d of tmpDirs) {
      rmSync(d, { recursive: true, force: true })
    }
    tmpDirs.length = 0
  })

  it('对于任意语言设置，update 后生成的文件使用 .gaparc.json 中记录的语言', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SUPPORTED_IDES),
        fc.constantFrom(...SUPPORTED_LANGS),
        (ide, lang) => {
          const tmpDir = mkdtempSync(join(tmpdir(), 'gapa-lang-'))
          tmpDirs.push(tmpDir)

          // Step 1: init with specified language
          runGapa(tmpDir, ['init', '--target', ide, '--lang', lang])

          // Step 2: Verify .gaparc.json records the language
          const configPath = join(tmpDir, '.gapa', '.gaparc.json')
          const configBefore = JSON.parse(readFileSync(configPath, 'utf-8'))

          if (configBefore.lang !== lang) {
            throw new Error(
              `Expected .gaparc.json lang="${lang}", got "${configBefore.lang}"`
            )
          }

          // Step 3: Run update (without --lang flag — should use stored lang)
          runGapa(tmpDir, ['update', '--target', ide])

          // Step 4: Verify .gaparc.json still has the same language
          const configAfter = JSON.parse(readFileSync(configPath, 'utf-8'))

          if (configAfter.lang !== lang) {
            throw new Error(
              `After update, .gaparc.json lang changed from "${lang}" to "${configAfter.lang}"`
            )
          }

          // Step 5: Verify generated files use the correct language
          // zh core rules contain "任务评估", en core rules contain "Task Evaluation"
          // For adapters with split files (e.g. vscode), at least one file must contain the marker
          const generatedFiles = getGeneratedSteeringFiles(tmpDir, ide)

          const allContent = generatedFiles
            .map((filePath) => readFileSync(filePath, 'utf-8'))
            .join('\n')

          if (lang === 'zh') {
            if (!allContent.includes('任务评估')) {
              throw new Error(
                `Generated files for ${ide} should contain zh core rules (任务评估) for lang=zh`
              )
            }
          }

          if (lang === 'en') {
            if (!allContent.includes('Task Evaluation')) {
              throw new Error(
                `Generated files for ${ide} should contain en core rules (Task Evaluation) for lang=en`
              )
            }
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
