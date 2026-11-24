import { fields, places, validateReport } from './lib/places.mjs';
import { createServer } from 'node:http';
import { readFile, writeFile, rename } from 'node:fs/promises';

const file = name => new URL(name, import.meta.url);
let reports;
try {
  reports = JSON.parse(await readFile(file('reports.json'), 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  reports = {};
}
let saveQueue = Promise.resolve();

function saveReport(id, values, note) {
  const save = saveQueue.then(async () => {
    const previous = reports[id];
    const report = {
      ...values, note, verifiedAt: new Date().toISOString(),
      conflicts: previous ? Object.keys(fields).filter(key =>
        previous[key] !== 'unknown' && values[key] !== 'unknown' && previous[key] !== values[key]
      ) : []
    };
    const next = { ...reports, [id]: report };
    await writeFile(file('reports.tmp'), JSON.stringify(next, null, 2));
    await rename(file('reports.tmp'), file('reports.json'));
    reports = next;
    return report;
  });
  saveQueue = save.catch(() => {});
  return save;
}

const assets = {
  '/': ['index.html', 'text/html'],
  '/style.css': ['style.css', 'text/css'],
  '/data.json': ['data.json', 'application/json'],
  '/app.js': ['app.js', 'text/javascript']
};
createServer(async (req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  try {
    if (req.method === 'GET' && req.url === '/api/places') {
      return send(200, places.map(place => ({ ...place, ...reports[place.id] })));
    }
    if (req.method === 'POST' && req.url === '/api/locations') return send(503, { localOnly: true });
    if (req.method === 'POST' && req.url === '/api/reports') {
      let body = '';
      for await (const chunk of req.setEncoding('utf8')) {
        body += chunk;
        if (body.length > 4096) {
          send(413, { message: '입력 내용이 너무 깁니다.' });
          return;
        }
      }
      let input;
      try { input = JSON.parse(body); } catch {
        return send(400, { message: '입력 내용을 확인해주세요.' });
      }
      const report = validateReport(input);
      if (report.status) return send(report.status, { message: report.message });
      return send(201, await saveReport(report.id, report.values, report.note));
    }
    if (req.method === 'GET' && Object.hasOwn(assets, req.url)) {
      const [name, mime] = assets[req.url];
      const content = await readFile(file(name));
      res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8' });
      return res.end(content);
    }
    send(404, { message: '페이지를 찾을 수 없습니다.' });
  } catch (error) {
    console.error(error.message);
    send(500, { message: '처리하지 못했습니다. 다시 시도해주세요.' });
  }
}).listen(Number(process.env.PORT || 4173), '127.0.0.1', function () {
  console.log('일볼때 http://127.0.0.1:' + this.address().port);
});
