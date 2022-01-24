const https = require('https')
const fs = require('fs')
const express = require('express')
const multer = require('multer')
const morgan = require('morgan')
const helmet = require('helmet')
const { dirs } = require('./config')

const authKey = fs.readFileSync('k8s/secrets/pass.key').toString().trim()
const app = express()
const httpsServer = https.createServer(
  {
    key: fs.readFileSync('k8s/secrets/tls.key'),
    cert: fs.readFileSync('k8s/secrets/tls.crt'),
    ca: fs.readFileSync('k8s/secrets/ca.crt'),
    honorCipherOrder: true,
  },
  app
)

app.use(helmet.hsts({ maxAge: 31536000000, includeSubDomains: true, force: true }))
app.use(
  morgan(':date[iso] :method :url :status :response-time :res[content-length]', {
    skip: (req, res) => {
      return (
        (req.method === 'OPTIONS' || req.path === '/health' || req.path === '/healthz') &&
        res.statusCode === 200
      )
    },
  })
)
app.disable('x-powered-by')

app.use((req, res, next) => {
  if (
    req.headers['x-sync-device'] &&
    req.headers['x-sync-key'] &&
    req.headers['x-sync-key'] === authKey
  ) {
    req.device = req.headers['x-sync-device']
    next()
  } else {
    console.error('Rejected access with a missing x-sync-key')
    return res.sendStatus(403)
  }
})

app.get('/:tag/check', (req, res) => {
  const missing = Buffer.from(req.query.check || '', 'base64')
    .toString()
    .split('|')
    .map(id => encodeURIComponent(id))
    .filter(id => {
      try {
        fs.statSync(`${dirs.photos}/${req.device}/${id}`)
      } catch (err) {
        if (err.code === 'ENOENT') return true
      }
    })
  return res.send({ missing })
})

const photoUploader = multer({ dest: dirs.photos })
app.post('/photos/upload', photoUploader.array('photos', 12), function (req, res, next) {})

const mediaUploader = multer({ dest: dirs.media })
app.post('/media/upload', mediaUploader.array('media', 12), function (req, res, next) {})

httpsServer.listen(9099, () => {
  console.log(`Example app listening at https://localhost:9099`)
})
