#!/bin/bash

set -eo pipefail

SECRETS_DIR="k8s/secrets"

if kubectl get secret kubesail-sync > /dev/null; then
  echo "Loading certificate from existing kubesail-sync secret"
  mkdir -p ${SECRETS_DIR}
  kubectl get secrets kubesail-sync -o json | jq -r '.data["tls.crt"]' | base64 -d > ${SECRETS_DIR}/tls.crt
  kubectl get secrets kubesail-sync -o json | jq -r '.data["tls.key"]' | base64 -d > ${SECRETS_DIR}/tls.key
else
  echo "Creating new kubesail-sync secret"
  ./bin/generate_self_signed_cert.sh
  kubectl create secret generic kubesail-sync \
    --from-file=tls.crt=${SECRETS_DIR}/tls.crt \
    --from-file=tls.key=${SECRETS_DIR}/tls.key \
    --from-file=pubkey=${SECRETS_DIR}/pubkey.txt \
    --from-file=der=${SECRETS_DIR}/tls.der \
    --from-file=ca=${SECRETS_DIR}/ca.crt
  kubectl label secret kubesail-sync kubesail/sync=true
fi

node src
