# syntax=docker/dockerfile:1.7
FROM caddy:2.11.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648

# The official binary carries cap_net_bind_service for ports below 1024. This stack binds 8080 and
# drops all capabilities; removing the unused file capability allows no-new-privileges execution.
USER root
RUN apk del --no-network curl \
    && setcap -r /usr/bin/caddy
USER 1000:1000
