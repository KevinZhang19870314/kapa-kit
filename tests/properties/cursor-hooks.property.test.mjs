/**
 * Property tests for Cursor adapter hooks implementation.
 *
 * Feature: cursor-support-reimplementation
 *
 * Tests cover:
 * - Property 1: generateHooks file completeness
 * - Property 2: hooks.json structure validity
 * - Property 3: Template placeholder complete replacement
 * - Property 4: generateSteering single MDC file validity
 * - Property 5: stop hook conditional output
 * - Property 6: detect() path detection logic
 * - Property 7: getInstalledFiles structure consistency
 */

import { describe, it, afterEach } from 'vitest'
import fc from 'fast-check'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { loadTemplates } from '../../lib/core/template-engine.mjs'
import CursorAdapter from '../../lib/adapters/cursor-adapter.mjs'

const adapter = new CursorAdapter()

/** Generator for safe gapaDir values (dot-prefixed, alphanumeric with hyphens/underscores) */
const gapaDirArb = fc.constantFrom('.gapa', '.my-gapa', '.test_dir', '.gapa2', '.data', '.g', '.abc-def_123')

/** Generator for lang */
const langArb = fc.constantFrom('zh', 'en')

/** Build a valid GenerateContext */
function makeCtx(lang, gapaDir) {
  const templates = loadTemplates(lang)
  return {
    projectRoot: '/tmp/test',
    lang,
    gapaDir,
    templates,
    isUpdate: false,
  }
}

// ─── Property 1 ───

/**
 * Property 1: generateHooks 文件完整性
 *
 * 对于任意合法 GenerateContext（随机 lang ∈ {zh, en}，随机 gapaDir），
 * generateHooks(ctx) 返回恰好 3 个文件，路径分别为
 * .cursor/hooks.json、.cursor/hooks/gapa-session-start.mjs、.cursor/hooks/gapa-stop.mjs
 *
 * Feature: cursor-support-reimplementation, Property 1: generateHooks file completeness
 *
 * **Validates: Requirements 2.1, 3.1, 4.1, 5.1**
 */
describe('Property 1: generateHooks file completeness', () => {
  it('returns exactly 3 files with correct paths for any valid GenerateContext', () => {
    fc.assert(
      fc.property(langArb, gapaDirArb, (lang, gapaDir) => {
        const ctx = makeCtx(lang, gapaDir)
        const files = adapter.generateHooks(ctx)

        if (!Array.isArray(files) || files.length !== 3) {
          throw new Error(`Expected exactly 3 files, got ${files?.length}`)
        }

        const expectedPaths = [
          '.cursor/hooks.json',
          '.cursor/hooks/gapa-session-start.mjs',
          '.cursor/hooks/gapa-stop.mjs',
        ]

        const actualPaths = files.map((f) => f.relativePath).sort()
        const sortedExpected = [...expectedPaths].sort()

        for (let i = 0; i < sortedExpected.length; i++) {
          if (actualPaths[i] !== sortedExpected[i]) {
            throw new Error(
              `Expected paths ${JSON.stringify(sortedExpected)}, got ${JSON.stringify(actualPaths)}`
            )
          }
        }

        // All hook scripts use .mjs extension
        for (const f of files) {
          if (f.relativePath !== '.cursor/hooks.json' && !f.relativePath.endsWith('.mjs')) {
            throw new Error(`Hook script ${f.relativePath} does not use .mjs extension`)
          }
        }
      }),
      { numRuns: 100 },
    )
  })
})

// ─── Property 2 ───

/**
 * Property 2: hooks.json 结构有效性
 *
 * 对于任意合法 GenerateContext，生成的 hooks.json 解析后满足：
 * version === 1，包含 sessionStart 和 stop 数组，
 * 每个条目包含 command（匹配 node .cursor/hooks/*.mjs）和正数 timeout
 *
 * Feature: cursor-support-reimplementation, Property 2: hooks.json structure validity
 *
 * **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 5.3**
 */
