#!/usr/bin/env bash
set -euf -o pipefail

SECRETS_DIR="k8s/secrets"

if [[ ! -f "${SECRETS_DIR}/tls.crt" || ! -f "${SECRETS_DIR}/tls.key" ]]; then
  mkdir -p ${SECRETS_DIR}

  openssl genrsa -out ${SECRETS_DIR}/ca.key 2048
  openssl req -new -x509 -days 365 -key ${SECRETS_DIR}/ca.key -subj "/C=CN/ST=GD/L=SZ/O=Acme, Inc./CN=Acme Root CA" -out ${SECRETS_DIR}/ca.crt

  openssl req -newkey rsa:2048 -nodes -keyout ${SECRETS_DIR}/tls.key -subj "/C=US/ST=California/L=Pasadena/O=KubeSail-User/OU=Sync/CN=kubesail-sync.local" -out ${SECRETS_DIR}/tls.csr
  openssl x509 -req -extfile <(printf "subjectAltName=DNS:kubesail-sync.local") -days 365 -in ${SECRETS_DIR}/tls.csr -CA ${SECRETS_DIR}/ca.crt -CAkey ${SECRETS_DIR}/ca.key -CAcreateserial -out ${SECRETS_DIR}/tls.crt

  openssl x509 -in ${SECRETS_DIR}/tls.crt -pubkey -noout | openssl rsa -pubin -outform der > ${SECRETS_DIR}/tls.der
  cat ${SECRETS_DIR}/tls.der | openssl dgst -sha256 -binary | openssl enc -base64 > ${SECRETS_DIR}/pubkey.txt
fi
