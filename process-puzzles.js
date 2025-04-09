const fs = require('fs');
const fse = require('fs-extra');
const { parse } = require('csv-parse');
const zlib = require('zlib');
const path = require('path');

// Make sure output directories exist
const CHUNKS_DIR = path.join(__dirname, 'puzzles');
const CATEGORIES = {
    tutorial: path.join(CHUNKS_DIR, 'tutorial'),
    coreLoop: path.join(CHUNKS_DIR, 'core-loop'),
    spice: path.join(CHUNKS_DIR, 'spice'),
    boss: path.join(CHUNKS_DIR, 'boss')
};

// Create category directories
Object.values(CATEGORIES).forEach(dir => {
    fse.ensureDirSync(dir);
});

// Puzzle categorization rules
function categorizePuzzle(puzzle) {
    const themes = puzzle.Themes.split(' ');
    const rating = parseInt(puzzle.Rating);

    if (themes.includes('mateIn1') && rating <= 1200) {
        return 'tutorial';
    }
    
    if ((themes.includes('mateIn2') || themes.includes('mateIn3')) && rating >= 800 && rating <= 1800) {
        return 'coreLoop';
    }
    
    if (rating >= 1000 && rating <= 2000 && 
        (themes.includes('fork') || themes.includes('pin') || themes.includes('skewer') || themes.includes('doubleCheck')) &&
        !themes.some(t => t.startsWith('mate'))) {
        return 'spice';
    }
    
    if (themes.includes('mateIn3') && rating > 1800) {
        return 'boss';
    }

    return null; // Puzzle doesn't fit any category
}

// Buffers to collect puzzles by category
const puzzleBuffers = {
    tutorial: [],
    coreLoop: [],
    spice: [],
    boss: []
};

// File counters for each category
const fileCounters = {
    tutorial: 0,
    coreLoop: 0,
    spice: 0,
    boss: 0
};

const CHUNK_SIZE = 100; // Number of puzzles per file

// Save puzzles when buffer reaches chunk size
function saveBufferIfNeeded(category) {
    if (puzzleBuffers[category].length >= CHUNK_SIZE) {
        const filename = path.join(
            CATEGORIES[category], 
            `${category}-${fileCounters[category]}.json.gz`
        );
        
        // Convert to JSON and compress
        const jsonContent = JSON.stringify(puzzleBuffers[category]);
        const compressed = zlib.gzipSync(jsonContent);
        
        fs.writeFileSync(filename, compressed);
        
        // Clear buffer and increment counter
        puzzleBuffers[category] = [];
        fileCounters[category]++;
        
        console.log(`Saved ${filename}`);
    }
}

// Read and process the puzzle database
const { execSync } = require('child_process');

// First decompress the zstd file using zstd command line tool
console.log("Decompressing puzzle database...");
try {
    execSync('zstd -d -c lichess_db_puzzle.csv.zst > lichess_db_puzzle.csv');
} catch (error) {
    console.error("Error decompressing file. Make sure zstd is installed.");
    console.error("On Ubuntu/Debian: sudo apt-get install zstd");
    console.error("On macOS: brew install zstd");
    process.exit(1);
}

console.log("Parsing CSV...");
const parser = parse({
    columns: true,
    skip_empty_lines: true
});

let recordCount = 0;

parser.on('readable', () => {
    let record;
    while (record = parser.read()) {
        const category = categorizePuzzle(record);
        if (category) {
            puzzleBuffers[category].push(record);
            saveBufferIfNeeded(category);
        }
        
        recordCount++;
        if (recordCount % 10000 === 0) {
            console.log(`Processed ${recordCount} puzzles...`);
        }
    }
});

parser.on('end', () => {
    // Save any remaining puzzles in buffers
    Object.keys(puzzleBuffers).forEach(category => {
        if (puzzleBuffers[category].length > 0) {
            const filename = path.join(
                CATEGORIES[category],
                `${category}-${fileCounters[category]}.json.gz`
            );
            
            const jsonContent = JSON.stringify(puzzleBuffers[category]);
            const compressed = zlib.gzipSync(jsonContent);
            
            fs.writeFileSync(filename, compressed);
            console.log(`Saved final ${filename}`);
        }
    });

    // Generate metadata file with counts
    const metadata = {
        counts: Object.fromEntries(
            Object.entries(fileCounters).map(([category, count]) => [
                category,
                count * CHUNK_SIZE + puzzleBuffers[category].length
            ])
        ),
        timestamp: new Date().toISOString()
    };

    fs.writeFileSync(
        path.join(CHUNKS_DIR, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
    );

    console.log('Processing complete!');
    console.log('Puzzle counts:', metadata.counts);

    // Clean up the decompressed CSV file
    fs.unlinkSync('lichess_db_puzzle.csv');
});

// Start processing by piping the CSV file to the parser
fs.createReadStream('lichess_db_puzzle.csv').pipe(parser);