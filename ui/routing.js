export function initializeRouting() {
    const initPage = getInitialPage();

    if (!initPage) {
        throw new Error('Initial page is missing');
    }

    try {
        setupNavigationLinks();
        showPage(initPage);
    }
    catch (error) {
        console.error('Initial routing failed: ', error);
        throw error;
    }
}


export function handleRouting(event) {
    const pageId = event.state?.page || getInitialPage();

    if (!pageId) {
        throw new Error('Page id is missing');
    }

    showPage(pageId);
}


function setupNavigationLinks() {
    try {
        document.querySelectorAll('.nav-links a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.getAttribute('data-page');

                // Remove 'active' from all nav links
                document.querySelectorAll('.nav-links a').forEach(nav => {
                    nav.classList.remove('active');
                });

                // Add 'active' to the clicked link
                link.classList.add('active');

                // Show the clicked page and hide others
                document.querySelectorAll('main .page').forEach(section => {
                    section.classList.toggle('active', section.id === page);
                });

                // Show or hide shared parameters
                const sharedParams = document.getElementById('sharedParameters');

                if (!sharedParams) {
                    throw new Error('Shared parameters is missing');
                }

                if (page === 'tutorial') {
                    sharedParams.style.display = 'none';
                }
                else {
                    sharedParams.style.display = 'block';
                }
            });
        });
    }
    catch (error) {
        console.error('Navigation links setup failed', error);
        throw error;
    }

}


function showPage(pageId) {
    try {
        document.querySelectorAll('.page').forEach(page => {
            page.classList.toggle('active', page.id === pageId);
        });
    }
    catch (error) {
        console.error('Failed showing page: ', error);
        throw error;
    }
}


function getInitialPage() {
    return window.location.hash.substring(1) || 'prospective';
}