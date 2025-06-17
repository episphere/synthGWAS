importScripts('https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.js');
importScripts('https://cdnjs.cloudflare.com/ajax/libs/pako/1.0.11/pako.min.js');


self.onmessage = async (e) => {
    /* global localforage */
    const {
        pgsId,
        incidenceRateFile,
        pgsModelFile
    } = e.data;
    try {
        const {
            parseCsv, getSnpsInfo, processHeader, processPRS, generateWeibullIncidenceCurve, estimateWeibullParameters, empiricalCdf
        } = await import('../syntheticDataGenerator.js');

        const snpsInfo = await getSnpsInfo(pgsId, pgsModelFile);
        const header = await processHeader(snpsInfo);
        const observedIncidenceRate = await parseCsv(incidenceRateFile, { delimiter: ',' });
        const trainingLP = processPRS(snpsInfo);
        const [k, b] = estimateWeibullParameters(empiricalCdf(observedIncidenceRate), trainingLP);
        const exp_b = Math.exp(b);
        //const [k, b] = [3.6751234798345402, 2.256356405011471e-8]
        const predictedIncidenceRate = generateWeibullIncidenceCurve(k, exp_b, trainingLP, observedIncidenceRate.length);

        await localforage.setItem('header', header);

        // Send metadata and initialization signal
        self.postMessage({
            type: 'meta',
            snpsInfo: snpsInfo,
            observedIncidenceRate,
            predictedIncidenceRate,
            k: k,
            b: exp_b
        });
    } catch (error) {
        self.postMessage({ type: 'error', error: error.message });
    }
};
