'use strict'

const go = require('go-async')
const Client = require('./redis/client')
const redis = new Client

function exec(block) {
  go(block).get(function(err) {
    if (err) throw err
    process.exit()
  })
}

exec(function* () {
  yield redis.rpush('foo', 'bar')
  yield redis.rpush('foo', 'baz')
  console.log(yield redis.lpop('foo'))
})
