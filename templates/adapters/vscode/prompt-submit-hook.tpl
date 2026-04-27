#!/usr/bin/env node
// GAPA UserPromptSubmit hook — 注入上下文加载指引
const output = {
  systemMessage: `{{slot:contextLoadPrompt}}`
};
process.stdout.write(JSON.stringify(output));
process.exit(0);
