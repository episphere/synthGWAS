import {
    handleCaseControlRetrieval,
    handleProfileRetrieval,
    handleSnpsInfo,
    downloadVcfFromChunks,
    downloadCohortFromChunks,
    loadPopulation, showAlert, hideAlert, displayResults, toggleResultsVisibility, updateLoadingProgress,
    setView, getHomePage, showLoading, showLoadingText, hideLoading
} from '../syntheticDataGenerator.js';
import { GENDER, DEFAULT_CHUNK_SIZE } from '../constants.js';


/* global localforage */
async function handleDataGeneration(params) {
    const {
        isRetrospective = false,
        countryISO,
        gender = 'both',
        pgsIdInput,
        numberOfProfiles,
        minAge,
        maxAge,
        minFollowUp,
        maxFollowUp,
        controlsPerCase = 1,
    } = params;

    let hasError = false;

    hideAlert('country');
    hideAlert('pgs');
    hideAlert('profiles');
    hideAlert('cases');
    hideAlert('age-range');
    hideAlert('age-follow');
    hideAlert('controls');

    if (!countryISO) {
        showAlert('country');
        hasError = true;
    }

    if (!/^(PGS\d{6}|\d{1,6})$/.test(pgsIdInput)) {
        showAlert('pgs');
        hasError = true;
    }

    if (!numberOfProfiles || isNaN(numberOfProfiles) || Number(numberOfProfiles) <= 0) {
        if (isRetrospective) showAlert('cases');
        else showAlert('profiles');
        hasError = true;
    }

    if (!minAge || isNaN(minAge) || !maxAge || isNaN(maxAge) || Number(minAge) < 0 || Number(maxAge) < Number(minAge)) {
        showAlert('age-range');
        hasError = true;
    }

    if (!minFollowUp || isNaN(minFollowUp) || !maxFollowUp || isNaN(maxFollowUp) || Number(minFollowUp) < 0 || Number(maxFollowUp) < Number(minFollowUp)) {
        showAlert('age-follow');
        hasError = true;
    }

    if (!controlsPerCase || isNaN(controlsPerCase)) {
        showAlert('controls');
        hasError = true;
    }

    if (hasError) return;

    showLoading('spinner');
    showLoadingText('Modeling Hazard Rates...')
    updateLoadingProgress(0);

    let snpsInfo, observedIncidenceRate, predictedIncidenceRate, k, b;
    const incidenceRateFile = '../data/age_specific_breast_cancer_incidence_rates.csv';
    const pgsModelFile = 'data/pgs_model_test.txt';

    try {
        ({ snpsInfo, observedIncidenceRate, predictedIncidenceRate, k, b } = await handleSnpsInfo(
            pgsIdInput,
            incidenceRateFile,
            pgsModelFile
        ));
    } catch (error) {
        console.error('Failed to load SNPs info: ', error);
        alert('Error loading SNPs information, please reload the page and try again');

        throw error;
    }

    const populationData = await localforage.getItem('populationData');

    if (!populationData) {
        throw new Error('Could not find population data');
    }

    try {
        setTimeout(() => {
            showLoading('bar');
            showLoadingText('Generating Synthetic Cohort...')
        }, 10);

        let config = {
            totalProfiles: Number(numberOfProfiles),
            chunkSize: 0,
            minAge: Number(minAge),
            maxAge: Number(maxAge),
            minFollowUp: Number(minFollowUp),
            maxFollowUp: Number(maxFollowUp),
            populationData: populationData,
            gender: GENDER.FEMALE//TODO: gender
        };

        if (isRetrospective) {
            config.chunkSize = DEFAULT_CHUNK_SIZE;
            await handleCaseControlRetrieval(config, controlsPerCase, snpsInfo, k, b, incidenceRateFile, pgsModelFile);
        }
        else {
            config.chunkSize = Math.min(DEFAULT_CHUNK_SIZE, Number(numberOfProfiles));
            await handleProfileRetrieval(config, snpsInfo, k, b, incidenceRateFile, pgsModelFile);
        }

        hideLoading();

        return { observedIncidenceRate, predictedIncidenceRate };
    } catch (error) {
        console.error('Error during profile generation: ', error.message);
        alert('Error during profile generation, please reload the page and try again');
        throw error;
    }
}


export function initializeUI(config) {
    setupSlideshow();
    setupButtons();
    setupInput();
    setupCohortGeneration();
}


export function setupSlideshow() {
    let slideIndex = 1;

    function showSlides(n) {
        const charts = document.getElementsByClassName("charts");
        const dots = document.getElementsByClassName("dot");

        if (charts.length === 0) return;

        if (n > charts.length) slideIndex = 1;
        if (n < 1) slideIndex = charts.length;

        for (let i = 0; i < charts.length; i++) {
            charts[i].style.display = "none";
        }

        for (let i = 0; i < dots.length; i++) {
            dots[i].classList.remove("active");
        }

        charts[slideIndex - 1].style.display = "block";
        if (dots[slideIndex - 1]) {
            dots[slideIndex - 1].classList.add("active");
        }
    }

    function plusSlides(n) {
        showSlides(slideIndex += n);
    }

    function currentSlide(n) {
        showSlides(slideIndex = n);
    }

    // Attach event listeners
    const prevBtn = document.getElementById("prevSlide");
    const nextBtn = document.getElementById("nextSlide");

    if (prevBtn) prevBtn.addEventListener("click", () => plusSlides(-1));
    if (nextBtn) nextBtn.addEventListener("click", () => plusSlides(1));

    const dots = document.querySelectorAll(".dot");
    dots.forEach((dot, index) => {
        dot.addEventListener("click", () => currentSlide(index + 1));
    });

    // Initialize slideshow
    showSlides(slideIndex);
}


