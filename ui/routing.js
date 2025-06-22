import { getHomePage } from "../syntheticDataGenerator.js";

export function initializeRouting() {
    const initPage = getHomePage();

    if (!initPage) {
        throw new Error('Initial page is missing');
    }

    try {
        setupNavigationLinks();
        setView(initPage);
    }
    catch (error) {
        console.error('Initial routing failed: ', error);
        throw error;
    }
}


export function handleRouting(event) {
    const pageId = event.state?.page || getHomePage();

    if (!pageId) {
        throw new Error('Page id is missing');
    }

    setView(pageId);
}


function setupNavigationLinks() {
    try {
        document.querySelectorAll('.nav-links a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.getAttribute('data-page');
                setView(page);
            });
        });
    } catch (error) {
        console.error('Navigation links setup failed: ', error);
        throw error;
    }
}


export function setView(page) {
    const sharedParams = document.getElementById('sharedParameters');

    // Update nav bar active state
    document.querySelectorAll('.nav-links a').forEach(nav => {
        nav.classList.toggle('active', nav.getAttribute('data-page') === page);
    });

    // Show/hide sections
    document.querySelectorAll('main .page').forEach(section => {
        section.classList.toggle('active', section.id === page);
    });

    // Toggle sharedParameters visibility
    if (sharedParams) {
        if (page === 'tutorial') {
            sharedParams.style.display = 'none';
            sharedParams.style.display
        }
        else {
            sharedParams.style.display = 'block';
        }
    }
    else {
        console.warn("Shared Parameters not found");
    }
}


function showPage(pageId) {
    try {
        const resultsDiv = document.getElementById('results');

        if (!resultsDiv.classList.contains('hidden')) {
            return;
        }

        document.querySelectorAll('.page').forEach(page => {
            page.classList.toggle('active', page.id === pageId);
        });
    }
    catch (error) {
        console.error('Failed showing page: ', error);
        throw error;
    }
}
