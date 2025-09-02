release: python manage.py migrate && python manage.py collectstatic --noinput
web: gunicorn liga_de_cursos.wsgi:application --bind 0.0.0.0:$PORT