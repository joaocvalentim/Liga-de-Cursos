# syntax=docker/dockerfile:1
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# libs para psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# instala deps primeiro para cache funcionar
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# copia o projeto
COPY . /app/

# por segurança: a Railway exporta $PORT
# arrancamos gunicorn e tratamos de migrações + static no arranque
CMD bash -lc "\
  python manage.py migrate && \
  python manage.py collectstatic --noinput && \
  gunicorn liga_de_cursos.wsgi:application --bind 0.0.0.0:${PORT:-8000} \
"
