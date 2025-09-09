import { loadCountries, loadDependencies, setupInput, setupCohortGeneration } from '../syntheticDataGenerator.js';


const dependencyUrls = [
    'https://cdnjs.cloudflare.com/ajax/libs/pako/1.0.11/pako.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.9.0/localforage.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdn.jsdelivr.net/npm/d3@7'
];

// Initial configuration for inputs, files, etc.
const config = {
    incidenceRateFile: '../data/breast-cancer/finland_breast_incidence_rate.csv',
    pgsModelFile: '../data/breast-cancer/PGS004908.txt',
};

/* global localforage */
(async function main() {
    try {
        await loadDependencies(dependencyUrls);
        await localforage.clear();
        await loadCountries();
        setupInput();
        setupCohortGeneration(config);
    } catch (error) {
        console.error('Initialization failed:', error);
        alert(`Error: ${error.message}`);
    }
})();