#!/usr/bin/env node
// GAPA sessionStart hook — 注入上下文加载指引
const output = {
  additional_context: `{{slot:contextLoadPrompt}}`
};
process.stdout.write(JSON.stringify(output));
process.exit(0);
