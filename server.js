// WebSocket server for Stadium Pong multiplayer
const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Serve static files
app.use(express.static(path.join(__dirname)));

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Game rooms
const rooms = {};
const waitingPlayers = {};

// Handle WebSocket connections
wss.on('connection', (ws) => {
    console.log('New client connected');
    let playerId = uuidv4();
    let roomId = null;
    
    // Send player their ID
    ws.send(JSON.stringify({
        type: 'connection',
        playerId: playerId
    }));
    
    // Handle messages from clients
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch(data.type) {
                case 'create_room':
                    // Create a new room with a shorter, more user-friendly ID
                    const shortRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
                    const playerName = data.playerName || "Player";
                    
                    rooms[shortRoomId] = {
                        players: {
                            [playerId]: {
                                ws: ws,
                                ready: false,
                                isHost: true,
                                name: playerName
                            }
                        },
                        gameState: {
                            ball: { x: 400, y: 200, speedX: 0, speedY: 0 },
                            paddles: {},
                            scores: {}
                        },
                        gameStarted: false
                    };
                    
                    roomId = shortRoomId;
                    console.log(`Room created: ${roomId} by ${playerName}`);
                    
                    // Send room ID to creator
                    ws.send(JSON.stringify({
                        type: 'room_created',
                        roomId: roomId
                    }));
                    break;
                    
                case 'join_room':
                    // Join an existing room
                    const roomCode = data.roomId.trim().toUpperCase();
                    const joiningPlayerName = data.playerName || "Player";
                    console.log(`Attempting to join room: ${roomCode}`);
                    console.log(`Available rooms: ${Object.keys(rooms).join(', ')}`);
                    
                    if (rooms[roomCode]) {
                        roomId = roomCode;
                        
                        // Check if room is full
                        if (Object.keys(rooms[roomId].players).length >= 2) {
                            ws.send(JSON.stringify({
                                type: 'error',
                                message: 'Room is full'
                            }));
                            return;
                        }
                        
                        // Add player to room
                        rooms[roomId].players[playerId] = {
                            ws: ws,
                            ready: false,
                            isHost: false,
                            name: joiningPlayerName
                        };
                        
                        console.log(`Player ${joiningPlayerName} (${playerId}) joined room ${roomId}`);
                        
                        // Find host and get their name
                        let hostId = null;
                        let hostName = "Host";
                        
                        for (const pid in rooms[roomId].players) {
                            if (rooms[roomId].players[pid].isHost) {
                                hostId = pid;
                                hostName = rooms[roomId].players[pid].name;
                                
                                // Notify host that player joined
                                rooms[roomId].players[pid].ws.send(JSON.stringify({
                                    type: 'player_joined',
                                    playerId: playerId,
                                    playerName: joiningPlayerName
                                }));
                                break;
                            }
                        }
                        
                        // Send room info to joining player
                        ws.send(JSON.stringify({
                            type: 'room_joined',
                            roomId: roomId,
                            hostName: hostName
                        }));
                    } else {
                        console.log(`Room not found: ${roomCode}`);
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Room not found'
                        }));
                    }
                    break;
                    
                case 'find_game':
                    // Add player to waiting queue with name
                    const quickMatchPlayerName = data.playerName || "Player";
                    waitingPlayers[playerId] = {
                        ws: ws,
                        name: quickMatchPlayerName
                    };
                    
                    // Check if there's another player waiting
                    const waitingPlayerIds = Object.keys(waitingPlayers);
                    if (waitingPlayerIds.length >= 2) {
                        // Get the first waiting player (not this one)
                        let otherPlayerId = null;
                        for (const pid of waitingPlayerIds) {
                            if (pid !== playerId) {
                                otherPlayerId = pid;
                                break;
                            }
                        }
                        
                        if (otherPlayerId) {
                            // Get other player's name
                            const otherPlayerName = waitingPlayers[otherPlayerId].name;
                            
                            // Create a new room for these two players
                            roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
                            rooms[roomId] = {
                                players: {
                                    [playerId]: {
                                        ws: ws,
                                        ready: false,
                                        isHost: true,
                                        name: quickMatchPlayerName
                                    },
                                    [otherPlayerId]: {
                                        ws: waitingPlayers[otherPlayerId].ws,
                                        ready: false,
                                        isHost: false,
                                        name: otherPlayerName
                                    }
                                },
                                gameState: {
                                    ball: { x: 400, y: 200, speedX: 0, speedY: 0 },
                                    paddles: {},
                                    scores: {}
                                },
                                gameStarted: false
                            };
                            
                            console.log(`Quick match found: ${quickMatchPlayerName} vs ${otherPlayerName} in room ${roomId}`);
                            
                            // Remove both players from waiting list
                            delete waitingPlayers[playerId];
                            delete waitingPlayers[otherPlayerId];
                            
                            // Notify both players
                            ws.send(JSON.stringify({
                                type: 'game_found',
                                roomId: roomId,
                                isHost: true,
                                opponentName: otherPlayerName
                            }));
                            
                            rooms[roomId].players[otherPlayerId].ws.send(JSON.stringify({
                                type: 'game_found',
                                roomId: roomId,
                                isHost: false,
                                opponentName: quickMatchPlayerName
                            }));
                        }
                    } else {
                        ws.send(JSON.stringify({
                            type: 'waiting_for_opponent'
                        }));
                    }
                    break;
                    
                case 'player_ready':
                    if (roomId && rooms[roomId] && rooms[roomId].players[playerId]) {
                        rooms[roomId].players[playerId].ready = true;
                        
                        // Check if all players are ready
                        let allReady = true;
                        for (const pid in rooms[roomId].players) {
                            if (!rooms[roomId].players[pid].ready) {
                                allReady = false;
                                break;
                            }
                        }
                        
                        // If all players ready, start the game
                        if (allReady && Object.keys(rooms[roomId].players).length === 2) {
                            rooms[roomId].gameStarted = true;
                            
                            // Initialize game state
                            const playerIds = Object.keys(rooms[roomId].players);
                            rooms[roomId].gameState.paddles[playerIds[0]] = { y: 150 };
                            rooms[roomId].gameState.paddles[playerIds[1]] = { y: 150 };
                            rooms[roomId].gameState.scores[playerIds[0]] = 0;
                            rooms[roomId].gameState.scores[playerIds[1]] = 0;
                            
                            // Initialize match timer state
                            rooms[roomId].matchState = {
                                currentSet: 1,
                                timeRemaining: 2 * 60, // 2 minutes in seconds
                                isRestPeriod: false,
                                restTimeRemaining: 0,
                                set1Scores: { [playerIds[0]]: 0, [playerIds[1]]: 0 },
                                set2Scores: { [playerIds[0]]: 0, [playerIds[1]]: 0 },
                                lastUpdateTime: Date.now()
                            };
                            
                            // Start the match timer on the server
                            rooms[roomId].matchTimer = setInterval(() => {
                                if (!rooms[roomId]) {
                                    clearInterval(rooms[roomId].matchTimer);
                                    return;
                                }
                                
                                const now = Date.now();
                                const elapsedSeconds = Math.floor((now - rooms[roomId].matchState.lastUpdateTime) / 1000);
                                rooms[roomId].matchState.lastUpdateTime = now;
                                
                                if (rooms[roomId].matchState.isRestPeriod) {
                                    // Update rest period timer
                                    rooms[roomId].matchState.restTimeRemaining -= elapsedSeconds;
                                    
                                    if (rooms[roomId].matchState.restTimeRemaining <= 0) {
                                        // End of rest period, start set 2
                                        rooms[roomId].matchState.isRestPeriod = false;
                                        rooms[roomId].matchState.currentSet = 2;
                                        rooms[roomId].matchState.timeRemaining = 2 * 60; // 2 minutes for set 2
                                        
                                        // Reset scores for set 2 but keep set 1 scores
                                        rooms[roomId].gameState.scores[playerIds[0]] = 0;
                                        rooms[roomId].gameState.scores[playerIds[1]] = 0;
                                        
                                        // Send set 2 starting message to all players
                                        for (const pid in rooms[roomId].players) {
                                            rooms[roomId].players[pid].ws.send(JSON.stringify({
                                                type: 'set2_starting',
                                                matchState: rooms[roomId].matchState
                                            }));
                                        }
                                    } else {
                                        // Send rest period update to all players
                                        for (const pid in rooms[roomId].players) {
                                            rooms[roomId].players[pid].ws.send(JSON.stringify({
                                                type: 'rest_period_update',
                                                restTimeRemaining: rooms[roomId].matchState.restTimeRemaining
                                            }));
                                        }
                                    }
                                } else {
                                    // Update match timer
                                    rooms[roomId].matchState.timeRemaining -= elapsedSeconds;
                                    
                                    if (rooms[roomId].matchState.timeRemaining <= 0) {
                                        if (rooms[roomId].matchState.currentSet === 1) {
                                            // End of set 1, start rest period
                                            rooms[roomId].matchState.set1Scores[playerIds[0]] = rooms[roomId].gameState.scores[playerIds[0]];
                                            rooms[roomId].matchState.set1Scores[playerIds[1]] = rooms[roomId].gameState.scores[playerIds[1]];
                                            
                                            rooms[roomId].matchState.isRestPeriod = true;
                                            rooms[roomId].matchState.restTimeRemaining = 30; // 30 seconds rest
                                            
                                            // Send rest period starting message to all players
                                            for (const pid in rooms[roomId].players) {
                                                rooms[roomId].players[pid].ws.send(JSON.stringify({
                                                    type: 'rest_period_starting',
                                                    matchState: rooms[roomId].matchState
                                                }));
                                            }
                                        } else {
                                            // End of set 2, game over
                                            rooms[roomId].matchState.set2Scores[playerIds[0]] = rooms[roomId].gameState.scores[playerIds[0]];
                                            rooms[roomId].matchState.set2Scores[playerIds[1]] = rooms[roomId].gameState.scores[playerIds[1]];
                                            
                                            // Send match results to all players
                                            for (const pid in rooms[roomId].players) {
                                                rooms[roomId].players[pid].ws.send(JSON.stringify({
                                                    type: 'match_results',
                                                    matchState: rooms[roomId].matchState
                                                }));
                                            }
                                            
                                            // Stop the timer
                                            clearInterval(rooms[roomId].matchTimer);
                                        }
                                    } else {
                                        // Send timer update to all players
                                        for (const pid in rooms[roomId].players) {
                                            rooms[roomId].players[pid].ws.send(JSON.stringify({
                                                type: 'timer_update',
                                                timeRemaining: rooms[roomId].matchState.timeRemaining,
                                                currentSet: rooms[roomId].matchState.currentSet
                                            }));
                                        }
                                    }
                                }
                            }, 1000); // Update every second
                            
                            // Collect player names
                            const playerNames = {};
                            for (const pid in rooms[roomId].players) {
                                playerNames[pid] = rooms[roomId].players[pid].name;
                            }
                            
                            // Notify all players game is starting
                            for (const pid in rooms[roomId].players) {
                                rooms[roomId].players[pid].ws.send(JSON.stringify({
                                    type: 'game_starting',
                                    gameState: rooms[roomId].gameState,
                                    playerIds: playerIds,
                                    playerNames: playerNames,
                                    yourId: pid
                                }));
                            }
                            
                            // Start ball after 2 seconds
                            setTimeout(() => {
                                if (rooms[roomId]) {
                                    // Reset ball position to center
                                    rooms[roomId].gameState.ball.x = 400;
                                    rooms[roomId].gameState.ball.y = 200;
                                    
                                    // Set random initial direction with higher speed
                                    rooms[roomId].gameState.ball.speedX = 10 * (Math.random() > 0.5 ? 1 : -1);
                                    rooms[roomId].gameState.ball.speedY = 10 * (Math.random() > 0.5 ? 1 : -1);
                                    
                                    console.log('Starting ball movement:', rooms[roomId].gameState.ball);
                                    
                                    // Send ball movement to all players
                                    for (const pid in rooms[roomId].players) {
                                        rooms[roomId].players[pid].ws.send(JSON.stringify({
                                            type: 'ball_moving',
                                            ball: rooms[roomId].gameState.ball
                                        }));
                                    }
                                    
                                    // Send a second confirmation after a short delay to ensure clients received it
                                    setTimeout(() => {
                                        if (rooms[roomId]) {
                                            for (const pid in rooms[roomId].players) {
                                                rooms[roomId].players[pid].ws.send(JSON.stringify({
                                                    type: 'ball_moving',
                                                    ball: rooms[roomId].gameState.ball
                                                }));
                                            }
                                        }
                                    }, 500);
                                }
                            }, 2000); // 2 seconds delay before starting
                        }
                    }
                    break;
                    
                case 'paddle_move':
                    if (roomId && rooms[roomId] && rooms[roomId].players[playerId] && rooms[roomId].gameStarted) {
                        // Update paddle position
                        rooms[roomId].gameState.paddles[playerId].y = data.y;
                        
                        // Broadcast to other player
                        for (const pid in rooms[roomId].players) {
                            if (pid !== playerId) {
                                rooms[roomId].players[pid].ws.send(JSON.stringify({
                                    type: 'opponent_move',
                                    y: data.y
                                }));
                                break;
                            }
                        }
                    }
                    break;
                    
                case 'ball_update':
                    if (roomId && rooms[roomId] && rooms[roomId].players[playerId] && rooms[roomId].gameStarted) {
                        // Host is responsible for ball physics
                        if (rooms[roomId].players[playerId].isHost) {
                            rooms[roomId].gameState.ball = data.ball;
                            
                            // Broadcast to other player
                            for (const pid in rooms[roomId].players) {
                                if (pid !== playerId) {
                                    rooms[roomId].players[pid].ws.send(JSON.stringify({
                                        type: 'ball_update',
                                        ball: data.ball
                                    }));
                                    break;
                                }
                            }
                        }
                    }
                    break;
                    
                case 'score_update':
                    if (roomId && rooms[roomId] && data.scores) {
                        // Update scores in game state
                        for (const pid in data.scores) {
                            rooms[roomId].gameState.scores[pid] = data.scores[pid];
                        }
                        
                        console.log('Score update:', rooms[roomId].gameState.scores);
                        
                        // Broadcast score update to ALL players (including sender for confirmation)
                        for (const pid in rooms[roomId].players) {
                            rooms[roomId].players[pid].ws.send(JSON.stringify({
                                type: 'score_update',
                                scores: rooms[roomId].gameState.scores
                            }));
                        }
                    }
                    break;
                    
                case 'player_scored':
                    if (roomId && rooms[roomId] && data.scoringPlayer) {
                        const playerIds = Object.keys(rooms[roomId].players);
                        const scoringPlayerId = data.scoringPlayer;
                        
                        // Find the player who scored and increment their score
                        if (playerIds.includes(scoringPlayerId)) {
                            // Increment score for the scoring player
                            rooms[roomId].gameState.scores[scoringPlayerId] = 
                                (rooms[roomId].gameState.scores[scoringPlayerId] || 0) + 1;
                                
                            console.log(`Player ${scoringPlayerId} scored. New scores:`, rooms[roomId].gameState.scores);
                            
                            // Broadcast updated scores to all players
                            for (const pid in rooms[roomId].players) {
                                rooms[roomId].players[pid].ws.send(JSON.stringify({
                                    type: 'score_update',
                                    scores: rooms[roomId].gameState.scores
                                }));
                            }
                        }
                    }
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });
    
    // Handle disconnection
    ws.on('close', () => {
        console.log('Client disconnected');
        
        // Remove from waiting list if present
        if (waitingPlayers[playerId]) {
            delete waitingPlayers[playerId];
        }
        
        // Handle room cleanup
        if (roomId && rooms[roomId]) {
            // Notify other player about disconnection
            for (const pid in rooms[roomId].players) {
                if (pid !== playerId && rooms[roomId].players[pid].ws) {
                    rooms[roomId].players[pid].ws.send(JSON.stringify({
                        type: 'opponent_disconnected'
                    }));
                }
            }
            
            // Remove room if it was the last player
            delete rooms[roomId].players[playerId];
            if (Object.keys(rooms[roomId].players).length === 0) {
                delete rooms[roomId];
            }
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
