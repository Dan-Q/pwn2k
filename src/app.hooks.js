// Application hooks that run for every service
const log = require('./hooks/log');
const { setNow } = require('feathers-hooks-common');

module.exports = {
  before: {
    all: [ log() ],
    find: [],
    get: [],
    create: [
      setNow('createdAt')
    ],
    update: [],
    patch: [],
    remove: []
  },

  after: {
    all: [ log() ],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: []
  },

  error: {
    all: [ log() ],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: []
  }
};
