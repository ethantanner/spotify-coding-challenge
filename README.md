# Live Demo
https://livedemo.com

# Building yourself
The following directions will instruct you how to build and run the application.

## Install Node.js
Install Node.js from <https://nodejs.org/en/>

Or use NVM <https://github.com/nvm-sh/nvm> if you want to easily upgrade or manage multiple Node.js versions.

## Install dependencies
```
npm install
```

## Generate env file
Duplicate `.env.example` with the name `.env`

## Set ENV variables
Set the database credentials and set the spotify api credentials.

## Start the dev server
```
npm run dev
```

## Saving Tracks
Make a POST request to `http://localhost:3000/track`
And the following body:
```
{
	"isrc": "USX9P2062937"
}
```

## Searching for Tracks by ISRC
Make a GET request to `http://localhost:3000/isrc?isrc=USIR19915182`

## Searching for Tracks by artist name
Make a GET request to `http://localhost:3000/artist?artist=Roses&limit=10&page=1`
Searching by artists supports 1 indexed pagination and page sizes from 1 to 20.

## What I would do to secure
Securing would depend on the use case but I'll outline a few options.
- OAuth using the Authorization code flow. The user could authenticate with spotify and the server could store the access and refresh tokens and an identifier from spotify to identify them in the future. After getting the access token from the spotify server the server could issue a signed jwt via cookie or response body.
- If we were only interested in rate limiting then we could do so with a firewall rule on cloudflare.
- If we wanted to have users login with a password. Then we could add a signup endpoint and a database model to store their information. I would hash the user password using the bcrypt library and issue a signed jwt either via a cookie or in the response body to be stored by the frotend.
In the OAuth and password scenarios I would write a middleware function that would check the JWT provided to the api in each request. If the JWT was valid then the request would be allowed to proceed.