const PuzzleManager = require('../puzzle-manager');
const fs = require('fs');
const path = require('path');

// Mock fs and path modules
jest.mock('fs');
jest.mock('path', () => ({
    ...jest.requireActual('path'),
    join: (...args) => args.join('/'),
}));

describe('PuzzleManager', () => {
    let manager;

    beforeEach(async () => {
        // Reset all mocks
        jest.clearAllMocks();
        
        // Mock filesystem
        fs.readFileSync.mockImplementation((path) => {
            if (path.includes('metadata.json')) {
                return JSON.stringify({ version: '1.0.0' });
            }
            // Return mock gzipped puzzle data
            return Buffer.from('mock-compressed-data');
        });

        fs.readdirSync.mockReturnValue(['chunk-0.json.gz', 'chunk-1.json.gz']);

        manager = new PuzzleManager();
        await manager.init();

        // Mock decompress to return valid puzzle data
        manager.decompress = async () => JSON.stringify([{
            FEN: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            Moves: 'e2e4 e7e5',
            Rating: '1500',
            Themes: 'mateIn1 middlegame'
        }]);
    });

    test('initial game state', () => {
        expect(manager.currentScore).toBe(0);
        expect(manager.currentStreak).toBe(0);
        expect(manager.remainingTime).toBe(60);
        expect(manager.puzzleMode).toBe('tutorial');
    });

    test('score calculation', () => {
        manager.currentStreak = 5;
        const score = manager.calculatePuzzleScore(5);
        expect(score).toBeGreaterThan(240);
        expect(score).toBeLessThan(260);
    });

    test('difficulty progression', async () => {
        // First 3 puzzles should be tutorial (mate in 1)
        expect(manager.puzzleMode).toBe('tutorial');
        
        // Simulate solving 3 puzzles
        manager.currentStreak = 3;
        await manager.getNextPuzzle();
        expect(manager.puzzleMode).toBe('core-loop');
        
        // Simulate solving to puzzle 12 (streak = 8)
        // This should be a spice puzzle (8 - 8 = 0, 0 % 5 = 0)
        manager.currentStreak = 12;
        await manager.getNextPuzzle();
        expect(manager.puzzleMode).toBe('spice');
    });

    test('game timer', () => {
        manager.startPuzzleTimer();
        manager.lastUpdateTime -= 1000; // Simulate 1 second passing
        const remaining = manager.updateGameTimer();
        expect(remaining).toBe(59);
    });

    test('game over condition', () => {
        manager.remainingTime = 0;
        expect(manager.isGameOver()).toBe(true);
        
        const finalScore = manager.getFinalScore();
        expect(finalScore).toHaveProperty('score');
        expect(finalScore).toHaveProperty('streak');
        expect(finalScore).toHaveProperty('puzzlesSolved');
    });

    test('goal text generation', () => {
        const matePuzzle = {
            FEN: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            Themes: 'mateIn2 middlegame'
        };
        expect(manager.getGoalText(matePuzzle)).toBe('White to move – Mate in 2');

        const tacticalPuzzle = {
            FEN: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1',
            Themes: 'fork attack middlegame'
        };
        expect(manager.getGoalText(tacticalPuzzle)).toBe('Black to move – Find the fork');
    });
});