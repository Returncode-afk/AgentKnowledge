const http = require('http');

const options = {
  hostname: 'localhost',
  port: 18090,
  path: '/api/notebooks',
  method: 'GET'
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    try {
      const result = JSON.parse(data);
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      console.log('Response:', data.substring(0, 1000));
    }
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
});

req.end();