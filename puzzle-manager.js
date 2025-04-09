// Puzzle Management System for CH3SS
// CDN configuration
const CDN_BASE_URL = 'https://dannywalter.github.io/ch3ss-puzzles/puzzles';
const MODES = {
    'tutorial': 'tutorial',
    'core-loop': 'coreLoop',
    'spice': 'spice',
    'boss': 'boss'
};

class PuzzleManager {
    constructor() {
        this.currentPuzzle = null;
        this.puzzleMode = 'tutorial';
        this.currentStreak = 0;
        this.loadedChunks = new Map(); // Use Map for better cache management
        this.currentScore = 0;
        this.solveStartTime = null;
        this.remainingTime = 60;
        this.lastUpdateTime = null;
        this.basePoints = 100;
        this.zstdInit = null;
        this.prefetchedChunks = new Set(); // Track prefetched chunks
    }

    // Initialize puzzle system
    async init() {
        try {
            // Initialize zstd
            this.zstdInit = new Promise((resolve, reject) => {
                if (window.ZstdCodec) {
                    window.ZstdCodec.run(zstd => {
                        this.zstd = zstd;
                        resolve();
                    });
                } else {
                    reject(new Error('ZstdCodec not found'));
                }
            });
            await this.zstdInit;

            // Fetch metadata and start prefetching tutorial puzzles
            const response = await this.fetchWithRetry(`${CDN_BASE_URL}/metadata.json`);
            const metadata = await response.json();
            console.log('Puzzle system initialized with metadata:', metadata);
            
            // Prefetch first tutorial chunk
            this.prefetchChunk('tutorial', 0);
            
            return true;
        } catch (error) {
            console.error('Failed to initialize puzzle system:', error);
            return false;
        }
    }

