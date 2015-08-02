'use strict'

const go = require('go-async')
const Client = require('./redis/client')
const lock_lua = require('fs').readFileSync(require.resolve('./lock.lua'), 'utf8')
const spawn = require('child_process').spawn

exports.application = function*() {
  yield generator()
  yield worker()
}

exports.worker = worker

function* worker() {
  let redis = new Client
  let delay = option('delay', 500)
  try {
    while(true) {
      let msg = yield redis.blpop('messages', 1)
      if (!msg) {
        // either generator is down or there are to many workers
        // so try to become a generator, otherwise terminate
        return generator()
      }
      yield wait(Math.round(Math.random() * 2 * delay))
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
  let timeout = Math.round(1000 / option('rate', 10))

  let lock = {}
  let lp = run(locker, lock)
  let sp

  try {
    while((yield lock.ready) && running(lp) && running(sp || (sp = run(spawner)))) {
      yield redis.rpush('messages', count++)
      yield wait(timeout)
    }
  } finally {
    redis.close()
    lp.abort()
    sp && sp.abort()
  }
}

function* spawner() {
  let redis = new Client
  try {
    while(true) {
      let before = yield redis.llen('messages')
      yield wait(2000)
      let after = yield redis.llen('messages')
      if (before > after) continue
      let workerSpeed = 4 // msgs per 2 seconds
      let growSpeed = after - before
      let workersToSpawn = Math.ceil(growSpeed/workerSpeed)
      while(workersToSpawn--) {
        let child = spawn(process.argv[0], process.argv.slice(1).concat(['--worker']), {detached: true})
        child.unref()
      }
    }
  } finally {
    redis.close()
  }
}

function* locker(props) {
  let redis = new Client
  try {
    while(true) {
      props.ready = new go.Future
      let expires = 0
      while(expires < 300) {
        expires = yield lock(redis, 'generator', 1000)
        if (expires == null) return props.ready.done(null, false)
      }
      props.ready.done(null, true)
      yield wait(expires - 300)
    }
  } catch(e) {
    props.ready.done(e)
  } finally {
    redis.close()
  }
}

function* lock(redis, key, ms) {
  let begin = time()
  let owner = yield redis.command(['EVAL', lock_lua, 1, key, process.pid, ms])
  if (owner != process.pid) return
  let end = time()
  let left = ms - end + begin
  return left
}

function time() {
  let time = process.hrtime()
  return time[0] * 1e3 + Math.floor(time[1] / 1e6)
}

function wait(ms) {
  if (ms == 0) return
  return go.thunk(function(cb) {
    setTimeout(cb, ms)
  })
}

function run(proc) {
  let f = go.apply(null, arguments)
  f.name = proc.name
  return f
}

function running(proc) {
  if (proc.aborted) throw new Error(proc.name + ' aborted')
  if (proc.error) throw proc.error
  if (proc.ready) throw new Error(proc.name + ' terminated')
  return true
}

function option(name, def) {
  let val = process.options && process.options[name]
  if (val == null) return def
  return val
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
