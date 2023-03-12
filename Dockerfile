# syntax=docker/dockerfile:1.3

FROM node:18-bullseye-slim
ARG TARGETARCH
ENV NODE_ENV="production" \
  HTTPS="true" \
  HOST="0.0.0.0" \
  NO_STDIN="true" \
  SSL_CRT_FILE="/home/node/app/secrets/tls.crt" \
  SSL_KEY_FILE="/home/node/app/secrets/tls.key"
WORKDIR /home/node/app
RUN mkdir -p /home/node/app/service /home/node/data/media /home/node/data/photos && \
  chown -R node:node /home/node/app /home/node/data && \
  apt-get update -yqq && \
  apt-get install -yqq openssl curl jq && \
  curl -sLo kubectl https://dl.k8s.io/v1.22.5/bin/linux/${TARGETARCH}/kubectl && chmod +x kubectl && mv kubectl /usr/local/bin
USER node
COPY --chown=node:node package.json yarn.lock ./
RUN yarn --no-progress --no-emoji --prefer-offline
COPY --chown=node:node bin /home/node/app/bin
COPY --chown=node:node src /home/node/app/src

VOLUME ["/home/node/data/media", "/home/node/data/photos"]

CMD ["./bin/start.sh"]

