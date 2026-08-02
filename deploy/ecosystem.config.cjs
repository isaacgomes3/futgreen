/** PM2 — FUTGRN produção */
module.exports = {
  apps: [
    {
      name: 'futgreen',
      cwd: '/var/www/futgreen',
      script: 'scripts/futgreen-server.mjs',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3101,
        LISTEN_HOST: '127.0.0.1',
      },
      max_memory_restart: '512M',
      time: true,
      out_file: '/var/www/futgreen/logs/out.log',
      error_file: '/var/www/futgreen/logs/error.log',
    },
  ],
};
