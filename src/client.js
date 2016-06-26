var net = require('net');
var http = require('http');
var url = require('url');
var extend = require('extend');
var tracer = require('tracer');
var http2 = require('./lib/node-http2');
var removeDeprecatedHeaders = require('./lib/header').removeDeprecatedHeaders;


var log = tracer.console({
    dateformat : "yyyy-mm-dd HH:MM:ss.L",
    format : "{{timestamp}} [{{title}}] - {{message}}"
});


function Client(options) {
    var _ = this;

    _.options = options;

    tracer.setLevel(_.options.debug ? 'debug' : 'info');

    _.start = function() {
        _.register();
    };

    _.register = function() {

        var controlClient = net.connect(_.options.serverPort, _.options.server, function() {
            log.info('register service: %j', _.options.services);
            //注册服务
            var message = {
                register: _.options.services
            };
            controlClient.write(JSON.stringify(message), 'utf-8');
            controlClient.setKeepAlive(true, 0);
        });

        //收到服务器发回的数据
        controlClient.on('data', function(data) {
            var message = JSON.parse(data.toString('utf-8'));
            log.info('receive data from server: %j', message);
            for(var key in message) {
                if(_.handle[key] != undefined) {
                    _.handle[key](message[key]);
                }
            }
        });

        controlClient.on('end', function(){
            log.info('sever end');
        });

        controlClient.on('timeout', function(){
            log.info('timeout');
        });

        controlClient.on('close', function(){
            log.info('远程服务器关闭, 10s后重试');
            setTimeout(function(){
                _.reconnect();
            }, 10000);
        });

        controlClient.on('error', function(e){
            log.info('服务器出错 data: %j, 10s后重试', e);
            setTimeout(function(){
                _.reconnect();
            }, 10000);
        });

    };

    _.reconnect = function(){
        if(_.connecting) {
            return;
        }
        _.connecting = true;

        _.register();
    };

    _.connect = function(port) {
        var proxyClient = net.connect(port, _.options.server, function(){
            log.info('连接proxy server成功');

            _.connecting = false;

            var serverOpts = {
                plain : true,
                createServer : function(start) {
                    start(proxyClient);
                    return proxyClient;
                }
            };

            http2.raw.createServer(serverOpts, function(req, res) {
                var u = url.parse(req.url);
                var domain = req.headers['netpass-domain'];

                var service = findService(domain);

                var httpOpts = {
                    hostname : service.forwardIp,
                    port     : service.forwardPort,
                    path     : u.path,
                    method   : req.method,
                    headers  : req.headers
                };

                var proxyRequest = http.request(httpOpts, function(pRes) {
                    var headers = removeDeprecatedHeaders(pRes.headers);
                    res.writeHead(pRes.statusCode, headers);
                    pRes.pipe(res);
                }).on('error', function(e) {
                    res.writeHead(200);
                    res.write('Can not reach the local service!');
                    res.end();
                    return;
                });

                req.pipe(proxyRequest);
            });
        });
    };

    _.handle = {
        connect: function(port) {
            log.debug('准备链接proxy server, port: %d', port);
            _.options.serverProxyPort = port;
            _.connect(port);
        },

        exist: function(domain) {
            log.error('%s 已被注册, 请更换', domain);
            process.exit(0);
        }
    };

    function findService(domain) {
        for(var i=0; i<_.options.services.length; i++) {
            if(domain == _.options.services[i].domain) {
                return _.options.services[i];
            }
        }
        return null;
    }
}

module.exports = {
    start: function(options) {
        return new Client(options).start();
    }
};