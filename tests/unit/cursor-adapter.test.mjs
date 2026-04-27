/**
 * Unit tests for lib/adapters/cursor-adapter.mjs
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10
 * v3.0: hooks-based architecture (sessionStart + stop + MDC rules)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadTemplates } from '../../lib/core/template-engine.mjs'
import CursorAdapter from '../../lib/adapters/cursor-adapter.mjs'

const adapter = new CursorAdapter()

/** Helper: create a GenerateContext for the given lang */
function makeCtx(lang = 'zh') {
  return {
    projectRoot: '/tmp/test',
    lang,
    gapaDir: '.gapa',
    templates: loadTemplates(lang),
    isUpdate: false,
  }
}

// ─── Adapter metadata ───

describe('CursorAdapter metadata', () => {
  it('name is "cursor"', () => {
    expect(adapter.name).toBe('cursor')
  })

  it('supportsHooks returns true', () => {
    expect(adapter.supportsHooks).toBe(true)
  })

  it('formatVersion is "3.0"', () => {
    expect(adapter.formatVersion).toBe('3.0')
  })

  it('configDir is ".cursor"', () => {
    expect(adapter.configDir).toBe('.cursor')
  })
})

// ─── generateFallbackSteering throws ───

describe('CursorAdapter.generateFallbackSteering()', () => {
  it('throws an error because supportsHooks is true', () => {
    expect(() => adapter.generateFallbackSteering(makeCtx())).toThrow()
  })
})


// ─── generateSteering ───

describe('CursorAdapter.generateSteering()', () => {
  it('returns exactly 1 file', () => {
    const files = adapter.generateSteering(makeCtx())
    expect(files).toHaveLength(1)
  })

  it('generates gapa-rules.mdc at the correct path', () => {
    const files = adapter.generateSteering(makeCtx())
    expect(files[0].relativePath).toBe('.cursor/rules/gapa-rules.mdc')
  })

  it('MDC file contains alwaysApply: true in front-matter', () => {
    const files = adapter.generateSteering(makeCtx())
    expect(files[0].content).toMatch(/^---\s*\r?\n/)
    expect(files[0].content).toContain('alwaysApply: true')
  })

  it('MDC file contains GAPA rules content', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    expect(content).toContain('.gapa/memory.md')
    expect(content).toContain('.gapa/skills/')
    expect(content).toContain('.gapa/preferences.md')
  })

  it('MDC file contains context load behavior guidance', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    // contextLoadPrompt references memory and skills
    expect(content).toContain('.gapa/memory.md')
    expect(content).toContain('.gapa/skills/')
  })

  it('MDC file has overwrite writeStrategy', () => {
    const files = adapter.generateSteering(makeCtx())
    expect(files[0].writeStrategy).toBe('overwrite')
  })

  it('no unreplaced template placeholders remain', () => {
    const files = adapter.generateSteering(makeCtx())
    for (const file of files) {
      expect(file.content).not.toMatch(/\{\{.*?\}\}/)
    }
  })

  it('lang="en" generates English version content', () => {
    const files = adapter.generateSteering(makeCtx('en'))
    expect(files).toHaveLength(1)
    expect(files[0].content).toContain('alwaysApply: true')
    // English description in front-matter
    expect(files[0].content).toContain('GAPA Self-Learning System')
  })
})

// ─── generateHooks ───

