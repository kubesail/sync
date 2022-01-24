#!/bin/bash

set -eo pipefail

SECRETS_DIR="k8s/secrets"

if kubectl get secret kubesail-sync > /dev/null; then
  echo "Loading certificate from existing kubesail-sync secret"
  mkdir -p ${SECRETS_DIR}
  kubectl get secrets kubesail-sync -o json | jq -r '.data["tls.crt"]' | base64 -d > ${SECRETS_DIR}/tls.crt
  kubectl get secrets kubesail-sync -o json | jq -r '.data["tls.key"]' | base64 -d > ${SECRETS_DIR}/tls.key
  kubectl get secrets kubesail-sync -o json | jq -r '.data["ca"]' | base64 -d > ${SECRETS_DIR}/ca.crt
  kubectl get secrets kubesail-sync -o json | jq -r '.data["pass"]' | base64 -d > ${SECRETS_DIR}/pass.key
else
  echo "Creating new kubesail-sync secret"
  ./bin/generate_self_signed_cert.sh
  openssl rand -base64 32 > ${SECRETS_DIR}/pass.key
  kubectl create secret generic kubesail-sync \
    --from-file=tls.crt=${SECRETS_DIR}/tls.crt \
    --from-file=tls.key=${SECRETS_DIR}/tls.key \
    --from-file=pubkey=${SECRETS_DIR}/pubkey.txt \
    --from-file=der=${SECRETS_DIR}/tls.der \
    --from-file=ca=${SECRETS_DIR}/ca.crt \
    --from-file=pass=${SECRETS_DIR}/pass.key
  kubectl label secret kubesail-sync kubesail/sync=true
fi

./bin/node.sh src
