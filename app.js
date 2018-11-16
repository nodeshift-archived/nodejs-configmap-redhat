'use strict';

/*
 *
 *  Copyright 2016-2017 Red Hat, Inc, and individual contributors.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 */

const path = require('path');
const fs = require('fs');
const {promisify} = require('util');
const express = require('express');
const bodyParser = require('body-parser');

const readFile = promisify(fs.readFile);
// Setup logging
const logger = require('winston');

const app = express();

// Health Check Middleware
const probe = require('kube-probe');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(express.static(path.join(__dirname, 'public')));
// Expose the license.html at http[s]://[host]:[port]/licences/licenses.html
app.use('/licenses', express.static(path.join(__dirname, 'licenses')));

let configMap;
let message;

app.use('/api/greeting', (request, response) => {
  const name = (request.query && request.query.name) ? request.query.name : 'World';

  if (!message) {
    response.status(500);
    return response.send({content: 'no config map'});
  }

  logger.debug('Replying to request, parameter={}', name);
  return response.send({content: message.replace(/%s/g, name)});
});

// Set health check
probe(app);

// Periodic check for config map update
// If new configMap is found, then set new log level
setInterval(() => {
  retrieveConfigfMap().then(config => {
    if (!config) {
      message = null;
      return;
    }

    if (JSON.stringify(config) !== JSON.stringify(configMap)) {
      configMap = config;
      message = config.message;

      // Set New log level
      if (logger.level !== config.level.toLowerCase()) {
        logger.info('New configuration retrieved: {}', config.message);
        logger.info('New log level: {}', config.level.toLowerCase());
        logger.level = config.level.toLowerCase();
      }
    }
  }).catch(err => {
    logger.error('Error getting config', err);
  });
}, 2000);

// Get ConfigMap Stuff
const jsyaml = require('js-yaml');

// Find the Config Map
function retrieveConfigfMap () {
  return readFile(process.env.NODE_CONFIGMAP_PATH, {encoding: 'utf8'}).then(configMap => {
    // Parse the configMap, which is yaml
    const configMapParsed = jsyaml.safeLoad(configMap);
    return configMapParsed;
  });
}

module.exports = app;
