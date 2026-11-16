module.exports = {
  apps: [
    {
      name: 'bolmizan-preview',
      cwd: process.env.BOLMIZAN_APP_DIR || '/var/www/bolmizan',
      script: 'npm',
      args: 'start',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      time: true,
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '3000',
        TRUST_PROXY_HOPS: '1',
      },
    },
  ],
};
