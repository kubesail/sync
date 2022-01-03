const https = require('https')
const fs = require('fs')
const express = require('express')
const multer = require('multer')
const upload = multer({ dest: 'uploads/' })

const app = express()
const httpsServer = https.createServer(
  { key: fs.readFileSync('k8s/secrets/tls.key'), cert: fs.readFileSync('k8s/secrets/tls.crt') },
  app
)

// SQLite DB
// On boot-up, scan disk and update SQLite

app.post('/photos/upload', upload.array('photos', 12), function (req, res, next) {
  // req.files is array of `photos` files
  // req.body will contain the text fields, if there were any
})

httpsServer.listen(9099, () => {
  console.log(`Example app listening at https://localhost:9099`)
})
