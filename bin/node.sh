#!/bin/bash

if [[ $NODE_ENV == "development" ]]; then
  echo "Starting in DEVELOPMENT mode"
  ./node_modules/.bin/nodemon \
    --watch src \
    --ext js,json,yaml,plain,md \
    -- \
    --trace-deprecation \
    --trace-warnings \
    --dns-result-order ipv4first \
    --stack_size=1200 \
    "$@"
else
  node \
    --stack_size=1200 \
    --trace-deprecation \
    --trace-warnings \
    --dns-result-order ipv4first \
    "$@"
fi
