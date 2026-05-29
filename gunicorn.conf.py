# Gunicorn configuration — CEI Production
import multiprocessing

workers = 4
threads = 2
worker_class = 'gthread'

bind = '0.0.0.0:7000'
timeout = 120
keepalive = 5
max_requests = 1000
max_requests_jitter = 100
preload_app = True

# Logs
accesslog = '-'
errorlog = '-'
loglevel = 'warning'

def post_fork(server, worker):
    # Chaque worker doit avoir son propre pool de connexions PostgreSQL.
    # Sans ce dispose(), les connexions SSL forkées depuis le maître sont corrompues
    # → "SSL error: decryption failed or bad record mac"
    from models import engine
    engine.dispose()
