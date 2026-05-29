module.exports = {
  apps: [{
    name    : 'cei-agent-proctor',
    script  : 'agent_proctor/run.py',
    interpreter: '/home/serge/exam-grading-system_online/.venv/bin/python3',
    cwd     : '/home/serge/exam-grading-system_online',
    restart_delay: 10000,
    max_restarts : 10,
    env: {
      PYTHONUNBUFFERED: '1',
    },
    log_date_format : 'YYYY-MM-DD HH:mm:ss',
    error_file      : '/home/serge/.pm2/logs/cei-agent-proctor-error.log',
    out_file        : '/home/serge/.pm2/logs/cei-agent-proctor-out.log',
  }]
};
