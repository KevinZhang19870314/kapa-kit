#!/usr/bin/env node
// GAPA stop hook — 任务完成后触发评估
let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    if (data.status === 'completed') {
      process.stdout.write(JSON.stringify({
        followup_message: `{{slot:evaluationPrompt}}`
      }));
    } else {
      process.stdout.write(JSON.stringify({}));
    }
  } catch {
    process.stdout.write(JSON.stringify({}));
  }
  process.exit(0);
});
