# syntax=docker/dockerfile:1.7
FROM golang:1.26.8-alpine3.23@sha256:a8fa79c5bd40d880b52bd3b6d7669ecdcfd00e85facdd427d279efb5ddd79cb1 AS build
ENV CGO_ENABLED=0 GOTOOLCHAIN=local GOSUMDB=sum.golang.org
WORKDIR /src
COPY gateway/build/go.mod gateway/build/go.sum ./
RUN go mod download && go mod verify
COPY gateway/build/main.go ./
RUN go build -p 2 -trimpath -mod=readonly -ldflags="-s -w" -o /out/caddy .

FROM caddy:2.11.4-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b

# Rebuild the same standard Caddy modules with the locked security patches. The
# newly compiled binary has no file capability; this stack binds 8080 and drops
# all runtime capabilities, so cap_net_bind_service is neither added nor needed.
USER root
RUN apk del --no-network curl
COPY --from=build /out/caddy /usr/bin/caddy
RUN command -v getcap >/dev/null && test -z "$(getcap /usr/bin/caddy)"
USER 1000:1000
