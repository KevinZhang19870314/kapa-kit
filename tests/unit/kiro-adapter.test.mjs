/**
 * Unit tests for lib/adapters/kiro-adapter.mjs
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadTemplates } from '../../lib/core/template-engine.mjs'
import KiroAdapter from '../../lib/adapters/kiro-adapter.mjs'

const adapter = new KiroAdapter()

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

describe('KiroAdapter metadata', () => {
  it('name is "kiro"', () => {
    expect(adapter.name).toBe('kiro')
  })

  it('formatVersion is "1.0"', () => {
    expect(adapter.formatVersion).toBe('1.0')
  })

  it('configDir is ".kiro"', () => {
    expect(adapter.configDir).toBe('.kiro')
  })

  it('supportsHooks is true', () => {
    expect(adapter.supportsHooks).toBe(true)
  })
})

// ─── generateSteering ───

describe('KiroAdapter.generateSteering()', () => {
  it('returns 2 files', () => {
    const files = adapter.generateSteering(makeCtx())
    expect(files).toHaveLength(2)
  })

  it('generates correct file paths', () => {
    const files = adapter.generateSteering(makeCtx())
    const paths = files.map((f) => f.relativePath)
    expect(paths).toContain('.kiro/steering/gapa.md')
    expect(paths).toContain('.kiro/steering/gapa-preferences.md')
  })

  it('gapa.md contains "inclusion: manual" in front-matter', () => {
    const files = adapter.generateSteering(makeCtx())
    const gapaFile = files.find((f) => f.relativePath === '.kiro/steering/gapa.md')
    expect(gapaFile).toBeDefined()
    expect(gapaFile.content).toMatch(/^---\s*\n/)
    expect(gapaFile.content).toContain('inclusion: manual')
  })

  it('gapa-preferences.md contains "inclusion: auto" in front-matter', () => {
    const files = adapter.generateSteering(makeCtx())
    const prefsFile = files.find(
      (f) => f.relativePath === '.kiro/steering/gapa-preferences.md'
    )
    expect(prefsFile).toBeDefined()
    expect(prefsFile.content).toMatch(/^---\s*\n/)
    expect(prefsFile.content).toContain('inclusion: auto')
  })

  it('gapa-preferences.md references .gapa/preferences.md', () => {
    const files = adapter.generateSteering(makeCtx())
    const prefsFile = files.find(
      (f) => f.relativePath === '.kiro/steering/gapa-preferences.md'
    )
    expect(prefsFile.content).toContain('.gapa/preferences.md')
  })

  it('works with en language', () => {
    const files = adapter.generateSteering(makeCtx('en'))
    expect(files).toHaveLength(2)
    const prefsFile = files.find(
      (f) => f.relativePath === '.kiro/steering/gapa-preferences.md'
    )
    expect(prefsFile.content).toContain('inclusion: auto')
    expect(prefsFile.content).toContain('.gapa/preferences.md')
  })
})

// ─── generateHooks ───

describe('KiroAdapter.generateHooks()', () => {
  it('returns 2 files', () => {
    const files = adapter.generateHooks(makeCtx())
    expect(files).toHaveLength(2)
  })

  it('generates correct file paths', () => {
    const files = adapter.generateHooks(makeCtx())
    const paths = files.map((f) => f.relativePath)
    expect(paths).toContain('.kiro/hooks/gapa-context-load.kiro.hook')
    expect(paths).toContain('.kiro/hooks/gapa-evaluation.kiro.hook')
  })

  it('hook files are valid JSON', () => {
    const files = adapter.generateHooks(makeCtx())
    for (const file of files) {
      expect(() => JSON.parse(file.content)).not.toThrow()
    }
  })

  it('hook JSON contains all required fields', () => {
    const files = adapter.generateHooks(makeCtx())
    for (const file of files) {
      const parsed = JSON.parse(file.content)
      expect(parsed).toHaveProperty('enabled', true)
      expect(parsed).toHaveProperty('name')
      expect(parsed).toHaveProperty('description')
      expect(parsed).toHaveProperty('version')
      expect(parsed).toHaveProperty('when.type')
      expect(parsed).toHaveProperty('then.type', 'askAgent')
      expect(parsed).toHaveProperty('then.prompt')
      expect(typeof parsed.then.prompt).toBe('string')
      expect(parsed.then.prompt.length).toBeGreaterThan(0)
    }
  })

  it('context-load hook uses promptSubmit trigger', () => {
    const files = adapter.generateHooks(makeCtx())
    const ctxHook = files.find((f) =>
      f.relativePath.includes('context-load')
    )
    const parsed = JSON.parse(ctxHook.content)
    expect(parsed.when.type).toBe('promptSubmit')
  })

  it('evaluation hook uses agentStop trigger', () => {
    const files = adapter.generateHooks(makeCtx())
    const evalHook = files.find((f) =>
      f.relativePath.includes('evaluation')
    )
    const parsed = JSON.parse(evalHook.content)
    expect(parsed.when.type).toBe('agentStop')
  })

  it('works with en language', () => {
    const files = adapter.generateHooks(makeCtx('en'))
    expect(files).toHaveLength(2)
    for (const file of files) {
      const parsed = JSON.parse(file.content)
      expect(parsed.enabled).toBe(true)
      expect(parsed.when.type).toBeTruthy()
      expect(parsed.then.prompt).toBeTruthy()
    }
  })
})

// ─── detect ───

describe('KiroAdapter.detect()', () => {
  let tmpDir

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'kiro-adapter-test-'))
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns false when no .kiro directory exists', () => {
    expect(adapter.detect(tmpDir)).toBe(false)
  })

  it('returns true when .kiro/steering/ exists', () => {
    const steeringDir = join(tmpDir, '.kiro', 'steering')
    mkdirSync(steeringDir, { recursive: true })
    expect(adapter.detect(tmpDir)).toBe(true)
    rmSync(join(tmpDir, '.kiro'), { recursive: true, force: true })
  })

  it('returns true when .kiro/hooks/ exists', () => {
    const hooksDir = join(tmpDir, '.kiro', 'hooks')
    mkdirSync(hooksDir, { recursive: true })
    expect(adapter.detect(tmpDir)).toBe(true)
    rmSync(join(tmpDir, '.kiro'), { recursive: true, force: true })
  })
})

// ─── getInstalledFiles ───

describe('KiroAdapter.getInstalledFiles()', () => {
  let tmpDir

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'kiro-installed-test-'))
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns expected file list', () => {
    const files = adapter.getInstalledFiles(tmpDir)
    const paths = files.map((f) => f.relativePath)
    expect(paths).toContain('.kiro/steering/gapa.md')
    expect(paths).toContain('.kiro/steering/gapa-preferences.md')
    expect(paths).toContain('.kiro/hooks/gapa-context-load.kiro.hook')
    expect(paths).toContain('.kiro/hooks/gapa-evaluation.kiro.hook')
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

// ─── Backward compatibility (Requirement 3.4) ───

describe('KiroAdapter backward compatibility', () => {
  it('hook file paths match v0.1.0 convention (.kiro/hooks/*.kiro.hook)', () => {
    const files = adapter.generateHooks(makeCtx())
    for (const file of files) {
      expect(file.relativePath).toMatch(/^\.kiro\/hooks\/.*\.kiro\.hook$/)
    }
  })

  it('steering file paths match v0.1.0 convention (.kiro/steering/*.md)', () => {
    const files = adapter.generateSteering(makeCtx())
    for (const file of files) {
      expect(file.relativePath).toMatch(/^\.kiro\/steering\/.*\.md$/)
    }
  })

  it('hook JSON structure matches Kiro expected format', () => {
    const files = adapter.generateHooks(makeCtx())
    for (const file of files) {
      const parsed = JSON.parse(file.content)
      // Kiro expects exactly these top-level keys
      expect(Object.keys(parsed)).toEqual(
        expect.arrayContaining(['enabled', 'name', 'description', 'version', 'when', 'then'])
      )
      // when must have type
      expect(Object.keys(parsed.when)).toContain('type')
      // then must have type and prompt
      expect(Object.keys(parsed.then)).toEqual(
        expect.arrayContaining(['type', 'prompt'])
      )
    }
  })
})
