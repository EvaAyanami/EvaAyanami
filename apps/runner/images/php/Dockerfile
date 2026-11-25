# Image bac à sable PHP — interpréteur en ligne de commande
ARG PHP_VERSION=8.3
FROM php:${PHP_VERSION}-cli
COPY common/harness.sh /opt/codemori/harness.sh
RUN chmod 0555 /opt/codemori/harness.sh && useradd -u 10001 -M -s /usr/sbin/nologin sandbox
ENV HOME=/tmp TMPDIR=/tmp LANG=C.UTF-8 LC_ALL=C.UTF-8
USER 10001:10001
WORKDIR /tmp
ENTRYPOINT ["/opt/codemori/harness.sh"]
