# Image bac à sable Java — OpenJDK (Eclipse Temurin, version LTS)
ARG JDK_VERSION=21
FROM eclipse-temurin:${JDK_VERSION}-jdk
COPY common/harness.sh /opt/codemori/harness.sh
RUN chmod 0555 /opt/codemori/harness.sh && (useradd -u 10001 -M -s /usr/sbin/nologin sandbox || true)
ENV HOME=/tmp TMPDIR=/tmp
USER 10001:10001
WORKDIR /tmp
ENTRYPOINT ["/opt/codemori/harness.sh"]
