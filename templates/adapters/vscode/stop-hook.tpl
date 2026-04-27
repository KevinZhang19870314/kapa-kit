#!/usr/bin/env node
// GAPA Stop hook — 任务完成后触发评估
let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    // 如果已经因为之前的 stop hook 继续运行，不再阻止，防止无限循环
    if (data.stop_hook_active) {
      process.stdout.write(JSON.stringify({}));
    } else {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "Stop",
          decision: "block",
          reason: `{{slot:evaluationPrompt}}`
        }
      }));
    }
  } catch {
    process.stdout.write(JSON.stringify({}));
  }
  process.exit(0);
});
