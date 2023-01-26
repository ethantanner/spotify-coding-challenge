import axios, { Method } from "axios";
import { Request, Response } from "express";
import { Artist } from "../models/Artist.model";
import { Track } from '../models/Track.model';
import { AppDataSource } from '../index';

const isrcRegex = /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/i;

export class Spotify {

  public token: string | undefined;
  public expires: number = 0; // unix timestamp when token expires

  constructor() { }

  /**
   * Accepts a query parameter called 'artist'. 'artist' must be a string less than 200 char.
   * Database is searched for tracks matching the artist using a 'like' query.
   * Accepts a query parameter called 'limit' representing the page length of the results.
   * 'limit' must be less than or equal to 20 and greater than 0
   * Accepts a query parameter called 'page' which is the 1 indexed page of results.
   * @param {Request} req - Express request
   * @param {Response} res - Express response
   * @returns {Promise<Response>}
   */
  public async getArtistFromDb(req: Request, res: Response) {
    const artist = req.query.artist;

    /**
     * check if the artist value is provided and of type string,
     * also enforces a length under 200 char to prevent poor db performance
     */
    if (!artist || typeof artist != 'string' || artist.length > 200) {
      return res.status(400).send('Invalid Artist');
    }

    let limit = req.query.limit ? parseInt(req.query.limit.toString()) : 0;
    let page = req.query.page ? parseInt(req.query.page.toString()) : 0;

    // Enforce rules about page length
    if (!limit || limit < 1 || limit > 20) {
      limit = 10;
    }

    // Enforce rules about page number
    if (!page || page < 1) {
      page = 1;
    }

    // Calculate the number of records to skip in the database
    const skip = (page - 1) * limit;

    const tracks: Array<Track> = await AppDataSource.getRepository(Track).createQueryBuilder('track').innerJoinAndSelect('track.ArtistNameList', 'artist', 'LOWER(artist.name) like LOWER(:name)', { name: `%${artist}%` }).skip(skip).take(limit).getMany();

    // return tracks, empty array if no matches
    return res.send({
      tracks: tracks
    });
  }

  /**
   * Accepts a query parameter called 'isrc'. 'isrc' is validated to make sure
   * it matches the isrc spec. The database is searched for an exact match of
   * the isrc.
   * @param {Request} req - Express request
   * @param {Response} res - Express response
   * @returns {Promise<Response>}
   */
  public async getIsrcFromDb(req: Request, res: Response) {
    const isrc = req.query.isrc;

    // verify that the provided isrc appears to be valid
    if (!this.isrcValid(isrc)) {
      return res.status(400).send('Invalid ISRC');
    }

    // search database for an exact match of the track isrc.
    // const track = await TrackModel.findOne({ isrc: isrc });
    const track = await AppDataSource.getRepository('Track').findOne({
      where: {
        isrc: isrc
      },
      relations: {
        ArtistNameList: true
      }
    });

    return res.status(!track ? 404 : 200).send({
      track: track
    });
  }

  /**
   * Accepts a query parameter called 'isrc'. 'isrc' is validated to make sure
   * it matches the isrc spec. The Spofiy API is called to search for tracks
   * that match the isrc. The tracks are sorted and the most popular track is
   * stored in the database. The id of the database object is returned in the
   * text response.
   * @param {Request} req - Express request
   * @param {Response} res - Express response
   * @returns {Promise<Response>}
   */
  public async createTrackByIsrc(req: Request, res: Response) {
    const isrc = req.body.isrc;

    // verify that the provided isrc appears to be valid
    if (!this.isrcValid(isrc)) {
      return res.status(400).send('Invalid ISRC');
    }

    // search the spotify api for tracks by isrc
    const response: IsrcSearchResponseBody = await this.searchSpotifyApi('track', `isrc:${isrc}`);

    if (!response.tracks.items.length) {
      return res.status(404).send('No Tracks Found');
    }

    /**
     * Sort the tracks by descending popularity. Popularity is not a value that represents plays.
     * Popularity measures the relative popularity of a song and is not fast changing.
     * https://developer.spotify.com/documentation/web-api/reference/#/operations/get-track
     */
    const targetTrack = response.tracks.items.sort((trackA, trackB) => {
      return trackB.popularity - trackA.popularity;
    })[0];

    const artistRepository = AppDataSource.getRepository(Artist);
    const artists: Array<Artist> = [];

    // loop through artists from spotify api
    for (let artistData of targetTrack.artists) {

      // check if artist is already stored
      const existingArtist = await artistRepository.findOneBy({
        name: artistData.name
      });

      if (existingArtist) {
        artists.push(existingArtist);
        continue;
      }

      console.log('Artist does not exist, creating...');
      const newArtist = new Artist(artistData.name);
      artists.push(await artistRepository.save(newArtist));
    }

    const trackRepository = AppDataSource.getRepository(Track);

    // check if track already exists
    const existingTrack = await trackRepository.findOneBy({
      isrc: isrc
    });
    if (!existingTrack) {
      const newTrack = new Track(isrc, targetTrack.album.images[0]?.url || '', targetTrack.name, artists);
      await trackRepository.save(newTrack);
      return res.send(`Track ${isrc} saved!`);
    } else {
      return res.send(`Track ${isrc} already saved!`);
    }
  }

