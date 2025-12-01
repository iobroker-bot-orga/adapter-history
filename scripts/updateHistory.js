/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
'use strict';

const fs = require('node:fs');
//const github = require('../lib/githubTools.js');

const HISTORY_FILE = './data/adapterHistory.json';
const HISTORY_LOG_FILE = './data/adapterHistoryLog.json';
const REPORT_FILE = './reports/adapterHistory.md';
const MAIL_FILE = '.adapterHistory.txt';

// Repository URLs
const LATEST_REPO_URL = 'https://download.iobroker.net/sources-dist-latest.json';
const STABLE_REPO_URL = 'https://download.iobroker.net/sources-dist.json';

// Default timeout for HTTP requests (in milliseconds)
const DEFAULT_TIMEOUT = 30000;

/**
 * Helper function to fetch JSON with timeout support.
 * @param {string} url - URL to fetch
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<object>} returns parsed JSON response
 */
async function fetchJson(url, timeout = DEFAULT_TIMEOUT) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`HTTP error retrieving ${url}, status: ${response.status}`);
        }

        return await response.json();
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Retrieves the current latest repository data from iobroker.
 * @returns {Promise<object>} returns repository json
 */
async function getLatestRepo() {
    console.log(`retrieving "${LATEST_REPO_URL}"`);
    return await fetchJson(LATEST_REPO_URL);
}

/**
 * Retrieves the current stable repository data from iobroker.
 * @returns {Promise<object>} returns repository json
 */
async function getStableRepo() {
    console.log(`retrieving "${STABLE_REPO_URL}"`);
    return await fetchJson(STABLE_REPO_URL);
}

let history = {};
let historyLog = {};
let firstRun = false;

const nowTime = Date.now();
const nowDate = new Date(nowTime);
const nowDateStr = nowDate.toISOString();

async function processLatest() {
    console.log( 'processing LATEST repository' );

    const adapters = await getLatestRepo();
    const repoTime = firstRun?'1970-01-01T00:00:00.000Z':adapters._repoInfo.repoTime;
    const historyLogKey = repoTime.split('T')[0]+'T00:00:00.000Z';

    if (! historyLog[historyLogKey]){
        historyLog[historyLogKey] = {};
        historyLog[historyLogKey].latest = {};
        historyLog[historyLogKey].stable = {};
    }

    for (const adapterName in adapters) {
        if (adapterName === '_repoInfo') continue;

        const adapter=adapters[adapterName];
        const version = adapter.version;
        if ( ! history[adapterName] ) {
            history[adapterName] = {};
            history[adapterName].published = adapter.published;
            history[adapterName].latest = {};
            history[adapterName].stable = {};
        }
        if ( ! history[adapterName].latest || ! history[adapterName].latest.listed ) {
            console.log (`NEW adapter ${adapterName} added to latest`);
            history[adapterName].latest = {};
            history[adapterName].latest.listed = true;
            history[adapterName].latest.added = repoTime;
            history[adapterName].latest.removed = '';
        }
        if ( ! history[adapterName][version] ) {
            history[adapterName][version] = {};
        }
        if ( ! history[adapterName][version].latest ) {
            console.log (`NEW adapter ${adapterName} version ${adapter.version} registered at latest`);
            history[adapterName][version].latest = {};
            history[adapterName][version].latest.published = repoTime;
            historyLog[historyLogKey].latest[adapterName] = version;
        }
    }
}

