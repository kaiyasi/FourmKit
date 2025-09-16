FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# No external deps; use stdlib WSGI + cgi
COPY app.py /app/app.py

EXPOSE 8080
CMD ["python", "/app/app.py"]

