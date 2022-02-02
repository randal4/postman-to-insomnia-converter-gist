/**
 * Script to parse a Postman backupt to Insomnia keeping the same structure.
 *
 * It parses:
 * - Folders
 * - Requests
 * - Environments
 *
 * Notes: Insomnia doesn't accept vars with dots, if you are using you must replace yours URLs manually (see ENVIRONMENTS_EXPORTS).
 */
'use strict';

const fs = require('fs');

const postmanDump = require('./Backup.postman_dump.json');

if (!postmanDump) {
  throw new Error('Invalid JSON');
}

if (postmanDump.version != 1) {
  throw new Error('Version not supported, try 1!');
}

function generateId(length) {
  var result = '';
  var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

String.prototype.toId = function toId() {
  return this.replace(/-/g, '');
};

// always a new workspace to avoid problems
const WORKDIR = 'wrk_' + generateId(20);
const ENVBASE = 'env_' + generateId(20);

const resources = [
  {
    _id: WORKDIR,
    _type: 'workspace',
    name: 'Postman Dump ' + (new Date()).toISOString(),
    parentId: null,
    scope: null,
  },
  {
    _id: 'spc_' + generateId(20),
    _type: 'api_spec',
    parentId: WORKDIR,
    fileName: 'Insomnia',
    contents: '',
    contentType: 'yaml',
  },
  {
    _id: ENVBASE,
    _type: 'environment',
    parentId: WORKDIR,
    name: 'Base Environment',
    data: {},
    dataPropertyOrder: {},
    color: null,
    isPrivate: false,
    metaSortKey: 1597080078957,
  },
];

function mapRequest(request) {
  const parentId = request.folder|| request.collectionId;
  const mapped = {
    _id: 'req_' + request.id.toId(),
    _type: 'request',
    parentId: 'fld_' + parentId.toId(),
    name: request.name,
    description: request.description || '',
    url: request.url || '',
    method: request.method,
  };

  if (request.headerData && request.headerData.length) {
    mapped.headers = request.headerData.map(header => ({
      id: 'pair_' + generateId(10),
      name: header.key,
      value: header.value,
    }));
  }

  if (request.queryParams && request.queryParams.length) {
    mapped.parameters = request.queryParams.map(param => ({
      id: 'pair_' + generateId(10),
      name: param.key,
      value: param.value,
      disabled: !param.enabled,
    }));
  }

  if (request.auth) {
    mapped.authentication = {
      type: request.auth.type
    };
    if (request.auth.bearer && request.auth.bearer.length > 0) {
      mapped.authentication.token = request.auth.bearer[0].value
    }
  }

  if (request.dataMode == 'urlencoded' && request.data && request.data.length) {
    mapped.body = {
      mimeType: 'application/x-www-form-urlencoded',
      params: request.data.map(param => ({
        id: 'pair_' + generateId(10),
        name: param.key,
        value: param.value
      }))
    };
  }

  if (request.dataMode == 'raw') {
    mapped.body = {
      mimeType: 'application/json',
      text: request.rawModeData,
    };
  }

  return mapped;
}

function parseFolder(collection, folders) {
  const parent = {
    _id: 'fld_' + collection.id.toId(),
    _type: 'request_group',
    name: collection.name,
    description: collection.description,
    parentId: collection.parentId,
  };
  resources.push(parent);

  if (collection.folders_order && collection.folders_order.length) {
    console.log(collection.id, '- Verifying folders');
    folders.forEach(folder => {
      if (collection.folders_order.findIndex(fId => fId == folder.id) > -1) {
        console.log('Parent: ', collection.id, ':', parent._id, ' -> ', folder.id);
        folder.parentId = parent._id;
        parseFolder(folder, folders);
      }
    });
  }
}

function parseCollection(collection) {
  collection.parentId = WORKDIR;

  console.log('Collection', collection.name, '- Folders:', collection.folders.length, '- Requests:', collection.requests.length);
  parseFolder(collection, collection.folders);

  if (collection.requests && collection.requests.length) {
    collection.requests.forEach(request => {
      resources.push(mapRequest(request));
    });
  }
}

console.log('Starting parsing');

if (postmanDump && postmanDump.collections) {
  console.log('Parsing collections');
  postmanDump.collections.forEach(collection => parseCollection(collection));
}

// ENVIRONMENTS_EXPORTS
if (postmanDump.environments && postmanDump.environments.length) {
  console.log('Parsing environments');

  postmanDump.environments.forEach(env => {
    console.log('Adding environment:', env.name);
    const mapped = {
      _id: 'env_' + env.id.toId(),
      _type: 'environment',
      parentId: ENVBASE,
      name: env.name,
      data: {}
    };

    if (env.values && env.values.length) {
      env.values.forEach(item => {
        const key = item.key.replace(/[-.]/g, '_');
        mapped.data[key] = item.value;
      });
    }

    resources.push(mapped);
  });
}

console.log('Finished parsing, exporting JSON');

const data = JSON.stringify({
  _type: 'export',
  __export_format: 4,
  resources: resources,
});

fs.writeFileSync('insomnia-converted-from-postman.json', data);

console.log('Exported finished');
