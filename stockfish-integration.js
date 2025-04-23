/**
 * Stockfish Chess Engine Integration for CH3SS (Farcade-compatible version)
 * Uses pure JavaScript version that avoids CORS issues
 */

// Stockfish engine variables
let stockfish = null;
let stockfishReady = false;
let stockfishLoaded = false;

/**
 * Initializes the Stockfish chess engine in the background
 */
function initStockfishInBackground() {
  try {
    console.log("Initializing Stockfish in background (for future use)");
    
    if (stockfishLoaded) {
      console.log("Stockfish already loaded");
      return;
    }
    
    // Load Stockfish.js (pure JavaScript version)
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.min.js';
    script.async = true;
    
    script.onload = function() {
      console.log("Stockfish script loaded successfully");
      stockfishLoaded = true;
      
      // Initialize Stockfish engine
      stockfish = STOCKFISH();
      
      // Setup message handler
      stockfish.onmessage = function(msg) {
        console.log('Stockfish:', msg);
        
        // Check if engine is ready
        if (msg === 'readyok') {
          stockfishReady = true;
          console.log('Stockfish engine ready');
        }
      };
      
      // Initialize the engine
      stockfish.postMessage('uci');
      stockfish.postMessage('isready');
      stockfish.postMessage('setoption name Skill Level value 10');
      
      console.log("Stockfish engine initialized and waiting for future use");
    };
    
    script.onerror = function() {
      console.error("Failed to load Stockfish script");
    };
    
    document.head.appendChild(script);
  } catch (err) {
    console.error("Error initializing Stockfish:", err);
  }
}

/**
 * Function to request a move from Stockfish
 */
function requestStockfishMove(fen, difficulty, callback) {
  if (!stockfish || !stockfishReady) {
    console.error('Stockfish not ready');
    return false;
  }
  
  // Skill level based on difficulty
  let skillLevel = 10;
  let moveTime = 1000;
  
  switch (difficulty) {
    case "easy": skillLevel = 5; moveTime = 500; break;
    case "medium": skillLevel = 10; moveTime = 1000; break;
    case "hard": skillLevel = 15; moveTime = 1500; break;
    case "expert": skillLevel = 20; moveTime = 2000; break;
  }
  
  // Set skill level
  stockfish.postMessage(`setoption name Skill Level value ${skillLevel}`);
  
  // Variable to store when a move is received
  let moveReceived = false;
  
  // Store original handler
  const originalOnMessage = stockfish.onmessage;
  
  // Setup temporary handler for this request
  stockfish.onmessage = function(msg) {
    // Log and call original handler
    console.log('Stockfish:', msg);
    if (originalOnMessage && typeof originalOnMessage === 'function') {
      originalOnMessage(msg);
    }
    
    // Check for bestmove
    if (!moveReceived && typeof msg === 'string' && msg.startsWith('bestmove')) {
      moveReceived = true;
      
      const moveRegex = /bestmove\s+(\w+)/;
      const match = moveRegex.exec(msg);
      if (match) {
        const bestMove = match[1];
        
        // Restore original handler
        stockfish.onmessage = originalOnMessage;
        
        // Call the callback with the move
        callback(bestMove);
      }
    }
  };
  
  // Send position and request move
  stockfish.postMessage(`position fen ${fen}`);
  stockfish.postMessage(`go movetime ${moveTime}`);
  
  return true;
}

/**
 * Execute a move recommended by Stockfish
 */
function makeStockfishMove(moveString, chessInstance) {
  // Convert UCI move format (e.g., "e2e4") to chess.js format
  const from = moveString.substring(0, 2);
  const to = moveString.substring(2, 4);
  const promotion = moveString.length > 4 ? moveString[4] : undefined;
  
  // Make the move
  const moveResult = chessInstance.move({
    from: from,
    to: to,
    promotion: promotion
  });
  
  return moveResult;
}

// Initialize Stockfish after page loads
window.addEventListener('load', function() {
  setTimeout(initStockfishInBackground, 5000);
});

// Export functions for the main game
window.CH3SS = window.CH3SS || {};
window.CH3SS.stockfish = {
  isReady: () => stockfishReady,
  requestMove: requestStockfishMove,
  makeMove: makeStockfishMove
};