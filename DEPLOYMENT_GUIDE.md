# Sign Pong Deployment Guide

This guide explains how to deploy the Sign Pong game to Vercel while ensuring the online multiplayer functionality works correctly.

## Understanding the Challenge

The main challenge with deploying Sign Pong to Vercel is that the online multiplayer functionality uses WebSockets, but Vercel's serverless functions don't support long-lived connections like WebSockets directly. We need a different approach for production.

## Solution: Using a Dedicated WebSocket Service

For production deployment, we have two main options:

### Option 1: Deploy the WebSocket Server Separately

1. Deploy the game's frontend (HTML, CSS, JS) to Vercel
2. Deploy the WebSocket server (`server.js`) to a platform that supports persistent connections:
   - Heroku
   - DigitalOcean
   - Railway
   - Render
   - AWS EC2

### Option 2: Use a Managed WebSocket Service

Replace the custom WebSocket server with a managed service:
- [Pusher](https://pusher.com/)
- [Socket.io Cloud](https://socket.io/cloud)
- [Ably](https://ably.com/)

## Deployment Steps

### Step 1: Prepare Your Project

1. Make sure your `package.json` includes all necessary dependencies:
   ```json
   {
     "name": "sign-pong",
     "version": "1.0.0",
     "description": "Multiplayer pong game with WebSocket support",
     "main": "server.js",
     "scripts": {
       "start": "node server.js",
       "dev": "node server.js",
       "build": "echo 'Build step complete'"
     },
     "dependencies": {
       "express": "^4.18.2",
       "ws": "^8.13.0",
       "uuid": "^9.0.0",
       "socket.io": "^4.7.2",
       "socket.io-client": "^4.7.2"
     },
     "engines": {
       "node": ">=14.x"
     }
   }
   ```

2. Create a `vercel.json` configuration file:
   ```json
   {
     "version": 2,
     "builds": [
       { "src": "*.html", "use": "@vercel/static" },
       { "src": "*.js", "use": "@vercel/node" },
       { "src": "images/*", "use": "@vercel/static" }
     ],
     "routes": [
       { "src": "/", "dest": "/index.html" },
       { "src": "/info", "dest": "/info.html" },
       { "src": "/server.js", "dest": "/server.js" },
       { "src": "/images/(.*)", "dest": "/images/$1" },
       { "src": "/(.*)", "dest": "/$1" }
     ]
   }
   ```

### Step 2: Deploy the WebSocket Server

#### Using Heroku

1. Create a Heroku account if you don't have one
2. Install the [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)
3. Create a new Heroku app:
   ```
   heroku create sign-pong-server
   ```
4. Deploy your server:
   ```
   git push heroku main
   ```
5. Note the URL of your Heroku app (e.g., `https://sign-pong-server.herokuapp.com`)

#### Using Railway

1. Create a [Railway](https://railway.app/) account
2. Create a new project and connect your GitHub repository
3. Deploy the server
4. Note the URL of your Railway app

### Step 3: Update the Client Code

1. Modify your client code to connect to the deployed WebSocket server instead of localhost:

   ```javascript
   // Replace this in index.html
   const socket = new WebSocket('wss://your-server-url.herokuapp.com');
   
   // With this
   const serverUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
     ? 'ws://localhost:3000'
     : 'wss://your-server-url.herokuapp.com';
   const socket = new WebSocket(serverUrl);
   ```

### Step 4: Deploy the Frontend to Vercel

1. Install the [Vercel CLI](https://vercel.com/download):
   ```
   npm install -g vercel
   ```

2. Deploy to Vercel:
   ```
   vercel
   ```

3. Follow the prompts to complete the deployment

4. Once deployed, Vercel will provide you with a URL for your application

## Alternative: Using Socket.io

If you prefer to use Socket.io instead of raw WebSockets, follow these steps:

1. Install Socket.io packages:
   ```
   npm install socket.io socket.io-client
   ```

2. Convert your server.js to use Socket.io (see `server-socketio.js` in the project)

3. Update your client code to use Socket.io:
   ```html
   <!-- Add this to your HTML -->
   <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
   
   <script>
   // Replace WebSocket code with Socket.io
   const serverUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
     ? 'http://localhost:3000'
     : 'https://your-server-url.herokuapp.com';
   const socket = io(serverUrl);
   
   // Then update all your event handlers
   // From: socket.onmessage = (event) => { const data = JSON.parse(event.data); ... }
   // To: socket.on('eventName', (data) => { ... });
   
   // From: socket.send(JSON.stringify({ type: 'create_room', playerName: playerName }));
   // To: socket.emit('create_room', { playerName: playerName });
   </script>
   ```

## Testing Your Deployment

1. Visit your Vercel deployment URL
2. Open the game in two different browsers or devices
3. Test the online multiplayer functionality
4. Check for any console errors

## Troubleshooting

- **CORS Issues**: If you encounter CORS errors, make sure your WebSocket server allows connections from your Vercel domain:
  ```javascript
  // In server.js
  const wss = new WebSocket.Server({ 
    server,
    verifyClient: (info) => {
      const origin = info.origin || info.req.headers.origin;
      // Allow connections from your Vercel domain and localhost
      return origin === 'https://your-vercel-domain.vercel.app' || 
             origin === 'http://localhost:3000';
    }
  });
  ```

- **Connection Issues**: If the WebSocket connection fails, check:
  - Your server is running
  - The URL is correct (including wss:// protocol)
  - Your server allows connections from your client domain

## Conclusion

By following this guide, you should be able to successfully deploy Sign Pong to Vercel while maintaining the online multiplayer functionality. The key is to deploy the WebSocket server separately on a platform that supports persistent connections.

For any issues or questions, please refer to the documentation for the specific platforms you're using (Vercel, Heroku, etc.) or reach out for support.
