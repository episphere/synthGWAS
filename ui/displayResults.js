import { generateKaplanMeierData, getCohort } from '../syntheticDataGenerator.js';


export async function displayResults(isRetrospective, observedIncidenceRate, predictedIncidenceRate) {
    // Validate inputs with detailed error messages
    if (typeof isRetrospective !== 'boolean') {
        throw new Error('Need boolean isRetrospective');
    }

    if (!Array.isArray(observedIncidenceRate) || !observedIncidenceRate.length) {
        throw new Error('Missing observed data');
    }

    if (!Array.isArray(predictedIncidenceRate) || !predictedIncidenceRate.length) {
        throw new Error('Missing predicted data');
    }


    try {
        // UI State Management
        toggleResultsVisibility();

        // Parallelize independent operations where possible
        await Promise.all([
            renderIncidenceChart(observedIncidenceRate, predictedIncidenceRate),
            processCohortAndRenderKaplanMeier()
        ]);
    } catch (error) {
        console.error('displayResults failed: ', error);
        throw error;
    }
}


async function processCohortAndRenderKaplanMeier() {
    const MAX_PROFILES = 50_000;
    const cohort = await loadCohortProfiles(MAX_PROFILES);

    if (cohort.length === 0) {
        throw new Error('No cohort profiles available for Kaplan-Meier analysis');
    }

    const kmData = await generateKaplanMeierData(cohort);

    if (!kmData || kmData.length === 0) {
        throw new Error('Kaplan-Meier data generation failed');
    }

    try {
        await renderKaplanMeierChart(kmData);
        cohort.splice(0, cohort.length);

    } catch (error) {
        console.error('Failed to render chart:', error);
        throw error;
    }
}


async function loadCohortProfiles(maxProfiles) {
    if (typeof maxProfiles != 'number' || isNaN(maxProfiles)) {
        throw new Error('Max profiles must be number');
    }

    const cohort = [];
    let profileCount = 0;
    const cohortIterator = getCohort({ prefix: 'task_', remapIds: true });

    if (!cohortIterator || typeof cohortIterator[Symbol.asyncIterator] !== 'function') {
        throw new Error('Cohort iterator is not an async iterable');
    }

    try {
        for await (const profile of cohortIterator) {
            cohort.push(profile);
            profileCount++;

            if (profileCount >= maxProfiles) break;
        }

        return cohort;
    } catch (error) {
        console.error(`Failed to load cohort profiles: ${error.message}`);
        throw error;
    }
}


