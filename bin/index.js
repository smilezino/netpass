#!/usr/bin/env node

var server = require('../src/server');
var client = require('../src/client');
var path = require('path');
var fs = require('fs');

var program = require('commander');


function getConfig(filepath) {
    if(filepath.charAt(0) != '/') {
        filepath = path.resolve(__dirname, filepath);
    }
    return JSON.parse(fs.readFileSync(filepath))
}

function displayVersion(){
    var version = getConfig('../package.json').version;
    console.log('\nnatpass v' + version + '\n');
}

program
    .usage('[command] <options ...>')
    .option('-v, --version', 'output the version number', function(){
        displayVersion();
    })
    .option('-V', 'output the version number', function(){
        displayVersion();
    });

program
    .command('server')
    .option('-c, --config <filepath>', 'config file path')
    .option('--domain <domain>', 'server domain')
    .option('--http-port <http-port>', 'http port')
    .option('--control-port <control-port>', 'control port')
    .option('--proxy-port <proxy-port>', 'proxy port')
    .option('--debug', 'debug mod')
    .action(function(){
        console.log(this.httpPort);
        console.log(this.config);
    });

program
    .command('client')
    .option('-c, --config <filepath>', 'config file path')
    .action(function(){
        console.log(this.config);
    });

program.parse(process.argv);

