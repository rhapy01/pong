/**
 * Socket Adapter for Sign Pong
 * This adapter provides a consistent interface for both WebSocket and Socket.io connections
 * to make the game work in both local development and production environments.
 */

class SocketAdapter {
  constructor() {
    this.socket = null;
    this.callbacks = {};
    this.connected = false;
    this.connectionType = null;
  }

  /**
   * Connect to the appropriate server based on environment
   * @param {string} url - Server URL to connect to
   */
  connect(url) {
    // Determine if we're in production or development
    const isProduction = window.location.hostname !== 'localhost' && 
                         window.location.hostname !== '127.0.0.1';
    
    if (isProduction) {
      // In production, use Socket.io
      this.connectSocketIO(url);
      this.connectionType = 'socketio';
    } else {
      // In development, use WebSocket
      this.connectWebSocket(url);
      this.connectionType = 'websocket';
    }

    return new Promise((resolve) => {
      this.on('connection', (data) => {
        this.connected = true;
        resolve(data);
      });
    });
  }

  /**
   * Connect using WebSocket (for local development)
   * @param {string} url - WebSocket server URL
   */
  connectWebSocket(url) {
    this.socket = new WebSocket(url);
    
    this.socket.onopen = () => {
      console.log('WebSocket connection established');
    };
    
    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const eventType = data.type;
        
        if (this.callbacks[eventType]) {
          // Remove the type property before passing to callback
          const { type, ...payload } = data;
          this.callbacks[eventType].forEach(callback => callback(payload));
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
    
    this.socket.onclose = () => {
      console.log('WebSocket connection closed');
      this.connected = false;
      
      // Trigger disconnect callbacks
      if (this.callbacks['disconnect']) {
        this.callbacks['disconnect'].forEach(callback => callback());
      }
    };
    
    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  /**
   * Connect using Socket.io (for production)
   * @param {string} url - Socket.io server URL
   */
  connectSocketIO(url) {
    // Load Socket.io script dynamically if not already loaded
    if (typeof io === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
      script.integrity = 'sha384-mZLF4UVrpi/QTWPA7BjNPEnkIfRFn4ZEO3Qt/HFklTJBj/gBOV8G3HcKn4NfQblz';
      script.crossOrigin = 'anonymous';
      
      script.onload = () => {
        this.initSocketIO(url);
      };
      
      document.head.appendChild(script);
    } else {
      this.initSocketIO(url);
    }
  }

  /**
   * Initialize Socket.io connection
   * @param {string} url - Socket.io server URL
   */
  initSocketIO(url) {
    this.socket = io(url);
    
    this.socket.on('connect', () => {
      console.log('Socket.io connection established');
    });
    
    // Set up event forwarding
    this.socket.onAny((eventName, ...args) => {
      if (this.callbacks[eventName]) {
        this.callbacks[eventName].forEach(callback => callback(...args));
      }
    });
    
    this.socket.on('disconnect', () => {
      console.log('Socket.io connection closed');
      this.connected = false;
      
      // Trigger disconnect callbacks
      if (this.callbacks['disconnect']) {
        this.callbacks['disconnect'].forEach(callback => callback());
      }
    });
    
    this.socket.on('error', (error) => {
      console.error('Socket.io error:', error);
    });
  }

  /**
   * Register an event listener
   * @param {string} event - Event name to listen for
   * @param {function} callback - Callback function to execute when event is received
   */
  on(event, callback) {
    if (!this.callbacks[event]) {
      this.callbacks[event] = [];
    }
    this.callbacks[event].push(callback);
  }

  /**
   * Send a message to the server
   * @param {string} event - Event name
   * @param {object} data - Data to send
   */
  emit(event, data) {
    if (!this.connected) {
      console.warn('Socket not connected, cannot emit event:', event);
      return;
    }
    
    if (this.connectionType === 'socketio') {
      // Socket.io style emit
      this.socket.emit(event, data);
    } else {
      // WebSocket style send
      const message = {
        type: event,
        ...data
      };
      this.socket.send(JSON.stringify(message));
    }
  }

  /**
   * Close the connection
   */
  disconnect() {
    if (this.connectionType === 'socketio') {
      this.socket.disconnect();
    } else {
      this.socket.close();
    }
    this.connected = false;
  }
}

// Create a singleton instance
const socketAdapter = new SocketAdapter();
