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

// --- API ROUTES ---
app.get('/api/:action', async (req, res) => {
  const type = req.params.action === 'channels' ? 'get_live_streams' : 'get_vod_streams';
  try {
    const response = await axios.get(`${XTREAM_URL}/player_api.php?username=${USERNAME}&password=${PASSWORD}&action=${type}`, { headers: vlcHeaders });
    res.json(response.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- STREAMING LOGIC ---
app.get('/stream/:type/:streamId', async (req, res) => {
  const { type, streamId } = req.params;
  const ext = type === 'live' ? 'm3u8' : 'mp4'; 
  const streamUrl = `${XTREAM_URL}/${type}/${USERNAME}/${PASSWORD}/${streamId}.${ext}`;

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
      // VOD Logic (Untouched)
      const headers = { ...vlcHeaders };
      if (req.headers.range) headers['Range'] = req.headers.range;

      const streamResponse = await axios({
        method: 'get', url: streamUrl, headers: headers, responseType: 'stream'
      });

      res.status(streamResponse.status);
      ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach(h => {
        if (streamResponse.headers[h]) res.setHeader(h, streamResponse.headers[h]);
      });
      streamResponse.data.pipe(res);
    }
  } catch (e) { res.status(500).end(); }
});

// PROXY for Live Segments
app.get('/proxy', async (req, res) => {
  const targetUrl = decodeURIComponent(req.query.url);
  const controller = new AbortController();
  req.on('close', () => controller.abort());

  try {
    const response = await axios({
      method: 'get',
      url: targetUrl,
      headers: vlcHeaders,
      responseType: 'stream',
      timeout: 30000, 
      signal: controller.signal,
      validateStatus: false
    });

    res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp2t');
    response.data.pipe(res);
    response.data.on('error', () => res.end());
  } catch (e) { res.status(500).end(); }
});

app.use(express.static('public'));
app.listen(3000, () => console.log('✅ Server running on http://localhost:3000'));