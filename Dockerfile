# Self-contained TeleNote/tapnote image: no manual git clone needed.
#   docker compose up -d --build
FROM python:3.10-slim

ARG REPO=https://github.com/zoidberg-xgd/tapnote.git
ARG REF=master

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBUG=False \
    DATABASE_URL=sqlite:////data/db.sqlite3

RUN apt-get update \
 && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch "${REF}" "${REPO}" /app
WORKDIR /app

RUN pip install --no-cache-dir -r requirements.txt

# Fix 1: templates extend 'TeleNote/base.html' but the folder is 'tapnote/'
# (Linux paths are case-sensitive, so this raised TemplateDoesNotExist).
RUN grep -rl "TeleNote/base.html" templates | xargs -r sed -i "s#TeleNote/base.html#tapnote/base.html#g"

# Fix 2: production settings, driven by environment variables.
RUN cat >> prototype/settings.py <<'PYEOF'


# ---- Docker/production overrides (appended at build time) ----
SECRET_KEY = os.environ.get('SECRET_KEY', SECRET_KEY)
ALLOWED_HOSTS = [h.strip() for h in os.environ.get('ALLOWED_HOSTS', '*').split(',') if h.strip()]
CSRF_TRUSTED_ORIGINS = [o.strip() for o in os.environ.get('CSRF_TRUSTED_ORIGINS', '').split(',') if o.strip()]
# Behind Caddy/Cloudflare: trust the proxy's X-Forwarded-Proto/Host so Django sees https
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True
if not DEBUG:
    CSRF_COOKIE_SECURE = True
    SESSION_COOKIE_SECURE = True
PYEOF

RUN mkdir -p /data /app/media \
 && SECRET_KEY=build python manage.py collectstatic --noinput

VOLUME ["/data", "/app/media"]
EXPOSE 9009

CMD ["bash", "-c", "python manage.py migrate --noinput && exec gunicorn prototype.wsgi:application --bind 0.0.0.0:9009 --workers 3 --access-logfile -"]
