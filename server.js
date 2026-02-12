const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());

// --- CONFIGURATION ---
const XTREAM_URL = 'http://starshare.one';
const USERNAME = '6719747';
const PASSWORD = '9747671';

const vlcHeaders = {
  'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
  'Accept': '*/*',
  'Connection': 'keep-alive'
};

// --- API: CATEGORIES ---
app.get('/api/categories/:type', async (req, res) => {
  const { type } = req.params;
  const action = type === 'series' ? 'get_series_categories' : (type === 'vod' ? 'get_vod_categories' : 'get_live_categories');
  try {
    const response = await axios.get(`${XTREAM_URL}/player_api.php?username=${USERNAME}&password=${PASSWORD}&action=${action}`, { headers: vlcHeaders });
    res.json(response.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- API: LIST BY CATEGORY ---
app.get('/api/list/:type/:catId', async (req, res) => {
  const { type, catId } = req.params;
  const action = type === 'series' ? 'get_series' : (type === 'vod' ? 'get_vod_streams' : 'get_live_streams');
  try {
    const response = await axios.get(`${XTREAM_URL}/player_api.php?username=${USERNAME}&password=${PASSWORD}&action=${action}&category_id=${catId}`, { headers: vlcHeaders });
    res.json(response.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- API: SERIES INFO ---
app.get('/api/series-info/:seriesId', async (req, res) => {
  try {
    const response = await axios.get(`${XTREAM_URL}/player_api.php?username=${USERNAME}&password=${PASSWORD}&action=get_series_info&series_id=${req.params.seriesId}`, { headers: vlcHeaders });
    res.json(response.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- STREAMING PROXY ---
app.get('/stream/:type/:streamId', async (req, res) => {
  const { type, streamId } = req.params;
  const folder = type === 'series' ? 'series' : (type === 'live' ? 'live' : 'movie');
  const ext = type === 'live' ? 'm3u8' : 'mp4'; 
  const streamUrl = `${XTREAM_URL}/${folder}/${USERNAME}/${PASSWORD}/${streamId}.${ext}`;

  try {
    if (type === 'live') {
      const response = await axios.get(streamUrl, { headers: vlcHeaders, timeout: 15000 });
      let playlist = response.data;
      const baseUrl = streamUrl.substring(0, streamUrl.lastIndexOf('/'));
      playlist = playlist.split('\n').map(line => {
        if (line.startsWith('#') || line.trim() === '') return line;
        const fullUrl = line.startsWith('http') ? line : `${baseUrl}/${line}`;
        return `/proxy?url=${encodeURIComponent(fullUrl.trim())}`;
      }).join('\n');
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.send(playlist);
    } else {
      const headers = { ...vlcHeaders };
      if (req.headers.range) headers['Range'] = req.headers.range;
      const streamResponse = await axios({ method: 'get', url: streamUrl, headers: headers, responseType: 'stream' });
      res.status(streamResponse.status);
      ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach(h => { if (streamResponse.headers[h]) res.setHeader(h, streamResponse.headers[h]); });
      streamResponse.data.pipe(res);
    }
  } catch (e) { res.status(500).end(); }
});

app.get('/proxy', async (req, res) => {
  const targetUrl = decodeURIComponent(req.query.url);
  const controller = new AbortController();
  req.on('close', () => controller.abort());
  try {
    const response = await axios({ method: 'get', url: targetUrl, headers: vlcHeaders, responseType: 'stream', timeout: 30000, signal: controller.signal, validateStatus: false });
    res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp2t');
    response.data.pipe(res);
    response.data.on('error', () => res.end());
  } catch (e) { res.status(500).end(); }
});

app.use(express.static(path.join(__dirname, 'public')));

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`✅ Prabh's Local Server: http://localhost:${PORT}`));
}

module.exports = app;