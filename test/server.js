var server = require('../src/server');

server.start({
    domain: 'zi.me',
    httpPort: 10824,
    controlPort: 10825,
    proxyPort: 10826,
    debug: true
});