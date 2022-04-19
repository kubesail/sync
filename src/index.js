const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')
const express = require('express')
const fsScandir = require('@nodelib/fs.scandir')
const multer = require('multer')
const morgan = require('morgan')
const helmet = require('helmet')
const { dirs, API_CORS_ALLOWED_ORIGINS } = require('./config')

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

if (process.env.NODE_ENV === 'development') {
  console.log('KubeSail-Sync development mode:', { authKey })
}

const httpServer = http.createServer(app)

app.use(helmet.hsts({ maxAge: 31536000000, includeSubDomains: true, force: true }))
const allowedOrigins = API_CORS_ALLOWED_ORIGINS.split(',')
app.use((req, res, next) => {
  const allowedCors =
    API_CORS_ALLOWED_ORIGINS === '*' ? 1 : allowedOrigins.indexOf(req.headers.origin)
  if (allowedCors > -1) {
    res.header(
      'Access-Control-Allow-Origin',
      API_CORS_ALLOWED_ORIGINS === '*' ? '*' : allowedOrigins[allowedCors]
    )
    const allowCredentials = allowedOrigins.includes(allowedOrigins[allowedCors])
    res.header(
      'Access-Control-Allow-Credentials',
      API_CORS_ALLOWED_ORIGINS === '*' || allowCredentials ? 'true' : 'false'
    )
  }
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,PATCH,DELETE')
  res.header('Access-Control-Max-Age', '3600')
  res.header(
    'Access-Control-Allow-Headers',
    'content-type,content-encoding,authorization,x-sync-device,x-sync-key'
  )
  res.header('X-Frame-Options', 'SAMEORIGIN')
  res.header('X-XSS-Protection', '1; mode=block')
  res.header('Referrer-Policy', 'same-origin')
  res.header('X-Content-Type-Options', 'nosniff')
  next()
})

morgan.token('url', function (req) {
  return req.url.replace(/x\-sync\-key\=(.*)/, 'x-sync-key=REDACTED')
})
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
  if (req.method === 'OPTIONS') return next()
  const syncDevice = req.query['x-sync-device'] || req.headers['x-sync-device']
  const syncKey = req.query['x-sync-key'] || req.headers['x-sync-key']

  if (syncDevice && syncKey && syncKey === authKey) {
    req.device = syncDevice
    req.dirs = { photos: path.join(dirs.photos, syncDevice) }
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

app.post(
  '/photos/upload',
  multer({
    storage: multer.diskStorage({
      destination: function (_req, _file, cb) {
        fs.stat(req.dirs.photos, err => {
          if (!err) {
            cb(null, req.dirs.photos)
          } else if (err.code === 'ENOENT') {
            fs.mkdir(req.dirs.photos, err => {
              if (!err || err.code === 'EEXIST') cb(null, destination)
              else throw err
            })
          } else throw err
        })
      },
      filename: function (_req, file, cb) {
        cb(null, file.originalname)
      },
    }),
  }).any(),
  (req, res) => {
    console.log(`Uploaded ${req?.files?.length || 0} files to ${req.dirs.photos}`)
    return res.send({})
  }
)

app.post(
  '/fm/upload/*',
  multer({
    storage: multer.diskStorage({
      destination: function (req, _file, cb) {
        const targetPath = req.path.replace(/^\/fm\/upload\//, '')
        const targetPathFull = `/mnt/pvc/${targetPath}`
        cb(null, targetPathFull)
      },
      filename: function (_req, file, cb) {
        cb(null, file.originalname)
      },
    }),
  }).any(),
  (req, res) => {
    console.log(`FileManager: Uploaded ${req?.files?.length || 0} files`)
    return res.send({})
  }
)

app.post('/fm/mkdir/*', (req, res) => {
  const targetPath = req.path.replace(/^\/fm\/mkdir\//, '')
  const targetPathFull = `/mnt/pvc/${targetPath}`
  fs.mkdir(targetPathFull, {}, err => {
    if (err) return res.send({ error: err.code })
    return res.send({})
  })
})

app.get('/fm/list*', (req, res) => {
  const targetPath = req.path.replace(/^\/fm\/list\//, '')
  const targetPathFull = `/mnt/pvc/${targetPath}`
  fsScandir.scandir(targetPathFull, { stats: true }, (err, stats) => {
    if (err) {
      if (err.code === 'ENOENT') {
        return res.send({ error: 'ENOENT' })
      }
      console.error('Failed to list dir', { targetPathFull, err })
      return res.sendStatus(500)
    }
    const files = stats.map(s => {
      const isDir = s.dirent.isDirectory()
      return {
        id: `${targetPath}/${s.name}`,
        name: s.name,
        isDir,
        ext: s.name.includes('.') ? undefined : '',
        size: isDir ? undefined : s.stats.size,
        modDate: s.stats.mtime,
      }
    })
    return res.send({ files })
  })
})

app.get('/fm/delete*', (req, res) => {
  const targetPath = req.path.replace(/^\/fm\/delete\//, '')
  const targetPathFull = `/mnt/pvc/${targetPath}`
  if (targetPath === '/' || targetPath === '') return res.sendStatus(400)
  fs.unlink(targetPathFull, err => {
    if (err) {
      if (err.code === 'ENOENT') return res.send({ error: 'ENOENT' })
      console.error('Failed to unlink', { targetPathFull, err })
      return res.sendStatus(500)
    }
    return res.send({})
  })
})

app.get('/fm/download*', (req, res) => {
  const targetPath = req.path.replace(/^\/fm\/download\//, '')
  const targetPathFull = `/mnt/pvc/${targetPath}`
  const fileStream = fs.createReadStream(targetPathFull)
  fileStream.on('open', () => {
    // req.headers['content-type']
    res.attachment(path.basename(targetPath))
    fileStream.pipe(res)
  })
  fileStream.on('error', err => {
    if (err.code === 'ENOENT') return res.send({ error: 'ENOENT' })
    console.error('Failed to download file', { targetPathFull, err })
    return res.sendStatus(500)
  })
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