    // Fetch with retry and timeout
    async fetchWithRetry(url, retries = 3, timeout = 5000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url, {
                    signal: controller.signal,
                    headers: {
                        'Accept-Encoding': 'gzip',
                        'Cache-Control': 'max-age=3600'
                    },
                    mode: 'cors'
                });
                clearTimeout(timeoutId);
                
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return response;
            } catch (error) {
                if (i === retries - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i))); // Exponential backoff
            }
        }
    }

    // Prefetch a puzzle chunk
    async prefetchChunk(mode, chunkIndex) {
        const cacheKey = `${mode}-${chunkIndex}`;
        if (this.prefetchedChunks.has(cacheKey)) return;
        
        try {
            await this.loadPuzzleChunk(mode, chunkIndex);
            this.prefetchedChunks.add(cacheKey);
        } catch (error) {
            console.warn(`Failed to prefetch chunk ${cacheKey}:`, error);
        }
    }

    // Load a puzzle chunk with caching
    async loadPuzzleChunk(mode, chunkIndex) {
        const formattedMode = MODES[mode];
        const chunkUrl = `${CDN_BASE_URL}/${mode}/${formattedMode}-${chunkIndex}.json.gz`;
        
        // Check memory cache first
        const cacheKey = `${mode}-${chunkIndex}`;
        if (this.loadedChunks.has(cacheKey)) {
            return this.loadedChunks.get(cacheKey);
        }
        
        try {
            const response = await this.fetchWithRetry(chunkUrl);
            const compressedData = await response.arrayBuffer();
            const decompressed = await this.decompress(new Uint8Array(compressedData));
            const puzzles = JSON.parse(decompressed);
            
            // Cache the chunk
            this.loadedChunks.set(cacheKey, puzzles);
            
            // Implement LRU cache - keep only last 5 chunks
            if (this.loadedChunks.size > 5) {
                const firstKey = this.loadedChunks.keys().next().value;
                this.loadedChunks.delete(firstKey);
            }
            
            // Prefetch next chunk if this one was successfully loaded
            const nextChunkIndex = chunkIndex + 1;
            this.prefetchChunk(mode, nextChunkIndex);
            
            return puzzles;
        } catch (error) {
            console.error(`Failed to load puzzle chunk ${formattedMode}-${chunkIndex}:`, error);
            return null;
        }
    }

    // Start puzzle timer
    startPuzzleTimer() {
        this.solveStartTime = Date.now();
        if (!this.lastUpdateTime) {
            this.lastUpdateTime = Date.now();
        }
    }

    // Update game timer
    updateGameTimer() {
        const now = Date.now();
        const elapsed = (now - this.lastUpdateTime) / 1000;
        this.remainingTime = Math.max(0, this.remainingTime - elapsed);
        this.lastUpdateTime = now;
        return this.remainingTime;
    }

    // Calculate puzzle score
    calculatePuzzleScore(timeToSolve) {
        const streakMultiplier = Math.min(3, 1 + (this.currentStreak * 0.1)); // Max 3x multiplier
        const speedBonus = Math.max(1, 2 - (timeToSolve / 15)); // Faster solutions get up to 2x bonus
        return Math.round(this.basePoints * streakMultiplier * speedBonus);
    }

    // Get next puzzle based on current mode and streak
    async getNextPuzzle() {
        // Dynamic difficulty progression
        let targetChunkIndex = 0;
        
        if (this.currentStreak < 3) {
            this.puzzleMode = 'tutorial'; // mate-in-1 puzzles
        } else if (this.currentStreak < 8) {
            this.puzzleMode = 'core-loop'; // mate-in-2 puzzles
            targetChunkIndex = Math.floor((this.currentStreak - 3) / 2);
        } else {
            // After 8 correct solves, every 5th puzzle (remainder 4) should be spice
            const puzzleNumber = this.currentStreak - 8;
            if (puzzleNumber % 5 === 4) {
                this.puzzleMode = 'spice';
                targetChunkIndex = Math.floor(puzzleNumber / 10);
            } else {
                this.puzzleMode = 'core-loop';
                targetChunkIndex = Math.floor(puzzleNumber / 5);
            }
        }

        // Fetch the chunk from CDN with caching
        const chunk = await this.loadPuzzleChunk(this.puzzleMode, targetChunkIndex);
        if (!chunk) return null;

        // Select random puzzle from chunk
        const puzzleIndex = Math.floor(Math.random() * chunk.length);
        this.currentPuzzle = chunk[puzzleIndex];
        
        return {
            fen: this.currentPuzzle.FEN,
            moves: this.currentPuzzle.Moves.split(' '),
            rating: parseInt(this.currentPuzzle.Rating),
            themes: this.currentPuzzle.Themes.split(' '),
            goalText: this.getGoalText(this.currentPuzzle)
        };
    }

    // Check if a move matches the puzzle solution
    checkMove(move, moveIndex) {
        if (!this.currentPuzzle) return false;
        const solutionMoves = this.currentPuzzle.Moves.split(' ');
        const isCorrect = move === solutionMoves[moveIndex];
        
        // If this was the last move of the puzzle
        if (isCorrect && moveIndex === solutionMoves.length - 1) {
            const timeToSolve = (Date.now() - this.solveStartTime) / 1000;
            const score = this.calculatePuzzleScore(timeToSolve);
            this.currentScore += score;
            this.updateStreak(true);
            
            return {
                correct: true,
                complete: true,
                score,
                timeToSolve,
                streakBonus: this.currentStreak,
                totalScore: this.currentScore,
                remainingTime: this.remainingTime
            };
        }
        
        if (!isCorrect) {
            this.updateStreak(false);
        }
        
        return {
            correct: isCorrect,
            complete: false
        };
    }

    // Update streak and potentially change difficulty
    updateStreak(success) {
        if (success) {
            this.currentStreak++;
        } else {
            this.currentStreak = 0;
        }
    }

    // Change puzzle mode
    setPuzzleMode(mode) {
        this.puzzleMode = mode;
        this.currentStreak = 0;
    }

    // Helper function to decompress zstd data
    async decompress(data) {
        await this.zstdInit; // Ensure zstd is initialized
        const simple = new this.zstd.Simple();
        return simple.decompress(data);
    }

    // Check if game is over
    isGameOver() {
        return this.remainingTime <= 0;
    }

    // Get final score
    getFinalScore() {
        return {
            score: this.currentScore,
            streak: this.currentStreak,
            puzzlesSolved: this.currentStreak // Since streak resets on failure
        };
    }

    // Reset game
    resetGame() {
        this.currentScore = 0;
        this.currentStreak = 0;
        this.remainingTime = 60;
        this.lastUpdateTime = null;
        this.solveStartTime = null;
        this.puzzleMode = 'tutorial';
    }

    getGoalText(puzzle) {
        const side = puzzle.FEN.includes(' w ') ? 'White' : 'Black';
        const themes = puzzle.Themes.split(' ');

        if (themes.includes('mateIn1')) return `${side} to move – Mate in 1`;
        if (themes.includes('mateIn2')) return `${side} to move – Mate in 2`;
        if (themes.includes('mateIn3')) return `${side} to move – Mate in 3`;

        const tacticalMotifs = ['fork', 'pin', 'skewer', 'doubleCheck'];
        const motif = themes.find(t => tacticalMotifs.includes(t));
        
        return motif
            ? `${side} to move – Find the ${motif}`
            : `${side} to move – Find the best tactic`;
    }
}

window.PuzzleManager = PuzzleManager;