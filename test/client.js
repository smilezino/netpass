var client = require('../src/client');

client.start({
    server: 'daleks.top',
    serverPort: 10825,
    services: [
        {
            domain: 'test',
            forwardIp: 'localhost',
            forwardPort: 80
        },
        {
            domain: 'ace.com',
            forwardIp: 'localhost',
            forwardPort: 80
        },
        {
            domain: 'aria2ui',
            forwardIp: '192.168.1.132',
            forwardPort: 80
        },
        {
            domain: 'aria2',
            forwardIp: '192.168.1.132',
            forwardPort: 6800
        }
    ]
});