async function processStable() {
    console.log( 'processing STABLE repository' );

    const adapters = await getStableRepo();
    const repoTime = firstRun?'1970-01-01T00:00:00.000Z':adapters._repoInfo.repoTime;
    const historyLogKey = repoTime.split('T')[0]+'T00:00:00.000Z';

    if (! historyLog[historyLogKey]){
        historyLog[historyLogKey] = {};
        historyLog[historyLogKey].latest = {};
        historyLog[historyLogKey].stable = {};
    }

    for (const adapterName in adapters) {
        if (adapterName === '_repoInfo') continue;

        const adapter=adapters[adapterName];
        const version = adapter.version;
        if ( ! history[adapterName] ) {
            history[adapterName] = {};
            history[adapterName].published = adapter.published;
            history[adapterName].latest = {};
            history[adapterName].stable = {};
        }
        if ( ! history[adapterName].stable || ! history[adapterName].stable.listed ) {
            console.log (`NEW adapter ${adapterName} added to stable`);
            history[adapterName].stable = {};
            history[adapterName].stable.listed = true;
            history[adapterName].stable.added = repoTime;
            history[adapterName].stable.removed = '';
        }
        if ( ! history[adapterName][version] ) {
            history[adapterName][version] = {};
        }
        if ( ! history[adapterName][version].stable ) {
            console.log (`NEW adapter ${adapterName} version ${adapter.version} registered at stable`);
            history[adapterName][version].stable = {};
            history[adapterName][version].stable.published = repoTime;
            historyLog[historyLogKey].stable[adapterName] = version;
        }
    }
}

async function createReport() {
    console.log( 'creating report' );

    let body='';

    body += `# Adapter publishing report\n`;
    body += `\n`;


    const dates = Object.keys(historyLog).sort().reverse();
    for ( const date of dates ) {
        if (date === '1970-01-01T00:00:00.000Z') continue;

        console.log (`processing changes of ${date}`);
        body += `## ${date.split('T')[0]}\n`;

        const latest = historyLog[date].latest;
        const latestAdapterNames = Object.keys(latest);
        body += `#### updates at latest repository \n`;
        for ( const adapterName of latestAdapterNames) {
            body += `${adapterName} new release ${latest[adapterName]}  \n`;
        }

        const stable = historyLog[date].stable;
        const stableAdapterNames = Object.keys(stable);
        body += `#### updates at stable repository \n`;
        for ( const adapterName of stableAdapterNames) {
            body += `${adapterName} updated to ${stable[adapterName]}  \n`;
        }
    }

    fs.writeFile( REPORT_FILE, body, err => {
        if (err) {
            console.error(err);
        }
    });
}

async function createMail() {
    console.log( 'creating mail' );

    let body='';

    body += `Adapter publishing report created at ${nowDateStr}  \n`;
    body += `  \n`;


    const date = Object.keys(historyLog).sort().reverse()[0];
    if (date && date !== '1970-01-01T00:00:00.000Z') {

        console.log (`processing changes of ${date}`);
        const latest = historyLog[date].latest;
        const latestAdapterNames = Object.keys(latest);
        body += `updates at latest repository at ${date.split('T')[0]}  \n`;
        for ( const adapterName of latestAdapterNames) {
            body += `${adapterName} ${latest[adapterName]}  \n`;
        }

        body += `\n`;
        const stable = historyLog[date].stable;
        const stableAdapterNames = Object.keys(stable);
        body += `updates at stable repository at ${date.split('T')[0]}  \n`;
        for ( const adapterName of stableAdapterNames) {
            body += `${adapterName} ${stable[adapterName]}  \n`;
        }
    }

    fs.writeFile( MAIL_FILE, body, err => {
        if (err) {
            console.error(err);
        }
    });

}

async function exec() {

    console.log (`Update adapter history started at ${nowDate.toString()}`);

    try {
        const historyFile = fs.readFileSync(`${HISTORY_FILE}`);
        history = JSON.parse(historyFile);
    } catch (e) {
        console.log(`WARNING: ${HISTORY_FILE} could not be opened or read, will create new file.`);
        if (e.code !== 'ENOENT') {
            console.log (e);
        }
        firstRun = true;
    }

    try {
        const historyLogFile = fs.readFileSync(`${HISTORY_LOG_FILE}`);
        historyLog = JSON.parse(historyLogFile);
    } catch (e) {
        console.log(`WARNING: ${HISTORY_LOG_FILE} could not be opened or read, will create new file.`);
        if (e.code !== 'ENOENT') {
            console.log (e);
        }
    }

    console.log ('scanning adapters');

    await processLatest();
    await processStable();

    fs.writeFile( HISTORY_FILE, JSON.stringify(history), err => {
        if (err) {
            console.error(err);
        }
    });

    fs.writeFile( HISTORY_LOG_FILE, JSON.stringify(historyLog), err => {
        if (err) {
            console.error(err);
        }
    });

    await createReport();
    await createMail();

}

exec();