const { spawn } = require('child_process');
const path = require('path');

// Paths
const nodeDir = 'd:\\new project\\node\\node-v20.11.1-win-x64';
const npmBin = `"${path.join(nodeDir, 'npm.cmd')}"`;

// Add portable node to PATH for subprocesses
const env = { ...process.env };
env.PATH = `${nodeDir};${env.PATH || ''}`;

console.log('Starting AIDS-3 Attendance Management Website...');

// Start Frontend Server (Firebase cloud serverless mode)
console.log('Starting Vite frontend on port 5173 (Firebase serverless mode)...');
const frontend = spawn(npmBin, ['run', 'dev', '--', '--host', '0.0.0.0'], {
  cwd: path.join(__dirname, 'frontend'),
  env,
  shell: true
});

frontend.stdout.on('data', (data) => {
  console.log(`[Frontend] ${data.toString().trim()}`);
});

frontend.stderr.on('data', (data) => {
  console.error(`[Frontend ERROR] ${data.toString().trim()}`);
});

// Handle termination
process.on('SIGINT', () => {
  console.log('\nStopping server...');
  frontend.kill();
  process.exit();
});
