#!/usr/bin/env node

var server = require('../src/server');
var client = require('../src/client');
var path = require('path');
var fs = require('fs');

var program = require('commander');


function getConfig(filepath) {
    return JSON.parse(fs.readFileSync(path.resolve(__dirname, filepath)));
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
    .action(function() {
        if(typeof  this.config == 'undefined') {
            console.log('please use config file');
            process.exit(0);
        }

        var options = getConfig(this.config);

        server.start(options);
    });

program
    .command('client')
    .option('-c, --config <filepath>', 'config file path')
    .action(function(){
        if(typeof  this.config == 'undefined') {
            console.log('please use config file');
            process.exit(0);
        }

        var options = getConfig(this.config);

        client.start(options);
    });

program.parse(process.argv);

