import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { Spotify } from './controllers/spotify.controller';
import "reflect-metadata"
import { DataSource } from 'typeorm';
import { Artist } from './models/Artist.model';
import { Track } from './models/Track.model';
const logger = require('morgan');

// load env variables
dotenv.config();

// check env variables
if (!process.env.DATABASE_HOST) {
  throw new Error('Missing DATABASE_HOST env variable');
}
if (!process.env.SPOTIFY_CLIENT_ID) {
  throw new Error('Missing SPOTIFY_CLIENT_ID env variable');
}
if (!process.env.SPOTIFY_CLIENT_SECRET) {
  throw new Error('Missing SPOTIFY_CLIENT_SECRET env variable');
}
// END check env variables

// Setup Express
const app = express();
app.set('port', process.env.PORT || 3000);
app.use(bodyParser.json());
app.use(cors());
app.use(logger());
// END Setup Express

// Database Config
export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DATABASE_HOST,
  port: process.env.DATABASE_PORT ? parseInt(process.env.DATABASE_PORT) : 5432,
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  entities: [Track, Artist],
  synchronize: true,
  ssl: {
    rejectUnauthorized: true,
    ca:
      process.env.NODE_ENV === 'production'
        ? process.env.CA_CERT
        : fs.readFileSync("ca_cert.crt").toString(),
  },
})

AppDataSource.initialize()
  .then(() => {
    console.log("Data Source has been initialized!")
  })
  .catch((err) => {
    console.error("Error during Data Source initialization", err)
  })
// END Database Config

// Setup Spotify Controller
const spotify = new Spotify();

// API Routes
/**
 * Route to make sure API is alive.
 */
app.get('/alive', (req, res) => {
  return res.send({
    success: true,
    msg: "I'm Alive"
  });
});

/**
 * Route to search database for tracks by isrc.
 */
app.get('/isrc', spotify.getIsrcFromDb.bind(spotify));

/**
 * Route to search database for tracks by artist name.
 */
app.get('/artist', spotify.getArtistFromDb.bind(spotify));

/**
 * Route to add a track to the database by isrc.
 */
app.post('/track', spotify.createTrackByIsrc.bind(spotify));
// END API Routes

// Start app
app.listen(app.get('port'), () => {
  console.log('%s Express is running at http://localhost:%d in %s mode ✓. PID: %s', app.get('port'), app.get('env'), process.pid);
  console.log('  Press CTRL-C to stop\n');
});