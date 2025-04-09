// Puzzle Management System for CH3SS
const fs = require('fs');
const path = require('path');
const { ZstdCodec } = require('zstd-codec');

class PuzzleManager {
    constructor() {
        this.currentPuzzle = null;
        this.puzzleMode = 'tutorial'; // tutorial, core-loop, spice, boss
        this.currentStreak = 0;
        this.puzzlesPath = path.join(__dirname, 'puzzles');
        this.loadedChunks = {};
        this.currentScore = 0;
        this.solveStartTime = null;
        this.remainingTime = 60; // 60 seconds total game time
        this.lastUpdateTime = null;
        this.basePoints = 100;
        this.zstdInit = null;
    }

    // Initialize puzzle system
    async init() {
        try {
            // Initialize zstd
            this.zstdInit = new Promise((resolve, reject) => {
                ZstdCodec.run(zstd => {
                    this.zstd = zstd;
                    resolve();
                });
            });
            await this.zstdInit;

            const metadata = JSON.parse(
                fs.readFileSync(path.join(this.puzzlesPath, 'metadata.json'), 'utf8')
            );
            console.log('Puzzle system initialized with metadata:', metadata);
            return true;
        } catch (error) {
            console.error('Failed to initialize puzzle system:', error);
            return false;
        }
    }

    // Load a puzzle chunk
    async loadPuzzleChunk(mode, chunkIndex) {
        // Convert mode names to match file naming convention
        const modeMap = {
            'tutorial': 'tutorial',
            'core-loop': 'coreLoop',
            'spice': 'spice',
            'boss': 'boss'
        };
        
        const formattedMode = modeMap[mode];
        const chunkPath = path.join(this.puzzlesPath, mode, `${formattedMode}-${chunkIndex}.json.gz`);
        
        try {
            const compressedData = fs.readFileSync(chunkPath);
            const decompressed = await this.decompress(compressedData);
            return JSON.parse(decompressed);
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
        const modeDir = path.join(this.puzzlesPath, this.puzzleMode);
        const files = fs.readdirSync(modeDir).filter(f => f.endsWith('.json.gz'));
        
        // Dynamic difficulty progression
        let targetChunkIndex = 0;
        
        if (this.currentStreak < 3) {
            this.puzzleMode = 'tutorial'; // mate-in-1 puzzles
        } else if (this.currentStreak < 8) {
            this.puzzleMode = 'core-loop'; // mate-in-2 puzzles
        } else {
            // After 8 correct solves, every 5th puzzle (remainder 4) should be spice
            const puzzleNumber = this.currentStreak - 8;
            if (puzzleNumber % 5 === 4) {
                this.puzzleMode = 'spice';
                targetChunkIndex = Math.min(Math.floor(puzzleNumber / 10), files.length - 1);
            } else {
                this.puzzleMode = 'core-loop';
                targetChunkIndex = Math.min(Math.floor(puzzleNumber / 5), files.length - 1);
            }
        }

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

module.exports = PuzzleManager;