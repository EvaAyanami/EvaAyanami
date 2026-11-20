# Image bac à sable Rust — toolchain stable + crates populaires pré-compilées
ARG RUST_VERSION=1
FROM rust:${RUST_VERSION}-slim-bookworm AS deps
WORKDIR /build
COPY rust/deps/Cargo.toml ./Cargo.toml
COPY rust/deps/collect.sh /usr/local/bin/collect.sh
RUN mkdir src && echo 'fn main(){}' > src/main.rs && cargo build --release && sh /usr/local/bin/collect.sh

FROM rust:${RUST_VERSION}-slim-bookworm
COPY --from=deps /opt/codemori /opt/codemori
COPY common/harness.sh /opt/codemori/harness.sh
RUN chmod 0555 /opt/codemori/harness.sh && useradd -u 10001 -M -s /usr/sbin/nologin sandbox
ENV HOME=/tmp TMPDIR=/tmp LANG=C.UTF-8 LC_ALL=C.UTF-8
USER 10001:10001
WORKDIR /tmp
ENTRYPOINT ["/opt/codemori/harness.sh"]