describe('Property 2: hooks.json structure validity', () => {
  it('hooks.json has version 1, sessionStart and stop arrays with valid entries', () => {
    fc.assert(
      fc.property(langArb, gapaDirArb, (lang, gapaDir) => {
        const ctx = makeCtx(lang, gapaDir)
        const files = adapter.generateHooks(ctx)
        const hooksFile = files.find((f) => f.relativePath === '.cursor/hooks.json')

        if (!hooksFile) throw new Error('hooks.json not found in output')

        let parsed
        try {
          parsed = JSON.parse(hooksFile.content)
        } catch (e) {
          throw new Error(`hooks.json is not valid JSON: ${e.message}`)
        }

        if (parsed.version !== 1) {
          throw new Error(`Expected version === 1, got ${parsed.version}`)
        }

        if (!parsed.hooks || typeof parsed.hooks !== 'object') {
          throw new Error('hooks.json missing "hooks" object')
        }

        for (const eventName of ['sessionStart', 'stop']) {
          const entries = parsed.hooks[eventName]
          if (!Array.isArray(entries) || entries.length === 0) {
            throw new Error(`hooks.${eventName} should be a non-empty array`)
          }

          for (const entry of entries) {
            if (typeof entry.command !== 'string') {
              throw new Error(`hooks.${eventName} entry missing command string`)
            }
            // command should match "node .cursor/hooks/*.mjs"
            if (!/^node \.cursor\/hooks\/[\w-]+\.mjs$/.test(entry.command)) {
              throw new Error(
                `hooks.${eventName} command "${entry.command}" does not match expected pattern`
              )
            }
            if (typeof entry.timeout !== 'number' || entry.timeout <= 0) {
              throw new Error(
                `hooks.${eventName} timeout should be a positive number, got ${entry.timeout}`
              )
            }
          }
        }
      }),
      { numRuns: 100 },
    )
  })
})


// ─── Property 3 ───

/**
 * Property 3: 模板占位符完全替换
 *
 * 对于任意合法 GenerateContext（特别是不同 gapaDir 值），
 * generateHooks(ctx) 和 generateSteering(ctx) 所有文件内容中不包含 {{...}} 模式
 *
 * Feature: cursor-support-reimplementation, Property 3: Template placeholder complete replacement
 *
 * **Validates: Requirements 3.3, 4.5, 6.3**
 */
describe('Property 3: Template placeholder complete replacement', () => {
  it('no {{...}} patterns remain in any generated file content', () => {
    fc.assert(
      fc.property(langArb, gapaDirArb, (lang, gapaDir) => {
        const ctx = makeCtx(lang, gapaDir)
        const hookFiles = adapter.generateHooks(ctx)
        const steeringFiles = adapter.generateSteering(ctx)
        const allFiles = [...hookFiles, ...steeringFiles]

        const placeholderPattern = /\{\{[^}]*\}\}/

        for (const file of allFiles) {
          if (placeholderPattern.test(file.content)) {
            const match = file.content.match(placeholderPattern)
            throw new Error(
              `File ${file.relativePath} contains unreplaced placeholder: ${match[0]}`
            )
          }
        }
      }),
      { numRuns: 100 },
    )
  })
})

// ─── Property 4 ───

/**
 * Property 4: generateSteering 单一 MDC 文件有效性
 *
 * 对于任意合法 GenerateContext，generateSteering(ctx) 恰好返回 1 个文件，
 * 路径为 .cursor/rules/gapa-rules.mdc，内容包含 alwaysApply: true
 * 和 GAPA 规则及上下文加载行为指引
 *
 * Feature: cursor-support-reimplementation, Property 4: generateSteering single MDC file validity
 *
 * **Validates: Requirements 6.1, 6.2, 6.4, 6.5**
 */