function setupButtons() {
    // Download profiles
    /* global localforage, pako */
    try {
        document.getElementById('downloadProspective')?.addEventListener('click', async () => {
            await downloadCohortFromChunks({
                prefix: 'task_',
                filename: 'all_profiles.csv',
                splitDataset: false
            });
        });

        document.getElementById('downloadRetrospective')?.addEventListener('click', async () => {
            await downloadCohortFromChunks({
                prefix: 'task_',
                filename: 'case_controls.csv',
                splitDataset: true
            });
        });

        // Download VCF
        document.getElementById('downloadProspectiveVCF')?.addEventListener('click', async () => {
            const header = await localforage.getItem('header');

            await downloadVcfFromChunks({
                header: header,
                prefix: 'task_',
                filename: 'profiles.vcf'
            });
        });

        document.getElementById('reset').addEventListener('click', async() => {
            await toggleResultsVisibility();
            setView(getHomePage());
        });
    }
    catch (error) {
        console.error('Error setting buttons: ', error);
        throw error;
    }
}


/* global localforage */
function setupInput() {
    try {
        document.getElementById('countrySelect').addEventListener('change', async (e) => {
            const countryISO = e.target.value;

            if (countryISO) {
                const ageData = await loadPopulation(countryISO);
                await localforage.setItem('populationData', ageData);
            }
        });

        // TODO: Currently only the Female gender is allowed
        // <option value="${GENDER.BOTH}" selected>Both</option>
        //         <option value="${GENDER.MALE}">Male</option>
        document.getElementById('genderSelect').innerHTML = `
        <option value="${GENDER.FEMALE}">Female</option>
    `;

        document.getElementById('pgsId').innerHTML = `
        <option value="${'PGS000004'}">Breast Cancer (PGS000004)</option>
    `;
    }
    catch (error) {
        console.error('Error setting input parameters: ', error);
        throw error;
    }
}


function setupCohortGeneration() {
    const prospectiveBtn = document.getElementById('prospectiveGenerate');
    const retrospectiveBtn = document.getElementById('retrospectiveGenerate');

    prospectiveBtn.addEventListener('click', async () => {
        const params = getParams(false);
        if (!validateParams(params)) return;
        await generateAndDisplay(params);
    });

    retrospectiveBtn.addEventListener('click', async () => {
        const params = getParams(true);
        if (!validateParams(params)) return;
        await generateAndDisplay(params);
    });
}


function getParams(isRetrospective) {
    return {
        isRetrospective,
        countryISO: document.getElementById('countrySelect').value.trim(),
        gender: document.getElementById('genderSelect').value.trim(),
        pgsIdInput: document.getElementById('pgsId').value.trim(),
        numberOfProfiles: document.getElementById('numberOfProfiles').value.trim(),
        minAge: document.getElementById('minAge').value.trim(),
        maxAge: document.getElementById('maxAge').value.trim(),
        minFollowUp: document.getElementById('minFollowUp').value.trim(),
        maxFollowUp: document.getElementById('maxFollowUp').value.trim(),
        controlsPerCase: document.getElementById('controlsPerCase').value.trim(),
        loadingScreen: document.getElementById('loadingScreen'),
    };
}


function validateParams(params) {
    let hasError = false;

    hideAlert('country');
    hideAlert('pgs');
    hideAlert('profiles');
    hideAlert('cases');
    hideAlert('age-range');
    hideAlert('age-follow');
    hideAlert('controls');

    if (!params.countryISO) {
        showAlert('country');
        hasError = true;
    }

    if (!/^(PGS\d{6}|\d{1,6})$/.test(params.pgsIdInput)) {
        showAlert('pgs');
        hasError = true;
    }

    if (!params.numberOfProfiles || isNaN(params.numberOfProfiles) || Number(params.numberOfProfiles) <= 0) {
        if (params.isRetrospective) showAlert('cases');
        else showAlert('profiles');
        hasError = true;
    }

    if (!params.minAge || isNaN(params.minAge) || !params.maxAge || isNaN(params.maxAge) ||
        Number(params.minAge) < 0 || Number(params.maxAge) < Number(params.minAge)) {
        showAlert('age-range');
        hasError = true;
    }

    if (!params.minFollowUp || isNaN(params.minFollowUp) || !params.maxFollowUp || isNaN(params.maxFollowUp) ||
        Number(params.minFollowUp) < 0 || Number(params.maxFollowUp) < Number(params.minFollowUp)) {
        showAlert('age-follow');
        hasError = true;
    }

    if (!params.controlsPerCase || isNaN(params.controlsPerCase)) {
        showAlert('controls');
        hasError = true;
    }

    return !hasError;
}


async function generateAndDisplay(params) {
    try {
        const { observedIncidenceRate, predictedIncidenceRate } = await handleDataGeneration(params);
        await displayResults(params.isRetrospective, observedIncidenceRate, predictedIncidenceRate);
    } catch (error) {
        console.error('Error generating cohort:', error);
        alert('Failed to generate cohort. Please check your input or try again.');
    }
}
