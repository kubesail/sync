const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')
const express = require('express')
const multer = require('multer')
const morgan = require('morgan')
const helmet = require('helmet')
const { dirs } = require('./config')

const app = express()

let authKey = process.env.SYNC_AUTH_KEY || ''
let httpsServer

if (fs.existsSync('k8s/secrets/pass.key')) {
  authKey = fs.readFileSync('k8s/secrets/pass.key').toString().trim()
  httpsServer = https.createServer(
    {
      key: fs.readFileSync('k8s/secrets/tls.key'),
      cert: fs.readFileSync('k8s/secrets/tls.crt'),
      ca: fs.readFileSync('k8s/secrets/ca.crt'),
      honorCipherOrder: true,
    },
    app
  )
}

if (!authKey || authKey.length < 8) {
  throw new Error('Invalid SYNC_AUTH_KEY')
}

const httpServer = http.createServer(app)

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
    req.dirs = {
      photos: path.join(dirs.photos, req.device),
    }
    next()
  } else {
    console.error('Rejected access with a missing x-sync-key')
    return res.sendStatus(403)
  }
})

app.get('/:tag/check', (req, res) => {
  if (!req.query.check) {
    let deviceTotal = 0
    try {
      deviceTotal = fs.readdirSync(req.dirs.photos).length
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
    exec(`df ${dirs.photos} | tail -n1 | awk '{print $4}'`, (err, stdout, stderr) => {
      if (err) throw err
      const bytesFree = stdout.trim()
      return res.send({ deviceTotal, bytesFree })
    })
  } else {
    const missing = Buffer.from(req.query.check || '', 'base64')
      .toString()
      .split('|')
      .map(filename => encodeURIComponent(decodeURIComponent(filename)))
      .filter(filename => {
        try {
          fs.statSync(`${req.dirs.photos}/${filename}`)
        } catch (err) {
          if (err.code === 'ENOENT') return true
        }
      })
      .map(filename => decodeURIComponent(filename))
    return res.send({ missing })
  }
})

const storage = multer.diskStorage({
  destination: function (req, _file, cb) {
    fs.stat(req.dirs.photos, err => {
      if (!err) {
        cb(null, req.dirs.photos)
      } else if (err.code === 'ENOENT') {
        fs.mkdir(req.dirs.photos, err => {
          if (!err || err.code === 'EEXIST') cb(null, req.dirs.photos)
          else throw err
        })
      } else throw err
    })
  },
  filename: function (_req, file, cb) {
    cb(null, file.originalname)
  },
})

const uploaderMiddleware = multer({ storage })
app.post('/photos/upload', uploaderMiddleware.any(), (req, res) => {
  console.log(`Uploaded ${req?.files?.length || 0} files to ${req.dirs.photos}`)
  return res.sendStatus(200)
})

if (httpsServer) {
  httpsServer.listen(9099, () => {
    console.log(`KubeSail Sync listening at https://localhost:9099`)
  })
} else {
  console.warn('HTTPS DISABLED')
}
httpServer.listen(9098, () => {
  console.log(`KubeSail Sync listening at http://localhost:9098`)
})
