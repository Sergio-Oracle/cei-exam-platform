#!/bin/bash
set -e

# Ce script doit être lancé en tant que serge (pas root)
if [ "$(id -u)" = "0" ]; then
    echo "[restart] ERREUR : ne pas lancer ce script en tant que root."
    echo "          Utilise : su - serge -c 'bash /home/serge/exam-grading-system_online/restart.sh'"
    exit 1
fi

APP_DIR="/home/serge/exam-grading-system_online"

echo "[restart] Rechargement via PM2..."
pm2 reload exam-api-v3 2>/dev/null || pm2 start "$APP_DIR/ecosystem.config.js"

sleep 2
STATUS=$(pm2 jlist 2>/dev/null | python3 -c "import sys,json; apps=json.load(sys.stdin); a=next((x for x in apps if x['name']=='exam-api-v3'),None); print(a['pm2_env']['status'] if a else 'unknown')" 2>/dev/null || echo "unknown")

if [ "$STATUS" = "online" ]; then
    PID=$(pm2 jlist 2>/dev/null | python3 -c "import sys,json; apps=json.load(sys.stdin); a=next((x for x in apps if x['name']=='exam-api-v3'),None); print(a['pid'] if a else '?')" 2>/dev/null || echo "?")
    echo "[restart] ✓ Gunicorn online via PM2 (PID master $PID) sur le port 7000"
else
    echo "[restart] ✗ Statut PM2 : $STATUS — vérifie: pm2 logs exam-api-v3"
    exit 1
fi