function renderKaplanMeierChart(kmCurveData) {
    if (!kmCurveData || !Array.isArray(kmCurveData)) {
        throw new TypeError('Missing or invalid input');
    }

    kmCurveData = kmCurveData.filter(d =>
        !isNaN(d.time) && !isNaN(d.lower) && !isNaN(d.upper)
    );

    // Get the container dimensions from CSS
    const htmlElement = d3.select('#kaplanMeierCurve');

    if (!htmlElement) {
        throw new Error('HTML not found');
    }

    const currentChart = document.getElementById('#kaplanMeierCurve svg');

    if (currentChart) {
        currentChart.destroy();
    }

    const container = htmlElement.node();
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Calculate responsive margins (percentage-based)
    const margin = {
        top: Math.min(70, containerHeight * 0.1),    // 10% or 70px max
        right: Math.min(300, containerWidth * 0.1),  // 20% or 280px max
        bottom: Math.min(80, containerHeight * 0.1), // 10% or 80px max
        left: Math.min(70, containerWidth * 0.1)     // 10% or 60px max
    };

    const width = containerWidth - margin.left - margin.right;
    const height = containerHeight - margin.top - margin.bottom;

    // Clear previous chart
    htmlElement.html('');

    const svg = htmlElement
        .append('svg')
        .attr('viewBox', `0 0 ${containerWidth} ${containerHeight}`)
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .style('font-family', 'sans-serif')
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);


    // Scales
    const x = d3.scaleLinear()
        .domain(d3.extent(kmCurveData, d => d.time))
        .range([0, width]);

    const y = d3.scaleLinear()
        .domain([0, 1])
        .range([height, 0]);

    // Axes
    const xAxis = d3.axisBottom(x).ticks(5);
    const yAxis = d3.axisLeft(y).ticks(6).tickFormat(d3.format('.0%'));

    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(xAxis)
        .append('text')
        .attr('class', 'axis-label')
        .attr('x', width / 2)
        .attr('y', 40)
        .attr('fill', 'black')
        .text('Time (years)');

    svg.append('g')
        .call(yAxis)
        .append('text')
        .attr('class', 'axis-label')
        .attr('x', -height / 2)
        .attr('y', -50)
        .attr('transform', 'rotate(-90)')
        .attr('fill', 'black')
        .attr('text-anchor', 'middle')
        .text('Percent survival');

    // Step-after line generator for survival
    const lineSurvival = d3.line()
        .x(d => x(d.time))
        .y(d => y(d.survival))
        .curve(d3.curveStepAfter);

    // Step-after line generator for upper CI
    const lineUpper = d3.line()
        .x(d => x(d.time))
        .y(d => y(d.upper))
        .curve(d3.curveStepAfter);

    // Step-after line generator for lower CI
    const lineLower = d3.line()
        .x(d => x(d.time))
        .y(d => y(d.lower))
        .curve(d3.curveStepAfter);

    // Draw confidence interval area
    svg.append('path')
        .datum(kmCurveData)
        .attr('fill', 'red')
        .attr('opacity', 0.15)
        .attr('stroke', 'none')
        .attr('d', d3.area()
            .x(d => x(d.time))
            .y0(d => y(d.lower))
            .y1(d => y(d.upper))
            .curve(d3.curveStepAfter)
        );

    // Draw survival line
    svg.append('path')
        .datum(kmCurveData)
        .attr('fill', 'none')
        .attr('stroke', 'red')
        .attr('stroke-width', 3)
        .attr('d', lineSurvival);

    // Tooltip setup
    const tooltip = d3.select('#tooltip');

    if (!tooltip) {
        throw new Error('No tooltip provided');
    }

    // Draw points for tooltip interaction
    svg.selectAll('circle')
        .data(kmCurveData)
        .join('circle')
        .attr('cx', d => x(d.time))
        .attr('cy', d => y(d.survival))
        .attr('r', 5)
        .attr('fill', 'red')
        .attr('opacity', 0)
        .on('mouseover', (event, d) => {
            tooltip.style('opacity', 1)
                .html(
                    `Time: ${d.time.toFixed(2)}<br>` +
                    `Survival probability: ${(d.survival * 100).toFixed(1)}%<br>` +
                    `95% CI: (${(d.lower * 100).toFixed(1)}%, ${(d.upper * 100).toFixed(1)}%)`
                )
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 28) + 'px');
            d3.select(event.currentTarget).attr('opacity', 1);
        })
        .on('mousemove', (event) => {
            tooltip.style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', (event) => {
            tooltip.style('opacity', 0);
            d3.select(event.currentTarget).attr('opacity', 0);
        });
}


export function toggleResultsVisibility() {
    const prospectiveGroup = document.querySelector('#prospective');
    const retrospectiveGroup = document.querySelector('#retrospective');
    const tutorial = document.querySelector('#tutorial');
    const sharedParameters = document.getElementById('sharedParameters');
    const generateButton = document.getElementById('prospectiveGenerate');
    const resultsDiv = document.getElementById('results');

    if (!prospectiveGroup || !retrospectiveGroup || !generateButton || !resultsDiv || !sharedParameters) {
        throw new Error('HTML elements not found.');
    }

    if (resultsDiv.classList.contains('hidden')) {
        prospectiveGroup.style.display = 'none';
        retrospectiveGroup.style.display = 'none';
        tutorial.style.display = 'none';
        sharedParameters.style.display = 'none';
        generateButton.style.display = 'none';
        resultsDiv.classList.remove('hidden');
    }
    else {
        prospectiveGroup.style.display = '';
        retrospectiveGroup.style.display = '';
        tutorial.style.display = '';
        sharedParameters.style.display = '';
        generateButton.style.display = '';
        resultsDiv.classList.add('hidden');
    }
}


