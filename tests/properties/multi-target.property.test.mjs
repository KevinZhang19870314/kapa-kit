/**
 * Property 5: 多目标安装的文件生成
 *
 * 对于任意支持的 IDE 名称非空子集，gapa init --target <ide1> --target <ide2> ...
 * 应为每个指定的 IDE 生成对应的 steering/rules 文件，且共享的 .gapa/ 目录文件仅生成一份。
 *
 * Feature: cross-ide-gapa-kit, Property 5: 多目标安装的文件生成
 *
 * **Validates: Requirements 2.5**
 */

import { describe, it, afterEach } from 'vitest'
import fc from 'fast-check'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const GAPA_BIN = resolve(__dirname, '..', '..', 'bin', 'gapa.mjs')
const NODE = process.execPath

const SUPPORTED_IDES = ['kiro', 'cursor', 'claude-code', 'vscode', 'windsurf', 'trae']

/**
 * Expected steering/rules files per IDE (at least one must exist).
 */
const IDE_EXPECTED_FILES = {
  kiro: ['.kiro/steering/gapa.md', '.kiro/steering/gapa-preferences.md'],
  cursor: ['.cursor/rules/gapa-framework.mdc'],
  'claude-code': ['CLAUDE.md'],
  vscode: ['.github/copilot-instructions.md'],
  windsurf: ['.windsurf/rules/gapa-framework.md'],
  trae: ['.trae/rules/gapa-framework.md', '.trae/skills/gapa/SKILL.md'],
}

/**
 * Shared .gapa/ files that should exist exactly once.
 */
const SHARED_GAPA_FILES = [
  '.gapa/memory.md',
  '.gapa/preferences.md',
  '.gapa/skills/_example.md',
  '.gapa/.gaparc.json',
  '.gapa/.gitignore',
]

function runGapa(cwd, args) {
  return execFileSync(NODE, [GAPA_BIN, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 30000,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  })
}

describe('Property 5: 多目标安装的文件生成', () => {
  const tmpDirs = []

  afterEach(() => {
    for (const d of tmpDirs) {
      rmSync(d, { recursive: true, force: true })
    }
    tmpDirs.length = 0
  })

  it('对于任意 IDE 非空子集，init 为每个 IDE 生成文件且 .gapa/ 仅一份', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom(...SUPPORTED_IDES), {
          minLength: 1,
          maxLength: SUPPORTED_IDES.length,
        }),
        (selectedIDEs) => {
          const tmpDir = mkdtempSync(join(tmpdir(), 'gapa-multi-'))
          tmpDirs.push(tmpDir)

          // Build CLI args: init --target ide1 --target ide2 ...
          const args = ['init', '--lang', 'zh']
          for (const ide of selectedIDEs) {
            args.push('--target', ide)
          }

          runGapa(tmpDir, args)

          // Verify: each selected IDE has its steering/rules files
          for (const ide of selectedIDEs) {
            const expectedFiles = IDE_EXPECTED_FILES[ide]
            const anyExists = expectedFiles.some((f) =>
              existsSync(join(tmpDir, f))
            )

            if (!anyExists) {
              throw new Error(
                `IDE "${ide}" was targeted but none of its expected files exist: [${expectedFiles.join(', ')}]`
              )
            }
          }

          // Verify: IDEs NOT selected should NOT have their files
          for (const ide of SUPPORTED_IDES) {
            if (selectedIDEs.includes(ide)) continue

            const unexpectedFiles = IDE_EXPECTED_FILES[ide]
            for (const f of unexpectedFiles) {
              // Skip CLAUDE.md check — it could be created by other means
              // Actually, if not selected, it should not exist
              if (existsSync(join(tmpDir, f))) {
                throw new Error(
                  `IDE "${ide}" was NOT targeted but file "${f}" exists`
                )
              }
            }
          }

          // Verify: shared .gapa/ files exist exactly once
          for (const sharedFile of SHARED_GAPA_FILES) {
            if (!existsSync(join(tmpDir, sharedFile))) {
              throw new Error(
                `Shared file "${sharedFile}" should exist but doesn't`
              )
            }
          }

          // Verify: .gaparc.json records all selected IDEs
          const config = JSON.parse(
            readFileSync(join(tmpDir, '.gapa', '.gaparc.json'), 'utf-8')
          )
          const installedNames = Object.keys(config.installedAdapters || {}).sort()
          const expectedNames = [...selectedIDEs].sort()

          if (installedNames.length !== expectedNames.length) {
            throw new Error(
              `Expected ${expectedNames.length} adapters in .gaparc.json, got ${installedNames.length}.\nExpected: [${expectedNames}]\nGot: [${installedNames}]`
            )
          }

          for (let i = 0; i < expectedNames.length; i++) {
            if (installedNames[i] !== expectedNames[i]) {
              throw new Error(
                `Adapter mismatch in .gaparc.json.\nExpected: [${expectedNames}]\nGot: [${installedNames}]`
              )
            }
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
