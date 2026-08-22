const { spawn } = require('child_process');
const path = require('path');

// Paths
const nodeDir = 'd:\\new project\\node\\node-v20.11.1-win-x64';
const nodeBin = `"${path.join(nodeDir, 'node.exe')}"`;
const npmBin = `"${path.join(nodeDir, 'npm.cmd')}"`;

// Add portable node to PATH for subprocesses
const env = { ...process.env };
env.PATH = `${nodeDir};${env.PATH || ''}`;

console.log('Starting AIDS-3 Attendance Management Website...');

// 1. Start Backend Server
console.log('Starting Express backend on port 5000...');
const backend = spawn(nodeBin, ['index.js'], {
  cwd: path.join(__dirname, 'backend'),
  env,
  shell: true
});

backend.stdout.on('data', (data) => {
  console.log(`[Backend] ${data.toString().trim()}`);
});

backend.stderr.on('data', (data) => {
  console.error(`[Backend ERROR] ${data.toString().trim()}`);
});

// 2. Start Frontend Server
console.log('Starting Vite frontend on port 5173...');
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
  console.log('\nStopping servers...');
  backend.kill();
  frontend.kill();
  process.exit();
});