export async function renderIncidenceChart(observedIncidenceRate, predictedIncidenceRate) {
    /* global Chart */
    if (!observedIncidenceRate || !predictedIncidenceRate) {
        throw new Error('Missing input');
    }

    const observedRates = observedIncidenceRate.map(entry => entry.rate);
    const predictedRates = predictedIncidenceRate.map(entry => entry.rate);

    if (observedRates.some(rate => isNaN(rate)) || predictedRates.some(rate => isNaN(rate))) {
        throw new Error('Non-numeric rate found in observedData');
    }

    const labels = observedIncidenceRate.map(entry => entry.age);

    const config = {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Observed Incidence',
                    data: observedRates,
                    borderColor: 'red',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0,
                    borderDash: [2, 2]
                },
                {
                    label: 'Predicted Incidence',
                    data: predictedRates,
                    borderColor: 'blue',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,  // <---- add this
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(tooltipItem) {
                            const datasetLabel = tooltipItem.dataset.label;
                            const value = tooltipItem.raw.toFixed(4);

                            return `${datasetLabel} - Age ${tooltipItem.label}: ${value}`;
                        }
                    }
                }
            },
            scales: {
                x: { title: { display: true, text: 'Age →' } },
                y: {
                    title: { display: true, text: '↑ Incidence Rate' },
                    beginAtZero: true
                }
            }
        }
    };

    const ctx = document.getElementById('expectedIncidenceChartProspective').getContext('2d');

    if (!ctx) {
        throw new Error('HTML element not found');
    }

    const chartExists = Chart?.getChart('expectedIncidenceChartProspective');

    if (chartExists) {
        chartExists.destroy();
    }

    try {
        new Chart(ctx, config);
    }
    catch (error) {
        console.error("Failed to create chart:", error);
        ctx.canvas.parentElement.innerHTML = '<p class="chart-error">Chart could not be displayed</p>';

        throw error;
    }
}


export function createTable(header, data, tableId = 'groupedTable', useDividers = true) {
    if (!header || !data || !data.length) {
        throw new Error('Missing or invalid input');
    }

    const tableContainer = document.getElementById(tableId) || document.createElement('div');

    tableContainer.id = tableId;
    tableContainer.innerHTML = '';
    document.body.appendChild(tableContainer);

    const table = document.createElement('table');

    table.style.borderCollapse = 'collapse';
    table.style.width = '100%';
    table.style.margin = '20px 0';

    // Create header row
    const headerRow = document.createElement('tr');

    header.forEach(headerText => {
        const th = document.createElement('th');
        th.textContent = headerText;
        th.style.border = '1px solid #222';
        th.style.padding = '12px';
        th.style.backgroundColor = '#f8f9fa';
        th.style.fontWeight = '600';
        headerRow.appendChild(th);
    });
    table.appendChild(headerRow);

    // Create data rows
    data.forEach((row, rowIndex) => {
        const tr = document.createElement('tr');

        row.forEach((cellValue, cellIndex) => {
            const td = document.createElement('td');
            const headerName = header[cellIndex];
            let formattedValue = cellValue;

            // Format based on header name and data type
            if (typeof cellValue === 'number') {
                if (headerName.toLowerCase().includes('prs')) {
                    formattedValue = cellValue.toFixed(4);
                }
                else {
                    formattedValue = Number.isInteger(cellValue)
                        ? cellValue
                        : parseInt(cellValue, 10);
                }
            }
            else if (Array.isArray(cellValue)) {
                formattedValue = cellValue.join(', ');
            }

            td.textContent = formattedValue;
            td.style.border = '1px solid #ddd';
            td.style.padding = '10px';
            td.style.textAlign = 'center';
            tr.appendChild(td);
        });

        table.appendChild(tr);
    });
}