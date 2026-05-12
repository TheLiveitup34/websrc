class Search {
    constructor(gameNames) {
        this.gameNames = gameNames;
        this.nameIndex = {};
        this.minScore = 0.4; // Minimum similarity score (0-1)

        this.buildIndex();
    }

    /**
     * Builds search index with normalized versions of game names
     */
    buildIndex() {
        this.gameNames.forEach(name => {
            // Store original case version
            this.nameIndex[name] = name;

            // Store lowercase normalized version
            const normalized = this.normalizeString(name);
            this.nameIndex[normalized] = name;

            // Store initial characters for quick filtering
            const initials = this.getInitials(name);
            if (initials) {
                this.nameIndex[initials] = name;
            }

            // Store common abbreviations
            const words = normalized.split(' ');
            if (words.length > 1) {
                let acronym = '';
                words.forEach(word => {
                    acronym += word.length > 0 ? word[0] : '';
                });
                if (acronym.length > 1) {
                    this.nameIndex[acronym] = name;
                }
            }
        });
    }

    /**
     * Search for games matching the query
     */
    search(query, limit = 10) {
        query = this.normalizeString(query);
        const exact = {};
        const fuzzy = {};

        // First look for exact matches
        Object.keys(this.nameIndex).forEach(indexed => {
            const original = this.nameIndex[indexed];

            // Exact match
            if (indexed.toLowerCase().includes(query.toLowerCase())) {
                exact[original] = 1.0;
                return;
            }

            // Calculate fuzzy match score
            const score = this.calculateSimilarity(query, indexed);
            if (score >= this.minScore) {
                fuzzy[original] = score;
            }
        });

        // Sort results by score (descending)
        const sortedExact = Object.entries(exact).sort((a, b) => b[1] - a[1]);
        const sortedFuzzy = Object.entries(fuzzy).sort((a, b) => b[1] - a[1]);

        // Merge results
        const results = [...sortedExact, ...sortedFuzzy];

        // Format results with scores and suggestions
        const formatted = [];
        let count = 0;

        for (const [name, score] of results) {
            if (count >= limit) break;

            formatted.push({
                name: name,
                score: score,
                isExact: exact.hasOwnProperty(name),
                distance: this.damerauLevenshteinDistance(query, this.normalizeString(name))
            });
            count++;
        }

        return formatted;
    }

    /**
     * Calculate string similarity using Damerau-Levenshtein distance
     */
    calculateSimilarity(str1, str2) {
        str1 = this.normalizeString(str1);
        str2 = this.normalizeString(str2);

        // Get length of strings
        const len1 = str1.length;
        const len2 = str2.length;

        // If one string is empty, return 0
        if (len1 === 0 || len2 === 0) {
            return 0.0;
        }

        // Calculate Damerau-Levenshtein distance
        const distance = this.damerauLevenshteinDistance(str1, str2);

        // Calculate similarity score (0-1)
        const maxLen = Math.max(len1, len2);
        let similarity = 1 - (distance / maxLen);

        // Boost score for transposition matches
        if (this.hasTransposition(str1, str2)) {
            similarity += 0.1; // Boost score for transposed matches
            similarity = Math.min(similarity, 0.95); // Cap at 0.95 to keep exact matches highest
        }

        return similarity;
    }

    /**
     * Check if strings have transposed characters
     */
    hasTransposition(str1, str2) {
        const len1 = str1.length;
        const len2 = str2.length;

        if (Math.abs(len1 - len2) > 1) {
            return false;
        }

        for (let i = 0; i < Math.min(len1 - 1, len2 - 1); i++) {
            if (str1[i] !== str2[i]) {
                // Check for transposition
                if (
                    i + 1 < len1 &&
                    i + 1 < len2 &&
                    str1[i] === str2[i + 1] &&
                    str1[i + 1] === str2[i]
                ) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Implement Damerau-Levenshtein distance with transposition support
     */
    damerauLevenshteinDistance(str1, str2) {
        const len1 = str1.length;
        const len2 = str2.length;

        // Quick return if possible
        if (len1 === 0) return len2;
        if (len2 === 0) return len1;
        if (str1 === str2) return 0;

        // Create matrix
        const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

        // Initialize first row and column
        for (let i = 0; i <= len1; i++) {
            matrix[i][0] = i;
        }
        for (let j = 0; j <= len2; j++) {
            matrix[0][j] = j;
        }

        // Fill matrix
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = (str1[i - 1] === str2[j - 1]) ? 0 : 1;

                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,        // deletion
                    matrix[i][j - 1] + 1,        // insertion
                    matrix[i - 1][j - 1] + cost  // substitution
                );

                // Check for transposition
                if (
                    i > 1 &&
                    j > 1 &&
                    str1[i - 1] === str2[j - 2] &&
                    str1[i - 2] === str2[j - 1]
                ) {
                    matrix[i][j] = Math.min(
                        matrix[i][j],
                        matrix[i - 2][j - 2] + cost  // transposition
                    );
                }
            }
        }

        return matrix[len1][len2];
    }

    /**
     * Normalize string for comparison
     */
    normalizeString(str) {
        // Convert to lowercase and remove special characters
        str = str.toLowerCase();

        // Remove special characters and extra spaces (keep letters, numbers, spaces)
        str = str.replace(/[^\p{L}\p{N}\s]/gu, '');
        str = str.replace(/\s+/g, ' ');

        return str.trim();
    }

    /**
     * Get initials from multi-word string
     */
    getInitials(str) {
        const words = this.normalizeString(str).split(' ');
        let initials = '';
        words.forEach(word => {
            initials += word.length > 0 ? word[0] : '';
        });
        return initials;
    }
}