describe('Property 4: generateSteering single MDC file validity', () => {
  it('returns exactly 1 MDC file with alwaysApply: true and both GAPA rules and context load guidance', () => {
    fc.assert(
      fc.property(langArb, gapaDirArb, (lang, gapaDir) => {
        const ctx = makeCtx(lang, gapaDir)
        const files = adapter.generateSteering(ctx)

        if (!Array.isArray(files) || files.length !== 1) {
          throw new Error(`Expected exactly 1 file, got ${files?.length}`)
        }

        const file = files[0]

        if (file.relativePath !== '.cursor/rules/gapa-rules.mdc') {
          throw new Error(
            `Expected path .cursor/rules/gapa-rules.mdc, got ${file.relativePath}`
          )
        }

        // Must contain alwaysApply: true in front-matter
        if (!file.content.includes('alwaysApply: true')) {
          throw new Error('MDC file missing alwaysApply: true')
        }

        // Must contain GAPA rules content (from gapaRules template)
        // The gapaRules template always contains "GAPA" keyword
        if (!file.content.includes('GAPA')) {
          throw new Error('MDC file missing GAPA rules content')
        }

        // Must contain context load guidance content
        // The contextLoadPrompt template references the gapaDir for memory/skills loading
        if (!file.content.includes(gapaDir)) {
          throw new Error(
            `MDC file missing context load guidance (expected gapaDir "${gapaDir}" reference)`
          )
        }
      }),
      { numRuns: 100 },
    )
  })
})

// ─── Property 5 ───

/**
 * Property 5: stop hook 条件输出
 *
 * 对于任意 status 字符串，stop hook 脚本在 status === "completed" 时
 * 输出包含 followup_message 的 JSON，其他值时输出 {}
 *
 * Feature: cursor-support-reimplementation, Property 5: stop hook conditional output
 *
 * **Validates: Requirements 4.3, 4.4**
 */
