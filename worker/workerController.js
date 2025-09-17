import {
    distributeProfilesByAgeGroups,
    getAgeGroupsBetween,
    updateLoadingProgress,
} from '../syntheticDataGenerator.js';


export async function handleSnpsInfo(pgsModelFile, ancestry, incidenceRateFile) {
    return new Promise((resolve, reject) => {
        const snpWorker = new Worker('worker/modelWorker.js');

        snpWorker.postMessage({
            pgsModelFile,
            ancestry,
            incidenceRateFile,
        });

        snpWorker.onmessage = (e) => {
            const { type, snpsInfo, observedIncidenceRate, predictedIncidenceRate, k, b } = e.data;

            if (type === 'meta') {
                snpWorker.terminate();
                resolve({ snpsInfo, observedIncidenceRate, predictedIncidenceRate, k, b });
            }
            else if (e.data.type === 'error') {
                console.error(`Snp Worker error:`, e.data.error);
            }
        };

        snpWorker.onerror = (error) => {
            snpWorker.terminate();
            reject(new Error(`SNP Worker error: ${error.message}`));
        };
    });
}


export async function handleProfileRetrieval(config, snpsInfo, k, b) {
    const {
        totalProfiles, minAge, maxAge, minFollowUp, maxFollowUp, populationData, gender
    } = config;

    let start = performance.now();
    const selectedAgeGroups = getAgeGroupsBetween(minAge, maxAge, populationData.ageGenderPercentages);
    const profilesByAgeGroup = distributeProfilesByAgeGroups(totalProfiles, minAge, maxAge, populationData, gender, selectedAgeGroups);
    const tasks = [];
    let taskId = 0;

    Object.entries(profilesByAgeGroup).forEach(([currentGender, groupMap]) => {
        Object.entries(groupMap).forEach(([ageGroup, count]) => {
            if (count <= 0) return;

            const startAge = parseInt(ageGroup.substring(0, 2));
            const endAge = parseInt(ageGroup.substring(2));
            const chunkSize = 25_000;
            const numChunks = Math.ceil(count / chunkSize);

            for (let i = 0; i < numChunks; i++) {
                const profilesInTask = Math.min(chunkSize, count - i * chunkSize);

                tasks.push({
                    taskId: `task_${taskId++}`,
                    snpsInfo,
                    totalProfiles: profilesInTask,
                    chunkSize,
                    gender: currentGender,
                    minAge: startAge,
                    maxAge: endAge,
                    minFollow: minFollowUp,
                    maxFollow: maxFollowUp,
                    k,
                    b
                });
            }
        });
    });

    await startWorkerPool('worker/profilesWorker.js', tasks);
    let end = performance.now();
    console.log("test:", end-start)
}


export async function handleCaseControlRetrieval(
    config, controlsPerCase, snpsInfo, k, b, incidenceRateFile, pgsModelFile
) {
    const {
        totalProfiles, chunkSize, minAge, maxAge, minFollowUp, maxFollowUp, populationData, gender
    } = config;

    const selectedAgeGroups = getAgeGroupsBetween(minAge, maxAge, populationData.ageGenderPercentages);
    const profilesByAgeGroup = distributeProfilesByAgeGroups(totalProfiles, minAge, maxAge, populationData, gender, selectedAgeGroups);
    const tasks = [];
    let taskId = 0;

    Object.entries(profilesByAgeGroup).forEach(([currentGender, groupMap]) => {
        Object.entries(groupMap).forEach(([ageGroup, count]) => {
            if (count <= 0) return;

            let startAge = parseInt(ageGroup.substring(0, 2));
            let endAge = parseInt(ageGroup.substring(2));
            const cases = count;
            const totalInGroup = cases + cases * controlsPerCase;
            const numChunks = Math.ceil(totalInGroup / chunkSize);

            if (minAge > startAge) startAge = minAge;
            if (maxAge < endAge) endAge = maxAge;

            for (let i = 0; i < numChunks; i++) {
                tasks.push({
                    taskId: `task_${taskId++}`,
                    snpsInfo,
                    numberOfCases: cases,
                    controlsPerCase,
                    chunkSize,
                    gender: currentGender,
                    minAge: startAge,
                    maxAge: endAge,
                    minFollow: minFollowUp,
                    maxFollow: maxFollowUp,
                    k,
                    b
                });
            }
        });
    });


    await startWorkerPool('worker/caseControlWorker.js', tasks);
}


function startWorkerPool(workerScript, tasks) {
    return new Promise((resolve, reject) => {
        const workerCount = 4;
        const workers = Array(workerCount).fill(null);
        let activeWorkers = 0;
        let completedTasks = 0;
        const totalTasks = tasks.length;
        const progressMap = Array(workerCount).fill(0);
        const finishProcessing = () => {
            workers.forEach(worker => {
                if (worker) worker.terminate();
            });

            resolve();
        };

        const processNextTask = (workerIndex) => {
            if (tasks.length === 0) {
                workers[workerIndex] = null;
                activeWorkers--;

                if (activeWorkers === 0 && completedTasks === totalTasks) finishProcessing();

                return;
            }

            const task = tasks.shift();
            const worker = new Worker(workerScript);
            workers[workerIndex] = worker;

            worker.postMessage({ workerId: workerIndex, ...task });

            worker.onmessage = (e) => {
                if (e.data.type === 'progress') {
                    progressMap[workerIndex] = e.data.progress;
                }
                else if (e.data.type === 'complete') {
                    worker.terminate();
                    completedTasks++;
                    processNextTask(workerIndex);
                    updateLoadingProgress((completedTasks / totalTasks) * 100);

                    if (completedTasks === totalTasks) finishProcessing();
                }
                else if (e.data.type === 'error') {
                    console.error(`Worker ${workerIndex} error:`, e.data.error);
                    worker.terminate();
                    activeWorkers--;
                    reject(new Error(`Worker ${workerIndex} error: ${e.data.error}`));
                }
            };

            worker.onerror = (error) => {
                console.error(`Worker ${workerIndex} error:`, error.message);
                alert(`Error during data generation: ${error.message}`);
                worker.terminate();
                activeWorkers--;
                reject(new Error(`Worker ${workerIndex} error: ${error.message}`));
            };
        };

        for (let i = 0; i < workerCount; i++) {
            if (tasks.length > 0) {
                activeWorkers++;
                processNextTask(i);
            }
        }

        if (totalTasks === 0) {
            resolve(); // Resolve immediately if no tasks
        }
    });
}

