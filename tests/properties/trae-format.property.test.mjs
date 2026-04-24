/**
 * Property 15: TRAE Skills 文件 front-matter 有效性
 *
 * 对于任意语言设置，TraeAdapter 生成的 .trae/skills/gapa/SKILL.md 文件应包含
 * 有效的 YAML front-matter（以 --- 分隔符包裹），且 front-matter 中包含 name 和 description 字段。
 *
 * Feature: cross-ide-gapa-kit, Property 15: TRAE Skills 文件 front-matter 有效性
 *
 * **Validates: Requirements 12.2, 12.5**
 */

import { describe, it } from 'vitest'
import fc from 'fast-check'
import { loadTemplates } from '../../lib/core/template-engine.mjs'
import TraeAdapter from '../../lib/adapters/trae-adapter.mjs'

const adapter = new TraeAdapter()

describe('Property 15: TRAE Skills 文件 front-matter 有效性', () => {
  it('对于任意语言设置，SKILL.md 应包含有效的 YAML front-matter 且含 name 和 description 字段', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('zh', 'en'),
        (lang) => {
          const templates = loadTemplates(lang)
          const ctx = {
            projectRoot: '/tmp/test',
            lang,
            gapaDir: '.gapa',
            templates,
            isUpdate: false,
          }

          const files = adapter.generateSteering(ctx)

          // Find the SKILL.md file
          const skillFile = files.find((f) => f.relativePath === '.trae/skills/gapa/SKILL.md')
          if (!skillFile) {
            throw new Error('generateSteering() should produce .trae/skills/gapa/SKILL.md')
          }

          const content = skillFile.content

          // Must start with --- (YAML front-matter opening delimiter)
          if (!content.startsWith('---')) {
            throw new Error('SKILL.md must start with --- (YAML front-matter opening delimiter)')
          }

          // Split by --- to extract front-matter
          // content = "---\n<front-matter>\n---\n<body>"
          // split gives: ["", "<front-matter>", "\n<body>"]
          const parts = content.split('---')
          if (parts.length < 3) {
            throw new Error(
              'SKILL.md must have opening and closing --- delimiters for YAML front-matter'
            )
          }

          const frontMatter = parts[1].trim()

          // front-matter must contain name field
          if (!/^name:\s*.+/m.test(frontMatter)) {
            throw new Error(
              `SKILL.md front-matter missing "name" field. Got:\n${frontMatter}`
            )
          }

          // front-matter must contain description field
          if (!/^description:\s*.+/m.test(frontMatter)) {
            throw new Error(
              `SKILL.md front-matter missing "description" field. Got:\n${frontMatter}`
            )
          }

          // name field must have a non-empty value
          const nameMatch = frontMatter.match(/^name:\s*(.+)/m)
          if (!nameMatch || !nameMatch[1].trim()) {
            throw new Error('SKILL.md front-matter "name" field must have a non-empty value')
          }

          // description field must have a non-empty value
          const descMatch = frontMatter.match(/^description:\s*(.+)/m)
          if (!descMatch || !descMatch[1].trim()) {
            throw new Error('SKILL.md front-matter "description" field must have a non-empty value')
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
