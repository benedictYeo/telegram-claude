// PM2 ecosystem configuration
// CJS format required -- PM2 does not support ESM ecosystem files
module.exports = {
  apps: [
    {
      name: "tg-claude",
      script: "src/index.ts",
      interpreter: "node",
      interpreter_args: "--import tsx/esm",
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      max_memory_restart: "256M",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
    {
      name: "tg-claude-caffeinate",
      script: "/usr/bin/caffeinate",
      interpreter: "none",
      args: "-s",
      autorestart: true,
      max_restarts: 100,
    },
  ],
};
