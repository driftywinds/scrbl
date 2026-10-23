# scrbl image, built from the source in this folder
FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBUG=False \
    DATABASE_URL=sqlite:////data/db.sqlite3

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /data /app/media \
 && SECRET_KEY=build python manage.py collectstatic --noinput

VOLUME ["/data", "/app/media"]
EXPOSE 9009

CMD ["bash", "-c", "python manage.py migrate --noinput && exec gunicorn prototype.wsgi:application --bind 0.0.0.0:9009 --workers 3 --access-logfile -"]
