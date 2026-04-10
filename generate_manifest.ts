const fs = require('fs');
const path = require('path');

/**
 * Cull Manifest Generator
 * Scans a directory of images and generates a manifest.js for the reviewer tool.
 */

// Configuration from Environment or Defaults
const ASSETS_ROOT_DIR = process.env.ASSETS_DIR || path.join(__dirname, 'assets');
const MANIFEST_OUTPUT = path.join(__dirname, 'manifest.js');
const METADATA_FILE = process.env.METADATA_FILE; // Optional JSON file with mapping { filename: { name, deckId, ... } }

// Helper to scan assets recursively
function scanAssets(dir: string, rootDir: string): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    
    const list = fs.readdirSync(dir);
    for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat && stat.isDirectory()) {
            results = results.concat(scanAssets(fullPath, rootDir));
        } else if (/\.(webp|png|jpg|jpeg)$/i.test(file)) {
            results.push(fullPath);
        }
    }
    return results;
}

async function generateManifest() {
    console.log('--- Cull: Generating Asset Manifest ---');
    console.log(`Scanning Assets from: ${ASSETS_ROOT_DIR}`);

    if (!fs.existsSync(ASSETS_ROOT_DIR)) {
        console.warn(`Warning: Assets directory not found at ${ASSETS_ROOT_DIR}. Creating empty manifest.`);
        fs.writeFileSync(MANIFEST_OUTPUT, 'window.REVIEW_MANIFEST = [];');
        return;
    }

    // Load Metadata if provided
    let metadata: Record<string, any> = {};
    if (METADATA_FILE && fs.existsSync(METADATA_FILE)) {
        console.log(`Loading Metadata from: ${METADATA_FILE}`);
        try {
            metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf-8'));
        } catch (e) {
            console.error(`Error parsing metadata file: ${e}`);
        }
    }

    const allAssetPaths = scanAssets(ASSETS_ROOT_DIR, ASSETS_ROOT_DIR);
    console.log(`Found ${allAssetPaths.length} asset files.`);

    const manifestItems: any[] = [];

    for (const assetPath of allAssetPaths) {
        const relativeToRoot = path.relative(ASSETS_ROOT_DIR, assetPath);
        const parts = relativeToRoot.split(path.sep);
        const filename = parts[parts.length - 1];
        
        // Grouping logic: default to parent folder name as "Deck" or "Collection"
        const groupId = parts.length > 1 ? parts[0] : 'default';
        const variant = parts.length > 2 ? parts.slice(1, -1).join('/') : 'default';

        // Check metadata
        const meta = metadata[filename] || metadata[relativeToRoot] || {};

        manifestItems.push({
            deckId: groupId,
            deckName: meta.deckName || groupId.replace(/_/g, ' '),
            variant: variant,
            cardId: meta.id || filename.replace(/\.(webp|png|jpg|jpeg)$/i, ''),
            cardName: meta.name || filename,
            image: `assets/${relativeToRoot.replace(/\\/g, '/')}`, // Tool expects 'assets/...' or similar
            filename: filename
        });
    }

    // Sort
    manifestItems.sort((a, b) => {
        if (a.deckId !== b.deckId) return a.deckId.localeCompare(b.deckId);
        if (a.variant !== b.variant) return a.variant.localeCompare(b.variant);
        return a.cardId.localeCompare(b.cardId);
    });

    const jsContent = `window.REVIEW_MANIFEST = ${JSON.stringify(manifestItems, null, 2)};`;
    fs.writeFileSync(MANIFEST_OUTPUT, jsContent);
    
    console.log(`Manifest written to ${MANIFEST_OUTPUT}`);
    console.log(`Total items mapped: ${manifestItems.length}`);
}

generateManifest();