describe('CursorAdapter.generateHooks()', () => {
  it('returns exactly 3 files', () => {
    const files = adapter.generateHooks(makeCtx())
    expect(files).toHaveLength(3)
  })

  it('generates correct file paths', () => {
    const files = adapter.generateHooks(makeCtx())
    const paths = files.map((f) => f.relativePath)
    expect(paths).toContain('.cursor/hooks.json')
    expect(paths).toContain('.cursor/hooks/gapa-session-start.mjs')
    expect(paths).toContain('.cursor/hooks/gapa-stop.mjs')
  })

  it('all files have overwrite writeStrategy', () => {
    const files = adapter.generateHooks(makeCtx())
    for (const file of files) {
      expect(file.writeStrategy).toBe('overwrite')
    }
  })

  // ── hooks.json structure ──

  it('hooks.json is valid JSON', () => {
    const files = adapter.generateHooks(makeCtx())
    const hooksFile = files.find((f) => f.relativePath === '.cursor/hooks.json')
    expect(() => JSON.parse(hooksFile.content)).not.toThrow()
  })

  it('hooks.json has version=1', () => {
    const files = adapter.generateHooks(makeCtx())
    const parsed = JSON.parse(
      files.find((f) => f.relativePath === '.cursor/hooks.json').content
    )
    expect(parsed.version).toBe(1)
  })

  it('hooks.json contains sessionStart and stop events', () => {
    const files = adapter.generateHooks(makeCtx())
    const parsed = JSON.parse(
      files.find((f) => f.relativePath === '.cursor/hooks.json').content
    )
    expect(parsed.hooks).toHaveProperty('sessionStart')
    expect(parsed.hooks).toHaveProperty('stop')
    expect(parsed.hooks.sessionStart).toBeInstanceOf(Array)
    expect(parsed.hooks.stop).toBeInstanceOf(Array)
    expect(parsed.hooks.sessionStart.length).toBeGreaterThan(0)
    expect(parsed.hooks.stop.length).toBeGreaterThan(0)
  })

  it('hooks.json entries have command and timeout fields', () => {
    const files = adapter.generateHooks(makeCtx())
    const parsed = JSON.parse(
      files.find((f) => f.relativePath === '.cursor/hooks.json').content
    )
    for (const entry of [...parsed.hooks.sessionStart, ...parsed.hooks.stop]) {
      expect(entry).toHaveProperty('command')
      expect(typeof entry.command).toBe('string')
      expect(entry.command).toMatch(/^node \.cursor\/hooks\/.*\.mjs$/)
      expect(entry).toHaveProperty('timeout')
      expect(entry.timeout).toBeGreaterThan(0)
    }
  })

  // ── sessionStart hook script ──

  it('sessionStart script output contains additional_context JSON', () => {
    const files = adapter.generateHooks(makeCtx())
    const script = files.find((f) =>
      f.relativePath.includes('gapa-session-start.mjs')
    )
    expect(script.content).toContain('additional_context')
    expect(script.content).toContain('JSON.stringify')
  })

  // ── stop hook script ──

  it('stop script outputs followup_message when status="completed"', () => {
    const files = adapter.generateHooks(makeCtx())
    const script = files.find((f) =>
      f.relativePath.includes('gapa-stop.mjs')
    )
    expect(script.content).toContain('followup_message')
    expect(script.content).toContain("data.status === 'completed'")
  })

  it('stop script outputs empty JSON object for non-completed status', () => {
    const files = adapter.generateHooks(makeCtx())
    const script = files.find((f) =>
      f.relativePath.includes('gapa-stop.mjs')
    )
    // The script has a branch that outputs {} for non-completed
    expect(script.content).toContain('JSON.stringify({})')
  })

  // ── No unreplaced placeholders ──

  it('no unreplaced template placeholders in any hook file', () => {
    const files = adapter.generateHooks(makeCtx())
    for (const file of files) {
      expect(file.content).not.toMatch(/\{\{.*?\}\}/)
    }
  })

  // ── Hook script constraints ──

  it('hook scripts do not depend on third-party packages', () => {
    const files = adapter.generateHooks(makeCtx())
    const scripts = files.filter((f) => f.relativePath.endsWith('.mjs'))
    for (const script of scripts) {
      expect(script.content).not.toMatch(/\brequire\s*\(/)
      // Only allow built-in imports (node:*) or no imports at all
      const importMatches = script.content.match(/\bimport\b.*from\s+['"]([^'"]+)['"]/g)
      if (importMatches) {
        for (const m of importMatches) {
          expect(m).toMatch(/from\s+['"]node:/)
        }
      }
    }
  })

  it('hook scripts contain process.exit(0)', () => {
    const files = adapter.generateHooks(makeCtx())
    const scripts = files.filter((f) => f.relativePath.endsWith('.mjs'))
    for (const script of scripts) {
      expect(script.content).toContain('process.exit(0)')
    }
  })

  it('lang="en" generates English hook content', () => {
    const files = adapter.generateHooks(makeCtx('en'))
    expect(files).toHaveLength(3)
    // No unreplaced placeholders in English version either
    for (const file of files) {
      expect(file.content).not.toMatch(/\{\{.*?\}\}/)
    }
  })
})


// ─── detect ───

describe('CursorAdapter.detect()', () => {
  let tmpDir

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cursor-adapter-test-'))
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns false when no .cursor directory exists', () => {
    expect(adapter.detect(tmpDir)).toBe(false)
  })

  it('returns false when .cursor exists but no rules/ or hooks.json', () => {
    mkdirSync(join(tmpDir, '.cursor'), { recursive: true })
    expect(adapter.detect(tmpDir)).toBe(false)
    rmSync(join(tmpDir, '.cursor'), { recursive: true, force: true })
  })

  it('returns true when .cursor/rules/ exists', () => {
    mkdirSync(join(tmpDir, '.cursor', 'rules'), { recursive: true })
    expect(adapter.detect(tmpDir)).toBe(true)
    rmSync(join(tmpDir, '.cursor'), { recursive: true, force: true })
  })

  it('returns true when .cursor/hooks.json exists', () => {
    mkdirSync(join(tmpDir, '.cursor'), { recursive: true })
    writeFileSync(join(tmpDir, '.cursor', 'hooks.json'), '{}', 'utf-8')
    expect(adapter.detect(tmpDir)).toBe(true)
    rmSync(join(tmpDir, '.cursor'), { recursive: true, force: true })
  })
})

// ─── getInstalledFiles ───

describe('CursorAdapter.getInstalledFiles()', () => {
  let tmpDir

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cursor-installed-test-'))
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns 4 file entries', () => {
    const files = adapter.getInstalledFiles(tmpDir)
    expect(files).toHaveLength(4)
  })

  it('includes all expected file paths', () => {
    const files = adapter.getInstalledFiles(tmpDir)
    const paths = files.map((f) => f.relativePath)
    expect(paths).toContain('.cursor/rules/gapa-rules.mdc')
    expect(paths).toContain('.cursor/hooks.json')
    expect(paths).toContain('.cursor/hooks/gapa-session-start.mjs')
    expect(paths).toContain('.cursor/hooks/gapa-stop.mjs')
  })

  it('each file has exists and label properties', () => {
    const files = adapter.getInstalledFiles(tmpDir)
    for (const file of files) {
      expect(file).toHaveProperty('exists')
      expect(typeof file.exists).toBe('boolean')
      expect(file).toHaveProperty('label')
      expect(typeof file.label).toBe('string')
      expect(file.label.length).toBeGreaterThan(0)
    }
  })

  it('reports files as not existing in empty directory', () => {
    const files = adapter.getInstalledFiles(tmpDir)
    for (const file of files) {
      expect(file.exists).toBe(false)
    }
  })
})
