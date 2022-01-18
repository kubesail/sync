#!/bin/bash

./bin/generate_self_signed_cert.sh

kubectl create secret generic kubesail-sync --from-file=cert=k8s/secrets/tls.crt

node src
