/**
 * Unit tests for lib/adapters/cursor-adapter.mjs
 *
 * Validates: Requirements 4.1, 4.2, 4.3
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
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

  it('formatVersion is "1.0"', () => {
    expect(adapter.formatVersion).toBe('1.0')
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
  it('returns 1 file', () => {
    const files = adapter.generateSteering(makeCtx())
    expect(files).toHaveLength(1)
  })

  it('generates correct file path (.cursor/rules/gapa-framework.mdc)', () => {
    const files = adapter.generateSteering(makeCtx())
    expect(files[0].relativePath).toBe('.cursor/rules/gapa-framework.mdc')
  })

  it('file has overwrite writeStrategy', () => {
    const files = adapter.generateSteering(makeCtx())
    expect(files[0].writeStrategy).toBe('overwrite')
  })

  it('contains MDC front-matter with alwaysApply: true', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    // MDC front-matter starts with ---
    expect(content).toMatch(/^---\s*\n/)
    expect(content).toContain('alwaysApply: true')
  })

  it('contains MDC front-matter with description field', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    expect(content).toMatch(/description:\s*".*"/)
  })

  it('contains GAPA rules content', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    // The GAPA rules should be injected — check for the heading
    expect(content).toContain('# GAPA Framework')
  })

  it('contains fallback steering with context-load prompt', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    // Should contain the context-load prompt content
    expect(content).toContain('.gapa/memory.md')
    expect(content).toContain('.gapa/skills/')
  })

  it('contains fallback steering with evaluation prompt', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    // Should contain the evaluation prompt content
    expect(content).toContain('.gapa/gapa-rules.md')
    expect(content).toContain('.gapa/preferences.md')
  })

  it('contains section headers for fallback steering', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    expect(content).toContain('### 任务开始前')
    expect(content).toContain('### 任务完成后')
  })

  it('works with en language', () => {
    const files = adapter.generateSteering(makeCtx('en'))
    expect(files).toHaveLength(1)
    const content = files[0].content
    expect(content).toContain('alwaysApply: true')
    expect(content).toContain('.gapa/')
  })

  it('no unreplaced template placeholders remain', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    // Should not contain any {{...}} placeholders
    expect(content).not.toMatch(/\{\{\s*gapaDir\s*\}\}/)
    expect(content).not.toMatch(/\{\{\s*configDir\s*\}\}/)
  })
})

// ─── generateFallbackSteering ───

describe('CursorAdapter.generateFallbackSteering()', () => {
  it('returns same output as generateSteering', () => {
    const ctx = makeCtx()
    const steeringFiles = adapter.generateSteering(ctx)
    const fallbackFiles = adapter.generateFallbackSteering(ctx)
    expect(fallbackFiles).toHaveLength(steeringFiles.length)
    expect(fallbackFiles[0].relativePath).toBe(steeringFiles[0].relativePath)
    expect(fallbackFiles[0].content).toBe(steeringFiles[0].content)
  })

  it('fallback contains context-load and evaluation prompts', () => {
    const files = adapter.generateFallbackSteering(makeCtx())
    const content = files[0].content
    // Context-load prompt references
    expect(content).toContain('memory.md')
    expect(content).toContain('skills/')
    // Evaluation prompt references
    expect(content).toContain('gapa-rules.md')
    expect(content).toContain('preferences.md')
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

  it('returns expected file list', () => {
    const files = adapter.getInstalledFiles(tmpDir)
    const paths = files.map((f) => f.relativePath)
    expect(paths).toContain('.cursor/rules/gapa-framework.mdc')
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
