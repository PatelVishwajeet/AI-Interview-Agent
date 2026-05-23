import { spawn } from "node:child_process";

const commands = [
  {
    name: "server",
    command: "npm",
    args: ["--prefix", "3.interviewIQ/server", "run", "dev"],
  },
  {
    name: "client",
    command: "npm",
    args: ["--prefix", "3.interviewIQ/client", "run", "dev"],
  },
];

let shuttingDown = false;
const useShell = process.platform === "win32";
const children = commands.map(({ name, command, args }) => {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    shell: useShell,
    stdio: ["inherit", "pipe", "pipe"],
  });

  child.stdout.on("data", (data) => {
    process.stdout.write(`[${name}] ${data}`);
  });

  child.stderr.on("data", (data) => {
    process.stderr.write(`[${name}] ${data}`);
  });

  child.on("exit", (code) => {
    if (code && !shuttingDown) {
      console.error(`[${name}] exited with code ${code}`);
      shutdown(code);
    }
  });

  return child;
});

function shutdown(code = 0) {
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }

  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
