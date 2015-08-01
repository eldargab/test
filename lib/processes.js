'use strict'

const go = require('go-async')
const Client = require('./redis/client')
const lock_lua = require('fs').readFileSync(require.resolve('./lock.lua'), 'utf8')

exports.application = function*() {
  yield generator()
  yield worker()
}

function* worker() {
  let redis = new Client
  try {
    while(true) {
      let msg = yield redis.blpop('messages', 1)
      if (!msg) {
        // either generator is down or there are to many workers
        // so try to become a generator, otherwise terminate
        return generator()
      }
      yield wait(Math.round(Math.random()*1000))
      let error = Math.random() > 0.85
      if (error) yield redis.rpush('errors', msg[1])
    }
  } finally {
    redis.close()
  }
}

function* generator() {
  let redis = new Client
  let count = 0
  let rate = 200

  let expires = 0
  let begin = time()

  try {
    while(true) {
      let end = time()
      let duration = end - begin
      begin = end

      expires -= duration

      if (expires < 300) {
        expires = yield lock(redis, 1000)
        if (expires == 0) return
        continue
      }

      yield redis.rpush('messages', count++)
      yield wait(rate)
    }
  } finally {
    redis.close()
  }
}

function* lock(redis, ms) {
  let begin = time()
  let owner = yield redis.command(['EVAL', lock_lua, 1, 'generator', process.pid, ms])
  if (owner != process.pid) return 0
  let end = time()
  let left = Math.max(0, ms - end + begin)
  return left
}

function time() {
  let time = process.hrtime()
  return time[0] * 1e3 + Math.floor(time[1] / 1e6)
}

function wait(ms) {
  return go.thunk(function(cb) {
    setTimeout(cb, ms)
  })
}

exports.errorsDumper = function*() {
  let redis = new Client
  let msg
  try {
    while(msg = yield redis.lpop('errors')) {
      console.log(msg)
    }
  } finally {
    redis.close()
  }
}
