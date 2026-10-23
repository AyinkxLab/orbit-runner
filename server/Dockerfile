FROM python:3.12-slim

WORKDIR /app
COPY orbit_server.py /app/orbit_server.py

ENV PORT=8080 \
    ORBIT_DB=/data/orbit.db \
    ALLOWED_ORIGIN=*

RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8080

CMD ["python", "/app/orbit_server.py"]