describe('Property 5: stop hook conditional output', () => {
  /** Collect temp dirs for cleanup */
  const tmpDirs = []

  afterEach(() => {
    for (const d of tmpDirs) {
      rmSync(d, { recursive: true, force: true })
    }
    tmpDirs.length = 0
  })

  it('outputs followup_message when status is "completed", empty object otherwise', () => {
    // Generate the stop hook script once (content is the same for any valid ctx)
    const ctx = makeCtx('en', '.gapa')
    const files = adapter.generateHooks(ctx)
    const stopFile = files.find((f) => f.relativePath === '.cursor/hooks/gapa-stop.mjs')

    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('completed'),
          fc.constant('aborted'),
          fc.constant('error'),
          fc.string({ minLength: 0, maxLength: 20 }).filter((s) => !s.includes('"') && !s.includes('\\'))
        ),
        (status) => {
          const tmpDir = mkdtempSync(join(tmpdir(), 'gapa-stop-test-'))
          tmpDirs.push(tmpDir)

          const scriptPath = join(tmpDir, 'stop-hook.mjs')
          writeFileSync(scriptPath, stopFile.content, 'utf-8')

          const stdinInput = JSON.stringify({ status })
          let stdout
          try {
            stdout = execSync(`node "${scriptPath}"`, {
              input: stdinInput,
              encoding: 'utf-8',
              timeout: 5000,
            })
          } catch (e) {
            throw new Error(`Stop hook script failed: ${e.message}`)
          }

          let parsed
          try {
            parsed = JSON.parse(stdout)
          } catch (e) {
            throw new Error(`Stop hook output is not valid JSON: ${stdout}`)
          }

          if (status === 'completed') {
            if (typeof parsed.followup_message !== 'string' || !parsed.followup_message) {
              throw new Error(
                `Expected followup_message for status="completed", got ${JSON.stringify(parsed)}`
              )
            }
          } else {
            const keys = Object.keys(parsed)
            if (keys.length !== 0) {
              throw new Error(
                `Expected empty object for status="${status}", got ${JSON.stringify(parsed)}`
              )
            }
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})


// ─── Property 6 ───

/**
 * Property 6: detect() 路径检测逻辑
 *
 * 对于任意项目根目录，.cursor/rules/ 或 .cursor/hooks.json 任一存在时
 * detect() 返回 true，两者都不存在时返回 false
 *
 * Feature: cursor-support-reimplementation, Property 6: detect() path detection logic
 *
 * **Validates: Requirements 7.1**
 */
describe('Property 6: detect() path detection logic', () => {
  const tmpDirs = []

  afterEach(() => {
    for (const d of tmpDirs) {
      rmSync(d, { recursive: true, force: true })
    }
    tmpDirs.length = 0
  })

  it('returns true when .cursor/rules/ or .cursor/hooks.json exists, false when both absent', () => {
    fc.assert(
      fc.property(
        fc.record({ hasRules: fc.boolean(), hasHooksJson: fc.boolean() }),
        ({ hasRules, hasHooksJson }) => {
          const tmpDir = mkdtempSync(join(tmpdir(), 'gapa-detect-cursor-'))
          tmpDirs.push(tmpDir)

          if (hasRules) {
            mkdirSync(join(tmpDir, '.cursor', 'rules'), { recursive: true })
          }
          if (hasHooksJson) {
            mkdirSync(join(tmpDir, '.cursor'), { recursive: true })
            writeFileSync(join(tmpDir, '.cursor', 'hooks.json'), '{}', 'utf-8')
          }

          const result = adapter.detect(tmpDir)
          const expected = hasRules || hasHooksJson

          if (result !== expected) {
            throw new Error(
              `detect() returned ${result}, expected ${expected} (hasRules=${hasRules}, hasHooksJson=${hasHooksJson})`
            )
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ─── Property 7 ───

/**
 * Property 7: getInstalledFiles 结构一致性
 *
 * 对于任意项目根目录，getInstalledFiles() 返回的每个条目包含
 * relativePath（字符串）、exists（布尔值）、label（非空字符串），
 * 且 exists 与文件系统实际状态一致
 *
 * Feature: cursor-support-reimplementation, Property 7: getInstalledFiles structure consistency
 *
 * **Validates: Requirements 7.3**
 */
describe('Property 7: getInstalledFiles structure consistency', () => {
  const tmpDirs = []

  afterEach(() => {
    for (const d of tmpDirs) {
      rmSync(d, { recursive: true, force: true })
    }
    tmpDirs.length = 0
  })

  it('each entry has relativePath (string), exists (boolean), label (non-empty string), and exists matches filesystem', () => {
    // Generator: randomly create some of the 4 expected files
    const filePresenceArb = fc.record({
      hasRulesMdc: fc.boolean(),
      hasHooksJson: fc.boolean(),
      hasSessionStart: fc.boolean(),
      hasStopHook: fc.boolean(),
    })

    fc.assert(
      fc.property(filePresenceArb, ({ hasRulesMdc, hasHooksJson, hasSessionStart, hasStopHook }) => {
        const tmpDir = mkdtempSync(join(tmpdir(), 'gapa-installed-'))
        tmpDirs.push(tmpDir)

        const filesToCreate = []
        if (hasRulesMdc) filesToCreate.push('.cursor/rules/gapa-rules.mdc')
        if (hasHooksJson) filesToCreate.push('.cursor/hooks.json')
        if (hasSessionStart) filesToCreate.push('.cursor/hooks/gapa-session-start.mjs')
        if (hasStopHook) filesToCreate.push('.cursor/hooks/gapa-stop.mjs')

        for (const relPath of filesToCreate) {
          const fullPath = join(tmpDir, relPath)
          const parentDir = join(fullPath, '..')
          mkdirSync(parentDir, { recursive: true })
          writeFileSync(fullPath, 'test', 'utf-8')
        }

        const entries = adapter.getInstalledFiles(tmpDir)

        if (!Array.isArray(entries) || entries.length === 0) {
          throw new Error('getInstalledFiles() should return a non-empty array')
        }

        for (const entry of entries) {
          // relativePath must be a string
          if (typeof entry.relativePath !== 'string' || !entry.relativePath) {
            throw new Error(`Entry missing or invalid relativePath: ${JSON.stringify(entry)}`)
          }

          // exists must be a boolean
          if (typeof entry.exists !== 'boolean') {
            throw new Error(
              `Entry ${entry.relativePath} "exists" should be boolean, got ${typeof entry.exists}`
            )
          }

          // label must be a non-empty string
          if (typeof entry.label !== 'string' || !entry.label) {
            throw new Error(
              `Entry ${entry.relativePath} missing or empty "label"`
            )
          }

          // exists should match actual filesystem state
          const actuallyExists = filesToCreate.includes(entry.relativePath)
          if (entry.exists !== actuallyExists) {
            throw new Error(
              `Entry ${entry.relativePath}: exists=${entry.exists}, but filesystem says ${actuallyExists}`
            )
          }
        }
      }),
      { numRuns: 100 },
    )
  })
})
