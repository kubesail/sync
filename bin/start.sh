#!/bin/bash

if kubectl get secret kubesail-sync > /dev/null; then
  echo "Loading certificate from existing kubesail-sync secret"
  mkdir -p k8s/secrets
  kubectl get secrets kubesail-sync -o json | jq -r '.data["tls.crt"]' | base64 -d > k8s/secrets/tls.crt
  kubectl get secrets kubesail-sync -o json | jq -r '.data["tls.key"]' | base64 -d > k8s/secrets/tls.key
else
  echo "Creating new kubesail-sync secret"
  ./bin/generate_self_signed_cert.sh
  kubectl create secret tls kubesail-sync --cert=k8s/secrets/tls.crt --key=k8s/secrets/tls.key
  kubectl label secret kubesail-sync kubesail/sync=true
fi

node src
