var net = require('net');
var http = require('http');
var url = require('url');
var extend = require('./lib/extend');
var http2 = require('./lib/node-http2');

var removeDeprecatedHeaders = require('./lib/header').removeDeprecatedHeaders;

var tracer = require('tracer');
var log = tracer.console({
    dateformat : "yyyy-mm-dd HH:MM:ss.L",
    format : "{{timestamp}} [{{title}}] - {{message}}"
});


function Server(options) {
    var _ = this;

    _.clients = {};
    _.domains = [];

    _.options = {
        domain: 'tunnel.daleks.top',
        httpPort: 10824,
        controlPort: 10825,
        proxyPort: 10826,
        debug: false
    };

    _.options = extend(_.options, options);

    tracer.setLevel(_.options.debug ? 'debug' : 'info');



    _.start = function() {
        _.startControlServer();
        _.startProxyServer();
        _.startHttpServer();
    };

    _.startControlServer = function() {
        var controlServer = net.createServer(function(socket){

            var remoteAddress = socket.remoteAddress;
            var remotePort = socket.remotePort;

            socket.on("data", function(data){
                var message = JSON.parse(data.toString('utf-8'));
                log.info('receive message from %s:%d: %j', remoteAddress, remotePort, message);
                for(var key in message) {
                    if(_.handle[key] != undefined) {
                        _.handle[key](socket, message[key]);
                    }
                }
            });
            socket.on("end", function(){
                log.debug('%s:%s end', remoteAddress, remotePort);
            });
            socket.on("timeout", function(){
                log.debug('%s:%s timeout', remoteAddress, remotePort);
            });
            socket.on("close", function(){
                log.info('%s:%s close', remoteAddress, remotePort);
                _.handle.close(socket);
            });
            socket.on("error", function(e){
                log.error('%s:$s error: %j', remoteAddress, remotePort, e);
                _.handle.close(socket);
            });

            //保持长链接
            socket.setKeepAlive(true, 0);

        });

        controlServer.listen(_.options.controlPort, "0.0.0.0", function(){
            log.info("control server listen on %d started...", _.options.controlPort);
        });
    };

    _.startProxyServer = function() {
        var proxyServer = net.createServer(function(socket){
            var remoteAddress = socket.remoteAddress;
            var remotePort = socket.remotePort;

            log.info('proxy server connected %s:%s', remoteAddress, remotePort);

            if(typeof _.clients[remoteAddress] == 'undefined') {
                socket.write(JSON.stringify({error: 'error'}), 'utf-8');
                proxyServer.close(socket);
                return ;
            }



            for(var i=0; i<_.clients[remoteAddress].length; i++) {
                if(typeof _.clients[remoteAddress][i]['proxySocket'] == 'undefined') {
                    _.clients[remoteAddress][i]['proxySocket'] = socket;
                }
            }
            
            socket.on("end", function(){
                log.debug('proxy connect %s:%s end', remoteAddress, remotePort);
            });
            socket.on("timeout", function(){
                log.debug('proxy connect %s:%s timeout', remoteAddress, remotePort);
            });
            socket.on("close", function(){
                log.info('proxy connect %s:%s close', remoteAddress, remotePort);
                removeService(socket, 'proxy');
            });
            socket.on("error", function(e){
                log.error('proxy connect %s:$s error: %j', remoteAddress, remotePort, e);
                removeService(socket, 'proxy');
            });

            //保持长链接
            socket.setKeepAlive(true, 0);

        });

        proxyServer.listen(_.options.proxyPort, "0.0.0.0", function(){
            log.info('proxy server on %s start...', _.options.proxyPort);
        });
    };

    _.startHttpServer = function() {
        var httpServer = http.createServer(function(req, res){
            var u = url.parse(req.url);

            log.info('http request url: %s%s', req.headers.host, req.url);

            var fullUrl = req.headers.protocol + '://' + req.headers.host + req.url;

            log.debug('full url: %s', fullUrl);

            var service = findService(req.headers.host);

            if(service == null) {
                res.writeHead(200);
                res.write('can\'t find tunnel.');
                res.end();
                return;
            }

            //headers['x-real-ip'] = req.connection.remoteAddress;

            var headers = removeDeprecatedHeaders(req.headers);

            headers['netpass-domain'] = service.domain;

            var http2Request = http2.raw.request({
                id: service.id,
                plain   : true,
                socket  : service.proxySocket,
                path    : u.path,
                method  : req.method,
                headers : headers
            }, function(pRes) {
                res.writeHead(pRes.statusCode, pRes.headers);
                pRes.pipe(res);
            });

            http2Request.on('error', function(){
                res.writeHead(200);
                res.write('something was wrong.');
                res.end();
                return;
            });

            req.pipe(http2Request);
        });

        httpServer.listen(_.options.httpPort, '0.0.0.0', function(){
            log.info('http server on %s start...', _.options.httpPort);
        });
    };

    _.handle = {
        register: function(socket, data) {

            var address = socket.remoteAddress;

            log.debug('register from %s:%s, data: %j', address, socket.remotePort, data);

            if(!Array.isArray(data)) {
                data = [data];
            }

            var services = [];
            for(var i=0; i<data.length; i++) {
                var domain = data[i].domain;
                if(_.domains.indexOf(domain) != -1) {
                    //域名已注册
                    socket.write(JSON.stringify({exist: domain}), 'utf-8');
                    return ;
                }

                // if(typeof data[i]['protocol'] == 'undefined') {
                //     data[i]['protocol'] = 'http';
                // }
                data[i]['controlSocket'] = socket;
                data[i].id = (Object.keys(_.clients).length + 1) * 10 + i;

                services.push(data[i]);
                _.domains.push(domain);
            }

            //保存客户端信息
            _.clients[address] = services;

            //发送proxy端口
            socket.write(JSON.stringify({connect: _.options.proxyPort}), 'utf-8');
        },

        ping: function(socket) {
            socket.write('pong', 'utf-8');
        },

        close: function(socket) {
            removeService(socket, 'control');
        }
    };

    function findService(domain) {

        var index = domain.indexOf(_.options.domain);

        //options.server 的二级域名
        if(index > -1) {
            domain = domain.substring(0, index - 1);
        }

        for(var ip in _.clients) {
            var client = _.clients[ip];

            for(var i=0; i<client.length; i++) {

                log.debug('compare domain: %s : %s', domain, client[i].domain);
                if(domain == client[i].domain) {
                    return client[i];
                }
            }
        }

        return null;
    }

    function removeService(socket, type) {
        var address = socket.remoteAddress;
        var services = _.clients[address];

        log.info('remove socket, %s:%s', address, socket.remotePort);

        log.info('services: %j', services);
        log.info('services length: %d', services.length);

        if(Array.isArray(services)) {
            services = services.filter(function(service) {
                var result = true;
                if(type == 'control') {
                    result = service['controlSocket'] != socket;
                } else if(type == 'proxy') {
                    result = service['proxySocket'] != socket;
                }

                if(!result) {
                    log.debug('remove domain %s in %j', service.domain,  _.domains)
                    _.domains.splice(_.domains.indexOf(service.domain), 1);
                }

                return result;
            });

            _.clients[address] = services;
        }
    }
}

module.exports = {
    start: function(options) {
        return new Server(options).start();
    }
};
