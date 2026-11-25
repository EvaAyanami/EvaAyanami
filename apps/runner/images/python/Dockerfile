# Image bac à sable Python — CPython 3 (bibliothèque standard uniquement)
ARG PY_VERSION=3.12
FROM python:${PY_VERSION}-slim
COPY common/harness.sh /opt/codemori/harness.sh
RUN chmod 0555 /opt/codemori/harness.sh && useradd -u 10001 -M -s /usr/sbin/nologin sandbox
ENV HOME=/tmp TMPDIR=/tmp LANG=C.UTF-8 LC_ALL=C.UTF-8 PYTHONIOENCODING=utf-8 PYTHONUNBUFFERED=1
USER 10001:10001
WORKDIR /tmp
ENTRYPOINT ["/opt/codemori/harness.sh"]
