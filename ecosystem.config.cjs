module.exports = {
  apps: [
    {
      name: 'builder-agent-chain',
      script: 'dist/server.js',
      cwd: './backend',
      env: {
        NODE_ENV: 'production',
      },
      // Allow .env file to be loaded by dotenv
      node_args: '--experimental-modules',
      instances: 2,
      exec_mode: 'cluster',
      // Graceful reload: wait for 'ready' signal from app
      wait_ready: true,
      listen_timeout: 30000,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
      max_memory_restart: '512M',
      // Kill timeout (must be >= app's shutdown timeout)
      kill_timeout: 35000,
      // Logging
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
