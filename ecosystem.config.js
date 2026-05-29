module.exports = {
  apps: [
    {
      name: "exam-api-v3",
      script: "/home/serge/exam-grading-system_online/.venv/bin/gunicorn",
      args: "-c gunicorn.conf.py app:app",
      cwd: "/home/serge/exam-grading-system_online",
      interpreter: "none",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: "512M",
      env: {
        FLASK_ENV: "production"
      }
    }
  ]
};
