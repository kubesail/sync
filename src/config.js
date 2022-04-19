module.exports = {
  dirs: {
    media: process.env.SYNC_DIR_MEDIA || '/home/node/data/media',
    photos: process.env.SYNC_DIR_PHOTOS || '/home/node/data/photos',
  },
  API_CORS_ALLOWED_ORIGINS: process.env.API_CORS_ALLOWED_ORIGINS || '',
}