  /**
   * Used for testing to search for tracks
   * @param {Request} req - Express request
   * @param {Response} res - Express response
   * @returns {Promise<IsrcSearchResponseBody>} - the raw body from the spotify api response
   */
  public async getSearch(req: Request, res: Response) {
    const query = req.query.search;

    // Validate that a query was sent
    if (!query || typeof query != 'string') {
      return res.status(400).send('Bad Request');
    }

    // Search the spotify api for the track based on the provided query
    return res.send(await this.searchSpotifyApi('track', query));
  }

  /**
   * 
   * @param {'track' | 'album'} type - The type of search to run
   * @param {string} query - The search query to run
   * @returns {Promise<IsrcSearchResponseBody>} - the raw body from the spotify api response
   */
  private async searchSpotifyApi(type: 'track' | 'album', query: string) {
    return await this.makeSpotifyRequest('https://api.spotify.com/v1/search', 'get', null, {
      type: type,
      q: query
    });
  }

  /**
   * Makes a call to the spotify API. Checks for cached token and requests new
   * one if missing or expired. Attaches 'Authorization' header to request. Returns
   * the response body.
   * @param {string} url - url of the spotify api endpoint to call
   * @param {Method} method - method of the spotify api call
   * @param {any} data - data to send in the spotify api call
   * @param {any} params - query params to send in the spotify api call
   * @returns {Promise<any>}
   */
  private async makeSpotifyRequest(url: string, method: Method, data: any, params: any) {
    // checks to see if the token is missing or expired
    if (!this.token || (Date.now() + 120000) > this.expires) {
      console.log('Token missing or expired, fetching new token.')

      const tokenResponse = await this.getSpotifyToken();
      this.token = tokenResponse.access_token;
      this.expires = Date.now() + (tokenResponse.expires_in * 1000);
    }

    // Make request with auth and return response body
    return (await axios.request({
      url: url,
      method: method,
      headers: {
        Authorization: `Bearer ${this.token}`
      },
      data: data,
      params: params
    })).data;
  }

  /**
   * Makes a request to the spotify API to get an auth token using spotify client id
   * and spotify cliet secret from the environment
   * @returns {Promise<SpotifyTokenResponseBody>} - The api token response raw body
   */
  private async getSpotifyToken(): Promise<SpotifyTokenResponseBody> {
    const requestOptions = {
      url: 'https://accounts.spotify.com/api/token',
      method: 'post',
      data: {
        grant_type: 'client_credentials'
      },
      headers: {
        'Authorization': `Basic ${this.getBufferedAuthString()}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };
    return (await axios.request(requestOptions)).data;
  }

  /**
   * Gets the spotify client id and client secret from the environment and converts
   * them into the correctly formatted base64 encoded string used for auth.
   * @returns {string} - base64 buffered auth token
   */
  private getBufferedAuthString() {
    return Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
  }

  /**
   * Checks if the provided isrc appears to be a valid isrc.
   * @param {any} isrcCandidate - the candidate to check
   * @returns {boolean} - true if the candidate matches the isrc format
   */
  private isrcValid(isrcCandidate?: any) {
    return !(!isrcCandidate || typeof isrcCandidate != 'string' || !isrcCandidate.match(isrcRegex));
  }
}

interface SpotifyTokenResponseBody {
  access_token: string;
  token_type: string;
  expires_in: number;
};

interface IsrcSearchResponseBody {
  tracks: {
    href: string;
    items: Array<{
      album: {
        album_type: string;
        artists: Array<{
          external_urls: {
            spotify: string;
          };
          href: string;
          id: string;
          name: string;
          type: string;
          uri: string;
        }>;
        available_markets: Array<string>;
        external_urls: {
          spotify: string;
        };
        href: string;
        id: string;
        images: Array<{
          height: number;
          url: string;
          width: number;
        }>;
        name: string;
        release_date: string;
        release_date_precision: string;
        total_tracks: number;
        type: string;
        uri: string;
      };
      artists: Array<{
        external_urls: {
          spotify: string;
        };
        href: string;
        id: string;
        name: string;
        type: string;
        uri: string;
      }>;
      available_markets: Array<string>;
      disc_number: number;
      duration_ms: number;
      explicit: boolean;
      external_ids: {
        isrc?: string;
        ean?: string;
        upc?: string;
      };
      external_urls: {
        spotify: string;
      };
      href: string;
      id: string;
      is_local: boolean;
      name: string;
      popularity: number;
      preview_url: string;
      track_number: number;
      type: string;
      uri: string;
    }>;
    limit: number;
    next?: any;
    offset: number;
    previous?: any;
    total: number;
  };
};