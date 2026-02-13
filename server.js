const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());

const XTREAM_URL = 'http://starshare.one';
const USERNAME = '6719747';
const PASSWORD = '9747671';
const vlcHeaders = { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18', 'Accept': '*/*', 'Connection': 'keep-alive' };

app.get('/api/categories/:type', async (req, res) => {
  const { type } = req.params;
  const action = type === 'series' ? 'get_series_categories' : (type === 'vod' ? 'get_vod_categories' : 'get_live_categories');
  try {
    const response = await axios.get(`${XTREAM_URL}/player_api.php?username=${USERNAME}&password=${PASSWORD}&action=${action}`, { headers: vlcHeaders });
    res.json(Array.isArray(response.data) ? response.data : []);
  } catch (e) { res.status(500).json([]); }
});

app.get('/api/list/:type/:catId', async (req, res) => {
  const { type, catId } = req.params;
  const action = type === 'series' ? 'get_series' : (type === 'vod' ? 'get_vod_streams' : 'get_live_streams');
  const catParam = catId === 'all' ? '' : `&category_id=${catId}`;
  try {
    const response = await axios.get(`${XTREAM_URL}/player_api.php?username=${USERNAME}&password=${PASSWORD}&action=${action}${catParam}`, { headers: vlcHeaders });
    let data = response.data;
    if (Array.isArray(data)) {
      data.forEach(item => { if (type === 'series' && item.last_modified) item.added = item.last_modified; });
      data.sort((a, b) => (parseInt(b.added) || 0) - (parseInt(a.added) || 0));
      res.json(data);
    } else { res.json([]); }
  } catch (e) { res.status(500).json([]); }
});

app.get('/api/series-info/:seriesId', async (req, res) => {
  try {
    const response = await axios.get(`${XTREAM_URL}/player_api.php?username=${USERNAME}&password=${PASSWORD}&action=get_series_info&series_id=${req.params.seriesId}`, { headers: vlcHeaders });
    res.json(response.data);
  } catch (e) { res.status(500).json({}); }
});

app.get('/stream/:type/:streamId', async (req, res) => {
  const { type, streamId } = req.params;
  const parts = streamId.split('.');
  const id = parts[0];
  const reqExt = parts[1] || (type === 'live' ? 'm3u8' : 'mp4');
  const folder = type === 'series' ? 'series' : (type === 'live' ? 'live' : 'movie');
  const streamUrl = `${XTREAM_URL}/${folder}/${USERNAME}/${PASSWORD}/${id}.${reqExt}`;
  try {
    const headers = { ...vlcHeaders };
    if (req.headers.range) headers['Range'] = req.headers.range;
    const streamResponse = await axios({ method: 'get', url: streamUrl, headers: headers, responseType: 'stream', timeout: 90000 });
    res.status(streamResponse.status);
    ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach(h => { if (streamResponse.headers[h]) res.setHeader(h, streamResponse.headers[h]); });
    streamResponse.data.pipe(res);
  } catch (e) { res.status(500).end(); }
});

app.use(express.static(path.join(__dirname, 'public')));
app.listen(3000, () => console.log(`✅ Server Active: http://localhost:3000`));