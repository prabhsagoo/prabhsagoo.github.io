const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const { URL } = require('url');

const app = express();
app.use(cors());

const XTREAM_URL = 'http://starshare.one';
const USERNAME = '6719747';
const PASSWORD = '9747671';

// VLC Headers: Strictly required to bypass 401 blocks
const vlcHeaders = { 
    'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18', 
    'Accept': '*/*', 
    'Connection': 'keep-alive' 
};

// --- 1. LIVE TV: MANIFEST GENERATOR ---
app.get('/live/:id.m3u8', async (req, res) => {
    const { id } = req.params;
    // Construct the real upstream URL
    const upstreamUrl = `${XTREAM_URL}/live/${USERNAME}/${PASSWORD}/${id}.m3u8`;

    try {
        const response = await axios.get(upstreamUrl, { headers: vlcHeaders });
        const manifest = response.data;
        const lines = manifest.split('\n');
        
        // Rewrite the manifest to point to our local mirror
        const newManifest = lines.map(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('#') || trimmed === '') return line;
            
            // 1. Resolve relative paths (like "hlsr/...") to absolute URLs
            const absoluteUpstream = new URL(trimmed, upstreamUrl).href;
            
            // 2. Dynamic Mirror Link: Adapts to localhost OR Heroku domain automatically
            // e.g. http://starshare.one/hlsr/1.ts -> https://your-app.herokuapp.com/mirror/hlsr/1.ts
            const localDomain = `${req.protocol}://${req.get('host')}/mirror`;
            return absoluteUpstream.replace(XTREAM_URL, localDomain);
        }).join('\n');

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.send(newManifest);
    } catch (e) {
        console.error("Manifest Error:", e.message);
        res.status(500).send("Error generating playlist");
    }
});

// --- 2. LIVE TV: MANUAL MIRROR PROXY ---
// app.use matches ANY path starting with /mirror.
// We manually fetch the content to ensure headers are strictly VLC.
app.use('/mirror', async (req, res) => {
    try {
        // req.url contains the path *after* /mirror (e.g. "/hlsr/123.ts")
        const targetUrl = `${XTREAM_URL}${req.url}`;

        // Fetch using axios stream
        const response = await axios({
            method: 'get',
            url: targetUrl,
            headers: vlcHeaders, // Strictly send VLC headers
            responseType: 'stream',
            timeout: 15000
        });
        
        // Forward the content type
        if (response.headers['content-type']) {
            res.setHeader('Content-Type', response.headers['content-type']);
        }
        
        // Pipe the data directly to the browser
        response.data.pipe(res);
    } catch (e) {
        // Silent fail allows the player to retry the next chunk
        res.status(404).end();
    }
});

// --- 3. VOD (MOVIES & SERIES) ---
app.get('/stream/vod/:id', async (req, res) => {
    let { id } = req.params;
    if (!id.includes('.')) id += '.mp4';
    
    const streamUrl = `${XTREAM_URL}/movie/${USERNAME}/${PASSWORD}/${id}`;

    try {
        const headers = { ...vlcHeaders };
        if (req.headers.range) headers['Range'] = req.headers.range;

        const response = await axios({
            method: 'get', url: streamUrl, headers: headers,
            responseType: 'stream', timeout: 60000
        });

        res.status(response.status);
        ['content-range', 'accept-ranges', 'content-length', 'content-type'].forEach(h => {
            if (response.headers[h]) res.setHeader(h, response.headers[h]);
        });
        
        response.data.pipe(res);
    } catch (e) {
        res.status(500).end();
    }
});

// --- API DATA ROUTES ---
app.get('/api/categories/:type', async (req, res) => {
    const { type } = req.params;
    const action = type === 'series' ? 'get_series_categories' : (type === 'vod' ? 'get_vod_categories' : 'get_live_categories');
    try {
        const response = await axios.get(`${XTREAM_URL}/player_api.php?username=${USERNAME}&password=${PASSWORD}&action=${action}`, { headers: vlcHeaders });
        res.json(Array.isArray(response.data) ? response.data : []);
    } catch (e) { res.json([]); }
});

app.get('/api/list/:type/:catId', async (req, res) => {
    const { type, catId } = req.params;
    const action = type === 'series' ? 'get_series' : (type === 'vod' ? 'get_vod_streams' : 'get_live_streams');
    const catParam = catId === 'all' ? '' : `&category_id=${catId}`;
    try {
        const response = await axios.get(`${XTREAM_URL}/player_api.php?username=${USERNAME}&password=${PASSWORD}&action=${action}${catParam}`, { headers: vlcHeaders });
        res.json(Array.isArray(response.data) ? response.data : []);
    } catch (e) { res.json([]); }
});

app.get('/api/series-info/:seriesId', async (req, res) => {
    try {
        const response = await axios.get(`${XTREAM_URL}/player_api.php?username=${USERNAME}&password=${PASSWORD}&action=get_series_info&series_id=${req.params.seriesId}`, { headers: vlcHeaders });
        res.json(response.data);
    } catch (e) { res.json({}); }
});

app.use(express.static(path.join(__dirname, 'public')));

// --- THE CRITICAL FIX: DYNAMIC PORT BINDING ---
// Use Heroku's assigned port OR fallback to 3000 locally
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));