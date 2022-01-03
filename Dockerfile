# syntax=docker/dockerfile:1.3

FROM node:16-bullseye-slim
ENV NODE_ENV="production" \
  HTTPS="true" \
  HOST="0.0.0.0" \
  NO_STDIN="true" \
  SSL_CRT_FILE="/home/node/app/secrets/tls.crt" \
  SSL_KEY_FILE="/home/node/app/secrets/tls.key"
WORKDIR /home/node/app
RUN mkdir -p /home/node/app/service && \
  chown -R node:node /home/node/app && \
  apt-get update -yqq && \
  apt-get install -yqq openssl
USER node
COPY --chown=node:node package.json yarn.lock ./
RUN yarn --no-progress --no-emoji --prefer-offline
COPY --chown=node:node bin /home/node/app/bin
COPY --chown=node:node src /home/node/app/src

CMD ["./bin/start.sh"]

