/**
 * Unit tests for lib/adapters/cursor-adapter.mjs
 *
 * Validates: Requirements 4.1, 4.2, 4.3
 * v2.0: split into multiple MDC files
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadTemplates } from '../../lib/core/template-engine.mjs'
import CursorAdapter from '../../lib/adapters/cursor-adapter.mjs'

const adapter = new CursorAdapter()

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

  it('formatVersion is "2.0"', () => {
    expect(adapter.formatVersion).toBe('2.0')
  })

  it('configDir is ".cursor"', () => {
    expect(adapter.configDir).toBe('.cursor')
  })

  it('supportsHooks is false', () => {
    expect(adapter.supportsHooks).toBe(false)
  })
})

// ─── generateSteering ───

describe('CursorAdapter.generateSteering()', () => {
  it('returns 3 files', () => {
    const files = adapter.generateSteering(makeCtx())
    expect(files).toHaveLength(3)
  })

  it('generates gapa-rules.mdc', () => {
    const files = adapter.generateSteering(makeCtx())
    const f = files.find(f => f.relativePath === '.cursor/rules/gapa-rules.mdc')
    expect(f).toBeDefined()
  })

  it('generates gapa-context-load.mdc', () => {
    const files = adapter.generateSteering(makeCtx())
    const f = files.find(f => f.relativePath === '.cursor/rules/gapa-context-load.mdc')
    expect(f).toBeDefined()
  })

  it('generates gapa-evaluation.mdc', () => {
    const files = adapter.generateSteering(makeCtx())
    const f = files.find(f => f.relativePath === '.cursor/rules/gapa-evaluation.mdc')
    expect(f).toBeDefined()
  })

  it('all files have overwrite writeStrategy', () => {
    const files = adapter.generateSteering(makeCtx())
    for (const file of files) {
      expect(file.writeStrategy).toBe('overwrite')
    }
  })

  it('all files contain MDC front-matter with alwaysApply: true', () => {
    const files = adapter.generateSteering(makeCtx())
    for (const file of files) {
      expect(file.content).toMatch(/^---\s*\r?\n/)
      expect(file.content).toContain('alwaysApply: true')
    }
  })

  it('all files contain description field', () => {
    const files = adapter.generateSteering(makeCtx())
    for (const file of files) {
      expect(file.content).toMatch(/description:\s*".*"/)
    }
  })

  it('gapa-rules.mdc contains full GAPA rules', () => {
    const files = adapter.generateSteering(makeCtx())
    const f = files.find(f => f.relativePath.includes('gapa-rules.mdc'))
    expect(f.content).toContain('.gapa/memory.md')
    expect(f.content).toContain('.gapa/skills/')
    expect(f.content).toContain('.gapa/preferences.md')
  })

  it('gapa-context-load.mdc contains context-load prompt', () => {
    const files = adapter.generateSteering(makeCtx())
    const f = files.find(f => f.relativePath.includes('gapa-context-load.mdc'))
    expect(f.content).toContain('.gapa/memory.md')
    expect(f.content).toContain('.gapa/skills/')
  })

  it('gapa-evaluation.mdc contains evaluation prompt', () => {
    const files = adapter.generateSteering(makeCtx())
    const f = files.find(f => f.relativePath.includes('gapa-evaluation.mdc'))
    expect(f.content).toContain('.gapa/gapa-rules.md')
    expect(f.content).toContain('.gapa/memory.md')
    expect(f.content).toContain('.gapa/preferences.md')
  })

  it('works with en language', () => {
    const files = adapter.generateSteering(makeCtx('en'))
    expect(files).toHaveLength(3)
    for (const file of files) {
      expect(file.content).toContain('alwaysApply: true')
      expect(file.content).toContain('.gapa/')
    }
  })

  it('no unreplaced template placeholders remain', () => {
    const files = adapter.generateSteering(makeCtx())
    for (const file of files) {
      expect(file.content).not.toMatch(/\{\{\s*gapaDir\s*\}\}/)
      expect(file.content).not.toMatch(/\{\{\s*configDir\s*\}\}/)
    }
  })
})

// ─── generateFallbackSteering ───

describe('CursorAdapter.generateFallbackSteering()', () => {
  it('returns same output as generateSteering', () => {
    const ctx = makeCtx()
    const steeringFiles = adapter.generateSteering(ctx)
    const fallbackFiles = adapter.generateFallbackSteering(ctx)
    expect(fallbackFiles).toHaveLength(steeringFiles.length)
    for (let i = 0; i < steeringFiles.length; i++) {
      expect(fallbackFiles[i].relativePath).toBe(steeringFiles[i].relativePath)
      expect(fallbackFiles[i].content).toBe(steeringFiles[i].content)
    }
  })

  it('fallback contains context-load and evaluation prompts', () => {
    const files = adapter.generateFallbackSteering(makeCtx())
    const allContent = files.map(f => f.content).join('\n')
    expect(allContent).toContain('memory.md')
    expect(allContent).toContain('skills/')
    expect(allContent).toContain('gapa-rules.md')
    expect(allContent).toContain('preferences.md')
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

  it('returns false when .cursor exists but .cursor/rules/ does not', () => {
    mkdirSync(join(tmpDir, '.cursor'), { recursive: true })
    expect(adapter.detect(tmpDir)).toBe(false)
    rmSync(join(tmpDir, '.cursor'), { recursive: true, force: true })
  })

  it('returns true when .cursor/rules/ exists', () => {
    mkdirSync(join(tmpDir, '.cursor', 'rules'), { recursive: true })
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

  it('returns 3 files in the list', () => {
    const files = adapter.getInstalledFiles(tmpDir)
    expect(files).toHaveLength(3)
  })

  it('includes all expected file paths', () => {
    const files = adapter.getInstalledFiles(tmpDir)
    const paths = files.map(f => f.relativePath)
    expect(paths).toContain('.cursor/rules/gapa-rules.mdc')
    expect(paths).toContain('.cursor/rules/gapa-context-load.mdc')
    expect(paths).toContain('.cursor/rules/gapa-evaluation.mdc')
  })

  it('each file has exists and label properties', () => {
    const files = adapter.getInstalledFiles(tmpDir)
    for (const file of files) {
      expect(file).toHaveProperty('exists')
      expect(typeof file.exists).toBe('boolean')
      expect(file).toHaveProperty('label')
      expect(typeof file.label).toBe('string')
    }
  })

  it('reports files as not existing in empty directory', () => {
    const files = adapter.getInstalledFiles(tmpDir)
    for (const file of files) {
      expect(file.exists).toBe(false)
    }
  })
})
