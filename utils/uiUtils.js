/* TODO: Currently, SNP is not displayed
export function displaySNP(snp) {
    document.getElementById('snpDisplay').textContent = `SNP: rs${snp}`;
}*/


export function updateLoadingProgress(percentage) {
    try{
        const bar = document.getElementById('progressBar');

        if (bar) {
            bar.style.width = `${percentage}%`;
        }
    }
    catch (error) {
        console.error('HTML element not found: ', error);
    }
}


export function showAlert(inputId) {
    const alertDiv = document.querySelector(`#alert-${inputId}`);

    if (alertDiv) {
        alertDiv.classList.remove('hidden');
    }
}


export function hideAlert(inputId) {
    const alertDiv = document.querySelector(`#alert-${inputId}`);

    if (alertDiv) {
        alertDiv.classList.add('hidden');
    }
}
