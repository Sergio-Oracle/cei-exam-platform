module.exports = {
  apps: [
    {
      name: "exam-api-v3",
      script: "app.py",
      interpreter: "/root/exam-grading-system_online/.venv/bin/python3",
      watch: false,
      env: {
        FLASK_ENV: "production"
      }
    }
  ]
};
